/**
 * Fireworks AI Responses API Client
 *
 * @description Client for Fireworks AI Responses API, which provides advanced features
 * over the Chat Completions API including conversation continuation, MCP tool integration,
 * and reasoning/thinking controls. Optimized for GLM-4.7 model.
 *
 * @see https://docs.fireworks.ai/api-reference/post-responses
 * @see https://fireworks.ai/models/fireworks/glm-4p7
 */

import {
  getGalileoLogger,
  isGalileoConfigured,
  msToNs,
} from "@/lib/galileo/client";

/**
 * Fireworks AI Responses API base URL.
 */
const FIREWORKS_RESPONSES_URL = "https://api.fireworks.ai/inference/v1/responses";

/**
 * Available models for the Responses API.
 */
export const RESPONSES_API_MODELS = {
  /**
   * GLM-4.7 - Next-generation general-purpose model optimized for coding,
   * reasoning, and agentic workflows. Supports advanced thinking controls.
   * Context length: 202.8k tokens. Supports function calling.
   *
   * @see https://fireworks.ai/models/fireworks/glm-4p7
   */
  GLM_4P7: "accounts/fireworks/models/glm-4p7",
} as const;

/**
 * Default model for Responses API calls.
 */
export const DEFAULT_RESPONSES_MODEL = RESPONSES_API_MODELS.GLM_4P7;

/**
 * Content item types for structured input/output.
 *
 * @description The Fireworks Responses API returns different content types depending
 * on the context:
 * - `"text"`: Standard text content
 * - `"input_text"`: User input text in conversation history
 * - `"output_text"`: Assistant output text (used by GLM-4.7 and other models)
 */
export type ContentItem = {
  /** Content type - includes "output_text" for assistant responses. */
  type: "text" | "input_text" | "output_text";
  /** Text content. */
  text: string;
};

/**
 * Message structure for Responses API.
 */
export type ResponseMessage = {
  /** Unique message identifier. */
  id?: string;
  /** Message role. */
  role: "user" | "assistant" | "system";
  /** Message content. */
  content: ContentItem[] | string;
  /** Message status. */
  status?: string;
  /** Message type. */
  type?: "message";
};

/**
 * Tool call output from the model.
 */
export type ToolCallOutput = {
  /** Tool call ID. */
  id: string;
  /** Type indicator. */
  type: "function_call";
  /** Function call name. */
  name: string;
  /** Function call arguments (JSON string). */
  arguments: string;
  /** Call ID for result correlation. */
  call_id: string;
  /** Status of the call. */
  status?: string;
};

/**
 * Tool output result.
 */
export type ToolOutput = {
  /** Type indicator. */
  type: "function_call_output";
  /** Corresponding call ID. */
  call_id: string;
  /** Output content. */
  output: string;
};

/**
 * MCP tool definition for the Responses API.
 */
export type MCPTool = {
  /** Tool type - must be "mcp" for MCP tools. */
  type: "mcp";
  /** MCP server URL. */
  server_url: string;
  /** Optional allowed tools filter. */
  allowed_tools?: string[];
  /** Optional headers for the MCP server. */
  headers?: Record<string, string>;
};

/**
 * Function tool definition.
 */
export type FunctionTool = {
  /** Tool type - must be "function". */
  type: "function";
  /** Function definition. */
  function: {
    /** Function name. */
    name: string;
    /** Function description. */
    description?: string;
    /** JSON Schema for parameters. */
    parameters?: Record<string, unknown>;
    /** Whether the function should be called strictly. */
    strict?: boolean;
  };
};

/**
 * Tool choice configuration.
 */
export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };

/**
 * Reasoning configuration for thinking models.
 */
export type ReasoningConfig = {
  /** Enable reasoning output. */
  effort?: "low" | "medium" | "high";
};

/**
 * Text generation configuration.
 */
export type TextConfig = {
  /** Output format. */
  format?: {
    /** Format type (e.g., "json_schema", "json_object"). */
    type: "json_schema" | "json_object" | "text";
    /** JSON Schema definition (if type is "json_schema"). */
    json_schema?: {
      /** Schema name. */
      name: string;
      /** Schema description. */
      description?: string;
      /** JSON Schema object. */
      schema: Record<string, unknown>;
      /** Whether to enforce strict validation. */
      strict?: boolean;
    };
  };
};

