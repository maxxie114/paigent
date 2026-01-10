/**
 * Galileo Observability Client
 *
 * @description Client for logging LLM and tool calls to Galileo.
 * Provides tracing and evaluation capabilities.
 *
 * @see https://www.galileo.ai/
 */

/**
 * Galileo API endpoint.
 */
const GALILEO_API_URL = "https://api.galileo.ai/v1";

/**
 * Trace span types.
 */
export type SpanType = "llm" | "tool" | "retrieval" | "agent" | "workflow";

/**
 * Span data structure.
 */
export type SpanData = {
  /** Unique span ID. */
  spanId: string;
  /** Parent span ID (for nested spans). */
  parentSpanId?: string;
  /** Trace ID (groups related spans). */
  traceId: string;
  /** Span type. */
  type: SpanType;
  /** Span name/label. */
  name: string;
  /** Start timestamp. */
  startTime: Date;
  /** End timestamp. */
  endTime?: Date;
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Status. */
  status: "running" | "success" | "error";
  /** Error message (if status is error). */
  error?: string;
  /** Input data. */
  input?: unknown;
  /** Output data. */
  output?: unknown;
  /** Custom metadata. */
  metadata?: Record<string, unknown>;
};

/**
 * LLM call specific data.
 */
export type LLMSpanData = SpanData & {
  type: "llm";
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  userPrompt?: string;
  response?: string;
};

/**
 * Tool call specific data.
 */
export type ToolSpanData = SpanData & {
  type: "tool";
  toolName: string;
  toolUrl?: string;
  httpMethod?: string;
  httpStatus?: number;
  paid?: boolean;
  amountAtomic?: string;
};

/**
 * Check if Galileo is configured.
 */
export function isGalileoConfigured(): boolean {
  return !!process.env.GALILEO_API_KEY && !!process.env.GALILEO_PROJECT_ID;
}

/**
 * Log a span to Galileo.
 *
 * @param span - The span data to log.
 */
async function logSpan(span: SpanData): Promise<void> {
  const apiKey = process.env.GALILEO_API_KEY;
  const projectId = process.env.GALILEO_PROJECT_ID;

  if (!apiKey || !projectId) {
    // Silently skip if not configured
    return;
  }

  try {
    await fetch(`${GALILEO_API_URL}/projects/${projectId}/traces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spans: [span],
      }),
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error("Galileo logging error:", error);
  }
}

/**
 * Generate a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a trace context.
 *
 * @description Creates a new trace context for grouping related spans.
 *
 * @param name - Name of the trace.
 * @returns Trace context with helper methods.
 *
 * @example
 * ```typescript
 * const trace = createTrace("workflow-execution");
 *
 * const llmSpan = trace.startLLMSpan("planner");
 * // ... do LLM call
 * await trace.endLLMSpan(llmSpan, { output: response });
 *
 * await trace.complete();
 * ```
 */
export function createTrace(name: string) {
  const traceId = generateId();
  const rootSpan: SpanData = {
    spanId: generateId(),
    traceId,
    type: "workflow",
    name,
    startTime: new Date(),
    status: "running",
  };

  const spans: SpanData[] = [rootSpan];

  return {
    traceId,
    rootSpanId: rootSpan.spanId,

    /**
     * Start an LLM span.
     */
    startLLMSpan(
      name: string,
      data: Partial<LLMSpanData>
    ): LLMSpanData {
      const span: LLMSpanData = {
        spanId: generateId(),
        parentSpanId: rootSpan.spanId,
        traceId,
        type: "llm",
        name,
        startTime: new Date(),
        status: "running",
        model: data.model || "unknown",
        ...data,
      };
      spans.push(span);
      return span;
    },

    /**
     * End an LLM span.
     */
    async endLLMSpan(
      span: LLMSpanData,
      result: {
        output?: string;
        error?: string;
        totalTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
      }
    ): Promise<void> {
      span.endTime = new Date();
      span.durationMs = span.endTime.getTime() - span.startTime.getTime();
      span.status = result.error ? "error" : "success";
      span.error = result.error;
      span.response = result.output;
      span.totalTokens = result.totalTokens;
      span.promptTokens = result.promptTokens;
      span.completionTokens = result.completionTokens;

      await logSpan(span);
    },

    /**
     * Start a tool span.
     */
    startToolSpan(
      name: string,
      data: Partial<ToolSpanData>
    ): ToolSpanData {
      const span: ToolSpanData = {
        spanId: generateId(),
        parentSpanId: rootSpan.spanId,
        traceId,
        type: "tool",
        name,
        startTime: new Date(),
        status: "running",
        toolName: data.toolName || name,
        ...data,
      };
      spans.push(span);
      return span;
    },

    /**
     * End a tool span.
     */
    async endToolSpan(
      span: ToolSpanData,
      result: {
        output?: unknown;
        error?: string;
        httpStatus?: number;
        paid?: boolean;
        amountAtomic?: string;
      }
    ): Promise<void> {
      span.endTime = new Date();
      span.durationMs = span.endTime.getTime() - span.startTime.getTime();
      span.status = result.error ? "error" : "success";
      span.error = result.error;
      span.output = result.output;
      span.httpStatus = result.httpStatus;
      span.paid = result.paid;
      span.amountAtomic = result.amountAtomic;

      await logSpan(span);
    },

    /**
     * Complete the trace.
     */
    async complete(error?: string): Promise<void> {
      rootSpan.endTime = new Date();
      rootSpan.durationMs =
        rootSpan.endTime.getTime() - rootSpan.startTime.getTime();
      rootSpan.status = error ? "error" : "success";
      rootSpan.error = error;

      await logSpan(rootSpan);
    },
  };
}

/**
 * Log an LLM call (standalone, without trace context).
 *
 * @param data - LLM call data.
 */
export async function logLLMCall(
  data: Omit<LLMSpanData, "spanId" | "traceId" | "type" | "status">
): Promise<void> {
  const span: LLMSpanData = {
    spanId: generateId(),
    traceId: generateId(),
    type: "llm",
    status: "success",
    ...data,
  };

  await logSpan(span);
}

/**
 * Log a tool call (standalone, without trace context).
 *
 * @param data - Tool call data.
 */
export async function logToolCall(
  data: Omit<ToolSpanData, "spanId" | "traceId" | "type" | "status">
): Promise<void> {
  const span: ToolSpanData = {
    spanId: generateId(),
    traceId: generateId(),
    type: "tool",
    status: "success",
    ...data,
  };

  await logSpan(span);
}
