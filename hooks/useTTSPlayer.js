/**
 * Custom hook for text-to-speech playback
 * Wraps QueuedAudioPlayer for React integration with streaming text handling
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { QueuedAudioPlayer } from '@/lib/audioPlayer';

export function useTTSPlayer() {
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioPlayerRef = useRef(null);
  const spokenUpToIndexRef = useRef(0);
  const processTimeoutRef = useRef(null);
  const isCompleteRef = useRef(false);

  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new QueuedAudioPlayer();
    
    audioPlayerRef.current.onStart = () => {
      setSpeaking(true);
    };
    
    audioPlayerRef.current.onEnd = () => {
      setSpeaking(false);
      setVolume(0);
    };

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.cleanup();
      }
      if (processTimeoutRef.current) {
        clearTimeout(processTimeoutRef.current);
      }
    };
  }, []);

  // Volume animation when speaking - using interval instead of RAF to prevent infinite loops
  useEffect(() => {
    if (!speaking) {
      setVolume(0);
      return;
    }

    let phase = 0;
    const intervalId = setInterval(() => {
      phase += 0.1;
      const simVolume = Math.abs(Math.sin(phase)) * 0.5 + 0.2;
      setVolume(simVolume);
    }, 50); // Update every 50ms (20 fps - smooth enough for visual effect)
    
    return () => {
      clearInterval(intervalId);
    };
  }, [speaking]);

  const extractNextSegment = useCallback((text, startIndex, isComplete = false) => {
    const remaining = text.substring(startIndex);
    if (remaining.length === 0) return null;

    const isFirstSegment = spokenUpToIndexRef.current === 0;
    
    // ULTRA-AGGRESSIVE for ZERO LATENCY
    // Start speaking IMMEDIATELY when text arrives!
    const MIN_FIRST_SEGMENT = 30;    // INSTANT START - just 10 chars!
    const MIN_SEGMENT = 50;           // Fast continuation
    const MAX_SEGMENT = 200;          // Reasonable max size
    
    // Priority 1: FIRST SEGMENT - Start IMMEDIATELY with minimal text
    if (isFirstSegment && remaining.length >= MIN_FIRST_SEGMENT) {
      // Look for ANY natural break (space, comma, period, etc.) after 10 chars
      const breakMatch = remaining.substring(MIN_FIRST_SEGMENT).match(/[\s.,!?;:]/);
      
      if (breakMatch) {
        const endPos = MIN_FIRST_SEGMENT + breakMatch.index + 1;
        const segment = remaining.substring(0, endPos).trim();
        if (segment.length >= 8) {  // Minimum 8 chars to avoid tiny fragments
          console.log(`🚀 INSTANT START: "${segment}"`);
          return segment;
        }
      }
      
      // If no break found but we have 20+ chars, just take it!
      if (remaining.length >= 20) {
        const spacePos = remaining.substring(15, 25).indexOf(' ');
        if (spacePos !== -1) {
          const segment = remaining.substring(0, 15 + spacePos).trim();
          console.log(`🚀 QUICK START: "${segment}"`);
          return segment;
        }
      }
    }
    
    // Priority 2: Complete sentences (. ! ?)
    const sentenceMatches = [...remaining.matchAll(/[.!?]\s+/g)];
    
    if (sentenceMatches.length > 0) {
      for (const match of sentenceMatches) {
        const endPos = match.index + match[0].length;
        
        // For first segment: accept if >= MIN_FIRST_SEGMENT (very low!)
        if (isFirstSegment && endPos >= MIN_FIRST_SEGMENT) {
          return remaining.substring(0, endPos).trim();
        }
        
        // For subsequent segments: accept if >= MIN_SEGMENT
        if (!isFirstSegment && endPos >= MIN_SEGMENT) {
          return remaining.substring(0, endPos).trim();
        }
        
        // Accept shorter if it's the last segment
        if (isComplete && endPos >= 10) {
          return remaining.substring(0, endPos).trim();
        }
      }
    }
    
    // Priority 3: Major pauses (comma, semicolon, colon)
    if (remaining.length >= 50) {
      const pauseMatches = [...remaining.matchAll(/[,;:]\s+/g)];
      
      for (const match of pauseMatches) {
        const endPos = match.index + match[0].length;
        
        // Accept if we have reasonable text length
        if (endPos >= 40 && endPos <= MAX_SEGMENT) {
          return remaining.substring(0, endPos).trim();
        }
      }
    }
    
    // Priority 4: Force split at word boundary if too long
    if (remaining.length >= MAX_SEGMENT) {
      const chunk = remaining.substring(0, MAX_SEGMENT);
      const lastSpace = chunk.lastIndexOf(" ");
      
      if (lastSpace > MAX_SEGMENT * 0.6) {
        return chunk.substring(0, lastSpace).trim();
      }
    }
    
    // Priority 5: If streaming is complete, speak what's left
    if (isComplete && remaining.length >= 8) {
      return remaining.trim();
    }
    
    // Otherwise, wait for more text
    return null;
  }, []);

  const processNextSegment = useCallback((fullText, forceComplete = false) => {
    const spokenUpTo = spokenUpToIndexRef.current;

    if (spokenUpTo >= fullText.length) {
      processTimeoutRef.current = null;
      return;
    }

    const isComplete = forceComplete || isCompleteRef.current;
    const segment = extractNextSegment(fullText, spokenUpTo, isComplete);

    if (segment) {
      console.log("TTS: Processing segment:", segment.substring(0, 80) + "...");
      spokenUpToIndexRef.current += segment.length;
      audioPlayerRef.current.addToQueue(segment.trim());
      
      // Check if there's more - IMMEDIATE processing (no delay!)
      if (spokenUpToIndexRef.current < fullText.length) {
        // Use immediate timeout (0ms) for instant processing
        processTimeoutRef.current = setTimeout(() => {
          processTimeoutRef.current = null;
          processNextSegment(fullText, forceComplete);
        }, 0);
      } else {
        processTimeoutRef.current = null;
      }
    } else {
      // No segment extracted - wait for more text or completion
      processTimeoutRef.current = null;
    }
  }, [extractNextSegment]);

  const speakStreaming = useCallback((text) => {
    // Process streaming text in segments - AGGRESSIVE for low latency
    if (text && text.length > 0 && spokenUpToIndexRef.current < text.length) {
      // Clear any pending timeout
      if (processTimeoutRef.current !== null) {
        clearTimeout(processTimeoutRef.current);
        processTimeoutRef.current = null;
      }
      
      // Process immediately
      processNextSegment(text);
    }
  }, [processNextSegment]);

  const speakComplete = useCallback(async (text) => {
    // Speak entire text at once (for complete responses)
    if (text && text.trim().length > 0) {
      spokenUpToIndexRef.current = 0;
      await audioPlayerRef.current.addToQueue(text.trim());
    }
  }, []);

  const stop = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
    }
    if (processTimeoutRef.current) {
      clearTimeout(processTimeoutRef.current);
      processTimeoutRef.current = null;
    }
    setSpeaking(false);
    setVolume(0);
  }, []);

  const flushRemaining = useCallback((fullText) => {
    // Called when streaming is complete - speak any remaining text
    console.log("TTS: Flushing remaining text");
    isCompleteRef.current = true;
    
    // Process remaining text with completion flag
    if (spokenUpToIndexRef.current < fullText.length) {
      processNextSegment(fullText, true);
    }
  }, [processNextSegment]);

  const reset = useCallback(() => {
    console.log("TTS Player reset called");
    spokenUpToIndexRef.current = 0;
    isCompleteRef.current = false;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.clear();
    }
    if (processTimeoutRef.current) {
      clearTimeout(processTimeoutRef.current);
      processTimeoutRef.current = null;
    }
  }, []);

  const waitForPlaybackComplete = useCallback(async () => {
    while (audioPlayerRef.current?.isProcessing || speaking) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [speaking]);

  const resume = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.resume();
    }
  }, []);

  return {
    speaking,
    volume,
    speakStreaming,
    speakComplete,
    flushRemaining,
    stop,
    reset,
    waitForPlaybackComplete,
    resume,
  };
}
