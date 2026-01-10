/**
 * Galileo Observability Client
 *
 * @description Official Galileo SDK integration for logging LLM and tool calls.
 * Provides tracing, evaluation, and observability capabilities for AI workflows.
 *
 * @see https://v2docs.galileo.ai/sdk-api/typescript/sdk-reference
 * @see https://v2docs.galileo.ai/sdk-api/logging/galileo-logger
 */

import {
  GalileoLogger,
  init as galileoInit,
  flush as galileoFlush,
  getLogger,
} from "galileo";

/**
 * Span types supported by Galileo.
 */
export type GalileoSpanType = "llm" | "tool" | "retriever" | "agent" | "workflow";

/**
 * LLM span input parameters.
 */
export type LLMSpanInput = {
  /** Input messages or prompt. */
  input: string | Array<{ role: string; content: string }>;
  /** Output response from the LLM. */
  output: string | { role: string; content: string };
  /** Model name/identifier. */
  model: string;
  /** Span name/label. */
  name?: string;
  /** Duration in nanoseconds. */
  durationNs?: number;
  /** Number of input tokens. */
  numInputTokens?: number;
  /** Number of output tokens. */
  numOutputTokens?: number;
  /** Total tokens used. */
  totalTokens?: number;
  /** Temperature setting. */
  temperature?: number;
  /** HTTP status code. */
  statusCode?: number;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Tags for categorization. */
  tags?: string[];
};

/**
 * Tool span input parameters.
 */
export type ToolSpanInput = {
  /** Input parameters for the tool. */
  input: string;
  /** Output result from the tool. */
  output?: string;
  /** Tool name. */
  name?: string;
  /** Duration in nanoseconds. */
  durationNs?: number;
  /** HTTP status code. */
  statusCode?: number;
  /** Tool call ID from LLM. */
  toolCallId?: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Tags for categorization. */
  tags?: string[];
};

/**
 * Workflow span input parameters.
 */
export type WorkflowSpanInput = {
  /** Input content for the workflow. */
  input: string;
  /** Output result from the workflow. */
  output?: string;
  /** Workflow name. */
  name?: string;
  /** Duration in nanoseconds. */
  durationNs?: number;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Tags for categorization. */
  tags?: string[];
};

/**
 * Agent span input parameters.
 */
export type AgentSpanInput = {
  /** Input content for the agent. */
  input: string;
  /** Output result from the agent. */
  output?: string;
  /** Agent name. */
  name?: string;
  /** Duration in nanoseconds. */
  durationNs?: number;
  /** Agent type (planner, router, etc.). */
  agentType?: "default" | "planner" | "react" | "reflection" | "router" | "classifier" | "supervisor" | "judge";
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Tags for categorization. */
  tags?: string[];
};

/**
 * Trace input parameters.
 */
export type TraceInput = {
  /** Input content for the trace. */
  input: string;
  /** Output result from the trace. */
  output?: string;
  /** Trace name. */
  name?: string;
  /** Duration in nanoseconds. */
  durationNs?: number;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Tags for categorization. */
  tags?: string[];
};

/**
 * Check if Galileo is configured.
 *
 * @description Checks if the required Galileo environment variables are set.
 * At minimum, GALILEO_API_KEY is required for Galileo to function.
 *
 * @returns True if Galileo is configured, false otherwise.
 *
 * @example
 * ```typescript
 * if (isGalileoConfigured()) {
 *   await initializeGalileo();
 * }
 * ```
 */
export function isGalileoConfigured(): boolean {
  return !!process.env.GALILEO_API_KEY;
}

/**
 * Initialize the Galileo SDK.
 *
 * @description Initializes the Galileo SDK with project and log stream configuration.
 * Should be called once at application startup. If environment variables are set,
 * they will be used automatically.
 *
 * @param options - Optional initialization options.
 * @param options.projectName - Override the project name (defaults to GALILEO_PROJECT env var).
 * @param options.logStreamName - Override the log stream name (defaults to GALILEO_LOG_STREAM env var).
 *
 * @example
 * ```typescript
 * await initializeGalileo({
 *   projectName: "paigent-studio",
 *   logStreamName: "production"
 * });
 * ```
 */
export async function initializeGalileo(options?: {
  projectName?: string;
  logStreamName?: string;
}): Promise<void> {
  if (!isGalileoConfigured()) {
    console.warn(
      "Galileo is not configured. Set GALILEO_API_KEY environment variable to enable observability."
    );
    return;
  }

  try {
    await galileoInit({
      projectName: options?.projectName ?? process.env.GALILEO_PROJECT ?? "paigent-studio",
      logstream: options?.logStreamName ?? process.env.GALILEO_LOG_STREAM ?? "default", // Note: SDK uses 'logstream' not 'logStreamName'
    });
  } catch (error) {
    console.error("Failed to initialize Galileo:", error);
  }
}

