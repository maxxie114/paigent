/**
 * Fireworks AI Module
 *
 * @description Exports for Fireworks AI integration including:
 * - Responses API client (recommended for GLM-4.7)
 * - Chat Completions API client (backward compatibility)
 * - ASR (Audio Speech Recognition) client
 *
 * @see https://docs.fireworks.ai/api-reference/post-responses
 * @see https://fireworks.ai/models/fireworks/glm-4p7
 */

// Responses API (recommended for GLM-4.7 and advanced features)
export {
  createResponse,
  createResponseWithRetry,
  callWithSystemPrompt,
  listResponses,
  getResponse,
  deleteResponse,
  RESPONSES_API_MODELS,
  DEFAULT_RESPONSES_MODEL,
  type CreateResponseParams,
  type ProcessedResponse,
  type ResponseObject,
  type ResponseInput,
  type ResponseMessage,
  type ResponseUsage,
  type MCPTool,
  type FunctionTool,
  type ToolChoice,
  type ReasoningConfig,
  type TextConfig,
} from "./responses";

// Chat Completions API (OpenAI-compatible, backward compatibility)
export {
  getFireworksClient,
  callLLM,
  callLLMWithRetry,
  streamLLM,
  FIREWORKS_MODELS,
  DEFAULT_MODEL,
  type LLMCallParams,
  type LLMCallResponse,
} from "./client";

// ASR (Audio Speech Recognition)
export {
  transcribeAudio,
  isASRConfigured,
  type TranscriptionResult,
  type TranscriptionOptions,
} from "./asr";
