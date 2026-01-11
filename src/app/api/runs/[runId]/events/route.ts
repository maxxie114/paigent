/**
 * Run Events SSE API Route
 *
 * @description Server-Sent Events endpoint for real-time run updates.
 * Streams run events as they occur.
 *
 * @see paigent-studio-spec.md Section 14.3
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { verifyMembership } from "@/lib/db/queries/workspaces";
import { getRun } from "@/lib/db/queries/runs";
import { getEventsSince } from "@/lib/db/queries/events";

/**
 * Route params type.
 */
type RouteParams = {
  params: Promise<{ runId: string }>;
};

/**
 * Polling interval in milliseconds.
 */
const POLL_INTERVAL = 2000;

/**
 * Keep-alive ping interval in milliseconds.
 */
const PING_INTERVAL = 30000;

/**
 * GET /api/runs/[runId]/events
 *
 * @description Streams run events using Server-Sent Events.
 * Client can use EventSource to connect.
 *
 * @example
 * ```typescript
 * const eventSource = new EventSource(`/api/runs/${runId}/events`);
 * eventSource.onmessage = (event) => {
 *   const data = JSON.parse(event.data);
 *   console.log("Event:", data);
 * };
 * ```
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { runId } = await params;

    // Validate runId format
    if (!ObjectId.isValid(runId)) {
      return new Response("Invalid run ID format", { status: 400 });
    }

    const runObjectId = new ObjectId(runId);

    // Get run
    const run = await getRun(runObjectId);
    if (!run) {
      return new Response("Run not found", { status: 404 });
    }

    // Verify workspace membership
    const membership = await verifyMembership(userId, run.workspaceId);
    if (!membership) {
      return new Response("Forbidden", { status: 403 });
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    let lastEventTime = new Date(0);
    /**
     * Flag to track if the stream has been aborted or closed.
     * Used to prevent operations on a closed controller.
     */
    let isStreamClosed = false;
    /**
     * Reference to the ping interval timer for cleanup.
     */
    let pingIntervalId: ReturnType<typeof setInterval> | undefined;
    /**
     * Reference to the poll timeout for cleanup.
     */
    let pollTimeoutId: ReturnType<typeof setTimeout> | undefined;

    /**
     * Safely enqueue data to the controller.
     * Prevents "Controller is already closed" errors by checking state first.
     *
     * @param controller - The ReadableStream controller.
     * @param data - The encoded data to enqueue.
     * @returns True if enqueue succeeded, false if stream is closed.
     */
    const safeEnqueue = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      data: Uint8Array
    ): boolean => {
      if (isStreamClosed) return false;
      try {
        controller.enqueue(data);
        return true;
      } catch {
        // Controller may have been closed between check and enqueue
        isStreamClosed = true;
        return false;
      }
    };

    /**
     * Safely close the controller.
     * Prevents "Controller is already closed" errors by checking state first.
     *
     * @param controller - The ReadableStream controller.
     */
    const safeClose = (
      controller: ReadableStreamDefaultController<Uint8Array>
    ): void => {
      if (isStreamClosed) return;
      isStreamClosed = true;

      // Clean up intervals and timeouts first
      if (pingIntervalId !== undefined) {
        clearInterval(pingIntervalId);
        pingIntervalId = undefined;
      }
      if (pollTimeoutId !== undefined) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = undefined;
      }

      try {
        controller.close();
      } catch {
        // Ignore close errors - controller may already be closed
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connection event
        if (
          !safeEnqueue(
            controller,
            encoder.encode(
              `data: ${JSON.stringify({
                type: "connected",
                runId,
                timestamp: new Date().toISOString(),
              })}\n\n`
            )
          )
        ) {
          return;
        }

        // Set up polling for new events
        const pollEvents = async () => {
          if (isStreamClosed) return;

          try {
            // Get new events since last check
            const newEvents = await getEventsSince(runObjectId, lastEventTime);

            for (const event of newEvents) {
              if (isStreamClosed) return;

              const eventData = JSON.stringify({
                id: event._id.toString(),
                type: event.type,
                ts: event.ts.toISOString(),
                data: event.data,
                actor: event.actor,
              });

              if (!safeEnqueue(controller, encoder.encode(`data: ${eventData}\n\n`))) {
                return;
              }

              // Update last event time
              if (event.ts > lastEventTime) {
                lastEventTime = event.ts;
              }
            }

            // Check if run is complete
            const currentRun = await getRun(runObjectId);
            const isComplete =
              currentRun?.status === "succeeded" ||
              currentRun?.status === "failed" ||
              currentRun?.status === "canceled";

            if (isComplete) {
              safeEnqueue(
                controller,
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "run_complete",
                    status: currentRun?.status,
                  })}\n\n`
                )
              );
              safeClose(controller);
              return;
            }

            // Schedule next poll
            if (!isStreamClosed) {
              pollTimeoutId = setTimeout(pollEvents, POLL_INTERVAL);
            }
          } catch (error) {
            console.error("SSE polling error:", error);
            if (!isStreamClosed) {
              pollTimeoutId = setTimeout(pollEvents, POLL_INTERVAL * 2);
            }
          }
        };

        // Start polling
        pollEvents();

        // Set up keep-alive ping
        pingIntervalId = setInterval(() => {
          if (isStreamClosed) {
            if (pingIntervalId !== undefined) {
              clearInterval(pingIntervalId);
              pingIntervalId = undefined;
            }
            return;
          }
          safeEnqueue(controller, encoder.encode(": ping\n\n"));
        }, PING_INTERVAL);

        // Handle abort (client disconnect)
        req.signal.addEventListener("abort", () => {
          safeClose(controller);
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error("SSE error:", error);
    return new Response(
      error instanceof Error ? error.message : "SSE error",
      { status: 500 }
    );
  }
}
