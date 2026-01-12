"use client";

import { useRef, useCallback } from "react";
import { TextChunker } from "@/lib/textChunker";
import { AudioQueue } from "@/lib/audioQueue";

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
    const fetchTTSAudio = useCallback(async (text, requestId, chunkId) => {
        if (requestId !== activeRequestIdRef.current) {
            console.log(`⚠️ Skipping TTS for old request ${requestId}`);
            return;
        }

        const abortController = new AbortController();
        ttsAbortControllersRef.current.add(abortController);

        try {
            console.log(`🎤 Fetching TTS Stream [req:${requestId}, chunk:${chunkId}]...`);

            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, requestId, chunkId }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                console.error(`❌ TTS API error: ${response.status}`);
                audioQueueRef.current?.markChunkFailed(requestId, chunkId);
                return;
            }

            if (requestId !== activeRequestIdRef.current) {
                console.log(`⚠️ Discarding TTS response from old request ${requestId}`);
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
                    console.log(`🚰 Streaming TTS audio [req:${requestId}, chunk:${chunkId}]`);
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
                    console.log(`⚠️ Discarding TTS stream from old request ${requestId}`);
                    return;
                }
            }

            const audioBlob = new Blob(chunks, { type: "audio/mpeg" });
            console.log(`✅ TTS audio complete [req:${requestId}, chunk:${chunkId}]: ${audioBlob.size} bytes`);
            audioQueueRef.current?.enqueue(requestId, chunkId, audioBlob);
        } catch (err) {
            if (err.name === "AbortError") {
                console.log(`⚠️ TTS request aborted [req:${requestId}, chunk:${chunkId}]`);
            } else {
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
                fetchTTSAudio(chunk, requestId, chunkId);
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

    /**
     * Get current active request ID
     */
    const getActiveRequestId = useCallback(() => {
        return activeRequestIdRef.current;
    }, []);

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
        getActiveRequestId,
        ensureAudioQueue,
    };
}
