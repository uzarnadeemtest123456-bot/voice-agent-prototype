"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { getBreathingScale } from "@/lib/audioLevel";
import { StreamingAudioPlayer } from "@/lib/streamingAudioPlayer";

export default function VoiceModeUI() {
  // Main status state
  const [status, setStatus] = useState("idle"); // idle, listening, thinking, speaking, error
  const [processingStage, setProcessingStage] = useState(""); // "transcribing" or "generating"
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [displayVolume, setDisplayVolume] = useState(0);
  const [displayError, setDisplayError] = useState(null);

  const messagesEndRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const spokenUpToIndexRef = useRef(0);
  const assistantTextBufferRef = useRef("");
  const isSpeakingRef = useRef(false);
  const ttsStreamStartedRef = useRef(false);
  const lastSentIndexRef = useRef(0);
  const statusRef = useRef("idle");
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceStartRef = useRef(null);
  const volumeCheckIntervalRef = useRef(null);
  const hasSpeechDetectedRef = useRef(false);
  const messagesRef = useRef([]);
  
  // Barge-in / Interruption refs
  const activeTurnIdRef = useRef(0);
  const bargeInIntervalRef = useRef(null);
  const bargeInStartRef = useRef(null);
  const bargeInCooldownUntilRef = useRef(0);

  // Barge-in configuration
  const BARGE_IN_SPEECH_THRESHOLD = 0.03; // Lowered to match listening threshold
  const BARGE_IN_TRIGGER_HOLD_MS = 150;   // Reduced for faster response
  const BARGE_IN_POLL_INTERVAL = 50;
  const BARGE_IN_COOLDOWN_MS = 300;       // Reduced cooldown
  const BARGE_IN_STARTUP_COOLDOWN_MS = 250; // Reduced startup cooldown

  // Custom hooks for modular functionality
  const audioRecorder = useAudioRecorder();
  const assistantStream = useAssistantStream();
  const ttsPlayer = useTTSPlayer();

  // Sync messages to ref
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new StreamingAudioPlayer();
    
    audioPlayerRef.current.onStart = () => {
      isSpeakingRef.current = true;
      // Set cooldown when each audio segment starts to prevent false triggers
      bargeInCooldownUntilRef.current = Date.now() + BARGE_IN_COOLDOWN_MS;
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
  }, [messages, assistantStream.assistantText]);


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

  // Barge-in detection: enable when speaking, disable otherwise
  useEffect(() => {
    if (status === "speaking") {
      // Set cooldown to prevent false trigger from AI audio start
      bargeInCooldownUntilRef.current = Date.now() + BARGE_IN_STARTUP_COOLDOWN_MS;
      setupBargeInDetection();
    } else {
      cleanupBargeInDetection();
    }
    
    return () => {
      cleanupBargeInDetection();
    };
  }, [status]);

  async function startListening() {
    try {
      // Reuse existing stream if available (for barge-in to work)
      let stream = streamRef.current;
      
      if (!stream || !stream.active) {
        // Request microphone access with echo cancellation - works on ALL browsers
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        streamRef.current = stream;
      }
      
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

      mediaRecorder.start(100); // Collect data every 100ms
      console.log("Recording started (cross-browser support)");

      // Setup Voice Activity Detection (VAD) - reuse or create
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        setupVoiceActivityDetection(stream);
      } else {
        // Reuse existing AudioContext and analyser for barge-in
        setupListeningVAD();
      }

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please grant permission.");
      setStatus("error");
    }
  }

  function setupVoiceActivityDetection(stream) {
    // Create AudioContext for volume analysis
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Reset speech detection flag
    hasSpeechDetectedRef.current = false;

    // Check volume every 100ms
    volumeCheckIntervalRef.current = setInterval(() => {
      if (statusRef.current !== "listening") {
        return; // Only check when listening
      }
    } else if (streamFlushedRef.current && assistantStream.assistantText) {
      const currentLength = assistantStream.assistantText.length;
      const lastProcessedLength = lastProcessedTextLengthRef.current;
      if (currentLength > lastProcessedLength) {
        lastProcessedTextLengthRef.current = currentLength; // Update to prevent repeated logs
      }
      const rms = Math.sqrt(sum / bufferLength);
      const calculatedVolume = rms;

      // UPDATE VOLUME STATE FOR CIRCLE ANIMATION
      setVolume(calculatedVolume * 2); // Amplify for better visual effect

      const SILENCE_THRESHOLD = 0.01; // Adjust based on environment
      const SPEECH_THRESHOLD = 0.03; // Volume level to consider as speech

      // Detect if user is actually speaking (above speech threshold)
      if (calculatedVolume > SPEECH_THRESHOLD) {
        hasSpeechDetectedRef.current = true;
      }

      if (calculatedVolume < SILENCE_THRESHOLD) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        }

        const silenceDuration = Date.now() - silenceStartRef.current;

        // Auto-stop after 1.5 seconds of silence, but ONLY if speech was detected
        if (silenceDuration > 1500 && hasSpeechDetectedRef.current && audioChunksRef.current.length > 0) {
          console.log("Speech detected and silence for 1.5s, auto-processing...");
          clearInterval(volumeCheckIntervalRef.current);
          stopListening();
        }
      } else {
        silenceStartRef.current = null;
      }
    }, 100);
  }

  function setupListeningVAD() {
    // Reuse existing analyser for listening VAD (for barge-in support)
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Reset speech detection flag
    hasSpeechDetectedRef.current = false;

    // Check volume every 100ms
    volumeCheckIntervalRef.current = setInterval(() => {
      if (statusRef.current !== "listening") {
        return; // Only check when listening
      }

      analyser.getByteTimeDomainData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const calculatedVolume = rms;

      // UPDATE VOLUME STATE FOR CIRCLE ANIMATION
      setVolume(calculatedVolume * 2); // Amplify for better visual effect

      const SILENCE_THRESHOLD = 0.01; // Adjust based on environment
      const SPEECH_THRESHOLD = 0.03; // Volume level to consider as speech

      // Detect if user is actually speaking (above speech threshold)
      if (calculatedVolume > SPEECH_THRESHOLD) {
        hasSpeechDetectedRef.current = true;
      }

      if (calculatedVolume < SILENCE_THRESHOLD) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        }

        const silenceDuration = Date.now() - silenceStartRef.current;

        // Auto-stop after 1.5 seconds of silence, but ONLY if speech was detected
        if (silenceDuration > 1500 && hasSpeechDetectedRef.current && audioChunksRef.current.length > 0) {
          console.log("Speech detected and silence for 1.5s, auto-processing...");
          clearInterval(volumeCheckIntervalRef.current);
          stopListening();
        }
      } else {
        silenceStartRef.current = null;
      }
    }, 100);
  }

  function cleanupVoiceActivityDetection() {
    // Only clear the interval, NOT the AudioContext or analyser (for barge-in)
    if (volumeCheckIntervalRef.current) {
      clearInterval(volumeCheckIntervalRef.current);
      volumeCheckIntervalRef.current = null;
    }

    silenceStartRef.current = null;
  }

  function stopListening() {
    // Only stop the MediaRecorder and VAD interval, NOT the mic stream
    cleanupVoiceActivityDetection();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    // DO NOT stop stream tracks - keep mic alive for barge-in
  }

  async function processRecording() {
    console.log(`📝 Processing recording: ${audioChunksRef.current.length} chunks`);
    
    // Check if we have any audio chunks
    if (audioChunksRef.current.length === 0) {
      console.log("⚠️ No audio chunks to process, restarting listening");
      setStatus("listening");
      await startListening();
      return;
    }
    
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: audioChunksRef.current[0]?.type || 'audio/webm' 
    });
    
    console.log(`📦 Audio blob size: ${audioBlob.size} bytes`);
    
    // Increased minimum size threshold to avoid background noise
    // 10KB is a reasonable minimum for meaningful speech (~1 second)
    if (audioBlob.size < 10000) {
      console.log("⚠️ Recording too short or low quality, ignoring and restarting");
      setStatus("listening");
      await startListening();
      return;
    }

    // Check if actual speech was detected (not just noise)
    if (!hasSpeechDetectedRef.current) {
      console.log("⚠️ No clear speech detected, ignoring and restarting");
      setStatus("listening");
      await startListening();
      return;
    }

    setStatus("thinking");
    setProcessingStage("transcribing");
    setUserTranscript("Transcribing...");

    try {
      // Call Whisper API for transcription
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      console.log("🎙️ Sending to STT API...");
      
      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        console.error('STT API error:', errorText);
        throw new Error(`Transcription failed: ${sttResponse.status}`);
      }

      const sttData = await sttResponse.json();
      const transcript = sttData.text.trim();
      
      console.log("Whisper transcript:", transcript);

      // Check if transcription was filtered as hallucination
      if (sttData.filtered) {
        console.log("⚠️ Transcription was filtered as hallucination");
        setStatus("listening");
        setProcessingStage("");
        setUserTranscript("");
        await startListening();
        return;
      }

      if (transcript.length > 0) {
        setUserTranscript(transcript);
        // Use messagesRef to get the latest messages (avoid stale closure)
        const currentMessages = messagesRef.current;
        const newMessages = [...currentMessages, { role: "user", text: transcript }];
        setMessages(newMessages);
        messagesRef.current = newMessages; // Update ref immediately
        
        // Now processing answer from n8n
        setProcessingStage("generating");
        await handleUserQuery(transcript, newMessages);
      } else {
        console.log("⚠️ Empty transcript received");
        setStatus("listening");
        setProcessingStage("");
        setUserTranscript("");
        await startListening();
      }

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
  }

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

      await audioRecorder.startRecording();
    } catch (err) {
      setDisplayError(`Error: ${err.message}`);
      setStatus("error");
    }
  }

  async function handleUserQuery(query, currentMessages) {
    // Increment turn ID to invalidate any previous ongoing work
    activeTurnIdRef.current += 1;
    const myTurn = activeTurnIdRef.current;
    
    setStatus("thinking");
    setCurrentAssistantText("");
    assistantTextBufferRef.current = "";
    spokenUpToIndexRef.current = 0;
    ttsStreamStartedRef.current = false;
    lastSentIndexRef.current = 0;
    
    // Clear any leftover audio segments from previous turn
    if (audioPlayerRef.current) {
      audioPlayerRef.current.clear();
    }

    try {
      // Send query directly to n8n (Whisper handles transcription accurately)
      console.log('Sending query to n8n:', query);
      await callBrainWebhook(query, currentMessages, myTurn);

    } catch (err) {
      setDisplayError(`Error: ${err.message}`);
      setStatus("error");
      
      setTimeout(() => {
        setStatus("listening");
        setDisplayError(null);
        audioRecorder.startRecording();
      }, 3000);
    }
  }

  async function callBrainWebhook(userText, currentMessages, myTurn) {
    setStatus("thinking");

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;
      
      if (!webhookUrl) {
        throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
      }

      abortControllerRef.current = new AbortController();

      // Prepare conversation memory for n8n (last 10 messages from currentMessages)
      const messageContext = currentMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.text
      }));

      console.log('Sending message_context to n8n:', messageContext);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userText,
          message_context: messageContext, // Conversation memory
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
        await handleSSEStream(response, myTurn);
      } else {
        await handleStreamingJSON(response, myTurn);
      }

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("n8n request aborted");
        return;
      }
      throw err;
    }
  }

  async function handleSSEStream(response, myTurn) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();

    setStatus("thinking");

    // Timeout protection - 30 seconds max
    const streamTimeout = setTimeout(() => {
      if (activeTurnIdRef.current === myTurn) {
        console.error("⏱️ SSE stream timeout - aborting");
        reader.cancel();
        throw new Error("Stream timeout - no response from n8n");
      }
    }, 30000);

    try {
      let hasReceivedData = false;
      
      while (true) {
        // Check if this turn is still active
        if (activeTurnIdRef.current !== myTurn) {
          console.log("⚠️ SSE stream abandoned (interrupted)");
          clearTimeout(streamTimeout);
          return;
        }
        
        const { done, value } = await reader.read();
        if (done) break;

        hasReceivedData = true;
        const chunk = decoder.decode(value, { stream: true });
        const events = parser.parse(chunk);

        for (const event of events) {
          // Check again in case of interruption during parsing
          if (activeTurnIdRef.current !== myTurn) {
            console.log("⚠️ SSE stream abandoned (interrupted)");
            clearTimeout(streamTimeout);
            return;
          }
          
          if (event.event === "delta" && event.data?.text) {
            const newText = event.data.text;
            // Clear processing stage on first text chunk
            if (processingStage) {
              setProcessingStage("");
            }
            assistantTextBufferRef.current += newText;
            setCurrentAssistantText(assistantTextBufferRef.current);
            
            // Check if we should start TTS stream (first sentence detected)
            await tryStartIncrementalTTS(myTurn);
          } else if (event.event === "done") {
            clearTimeout(streamTimeout);
            await finishAssistantResponse(myTurn);
            return;
          } else if (event.event === "error") {
            clearTimeout(streamTimeout);
            throw new Error(event.data?.message || "Stream error");
          }
        }
      }

      clearTimeout(streamTimeout);
      
      // If stream ended but no data received, handle as error
      if (!hasReceivedData) {
        console.error("⚠️ SSE stream ended with no data");
        throw new Error("No response from n8n");
      }

      await finishAssistantResponse(myTurn);

    } catch (err) {
      clearTimeout(streamTimeout);
      
      if (err.name === "AbortError") {
        console.log("⚠️ SSE stream aborted");
        return;
      }
      throw err;
    }
  }

  async function handleStreamingJSON(response, myTurn) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    setStatus("thinking");

    try {
      while (true) {
        // Check if this turn is still active
        if (activeTurnIdRef.current !== myTurn) {
          console.log("⚠️ JSON stream abandoned (interrupted)");
          return;
        }
        
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          // Check again before processing
          if (activeTurnIdRef.current !== myTurn) {
            console.log("⚠️ JSON stream abandoned (interrupted)");
            return;
          }

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
              
              // Clear processing stage on first text chunk
              if (processingStage) {
                setProcessingStage("");
              }
              assistantTextBufferRef.current += jsonObj.content;
              setCurrentAssistantText(assistantTextBufferRef.current);
              
              // Check if we should start TTS stream (first sentence detected)
              await tryStartIncrementalTTS(myTurn);
              
              // If stream is active, send new chunks
              await sendIncrementalTextChunks(myTurn);
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

      await finishAssistantResponse(myTurn);

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("⚠️ JSON stream aborted");
        return;
      }
      throw err;
    }
  }

  async function finishAssistantResponse(myTurn) {
    // Check if this turn is still active (could have been interrupted)
    if (myTurn && activeTurnIdRef.current !== myTurn) {
      console.log("⚠️ finishAssistantResponse abandoned (interrupted)");
      return;
    }
    
    const fullText = assistantTextBufferRef.current.trim();
    
    if (fullText.length > 0) {
      setStatus("speaking");
      
      try {
        // If incremental streaming was started, send remaining text and end stream
        if (ttsStreamStartedRef.current) {
          console.log(`📊 Incremental TTS active - sending remaining text and closing stream`);
          
          // Send any remaining text
          if (lastSentIndexRef.current < fullText.length) {
            const remainingText = fullText.substring(lastSentIndexRef.current).trim();
            if (remainingText.length > 0) {
              console.log(`📤 Sending final text chunk (${remainingText.length} chars)`);
              await audioPlayerRef.current.sendTextChunk(remainingText);
            }
          }
          
          // Signal end of stream
          await audioPlayerRef.current.endIncrementalStream();
          console.log('✅ Incremental TTS stream completed');
          
        } else {
          // Fallback: response was too short, use regular streaming
          console.log(`🎤 Response too short for incremental - using regular streaming (${fullText.length} chars)`);
          await audioPlayerRef.current.streamText(fullText);
        }
      } catch (error) {
        console.error('Error streaming TTS:', error);
      }
    }
    
    // Wait for all TTS to complete
    await ttsPlayer.waitForPlaybackComplete();

    // Check AGAIN after waiting - could have been interrupted while waiting
    if (myTurn && activeTurnIdRef.current !== myTurn) {
      console.log("⚠️ finishAssistantResponse abandoned after playback (interrupted)");
      return;
    }

    // Add final message
    if (assistantTextBufferRef.current) {
      setMessages((prev) => [...prev, { role: "assistant", text: assistantTextBufferRef.current }]);
    }

    setCurrentAssistantText("");
    setUserTranscript("");
    setProcessingStage("");
    setVolume(0);
    
    // OPTIMIZATION: Reduced from 500ms to 150ms for faster turn-around (saves 350ms!)
    // Short delay to avoid echo pickup while keeping response snappy
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Final check before starting new recording
    if (myTurn && activeTurnIdRef.current !== myTurn) {
      console.log("⚠️ finishAssistantResponse skipping startListening (interrupted)");
      return;
    }
    
    // Auto-restart listening for next turn
    setStatus("listening");
    
    if (audioPlayerRef.current) {
      audioPlayerRef.current.resume();
    }
    
    await startListening();
    console.log("Ready for next turn");
  }

  /**
   * Try to start incremental TTS when first sentence is detected
   * This enables MINIMUM LATENCY - audio starts while n8n is still generating
   * OPTIMIZED: Only sends complete sentences to prevent prosody breaks
   */
  async function tryStartIncrementalTTS(myTurn) {
    // Already started or turn invalidated
    if (ttsStreamStartedRef.current || activeTurnIdRef.current !== myTurn) {
      return;
    }

    const fullText = assistantTextBufferRef.current;
    const MIN_CHARS_FOR_TTS = 90; // Minimum chars before starting TTS
    const MIN_FIRST_SENTENCE_CHARS = 50; // First sentence must be at least this long

    // Look for first complete sentence
    const firstSentenceMatch = fullText.match(/^.+?[.!?]\s/);
    
    // BUG FIX: Ensure first sentence is long enough to avoid ElevenLabs timeout
    if (firstSentenceMatch && fullText.length >= MIN_CHARS_FOR_TTS && firstSentenceMatch[0].length >= MIN_FIRST_SENTENCE_CHARS) {
      const firstSentence = firstSentenceMatch[0];
      
      console.log(`🚀 FAST START: Starting TTS with first sentence (${firstSentence.length} chars)`);
      console.log(`📊 Streaming will continue while n8n generates remaining ${fullText.length - firstSentence.length}+ chars`);
      
      setStatus("speaking");
      
      try {
        // BUG FIX: Start incremental stream BEFORE setting flag
        await audioPlayerRef.current.startIncrementalStream(firstSentence.trim());
        // Only set flag if stream started successfully
        ttsStreamStartedRef.current = true;
        lastSentIndexRef.current = firstSentence.length;
        
        // OPTIMIZED: Only send additional COMPLETE sentences that are already buffered
        if (fullText.length > lastSentIndexRef.current) {
          const remainingText = fullText.substring(lastSentIndexRef.current);
          
          // Find all complete sentences in remaining text
          const sentenceRegex = /.+?[.!?]\s/g;
          let match;
          let completeSentences = '';
          
          while ((match = sentenceRegex.exec(remainingText)) !== null) {
            completeSentences += match[0];
          }
          
          // Only send if we have complete sentences (prevents 5-char fragments)
          if (completeSentences.length > 0) {
            console.log(`📤 Sending additional complete sentences (${completeSentences.length} chars)`);
            await audioPlayerRef.current.sendTextChunk(completeSentences.trim());
            lastSentIndexRef.current += completeSentences.length;
          }
        }
      } catch (error) {
        console.error('Error starting incremental TTS:', error);
        ttsStreamStartedRef.current = false;
      }
    }
  }

  /**
   * Send new text chunks to active TTS stream
   */
  async function sendIncrementalTextChunks(myTurn) {
    if (!ttsStreamStartedRef.current || activeTurnIdRef.current !== myTurn) {
      return;
    }

    const fullText = assistantTextBufferRef.current;
    const lastSent = lastSentIndexRef.current;

    if (lastSent >= fullText.length) {
      return;
    }

    const newText = fullText.substring(lastSent);
    
    // Send complete sentences as they arrive
    const sentenceMatch = newText.match(/^.+?[.!?]\s/);
    if (sentenceMatch) {
      const sentence = sentenceMatch[0];
      console.log(`📤 Sending next sentence to TTS (${sentence.length} chars)`);
      
      try {
        await audioPlayerRef.current.sendTextChunk(sentence.trim());
        lastSentIndexRef.current += sentence.length;
      } catch (error) {
        console.error('Error sending text chunk:', error);
      }
    }
  }

  async function waitForPlaybackComplete() {
    while (audioPlayerRef.current.isProcessing || isSpeakingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  function cleanupBargeInDetection() {
    if (bargeInIntervalRef.current) {
      clearInterval(bargeInIntervalRef.current);
      bargeInIntervalRef.current = null;
    }
    bargeInStartRef.current = null;
  }

  function setupBargeInDetection() {
    if (!analyserRef.current) {
      console.log("⚠️ Barge-in setup failed: No analyser available");
      return;
    }
    
    console.log("✅ Barge-in detection STARTED");
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    bargeInIntervalRef.current = setInterval(() => {
      // Only detect during speaking state
      if (statusRef.current !== "speaking") {
        return;
      }

      // Check cooldown
      const now = Date.now();
      if (now < bargeInCooldownUntilRef.current) {
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / bufferLength);

      // Check if speech detected
      if (rms > BARGE_IN_SPEECH_THRESHOLD) {
        if (!bargeInStartRef.current) {
          bargeInStartRef.current = now;
          console.log(`🎤 Speech detected! RMS: ${rms.toFixed(4)}`);
        }

        const holdDuration = now - bargeInStartRef.current;

        // Trigger interruption if held long enough
        if (holdDuration >= BARGE_IN_TRIGGER_HOLD_MS) {
          console.log(`🛑 Barge-in triggered after ${holdDuration}ms! Interrupting AI...`);
          bargeInStartRef.current = null;
          interruptAndStartListening();
        }
      } else {
        if (bargeInStartRef.current) {
          bargeInStartRef.current = null;
        }
      }
    }, BARGE_IN_POLL_INTERVAL);
  }

  async function interruptAndStartListening() {
    console.log("🛑 INTERRUPTION TRIGGERED");
    
    // 1. Invalidate old turn
    activeTurnIdRef.current += 1;
    const myTurn = activeTurnIdRef.current;
    
    // 2. Stop audio immediately and cleanup server-side stream
    if (audioPlayerRef.current) {
      // Close server-side WebSocket session to prevent memory leak and credit waste
      if (audioPlayerRef.current.streamActive) {
        await audioPlayerRef.current.endIncrementalStream();
      }
      
      audioPlayerRef.current.stop();
      if (audioPlayerRef.current.clear) {
        audioPlayerRef.current.clear();
      }
      // IMPORTANT: Resume to allow next turn's audio to play
      audioPlayerRef.current.resume();
    }
    
    // 3. Abort n8n request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 4. Optional: Save partial assistant text to messages
    if (assistantTextBufferRef.current) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        text: assistantTextBufferRef.current + " [interrupted]" 
      }]);
    }
    
    // 5. Clear streaming buffers
    assistantTextBufferRef.current = "";
    setCurrentAssistantText("");
    spokenUpToIndexRef.current = 0;
    setProcessingStage("");
    
    // 6. Switch to listening
    setStatus("listening");
    cleanupBargeInDetection();
    
    // Race-guard
    if (activeTurnIdRef.current !== myTurn) return;
    
    // 7. Start recording new input
    await startListening();
  }

  function cleanup() {
    cleanupVoiceActivityDetection();
    cleanupBargeInDetection();
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    // NOW stop the mic stream (only on full cleanup)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Close AudioContext (only on full cleanup)
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.cleanup();
    }

    spokenUpToIndexRef.current = 0;
    assistantTextBufferRef.current = "";
    isSpeakingRef.current = false;
    audioChunksRef.current = [];
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

              {!currentAssistantText && processingStage && (
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
                      <span className="text-sm font-medium">
                        {processingStage === "transcribing" && "Processing voice..."}
                        {processingStage === "generating" && "Processing answer..."}
                      </span>
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
