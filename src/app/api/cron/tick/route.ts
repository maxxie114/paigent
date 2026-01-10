/**
 * Cron Tick API Route
 *
 * @description Vercel Cron job endpoint for processing workflow steps.
 * Claims and executes queued steps in batches.
 *
 * IMPORTANT: Vercel Cron Jobs trigger endpoints using GET requests.
 * The CRON_SECRET environment variable must be set in Vercel project settings.
 * Vercel automatically sends Authorization: Bearer {CRON_SECRET} header.
 *
 * @see https://vercel.com/docs/cron-jobs
 * @see https://vercel.com/docs/cron-jobs/manage-cron-jobs
 * @see paigent-studio-spec.md Section 14.2
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import pLimit from "p-limit";

import { getDb } from "@/lib/db/client";
import { claimNextQueuedStep } from "@/lib/db/queries/steps";
import { executeStep } from "@/lib/agents/executor";

/**
 * Maximum steps to claim per tick.
 */
const MAX_STEPS_PER_TICK = 10;

/**
 * Maximum concurrent step executions.
 */
const MAX_CONCURRENCY = 5;

/**
 * Verifies the cron request is authenticated.
 *
 * @description Checks the Authorization header for the CRON_SECRET.
 * Vercel automatically adds this header when triggering cron jobs
 * if CRON_SECRET is configured in project environment variables.
 *
 * @see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 *
 * @returns Object containing validation result and error response if invalid.
 */
async function verifyCronAuth(): Promise<{
  valid: boolean;
  errorResponse?: NextResponse;
}> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // CRON_SECRET must be configured
  if (!cronSecret) {
    console.error("CRON_SECRET not configured in environment variables");
    return {
      valid: false,
      errorResponse: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      ),
    };
  }

  // Verify Authorization header matches expected format
  // Vercel sends: Authorization: Bearer {CRON_SECRET}
  const expectedAuth = `Bearer ${cronSecret}`;
  if (authHeader !== expectedAuth) {
    console.warn("Cron tick: Unauthorized request - invalid or missing Authorization header");
    return {
      valid: false,
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { valid: true };
}

/**
 * Executes the cron tick logic - claims and processes queued steps.
 *
 * @description Core cron execution logic extracted for reuse.
 * Claims up to MAX_STEPS_PER_TICK steps and executes them with concurrency control.
 *
 * @param startTime - Timestamp when the request started (for latency tracking).
 * @returns NextResponse with execution results.
 */
async function executeCronTick(startTime: number): Promise<NextResponse> {
  const db = await getDb();
  const workerId = crypto.randomUUID();
  const now = new Date();

  // Claim steps atomically
  const claimedSteps = [];
  for (let i = 0; i < MAX_STEPS_PER_TICK; i++) {
    const step = await claimNextQueuedStep({
      db,
      workerId,
      now,
    });

    if (!step) break;
    claimedSteps.push(step);
  }

  // Early return if no work available
  if (claimedSteps.length === 0) {
    return NextResponse.json({
      success: true,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      blocked: 0,
      latencyMs: Date.now() - startTime,
    });
  }

  // Execute steps with concurrency limit
  const limit = pLimit(MAX_CONCURRENCY);

  const results = await Promise.all(
    claimedSteps.map((step) =>
      limit(async () => {
        try {
          return await executeStep(db, step, workerId);
        } catch (error) {
          console.error(`Error executing step ${step.stepId}:`, error);
          return {
            status: "failed" as const,
            error: {
              code: "EXECUTION_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          };
        }
      })
    )
  );

  // Aggregate result counts
  const counts = {
    succeeded: 0,
    failed: 0,
    retrying: 0,
    blocked: 0,
  };

  for (const result of results) {
    counts[result.status as keyof typeof counts]++;
  }

  return NextResponse.json({
    success: true,
    claimed: claimedSteps.length,
    ...counts,
    latencyMs: Date.now() - startTime,
  });
}

/**
 * GET /api/cron/tick
 *
 * @description Processes the next batch of queued workflow steps.
 * Called by Vercel Cron every minute (configured in vercel.json).
 *
 * IMPORTANT: Vercel Cron Jobs use GET requests to trigger endpoints.
 * The endpoint is secured via CRON_SECRET in the Authorization header,
 * which Vercel automatically includes when invoking the cron job.
 *
 * @see https://vercel.com/docs/cron-jobs
 *
 * @param _req - The incoming request (unused but required by Next.js signature).
 * @returns JSON response with execution results or error.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Verify authentication
    const auth = await verifyCronAuth();
    if (!auth.valid) {
      return auth.errorResponse!;
    }

    // Execute cron logic
    return await executeCronTick(startTime);
  } catch (error) {
    console.error("Cron tick error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cron tick failed",
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/tick
 *
 * @description Alternative endpoint for manual triggering or testing.
 * Uses the same authentication and execution logic as the GET handler.
 *
 * Note: Vercel Cron Jobs use GET requests. This POST endpoint is provided
 * for backward compatibility and manual invocation during development/testing.
 *
 * @param _req - The incoming request (unused but required by Next.js signature).
 * @returns JSON response with execution results or error.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Verify authentication
    const auth = await verifyCronAuth();
    if (!auth.valid) {
      return auth.errorResponse!;
    }

    // Execute cron logic
    return await executeCronTick(startTime);
  } catch (error) {
    console.error("Cron tick error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cron tick failed",
        latencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
