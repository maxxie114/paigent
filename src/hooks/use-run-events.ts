"use client";

/**
 * Run Events Hook
 *
 * @description Custom hook for subscribing to run events via SSE.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { SSEEventData } from "@/types/api";

/**
 * Run events state.
 */
export type RunEventsState = {
  /** Array of received events. */
  events: SSEEventData[];
  /** Whether the connection is active. */
  connected: boolean;
  /** Whether the run is complete. */
  isComplete: boolean;
  /** Final run status (if complete). */
  finalStatus?: string;
  /** Error message (if any). */
  error?: string;
};

/**
 * Run events hook options.
 */
export type UseRunEventsOptions = {
  /** Whether to enable the SSE connection. */
  enabled?: boolean;
  /** Callback when a new event is received. */
  onEvent?: (event: SSEEventData) => void;
  /** Callback when the run completes. */
  onComplete?: (status: string) => void;
  /** Callback when an error occurs. */
  onError?: (error: string) => void;
};

/**
 * Custom hook for run event subscription.
 *
 * @description Subscribes to run events via Server-Sent Events.
 * Automatically reconnects on connection loss.
 *
 * @param runId - The run ID to subscribe to.
 * @param options - Hook options.
 * @returns Run events state.
 *
 * @example
 * ```tsx
 * function RunStatus({ runId }: { runId: string }) {
 *   const { events, connected, isComplete } = useRunEvents(runId, {
 *     onEvent: (event) => console.log("Event:", event),
 *   });
 *
 *   return (
 *     <div>
 *       <div>Connected: {connected ? "Yes" : "No"}</div>
 *       <div>Events: {events.length}</div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useRunEvents(
  runId: string,
  options: UseRunEventsOptions = {}
): RunEventsState {
  const { enabled = true, onEvent, onComplete, onError } = options;

  const [events, setEvents] = useState<SSEEventData[]>([]);
  const [connected, setConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  /**
   * Calculate reconnection delay with exponential backoff.
   */
  const getReconnectDelay = useCallback(() => {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts.current), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
  }, []);

  /**
   * Close the current connection.
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnected(false);
  }, []);

  /**
   * Establish SSE connection.
   */
  const connect = useCallback(() => {
    if (!enabled || !runId || isComplete) return;

    // Close existing connection
    disconnect();

    // Create new EventSource
    const eventSource = new EventSource(`/api/runs/${runId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(undefined);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle special event types
        if (data.type === "connected") {
          return;
        }

        if (data.type === "run_complete") {
          setIsComplete(true);
          setFinalStatus(data.status);
          onComplete?.(data.status);
          disconnect();
          return;
        }

        // Add to events list
        const sseEvent: SSEEventData = {
          id: data.id,
          type: data.type,
          ts: data.ts,
          data: data.data,
          actor: data.actor,
        };

        setEvents((prev) => [...prev, sseEvent]);
        onEvent?.(sseEvent);
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);

      if (!isComplete) {
        // Schedule reconnection
        reconnectAttempts.current++;
        const delay = getReconnectDelay();

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);

        if (reconnectAttempts.current > 5) {
          const errorMsg = "Connection lost. Attempting to reconnect...";
          setError(errorMsg);
          onError?.(errorMsg);
        }
      }
    };
  }, [
    enabled,
    runId,
    isComplete,
    disconnect,
    getReconnectDelay,
    onEvent,
    onComplete,
    onError,
  ]);

  // Connect on mount and when runId changes
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect, runId]);

  return {
    events,
    connected,
    isComplete,
    finalStatus,
    error,
  };
}
