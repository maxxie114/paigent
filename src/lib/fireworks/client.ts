/**
 * Fireworks AI Client
 *
 * @description OpenAI-compatible client for Fireworks AI Chat Completions API.
 * For GLM-4.7 Thinking model with advanced reasoning, use the Responses API
 * client in `@/lib/fireworks/responses` instead.
 *
 * This client is maintained for backward compatibility and for models that
 * don't require the advanced features of the Responses API.
 *
 * @see https://fireworks.ai/docs/tools-sdks/openai-compatibility
 * @see https://fireworks.ai/docs/guides/querying-text-models
 * @see https://docs.fireworks.ai/api-reference/post-responses (Responses API)
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  getGalileoLogger,
  isGalileoConfigured,
  msToNs,
} from "@/lib/galileo/client";

/**
 * Fireworks AI Chat Completions API base URL.
 */
const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";

/**
 * Available Fireworks models.
 *
 * @remarks
 * - For planning, reasoning, and agentic workflows, use `GLM_4P7` with the
 *   Responses API (`@/lib/fireworks/responses`) for best results.
 * - The older GLM-4 models are kept for backward compatibility but GLM-4.7
 *   is significantly more capable for complex tasks.
 */
export const FIREWORKS_MODELS = {
  /**
   * GLM-4.7 - Next-generation model optimized for coding, reasoning,
   * and agentic workflows. 202.8k context, supports function calling.
   * Use with Responses API for advanced thinking controls.
   *
   * @see https://fireworks.ai/models/fireworks/glm-4p7
   */
  GLM_4P7: "accounts/fireworks/models/glm-4p7",
  /**
   * GLM-4 9B - Fast, efficient model for general tasks.
   * @deprecated Prefer GLM_4P7 for better reasoning capabilities.
   */
  GLM_4_9B: "accounts/fireworks/models/glm-4-9b-chat",
  /**
   * GLM-4 32B - More capable model for complex reasoning.
   * @deprecated Prefer GLM_4P7 for better reasoning capabilities.
   */
  GLM_4_32B: "accounts/fireworks/models/glm-4-32b-chat",
  /** Llama 3.3 70B - High-quality open model. */
  LLAMA_3_70B: "accounts/fireworks/models/llama-v3p3-70b-instruct",
  /** Mixtral 8x22B - Large mixture-of-experts model. */
  MIXTRAL_8X22B: "accounts/fireworks/models/mixtral-8x22b-instruct",
} as const;

/**
 * Default model for Chat Completions API.
 *
 * @remarks For planning and reasoning tasks, prefer using the Responses API
 * with GLM-4.7 (`@/lib/fireworks/responses`).
 */
export const DEFAULT_MODEL = FIREWORKS_MODELS.GLM_4P7;

/**
 * Cached OpenAI client instance.
 */
let cachedClient: OpenAI | undefined;

/**
 * Get or create the Fireworks AI client.
 *
 * @description Creates a singleton OpenAI-compatible client configured for Fireworks AI.
 *
 * @returns The OpenAI client configured for Fireworks.
 * @throws {Error} If FIREWORKS_API_KEY is not set.
 */
export function getFireworksClient(): OpenAI {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.FIREWORKS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FIREWORKS_API_KEY environment variable is not set. " +
        "Get your API key from https://fireworks.ai/account/api-keys"
    );
  }

  cachedClient = new OpenAI({
    apiKey,
    baseURL: FIREWORKS_BASE_URL,
  });

  return cachedClient;
}

/**
 * Parameters for LLM calls.
 */
export type LLMCallParams = {
  /** System prompt for context and instructions. */
  systemPrompt: string;
  /** User prompt with the actual query. */
  userPrompt: string;
  /** Model to use (defaults to GLM-4 9B). */
  model?: string;
  /** Maximum tokens in response. */
  maxTokens?: number;
  /** Temperature for randomness (0-2). */
  temperature?: number;
  /** Additional messages for multi-turn conversations. */
  additionalMessages?: ChatCompletionMessageParam[];
};

/**
 * LLM call response.
 */
export type LLMCallResponse = {
  /** The generated text response. */
  text: string;
  /** Token usage information. */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Finish reason. */
  finishReason: string | undefined;
  /** Model used. */
  model: string;
  /** Latency in milliseconds. */
  latencyMs: number;
};

