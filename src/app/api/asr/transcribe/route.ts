/**
 * ASR Transcription API Route
 *
 * @description Handles audio transcription requests using Fireworks Whisper API.
 * Accepts audio uploads via multipart form data.
 *
 * @see https://docs.fireworks.ai/api-reference/audio-transcriptions
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { transcribeAudio, sanitizeTranscript, isSupportedAudioFormat } from "@/lib/fireworks/asr";

/**
 * Maximum audio file size (10MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/asr/transcribe
 *
 * @description Transcribes an audio file to text.
 *
 * Request: multipart/form-data with:
 * - audio: The audio file (required)
 * - language: Language hint (optional, ISO 639-1 code)
 *
 * Response: { transcript: string, confidence?: number, duration?: number }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const language = formData.get("language") as string | null;

    // Validate audio file
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Check file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Check file type
    if (!isSupportedAudioFormat(audioFile.type)) {
      return NextResponse.json(
        { error: `Unsupported audio format: ${audioFile.type}` },
        { status: 400 }
      );
    }

    // Transcribe
    const result = await transcribeAudio(audioFile, {
      language: language ?? undefined,
    });

    // Sanitize transcript
    const sanitizedText = sanitizeTranscript(result.text);

    return NextResponse.json({
      transcript: sanitizedText,
      confidence: result.confidence,
      duration: result.duration,
      language: result.language,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    const message = error instanceof Error ? error.message : "Transcription failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