/**
 * Token usage information.
 */
export type ResponseUsage = {
  /** Number of input/prompt tokens. */
  prompt_tokens: number;
  /** Number of completion/output tokens. */
  completion_tokens: number;
  /** Total tokens used. */
  total_tokens: number;
  /** Reasoning tokens (if reasoning enabled). */
  reasoning_tokens?: number;
};

/**
 * Error information in response.
 */
export type ResponseError = {
  /** Error type. */
  type: string;
  /** Error code. */
  code: string;
  /** Error message. */
  message: string;
};

/**
 * Incomplete details when status is 'incomplete'.
 */
export type IncompleteDetails = {
  /** Reason for incompleteness. */
  reason: "max_output_tokens" | "max_tool_calls" | "content_filter";
};

/**
 * Output item types in a response.
 */
export type OutputItem = ResponseMessage | ToolCallOutput | ToolOutput;

/**
 * Full response object from the Responses API.
 */
export type ResponseObject = {
  /** Unix timestamp (seconds) when created. */
  created_at: number;
  /** Response status. */
  status: "completed" | "in_progress" | "incomplete" | "failed" | "cancelled";
  /** Model used. */
  model: string;
  /** Output items (messages, tool calls, tool outputs). */
  output: OutputItem[];
  /** Unique response ID (undefined if store=false). */
  id?: string;
  /** Object type (always "response"). */
  object: "response";
  /** Previous response ID in conversation chain. */
  previous_response_id?: string;
  /** Token usage. */
  usage?: ResponseUsage;
  /** Error details (if status is "failed"). */
  error?: ResponseError;
  /** Incomplete details (if status is "incomplete"). */
  incomplete_details?: IncompleteDetails;
  /** System instructions. */
  instructions?: string;
  /** Max output tokens setting. */
  max_output_tokens?: number;
  /** Max tool calls setting. */
  max_tool_calls?: number;
  /** Parallel tool calls setting. */
  parallel_tool_calls?: boolean;
  /** Reasoning configuration. */
  reasoning?: ReasoningConfig;
  /** Whether response was stored. */
  store?: boolean;
  /** Temperature setting. */
  temperature?: number;
  /** Text configuration. */
  text?: TextConfig;
  /** Tool choice setting. */
  tool_choice?: ToolChoice;
  /** Tools provided. */
  tools?: (MCPTool | FunctionTool)[];
  /** Top-p setting. */
  top_p?: number;
  /** Truncation setting. */
  truncation?: "auto" | "disabled";
  /** User identifier. */
  user?: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
};

/**
 * Input types for creating a response.
 */
export type ResponseInput =
  | string
  | Array<ResponseMessage | { type: "input_text"; text: string }>;

/**
 * Parameters for creating a response.
 */
export type CreateResponseParams = {
  /** Model to use (defaults to GLM-4.7). */
  model?: string;
  /** Input text or message array. */
  input: ResponseInput;
  /** Previous response ID for conversation continuation. */
  previousResponseId?: string;
  /** System instructions. */
  instructions?: string;
  /** Maximum output tokens (minimum 1). */
  maxOutputTokens?: number;
  /** Maximum tool calls (minimum 1). */
  maxToolCalls?: number;
  /** Custom metadata (max 16 key-value pairs). */
  metadata?: Record<string, string>;
  /** Enable parallel tool calls (default true). */
  parallelToolCalls?: boolean;
  /** Reasoning configuration for thinking models. */
  reasoning?: ReasoningConfig;
  /** Whether to store the response (default true). */
  store?: boolean;
  /** Whether to stream the response (default false). */
  stream?: boolean;
  /** Temperature (0-2, default 1). */
  temperature?: number;
  /** Text generation configuration. */
  text?: TextConfig;
  /** Tool choice configuration. */
  toolChoice?: ToolChoice;
  /** Tools available to the model. */
  tools?: (MCPTool | FunctionTool)[];
  /** Top-p sampling (0-1, default 1). */
  topP?: number;
  /** Truncation strategy (default "disabled"). */
  truncation?: "auto" | "disabled";
  /** User identifier for abuse monitoring. */
  user?: string;
};

/**
 * Processed response with helper accessors.
 */
