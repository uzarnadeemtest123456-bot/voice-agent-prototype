"use client";

import { useRef, useCallback } from "react";

/**
 * Custom hook for Voice Activity Detection using Web Audio API
 * Detects silence and speech thresholds to auto-stop recording
 */
export function useVoiceActivityDetection() {
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micSourceRef = useRef(null);
    const micAnalyserConnectedRef = useRef(false);
    const volumeCheckIntervalRef = useRef(null);
    const silenceStartRef = useRef(null);
    const hasSpeechDetectedRef = useRef(false);

    // Thresholds
    const SILENCE_THRESHOLD = 0.01;
    const SPEECH_THRESHOLD = 0.03;
    const SILENCE_DURATION_MS = 1500;

    /**
     * Ensure analyser is connected to stream
     */
    const ensureAnalyser = useCallback((stream) => {
        if (!stream?.active) return null;

        // Create or reuse AudioContext
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            micAnalyserConnectedRef.current = false;
        }

        // Resume if needed
        if (audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume().catch((err) => {
                console.warn("Could not resume audio context:", err);
            });
        }

        // Create analyser
        if (!analyserRef.current) {
            const analyser = audioContextRef.current.createAnalyser();
            analyser.fftSize = 2048;
            analyserRef.current = analyser;
            micAnalyserConnectedRef.current = false;
        }

        // Connect mic source
        if (!micSourceRef.current || micSourceRef.current.mediaStream !== stream) {
            try {
                micSourceRef.current?.disconnect();
            } catch (err) {
                console.warn("Could not disconnect previous mic source:", err);
            }
            micSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            micAnalyserConnectedRef.current = false;
        }

        // Connect to analyser
        if (!micAnalyserConnectedRef.current && micSourceRef.current && analyserRef.current) {
            micSourceRef.current.connect(analyserRef.current);
            micAnalyserConnectedRef.current = true;
        }

        return analyserRef.current;
    }, []);

    /**
     * Calculate RMS volume from analyser
     */
    const calculateVolume = useCallback((analyser) => {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }

        return Math.sqrt(sum / bufferLength);
    }, []);

    /**
     * Stop VAD monitoring (keeps AudioContext for barge-in)
     * NOTE: Defined before startVAD to avoid hoisting issues
     */
    const stopVAD = useCallback(() => {
        if (volumeCheckIntervalRef.current) {
            clearInterval(volumeCheckIntervalRef.current);
            volumeCheckIntervalRef.current = null;
        }
        silenceStartRef.current = null;
    }, []);

    /**
     * Start VAD monitoring
     * @param {MediaStream} stream - Audio stream to monitor
     * @param {Object} callbacks - { onVolumeChange, onSilenceDetected, shouldCheck }
     */
    const startVAD = useCallback(
        (stream, { onVolumeChange, onSilenceDetected, shouldCheck }) => {
            const analyser = ensureAnalyser(stream);
            if (!analyser) {
                console.warn("No analyser available for VAD");
                return;
            }

            hasSpeechDetectedRef.current = false;
            silenceStartRef.current = null;

            volumeCheckIntervalRef.current = setInterval(() => {
                // Only check when allowed (e.g., when listening)
                if (shouldCheck && !shouldCheck()) return;

                const volume = calculateVolume(analyser);

                // Notify volume change for UI
                onVolumeChange?.(volume * 2); // Amplified for visual effect

                // Track speech detection
                if (volume > SPEECH_THRESHOLD) {
                    hasSpeechDetectedRef.current = true;
                }

                // Check for silence
                if (volume < SILENCE_THRESHOLD) {
                    if (!silenceStartRef.current) {
                        silenceStartRef.current = Date.now();
                    }

                    const silenceDuration = Date.now() - silenceStartRef.current;

                    if (silenceDuration > SILENCE_DURATION_MS && hasSpeechDetectedRef.current) {
                        console.log("🔇 Speech detected + silence for 1.5s, triggering callback");
                        stopVAD();
                        onSilenceDetected?.();
                    }
                } else {
                    silenceStartRef.current = null;
                }
            }, 100);
        },
        [ensureAnalyser, calculateVolume, stopVAD]
    );

    /**
     * Check if speech was detected
     */
    const hasSpeechDetected = useCallback(() => {
        return hasSpeechDetectedRef.current;
    }, []);

    /**
     * Reset speech detection flag
     */
    const resetSpeechDetection = useCallback(() => {
        hasSpeechDetectedRef.current = false;
    }, []);

    /**
     * Full cleanup - closes AudioContext
     */
    const cleanup = useCallback(() => {
        stopVAD();

        if (micSourceRef.current) {
            try {
                micSourceRef.current.disconnect();
            } catch (err) {
                console.warn("Could not disconnect mic source:", err);
            }
            micSourceRef.current = null;
            micAnalyserConnectedRef.current = false;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        analyserRef.current = null;
    }, [stopVAD]);

    /**
     * Get the analyser for external use (e.g., speaking interrupt detection)
     */
    const getAnalyser = useCallback(
        (stream) => {
            return ensureAnalyser(stream);
        },
        [ensureAnalyser]
    );

    /**
     * Resume audio context if suspended
     */
    const resumeAudioContext = useCallback(async () => {
        if (audioContextRef.current?.state === "suspended") {
            await audioContextRef.current.resume();
        }
    }, []);

    return {
        startVAD,
        stopVAD,
        hasSpeechDetected,
        resetSpeechDetection,
        cleanup,
        getAnalyser,
        resumeAudioContext,
        calculateVolume,
    };
}
