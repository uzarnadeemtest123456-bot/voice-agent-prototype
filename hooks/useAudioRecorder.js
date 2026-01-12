"use client";

import { useRef, useCallback } from "react";

/**
 * Custom hook for managing audio recording with cross-browser support
 * Handles microphone access, MediaRecorder, and audio chunk collection
 */
export function useAudioRecorder() {
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const isStartingRef = useRef(false);

    /**
     * Get or create microphone stream with echo cancellation
     */
    const getStream = useCallback(async () => {
        // Reuse existing stream if available
        if (streamRef.current?.active) {
            return streamRef.current;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        streamRef.current = stream;
        return stream;
    }, []);

    /**
     * Detect best supported MIME type for MediaRecorder
     */
    const detectMimeType = useCallback(() => {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
            return "audio/webm;codecs=opus";
        if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
        if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
        return null;
    }, []);

    /**
     * Start recording audio
     * @param {Function} onDataAvailable - Called when audio chunks are available
     * @param {Function} onStop - Called when recording stops
     * @returns {Promise<MediaStream>} The audio stream
     */
    const startRecording = useCallback(
        async (onDataAvailable, onStop) => {
            // Prevent double starts
            if (isStartingRef.current) {
                console.log("⚠️ Already starting recording, skipping");
                return null;
            }

            if (mediaRecorderRef.current?.state === "recording") {
                console.log("⚠️ Already recording, skipping");
                return streamRef.current;
            }

            isStartingRef.current = true;

            try {
                const stream = await getStream();
                audioChunksRef.current = [];

                // Create MediaRecorder with best MIME type
                const mimeType = detectMimeType();
                let mediaRecorder;

                try {
                    mediaRecorder = mimeType
                        ? new MediaRecorder(stream, { mimeType })
                        : new MediaRecorder(stream);
                } catch {
                    mediaRecorder = new MediaRecorder(stream);
                }

                mediaRecorderRef.current = mediaRecorder;

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                        onDataAvailable?.(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    if (audioChunksRef.current.length > 0) {
                        const audioBlob = new Blob(audioChunksRef.current, {
                            type: audioChunksRef.current[0]?.type || "audio/webm",
                        });
                        onStop?.(audioBlob);
                    }
                };

                mediaRecorder.start(100); // Collect data every 100ms
                console.log("🎙️ Recording started");

                return stream;
            } finally {
                isStartingRef.current = false;
            }
        },
        [getStream, detectMimeType]
    );

    /**
     * Stop recording (keeps stream alive for barge-in)
     */
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    /**
     * Get current audio chunks
     */
    const getAudioChunks = useCallback(() => {
        return audioChunksRef.current;
    }, []);

    /**
     * Clear audio chunks
     */
    const clearChunks = useCallback(() => {
        audioChunksRef.current = [];
    }, []);

    /**
     * Full cleanup - stops stream tracks
     */
    const cleanup = useCallback(() => {
        stopRecording();

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, [stopRecording]);

    /**
     * Check if currently recording
     */
    const isRecording = useCallback(() => {
        return mediaRecorderRef.current?.state === "recording";
    }, []);

    return {
        startRecording,
        stopRecording,
        getAudioChunks,
        clearChunks,
        cleanup,
        isRecording,
        streamRef,
    };
}
