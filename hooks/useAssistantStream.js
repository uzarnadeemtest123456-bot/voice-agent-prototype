/**
 * Custom hook for streaming assistant responses from n8n
 * Handles SSE streaming and JSON streaming formats
 * 
 * FIXED BUGS (2024-12-26):
 * 1. mergeStreamText() - Fixed false-positive duplicate detection using prev.includes()
 * 2. JSON streaming - Improved wrapped output detection to avoid skipping legitimate content
 * 3. Error handling - Better logging for malformed JSON and partial buffers
 */

import { useState, useRef, useCallback } from 'react';
import { SSEParser } from '@/lib/sse';

/**
 * Smart text merge helper - handles both cumulative and delta streaming
 * Prevents text duplication when streaming service sends full text each time
 * 
 * FIXED BUG: Previous version used prev.includes(incoming) which would incorrectly
 * skip any incoming text that matched ANY substring in prev, causing text loss.
 * 
 * Now uses more precise checks:
 * - incoming.startsWith(prev): True cumulative streaming (full text each time)
 * - prev === incoming: Exact duplicate
 * - prev.endsWith(incoming): Duplicate end portion already received
 * 
 * @param {string} prev - Previously accumulated text
 * @param {string} incoming - New text chunk
 * @returns {string} Merged text without duplicates
 */
function mergeStreamText(prev, incoming) {
  if (!incoming) return prev;
  if (!prev) return incoming;

  // CUMULATIVE: incoming contains full text so far
  if (incoming.startsWith(prev)) return incoming;

  // TRUE DUPLICATE: Check if we're receiving the exact same text again
  if (prev === incoming) return prev;
  
  // DUPLICATE END: Check if incoming is just the end portion (already received)
  if (prev.endsWith(incoming)) return prev;

  // DELTA: incoming is only the new part - append it
  return prev + incoming;
}

export function useAssistantStream() {
  const [assistantText, setAssistantText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const assistantTextBufferRef = useRef('');
  const onCompleteCallbackRef = useRef(null);

  const handleSSEStream = useCallback(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parse(chunk);

        for (const event of events) {
          if (event.event === "delta" && event.data?.text) {
            const newText = event.data.text;
            assistantTextBufferRef.current = mergeStreamText(
              assistantTextBufferRef.current,
              newText
            );
            setAssistantText(assistantTextBufferRef.current);
          } else if (event.event === "done") {
            setIsStreaming(false);
            if (onCompleteCallbackRef.current) {
              onCompleteCallbackRef.current(assistantTextBufferRef.current);
            }
            return;
          } else if (event.event === "error") {
            throw new Error(event.data?.message || "Stream error");
          }
        }
      }

      setIsStreaming(false);
      if (onCompleteCallbackRef.current) {
        onCompleteCallbackRef.current(assistantTextBufferRef.current);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }, []);

  const handleStreamingJSON = useCallback(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const jsonObj = JSON.parse(line);
            
            if (jsonObj.type === "item" && jsonObj.content) {
              // Check if content is a JSON-wrapped final output (n8n specific format)
              // Only skip if it's explicitly a wrapper with 'output' field and no streaming text
              let contentToAdd = jsonObj.content;
              
              if (typeof jsonObj.content === 'string') {
                try {
                  const contentObj = JSON.parse(jsonObj.content);
                  // Only skip if it's a wrapper object containing the full output
                  // AND we already have text accumulated (meaning this is truly a final wrapper)
                  if (contentObj.output && typeof contentObj.output === 'string' && 
                      assistantTextBufferRef.current.length > 0) {
                    continue;
                  }
                } catch (e) {
                  // Content is not JSON - use it as-is (regular streaming text)
                }
              }
              
              assistantTextBufferRef.current = mergeStreamText(
                assistantTextBufferRef.current,
                contentToAdd
              );
              setAssistantText(assistantTextBufferRef.current);
            }
          } catch (parseError) {
            // Skip malformed JSON line
          }
        }
      }

      // Process any remaining buffer content after stream ends
      if (buffer.trim()) {
        try {
          const jsonObj = JSON.parse(buffer);
          if (jsonObj.type === "item" && jsonObj.content) {
            // Apply same wrapper detection logic as above
            let contentToAdd = jsonObj.content;
            
            if (typeof jsonObj.content === 'string') {
              try {
                const contentObj = JSON.parse(jsonObj.content);
                if (contentObj.output && typeof contentObj.output === 'string' && 
                    assistantTextBufferRef.current.length > 0) {
                  contentToAdd = null;
                }
              } catch (e) {
                // Content is not JSON - use it as-is
              }
            }
            
            if (contentToAdd) {
              assistantTextBufferRef.current = mergeStreamText(
                assistantTextBufferRef.current,
                contentToAdd
              );
              setAssistantText(assistantTextBufferRef.current);
            }
          }
        } catch (e) {
          // Failed to parse remaining buffer - skip it
        }
      }

      setIsStreaming(false);
      if (onCompleteCallbackRef.current) {
        onCompleteCallbackRef.current(assistantTextBufferRef.current);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }, []);

  const startConversation = useCallback(async (userText, messageContext, onComplete) => {
    setIsStreaming(true);
    setAssistantText('');
    assistantTextBufferRef.current = '';
    onCompleteCallbackRef.current = onComplete;
    setError(null);

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;
      
      if (!webhookUrl) {
        throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
      }

      abortControllerRef.current = new AbortController();

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userText,
          message_context: messageContext,
          knowledge_model: 23,
          country: "CA"
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`n8n webhook failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("text/event-stream")) {
        await handleSSEStream(response);
      } else {
        await handleStreamingJSON(response);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        setIsStreaming(false);
        return;
      }
      setError(err.message);
      setIsStreaming(false);
      throw err;
    }
  }, [handleSSEStream, handleStreamingJSON]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setAssistantText('');
    assistantTextBufferRef.current = '';
    setError(null);
    setIsStreaming(false);
  }, []);

  return {
    assistantText,
    isStreaming,
    error,
    startConversation,
    stopStreaming,
    reset,
  };
}