export type ProcessedResponse = {
  /** Raw response object. */
  raw: ResponseObject;
  /** Extracted text content (concatenated). */
  text: string;
  /** Response ID (for conversation continuation). */
  id: string | undefined;
  /** Whether the response completed successfully. */
  success: boolean;
  /** Error message (if failed). */
  error: string | undefined;
  /** Token usage statistics. */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens: number;
  };
  /** Tool calls made by the model. */
  toolCalls: ToolCallOutput[];
  /** Request latency in milliseconds. */
  latencyMs: number;
};

/**
 * Get the Fireworks API key from environment.
 *
 * @returns The API key.
 * @throws {Error} If FIREWORKS_API_KEY is not set.
 */
function getApiKey(): string {
  const apiKey = process.env.FIREWORKS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FIREWORKS_API_KEY environment variable is not set. " +
        "Get your API key from https://fireworks.ai/account/api-keys"
    );
  }

  return apiKey;
}

/**
 * Convert camelCase parameters to snake_case for API.
 *
 * @param params - The camelCase parameters.
 * @returns Snake_case parameters for the API.
 */
function toApiParams(params: CreateResponseParams): Record<string, unknown> {
  return {
    model: params.model ?? DEFAULT_RESPONSES_MODEL,
    input: params.input,
    ...(params.previousResponseId !== undefined && {
      previous_response_id: params.previousResponseId,
    }),
    ...(params.instructions !== undefined && {
      instructions: params.instructions,
    }),
    ...(params.maxOutputTokens !== undefined && {
      max_output_tokens: params.maxOutputTokens,
    }),
    ...(params.maxToolCalls !== undefined && {
      max_tool_calls: params.maxToolCalls,
    }),
    ...(params.metadata !== undefined && { metadata: params.metadata }),
    ...(params.parallelToolCalls !== undefined && {
      parallel_tool_calls: params.parallelToolCalls,
    }),
    ...(params.reasoning !== undefined && { reasoning: params.reasoning }),
    ...(params.store !== undefined && { store: params.store }),
    ...(params.stream !== undefined && { stream: params.stream }),
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    ...(params.text !== undefined && { text: params.text }),
    ...(params.toolChoice !== undefined && { tool_choice: params.toolChoice }),
    ...(params.tools !== undefined && { tools: params.tools }),
    ...(params.topP !== undefined && { top_p: params.topP }),
    ...(params.truncation !== undefined && { truncation: params.truncation }),
    ...(params.user !== undefined && { user: params.user }),
  };
}

/**
 * Extract text content from response output.
 *
 * @description Extracts text content from the response output array.
 * Handles multiple content types including reasoning output from GLM-4.7.
 * Prioritizes non-reasoning text content for the main output.
 *
 * The Fireworks Responses API returns different content types:
 * - `"text"`: Standard text content
 * - `"input_text"`: User input text in conversation history
 * - `"output_text"`: Assistant output text (primary output type for GLM-4.7)
 *
 * @param output - The output items array.
 * @returns Concatenated text content (excluding reasoning content).
 */
function extractTextFromOutput(output: OutputItem[]): string {
  const textParts: string[] = [];

  for (const item of output) {
    if ("role" in item && item.role === "assistant" && item.content) {
      if (typeof item.content === "string") {
        textParts.push(item.content);
      } else if (Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          // Include all text content types; skip reasoning content types.
          // The Fireworks API may return reasoning as separate content items
          // with type "reasoning" or similar; we only want actual text output.
          //
          // Content types we handle:
          // - "text": Standard text content
          // - "input_text": User input text
          // - "output_text": Assistant output text (GLM-4.7 uses this)
          if (
            (contentItem.type === "text" ||
              contentItem.type === "input_text" ||
              contentItem.type === "output_text") &&
            contentItem.text
          ) {
            textParts.push(contentItem.text);
          }
        }
      }
    }
  }

  return textParts.join("");
}


/**
 * Extract tool calls from response output.
 *
 * @param output - The output items array.
 * @returns Array of tool call outputs.
 */
function extractToolCalls(output: OutputItem[]): ToolCallOutput[] {
  return output.filter(
    (item): item is ToolCallOutput => "type" in item && item.type === "function_call"
  );
}

/**
 * Process raw response into a more usable format.
 *
 * @param response - The raw response object.
 * @param latencyMs - Request latency in milliseconds.
 * @returns Processed response with helper accessors.
 */
