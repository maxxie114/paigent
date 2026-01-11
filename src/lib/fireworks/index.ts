/**
 * Fireworks AI Module
 *
 * @description Exports for Fireworks AI integration:
 * - Responses API client for text generation, function calling, and reasoning
 * - ASR (Automatic Speech Recognition) client for audio transcription
 *
 * @remarks
 * This module uses the Fireworks Responses API exclusively, which provides
 * advanced features over the Chat Completions API:
 * - Conversation continuation via response IDs
 * - Reasoning/thinking controls for GLM-4.7
 * - MCP tool integration
 * - Response storage for debugging and audit trails
 *
 * @see https://docs.fireworks.ai/api-reference/post-responses
 * @see https://fireworks.ai/models/fireworks/glm-4p7
 */

// Responses API (primary API for all LLM interactions)
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

// ASR (Automatic Speech Recognition)
export {
  transcribeAudio,
  isASRConfigured,
  type TranscriptionResult,
  type TranscriptionOptions,
} from "./asr";
