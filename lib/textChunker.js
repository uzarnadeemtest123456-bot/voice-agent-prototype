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
  }

  /**
   * Add new text fragment from stream
   */
  add(text) {
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
      // Primary: Look for sentence boundaries
      const sentenceMatch = this.buffer.match(/^(.*?[.?!…]+(?:\s|$))/s);
      
      if (sentenceMatch) {
        const chunk = sentenceMatch[1].trim();
        // Always dispatch complete sentences (even short ones)
        if (chunk.length > 0) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(sentenceMatch[1].length);
          continue;
        }
      }

      // Secondary: Look for newlines
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const chunk = this.buffer.substring(0, newlineIndex).trim();
        if (chunk.length >= 30 || this.streamEnded) {
          this.dispatchChunk(chunk);
          this.buffer = this.buffer.substring(newlineIndex + 1);
          continue;
        }
      }

      // Fallback: If buffer exceeds 160 chars, cut at whitespace (more aggressive)
      if (this.buffer.length > 160) {
        // Find last whitespace before 160 chars
        let cutPoint = 160;
        for (let i = 160; i >= 0; i--) {
          if (/\s/.test(this.buffer[i])) {
            cutPoint = i;
            break;
          }
        }
        
        const chunk = this.buffer.substring(0, cutPoint).trim();
        if (chunk.length >= 30 || this.streamEnded) {
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

    // Dispatch after 250ms if nothing else triggers (fast first words)
    this.timeoutId = setTimeout(() => {
      if (this.buffer.trim().length >= 24 && !this.streamEnded) {
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
    }, 150);
  }

  /**
   * Dispatch a chunk
   */
  dispatchChunk(chunk) {
    if (chunk.length === 0) return;
    
    this.onChunk(chunk);
    this.lastDispatchTime = Date.now();
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
  }
}
