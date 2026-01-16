"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useVoiceActivityDetection } from "./useVoiceActivityDetection";
import { useTTS } from "./useTTS";
import { useSTT } from "./useSTT";
import { useN8nStream } from "./useN8nStream";
import { useConversation } from "./useConversation";
import { useVoiceInterruption } from "./useVoiceInterruption";
import { getBreathingScale } from "@/lib/audioLevel";
import { stripPronunciationMarkers } from "@/lib/pronunciation";
import { resumeAudioContext } from "@/lib/audioContext";

/**
 * Main orchestration hook for voice mode
 * Combines all voice-related hooks and manages state machine
 */
export function useVoiceMode() {
    // State
    const [status, setStatus] = useState("idle"); // idle, listening, thinking, speaking, error
    const [processingStage, setProcessingStage] = useState(""); // transcribing, generating
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState(null);
    const [currentAssistantText, setCurrentAssistantText] = useState("");
    const [userTranscript, setUserTranscript] = useState("");
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
        console.log("🛑 Interruption detected!");

        activeTurnIdRef.current += 1;
        tts.stopAll();
        // n8n abort needs cleanup (handled in streamQuery cancellation if new request comes or explicit abort)
        n8nStream.abort();

        assistantTextBufferRef.current = "";
        ttsMarkerBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        setCurrentAssistantText("");
        setProcessingStage("");
        setStatus("listening");

        // We don't call startListening here because interruption usually happens 
        // while user is speaking, so we want to CAPTURE that speech.
        // However, recorder might be off if we were "speaking". 
        // Usually "speaking" state implies we stopped recording to play audio?
        // Wait, let's check legacy logic.
        // Legacy: tts.stopAll() -> setStatus("listening") -> startListening()
        startListening();
    }, [tts, n8nStream]); // Added startListening dependency below to avoid circularity issues if defined later? No, hoisting works.

    // Interruption Hook
    const { setupSpeakingInterruptDetection, cleanupSpeakingInterruptDetection } =
        useVoiceInterruption(vad, recorder.streamRef.current, statusRef, handleInterruption);

    // Update interrupt detection when stream changes or status changes to speaking
    useEffect(() => {
        if (status === 'speaking' || status === 'thinking') {
            setupSpeakingInterruptDetection();
        } else {
            cleanupSpeakingInterruptDetection();
        }
    }, [status, recorder.streamRef, setupSpeakingInterruptDetection, cleanupSpeakingInterruptDetection]);


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
     * Manual interruption trigger (UI button)
     */
    const interruptSpeaking = useCallback(() => {
        if (statusRef.current !== "speaking") return;
        handleInterruption();
    }, [handleInterruption]);

    /**
     * Start listening
     */
    const startListening = useCallback(async () => {
        try {
            vad.resetSpeechDetection();
            await vad.resumeAudioContext(); // Use shared context resume

            const stream = await recorder.startRecording(
                null, // onDataAvailable
                processRecording // onStop
            );

            if (stream) {
                vad.startVAD(stream, {
                    onVolumeChange: setVolume,
                    onSilenceDetected: () => {
                        if (recorder.getAudioChunks().length > 0) {
                            recorder.stopRecording();
                        }
                    },
                    shouldCheck: () => statusRef.current === "listening",
                });
            }
        } catch (err) {
            console.error("Error starting listening:", err);
            setError("Could not access microphone. Please grant permission.");
            setStatus("error");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recorder, vad]);

    /**
     * Stop listening
     */
    const stopListening = useCallback(() => {
        vad.stopVAD();
        recorder.stopRecording();
    }, [vad, recorder]);

    /**
     * Process recording
     */
    const processRecording = useCallback(
        async (audioBlob) => {
            // OPTIMIZATION: Check for speech before processing
            if (!vad.hasSpeechDetected()) {
                setStatus("listening");

                // OPTIMIZATION: Prevent tight loop if environment is noisy but below speech threshold
                // or if just silence caused a stop.
                // Add a small delay
                setTimeout(() => {
                    if (statusRef.current === "listening") {
                        startListening();
                    }
                }, 300);
                return;
            }

            setStatus("thinking");
            setProcessingStage("transcribing");
            setUserTranscript("Transcribing...");

            try {
                const result = await stt.transcribe(audioBlob);

                if (result.filtered || result.text.length === 0) {
                    setStatus("listening");
                    setProcessingStage("");
                    setUserTranscript("");
                    await startListening();
                    return;
                }

                setUserTranscript(result.text);
                const newMessage = conversation.addUserMessage(result.text);

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
                    startListening();
                }, 3000);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stt, vad, conversation]
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
                    // Interruption hook effect picks this up via status dependency
                },
                onPlaybackComplete: () => {
                    if (
                        statusRef.current === "speaking" &&
                        activeTurnIdRef.current === myTurn
                    ) {
                        setStatus("listening");
                        startListening();
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
                    startListening();
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
        setUserTranscript("");
        setProcessingStage("");
        setVolume(0);

        const hasAudioToPlay = tts.isPlaying() || tts.getQueueSize() > 0;

        if (!hasAudioToPlay) {
            if (myTurn && activeTurnIdRef.current !== myTurn) return;
            setStatus("listening");
            await startListening();
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
            completedTurnsRef.current.clear();

            // Ensure TTS provider is set
            tts.setProvider(ttsProvider);

            await unlockSafariAudio();
            await tts.primeAudio();
            setNeedsAudioUnlock(false);

            conversation.clearMessages();
            setCurrentAssistantText("");
            setUserTranscript("Listening... Just speak naturally!");

            await startListening();
        } catch (err) {
            console.error("Error starting voice mode:", err);
            setError(`Error: ${err.message}`);
            setStatus("error");
            setNeedsAudioUnlock(true);
        }
    }, [unlockSafariAudio, tts, startListening, ttsProvider, conversation]);

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
                await startListening();
            } else {
                tts.drainQueue();
            }
        } catch (err) {
            console.error("Retry audio unlock failed:", err);
            setError("Please tap Allow Audio to continue.");
        }
    }, [tts, vad, startListening]);

    /**
     * Stop/cleanup
     */
    const handleStop = useCallback(() => {
        if (status === "listening" && recorder.isRecording()) {
            stopListening();
            return;
        }
        setStatus("idle");
        cleanup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, recorder, stopListening]);

    /**
     * Full cleanup
     */
    const cleanup = useCallback(() => {
        vad.cleanup();
        recorder.cleanup();
        tts.cleanup();
        n8nStream.cleanup();
        cleanupSpeakingInterruptDetection();
        assistantTextBufferRef.current = "";
        ttsMarkerBufferRef.current = "";
        pendingTextUpdateRef.current = false;
    }, [vad, recorder, tts, n8nStream, cleanupSpeakingInterruptDetection]);

    return {
        // State
        status,
        processingStage,
        volume,
        error,
        messages: conversation.messages,
        currentAssistantText,
        userTranscript,
        needsAudioUnlock,
        ttsProvider,
        setTtsProvider,

        // Actions
        startVoiceMode,
        handleStop,
        handleAudioUnlockRetry,
        interruptSpeaking,

        // Computed
        isActive: status !== "idle" && status !== "error",
    };
}
