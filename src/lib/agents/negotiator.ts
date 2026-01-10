/**
 * Negotiator Agent
 *
 * @description Makes payment decisions based on tool pricing and budget constraints.
 * Determines whether to pay, skip, or ask for approval.
 *
 * @see paigent-studio-spec.md Section 12.3
 */

import { z } from "zod";
import { callLLM, FIREWORKS_MODELS } from "@/lib/fireworks/client";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";
import type { WorkspaceSettings, ToolReputation } from "@/lib/db/collections";

/**
 * Negotiation decision types.
 */
export type NegotiationDecision = "PAY" | "SKIP" | "ASK_APPROVAL" | "NEGOTIATE";

/**
 * Negotiation result.
 */
export type NegotiationResult = {
  /** The decision made. */
  decision: NegotiationDecision;
  /** Reason for the decision. */
  reason: string;
  /** Counter-offer amount (if negotiating). */
  counterOfferAtomic?: string;
};

/**
 * Negotiation input parameters.
 */
export type NegotiationInput = {
  /** Tool name for display. */
  toolName: string;
  /** Required payment amount in atomic units. */
  amountAtomic: string;
  /** Remaining budget in atomic units. */
  budgetRemaining: string;
  /** Auto-pay policy configuration. */
  autoPayPolicy: WorkspaceSettings;
  /** Tool's reputation metrics. */
  toolReputation: ToolReputation;
  /** Value assessment of the tool output (optional). */
  valueAssessment?: string;
};

/**
 * Format USDC from atomic units.
 */
function formatUsdc(atomicAmount: string): string {
  const usdc = Number(atomicAmount) / 1_000_000;
  return usdc.toFixed(4);
}

/**
 * Schema for LLM negotiation output.
 */
const NegotiationOutputSchema = z.object({
  decision: z.enum(["PAY", "SKIP", "ASK_APPROVAL", "NEGOTIATE"]),
  reason: z.string(),
  counterOfferAtomic: z.string().optional(),
});

/**
 * System prompt for the Negotiator agent.
 */
const NEGOTIATOR_SYSTEM_PROMPT = `You are a negotiation agent for a workflow orchestration system. Your job is to decide whether to approve payments for tool calls.

Given information about a tool's pricing, the user's budget, and the tool's reputation, decide:
1. PAY - Accept the price and proceed
2. SKIP - Skip this tool and find an alternative
3. ASK_APPROVAL - Require human approval for this payment
4. NEGOTIATE - (If supported) Attempt to negotiate a lower price

Consider:
- Value of the tool's output to the workflow
- Budget remaining
- Auto-pay policy settings
- Tool's reputation (success rate, latency, dispute rate)
- Cost efficiency

Output ONLY valid JSON:
{
  "decision": "PAY" | "SKIP" | "ASK_APPROVAL" | "NEGOTIATE",
  "reason": "Brief explanation",
  "counterOfferAtomic": "amount" // Only if decision is NEGOTIATE
}`;

/**
 * Make a payment negotiation decision.
 *
 * @description Analyzes the payment request and budget constraints
 * to determine the best course of action.
 *
 * @param input - The negotiation input.
 * @returns The negotiation result.
 *
 * @example
 * ```typescript
 * const result = await negotiatePayment({
 *   toolName: "Data API",
 *   amountAtomic: "500000", // 0.5 USDC
 *   budgetRemaining: "5000000", // 5 USDC
 *   autoPayPolicy: workspace.settings,
 *   toolReputation: { successRate: 0.95, avgLatencyMs: 500, disputeRate: 0.01 },
 * });
 *
 * if (result.decision === "PAY") {
 *   // Proceed with payment
 * }
 * ```
 */
export async function negotiatePayment(
  input: NegotiationInput
): Promise<NegotiationResult> {
  const {
    toolName,
    amountAtomic,
    budgetRemaining,
    autoPayPolicy,
    toolReputation,
    valueAssessment,
  } = input;

  // Quick policy checks before using LLM

  // Check if auto-pay is disabled
  if (!autoPayPolicy.autoPayEnabled) {
    return {
      decision: "ASK_APPROVAL",
      reason: "Auto-pay is disabled for this workspace",
    };
  }

  const amount = BigInt(amountAtomic);
  const maxPerStep = BigInt(autoPayPolicy.autoPayMaxPerStepAtomic);
  const maxPerRun = BigInt(autoPayPolicy.autoPayMaxPerRunAtomic);
  const remaining = BigInt(budgetRemaining);

  // Check per-step limit
  if (amount > maxPerStep) {
    return {
      decision: "ASK_APPROVAL",
      reason: `Amount $${formatUsdc(amountAtomic)} exceeds per-step limit of $${formatUsdc(autoPayPolicy.autoPayMaxPerStepAtomic)}`,
    };
  }

  // Check remaining budget
  if (amount > remaining) {
    return {
      decision: "SKIP",
      reason: `Amount $${formatUsdc(amountAtomic)} exceeds remaining budget of $${formatUsdc(budgetRemaining)}`,
    };
  }

  // Check tool reputation - skip if too risky
  if (toolReputation.successRate < 0.5) {
    return {
      decision: "SKIP",
      reason: `Tool has low success rate (${(toolReputation.successRate * 100).toFixed(0)}%)`,
    };
  }

  if (toolReputation.disputeRate > 0.1) {
    return {
      decision: "ASK_APPROVAL",
      reason: `Tool has high dispute rate (${(toolReputation.disputeRate * 100).toFixed(0)}%)`,
    };
  }

  // For small amounts with good reputation, auto-approve
  const smallAmountThreshold = BigInt("100000"); // 0.1 USDC
  if (amount <= smallAmountThreshold && toolReputation.successRate > 0.9) {
    return {
      decision: "PAY",
      reason: "Small amount with high reputation tool",
    };
  }

  // For medium amounts, use LLM for nuanced decision
  try {
    const response = await callLLM({
      systemPrompt: NEGOTIATOR_SYSTEM_PROMPT,
      userPrompt: `
Tool: ${toolName}
Price: $${formatUsdc(amountAtomic)} USDC (${amountAtomic} atomic)
Budget remaining: $${formatUsdc(budgetRemaining)} USDC
Auto-pay enabled: ${autoPayPolicy.autoPayEnabled}
Max per step: $${formatUsdc(autoPayPolicy.autoPayMaxPerStepAtomic)} USDC
Max per run: $${formatUsdc(autoPayPolicy.autoPayMaxPerRunAtomic)} USDC

Tool Reputation:
- Success rate: ${(toolReputation.successRate * 100).toFixed(0)}%
- Avg latency: ${toolReputation.avgLatencyMs}ms
- Dispute rate: ${(toolReputation.disputeRate * 100).toFixed(1)}%

${valueAssessment ? `Value assessment: ${valueAssessment}` : ""}

What is your decision?`,
      model: FIREWORKS_MODELS.GLM_4_9B,
      maxTokens: 256,
      temperature: 0.3, // Lower temperature for more consistent decisions
    });

    const extracted = extractJsonWithRepair(response.text);
    const parsed = NegotiationOutputSchema.safeParse(extracted);

    if (parsed.success) {
      return {
        decision: parsed.data.decision,
        reason: parsed.data.reason,
        counterOfferAtomic: parsed.data.counterOfferAtomic,
      };
    }
  } catch (error) {
    console.error("Negotiator LLM error:", error);
  }

  // Fallback to conservative decision
  return {
    decision: "ASK_APPROVAL",
    reason: "Unable to make automated decision, requesting human approval",
  };
}
