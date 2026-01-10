"use client";

/**
 * Intent Input Component
 *
 * @description Combined voice and text input for capturing user workflow intents.
 * Supports voice recording with real-time waveform visualization.
 */

import { useState, useCallback } from "react";
import { Mic, MicOff, Send, Loader2, X, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/use-voice-input";

/**
 * Props for the IntentInput component.
 */
export type IntentInputProps = {
  /** Callback when intent is submitted. */
  onSubmit: (intent: string, voiceTranscript?: string) => void;
  /** Whether submission is in progress. */
  isLoading?: boolean;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
};

/**
 * Intent Input Component.
 *
 * @description Provides both text and voice input for user intents.
 * Voice input uses the browser's MediaRecorder API and Fireworks Whisper
 * for transcription.
 *
 * @example
 * ```tsx
 * <IntentInput
 *   onSubmit={(intent) => createRun(intent)}
 *   isLoading={isPending}
 *   placeholder="Describe what you want to accomplish..."
 * />
 * ```
 */
export function IntentInput({
  onSubmit,
  isLoading = false,
  placeholder = "Describe the workflow you want to create...",
  disabled = false,
}: IntentInputProps) {
  const [textInput, setTextInput] = useState("");
  const [useVoice, setUseVoice] = useState(false);

  const { state, controls } = useVoiceInput({
    onTranscript: (transcript) => {
      setTextInput(transcript);
    },
    maxDuration: 120,
  });

  /**
   * Handle form submission.
   */
  const handleSubmit = useCallback(() => {
    const intent = textInput.trim();
    if (!intent || isLoading || disabled) return;

    onSubmit(intent, state.transcript);
    setTextInput("");
    controls.reset();
  }, [textInput, isLoading, disabled, onSubmit, state.transcript, controls]);

  /**
   * Handle key press for submit.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  /**
   * Toggle voice recording.
   */
  const handleVoiceToggle = useCallback(async () => {
    if (state.isRecording) {
      await controls.stopRecording();
    } else {
      setUseVoice(true);
      await controls.startRecording();
    }
  }, [state.isRecording, controls]);

  /**
   * Cancel voice recording.
   */
  const handleCancelRecording = useCallback(() => {
    controls.cancelRecording();
    setUseVoice(false);
  }, [controls]);

  const isProcessing = state.isRecording || state.isTranscribing || isLoading;
  const canSubmit = textInput.trim().length > 0 && !isProcessing && !disabled;

  return (
    <Card className="p-4 bg-card/50 backdrop-blur">
      <div className="space-y-4">
        {/* Voice recording indicator */}
        {state.isRecording && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-destructive animate-ping" />
              </div>
              <span className="text-sm font-medium text-destructive">
                Recording... {state.duration}s
              </span>
            </div>

            {/* Audio level indicator */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all duration-75"
                  style={{ width: `${state.audioLevel * 100}%` }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelRecording}
                className="text-destructive hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Transcribing indicator */}
        {state.isTranscribing && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-primary">Transcribing audio...</span>
          </div>
        )}

        {/* Error display */}
        {state.error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {state.error}
          </div>
        )}

        {/* Main input area */}
        <div className="relative">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isProcessing || disabled}
            className={cn(
              "min-h-[120px] pr-24 resize-none bg-background/50",
              "focus:ring-2 focus:ring-primary/50 focus:border-primary"
            )}
          />

          {/* Action buttons */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            {/* Voice button */}
            <Button
              type="button"
              variant={state.isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={handleVoiceToggle}
              disabled={state.isTranscribing || isLoading || disabled}
              title={state.isRecording ? "Stop recording" : "Start voice input"}
            >
              {state.isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>

            {/* Submit button */}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="icon"
              className="bg-primary hover:bg-primary/90"
              title="Create workflow (Ctrl+Enter)"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          {useVoice && state.transcript
            ? "Voice transcript shown above. Edit if needed, then submit."
            : "Describe your workflow goal. Use voice input or type your request. Press Ctrl+Enter to submit."}
        </p>
      </div>
    </Card>
  );
}
