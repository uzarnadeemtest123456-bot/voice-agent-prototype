"use client";

import { useRef, useCallback } from "react";
import { TextChunker } from "@/lib/textChunker";
import { AudioQueue } from "@/lib/audioQueue";
import { normalizePronunciationMarkers } from "@/lib/pronunciation";

/**
 * Custom hook for Text-to-Speech management
 * Handles audio queue, text chunking, and TTS API calls
 */
export function useTTS() {
    const audioQueueRef = useRef(null);
    const textChunkerRef = useRef(null);
    const activeRequestIdRef = useRef(0);
    const currentChunkIdRef = useRef(0);
    const ttsAbortControllersRef = useRef(new Set());
    const providerRef = useRef("elevenlabs"); // Default to ElevenLabs
    const MAX_TTS_RETRIES = 3;
    const RETRY_BASE_DELAY_MS = 600;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * Set TTS Provider
     */
    const setProvider = useCallback((provider) => {
        if (provider === "elevenlabs" || provider === "minimax") {
            providerRef.current = provider;
        }
    }, []);

    const getRetryDelay = (attempt, retryAfterHeader) => {
        const retryAfterSeconds = Number(retryAfterHeader);
        if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
            return retryAfterSeconds * 1000;
        }
        return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    };

    /**
     * Ensure AudioQueue is initialized
     */
    const ensureAudioQueue = useCallback(() => {
        if (!audioQueueRef.current) {
            audioQueueRef.current = new AudioQueue();
        }
        return audioQueueRef.current;
    }, []);

    /**
     * Fetch TTS audio for a text chunk
     */
    const fetchTTSAudio = useCallback(async (text, requestId, chunkId, attempt = 1) => {
        if (requestId !== activeRequestIdRef.current) {
            return;
        }

        const abortController = new AbortController();
        ttsAbortControllersRef.current.add(abortController);

        try {
            const provider = providerRef.current;
            const endpoint = `/api/tts/${provider}`;

            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, requestId, chunkId }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const canRetry = response.status === 429 || response.status >= 500;
                if (canRetry && attempt < MAX_TTS_RETRIES && requestId === activeRequestIdRef.current) {
                    const delay = getRetryDelay(attempt, response.headers.get("retry-after"));
                    console.warn(
                        `⚠️ TTS API error ${response.status} for chunk ${chunkId}, retrying in ${delay}ms (attempt ${attempt + 1
                        }/${MAX_TTS_RETRIES})`
                    );
                    await sleep(delay);
                    if (requestId !== activeRequestIdRef.current) return;
                    return fetchTTSAudio(text, requestId, chunkId, attempt + 1);
                }

                console.error(`❌ TTS API error: ${response.status}`);
                audioQueueRef.current?.markChunkFailed(requestId, chunkId);
                return;
            }

            if (requestId !== activeRequestIdRef.current) {
                return;
            }

            // Try streaming via MediaSource
            const reader = response.body?.getReader?.();
            const canStream =
                !!reader &&
                typeof window !== "undefined" &&
                window.MediaSource &&
                MediaSource.isTypeSupported("audio/mpeg");

            if (canStream && audioQueueRef.current) {
                const queued = audioQueueRef.current.enqueueStream(
                    requestId,
                    chunkId,
                    reader,
                    "audio/mpeg"
                );
                if (queued) {
                    return;
                }
            }

            // Fallback: accumulate full blob
            const streamReader = reader ?? response.body?.getReader?.();
            if (!streamReader) {
                const audioBlob = await response.blob();
                audioQueueRef.current?.enqueue(requestId, chunkId, audioBlob);
                return;
            }

            const chunks = [];
            while (true) {
                const { done, value } = await streamReader.read();
                if (done) break;
                chunks.push(value);
                if (requestId !== activeRequestIdRef.current) {
                    return;
                }
            }

            const audioBlob = new Blob(chunks, { type: "audio/mpeg" });
            audioQueueRef.current?.enqueue(requestId, chunkId, audioBlob);
        } catch (err) {
            if (err.name === "AbortError") {
            } else {
                if (attempt < MAX_TTS_RETRIES && requestId === activeRequestIdRef.current) {
                    const delay = getRetryDelay(attempt);
                    console.warn(
                        `⚠️ TTS fetch error for chunk ${chunkId}, retrying in ${delay}ms (attempt ${attempt + 1
                        }/${MAX_TTS_RETRIES})`,
                        err
                    );
                    await sleep(delay);
                    if (requestId !== activeRequestIdRef.current) return;
                    return fetchTTSAudio(text, requestId, chunkId, attempt + 1);
                }

                console.error(`❌ TTS fetch error:`, err);
                audioQueueRef.current?.markChunkFailed(requestId, chunkId);
            }
        } finally {
            ttsAbortControllersRef.current.delete(abortController);
        }
    }, []);

    /**
     * Initialize TTS for a new request
     */
    const initializeTTS = useCallback(
        (requestId, callbacks = {}) => {
            console.log(`🎵 Initializing TTS for request ${requestId}`);

            const queue = ensureAudioQueue();
            queue.setActiveRequest(requestId);
            activeRequestIdRef.current = requestId;
            currentChunkIdRef.current = 0;

            // Setup callbacks
            if (callbacks.onPlaybackStart) {
                queue.onPlaybackStart = callbacks.onPlaybackStart;
            }
            if (callbacks.onPlaybackComplete) {
                queue.onPlaybackComplete = callbacks.onPlaybackComplete;
            }
            if (callbacks.onAutoplayBlocked) {
                queue.onAutoplayBlocked = callbacks.onAutoplayBlocked;
            }

            // Initialize text chunker
            textChunkerRef.current = new TextChunker((chunk) => {
                const chunkId = currentChunkIdRef.current++;
                const normalizedChunk = normalizePronunciationMarkers(chunk);
                console.log(
                    `🗣️ TTS text [req:${requestId}, chunk:${chunkId}]: "${normalizedChunk.substring(0, 120)}..."`
                );
                fetchTTSAudio(normalizedChunk, requestId, chunkId);
            });
        },
        [ensureAudioQueue, fetchTTSAudio]
    );

    /**
     * Add text to TTS chunker
     */
    const addText = useCallback((text) => {
        textChunkerRef.current?.add(text);
    }, []);

    /**
     * Signal end of text stream
     */
    const endTextStream = useCallback(() => {
        textChunkerRef.current?.end();
    }, []);

    /**
     * Stop all TTS and abort pending requests
     */
    const stopAll = useCallback(() => {
        // Increment request ID to invalidate ongoing TTS
        activeRequestIdRef.current += 1;

        // Stop audio queue
        audioQueueRef.current?.stopAll();

        // Abort all in-flight requests
        for (const controller of ttsAbortControllersRef.current) {
            controller.abort();
        }
        ttsAbortControllersRef.current.clear();

        // Reset text chunker
        textChunkerRef.current?.reset();
    }, []);

    /**
     * Prime audio for Safari autoplay
     */
    const primeAudio = useCallback(async () => {
        const queue = ensureAudioQueue();
        await queue.prime();
    }, [ensureAudioQueue]);

    /**
     * Drain audio queue (for retry after unlock)
     */
    const drainQueue = useCallback(() => {
        audioQueueRef.current?.drainQueue();
    }, []);

    /**
     * Check if audio is playing
     */
    const isPlaying = useCallback(() => {
        return audioQueueRef.current?.isPlaying() ?? false;
    }, []);

    /**
     * Get queue size
     */
    const getQueueSize = useCallback(() => {
        return audioQueueRef.current?.getQueueSize() ?? 0;
    }, []);

    /**
     * Full cleanup
     */
    const cleanup = useCallback(() => {
        stopAll();
        textChunkerRef.current = null;
        audioQueueRef.current?.cleanup();
    }, [stopAll]);

    return {
        initializeTTS,
        addText,
        endTextStream,
        stopAll,
        primeAudio,
        drainQueue,
        isPlaying,
        getQueueSize,
        cleanup,
        setProvider,
    };
}
