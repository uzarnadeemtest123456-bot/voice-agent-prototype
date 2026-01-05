/**
 * Universal Streaming Audio Player using Web Audio API
 * Production-grade MP3 chunk decoding with proper buffering and fade handling
 * Works on ALL browsers: Chrome, Firefox, Safari, Edge, iOS Safari
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
    
    // Playback generation ID (prevents ghost audio from old async operations)
    this.playbackId = 0;
    
    // MP3 chunk accumulation with proper buffering
    this.pendingChunks = [];
    this.pendingBytes = 0;
    this.MIN_DECODE_BYTES = 160 * 1024; // 160KB - much safer for MP3 frame boundaries
    this.FIRST_CHUNK_DECODE_BYTES = 80 * 1024; // 80KB for first chunk (faster start)
    this.MAX_DECODE_BYTES = 512 * 1024; // 512KB - avoid huge latency
    this.isDecoding = false;
    this.isFirstChunk = true; // Track if this is the first chunk
    
    // Proper jitter buffer (not comedy 10ms)
    this.SCHEDULE_AHEAD_TIME = 0.25; // 250ms buffer for decode jitter
    this.FIRST_CHUNK_SCHEDULE = 0.10; // 100ms for first chunk (faster start)
    this.MIN_BUFFER_SEC = 0.20; // Don't start until 200ms queued
    this.FIRST_CHUNK_BUFFER = 0.05; // 50ms for first chunk (faster start)
    
    // Fade times to eliminate clicks/pops
    this.FADE_IN_TIME = 0.008; // 8ms fade in
    this.FADE_OUT_TIME = 0.008; // 8ms fade out
    
    // Track queued duration for buffer headroom
    this.queuedDuration = 0;
  }

  /**
   * Initialize Web Audio API context
   */
  async initializeAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ Web Audio API initialized');
    }
    
    // Resume if suspended (required for iOS/Safari)
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

    // Increment playback ID to invalidate old async operations
    this.playbackId++;
    const myPlaybackId = this.playbackId;

    // Reset all state for new query
    this.stopRequested = false;
    this.isFetching = true;
    this.streamActive = true;
    this.hasStartedPlaying = false;
    this.audioQueue = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.scheduledEndTime = 0;
    this.queuedDuration = 0;
    this.isFirstChunk = true; // Reset for new session

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

      // Start receiving and playing audio (pass playback ID)
      this.receiveAndPlayAudio(response, myPlaybackId);

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

    // Increment playback ID
    this.playbackId++;
    const myPlaybackId = this.playbackId;

    // Reset all state for new query
    this.stopRequested = false;
    this.isFetching = true;
    this.hasStartedPlaying = false;
    this.audioQueue = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.scheduledEndTime = 0;
    this.queuedDuration = 0;

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

      // Start receiving and playing audio (pass playback ID)
      await this.receiveAndPlayAudio(response, myPlaybackId);

    } catch (error) {
      console.error('Error streaming TTS:', error);
      this.isFetching = false;
      throw error;
    }
  }

  /**
   * Receive audio chunks and decode/schedule for playback
   * Uses proper buffering and playback ID to prevent ghost audio
   */
  async receiveAndPlayAudio(response, playbackId) {
    const reader = response.body.getReader();
    let receivedBytes = 0;
    
    // Reset chunk accumulation
    this.pendingChunks = [];
    this.pendingBytes = 0;

    try {
      while (true) {
        // Check if this playback session is still valid
        if (this.playbackId !== playbackId) {
          console.log('⚠️ Playback session invalidated');
          break;
        }

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
            await this.flushPendingChunks(playbackId);
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
        
        // Accumulate chunks (CRITICAL FIX: use slice() to avoid buffer pooling garbage)
        this.pendingChunks.push(value.slice());
        this.pendingBytes += value.length;
        
        // Decode when we have enough data (proper MP3 frame boundaries)
        // Use lower threshold for first chunk (faster start)
        const decodeThreshold = this.isFirstChunk ? this.FIRST_CHUNK_DECODE_BYTES : this.MIN_DECODE_BYTES;
        if (this.pendingBytes >= decodeThreshold && this.pendingBytes <= this.MAX_DECODE_BYTES) {
          await this.flushPendingChunks(playbackId);
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
   * Proper buffering prevents MP3 frame boundary issues
   */
  async flushPendingChunks(playbackId) {
    if (this.pendingChunks.length === 0) return;
    
    // Check playback ID
    if (this.playbackId !== playbackId) return;
    
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
    
    // Decode and schedule (await to ensure sequential processing)
    await this.decodeAndScheduleChunk(combinedBuffer.buffer, playbackId);
    
    this.isDecoding = false;
  }

  /**
   * Decode MP3 chunk and schedule for gapless playback with fades
   * Implements proper scheduling buffer and fade-in/out to eliminate clicks
   */
  async decodeAndScheduleChunk(arrayBuffer, playbackId) {
    try {
      // Check playback ID before decode
      if (this.playbackId !== playbackId) return;
      
      // SAFARI FIX: Resume AudioContext if suspended (prevents silent playback)
      if (this.audioContext.state === 'suspended') {
        console.log('⚠️ AudioContext suspended, resuming...');
        await this.audioContext.resume();
      }
      
      // Validate MP3 data before decoding (basic check)
      if (!arrayBuffer || arrayBuffer.byteLength < 100) {
        console.warn('⚠️ Skipping invalid/tiny audio chunk');
        return;
      }
      
      // Decode the MP3 audio data with error handling
      let audioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        console.error('❌ Failed to decode audio chunk, skipping...', decodeError);
        // Don't advance nextPlayTime - skip this corrupted chunk
        return;
      }
      
      // Check playback ID after decode (async operation)
      if (this.playbackId !== playbackId) return;
      
      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create gain node for fade-in/out
      const gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Calculate when to start this chunk
      const currentTime = this.audioContext.currentTime;
      let startTime;
      
      // Proper scheduling with jitter buffer
      // Use shorter schedule ahead for first chunk (faster start)
      if (this.nextPlayTime === 0 || this.nextPlayTime < currentTime) {
        const scheduleAhead = this.isFirstChunk ? this.FIRST_CHUNK_SCHEDULE : this.SCHEDULE_AHEAD_TIME;
        startTime = currentTime + scheduleAhead;
        this.nextPlayTime = startTime;
      } else {
        startTime = this.nextPlayTime;
      }
      
      const endTime = startTime + audioBuffer.duration;
      
      // Apply fade-in/out to eliminate clicks and pops
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(1, startTime + this.FADE_IN_TIME);
      gainNode.gain.setValueAtTime(1, endTime - this.FADE_OUT_TIME);
      gainNode.gain.linearRampToValueAtTime(0, endTime);
      
      // Start playback at scheduled time
      source.start(startTime);
      
      // Track this source node
      this.currentSourceNodes.push(source);
      
      // Update queued duration
      this.queuedDuration = endTime - currentTime;
      
      // Update next play time for perfectly gapless playback
      this.nextPlayTime = endTime;
      this.scheduledEndTime = endTime;
      
      // Only start "playing" when we have buffer headroom
      // Use shorter buffer for first chunk (faster start)
      const bufferRequired = this.isFirstChunk ? this.FIRST_CHUNK_BUFFER : this.MIN_BUFFER_SEC;
      if (!this.hasStartedPlaying && this.queuedDuration >= bufferRequired) {
        this.hasStartedPlaying = true;
        this.isPlaying = true;
        if (this.onStart) {
          this.onStart();
        }
        console.log(`🎵 Started playback (buffered ${this.queuedDuration.toFixed(2)}s ahead, first=${this.isFirstChunk})`);
      }
      
      // Mark first chunk as processed
      if (this.isFirstChunk) {
        this.isFirstChunk = false;
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
      // Don't throw - keep trying with next chunks
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
   * Increments playback ID to invalidate all async operations
   */
  stop() {
    // Increment playback ID to invalidate async operations
    this.playbackId++;
    
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
    this.queuedDuration = 0;
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
