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
    if (!speaking) {
      setVolume(0);
      return;
    }

    let phase = 0;
    const intervalId = setInterval(() => {
      phase += 0.1;
      const simVolume = Math.abs(Math.sin(phase)) * 0.5 + 0.2;
      setVolume(simVolume);
    }, 50);
    
    return () => {
      clearInterval(intervalId);
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
    const MIN_FIRST_CHUNK = 60;     // Start speaking quickly (after ~10 words)
    const MIN_CHUNK = 40;            // Minimum for subsequent chunks
    const MAX_CHUNK = 150;           // Maximum before forcing split
    
    // For first chunk: Start speaking ASAP without waiting for perfect punctuation
    if (isFirstChunk && remaining.length >= MIN_FIRST_CHUNK) {
      // Look for sentence end first
      const sentenceMatch = remaining.substring(0, 120).match(/[.!?]\s+/);
      if (sentenceMatch) {
        const chunk = remaining.substring(0, sentenceMatch.index + sentenceMatch[0].length).trim();
        console.log(`🎯 [TTS] First chunk with punctuation (${chunk.length} chars)`);
        return chunk;
      }
      
      // No sentence end yet - cut at word boundary to start speaking
      const spaceIndex = remaining.substring(MIN_FIRST_CHUNK, MIN_FIRST_CHUNK + 40).indexOf(' ');
      if (spaceIndex > 0) {
        const chunk = remaining.substring(0, MIN_FIRST_CHUNK + spaceIndex).trim();
        console.log(`🎯 [TTS] First chunk at word boundary (${chunk.length} chars, no punctuation)`);
        return chunk;
      }
    }
    
    // Look for sentence boundaries (. ! ?)
    const sentenceMatches = [...remaining.matchAll(/[.!?]\s+/g)];
    
    for (const match of sentenceMatches) {
      const endPos = match.index + match[0].length;
      
      if (endPos >= MIN_CHUNK) {
        const chunk = remaining.substring(0, endPos).trim();
        console.log(`🎯 [TTS] Chunk at sentence (${chunk.length} chars)`);
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
          console.log(`🎯 [TTS] Chunk at pause (${chunk.length} chars)`);
          return chunk;
        }
      }
    }
    
    // Force split if too long
    if (remaining.length >= MAX_CHUNK) {
      const cutPoint = remaining.substring(0, MAX_CHUNK).lastIndexOf(' ');
      if (cutPoint > MAX_CHUNK * 0.6) {
        const chunk = remaining.substring(0, cutPoint).trim();
        console.log(`🎯 [TTS] Forced chunk split (${chunk.length} chars)`);
        return chunk;
      }
    }
    
    // If complete, speak remaining text
    if (forceComplete && remaining.trim().length >= 10) {
      console.log(`🎯 [TTS] Final chunk (${remaining.length} chars)`);
      return remaining.trim();
    }
    
    // Wait for more text
    console.log(`⏳ [TTS] Waiting for more text (have ${remaining.length} chars)`);
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
        console.log(`📤 [TTS] Sending chunk to MiniMax (${chunk.length} chars)`);
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
      console.log(`📤 [TTS] Speaking complete text (${text.length} chars)`);
      lastProcessedLengthRef.current = 0;
      audioPlayerRef.current.addToQueue(text.trim());
    }
  }, []);

  /**
   * Called when n8n streaming is complete - speak any remaining text
   */
  const flushRemaining = useCallback((fullText) => {
    console.log(`🔄 [TTS] Flushing remaining text (processed: ${lastProcessedLengthRef.current}, total: ${fullText.length})`);
    isCompleteRef.current = true;
    
    // Process any remaining text with completion flag
    if (lastProcessedLengthRef.current < fullText.length) {
      speakStreaming(fullText);
    }
  }, [speakStreaming]);

  /**
   * Stop playback immediately
   */
  const stop = useCallback(() => {
    console.log('🛑 [TTS] Stop requested');
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
    console.log('🔄 [TTS] Reset');
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
    console.log('▶️ [TTS] Resume');
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
