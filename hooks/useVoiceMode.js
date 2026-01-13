"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { useVoiceActivityDetection } from "./useVoiceActivityDetection";
import { useTTS } from "./useTTS";
import { useSTT } from "./useSTT";
import { useN8nStream } from "./useN8nStream";
import { getBreathingScale } from "@/lib/audioLevel";

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
    const [messages, setMessages] = useState([]);
    const [currentAssistantText, setCurrentAssistantText] = useState("");
    const [userTranscript, setUserTranscript] = useState("");
    const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
    const [ttsProvider, setTtsProvider] = useState("elevenlabs");

    // Refs for state sync
    const statusRef = useRef("idle");
    const messagesRef = useRef([]);
    const processingStageRef = useRef("");
    const assistantTextBufferRef = useRef("");
    const activeTurnIdRef = useRef(0);
    const pendingTextUpdateRef = useRef(false);
    const completedTurnsRef = useRef(new Set());
    const audioContextUnlockRef = useRef(false);
    const speakingInterruptCheckRef = useRef(null);

    // Hooks
    const recorder = useAudioRecorder();
    const vad = useVoiceActivityDetection();
    const tts = useTTS();
    const stt = useSTT();
    const n8nStream = useN8nStream();

    // Sync state to refs
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        processingStageRef.current = processingStage;
    }, [processingStage]);

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

    /**
     * Unlock Safari audio
     */
    const unlockSafariAudio = useCallback(async () => {
        if (audioContextUnlockRef.current) return;

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
            await new Promise((resolve) => setTimeout(resolve, 10));
            await ctx.close();
            audioContextUnlockRef.current = true;
            console.log("✅ Safari audio unlocked");
        } catch (err) {
            console.log("⚠️ AudioContext unlock attempt:", err.message);
            audioContextUnlockRef.current = true;
        }
    }, []);

    /**
     * Setup speaking interrupt detection
     */
    const setupSpeakingInterruptDetection = useCallback(() => {
        cleanupSpeakingInterruptDetection();

        // Ensure audio context is live before arming detection
        vad.resumeAudioContext().catch((err) => {
            console.warn("⚠️ Could not resume audio context for interruption detection:", err);
        });

        if (!recorder.streamRef.current) {
            console.warn("⚠️ No mic stream available for interruption detection");
            return;
        }

        const analyser = vad.getAnalyser(recorder.streamRef.current);
        if (!analyser) return;

        let highVolumeStart = null;
        let ambientRms = vad.calculateVolume(analyser);
        const INTERRUPT_DURATION = 100;
        const AMBIENT_SMOOTHING = 0.12;
        const VALID_STATUSES = new Set(["thinking", "speaking"]);

        console.log("🎧 Arming speaking interruption detection");

        speakingInterruptCheckRef.current = setInterval(() => {
            if (!VALID_STATUSES.has(statusRef.current)) return;

            const rms = vad.calculateVolume(analyser);
            ambientRms = ambientRms === 0 ? rms : ambientRms * (1 - AMBIENT_SMOOTHING) + rms * AMBIENT_SMOOTHING;
            const dynamicThreshold = Math.max(ambientRms + 0.01, 0.015);

            if (rms > dynamicThreshold) {
                if (!highVolumeStart) highVolumeStart = Date.now();
                if (Date.now() - highVolumeStart >= INTERRUPT_DURATION) {
                    console.log("🎤 User speaking detected - interrupting!");
                    cleanupSpeakingInterruptDetection();
                    handleInterruption();
                }
            } else {
                highVolumeStart = null;
            }
        }, 50);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vad, recorder.streamRef]);

    /**
     * Cleanup speaking interrupt detection
     */
    const cleanupSpeakingInterruptDetection = useCallback(() => {
        if (speakingInterruptCheckRef.current) {
            clearInterval(speakingInterruptCheckRef.current);
            speakingInterruptCheckRef.current = null;
            console.log("🛑 Speaking interruption detection cleared");
        }
    }, []);

    /**
     * Handle interruption
     */
    const handleInterruption = useCallback(() => {
        console.log("🛑 Interruption detected!");

        activeTurnIdRef.current += 1;
        tts.stopAll();
        cleanupSpeakingInterruptDetection();
        n8nStream.abort();

        assistantTextBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        setCurrentAssistantText("");
        setProcessingStage("");
        setStatus("listening");
        startListening();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tts, n8nStream, cleanupSpeakingInterruptDetection]);

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
            await vad.resumeAudioContext();

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
    const processRecording = useCallback(async (audioBlob) => {
        console.log(`📝 Processing recording: ${audioBlob.size} bytes`);

        if (!vad.hasSpeechDetected()) {
            console.log("⚠️ No clear speech detected");
            setStatus("listening");
            await startListening();
            return;
        }

        setStatus("thinking");
        setProcessingStage("transcribing");
        setUserTranscript("Transcribing...");

        try {
            const result = await stt.transcribe(audioBlob);

            if (result.filtered || result.text.length === 0) {
                console.log("⚠️ Empty or filtered transcript");
                setStatus("listening");
                setProcessingStage("");
                setUserTranscript("");
                await startListening();
                return;
            }

            setUserTranscript(result.text);
            const newMessages = [...messagesRef.current, { role: "user", text: result.text }];
            setMessages(newMessages);
            messagesRef.current = newMessages;

            setProcessingStage("generating");
            await handleUserQuery(result.text, newMessages);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stt, vad]);

    /**
     * Handle user query
     */
    const handleUserQuery = useCallback(async (query, currentMessages) => {
        activeTurnIdRef.current += 1;
        const myTurn = activeTurnIdRef.current;
        completedTurnsRef.current.delete(myTurn);

        setStatus("thinking");
        setCurrentAssistantText("");
        assistantTextBufferRef.current = "";

        // Initialize TTS
        tts.initializeTTS(myTurn, {
            onPlaybackStart: () => {
                console.log("🔊 Audio playback started");
                setStatus("speaking");
                if (!speakingInterruptCheckRef.current) {
                    setupSpeakingInterruptDetection();
                }
            },
            onPlaybackComplete: () => {
                console.log("✅ All audio playback complete");
                cleanupSpeakingInterruptDetection();
                if (statusRef.current === "speaking" && activeTurnIdRef.current === myTurn) {
                    setStatus("listening");
                    startListening();
                }
            },
            onAutoplayBlocked: () => {
                console.warn("⚠️ Autoplay blocked");
                setNeedsAudioUnlock(true);
            },
        });

        // Arm interruption detection as soon as STT is done so barge-in works before audio starts
        setupSpeakingInterruptDetection();

        // Prepare message context
        const messageContext = currentMessages.slice(-10).map((msg) => ({
            role: msg.role,
            content: msg.text,
        }));

        try {
            await n8nStream.streamQuery(query, messageContext, {
                onTextChunk: (text) => {
                    if (processingStageRef.current) {
                        setProcessingStage("");
                    }
                    assistantTextBufferRef.current += text;
                    tts.addText(text);

                    if (!pendingTextUpdateRef.current) {
                        pendingTextUpdateRef.current = true;
                        requestAnimationFrame(() => {
                            setCurrentAssistantText(assistantTextBufferRef.current);
                            pendingTextUpdateRef.current = false;
                        });
                    }
                },
                onComplete: async () => {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tts, n8nStream, setupSpeakingInterruptDetection, cleanupSpeakingInterruptDetection]);

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
            setMessages((prev) => [...prev, { role: "assistant", text: fullText }]);
        }

        assistantTextBufferRef.current = "";
        pendingTextUpdateRef.current = false;
        setCurrentAssistantText("");
        setUserTranscript("");
        setProcessingStage("");
        setVolume(0);

        const hasAudioToPlay = tts.isPlaying() || tts.getQueueSize() > 0;

        if (!hasAudioToPlay) {
            console.log("✅ No audio to play, returning to listening");
            if (myTurn && activeTurnIdRef.current !== myTurn) return;
            setStatus("listening");
            await startListening();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tts]);

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

            setMessages([]);
            setCurrentAssistantText("");
            setUserTranscript("Listening... Just speak naturally!");

            await startListening();
        } catch (err) {
            console.error("Error starting voice mode:", err);
            setError(`Error: ${err.message}`);
            setStatus("error");
            setNeedsAudioUnlock(true);
        }
    }, [unlockSafariAudio, tts, startListening, ttsProvider]);

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
        pendingTextUpdateRef.current = false;
    }, [vad, recorder, tts, n8nStream, cleanupSpeakingInterruptDetection]);

    return {
        // State
        status,
        processingStage,
        volume,
        error,
        messages,
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
