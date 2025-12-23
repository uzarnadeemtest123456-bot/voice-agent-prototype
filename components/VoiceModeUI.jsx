"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { getBreathingScale } from "@/lib/audioLevel";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useAssistantStream } from "@/hooks/useAssistantStream";
import { useTTSPlayer } from "@/hooks/useTTSPlayer";

export default function VoiceModeUI() {
  // Main status state
  const [status, setStatus] = useState("idle"); // idle, listening, thinking, speaking, error
  const [messages, setMessages] = useState([]);
  const [displayVolume, setDisplayVolume] = useState(0);
  const [displayError, setDisplayError] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesRef = useRef([]);
  const lastProcessedTextLengthRef = useRef(0); // FIX: Track processed text to avoid redundancy
  const streamFlushedRef = useRef(false); // FIX: Track if stream has been flushed to prevent post-flush processing

  // Custom hooks for modular functionality
  const audioRecorder = useAudioRecorder();
  const assistantStream = useAssistantStream();
  const ttsPlayer = useTTSPlayer();

  // Sync messages to ref
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, assistantStream.assistantText]);

  // Handle audio recorder status changes
  useEffect(() => {
    if (audioRecorder.status === "listening") {
      setStatus("listening");
    } else if (audioRecorder.status === "transcribing") {
      setStatus("thinking");
    }
  }, [audioRecorder.status]);

  // OPTIMIZATION: Switch to "speaking" status when first text arrives from n8n
  useEffect(() => {
    if (assistantStream.assistantText && assistantStream.assistantText.length > 0 && status === "thinking") {
      setStatus("speaking");
    }
  }, [assistantStream.assistantText, status]);

  // Handle recorder volume for visualization
  useEffect(() => {
    if (audioRecorder.status === "listening") {
      setDisplayVolume(audioRecorder.volume);
    }
  }, [audioRecorder.volume, audioRecorder.status]);

  // Handle TTS volume for visualization
  useEffect(() => {
    if (ttsPlayer.speaking) {
      setDisplayVolume(ttsPlayer.volume);
    }
  }, [ttsPlayer.volume, ttsPlayer.speaking]);

  // Handle errors
  useEffect(() => {
    if (audioRecorder.error) {
      setDisplayError(audioRecorder.error);
      setStatus("error");
    } else if (assistantStream.error) {
      setDisplayError(assistantStream.error);
      setStatus("error");
    }
  }, [audioRecorder.error, assistantStream.error]);

  // Breathing animation for idle state
  useEffect(() => {
    if (status === "idle") {
      let animationId;
      const animate = () => {
        const scale = getBreathingScale(Date.now());
        setDisplayVolume(scale - 1);
        animationId = requestAnimationFrame(animate);
      };
      animate();
      return () => cancelAnimationFrame(animationId);
    }
  }, [status]);

  // Process streaming text for TTS
  // NOTE: We pass the full accumulated text to speakStreaming, but the internal
  // spokenUpToIndexRef tracks what has already been spoken to avoid duplication.
  // This allows the segmentation logic to see the full context when extracting segments.
  useEffect(() => {
    if (status === "speaking" && assistantStream.assistantText && !streamFlushedRef.current) {
      const currentLength = assistantStream.assistantText.length;
      const lastProcessedLength = lastProcessedTextLengthRef.current;
      
      // Only process if there's new text AND we haven't flushed yet
      if (currentLength > lastProcessedLength) {
        console.log(`📝 [UI] New text arrived: ${currentLength - lastProcessedLength} chars (total: ${currentLength})`);
        console.log("ASSISTANT TEXT >>>", JSON.stringify(assistantStream.assistantText.substring(0, 200)));
        // Pass full text - internal index tracking prevents re-speaking
        ttsPlayer.speakStreaming(assistantStream.assistantText);
        lastProcessedTextLengthRef.current = currentLength;
      }
    } else if (streamFlushedRef.current && assistantStream.assistantText) {
      const currentLength = assistantStream.assistantText.length;
      const lastProcessedLength = lastProcessedTextLengthRef.current;
      if (currentLength > lastProcessedLength) {
        console.log(`🚫 [UI] Ignoring ${currentLength - lastProcessedLength} chars that arrived after flush (total: ${currentLength})`);
        lastProcessedTextLengthRef.current = currentLength; // Update to prevent repeated logs
      }
    }
  }, [assistantStream.assistantText, status, ttsPlayer]);

  // Handle transcript completion from audio recorder
  useEffect(() => {
    if (audioRecorder.status === "idle" && audioRecorder.transcript && audioRecorder.transcript !== "Listening... Just speak naturally!") {
      // User has finished speaking and transcript is ready
      const transcript = audioRecorder.transcript;
      if (transcript.trim().length > 0 && !transcript.includes("Transcribing")) {
        handleUserQuery(transcript);
      }
    }
  }, [audioRecorder.status, audioRecorder.transcript]);

  async function startVoiceMode() {
    try {
      setDisplayError(null);
      setStatus("listening");
      setMessages([]);
      assistantStream.reset();
      ttsPlayer.reset();

      // Create a temporary audio context and play silence to unlock audio
      // This ensures audio will play later (browsers require user interaction)
      const tempContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = tempContext.createBuffer(1, 1, 22050);
      const source = tempContext.createBufferSource();
      source.buffer = buffer;
      source.connect(tempContext.destination);
      source.start();
      console.log('🔓 Audio context unlocked via user interaction');

      await audioRecorder.startRecording();
    } catch (err) {
      console.error("Error starting voice mode:", err);
      setDisplayError(`Error: ${err.message}`);
      setStatus("error");
    }
  }

  async function handleUserQuery(transcript) {
    setStatus("thinking");
    
    // Add user message
    const currentMessages = messagesRef.current;
    const newMessages = [...currentMessages, { role: "user", text: transcript }];
    setMessages(newMessages);
    messagesRef.current = newMessages;

    // Prepare conversation context
    const messageContext = newMessages.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    try {
      // FIX: Reset text tracking and flush flag for new conversation turn
      lastProcessedTextLengthRef.current = 0;
      streamFlushedRef.current = false;
      
      // Reset TTS for new response
      ttsPlayer.reset();
      
      // OPTIMIZATION: Keep status as "thinking" until first text arrives
      // This prevents premature TTS activation
      
      // Start streaming assistant response
      await assistantStream.startConversation(transcript, messageContext, async (finalText) => {
        // Called when streaming completes - flush any remaining text
        console.log("Assistant stream complete, flushing remaining text");
        streamFlushedRef.current = true; // Mark as flushed to prevent further processing
        ttsPlayer.flushRemaining(finalText);
        await handleAssistantComplete(finalText);
      });

    } catch (err) {
      console.error("Error handling query:", err);
      setDisplayError(`Error: ${err.message}`);
      setStatus("error");
      
      setTimeout(() => {
        setStatus("listening");
        setDisplayError(null);
        audioRecorder.startRecording();
      }, 3000);
    }
  }

  async function handleAssistantComplete(finalText) {
    // Wait for all TTS to complete
    await ttsPlayer.waitForPlaybackComplete();

    // Add final assistant message
    if (finalText) {
      setMessages((prev) => [...prev, { role: "assistant", text: finalText }]);
    }

    // Reset for next turn
    assistantStream.reset();
    setDisplayVolume(0);
    
    // OPTIMIZATION: Reduced from 500ms to 150ms for faster turn-around (saves 350ms!)
    // Short delay to avoid echo pickup while keeping response snappy
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Auto-restart listening for next turn
    setStatus("listening");
    ttsPlayer.resume();
    await audioRecorder.startRecording();
    
    console.log("Ready for next turn");
  }

  function cleanup() {
    audioRecorder.cleanup();
    assistantStream.stopStreaming();
    ttsPlayer.stop();
  }

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const circleScale = 1 + displayVolume * 1.5;

  const getStatusText = () => {
    switch (status) {
      case "idle":
        return "Click Start to begin your conversation";
      case "listening":
        return "Listening... (Auto-detects speech + 0.7s silence)";
      case "thinking":
        return "Processing...";
      case "speaking":
        return "Speaking...";
      case "error":
        return "Error occurred";
      default:
        return "";
    }
  };

  const isActive = status !== "idle" && status !== "error";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-8">
      <div className="w-full max-w-7xl h-[90vh] flex gap-8">
        {/* Left Side - Main Voice Interface */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-white">Voice Mode</h1>
            <p className="text-gray-400">{getStatusText()}</p>
            <p className="text-xs text-gray-500">Universal: Whisper STT + n8n + MiniMax TTS</p>
          </div>

          {/* Error Display */}
          {displayError && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200 text-center max-w-md">
              {displayError}
            </div>
          )}

          {/* Animated Circle */}
          <div className="relative flex items-center justify-center h-96">
            <motion.div
              animate={{
                scale: circleScale,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
              }}
              className="absolute"
            >
              <div
                className="w-64 h-64 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-80"
                style={{
                  filter: `blur(${displayVolume * 20 + 5}px)`,
                  boxShadow: `0 0 ${displayVolume * 100 + 50}px rgba(168, 85, 247, 0.6)`,
                }}
              />
            </motion.div>

            <motion.div
              animate={{
                scale: circleScale * 0.8,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20,
              }}
              className="absolute w-48 h-48 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 opacity-70"
            />

            <div className="absolute w-4 h-4 rounded-full bg-white" />
          </div>

          {/* Control Buttons */}
          <div className="flex gap-4 justify-center">
            {!isActive && (
              <button
                onClick={startVoiceMode}
                disabled={status === "error"}
                className={`px-8 py-4 rounded-full font-semibold text-white transition-all transform hover:scale-105 ${
                  status === "error"
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/50"
                }`}
              >
                Start Conversation
              </button>
            )}
          </div>

          {/* Status Indicator */}
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                isActive
                  ? "bg-green-500 animate-pulse"
                  : status === "error"
                  ? "bg-red-500"
                  : "bg-gray-500"
              }`}
            />
            <span className="text-sm text-gray-400">
              {isActive ? "Active" : status === "error" ? "Error" : "Offline"}
            </span>
          </div>

          {/* Instructions */}
          {status === "idle" && (
            <div className="text-center text-sm text-gray-500 space-y-2">
              <p className="text-base font-semibold text-gray-300">Click Start and speak naturally!</p>
              <p className="text-sm text-green-400">✓ Auto-detects when you stop speaking (0.7s silence)</p>
              <p className="text-xs text-gray-400">No need to press any button - just stop talking!</p>
              <p className="text-xs mt-2 text-gray-600">Whisper STT + MiniMax TTS + n8n Intelligence</p>
            </div>
          )}
        </div>

        {/* Right Side - Conversation Transcript */}
        {isActive && (
          <div className="w-96 bg-gray-800/50 backdrop-blur rounded-2xl p-6 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">Conversation</h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {messages.length === 0 && !assistantStream.assistantText && (
                <div className="text-center text-gray-500 text-sm mt-8">
                  Your conversation will appear here...
                </div>
              )}

              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                        : "bg-gray-700 text-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold opacity-70">
                        {msg.role === "user" ? "You" : "Assistant"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                  </div>
                </motion.div>
              ))}

              {assistantStream.assistantText && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-700 text-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold opacity-70">Assistant</span>
                      <div className="flex gap-1">
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></span>
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></span>
                        <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></span>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{assistantStream.assistantText}</p>
                  </div>
                </motion.div>
              )}

              {status === "thinking" && !assistantStream.assistantText && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-700 text-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></span>
                      </div>
                      <span className="text-sm font-medium">Processing...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #a855f7, #ec4899);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #9333ea, #db2777);
        }

        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #a855f7 rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
