"use client";

import { useRef, useCallback } from "react";

import { getAudioContext } from "@/lib/audioContext";

/**
 * Audio level helper using Web Audio API
 * Provides analyser access for manual volume checks
 */
export function useVoiceActivityDetection() {
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micSourceRef = useRef(null);
    const micAnalyserConnectedRef = useRef(false);

    /**
     * Ensure analyser is connected to stream
     */
    const ensureAnalyser = useCallback((stream) => {
        if (!stream?.active) return null;

        // Create or reuse AudioContext
        if (!audioContextRef.current || audioContextRef.current.state === "closed") {
            const ctx = getAudioContext();
            if (ctx) {
                audioContextRef.current = ctx;
                micAnalyserConnectedRef.current = false;
            }
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
     * Full cleanup - closes AudioContext
     */
    const cleanup = useCallback(() => {
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
            // Do not close the singleton context! Just release the ref.
            audioContextRef.current = null;
        }

        analyserRef.current = null;
    }, []);

    /**
     * Get the analyser for external use (e.g., volume monitoring)
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
        cleanup,
        getAnalyser,
        resumeAudioContext,
        calculateVolume,
    };
}
