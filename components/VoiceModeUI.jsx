"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SSEParser } from "@/lib/sse";
import { getBreathingScale } from "@/lib/audioLevel";
import { TextChunker } from "@/lib/textChunker";
import { AudioQueue } from "@/lib/audioQueue";

export default function VoiceModeUI() {
  // State management
  const [status, setStatus] = useState("idle"); // idle, listening, thinking, speaking, error
  const [processingStage, setProcessingStage] = useState(""); // "transcribing" or "generating"
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
  const assistantTextBufferRef = useRef("");
  const statusRef = useRef("idle");
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceStartRef = useRef(null);
  const volumeCheckIntervalRef = useRef(null);
  const hasSpeechDetectedRef = useRef(false);
  const messagesRef = useRef([]);
  const pendingTextUpdateRef = useRef(false);
  
  // Turn tracking for interruption handling
  const activeTurnIdRef = useRef(0);

  // TTS refs
  const audioQueueRef = useRef(null);
  const textChunkerRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const currentChunkIdRef = useRef(0);
  const ttsAbortControllersRef = useRef(new Set());
  const speakingInterruptCheckRef = useRef(null);
  const streamingCompleteRef = useRef(false); // Track if n8n stream is complete
  
  // Listening lock to prevent double sessions
  const isStartingListeningRef = useRef(false);
  
  // ProcessingStage ref to fix stale closure
  const processingStageRef = useRef("");

  // Sync status to ref
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Sync messages to ref
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync processingStage to ref
  useEffect(() => {
    processingStageRef.current = processingStage;
  }, [processingStage]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentAssistantText]);


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

  // TTS Functions
  function initializeTTS(requestId) {
    console.log(`🎵 Initializing TTS for request ${requestId}`);
    
    // Initialize audio queue if not exists
    if (!audioQueueRef.current) {
      audioQueueRef.current = new AudioQueue();
      
      // Setup callbacks
      audioQueueRef.current.onPlaybackStart = () => {
        console.log("🔊 Audio playback started");
        setStatus("speaking");
        setupSpeakingInterruptDetection();
      };
      
      audioQueueRef.current.onPlaybackComplete = () => {
        console.log("✅ All audio playback complete");
        cleanupSpeakingInterruptDetection();
        
        // Check if we should return to listening
        if (statusRef.current === "speaking" && activeTurnIdRef.current === activeRequestIdRef.current) {
          setStatus("listening");
          startListening();
        }
      };
    }
    
    // Set active request
    audioQueueRef.current.setActiveRequest(requestId);
    activeRequestIdRef.current = requestId;
    currentChunkIdRef.current = 0;
    
    // Initialize text chunker
    textChunkerRef.current = new TextChunker((chunk) => {
      const chunkId = currentChunkIdRef.current++;
      fetchTTSAudio(chunk, requestId, chunkId);
    });
  }

  async function fetchTTSAudio(text, requestId, chunkId) {
    // Check if this request is still active
    if (requestId !== activeRequestIdRef.current) {
      console.log(`⚠️ Skipping TTS for old request ${requestId}`);
      return;
    }

    const abortController = new AbortController();
    ttsAbortControllersRef.current.add(abortController);

    try {
      console.log(`🎤 Fetching TTS [req:${requestId}, chunk:${chunkId}]...`);
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          requestId: requestId,
          chunkId: chunkId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        console.error(`❌ TTS API error: ${response.status}`);
        return;
      }

      // Check again after fetch
      if (requestId !== activeRequestIdRef.current) {
        console.log(`⚠️ Discarding TTS response from old request ${requestId}`);
        return;
      }

      const audioBlob = await response.blob();
      console.log(`✅ TTS audio received [req:${requestId}, chunk:${chunkId}]: ${audioBlob.size} bytes`);

      // Enqueue audio
      if (audioQueueRef.current) {
        audioQueueRef.current.enqueue(requestId, chunkId, audioBlob);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(`⚠️ TTS request aborted [req:${requestId}, chunk:${chunkId}]`);
      } else {
        console.error(`❌ TTS fetch error [req:${requestId}, chunk:${chunkId}]:`, err);
      }
    } finally {
      ttsAbortControllersRef.current.delete(abortController);
    }
  }

  function handleInterruption() {
    console.log("🛑 Interruption detected!");
    
    // Increment request ID to invalidate ongoing TTS
    activeRequestIdRef.current += 1;
    activeTurnIdRef.current += 1;
    
    // Stop all audio
    if (audioQueueRef.current) {
      audioQueueRef.current.stopAll();
    }
    
    // Abort all in-flight TTS requests
    for (const controller of ttsAbortControllersRef.current) {
      controller.abort();
    }
    ttsAbortControllersRef.current.clear();
    
    // Reset text chunker
    if (textChunkerRef.current) {
      textChunkerRef.current.reset();
    }
    
    // Cleanup speaking interrupt detection
    cleanupSpeakingInterruptDetection();
    
    // Abort n8n stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear text buffer
    assistantTextBufferRef.current = "";
    setCurrentAssistantText("");
    setProcessingStage("");
    
    // Transition to listening
    setStatus("listening");
    startListening();
  }

  function setupSpeakingInterruptDetection() {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let highVolumeStart = null;
    const INTERRUPT_THRESHOLD = 0.05; // Higher than normal speech detection
    const INTERRUPT_DURATION = 150; // 150ms of speech to trigger interrupt
    
    speakingInterruptCheckRef.current = setInterval(() => {
      // Only check when speaking
      if (statusRef.current !== "speaking") {
        return;
      }
      
      analyser.getByteTimeDomainData(dataArray);
      
      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / bufferLength);
      
      if (rms > INTERRUPT_THRESHOLD) {
        if (!highVolumeStart) {
          highVolumeStart = Date.now();
        }
        
        const duration = Date.now() - highVolumeStart;
        
        // Trigger interruption if sustained
        if (duration >= INTERRUPT_DURATION) {
          console.log("🎤 User speaking detected during playback - interrupting!");
          cleanupSpeakingInterruptDetection();
          handleInterruption();
        }
      } else {
        highVolumeStart = null;
      }
    }, 50); // Check every 50ms
  }

  function cleanupSpeakingInterruptDetection() {
    if (speakingInterruptCheckRef.current) {
      clearInterval(speakingInterruptCheckRef.current);
      speakingInterruptCheckRef.current = null;
    }
  }

  function cleanupTTS() {
    console.log("🧹 Cleaning up TTS");
    
    // Stop text chunker
    if (textChunkerRef.current) {
      textChunkerRef.current.reset();
      textChunkerRef.current = null;
    }
    
    // Stop audio queue
    if (audioQueueRef.current) {
      audioQueueRef.current.cleanup();
    }
    
    // Abort all TTS requests
    for (const controller of ttsAbortControllersRef.current) {
      controller.abort();
    }
    ttsAbortControllersRef.current.clear();
    
    // Cleanup interrupt detection
    cleanupSpeakingInterruptDetection();
  }

  async function startListening() {
    // Prevent double listening sessions
    if (isStartingListeningRef.current) {
      console.log("⚠️ Already starting listening, skipping");
      return;
    }
    
    // Guard against already recording
    if (mediaRecorderRef.current?.state === "recording") {
      console.log("⚠️ Already recording, skipping");
      return;
    }
    
    isStartingListeningRef.current = true;
    
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
      // Probe for supported mime types with fallback
      let mimeType;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';

      let mediaRecorder;
      try {
        mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        mediaRecorder = new MediaRecorder(stream); // last resort - use browser default
      }
      
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
    } finally {
      isStartingListeningRef.current = false;
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
      
      // Choose extension based on actual blob type
      const mime = audioBlob.type || 'audio/webm';
      const ext =
        mime.includes('mp4') ? 'mp4' :
        mime.includes('mpeg') ? 'mp3' :
        mime.includes('ogg') ? 'ogg' :
        mime.includes('wav') ? 'wav' :
        'webm';
      
      formData.append('audio', audioBlob, `recording.${ext}`);

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
      setError(null);
      setStatus("listening");
      setMessages([]);
      setCurrentAssistantText("");
      setUserTranscript("Listening... Just speak naturally!");

      await startListening();

    } catch (err) {
      console.error("Error starting voice mode:", err);
      setError(`Error: ${err.message}`);
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

    try {
      // Send query directly to n8n (Whisper handles transcription accurately)
      console.log('Sending query to n8n:', query);
      await callBrainWebhook(query, currentMessages, myTurn);

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

  async function callBrainWebhook(userText, currentMessages, myTurn) {
    setStatus("thinking");

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL;
      
      if (!webhookUrl) {
        throw new Error("N8N_BRAIN_WEBHOOK_URL not configured");
      }

      // Initialize TTS for this request
      initializeTTS(myTurn);

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
        abortControllerRef.current?.abort();
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
            // Clear processing stage on first text chunk (use ref to avoid stale closure)
            if (processingStageRef.current) {
              setProcessingStage("");
            }
            assistantTextBufferRef.current += newText;
            
            // Feed text to TTS chunker
            if (textChunkerRef.current && activeRequestIdRef.current === myTurn) {
              textChunkerRef.current.add(newText);
            }
            
            // Throttled UI update - only update once per frame
            if (!pendingTextUpdateRef.current) {
              pendingTextUpdateRef.current = true;
              requestAnimationFrame(() => {
                setCurrentAssistantText(assistantTextBufferRef.current);
                pendingTextUpdateRef.current = false;
              });
            }
          } else if (event.event === "done") {
            clearTimeout(streamTimeout);
            // End text chunker
            if (textChunkerRef.current) {
              textChunkerRef.current.end();
            }
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
              
              // Clear processing stage on first text chunk (use ref to avoid stale closure)
              if (processingStageRef.current) {
                setProcessingStage("");
              }
              assistantTextBufferRef.current += jsonObj.content;
              
              // Feed text to TTS chunker
              if (textChunkerRef.current && activeRequestIdRef.current === myTurn) {
                textChunkerRef.current.add(jsonObj.content);
              }
              
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
            
            // Feed text to TTS chunker
            if (textChunkerRef.current && activeRequestIdRef.current === myTurn) {
              textChunkerRef.current.add(jsonObj.content);
            }
            
            setCurrentAssistantText(assistantTextBufferRef.current);
          }
        } catch (e) {
          // Ignore
        }
      }

      // End text chunker
      if (textChunkerRef.current) {
        textChunkerRef.current.end();
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
    
    // Add final message to chat history
    if (fullText.length > 0) {
      setMessages((prev) => [...prev, { role: "assistant", text: fullText }]);
    }

    setCurrentAssistantText("");
    setUserTranscript("");
    setProcessingStage("");
    setVolume(0);
    
    // Check if audio queue has pending audio to play
    const hasAudioToPlay = audioQueueRef.current && 
                           (audioQueueRef.current.isPlaying() || audioQueueRef.current.getQueueSize() > 0);
    
    if (hasAudioToPlay) {
      console.log("📢 Audio playback pending, waiting for completion...");
      // Audio will play, and onPlaybackComplete callback will handle returning to listening
      // Don't transition to listening here - let the audio play
    } else {
      // No audio to play, return to listening immediately
      console.log("✅ No audio to play, returning to listening");
      
      // Check again before starting new recording
      if (myTurn && activeTurnIdRef.current !== myTurn) {
        console.log("⚠️ finishAssistantResponse skipping startListening (interrupted)");
        return;
      }
      
      setStatus("listening");
      await startListening();
      console.log("Ready for next turn");
    }
  }

  function cleanup() {
    cleanupVoiceActivityDetection();
    cleanupTTS();
    
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    // Stop the mic stream (only on full cleanup)
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

    assistantTextBufferRef.current = "";
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
        return "Listening... (Auto-detects speech + 1.5s silence)";
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
            <p className="text-xs text-gray-500">Whisper STT + ElevenLabs TTS + n8n Streaming</p>
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
              <p className="text-sm text-green-400">✓ Auto-detects when you stop speaking (1s silence)</p>
              <p className="text-xs text-gray-400">No need to press any button - just stop talking!</p>
              <p className="text-xs mt-2 text-gray-600">Whisper STT + n8n Intelligence</p>
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
