"use client";

import { useCallback } from "react";

/**
 * Custom hook for Speech-to-Text API calls
 * Handles sending audio to Whisper API and processing transcription
 */
export function useSTT() {
    /**
     * Transcribe audio blob using STT API
     * @param {Blob} audioBlob - Audio blob to transcribe
     * @returns {Promise<{text: string, filtered: boolean}>}
     */
    const transcribe = useCallback(async (audioBlob) => {
        // Validate minimum size (10KB for meaningful speech)
        if (audioBlob.size < 10000) {
            console.log("⚠️ Recording too short or low quality");
            return { text: "", filtered: true, reason: "too_short" };
        }

        const formData = new FormData();

        // Choose extension based on actual blob type
        const mime = audioBlob.type || "audio/webm";
        const ext = mime.includes("mp4")
            ? "mp4"
            : mime.includes("mpeg")
                ? "mp3"
                : mime.includes("ogg")
                    ? "ogg"
                    : mime.includes("wav")
                        ? "wav"
                        : "webm";

        formData.append("audio", audioBlob, `recording.${ext}`);

        console.log("🎙️ Sending to STT API...");

        const response = await fetch("/api/stt", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("STT API error:", errorText);
            throw new Error(`Transcription failed: ${response.status}`);
        }

        const data = await response.json();
        const transcript = data.text.trim();

        console.log("📝 Whisper transcript:", transcript);

        return {
            text: transcript,
            filtered: data.filtered || false,
        };
    }, []);

    return {
        transcribe,
    };
}