function processResponse(
  response: ResponseObject,
  latencyMs: number
): ProcessedResponse {
  return {
    raw: response,
    text: extractTextFromOutput(response.output),
    id: response.id,
    success: response.status === "completed",
    error: response.error?.message,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      reasoningTokens: response.usage?.reasoning_tokens ?? 0,
    },
    toolCalls: extractToolCalls(response.output),
    latencyMs,
  };
}

/**
 * Create a response using the Fireworks Responses API.
 *
 * @description Creates a model response with optional tool integration,
 * conversation continuation, and reasoning controls. Supports GLM-4.7's
 * advanced thinking modes.
 *
 * @param params - The response parameters.
 * @param options - Optional configuration for logging.
 * @param options.skipGalileoLogging - If true, skip Galileo logging for this call.
 * @param options.spanName - Custom name for the Galileo span.
 * @param options.tags - Tags to attach to the Galileo span.
 * @param options.metadata - Additional metadata for the Galileo span.
 * @returns The processed response with text and metadata.
 *
 * @example
 * ```typescript
 * // Simple text generation
 * const response = await createResponse({
 *   input: "Explain quantum computing in simple terms",
 *   instructions: "You are a helpful science teacher.",
 *   maxOutputTokens: 1024,
 *   temperature: 0.7,
 * });
 * console.log(response.text);
 *
 * // Conversation continuation
 * const followUp = await createResponse({
 *   input: "Can you give me an example?",
 *   previousResponseId: response.id,
 * });
 *
 * // With reasoning enabled
 * const reasoned = await createResponse({
 *   input: "Solve this complex problem step by step",
 *   reasoning: { effort: "high" },
 * });
 * ```
 *
 * @see https://docs.fireworks.ai/api-reference/post-responses
 */
export async function createResponse(
  params: CreateResponseParams,
  options?: {
    skipGalileoLogging?: boolean;
    spanName?: string;
    tags?: string[];
    metadata?: Record<string, string>;
  }
): Promise<ProcessedResponse> {
  const apiKey = getApiKey();
  const startTime = Date.now();

  const apiParams = toApiParams(params);

  const response = await fetch(FIREWORKS_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(apiParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;

    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.detail?.message ?? errorJson.message ?? errorText;
    } catch {
      errorMessage = errorText;
    }

    throw new Error(
      `Fireworks Responses API error (${response.status}): ${errorMessage}`
    );
  }

  const responseData = (await response.json()) as ResponseObject;
  const latencyMs = Date.now() - startTime;
  const processed = processResponse(responseData, latencyMs);

  // Log to Galileo if configured and not explicitly skipped
  if (isGalileoConfigured() && !options?.skipGalileoLogging) {
    const logger = getGalileoLogger();
    if (logger) {
      try {
        // Format input for Galileo
        const inputForLog =
          typeof params.input === "string"
            ? params.input
            : JSON.stringify(params.input);

        const inputMessages = [
          ...(params.instructions
            ? [{ role: "system" as const, content: params.instructions }]
            : []),
          { role: "user" as const, content: inputForLog },
        ];

        logger.addSingleLlmSpanTrace({
          input: inputMessages,
          output: { role: "assistant", content: processed.text },
          model: responseData.model,
          name: options?.spanName ?? "Fireworks Responses API Call",
          durationNs: msToNs(latencyMs),
          numInputTokens: processed.usage.promptTokens,
          numOutputTokens: processed.usage.completionTokens,
          totalTokens: processed.usage.totalTokens,
          temperature: params.temperature ?? 1,
          statusCode: processed.success ? 200 : 500,
          metadata: {
            ...options?.metadata,
            responseId: processed.id ?? "not_stored",
            reasoningTokens: String(processed.usage.reasoningTokens),
          },
          tags: options?.tags ?? ["fireworks", "responses-api", "glm-4p7"],
        });

        // Flush asynchronously - don't block the response
        logger.flush().catch((err) => {
          console.error("Failed to flush Galileo logs:", err);
        });
      } catch (error) {
        console.error("Failed to log Responses API call to Galileo:", error);
      }
    }
  }

  return processed;
}

/**
 * Create a response with retry logic.
 *
 * @description Wraps createResponse with exponential backoff retry for transient failures.
 *
 * @param params - The response parameters.
 * @param maxRetries - Maximum number of retries (default: 3).
 * @returns The processed response.
 * @throws {Error} After all retries are exhausted.
 */
