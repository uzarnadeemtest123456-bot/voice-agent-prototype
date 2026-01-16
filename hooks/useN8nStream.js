"use client";

import { useRef, useCallback } from "react";
import { SSEParser } from "@/lib/sse";

/**
 * Custom hook for n8n webhook streaming
 * Handles both SSE and JSON streaming responses
 */
export function useN8nStream() {
    const abortControllerRef = useRef(null);

    /**
     * Stream response from n8n webhook
     * @param {string} userText - User's query
     * @param {Array} messageContext - Conversation history
     * @param {Object} callbacks - { onTextChunk, onComplete, onError, checkActive }
     */
    const streamQuery = useCallback(async (userText, messageContext, callbacks) => {
        const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;

        if (!webhookUrl) {
            throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
        }

        // Cancel any existing stream
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: userText,
                message_context: messageContext,
                knowledge_model: 21,
                country: "CA",
            }),
            signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
            throw new Error(`n8n webhook failed: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");

        if (contentType?.includes("text/event-stream")) {
            await handleSSEStream(response, callbacks);
        } else {
            await handleJSONStream(response, callbacks);
        }
    }, []);

    /**
     * Handle SSE stream format
     */
    const handleSSEStream = async (response, callbacks) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEParser();

        const streamTimeout = setTimeout(() => {
            if (callbacks.checkActive?.()) {
                console.error("⏱️ SSE stream timeout");
                abortControllerRef.current?.abort();
            }
        }, 30000);

        try {
            let hasReceivedData = false;

            while (true) {
                if (!callbacks.checkActive?.()) {
                    clearTimeout(streamTimeout);
                    return;
                }

                const { done, value } = await reader.read();
                if (done) break;

                hasReceivedData = true;
                const chunk = decoder.decode(value, { stream: true });
                const events = parser.parse(chunk);

                for (const event of events) {
                    if (!callbacks.checkActive?.()) {
                        clearTimeout(streamTimeout);
                        return;
                    }

                    if (event.event === "delta" && event.data?.text) {
                        callbacks.onTextChunk?.(event.data.text);
                    } else if (event.event === "done") {
                        clearTimeout(streamTimeout);
                        callbacks.onComplete?.();
                        return;
                    } else if (event.event === "error") {
                        clearTimeout(streamTimeout);
                        throw new Error(event.data?.message || "Stream error");
                    }
                }
            }

            clearTimeout(streamTimeout);

            if (!hasReceivedData) {
                throw new Error("No response from n8n");
            }

            callbacks.onComplete?.();
        } catch (err) {
            clearTimeout(streamTimeout);
            if (err.name === "AbortError") {
                return;
            }
            throw err;
        }
    };

    /**
     * Handle JSON stream format
     */
    const handleJSONStream = async (response, callbacks) => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const streamTimeout = setTimeout(() => {
            if (callbacks.checkActive?.()) {
                console.error("⏱️ JSON stream timeout");
                abortControllerRef.current?.abort();
            }
        }, 30000);

        const resetTimeout = () => {
            clearTimeout(streamTimeout);
        };

        try {
            while (true) {
                if (!callbacks.checkActive?.()) {
                    resetTimeout();
                    return;
                }

                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;

                    if (!callbacks.checkActive?.()) {
                        resetTimeout();
                        return;
                    }

                    try {
                        const jsonObj = JSON.parse(line);

                        if (jsonObj.type === "item" && jsonObj.content) {
                            // Skip final wrapped output
                            try {
                                const contentObj = JSON.parse(jsonObj.content);
                                if (contentObj.output) continue;
                            } catch {
                                // Content is regular text
                            }

                            callbacks.onTextChunk?.(jsonObj.content);
                        }
                    } catch {
                        console.error("Error parsing JSON line:", line);
                    }
                }
            }

            // Process remaining buffer
            if (buffer.trim()) {
                try {
                    const jsonObj = JSON.parse(buffer);
                    if (jsonObj.type === "item" && jsonObj.content) {
                        callbacks.onTextChunk?.(jsonObj.content);
                    }
                } catch {
                    // Ignore
                }
            }

            resetTimeout();
            callbacks.onComplete?.();
        } catch (err) {
            resetTimeout();
            if (err.name === "AbortError") {
                return;
            }
            throw err;
        }
    };

    /**
     * Abort current stream
     */
    const abort = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    /**
     * Cleanup
     */
    const cleanup = useCallback(() => {
        abort();
        abortControllerRef.current = null;
    }, [abort]);

    return {
        streamQuery,
        abort,
        cleanup,
    };
}
