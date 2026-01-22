/**
 * Text Chunker for TTS
 * Intelligently chunks streaming text into speakable segments
 * Follows PDF requirements: sentence boundaries, size limits, time fallback
 */

export class TextChunker {
  constructor(onChunk) {
    this.onChunk = onChunk; // Callback when chunk is ready
    this.buffer = '';
    this.lastDispatchTime = Date.now();
    this.streamEnded = false;
    this.timeoutId = null;
    this.hasDispatched = false;
  }

  /**
   * Add new text fragment from stream
   */
  add(text) {
    if (this.buffer && /\d\.$/.test(this.buffer) && text) {
      if (!/^\d/.test(text)) {
        const pending = this.buffer.trim();
        if (pending.length > 0) {
          this.dispatchChunk(pending);
        }
        this.buffer = '';
      }
    }
    this.buffer += text;
    this.lastDispatchTime = Date.now();
    
    // Try to extract chunks
    this.tryExtractChunks();
    
    // Set/reset timeout for fallback dispatch
    this.resetTimeout();
  }

  /**
   * Try to extract complete chunks from buffer
   */
  tryExtractChunks() {
    while (this.buffer.length > 0) {
      const minChunkChars = this.hasDispatched ? 60 : 12;
      const maxChunkChars = this.hasDispatched ? 240 : 180;

      // Primary: Look for sentence boundaries
      const sentenceMatch = this.buffer.match(/^(.*?[.?!…]+(?:\s|$))/s);
      
      if (sentenceMatch) {
        const rawChunk = sentenceMatch[1];
        const looksLikeDecimalSplit =
          !this.streamEnded &&
          rawChunk.length === this.buffer.length &&
          /\d\.$/.test(rawChunk);
        if (looksLikeDecimalSplit) {
          break;
        }
        const chunk = rawChunk.trim();
        const tooShort =
          !this.streamEnded &&
          this.hasDispatched &&
          chunk.length < minChunkChars;
        const bufferLong = this.buffer.length > maxChunkChars;
        if (chunk.length > 0 && (!tooShort || bufferLong)) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(rawChunk.length);
          continue;
        }
      }

      // Secondary: Look for newlines
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const chunk = this.buffer.substring(0, newlineIndex).trim();
        if (chunk.length >= minChunkChars || this.streamEnded) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(newlineIndex + 1);
          continue;
        }
      }

      // Fallback: If buffer exceeds max chars, cut at whitespace (more aggressive)
      if (this.buffer.length > maxChunkChars) {
        // Find last whitespace before max chars
        let cutPoint = maxChunkChars;
        for (let i = maxChunkChars; i >= 0; i--) {
          if (/\s/.test(this.buffer[i])) {
            cutPoint = i;
            break;
          }
        }
        
        const chunk = this.buffer.substring(0, cutPoint).trim();
        if (chunk.length >= minChunkChars || this.streamEnded) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(cutPoint);
          continue;
        }
      }

      // No more chunks to extract
      break;
    }
  }

  /**
   * Reset timeout for fallback dispatch
   */
  resetTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const timeoutMs = this.hasDispatched ? 350 : 80;
    const minTimeoutChars = this.hasDispatched ? 50 : 12;

    // Dispatch after a short idle if nothing else triggers
    this.timeoutId = setTimeout(() => {
      if (this.buffer.trim().length >= minTimeoutChars && !this.streamEnded) {
        // Find a good cut point (whitespace)
        let cutPoint = this.buffer.length;
        for (let i = this.buffer.length - 1; i >= 0; i--) {
          if (/\s/.test(this.buffer[i])) {
            cutPoint = i;
            break;
          }
        }
        
        const chunk = this.buffer.substring(0, cutPoint).trim();
        if (chunk.length > 0) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(cutPoint);
        }
      }
    }, timeoutMs);
  }

  /**
   * Dispatch a chunk
   */
  dispatchChunk(chunk) {
    if (chunk.length === 0) return;
    
    this.onChunk(chunk);
    this.lastDispatchTime = Date.now();
    this.hasDispatched = true;
  }

  /**
   * Signal that stream has ended, flush remaining buffer
   */
  end() {
    this.streamEnded = true;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Flush any remaining text
    const remaining = this.buffer.trim();
    if (remaining.length > 0) {
      this.dispatchChunk(remaining);
    }
    
    this.buffer = '';
  }

  /**
   * Clear and reset
   */
  reset() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.buffer = '';
    this.streamEnded = false;
    this.lastDispatchTime = Date.now();
    this.hasDispatched = false;
  }
}