/**
 * Get the Galileo logger instance.
 *
 * @description Returns the singleton Galileo logger instance. Creates one if it doesn't exist.
 *
 * @returns The GalileoLogger instance, or undefined if Galileo is not configured.
 *
 * @example
 * ```typescript
 * const logger = getGalileoLogger();
 * if (logger) {
 *   logger.startTrace({ input: "User query" });
 * }
 * ```
 */
export function getGalileoLogger(): GalileoLogger | undefined {
  if (!isGalileoConfigured()) {
    return undefined;
  }

  try {
    return getLogger({
      projectName: process.env.GALILEO_PROJECT ?? "paigent-studio",
      logstream: process.env.GALILEO_LOG_STREAM ?? "default", // Note: SDK uses 'logstream' not 'logStreamName'
    });
  } catch (error) {
    console.error("Failed to get Galileo logger:", error);
    return undefined;
  }
}

/**
 * Flush all pending traces to Galileo.
 *
 * @description Uploads all buffered traces to the Galileo platform.
 * Should be called periodically or before application shutdown.
 *
 * @example
 * ```typescript
 * // At the end of a request handler
 * await flushGalileo();
 * ```
 */
export async function flushGalileo(): Promise<void> {
  if (!isGalileoConfigured()) {
    return;
  }

  try {
    await galileoFlush();
  } catch (error) {
    console.error("Failed to flush Galileo traces:", error);
  }
}

/**
 * Create a trace context for logging a complete workflow.
 *
 * @description Creates a new trace context that groups related spans together.
 * Use this to track the full execution of a workflow or request.
 *
 * @param input - The trace input parameters.
 * @returns A trace context object with methods to add spans and complete the trace.
 *
 * @example
 * ```typescript
 * const trace = createGalileoTrace({
 *   input: "Summarize the top 3 news articles about AI",
 *   name: "WorkflowExecution",
 *   tags: ["production", "summarization"]
 * });
 *
 * // Add spans...
 * trace.addLLMSpan({ ... });
 * trace.addToolSpan({ ... });
 *
 * // Complete the trace
 * await trace.complete({ output: "Final result" });
 * ```
 */
export function createGalileoTrace(input: TraceInput) {
  const logger = getGalileoLogger();
  const startTime = Date.now();

  if (!logger) {
    // Return a no-op trace context if Galileo is not configured
    return {
      /**
       * Add an LLM span to this trace (no-op).
       */
      addLLMSpan: (_params: LLMSpanInput) => {},
      /**
       * Add a tool span to this trace (no-op).
       */
      addToolSpan: (_params: ToolSpanInput) => {},
      /**
       * Add a workflow span to this trace (no-op).
       */
      addWorkflowSpan: (_params: WorkflowSpanInput) => {},
      /**
       * Add an agent span to this trace (no-op).
       */
      addAgentSpan: (_params: AgentSpanInput) => {},
      /**
       * Conclude the current span and move up the hierarchy (no-op).
       */
      conclude: (_options?: { output?: string; durationNs?: number; statusCode?: number }) => {},
      /**
       * Complete the trace and flush (no-op).
       */
      complete: async (_options?: { output?: string; error?: string }) => {},
    };
  }

  // Start the trace with the Galileo logger
  logger.startTrace({
    input: input.input,
    name: input.name,
    metadata: input.metadata,
    tags: input.tags,
  });

  return {
    /**
     * Add an LLM span to this trace.
     *
     * @param params - The LLM span parameters.
     */
    addLLMSpan: (params: LLMSpanInput) => {
      try {
        logger.addLlmSpan({
          input: params.input,
          output: params.output,
          model: params.model,
          name: params.name,
          durationNs: params.durationNs,
          numInputTokens: params.numInputTokens,
          numOutputTokens: params.numOutputTokens,
          totalTokens: params.totalTokens,
          temperature: params.temperature,
          statusCode: params.statusCode,
          metadata: params.metadata,
          tags: params.tags,
        });
      } catch (error) {
        console.error("Failed to add LLM span:", error);
      }
    },

    /**
     * Add a tool span to this trace.
     *
     * @param params - The tool span parameters.
     */
    addToolSpan: (params: ToolSpanInput) => {
      try {
        logger.addToolSpan({
          input: params.input,
          output: params.output,
          name: params.name,
          durationNs: params.durationNs,
          statusCode: params.statusCode,
          toolCallId: params.toolCallId,
          metadata: params.metadata,
          tags: params.tags,
        });
      } catch (error) {
        console.error("Failed to add tool span:", error);
      }
    },

    /**
     * Add a workflow span to this trace.
     *
     * @description Creates a nested workflow span. Subsequent spans will be children
     * of this workflow until conclude() is called.
     *
     * @param params - The workflow span parameters.
     */
    addWorkflowSpan: (params: WorkflowSpanInput) => {
      try {
        logger.addWorkflowSpan({
          input: params.input,
          output: params.output,
          name: params.name,
          durationNs: params.durationNs,
          metadata: params.metadata,
          tags: params.tags,
        });
      } catch (error) {
        console.error("Failed to add workflow span:", error);
      }
    },

    /**
     * Add an agent span to this trace.
     *
     * @description Creates a nested agent span. Subsequent spans will be children
     * of this agent until conclude() is called.
     *
     * @param params - The agent span parameters.
     */
    addAgentSpan: (params: AgentSpanInput) => {
      try {
        logger.addAgentSpan({
          input: params.input,
          output: params.output,
          name: params.name,
          durationNs: params.durationNs,
          agentType: params.agentType,
          metadata: params.metadata,
          tags: params.tags,
        });
      } catch (error) {
        console.error("Failed to add agent span:", error);
      }
    },

    /**
     * Conclude the current span and move up the hierarchy.
     *
     * @description Used to close a workflow or agent span and return to the parent.
     *
     * @param options - Conclude options.
     */
    conclude: (options?: { output?: string; durationNs?: number; statusCode?: number }) => {
      try {
        logger.conclude({
          output: options?.output,
          durationNs: options?.durationNs,
          statusCode: options?.statusCode,
        });
      } catch (error) {
        console.error("Failed to conclude span:", error);
      }
    },

    /**
     * Complete the trace and flush to Galileo.
     *
     * @description Closes the trace with final output and uploads to Galileo.
     *
     * @param options - Completion options.
     */
    complete: async (options?: { output?: string; error?: string }) => {
      try {
        const durationNs = (Date.now() - startTime) * 1_000_000;

        // Conclude the trace
        logger.conclude({
          output: options?.output ?? options?.error,
          durationNs,
          statusCode: options?.error ? 500 : 200,
          concludeAll: true,
        });

        // Flush to Galileo
        await logger.flush();
      } catch (error) {
        console.error("Failed to complete trace:", error);
      }
    },
  };
}

