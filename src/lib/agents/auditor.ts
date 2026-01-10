/**
 * Auditor Agent
 *
 * @description Performs QA and audit review of completed workflow runs.
 * Generates reports on success, policy compliance, and cost efficiency.
 * Uses GLM-4.7 via Fireworks Responses API for comprehensive analysis.
 *
 * @see paigent-studio-spec.md Section 12.5
 * @see https://docs.fireworks.ai/api-reference/post-responses
 */

import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db/collections";
import {
  callWithSystemPrompt,
  RESPONSES_API_MODELS,
} from "@/lib/fireworks/responses";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";
import { appendRunEvent } from "@/lib/db/queries/events";

/**
 * Policy violation severity levels.
 */
export type ViolationSeverity = "low" | "medium" | "high" | "critical";

/**
 * Policy violation record.
 */
export type PolicyViolation = {
  /** Policy that was violated. */
  policy: string;
  /** Description of the violation. */
  violation: string;
  /** Severity level. */
  severity: ViolationSeverity;
};

/**
 * Cost efficiency assessment.
 */
export type CostEfficiency = {
  /** Total spent in atomic USDC. */
  totalSpentAtomic: string;
  /** Budget utilization (0-1). */
  budgetUtilization: number;
  /** Textual assessment. */
  assessment: string;
};

/**
 * Data provenance summary.
 */
export type DataProvenance = {
  /** Sources used in the workflow. */
  sourcesUsed: string[];
  /** Tools invoked. */
  toolsInvoked: string[];
  /** Whether external data was accessed. */
  externalDataAccessed: boolean;
};

/**
 * Audit report structure.
 */
export type AuditReport = {
  /** Overall success assessment. */
  overallSuccess: boolean;
  /** Success score (0-1). */
  successScore: number;
  /** Policy violations found. */
  policyViolations: PolicyViolation[];
  /** Cost efficiency analysis. */
  costEfficiency: CostEfficiency;
  /** Recommendations for future runs. */
  recommendations: string[];
  /** Data provenance summary. */
  dataProvenance: DataProvenance;
  /** Summary text. */
  summary: string;
};

/**
 * Schema for LLM audit output.
 */
const AuditOutputSchema = z.object({
  overallSuccess: z.boolean(),
  successScore: z.number().min(0).max(1),
  policyViolations: z.array(
    z.object({
      policy: z.string(),
      violation: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
    })
  ),
  costEfficiency: z.object({
    assessment: z.string(),
  }),
  recommendations: z.array(z.string()),
  summary: z.string(),
});

/**
 * System prompt for the Auditor agent.
 */
const AUDITOR_SYSTEM_PROMPT = `You are a QA/Audit agent for a workflow orchestration system. Your job is to review completed workflow runs and provide assessment.

Analyze:
1. Overall success - Did the workflow achieve its goal?
2. Policy violations - Were any policies violated?
3. Cost efficiency - Was the budget used efficiently?
4. Recommendations - What could be improved?

Output ONLY valid JSON matching this structure:
{
  "overallSuccess": boolean,
  "successScore": number (0-1),
  "policyViolations": [
    { "policy": "policy name", "violation": "what happened", "severity": "low|medium|high|critical" }
  ],
  "costEfficiency": {
    "assessment": "evaluation of spending"
  },
  "recommendations": ["recommendation 1", "recommendation 2"],
  "summary": "Overall summary paragraph"
}`;

/**
 * Audit a completed run.
 *
 * @description Generates a comprehensive audit report for a workflow run.
 * Analyzes success, policy compliance, cost efficiency, and provides recommendations.
 *
 * @param runId - The run ID to audit.
 * @returns The audit report.
 *
 * @example
 * ```typescript
 * const report = await auditRun(runObjectId);
 * console.log("Success:", report.overallSuccess);
 * console.log("Score:", report.successScore);
 * ```
 */
