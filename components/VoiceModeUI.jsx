"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SSEParser } from "@/lib/sse";
import { getBreathingScale } from "@/lib/audioLevel";

export default function VoiceModeUI() {
  // State management
  const [status, setStatus] = useState("idle"); // idle, listening, transcribing, thinking, speaking, error
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentAssistantText, setCurrentAssistantText] = useState("");
  const [userTranscript, setUserTranscript] = useState("");

  // Refs
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const messagesEndRef = useRef(null);
  const spokenUpToIndexRef = useRef(0);
  const assistantTextBufferRef = useRef("");
  const processingTTSRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const speechQueueRef = useRef([]);
  const accumulatedTranscriptRef = useRef("");
  const silenceTimerRef = useRef(null);

  // Initialize session ID
  useEffect(() => {
    sessionIdRef.current = generateSessionId();

    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError("Your browser doesn't support speech recognition. Please use Chrome, Edge, or Safari.");
    }

    if (!('speechSynthesis' in window)) {
      setError("Your browser doesn't support speech synthesis.");
    }

    return () => {
      cleanup();
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAssistantText]);

  // Process TTS for new text chunks
  useEffect(() => {
    if (status === "speaking" && !processingTTSRef.current) {
      processNextTTSSegment();
    }
  }, [currentAssistantText, status]);

  // Breathing animation for idle state
  useEffect(() => {
    if (status === "idle") {
      let animationId;
      const animate = () => {
        const scale = getBreathingScale(Date.now());
        setVolume(scale - 1); // Convert to 0-0.1 range
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
        // Simulate speaking volume with sine wave
        phase += 0.1;
        const simVolume = Math.abs(Math.sin(phase)) * 0.5 + 0.2;
        setVolume(simVolume);
        animationId = requestAnimationFrame(animate);
      };
      animate();
      return () => {
        cancelAnimationFrame(animationId);
      };
    }
  }, [status, isSpeakingRef.current]);

  function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async function startListening() {
    try {
      // Initialize Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Detect interruption during speaking
        if (status === "speaking" && (finalTranscript || interimTranscript)) {
          console.log("User interrupted assistant");
          // Stop TTS immediately
          if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          isSpeakingRef.current = false;
          setVolume(0);
          
          // Abort the brain stream
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          
          // Switch to listening mode
          setStatus("listening");
          setCurrentAssistantText("");
          assistantTextBufferRef.current = "";
          spokenUpToIndexRef.current = 0;
          accumulatedTranscriptRef.current = "";
        }

        if (finalTranscript) {
          // Accumulate all final transcripts
          accumulatedTranscriptRef.current += finalTranscript;
          setUserTranscript(accumulatedTranscriptRef.current.trim());
          console.log("Accumulated transcript:", accumulatedTranscriptRef.current);
        }

        // Reset silence timer whenever we detect speech
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Auto-detect speech end after 0.4 seconds of silence
        silenceTimerRef.current = setTimeout(() => {
          if (accumulatedTranscriptRef.current.trim().length > 0 && status === "listening") {
            console.log("Silence detected, auto-processing speech");
            processUserSpeech();
          }
        }, 400);
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setError(`Recognition error: ${event.error}`);
          setStatus("error");
        }
      };

      recognition.onend = () => {
        console.log("Recognition ended, restarting...");
        // Auto-restart if still in active mode
        if (status === "listening" || status === "speaking") {
          try {
            recognition.start();
          } catch (e) {
            console.log("Failed to restart recognition:", e);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      console.log("Speech recognition started");

    } catch (err) {
      console.error("Error starting listening:", err);
    }
  }

  async function startVoiceMode() {
    try {
      setError(null);
      setStatus("listening");
      setMessages([]);
      setCurrentAssistantText("");
      setUserTranscript("");
      accumulatedTranscriptRef.current = ""; // Reset accumulated transcript

      // Initialize Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          // Accumulate all final transcripts
          accumulatedTranscriptRef.current += finalTranscript;
          setUserTranscript(accumulatedTranscriptRef.current.trim());
          console.log("Accumulated transcript:", accumulatedTranscriptRef.current);
        }

        // Reset silence timer whenever we detect speech
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Auto-detect speech end after 0.4 seconds of silence
        silenceTimerRef.current = setTimeout(() => {
          if (accumulatedTranscriptRef.current.trim().length > 0) {
            console.log("Silence detected, auto-processing speech");
            stopVoiceMode();
          }
        }, 400); // 1.5 seconds of silence
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error !== 'no-speech') {
          setError(`Recognition error: ${event.error}`);
          setStatus("error");
        }
      };

      recognition.onend = () => {
        console.log("Recognition ended");
      };

      recognitionRef.current = recognition;
      recognition.start();
      console.log("Speech recognition started");

    } catch (err) {
      console.error("Error starting voice mode:", err);
      setError(`Error: ${err.message}`);
      setStatus("error");
    }
  }

  async function processUserSpeech() {
    // Use the accumulated ref directly (more reliable than state)
    const finalTranscript = accumulatedTranscriptRef.current.trim();
    
    console.log("Processing transcript:", finalTranscript);

    // Process the transcript
    if (finalTranscript && finalTranscript.length > 0) {
      setStatus("thinking");
      setMessages((prev) => [...prev, { role: "user", text: finalTranscript }]);
      await callBrainWebhook(finalTranscript);
    }
  }

  async function stopVoiceMode() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Small delay to ensure last transcript is captured
    await new Promise(resolve => setTimeout(resolve, 300));

    // Use the accumulated ref directly (more reliable than state)
    const finalTranscript = accumulatedTranscriptRef.current.trim();
    
    console.log("Final transcript:", finalTranscript);

    // Process the transcript
    if (finalTranscript && finalTranscript.length > 0) {
      setStatus("thinking");
      setMessages((prev) => [...prev, { role: "user", text: finalTranscript }]);
      await callBrainWebhook(finalTranscript);
    } else {
      setError("No speech detected. Please try again.");
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 3000);
      cleanup();
    }
  }

  async function callBrainWebhook(userText) {
    setStatus("thinking");
    setCurrentAssistantText("");
    assistantTextBufferRef.current = "";
    spokenUpToIndexRef.current = 0;

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;
      
      if (!webhookUrl) {
        throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
      }

      // Create abort controller for cancellation
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
        throw new Error(`Brain webhook failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("text/event-stream")) {
        await handleSSEStream(response);
      } else {
        await handleStreamingJSON(response);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Brain request aborted");
        return;
      }
      console.error("Error calling brain webhook:", err);
      setError(`Brain error: ${err.message}`);
      setStatus("error");
      cleanup();
    }
  }

  async function handleSSEStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();

    setStatus("speaking");

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

      // Stream ended
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split by newlines to get individual JSON objects
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        // Process each complete line
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const jsonObj = JSON.parse(line);
            
            // Extract content from "item" type messages ONLY
            if (jsonObj.type === "item" && jsonObj.content) {
              // Check if content is a stringified JSON containing "output" field
              try {
                const contentObj = JSON.parse(jsonObj.content);
                if (contentObj.output) {
                  // Skip this - it's the final wrapped output
                  console.log("Skipping final wrapped output");
                  continue;
                }
              } catch (e) {
                // Content is not JSON, it's regular text - use it
              }
              
              // Add the content
              assistantTextBufferRef.current += jsonObj.content;
              setCurrentAssistantText(assistantTextBufferRef.current);
              console.log("Received content:", jsonObj.content);
            } else if (jsonObj.type === "begin") {
              console.log("Stream started");
            } else if (jsonObj.type === "end") {
              console.log("Stream ended");
            } else if (jsonObj.output) {
              // Ignore the final output summary
              console.log("Ignoring final output summary");
            }
          } catch (parseError) {
            console.error("Error parsing JSON line:", line, parseError);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const jsonObj = JSON.parse(buffer);
          if (jsonObj.type === "item" && jsonObj.content) {
            assistantTextBufferRef.current += jsonObj.content;
            setCurrentAssistantText(assistantTextBufferRef.current);
          }
        } catch (e) {
          // Ignore parse errors on incomplete data
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
    while (speechQueueRef.current.length > 0 || isSpeakingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Add final message
    if (assistantTextBufferRef.current) {
      setMessages((prev) => [...prev, { role: "assistant", text: assistantTextBufferRef.current }]);
    }

    setCurrentAssistantText("");
    setVolume(0);
    
    // Auto-restart listening for continuous conversation
    setStatus("listening");
    accumulatedTranscriptRef.current = "";
    setUserTranscript("");
    startListening();
  }

  async function processNextTTSSegment() {
    if (processingTTSRef.current) return;
    processingTTSRef.current = true;

    try {
      const fullText = assistantTextBufferRef.current;
      const spokenUpTo = spokenUpToIndexRef.current;

      if (spokenUpTo >= fullText.length) {
        processingTTSRef.current = false;
        return;
      }

      // Extract next speakable segment
      const segment = extractNextSegment(fullText, spokenUpTo);

      if (segment) {
        spokenUpToIndexRef.current += segment.length;
        
        // Speak using browser TTS
        await speakText(segment);
      }

      processingTTSRef.current = false;
      
      // Check if there's more to process
      if (spokenUpToIndexRef.current < assistantTextBufferRef.current.length) {
        setTimeout(() => processNextTTSSegment(), 50);
      }

    } catch (err) {
      console.error("TTS processing error:", err);
      processingTTSRef.current = false;
    }
  }

  function extractNextSegment(text, startIndex) {
    const remaining = text.substring(startIndex);
    if (remaining.length === 0) return null;

    // Split by sentence-ending punctuation
    const sentenceEnd = remaining.search(/[.!?]\s/);
    
    if (sentenceEnd !== -1) {
      return remaining.substring(0, sentenceEnd + 1).trim();
    }

    // Split by comma or other pauses for faster TTS start
    const pauseEnd = remaining.search(/[,;:]\s/);
    if (pauseEnd !== -1 && pauseEnd >= 15) {
      return remaining.substring(0, pauseEnd + 1).trim();
    }

    // If we have a decent amount of text (reduced from 180 to 30), speak it
    if (remaining.length >= 30) {
      // Find last space before 50 chars (reduced from 220)
      const chunk = remaining.substring(0, 50);
      const lastSpace = chunk.lastIndexOf(" ");
      if (lastSpace > 15) {
        return chunk.substring(0, lastSpace).trim();
      }
      // If we have at least 30 chars, speak them even without space
      if (remaining.length >= 30) {
        return remaining.substring(0, 30).trim();
      }
    }

    // Not enough yet, wait for more
    return null;
  }

  async function speakText(text) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Firefox compatibility: get voices explicitly
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Try to use a natural sounding voice
        const preferredVoice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        isSpeakingRef.current = true;
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setVolume(0);
        resolve();
      };

      utterance.onerror = (event) => {
        // Only log actual errors, not normal interruptions
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
          console.error("Speech synthesis error:", event.error);
        }
        isSpeakingRef.current = false;
        setVolume(0);
        resolve(); // Don't reject, just continue
      };

      speechQueueRef.current.push(utterance);
      
      // Firefox fix: Ensure voices are loaded
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            utterance.voice = voices.find(v => v.lang.startsWith('en')) || voices[0];
          }
          window.speechSynthesis.speak(utterance);
        }, { once: true });
      } else {
        // Speak the utterance
        window.speechSynthesis.speak(utterance);
      }
    });
  }

  function cleanup() {
    // Stop recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      recognitionRef.current = null;
    }

    // Abort brain request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Reset refs
    spokenUpToIndexRef.current = 0;
    assistantTextBufferRef.current = "";
    processingTTSRef.current = false;
    isSpeakingRef.current = false;
    speechQueueRef.current = [];
  }

  async function handleStop() {
    if (status === "listening") {
      await stopVoiceMode();
    } else {
      setStatus("idle");
      cleanup();
    }
  }

  // Calculate circle scale
  const circleScale = 1 + volume * 1.5;

  // Status display text
  const getStatusText = () => {
    switch (status) {
      case "idle":
        return "Click Start to begin your conversation";
      case "listening":
        return "Listening... Speak now, then click Stop";
      case "thinking":
        return "Thinking...";
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

            {/* Inner circle */}
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

            {/* Center dot */}
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
                Stop
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
              <p>Click Start, then speak your message</p>
              <p className="text-xs">Click Stop when you're done speaking</p>
              <p className="text-xs mt-2 text-gray-600">Using browser's built-in speech recognition (Free!)</p>
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

              {/* Current streaming assistant response */}
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

              {/* Processing status */}
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
                      <span className="text-sm font-medium">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
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

        /* Firefox */
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #a855f7 rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
