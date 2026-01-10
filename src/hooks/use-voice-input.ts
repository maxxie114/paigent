"use client";

/**
 * Voice Input Hook
 *
 * @description Custom hook for capturing voice input using MediaRecorder API
 * and transcribing via Fireworks Whisper.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { getBestAudioFormat } from "@/lib/fireworks/asr";

/**
 * Voice input state.
 */
export type VoiceInputState = {
  /** Whether recording is currently active. */
  isRecording: boolean;
  /** Whether transcription is in progress. */
  isTranscribing: boolean;
  /** The transcribed text (if available). */
  transcript: string | undefined;
  /** Error message (if any). */
  error: string | undefined;
  /** Recording duration in seconds. */
  duration: number;
  /** Audio level for visualization (0-1). */
  audioLevel: number;
};

/**
 * Voice input controls.
 */
export type VoiceInputControls = {
  /** Start recording. */
  startRecording: () => Promise<void>;
  /** Stop recording and transcribe. */
  stopRecording: () => Promise<void>;
  /** Cancel recording without transcribing. */
  cancelRecording: () => void;
  /** Clear the transcript and error. */
  reset: () => void;
};

/**
 * Voice input hook options.
 */
export type UseVoiceInputOptions = {
  /** Maximum recording duration in seconds (default: 120). */
  maxDuration?: number;
  /** Callback when transcription completes. */
  onTranscript?: (transcript: string) => void;
  /** Callback when an error occurs. */
  onError?: (error: string) => void;
  /** Language hint for transcription (ISO 639-1 code). */
  language?: string;
};

/**
 * Custom hook for voice input.
 *
 * @description Provides voice recording and transcription functionality
 * using the browser's MediaRecorder API and Fireworks Whisper.
 *
 * @param options - Hook options.
 * @returns State and controls for voice input.
 *
 * @example
 * ```tsx
 * function VoiceInput() {
 *   const { state, controls } = useVoiceInput({
 *     onTranscript: (text) => console.log("Transcribed:", text),
 *   });
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={state.isRecording ? controls.stopRecording : controls.startRecording}
 *       >
 *         {state.isRecording ? "Stop" : "Start"} Recording
 *       </button>
 *       {state.transcript && <p>{state.transcript}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVoiceInput(
  options: UseVoiceInputOptions = {}
): {
  state: VoiceInputState;
  controls: VoiceInputControls;
} {
  const {
    maxDuration = 120,
    onTranscript,
    onError,
    language,
  } = options;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  /**
   * Start audio level monitoring.
   */
  const startAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(average / 255);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  /**
   * Stop audio level monitoring.
   */
  const stopAudioLevelMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  /**
   * Start recording.
   */
  const startRecording = useCallback(async () => {
    try {
      setError(undefined);
      setTranscript(undefined);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Get best supported format
      const mimeType = getBestAudioFormat();

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setDuration(0);

      // Start audio level monitoring
      startAudioLevelMonitoring(stream);

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // Auto-stop at max duration
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
      onError?.(message);
    }
  }, [maxDuration, onError, startAudioLevelMonitoring]);

  /**
   * Stop recording and transcribe.
   */
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // Clean up
        stopAudioLevelMonitoring();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        // Transcribe
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");
          if (language) {
            formData.append("language", language);
          }

          const response = await fetch("/api/asr/transcribe", {
            method: "POST",
            body: formData,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Transcription failed");
          }

          setTranscript(data.transcript);
          onTranscript?.(data.transcript);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Transcription failed";
          setError(message);
          onError?.(message);
        } finally {
          setIsTranscribing(false);
        }

        resolve();
      };

      mediaRecorder.stop();
    });
  }, [isRecording, language, onTranscript, onError, stopAudioLevelMonitoring]);

  /**
   * Cancel recording without transcribing.
   */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }

    stopAudioLevelMonitoring();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setDuration(0);
    audioChunksRef.current = [];
  }, [isRecording, stopAudioLevelMonitoring]);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    setTranscript(undefined);
    setError(undefined);
    setDuration(0);
  }, []);

  return {
    state: {
      isRecording,
      isTranscribing,
      transcript,
      error,
      duration,
      audioLevel,
    },
    controls: {
      startRecording,
      stopRecording,
      cancelRecording,
      reset,
    },
  };
}