export async function createResponseWithRetry(
  params: CreateResponseParams,
  maxRetries: number = 3
): Promise<ProcessedResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await createResponse(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (lastError.message.includes("(4") && !lastError.message.includes("(429)")) {
        throw lastError;
      }

      // Exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError ?? new Error("Responses API call failed after retries");
}

/**
 * List stored responses.
 *
 * @description Retrieves a paginated list of stored responses.
 *
 * @param options - Pagination options.
 * @param options.limit - Maximum responses to return (default 20).
 * @param options.after - Cursor for forward pagination.
 * @param options.before - Cursor for backward pagination.
 * @returns Paginated list of responses.
 *
 * @see https://docs.fireworks.ai/api-reference/list-responses
 */
export async function listResponses(options?: {
  limit?: number;
  after?: string;
  before?: string;
}): Promise<{
  data: ResponseObject[];
  hasMore: boolean;
  firstId: string | undefined;
  lastId: string | undefined;
}> {
  const apiKey = getApiKey();

  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.after) {
    params.set("after", options.after);
  }
  if (options?.before) {
    params.set("before", options.before);
  }

  const url = params.toString()
    ? `${FIREWORKS_RESPONSES_URL}?${params.toString()}`
    : FIREWORKS_RESPONSES_URL;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Fireworks List Responses API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  return {
    data: data.data ?? [],
    hasMore: data.has_more ?? false,
    firstId: data.first_id,
    lastId: data.last_id,
  };
}

/**
 * Get a specific response by ID.
 *
 * @description Retrieves details of a specific stored response.
 *
 * @param responseId - The response ID to retrieve.
 * @returns The response object.
 *
 * @see https://docs.fireworks.ai/api-reference/get-response
 */
export async function getResponse(responseId: string): Promise<ResponseObject> {
  const apiKey = getApiKey();

  const response = await fetch(`${FIREWORKS_RESPONSES_URL}/${responseId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Fireworks Get Response API error (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Delete a stored response.
 *
 * @description Permanently deletes a response by ID.
 *
 * @param responseId - The response ID to delete.
 *
 * @see https://docs.fireworks.ai/api-reference/delete-response
 */
export async function deleteResponse(responseId: string): Promise<void> {
  const apiKey = getApiKey();

  const response = await fetch(`${FIREWORKS_RESPONSES_URL}/${responseId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Fireworks Delete Response API error (${response.status}): ${errorText}`
    );
  }
}

/**
 * Simplified call for text generation with system prompt.
 *
 * @description Convenience wrapper for common LLM call pattern with
 * system prompt, user prompt, and optional reasoning.
 *
 * @param params - The call parameters.
 * @param options - Optional configuration for logging.
 * @returns The processed response.
 *
 * @example
 * ```typescript
 * const response = await callWithSystemPrompt({
 *   systemPrompt: "You are a helpful JSON generator. Output ONLY valid JSON.",
 *   userPrompt: "Generate a list of 3 colors",
 *   maxOutputTokens: 256,
 *   temperature: 0.3,
 * });
 * console.log(response.text); // {"colors": ["red", "blue", "green"]}
 * ```
 */
export async function callWithSystemPrompt(
  params: {
    /** System instructions. */
    systemPrompt: string;
    /** User query. */
    userPrompt: string;
    /** Model to use (defaults to GLM-4.7). */
    model?: string;
    /** Maximum output tokens. */
    maxOutputTokens?: number;
    /** Temperature (0-2). */
    temperature?: number;
    /** Previous response ID for conversation continuation. */
    previousResponseId?: string;
    /** Reasoning configuration. */
    reasoning?: ReasoningConfig;
    /** Whether to store the response. */
    store?: boolean;
    /** Tools for function calling. */
    tools?: (MCPTool | FunctionTool)[];
  },
  options?: {
    skipGalileoLogging?: boolean;
    spanName?: string;
    tags?: string[];
    metadata?: Record<string, string>;
  }
): Promise<ProcessedResponse> {
  return createResponse(
    {
      model: params.model,
      input: params.userPrompt,
      instructions: params.systemPrompt,
      maxOutputTokens: params.maxOutputTokens,
      temperature: params.temperature,
      previousResponseId: params.previousResponseId,
      reasoning: params.reasoning,
      store: params.store,
      tools: params.tools,
    },
    options
  );
}
