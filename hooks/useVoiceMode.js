"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useVoiceActivityDetection } from "./useVoiceActivityDetection";
import { useTTS } from "./useTTS";
import { useSTT } from "./useSTT";
import { useN8nStream } from "./useN8nStream";
import { useConversation } from "./useConversation";
import { getBreathingScale } from "@/lib/audioLevel";
import { stripPronunciationMarkers } from "@/lib/pronunciation";
import { resumeAudioContext } from "@/lib/audioContext";

/**
 * Main orchestration hook for voice mode
 * Combines all voice-related hooks and manages state machine
 */
export function useVoiceMode() {
    // State
    const [status, setStatus] = useState("idle"); // idle, listening, recording, thinking, speaking, error
    const [processingStage, setProcessingStage] = useState(""); // transcribing, generating
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState(null);
    const [currentAssistantText, setCurrentAssistantText] = useState("");
    const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
    const [ttsProvider, setTtsProvider] = useState("elevenlabs");

    // Refs for state sync
    const statusRef = useRef("idle");
    const processingStageRef = useRef("");
    const assistantTextBufferRef = useRef("");
    const ttsMarkerBufferRef = useRef("");
    const activeTurnIdRef = useRef(0);
    const pendingTextUpdateRef = useRef(false);
    const completedTurnsRef = useRef(new Set());
    const audioContextUnlockRef = useRef(false);
    const volumeMonitorRef = useRef(null);
    const speechDurationMsRef = useRef(0);
    const recordingIdRef = useRef(0);
    const activeRecordingIdRef = useRef(0);

    const VOLUME_SAMPLE_INTERVAL_MS = 50;
    const SPEECH_THRESHOLD = 0.02;
    const MIN_SPEECH_MS = 150;

    // Hooks
    const recorder = useAudioRecorder();
    const vad = useVoiceActivityDetection();
    const tts = useTTS();
    const stt = useSTT();
    const n8nStream = useN8nStream();
    const conversation = useConversation();

    // Sync state to refs
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        processingStageRef.current = processingStage;
    }, [processingStage]);

    // Handle interruption logic
    const handleInterruption = useCallback(() => {
        console.log("🛑 Interruption triggered!");

        activeTurnIdRef.current += 1;
        tts.stopAll();
        n8nStream.abort();

        assistantTextBufferRef.current = "";
        ttsMarkerBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        setCurrentAssistantText("");
        setProcessingStage("");
        setStatus("listening");
    }, [tts, n8nStream]);


    // Breathing animation for idle state
    useEffect(() => {
        if (status === "idle") {
            let animationId;
            const animate = () => {
                const scale = getBreathingScale(Date.now());
                setVolume(scale - 1);
                animationId = requestAnimationFrame(animate);
            };
            animate();
            return () => cancelAnimationFrame(animationId);
        }
    }, [status]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopVolumeMonitor = useCallback(() => {
        if (volumeMonitorRef.current) {
            clearInterval(volumeMonitorRef.current);
            volumeMonitorRef.current = null;
        }
        setVolume(0);
    }, []);

    const startVolumeMonitor = useCallback(
        (stream) => {
            if (!stream?.active) return;
            const analyser = vad.getAnalyser(stream);
            if (!analyser) return;

            stopVolumeMonitor();
            speechDurationMsRef.current = 0;

            volumeMonitorRef.current = setInterval(() => {
                if (statusRef.current !== "recording") return;
                const volume = vad.calculateVolume(analyser);
                setVolume(volume * 2);
                if (volume > SPEECH_THRESHOLD) {
                    speechDurationMsRef.current += VOLUME_SAMPLE_INTERVAL_MS;
                }
            }, VOLUME_SAMPLE_INTERVAL_MS);
        },
        [vad, stopVolumeMonitor]
    );

    // Buffer tilde-wrapped markers so chunking never splits a number marker.
    const collectTTSChunk = useCallback((incoming) => {
        if (!incoming) return "";
        let output = "";
        let markerBuffer = ttsMarkerBufferRef.current;
        let inMarker = markerBuffer.length > 0;

        for (let i = 0; i < incoming.length; i++) {
            const ch = incoming[i];
            if (!inMarker) {
                if (ch === "~") {
                    inMarker = true;
                    markerBuffer = "~";
                } else {
                    output += ch;
                }
            } else {
                markerBuffer += ch;
                if (ch === "~") {
                    output += markerBuffer;
                    markerBuffer = "";
                    inMarker = false;
                }
            }
        }

        ttsMarkerBufferRef.current = markerBuffer;
        return output;
    }, []);

    const flushTTSMarkerBuffer = useCallback(() => {
        if (!ttsMarkerBufferRef.current) return;
        const pending = stripPronunciationMarkers(ttsMarkerBufferRef.current);
        ttsMarkerBufferRef.current = "";
        if (pending) {
            tts.addText(pending);
        }
    }, [tts]);

    /**
     * Unlock Safari audio
     */
    const unlockSafariAudio = useCallback(async () => {
        if (audioContextUnlockRef.current) return;
        try {
            await resumeAudioContext();
            audioContextUnlockRef.current = true;
        } catch (err) {
            audioContextUnlockRef.current = true;
        }
    }, []);

    /**
     * Push-to-talk start
     */
    const startPushToTalk = useCallback(async () => {
        if (statusRef.current === "recording") return;
        if (recorder.isRecording()) return;

        try {
            if (statusRef.current === "speaking" || statusRef.current === "thinking") {
                handleInterruption();
            }

            setError(null);
            setProcessingStage("");
            speechDurationMsRef.current = 0;
            const recordingId = recordingIdRef.current + 1;
            recordingIdRef.current = recordingId;
            activeRecordingIdRef.current = recordingId;

            await vad.resumeAudioContext();

            const stream = await recorder.startRecording(
                null,
                (audioBlob) => processRecording(audioBlob, recordingId)
            );

            if (!stream) return;

            startVolumeMonitor(stream);

            setStatus("recording");
        } catch (err) {
            console.error("Error starting recording:", err);
            setError("Could not access microphone. Please grant permission.");
            setStatus("error");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recorder, vad, handleInterruption, startVolumeMonitor]);

    /**
     * Push-to-talk end
     */
    const stopPushToTalk = useCallback(() => {
        if (!recorder.isRecording()) return;
        stopVolumeMonitor();
        recorder.stopRecording();
    }, [recorder, stopVolumeMonitor]);

    /**
     * Process recording
     */
    const processRecording = useCallback(
        async (audioBlob, recordingId) => {
            if (recordingId !== activeRecordingIdRef.current) {
                return;
            }

            stopVolumeMonitor();
            if (!audioBlob) {
                setStatus("listening");
                setProcessingStage("");
                return;
            }
            const speechDurationMs = speechDurationMsRef.current;
            speechDurationMsRef.current = 0;

            if (speechDurationMs < MIN_SPEECH_MS) {
                setStatus("listening");
                setProcessingStage("");
                return;
            }

            setStatus("thinking");
            setProcessingStage("transcribing");

            try {
                const result = await stt.transcribe(audioBlob);

                if (result.filtered || result.text.length === 0) {
                    setStatus("listening");
                    setProcessingStage("");
                    return;
                }

                conversation.addUserMessage(result.text);

                setProcessingStage("generating");
                await handleUserQuery(result.text, conversation.messagesRef.current);
            } catch (err) {
                console.error("Error processing recording:", err);
                setError(`Error: ${err.message}`);
                setStatus("error");
                setProcessingStage("");

                setTimeout(() => {
                    setStatus("listening");
                    setError(null);
                }, 3000);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stt, conversation, stopVolumeMonitor]
    );

    /**
     * Handle user query
     */
    const handleUserQuery = useCallback(
        async (query, currentMessages) => {
            activeTurnIdRef.current += 1;
            const myTurn = activeTurnIdRef.current;
            completedTurnsRef.current.delete(myTurn);

            setStatus("thinking");
            setCurrentAssistantText("");
            assistantTextBufferRef.current = "";
            ttsMarkerBufferRef.current = "";

            // Initialize TTS
            tts.initializeTTS(myTurn, {
                onPlaybackStart: () => {
                    setStatus("speaking");
                },
                onPlaybackComplete: () => {
                    if (
                        statusRef.current === "speaking" &&
                        activeTurnIdRef.current === myTurn
                    ) {
                        setStatus("listening");
                    }
                },
                onAutoplayBlocked: () => {
                    console.warn("⚠️ Autoplay blocked");
                    setNeedsAudioUnlock(true);
                },
            });

            // Prepare message context
            const messageContext = conversation.getRecentContext();

            try {
                await n8nStream.streamQuery(query, messageContext, {
                    onTextChunk: (text) => {
                        if (processingStageRef.current) {
                            setProcessingStage("");
                        }
                        const displayText = stripPronunciationMarkers(text);
                        if (displayText) {
                            console.log(
                                `💬 Client text chunk [req:${myTurn}]: "${displayText.substring(
                                    0,
                                    120
                                )}..."`
                            );
                        }
                        assistantTextBufferRef.current += displayText;
                        const ttsText = collectTTSChunk(text);
                        if (ttsText) {
                            tts.addText(ttsText);
                        }

                        if (!pendingTextUpdateRef.current) {
                            pendingTextUpdateRef.current = true;
                            requestAnimationFrame(() => {
                                setCurrentAssistantText(assistantTextBufferRef.current);
                                pendingTextUpdateRef.current = false;
                            });
                        }
                    },
                    onComplete: async () => {
                        flushTTSMarkerBuffer();
                        tts.endTextStream();
                        await finishAssistantResponse(myTurn);
                    },
                    checkActive: () => activeTurnIdRef.current === myTurn,
                });
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("Error handling query:", err);
                setError(`Error: ${err.message}`);
                setStatus("error");

                setTimeout(() => {
                    setStatus("listening");
                    setError(null);
                }, 3000);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            tts,
            n8nStream,
            collectTTSChunk,
            flushTTSMarkerBuffer,
            conversation
        ]
    );

    /**
     * Finish assistant response
     */
    const finishAssistantResponse = useCallback(async (myTurn) => {
        if (myTurn && activeTurnIdRef.current !== myTurn) return;
        if (myTurn && completedTurnsRef.current.has(myTurn)) return;
        if (myTurn) {
            completedTurnsRef.current.add(myTurn);
        }

        const fullText = assistantTextBufferRef.current.trim();

        if (fullText.length > 0) {
            conversation.addAssistantMessage(fullText);
        }

        assistantTextBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        setCurrentAssistantText("");
        setProcessingStage("");
        setVolume(0);

        const hasAudioToPlay = tts.isPlaying() || tts.getQueueSize() > 0;

        if (!hasAudioToPlay) {
            if (myTurn && activeTurnIdRef.current !== myTurn) return;
            setStatus("listening");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tts, conversation]);

    /**
     * Start voice mode
     */
    const startVoiceMode = useCallback(async () => {
        try {
            setError(null);
            setNeedsAudioUnlock(false);
            setStatus("listening");
            setProcessingStage("");
            completedTurnsRef.current.clear();

            // Ensure TTS provider is set
            tts.setProvider(ttsProvider);

            await unlockSafariAudio();
            await tts.primeAudio();
            setNeedsAudioUnlock(false);

            conversation.clearMessages();
            setCurrentAssistantText("");
        } catch (err) {
            console.error("Error starting voice mode:", err);
            setError(`Error: ${err.message}`);
            setStatus("error");
            setNeedsAudioUnlock(true);
        }
    }, [unlockSafariAudio, tts, ttsProvider, conversation]);

    /**
     * Handle audio unlock retry
     */
    const handleAudioUnlockRetry = useCallback(async () => {
        try {
            await tts.primeAudio();
            await vad.resumeAudioContext();
            setNeedsAudioUnlock(false);

            if (statusRef.current === "idle") {
                setStatus("listening");
            } else {
                tts.drainQueue();
            }
        } catch (err) {
            console.error("Retry audio unlock failed:", err);
            setError("Please tap Allow Audio to continue.");
        }
    }, [tts, vad]);

    /**
     * Full cleanup
     */
    const cleanup = useCallback(() => {
        stopVolumeMonitor();
        vad.cleanup();
        recorder.cleanup();
        tts.cleanup();
        n8nStream.cleanup();
        assistantTextBufferRef.current = "";
        ttsMarkerBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        speechDurationMsRef.current = 0;
    }, [vad, recorder, tts, n8nStream, stopVolumeMonitor]);

    return {
        // State
        status,
        processingStage,
        volume,
        error,
        messages: conversation.messages,
        currentAssistantText,
        needsAudioUnlock,
        ttsProvider,
        setTtsProvider,

        // Actions
        startVoiceMode,
        handleAudioUnlockRetry,
        startPushToTalk,
        stopPushToTalk,

        // Computed
        isActive: status !== "idle" && status !== "error",
        isRecording: status === "recording",
    };
}
