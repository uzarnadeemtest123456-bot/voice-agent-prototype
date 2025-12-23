/**
 * Custom hook for streaming assistant responses from n8n
 * Handles SSE streaming and JSON streaming formats
 */

import { useState, useRef, useCallback } from 'react';
import { SSEParser } from '@/lib/sse';

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
            assistantTextBufferRef.current += newText;
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
              try {
                const contentObj = JSON.parse(jsonObj.content);
                if (contentObj.output) {
                  console.log("Skipping final wrapped output");
                  continue;
                }
              } catch (e) {
                // Content is regular text
              }
              
              assistantTextBufferRef.current += jsonObj.content;
              setAssistantText(assistantTextBufferRef.current);
            }
          } catch (parseError) {
            console.error("Error parsing JSON line:", parseError);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const jsonObj = JSON.parse(buffer);
          if (jsonObj.type === "item" && jsonObj.content) {
            assistantTextBufferRef.current += jsonObj.content;
            setAssistantText(assistantTextBufferRef.current);
          }
        } catch (e) {
          // Ignore
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

      console.log('Sending message_context to n8n:', messageContext);

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
        console.log("n8n request aborted");
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