export async function auditRun(runId: ObjectId): Promise<AuditReport> {

  // Gather run data
  const runsCollection = await collections.runs();
  const stepsCollection = await collections.runSteps();
  const eventsCollection = await collections.runEvents();
  const receiptsCollection = await collections.paymentReceipts();

  const run = await runsCollection.findOne({ _id: runId });
  if (!run) {
    throw new Error("Run not found");
  }

  const steps = await stepsCollection.find({ runId }).toArray();
  const events = await eventsCollection.find({ runId }).sort({ ts: 1 }).toArray();
  const receipts = await receiptsCollection.find({ runId }).toArray();

  // Calculate metrics
  const succeededSteps = steps.filter((s) => s.status === "succeeded").length;
  const failedSteps = steps.filter((s) => s.status === "failed").length;
  const totalSteps = steps.length;

  const totalSpentAtomic = run.budget.spentAtomic;
  const budgetMax = run.budget.maxAtomic;
  const budgetUtilization =
    Number(totalSpentAtomic) / Number(budgetMax) || 0;

  // Get tools used
  const toolCalls = steps.filter((s) => s.nodeType === "tool_call");
  const toolsInvoked = [...new Set(toolCalls.map((s) => s.stepId))];

  // Build data provenance
  const dataProvenance: DataProvenance = {
    sourcesUsed: toolsInvoked.map((t) => `Tool: ${t}`),
    toolsInvoked,
    externalDataAccessed: toolCalls.length > 0,
  };

  // Generate LLM audit analysis using GLM-4.7 via Responses API
  try {
    const response = await callWithSystemPrompt(
      {
        systemPrompt: AUDITOR_SYSTEM_PROMPT,
        userPrompt: `
Run ID: ${runId.toString()}
Status: ${run.status}
Intent: "${run.input.text}"

Execution Summary:
- Total steps: ${totalSteps}
- Succeeded: ${succeededSteps}
- Failed: ${failedSteps}

Budget:
- Max: ${Number(budgetMax) / 1_000_000} USDC
- Spent: ${Number(totalSpentAtomic) / 1_000_000} USDC
- Utilization: ${(budgetUtilization * 100).toFixed(1)}%

Payments: ${receipts.length} receipts

Timeline (${events.length} events):
${events
  .slice(-20) // Last 20 events
  .map((e) => `- ${e.type}: ${JSON.stringify(e.data).slice(0, 100)}`)
  .join("\n")}

Analyze this run and provide your assessment:`,
        model: RESPONSES_API_MODELS.GLM_4P7,
        maxOutputTokens: 1024,
        temperature: 0.5,
        // Enable reasoning for thorough audit analysis
        reasoning: { effort: "medium" },
        // Store audit responses for record-keeping
        store: true,
      },
      {
        spanName: "Auditor Analysis",
        tags: ["auditor", "agent", "qa"],
        metadata: {
          runId: runId.toString(),
          runStatus: run.status,
        },
      }
    );

    const extracted = extractJsonWithRepair(response.text);
    const parsed = AuditOutputSchema.safeParse(extracted);

    if (parsed.success) {
      const report: AuditReport = {
        overallSuccess: parsed.data.overallSuccess,
        successScore: parsed.data.successScore,
        policyViolations: parsed.data.policyViolations,
        costEfficiency: {
          totalSpentAtomic,
          budgetUtilization,
          assessment: parsed.data.costEfficiency.assessment,
        },
        recommendations: parsed.data.recommendations,
        dataProvenance,
        summary: parsed.data.summary,
      };

      // Store audit event
      await appendRunEvent({
        workspaceId: run.workspaceId,
        runId,
        type: "AUDIT_COMPLETE",
        data: report,
        actor: { type: "agent", id: "auditor" },
      });

      return report;
    }
  } catch (error) {
    console.error("Auditor LLM error:", error);
  }

  // Fallback to basic report
  const basicSuccess = run.status === "succeeded";
  const basicScore = succeededSteps / Math.max(totalSteps, 1);

  const fallbackReport: AuditReport = {
    overallSuccess: basicSuccess,
    successScore: basicScore,
    policyViolations: [],
    costEfficiency: {
      totalSpentAtomic,
      budgetUtilization,
      assessment:
        budgetUtilization < 0.5
          ? "Efficient - under half budget used"
          : budgetUtilization < 0.8
          ? "Moderate - good budget utilization"
          : "High - most of budget consumed",
    },
    recommendations: failedSteps > 0 ? ["Review failed steps for errors"] : [],
    dataProvenance,
    summary: `Run ${basicSuccess ? "succeeded" : "failed"} with ${succeededSteps}/${totalSteps} steps completing successfully.`,
  };

  // Store fallback audit event
  await appendRunEvent({
    workspaceId: run.workspaceId,
    runId,
    type: "AUDIT_COMPLETE",
    data: fallbackReport,
    actor: { type: "agent", id: "auditor" },
  });

  return fallbackReport;
}