/**
 * Call the Fireworks LLM.
 *
 * @description Makes a chat completion request to Fireworks AI.
 * Uses GLM-4 by default for best reasoning performance.
 * Automatically logs the call to Galileo if configured.
 *
 * @param params - The call parameters.
 * @param options - Optional configuration for logging.
 * @param options.skipGalileoLogging - If true, skip Galileo logging for this call.
 * @param options.spanName - Custom name for the Galileo span.
 * @param options.tags - Tags to attach to the Galileo span.
 * @param options.metadata - Additional metadata for the Galileo span.
 * @returns The LLM response with text and metadata.
 *
 * @example
 * ```typescript
 * const response = await callLLM({
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "What is 2 + 2?",
 * });
 * console.log(response.text); // "4"
 * ```
 */
export async function callLLM(
  params: LLMCallParams,
  options?: {
    skipGalileoLogging?: boolean;
    spanName?: string;
    tags?: string[];
    metadata?: Record<string, string>;
  }
): Promise<LLMCallResponse> {
  const {
    systemPrompt,
    userPrompt,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0.7,
    additionalMessages = [],
  } = params;

  const client = getFireworksClient();
  const startTime = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...additionalMessages,
    { role: "user", content: userPrompt },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  const latencyMs = Date.now() - startTime;
  const choice = response.choices[0];
  const responseText = choice?.message?.content ?? "";

  // Log to Galileo if configured and not explicitly skipped
  if (isGalileoConfigured() && !options?.skipGalileoLogging) {
    const logger = getGalileoLogger();
    if (logger) {
      try {
        // Format input as message array for Galileo
        const inputMessages = [
          { role: "system" as const, content: systemPrompt },
          ...additionalMessages.map((msg) => ({
            role: msg.role as "user" | "assistant" | "system",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          })),
          { role: "user" as const, content: userPrompt },
        ];

        logger.addSingleLlmSpanTrace({
          input: inputMessages,
          output: { role: "assistant", content: responseText },
          model: response.model,
          name: options?.spanName ?? "Fireworks LLM Call",
          durationNs: msToNs(latencyMs),
          numInputTokens: response.usage?.prompt_tokens,
          numOutputTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
          temperature,
          statusCode: 200,
          metadata: options?.metadata,
          tags: options?.tags ?? ["fireworks", "llm"],
        });

        // Flush asynchronously - don't block the response
        logger.flush().catch((err) => {
          console.error("Failed to flush Galileo logs:", err);
        });
      } catch (error) {
        console.error("Failed to log LLM call to Galileo:", error);
      }
    }
  }

  return {
    text: responseText,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    finishReason: choice?.finish_reason ?? undefined,
    model: response.model,
    latencyMs,
  };
}

/**
 * Call LLM with retry logic.
 *
 * @description Wraps callLLM with exponential backoff retry for transient failures.
 *
 * @param params - The call parameters.
 * @param maxRetries - Maximum number of retries (default: 3).
 * @returns The LLM response.
 * @throws {Error} After all retries are exhausted.
 */
export async function callLLMWithRetry(
  params: LLMCallParams,
  maxRetries: number = 3
): Promise<LLMCallResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callLLM(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx)
      if (
        error instanceof OpenAI.APIError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw error;
      }

      // Exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError ?? new Error("LLM call failed after retries");
}

/**
 * Stream LLM response.
 *
 * @description Streams the LLM response token by token for real-time display.
 *
 * @param params - The call parameters.
 * @param onToken - Callback for each token received.
 * @returns The complete response after streaming finishes.
 */
export async function streamLLM(
  params: LLMCallParams,
  onToken: (token: string) => void
): Promise<LLMCallResponse> {
  const {
    systemPrompt,
    userPrompt,
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0.7,
    additionalMessages = [],
  } = params;

  const client = getFireworksClient();
  const startTime = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...additionalMessages,
    { role: "user", content: userPrompt },
  ];

  const stream = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
  });

  let fullText = "";
  let finishReason: string | undefined;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullText += content;
      onToken(content);
    }
    if (chunk.choices[0]?.finish_reason) {
      finishReason = chunk.choices[0].finish_reason;
    }
  }

  const latencyMs = Date.now() - startTime;

  return {
    text: fullText,
    usage: {
      // Token counts not available in streaming mode
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    finishReason,
    model,
    latencyMs,
  };
}
