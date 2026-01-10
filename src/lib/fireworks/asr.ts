/**
 * Fireworks ASR (Automatic Speech Recognition)
 *
 * @description Client for Fireworks AI audio transcription API.
 * Uses Whisper models for high-quality speech-to-text conversion.
 *
 * @see https://docs.fireworks.ai/api-reference/audio-transcriptions
 */

/**
 * Fireworks ASR API endpoint.
 */
const ASR_API_URL = "https://audio-prod.api.fireworks.ai/v1/audio/transcriptions";

/**
 * Available Whisper models.
 */
export const WHISPER_MODELS = {
  /** Whisper v3 - Best accuracy, slower. */
  WHISPER_V3: "whisper-v3",
  /** Whisper v3 Turbo - Faster, slightly lower accuracy. */
  WHISPER_V3_TURBO: "whisper-v3-turbo",
} as const;

/**
 * Default model for transcription.
 */
export const DEFAULT_WHISPER_MODEL = WHISPER_MODELS.WHISPER_V3;

/**
 * Check if ASR is configured.
 *
 * @description Returns true if the FIREWORKS_API_KEY environment variable is set.
 *
 * @returns True if ASR can be used, false otherwise.
 */
export function isASRConfigured(): boolean {
  return !!process.env.FIREWORKS_API_KEY;
}

/**
 * Transcription response from Fireworks ASR.
 */
export type TranscriptionResult = {
  /** The transcribed text. */
  text: string;
  /** Confidence score (if available). */
  confidence?: number;
  /** Audio duration in seconds (if available). */
  duration?: number;
  /** Language detected (if available). */
  language?: string;
};

/**
 * Transcription options.
 */
export type TranscriptionOptions = {
  /** Whisper model to use. */
  model?: string;
  /** Language hint (ISO 639-1 code). */
  language?: string;
  /** Prompt to guide the model (optional). */
  prompt?: string;
  /** Response format. */
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
  /** Temperature for sampling (0-1). */
  temperature?: number;
};

/**
 * Transcribe audio using Fireworks ASR.
 *
 * @description Sends audio data to Fireworks Whisper API for transcription.
 * Supports various audio formats including webm, mp3, wav, m4a.
 *
 * @param audioData - The audio file as a Blob or File.
 * @param options - Transcription options.
 * @returns The transcription result.
 *
 * @throws {Error} If FIREWORKS_API_KEY is not set or API call fails.
 *
 * @example
 * ```typescript
 * // From a File input
 * const file = event.target.files[0];
 * const result = await transcribeAudio(file);
 * console.log(result.text);
 *
 * // From MediaRecorder
 * const blob = new Blob(chunks, { type: "audio/webm" });
 * const result = await transcribeAudio(blob);
 * ```
 */
export async function transcribeAudio(
  audioData: Blob | File,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const apiKey = process.env.FIREWORKS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FIREWORKS_API_KEY environment variable is not set. " +
        "Get your API key from https://fireworks.ai/account/api-keys"
    );
  }

  const {
    model = DEFAULT_WHISPER_MODEL,
    language,
    prompt,
    responseFormat = "json",
    temperature,
  } = options;

  // Build form data
  const formData = new FormData();
  formData.append("file", audioData, "audio.webm");
  formData.append("model", model);

  if (language) {
    formData.append("language", language);
  }

  if (prompt) {
    formData.append("prompt", prompt);
  }

  if (responseFormat) {
    formData.append("response_format", responseFormat);
  }

  if (temperature !== undefined) {
    formData.append("temperature", temperature.toString());
  }

  // Make API request
  const response = await fetch(ASR_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Fireworks ASR API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  return {
    text: data.text || "",
    confidence: data.confidence,
    duration: data.duration,
    language: data.language,
  };
}

/**
 * Sanitize transcript for prompt injection mitigation.
 *
 * @description Removes potentially harmful content from transcripts.
 * Transcripts should be treated as untrusted user input.
 *
 * @param transcript - The raw transcript text.
 * @returns Sanitized transcript.
 */
export function sanitizeTranscript(transcript: string): string {
  if (!transcript) return "";

  let sanitized = transcript;

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Remove potential prompt injection patterns
  // These are common patterns used to try to override system prompts
  const injectionPatterns = [
    /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
    /disregard\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
    /forget\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+/gi,
    /system\s*:\s*/gi,
    /assistant\s*:\s*/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<<SYS>>/gi,
    /<\/SYS>/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "");
  }

  // Limit length to prevent DoS
  const MAX_TRANSCRIPT_LENGTH = 10000;
  if (sanitized.length > MAX_TRANSCRIPT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_TRANSCRIPT_LENGTH);
  }

  return sanitized;
}

/**
 * Check if the audio format is supported.
 *
 * @param mimeType - The MIME type of the audio.
 * @returns True if supported, false otherwise.
 */
export function isSupportedAudioFormat(mimeType: string): boolean {
  const supportedFormats = [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp3",
    "audio/mpeg",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/m4a",
    "audio/mp4",
    "audio/ogg",
    "audio/ogg;codecs=opus",
    "audio/flac",
  ];

  // Normalize mime type for comparison
  const normalizedType = mimeType.toLowerCase().split(";")[0];

  return supportedFormats.some(
    (format) => format.toLowerCase().split(";")[0] === normalizedType
  );
}

/**
 * Get the best supported audio format for the browser.
 *
 * @returns The MIME type to use for MediaRecorder.
 */
export function getBestAudioFormat(): string {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }

  // Prefer opus for better compression
  const formats = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const format of formats) {
    if (MediaRecorder.isTypeSupported(format)) {
      return format;
    }
  }

  return "audio/webm";
}
