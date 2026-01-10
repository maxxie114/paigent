/**
 * Run Events SSE API Route
 *
 * @description Server-Sent Events endpoint for real-time run updates.
 * Streams run events as they occur.
 *
 * @see paigent-studio-spec.md Section 14.3
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";

import { getDb } from "@/lib/db/client";
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
    let isAborted = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connection event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "connected",
              runId,
              timestamp: new Date().toISOString(),
            })}\n\n`
          )
        );

        // Set up polling for new events
        const pollEvents = async () => {
          if (isAborted) return;

          try {
            // Get new events since last check
            const newEvents = await getEventsSince(runObjectId, lastEventTime);

            for (const event of newEvents) {
              if (isAborted) return;

              const eventData = JSON.stringify({
                id: event._id.toString(),
                type: event.type,
                ts: event.ts.toISOString(),
                data: event.data,
                actor: event.actor,
              });

              controller.enqueue(encoder.encode(`data: ${eventData}\n\n`));

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
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "run_complete",
                    status: currentRun?.status,
                  })}\n\n`
                )
              );
              controller.close();
              return;
            }

            // Schedule next poll
            if (!isAborted) {
              setTimeout(pollEvents, POLL_INTERVAL);
            }
          } catch (error) {
            console.error("SSE polling error:", error);
            if (!isAborted) {
              setTimeout(pollEvents, POLL_INTERVAL * 2);
            }
          }
        };

        // Start polling
        pollEvents();

        // Set up keep-alive ping
        const pingInterval = setInterval(() => {
          if (isAborted) {
            clearInterval(pingInterval);
            return;
          }
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, PING_INTERVAL);

        // Handle abort
        req.signal.addEventListener("abort", () => {
          isAborted = true;
          clearInterval(pingInterval);
          try {
            controller.close();
          } catch {
            // Ignore close errors
          }
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
