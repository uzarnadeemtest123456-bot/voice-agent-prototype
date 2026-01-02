/**
 * Universal Streaming Audio Player using Web Audio API
 * Works on ALL browsers: Chrome, Firefox, Safari, Edge, iOS Safari
 * Provides smooth, gapless MP3 playback without MediaSource
 */
export class StreamingAudioPlayer {
  constructor() {
    this.audioContext = null;
    this.audioQueue = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.isFetching = false;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.streamActive = false;
    this.sessionId = null;
    this.hasStartedPlaying = false;
    this.isCleaningUp = false;
    this.currentSourceNodes = [];
    this.scheduledEndTime = 0;
    // MP3 chunk accumulation for smooth playback
    this.pendingChunks = [];
    this.pendingBytes = 0;
    this.MIN_CHUNK_SIZE = 8192; // 8KB minimum before decoding
    this.isDecoding = false;
  }

  /**
   * Initialize Web Audio API context
   */
  async initializeAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ Web Audio API initialized');
    }
    
    // Resume if suspended (required for iOS)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Start a new incremental streaming session
   */
  async startIncrementalStream(initialText) {
    if (!initialText || initialText.trim().length === 0) {
      console.warn('No initial text to stream');
      return;
    }

    if (this.streamActive) {
      console.warn('Stream already active');
      return;
    }

    // Reset all state for new query
    this.stopRequested = false;
    this.isFetching = true;
    this.streamActive = true;
    this.hasStartedPlaying = false;
    this.audioQueue = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.scheduledEndTime = 0;

    // Initialize Web Audio API
    await this.initializeAudioContext();

    try {
      // Generate unique session ID
      const sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
      this.sessionId = sessionId;

      console.log(`📤 Starting incremental stream with session: ${sessionId}`);

      // Start initial request with first chunk
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: initialText, 
          sessionId: sessionId,
          isFirst: true,
          isLast: false 
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS Stream API failed: ${response.status}`);
      }

      // Get session ID from response headers
      const responseSessionId = response.headers.get('X-Session-Id');
      if (responseSessionId) {
        this.sessionId = responseSessionId;
      }

      console.log(`✅ Stream started with initial text (${initialText.length} chars)`);

      // Start receiving and playing audio
      this.receiveAndPlayAudio(response);

    } catch (error) {
      console.error('Error starting incremental stream:', error);
      this.isFetching = false;
      this.streamActive = false;
      this.sessionId = null;
      throw error;
    }
  }

  /**
   * Send additional text chunk to active stream
   */
  async sendTextChunk(text) {
    if (!this.sessionId || !this.streamActive) {
      console.warn('Stream not active');
      return;
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    try {
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: text, 
          sessionId: this.sessionId,
          isFirst: false,
          isLast: false 
        }),
      });

      if (!response.ok) {
        console.error('Failed to send text chunk:', response.status);
        return;
      }

      console.log(`📤 Sent text chunk (${text.length} chars)`);
    } catch (error) {
      console.error('Error sending text chunk:', error);
    }
  }

  /**
   * Signal end of text input and close stream
   */
  async endIncrementalStream() {
    if (!this.sessionId || !this.streamActive) {
      return;
    }

    try {
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: '', 
          sessionId: this.sessionId,
          isFirst: false,
          isLast: true 
        }),
      });

      if (!response.ok) {
        console.error('Failed to end stream:', response.status);
      }

      console.log('🏁 Stream ended');
      this.sessionId = null;
      this.streamActive = false;
    } catch (error) {
      console.error('Error ending stream:', error);
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async streamText(text) {
    if (!text || text.trim().length === 0) {
      console.warn('No text to stream');
      return;
    }

    // Reset all state for new query
    this.stopRequested = false;
    this.isFetching = true;
    this.hasStartedPlaying = false;
    this.audioQueue = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.scheduledEndTime = 0;

    // Initialize Web Audio API
    await this.initializeAudioContext();

    try {
      const response = await fetch('/api/tts-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text }),
      });

      if (!response.ok) {
        throw new Error(`TTS Stream API failed: ${response.status}`);
      }

      // Start receiving and playing audio
      await this.receiveAndPlayAudio(response);

    } catch (error) {
      console.error('Error streaming TTS:', error);
      this.isFetching = false;
      throw error;
    }
  }

  /**
   * Receive audio chunks and decode/schedule for playback
   * Uses Web Audio API with chunk accumulation for smooth playback
   */
  async receiveAndPlayAudio(response) {
    const reader = response.body.getReader();
    let receivedBytes = 0;
    
    // Reset chunk accumulation
    this.pendingChunks = [];
    this.pendingBytes = 0;

    try {
      while (true) {
        // Check if stopped
        if (this.stopRequested) {
          console.log('⚠️ Playback stopped');
          break;
        }

        const { done, value } = await reader.read();
        
        if (done) {
          console.log('✅ Audio stream completed');
          
          // Decode any remaining pending chunks
          if (this.pendingBytes > 0) {
            await this.flushPendingChunks();
          }
          
          this.isFetching = false;
          
          // Wait for all scheduled audio to finish
          await this.waitForPlaybackComplete();
          
          if (this.onEnd) {
            this.onEnd();
          }
          break;
        }

        receivedBytes += value.length;
        
        // Accumulate chunks
        this.pendingChunks.push(new Uint8Array(value.buffer));
        this.pendingBytes += value.length;
        
        // Decode when we have enough data (reduces stutters from tiny chunks)
        if (this.pendingBytes >= this.MIN_CHUNK_SIZE) {
          await this.flushPendingChunks();
        }
      }

      this.isFetching = false;

    } catch (error) {
      console.error('Error receiving audio:', error);
      this.isFetching = false;
    }
  }
  
  /**
   * Flush accumulated chunks and decode them
   * FIXED: Await decode to prevent concurrent decoding (Firefox compatibility)
   */
  async flushPendingChunks() {
    if (this.pendingChunks.length === 0) return;
    
    // Prevent concurrent decodes
    if (this.isDecoding) return;
    
    this.isDecoding = true;
    
    // Combine all pending chunks into one buffer
    const combinedBuffer = new Uint8Array(this.pendingBytes);
    let offset = 0;
    for (const chunk of this.pendingChunks) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Reset pending
    this.pendingChunks = [];
    this.pendingBytes = 0;
    
    // Await decode to ensure sequential processing (prevents Firefox corruption)
    await this.decodeAndScheduleChunk(combinedBuffer.buffer);
    
    this.isDecoding = false;
  }

  /**
   * Decode MP3 chunk and schedule for gapless playback
   */
  async decodeAndScheduleChunk(arrayBuffer) {
    try {
      // Decode the MP3 audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      // Calculate when to start this chunk
      const currentTime = this.audioContext.currentTime;
      
      // If this is the first chunk or we're catching up
      if (this.nextPlayTime === 0 || this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      // Start playback at scheduled time (no overlap to prevent audio corruption)
      source.start(this.nextPlayTime);
      
      // Track this source node
      this.currentSourceNodes.push(source);
      
      // Update next play time for gapless playback
      this.nextPlayTime += audioBuffer.duration;
      this.scheduledEndTime = this.nextPlayTime;
      
      // Call onStart for first chunk
      if (!this.hasStartedPlaying) {
        this.hasStartedPlaying = true;
        this.isPlaying = true;
        if (this.onStart) {
          this.onStart();
        }
        console.log(`🎵 Started playback (Web Audio API with chunk accumulation)`);
      }
      
      // Clean up source node when it finishes
      source.onended = () => {
        const index = this.currentSourceNodes.indexOf(source);
        if (index > -1) {
          this.currentSourceNodes.splice(index, 1);
        }
        
        // If no more sources playing and fetching is done, mark as complete
        if (this.currentSourceNodes.length === 0 && !this.isFetching) {
          this.isPlaying = false;
        }
      };
      
    } catch (error) {
      console.error('Error decoding audio chunk:', error);
    }
  }

  /**
   * Wait for all scheduled audio to finish playing
   */
  async waitForPlaybackComplete() {
    // Wait until all scheduled audio has finished
    while (this.isPlaying || this.currentSourceNodes.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Stop playback immediately
   */
  stop() {
    this.stopRequested = true;
    this.isPlaying = false;
    
    // Stop all currently playing source nodes
    for (const source of this.currentSourceNodes) {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    }
    this.currentSourceNodes = [];
    
    this.isFetching = false;
    this.hasStartedPlaying = false;
    this.nextPlayTime = 0;
    this.scheduledEndTime = 0;
  }

  /**
   * Resume after stop
   */
  resume() {
    this.stopRequested = false;
  }

  /**
   * Clear audio queue and reset for next query
   */
  clear() {
    console.log('🧹 Clearing audio player state');
    this.stop();
    this.audioQueue = [];
  }

  /**
   * Check if currently processing
   */
  get isProcessing() {
    return this.isFetching || this.isPlaying || this.currentSourceNodes.length > 0;
  }

  /**
   * Clean up all resources (called on component unmount)
   */
  cleanup() {
    this.stop();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.audioQueue = [];
    this.currentSourceNodes = [];
  }
}
