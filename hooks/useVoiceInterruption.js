"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * Hook to detect if user is interrupting (speaking while agent is speaking)
 */
export function useVoiceInterruption(vad, stream, status, onInterrupt) {
    const speakingInterruptCheckRef = useRef(null);

    /**
     * Cleanup interruption detection
     */
    const cleanupSpeakingInterruptDetection = useCallback(() => {
        if (speakingInterruptCheckRef.current) {
            clearInterval(speakingInterruptCheckRef.current);
            speakingInterruptCheckRef.current = null;
        }
    }, []);

    /**
     * Setup speaking interrupt detection
     */
    const setupSpeakingInterruptDetection = useCallback(() => {
        cleanupSpeakingInterruptDetection();

        // Ensure audio context is live before arming detection
        vad.resumeAudioContext().catch((err) => {
            console.warn(
                "⚠️ Could not resume audio context for interruption detection:",
                err
            );
        });

        if (!stream) {
            // Stream might be null if recording stopped, but we need it for interruption
            // We'll rely on VAD's handling or just skip if no stream available
            return;
        }

        const analyser = vad.getAnalyser(stream);
        if (!analyser) return;

        let highVolumeStart = null;
        let ambientRms = vad.calculateVolume(analyser); // Initial ambient
        const INTERRUPT_DURATION = 125;
        const AMBIENT_SMOOTHING = 0.12;

        // Only run if status permits (speaking/thinking)
        // The checking logic inside interval also confirms status, but we only arm if speaking usually
        console.log("🎧 Arming speaking interruption detection");

        speakingInterruptCheckRef.current = setInterval(() => {
            // Double check status inside interval in case it changed rapidly
            const currentStatus = status.current || status; // Handle both ref and value if passed
            const VALID_STATUSES = new Set(["thinking", "speaking"]);

            // If passing a value, we trust the effect cleanup. If passing a ref, we allow dynamic checking.
            // Ideally, this hook checks a ref passed in OR restarts on status change.
            // For this implementation, we assume the parent manages mount/unmount or we check a ref.

            // Since we can't easily access the latest 'status' state inside interval without a ref, 
            // we'll rely on the parent (useVoiceMode) calling 'stop/cleanup' when status changes away from speaking.
            // BUT, let's make it robust:

            const rms = vad.calculateVolume(analyser);
            ambientRms =
                ambientRms === 0
                    ? rms
                    : ambientRms * (1 - AMBIENT_SMOOTHING) + rms * AMBIENT_SMOOTHING;
            const dynamicThreshold = Math.max(ambientRms + 0.02, 0.025);

            if (rms > dynamicThreshold) {
                if (!highVolumeStart) highVolumeStart = Date.now();
                if (Date.now() - highVolumeStart >= INTERRUPT_DURATION) {
                    console.log("🎤 User speaking detected - interrupting!");
                    cleanupSpeakingInterruptDetection();
                    onInterrupt();
                }
            } else {
                highVolumeStart = null;
            }
        }, 50);
    }, [vad, stream, status, onInterrupt, cleanupSpeakingInterruptDetection]);

    // Clean up on unmount
    useEffect(() => {
        return () => cleanupSpeakingInterruptDetection();
    }, [cleanupSpeakingInterruptDetection]);

    return {
        setupSpeakingInterruptDetection,
        cleanupSpeakingInterruptDetection,
    };
}
