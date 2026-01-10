import { ObjectId } from "mongodb";
import { collections, PaymentReceiptDocument, PaymentStatus } from "../collections";

/**
 * Budget and Payment Query Helpers
 *
 * @description Database query functions for budget enforcement and payment receipts.
 */

/**
 * Check if a payment would exceed the run budget and atomically deduct if allowed.
 *
 * @description Uses optimistic locking to handle concurrent payment attempts.
 * If a race condition is detected, the function retries.
 *
 * @param params - Budget check parameters.
 * @returns Object with allowed status and new spent amount.
 */
export async function checkBudgetAndDeduct(params: {
  runId: ObjectId;
  amountAtomic: string;
}): Promise<{ allowed: boolean; newSpentAtomic?: string; error?: string }> {
  const { runId, amountAtomic } = params;
  const runs = await collections.runs();

  const run = await runs.findOne({ _id: runId });
  if (!run) {
    return { allowed: false, error: "Run not found" };
  }

  const currentSpent = BigInt(run.budget.spentAtomic);
  const amount = BigInt(amountAtomic);
  const max = BigInt(run.budget.maxAtomic);

  if (currentSpent + amount > max) {
    return {
      allowed: false,
      error: `Would exceed budget: ${currentSpent + amount} > ${max}`,
    };
  }

  // Atomic update with optimistic locking
  const newSpent = (currentSpent + amount).toString();
  const result = await runs.updateOne(
    {
      _id: runId,
      "budget.spentAtomic": run.budget.spentAtomic, // Optimistic lock
    },
    {
      $set: {
        "budget.spentAtomic": newSpent,
        updatedAt: new Date(),
      },
    }
  );

  if (result.modifiedCount === 0) {
    // Race condition detected - retry
    return checkBudgetAndDeduct(params);
  }

  return { allowed: true, newSpentAtomic: newSpent };
}

/**
 * Check if a payment would be allowed by auto-pay policy.
 *
 * @param params - Policy check parameters.
 * @returns Object with allowed status and reason.
 */
export async function checkAutoPayPolicy(params: {
  runId: ObjectId;
  amountAtomic: string;
}): Promise<{ allowed: boolean; reason: string }> {
  const { runId, amountAtomic } = params;
  const runs = await collections.runs();

  const run = await runs.findOne({ _id: runId });
  if (!run) {
    return { allowed: false, reason: "Run not found" };
  }

  // Check if auto-pay is enabled
  if (!run.autoPayPolicy.autoPayEnabled) {
    return { allowed: false, reason: "Auto-pay is disabled" };
  }

  const amount = BigInt(amountAtomic);
  const maxPerStep = BigInt(run.autoPayPolicy.autoPayMaxPerStepAtomic);
  const maxPerRun = BigInt(run.autoPayPolicy.autoPayMaxPerRunAtomic);
  const currentSpent = BigInt(run.budget.spentAtomic);

  // Check per-step limit
  if (amount > maxPerStep) {
    return {
      allowed: false,
      reason: `Amount ${amountAtomic} exceeds per-step limit ${run.autoPayPolicy.autoPayMaxPerStepAtomic}`,
    };
  }

  // Check per-run limit
  if (currentSpent + amount > maxPerRun) {
    return {
      allowed: false,
      reason: `Would exceed per-run limit of ${run.autoPayPolicy.autoPayMaxPerRunAtomic}`,
    };
  }

  // Check overall budget
  const budgetMax = BigInt(run.budget.maxAtomic);
  if (currentSpent + amount > budgetMax) {
    return {
      allowed: false,
      reason: `Would exceed run budget of ${run.budget.maxAtomic}`,
    };
  }

  return { allowed: true, reason: "Within auto-pay limits" };
}

/**
 * Record a payment receipt.
 *
 * @param params - Receipt parameters.
 * @returns The created receipt document.
 */
export async function recordPaymentReceipt(params: {
  workspaceId: ObjectId;
  runId: ObjectId;
  stepId: string;
  toolId?: ObjectId;
  network: string;
  asset: string;
  amountAtomic: string;
  paymentRequiredHeaderB64: string;
  paymentSignatureHeaderB64?: string;
  paymentResponseHeader?: string;
  txHash?: string;
  status: PaymentStatus;
}): Promise<PaymentReceiptDocument> {
  const receipts = await collections.paymentReceipts();

  const receipt: PaymentReceiptDocument = {
    _id: new ObjectId(),
    workspaceId: params.workspaceId,
    runId: params.runId,
    stepId: params.stepId,
    toolId: params.toolId,
    network: params.network,
    asset: params.asset,
    amountAtomic: params.amountAtomic,
    paymentRequiredHeaderB64: params.paymentRequiredHeaderB64,
    paymentSignatureHeaderB64: params.paymentSignatureHeaderB64,
    paymentResponseHeader: params.paymentResponseHeader,
    txHash: params.txHash,
    status: params.status,
    createdAt: new Date(),
  };

  await receipts.insertOne(receipt);
  return receipt;
}

/**
 * Get payment receipts for a run.
 *
 * @param runId - The run ID.
 * @returns Array of receipt documents.
 */
export async function getReceiptsForRun(
  runId: ObjectId
): Promise<PaymentReceiptDocument[]> {
  const receipts = await collections.paymentReceipts();
  return receipts.find({ runId }).sort({ createdAt: 1 }).toArray();
}

/**
 * Get total spent for a run from receipts.
 *
 * @param runId - The run ID.
 * @returns Total spent in atomic units.
 */
export async function getTotalSpentFromReceipts(runId: ObjectId): Promise<string> {
  const receipts = await collections.paymentReceipts();

  const pipeline = [
    { $match: { runId, status: "settled" } },
    {
      $group: {
        _id: null,
        total: {
          $sum: { $toLong: "$amountAtomic" },
        },
      },
    },
  ];

  const results = await receipts.aggregate(pipeline).toArray();

  if (results.length === 0) {
    return "0";
  }

  return results[0].total.toString();
}

/**
 * Get spending analytics for a workspace.
 *
 * @param workspaceId - The workspace ID.
 * @param options - Query options.
 * @returns Analytics data.
 */
export async function getSpendingAnalytics(
  workspaceId: ObjectId,
  options?: {
    since?: Date;
    until?: Date;
  }
): Promise<{
  totalSpentAtomic: string;
  receiptCount: number;
  byTool: Array<{ toolId: string; totalAtomic: string; count: number }>;
}> {
  const receipts = await collections.paymentReceipts();

  const matchStage: Record<string, unknown> = {
    workspaceId,
    status: "settled",
  };

  if (options?.since || options?.until) {
    matchStage.createdAt = {};
    if (options?.since) {
      (matchStage.createdAt as Record<string, Date>).$gte = options.since;
    }
    if (options?.until) {
      (matchStage.createdAt as Record<string, Date>).$lte = options.until;
    }
  }

  // Get totals
  const totalPipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: { $toLong: "$amountAtomic" } },
        count: { $sum: 1 },
      },
    },
  ];

  const totalResults = await receipts.aggregate(totalPipeline).toArray();

  // Get by tool
  const byToolPipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: "$toolId",
        total: { $sum: { $toLong: "$amountAtomic" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ];

  const byToolResults = await receipts.aggregate(byToolPipeline).toArray();

  return {
    totalSpentAtomic:
      totalResults.length > 0 ? totalResults[0].total.toString() : "0",
    receiptCount: totalResults.length > 0 ? totalResults[0].count : 0,
    byTool: byToolResults.map((r) => ({
      toolId: r._id?.toString() || "unknown",
      totalAtomic: r.total.toString(),
      count: r.count,
    })),
  };
}
