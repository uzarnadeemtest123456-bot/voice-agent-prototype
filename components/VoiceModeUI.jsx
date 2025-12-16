"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SSEParser } from "@/lib/sse";
import { getBreathingScale } from "@/lib/audioLevel";
import { QueuedAudioPlayer } from "@/lib/audioPlayer";

export default function VoiceModeUI() {
  // State management
  const [status, setStatus] = useState("idle"); // idle, listening, thinking, speaking, error
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentAssistantText, setCurrentAssistantText] = useState("");
  const [userTranscript, setUserTranscript] = useState("");

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const spokenUpToIndexRef = useRef(0);
  const assistantTextBufferRef = useRef("");
  const isSpeakingRef = useRef(false);
  const statusRef = useRef("idle");
  const streamRef = useRef(null);

  // Sync status to ref
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new QueuedAudioPlayer();
    
    audioPlayerRef.current.onStart = () => {
      isSpeakingRef.current = true;
    };
    
    audioPlayerRef.current.onEnd = () => {
      isSpeakingRef.current = false;
      setVolume(0);
    };

    return () => {
      cleanup();
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAssistantText]);

  // Process TTS for streaming responses
  useEffect(() => {
    if (status === "speaking" && audioPlayerRef.current && spokenUpToIndexRef.current > 0) {
      processNextTTSSegment();
    }
  }, [currentAssistantText, status]);

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

  // Volume animation for speaking state
  useEffect(() => {
    if (status === "speaking" && isSpeakingRef.current) {
      let animationId;
      let phase = 0;
      const animate = () => {
        phase += 0.1;
        const simVolume = Math.abs(Math.sin(phase)) * 0.5 + 0.2;
        setVolume(simVolume);
        animationId = requestAnimationFrame(animate);
      };
      animate();
      return () => cancelAnimationFrame(animationId);
    }
  }, [status, isSpeakingRef.current]);

  async function startListening() {
    try {
      // Request microphone access - works on ALL browsers
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder - works on Firefox, Chrome, Brave, Tor, etc.
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          await processRecording();
        }
      };

      mediaRecorder.start();
      console.log("Recording started (cross-browser support)");

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please grant permission.");
      setStatus("error");
    }
  }

  function stopListening() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }

  async function processRecording() {
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: audioChunksRef.current[0]?.type || 'audio/webm' 
    });
    
    // Must have at least some audio data
    if (audioBlob.size < 1000) {
      console.log("Recording too short, ignoring");
      setStatus("listening");
      await startListening(); // Restart listening
      return;
    }

    setStatus("thinking");
    setUserTranscript("Transcribing...");

    try {
      // Call Whisper API for transcription
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) {
        throw new Error('Transcription failed');
      }

      const sttData = await sttResponse.json();
      const transcript = sttData.text.trim();
      
      console.log("Whisper transcript:", transcript);

      if (transcript.length > 0) {
        setUserTranscript(transcript);
        setMessages((prev) => [...prev, { role: "user", text: transcript }]);
        await handleUserQuery(transcript);
      } else {
        setStatus("listening");
        await startListening();
      }

    } catch (err) {
      console.error("Error processing recording:", err);
      setError(`Error: ${err.message}`);
      setStatus("error");
      
      setTimeout(() => {
        setStatus("listening");
        setError(null);
        startListening();
      }, 3000);
    }
  }

  async function startVoiceMode() {
    try {
      setError(null);
      setStatus("listening");
      setMessages([]);
      setCurrentAssistantText("");
      setUserTranscript("Press Stop when you finish speaking...");

      await startListening();

    } catch (err) {
      console.error("Error starting voice mode:", err);
      setError(`Error: ${err.message}`);
      setStatus("error");
    }
  }

  async function handleUserQuery(query) {
    setStatus("thinking");
    setCurrentAssistantText("");
    assistantTextBufferRef.current = "";
    spokenUpToIndexRef.current = 0;

    try {
      // Step 1: Rephrase/clean the query using OpenAI
      const rephraseResponse = await fetch('/api/rephrase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!rephraseResponse.ok) {
        throw new Error('Query rephrasing failed');
      }

      const rephraseData = await rephraseResponse.json();
      const cleanedQuery = rephraseData.rephrased;
      
      console.log('Rephrased query:', {
        original: query,
        cleaned: cleanedQuery
      });

      // Step 2: Send cleaned query directly to n8n
      await callBrainWebhook(cleanedQuery);

    } catch (err) {
      console.error("Error handling query:", err);
      setError(`Error: ${err.message}`);
      setStatus("error");
      
      setTimeout(() => {
        setStatus("listening");
        setError(null);
        startListening();
      }, 3000);
    }
  }

  async function callBrainWebhook(userText) {
    setStatus("thinking");

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;
      
      if (!webhookUrl) {
        throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
      }

      abortControllerRef.current = new AbortController();

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userText,
          knowledge_model: 23,
          country: "CA"
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`n8n webhook failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("text/event-stream")) {
        await handleSSEStream(response);
      } else {
        await handleStreamingJSON(response);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("n8n request aborted");
        return;
      }
      throw err;
    }
  }

  async function handleSSEStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();

    setStatus("speaking");
    spokenUpToIndexRef.current = 1; // Enable streaming TTS

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parse(chunk);

        for (const event of events) {
          if (event.event === "delta" && event.data?.text) {
            const newText = event.data.text;
            assistantTextBufferRef.current += newText;
            setCurrentAssistantText(assistantTextBufferRef.current);
          } else if (event.event === "done") {
            await finishAssistantResponse();
            return;
          } else if (event.event === "error") {
            throw new Error(event.data?.message || "Stream error");
          }
        }
      }

      await finishAssistantResponse();

    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }

  async function handleStreamingJSON(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    setStatus("speaking");
    spokenUpToIndexRef.current = 1; // Enable streaming TTS

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const jsonObj = JSON.parse(line);
            
            if (jsonObj.type === "item" && jsonObj.content) {
              try {
                const contentObj = JSON.parse(jsonObj.content);
                if (contentObj.output) {
                  console.log("Skipping final wrapped output");
                  continue;
                }
              } catch (e) {
                // Content is regular text
              }
              
              assistantTextBufferRef.current += jsonObj.content;
              setCurrentAssistantText(assistantTextBufferRef.current);
            }
          } catch (parseError) {
            console.error("Error parsing JSON line:", parseError);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const jsonObj = JSON.parse(buffer);
          if (jsonObj.type === "item" && jsonObj.content) {
            assistantTextBufferRef.current += jsonObj.content;
            setCurrentAssistantText(assistantTextBufferRef.current);
          }
        } catch (e) {
          // Ignore
        }
      }

      await finishAssistantResponse();

    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }

  async function finishAssistantResponse() {
    // Wait for all TTS to complete
    await waitForPlaybackComplete();

    // Add final message
    if (assistantTextBufferRef.current) {
      setMessages((prev) => [...prev, { role: "assistant", text: assistantTextBufferRef.current }]);
    }

    setCurrentAssistantText("");
    setUserTranscript("");
    setVolume(0);
    
    // Auto-restart listening for next turn
    setStatus("listening");
    
    if (audioPlayerRef.current) {
      audioPlayerRef.current.resume();
    }
    
    await startListening();
    console.log("Ready for next turn");
  }

  async function waitForPlaybackComplete() {
    while (audioPlayerRef.current.isProcessing || isSpeakingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function processNextTTSSegment() {
    const fullText = assistantTextBufferRef.current;
    const spokenUpTo = spokenUpToIndexRef.current;

    if (spokenUpTo >= fullText.length) {
      return;
    }

    const segment = extractNextSegment(fullText, spokenUpTo);

    if (segment) {
      spokenUpToIndexRef.current += segment.length;
      await audioPlayerRef.current.addToQueue(segment.trim());
      
      // Check if there's more
      if (spokenUpToIndexRef.current < assistantTextBufferRef.current.length) {
        setTimeout(() => processNextTTSSegment(), 50);
      }
    }
  }

  function extractNextSegment(text, startIndex) {
    const remaining = text.substring(startIndex);
    if (remaining.length === 0) return null;

    // For first segment, start speaking quickly
    const isFirstSegment = spokenUpToIndexRef.current === 1;
    
    if (isFirstSegment && remaining.length >= 10) {
      const firstSentenceEnd = remaining.search(/[.!?]\s/);
      if (firstSentenceEnd !== -1 && firstSentenceEnd <= 60) {
        return remaining.substring(0, firstSentenceEnd + 1).trim();
      }
      
      const firstPause = remaining.search(/[,;:]\s/);
      if (firstPause !== -1 && firstPause >= 10 && firstPause <= 50) {
        return remaining.substring(0, firstPause + 1).trim();
      }
      
      if (remaining.length >= 15) {
        const chunk = remaining.substring(0, 20);
        const lastSpace = chunk.lastIndexOf(" ");
        if (lastSpace > 8) {
          return chunk.substring(0, lastSpace).trim();
        }
      }
    }

    // Split by sentence
    const sentenceEnd = remaining.search(/[.!?]\s/);
    if (sentenceEnd !== -1) {
      return remaining.substring(0, sentenceEnd + 1).trim();
    }

    // Split by comma
    const pauseEnd = remaining.search(/[,;:]\s/);
    if (pauseEnd !== -1 && pauseEnd >= 20) {
      return remaining.substring(0, pauseEnd + 1).trim();
    }

    // Word boundaries
    if (remaining.length >= 35) {
      const chunk = remaining.substring(0, 50);
      const lastSpace = chunk.lastIndexOf(" ");
      if (lastSpace > 20) {
        return chunk.substring(0, lastSpace).trim();
      }
      if (remaining.length >= 35) {
        return remaining.substring(0, 35).trim();
      }
    }

    return null;
  }

  function cleanup() {
    stopListening();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
    }

    spokenUpToIndexRef.current = 0;
    assistantTextBufferRef.current = "";
    isSpeakingRef.current = false;
    audioChunksRef.current = [];
  }

  async function handleStop() {
    // If we're currently listening, stop recording and process what we have
    if (status === "listening" && mediaRecorderRef.current) {
      stopListening();
      return;
    }
    
    // Otherwise, fully stop the voice mode
    setStatus("idle");
    cleanup();
  }

  const circleScale = 1 + volume * 1.5;

  const getStatusText = () => {
    switch (status) {
      case "idle":
        return "Click Start to begin your conversation";
      case "listening":
        return "Recording... Click Stop when you finish speaking";
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
            <p className="text-xs text-gray-500">Universal: Whisper STT + OpenAI Cleanup + n8n + ElevenLabs TTS</p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200 text-center max-w-md">
              {error}
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
                  filter: `blur(${volume * 20 + 5}px)`,
                  boxShadow: `0 0 ${volume * 100 + 50}px rgba(168, 85, 247, 0.6)`,
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
            {!isActive ? (
              <button
                onClick={startVoiceMode}
                disabled={status === "error"}
                className={`px-8 py-4 rounded-full font-semibold text-white transition-all transform hover:scale-105 ${
                  status === "error"
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/50"
                }`}
              >
                Start
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="px-8 py-4 rounded-full font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 transition-all transform hover:scale-105 shadow-lg hover:shadow-red-500/50"
              >
                {status === "listening" ? "Stop Speaking" : "Stop"}
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
            <div className="text-center text-sm text-gray-500 space-y-1">
              <p>Click Start, speak your question, then click Stop</p>
              <p className="text-xs">Works on ALL browsers (Chrome, Firefox, Brave, Tor, etc.)</p>
              <p className="text-xs mt-2 text-gray-600">Whisper STT + ElevenLabs TTS + n8n Intelligence</p>
            </div>
          )}
        </div>

        {/* Right Side - Conversation Transcript */}
        {isActive && (
          <div className="w-96 bg-gray-800/50 backdrop-blur rounded-2xl p-6 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">Conversation</h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {messages.length === 0 && !currentAssistantText && (
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

              {currentAssistantText && (
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
                    <p className="text-sm leading-relaxed">{currentAssistantText}</p>
                  </div>
                </motion.div>
              )}

              {status === "thinking" && !currentAssistantText && (
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