/**
 * Log a single LLM call without a trace context.
 *
 * @description Convenience method for logging standalone LLM calls.
 * Creates a single-span trace automatically.
 *
 * @param params - The LLM call parameters.
 *
 * @example
 * ```typescript
 * await logLLMCall({
 *   input: [{ role: "user", content: "Hello!" }],
 *   output: { role: "assistant", content: "Hi there!" },
 *   model: "gpt-4o",
 *   numInputTokens: 5,
 *   numOutputTokens: 3,
 * });
 * ```
 */
export async function logLLMCall(params: LLMSpanInput): Promise<void> {
  const logger = getGalileoLogger();

  if (!logger) {
    return;
  }

  try {
    logger.addSingleLlmSpanTrace({
      input: params.input,
      output: params.output,
      model: params.model,
      name: params.name ?? "LLM Call",
      durationNs: params.durationNs,
      numInputTokens: params.numInputTokens,
      numOutputTokens: params.numOutputTokens,
      totalTokens: params.totalTokens,
      temperature: params.temperature,
      statusCode: params.statusCode,
      metadata: params.metadata,
      tags: params.tags,
    });

    await logger.flush();
  } catch (error) {
    console.error("Failed to log LLM call:", error);
  }
}

/**
 * Log a tool call with full context.
 *
 * @description Creates a single-span trace for a tool call.
 *
 * @param params - The tool call parameters.
 *
 * @example
 * ```typescript
 * await logToolCall({
 *   input: JSON.stringify({ url: "https://api.example.com/data" }),
 *   output: JSON.stringify({ result: "success" }),
 *   name: "API Fetch",
 *   statusCode: 200,
 *   metadata: { toolId: "tool-123" }
 * });
 * ```
 */
export async function logToolCall(params: ToolSpanInput): Promise<void> {
  const logger = getGalileoLogger();

  if (!logger) {
    return;
  }

  try {
    // Create a simple trace with a tool span
    logger.startTrace({
      input: params.input,
      name: params.name ?? "Tool Call",
      metadata: params.metadata,
      tags: params.tags,
    });

    logger.addToolSpan({
      input: params.input,
      output: params.output,
      name: params.name,
      durationNs: params.durationNs,
      statusCode: params.statusCode,
      toolCallId: params.toolCallId,
      metadata: params.metadata,
      tags: params.tags,
    });

    logger.conclude({
      output: params.output,
      durationNs: params.durationNs,
      statusCode: params.statusCode,
      concludeAll: true,
    });

    await logger.flush();
  } catch (error) {
    console.error("Failed to log tool call:", error);
  }
}

/**
 * Convert milliseconds to nanoseconds.
 *
 * @description Utility function for converting duration from ms to ns.
 *
 * @param ms - Duration in milliseconds.
 * @returns Duration in nanoseconds.
 */
export function msToNs(ms: number): number {
  return ms * 1_000_000;
}
