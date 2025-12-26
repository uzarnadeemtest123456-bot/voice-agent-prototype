/**
 * Simplified TTS Player Hook for MiniMax Streaming
 * Redesigned for minimal latency: n8n streams text → immediately send to MiniMax → stream audio
 * 
 * No complex segmentation - n8n provides chunks, we send them immediately
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { QueuedAudioPlayer } from '@/lib/audioPlayer';

export function useTTSPlayer() {
  const [speaking, setSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioPlayerRef = useRef(null);
  const lastProcessedLengthRef = useRef(0);
  const isCompleteRef = useRef(false);
  const volumeIntervalRef = useRef(null);

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
    };
  }, []);

  // Visual volume animation when speaking
  useEffect(() => {
    // Clear any existing interval
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    if (!speaking) {
      setVolume(0);
      return;
    }

    let phase = 0;
    volumeIntervalRef.current = setInterval(() => {
      phase += 0.1;
      const simVolume = Math.abs(Math.sin(phase)) * 0.5 + 0.2;
      setVolume(simVolume);
    }, 50);
    
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [speaking]);

  /**
   * Extract next speakable chunk from streaming text
   * Strategy: Look for sentence boundaries to create natural-sounding segments
   */
  const extractNextChunk = useCallback((fullText, startIndex, forceComplete = false) => {
    const remaining = fullText.substring(startIndex);
    
    if (remaining.length === 0) {
      return null;
    }

    const isFirstChunk = startIndex === 0;
    
    // Configuration
    const MIN_FIRST_CHUNK = 15;     // Start speaking quickly (after ~10 words)
    const MIN_CHUNK = 20;            // Minimum for subsequent chunks
    const MAX_CHUNK = 80;           // Maximum before forcing split
    
    // For first chunk: Start speaking ASAP without waiting for perfect punctuation
    if (isFirstChunk && remaining.length >= MIN_FIRST_CHUNK) {
      // Look for sentence end first
      const sentenceMatch = remaining.substring(0, 120).match(/[.!?]\s+/);
      if (sentenceMatch) {
        const chunk = remaining.substring(0, sentenceMatch.index + sentenceMatch[0].length).trim();
        return chunk;
      }
      
      // No sentence end yet - cut at word boundary to start speaking
      const spaceIndex = remaining.substring(MIN_FIRST_CHUNK, MIN_FIRST_CHUNK + 40).indexOf(' ');
      if (spaceIndex > 0) {
        const chunk = remaining.substring(0, MIN_FIRST_CHUNK + spaceIndex).trim();
        return chunk;
      }
    }
    
    // Look for sentence boundaries (. ! ?)
    const sentenceMatches = [...remaining.matchAll(/[.!?]\s+/g)];
    
    for (const match of sentenceMatches) {
      const endPos = match.index + match[0].length;
      
      if (endPos >= MIN_CHUNK) {
        const chunk = remaining.substring(0, endPos).trim();
        return chunk;
      }
    }
    
    // Look for comma/pause boundaries
    if (remaining.length >= MIN_CHUNK) {
      const pauseMatches = [...remaining.matchAll(/[,;:]\s+/g)];
      
      for (const match of pauseMatches) {
        const endPos = match.index + match[0].length;
        
        if (endPos >= MIN_CHUNK && endPos <= MAX_CHUNK) {
          const chunk = remaining.substring(0, endPos).trim();
          return chunk;
        }
      }
    }
    
    // Force split if too long
    if (remaining.length >= MAX_CHUNK) {
      const cutPoint = remaining.substring(0, MAX_CHUNK).lastIndexOf(' ');
      if (cutPoint > MAX_CHUNK * 0.6) {
        const chunk = remaining.substring(0, cutPoint).trim();
        return chunk;
      }
    }
    
    // If complete, speak remaining text
    if (forceComplete && remaining.trim().length >= 10) {
      return remaining.trim();
    }
    
    // Wait for more text
    return null;
  }, []);

  /**
   * Process streaming text as it arrives from n8n
   * Extracts chunks and sends them immediately to MiniMax
   */
  const speakStreaming = useCallback((text) => {
    if (!text || text.length === 0) return;
    
    const lastProcessed = lastProcessedLengthRef.current;
    
    // Only process new text that arrived
    if (lastProcessed >= text.length) {
      return;
    }
    
    // Extract and queue chunks immediately
    while (lastProcessedLengthRef.current < text.length) {
      const chunk = extractNextChunk(text, lastProcessedLengthRef.current, isCompleteRef.current);
      
      if (chunk) {
        lastProcessedLengthRef.current += chunk.length;
        
        // Skip any whitespace between chunks
        while (lastProcessedLengthRef.current < text.length && 
               /\s/.test(text[lastProcessedLengthRef.current])) {
          lastProcessedLengthRef.current++;
        }
        
        // Send to audio player immediately
        audioPlayerRef.current.addToQueue(chunk);
      } else {
        // No complete chunk yet, wait for more text
        break;
      }
    }
  }, [extractNextChunk]);

  /**
   * Speak complete text (for non-streaming scenarios)
   */
  const speakComplete = useCallback((text) => {
    if (text && text.trim().length > 0) {
      lastProcessedLengthRef.current = 0;
      audioPlayerRef.current.addToQueue(text.trim());
    }
  }, []);

  /**
   * Called when n8n streaming is complete - speak any remaining text
   */
  const flushRemaining = useCallback((fullText) => {
    isCompleteRef.current = true;
    
    // Process any remaining text with completion flag
    if (lastProcessedLengthRef.current < fullText.length) {
      speakStreaming(fullText);
    }
    
    // Signal to audio player that all segments have been queued
    // This allows the MediaSource to close properly after playback
    if (audioPlayerRef.current) {
      // Set flag after a tiny delay to ensure the last speakStreaming call completes
      setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.allSegmentsFetched = true;
          audioPlayerRef.current.checkStreamComplete();
        }
      }, 10);
    }
  }, [speakStreaming]);

  /**
   * Stop playback immediately
   */
  const stop = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
    }
    setSpeaking(false);
    setVolume(0);
  }, []);

  /**
   * Reset state for new conversation
   */
  const reset = useCallback(() => {
    lastProcessedLengthRef.current = 0;
    isCompleteRef.current = false;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.clear();
    }
  }, []);

  /**
   * Wait for all playback to complete
   */
  const waitForPlaybackComplete = useCallback(async () => {
    while (audioPlayerRef.current?.isProcessing || speaking) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [speaking]);

  /**
   * Resume playback
   */
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
