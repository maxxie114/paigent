/**
 * Cron Tick API Route
 *
 * @description Vercel Cron job endpoint for processing workflow steps.
 * Claims and executes queued steps in batches.
 *
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
 * POST /api/cron/tick
 *
 * @description Processes the next batch of queued workflow steps.
 * Called by Vercel Cron every minute.
 *
 * Security: Requires CRON_SECRET in Authorization header.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Check for Vercel's cron header or our secret
    const isVercelCron = headersList.get("x-vercel-cron") === "true";
    const hasValidSecret = authHeader === `Bearer ${cronSecret}`;

    if (!isVercelCron && !hasValidSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = await getDb();
    const workerId = crypto.randomUUID();
    const now = new Date();

    // Claim steps
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

    // Execute with concurrency limit
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

    // Count results
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
 * GET /api/cron/tick
 *
 * @description Health check for the cron endpoint.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/cron/tick",
    maxStepsPerTick: MAX_STEPS_PER_TICK,
    maxConcurrency: MAX_CONCURRENCY,
  });
}
