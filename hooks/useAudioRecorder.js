/**
 * Custom hook for audio recording and speech-to-text
 * Handles microphone access, recording, voice activity detection, and Whisper transcription
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioRecorder() {
  const [status, setStatus] = useState('idle'); // idle, listening, transcribing
  const [transcript, setTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);

  // Refs for audio recording
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceStartRef = useRef(null);
  const volumeCheckIntervalRef = useRef(null);
  const hasSpeechDetectedRef = useRef(false);
  const statusRef = useRef('idle'); // Track status to avoid stale closures

  // Sync status to ref
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanupVoiceActivityDetection = useCallback(() => {
    if (volumeCheckIntervalRef.current) {
      clearInterval(volumeCheckIntervalRef.current);
      volumeCheckIntervalRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    silenceStartRef.current = null;
    analyserRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    cleanupVoiceActivityDetection();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [cleanupVoiceActivityDetection]);

  const processRecording = useCallback(async () => {
    const audioBlob = new Blob(audioChunksRef.current, { 
      type: audioChunksRef.current[0]?.type || 'audio/webm' 
    });
    
    // Must have at least some audio data (increased threshold to reduce hallucinations)
    if (audioBlob.size < 5000) {
      console.log("Recording too short, ignoring (size:", audioBlob.size, ")");
      setStatus("idle");
      return null;
    }

    // Only process if we detected actual speech
    if (!hasSpeechDetectedRef.current) {
      console.log("No speech detected, ignoring recording");
      setStatus("idle");
      return null;
    }

    setStatus("transcribing");
    setTranscript("Transcribing...");

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
      const transcriptText = sttData.text.trim();
      
      console.log("Whisper transcript:", transcriptText);

      // Filter out common Whisper hallucinations
      const hallucinations = [
        'thank you',
        'thanks for watching',
        'bye',
        'bye-bye',
        'subtitle',
        'amara.org',
        'www.',
        'http',
        '♪',
        '...',
        '.',
        ','
      ];
      
      const lowerText = transcriptText.toLowerCase();
      const isHallucination = hallucinations.some(pattern => 
        lowerText === pattern || (pattern.length > 3 && lowerText.includes(pattern))
      );

      if (transcriptText.length > 0 && !isHallucination && transcriptText.length > 2) {
        setTranscript(transcriptText);
        setStatus("idle");
        return transcriptText;
      } else {
        console.log("Transcript too short or appears to be hallucination, ignoring");
        setStatus("idle");
        return null;
      }

    } catch (err) {
      console.error("Error processing recording:", err);
      setError(`Error: ${err.message}`);
      setStatus("error");
      
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 3000);
      
      return null;
    }
  }, []);

  const setupVoiceActivityDetection = useCallback((stream) => {
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
        return;
      }

      analyser.getByteTimeDomainData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const currentVolume = rms;

      setVolume(currentVolume);

      // Improved thresholds for better speech detection
      const SILENCE_THRESHOLD = 0.006;  // Slightly higher to avoid background noise
      const SPEECH_THRESHOLD = 0.020;    // Reasonable threshold to detect actual speech
      const MIN_SPEECH_DURATION = 250;  // Require at least 250ms of continuous speech
      
      // Track speech duration
      if (!window._speechStartTime) {
        window._speechStartTime = null;
      }

      // Detect if user is actually speaking (sustained speech)
      if (currentVolume > SPEECH_THRESHOLD) {
        if (!window._speechStartTime) {
          window._speechStartTime = Date.now();
        } else {
          const speechDuration = Date.now() - window._speechStartTime;
          if (speechDuration >= MIN_SPEECH_DURATION) {
            hasSpeechDetectedRef.current = true;
          }
        }
        silenceStartRef.current = null;  // Reset silence counter during active speech
      } else if (currentVolume < SILENCE_THRESHOLD) {
        // Silence detected
        window._speechStartTime = null;
        
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        }

        const silenceDuration = Date.now() - silenceStartRef.current;

        // Auto-stop after 700ms of silence, but ONLY if speech was detected
        // OPTIMIZATION: Reduced from 1300ms to 700ms for faster response (saves ~600ms!)
        if (silenceDuration > 700 && hasSpeechDetectedRef.current && audioChunksRef.current.length > 0) {
          console.log("Speech detected and silence for 0.7s, auto-processing...");
          clearInterval(volumeCheckIntervalRef.current);
          window._speechStartTime = null;
          
          // Stop recording
          cleanupVoiceActivityDetection();
          
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        }
      } else {
        // Volume between thresholds - DON'T reset silence if already counting
        // This allows silence detection to continue when volume gradually decreases
        window._speechStartTime = null;
      }
    }, 100);
  }, [cleanupVoiceActivityDetection]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setStatus("listening");
      setTranscript("Listening... Just speak naturally!");

      // Request microphone access
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

      // Create MediaRecorder
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

      mediaRecorder.start(100);
      console.log("Recording started");

      // Setup Voice Activity Detection
      setupVoiceActivityDetection(stream);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please grant permission.");
      setStatus("error");
    }
  }, [setupVoiceActivityDetection, processRecording]);

  const cleanup = useCallback(() => {
    stopRecording();
    audioChunksRef.current = [];
  }, [stopRecording]);

  return {
    status,
    transcript,
    volume,
    error,
    startRecording,
    stopRecording,
    cleanup,
  };
}
