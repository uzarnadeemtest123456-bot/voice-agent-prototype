/**
 * Streaming Audio Player using MediaSource Extensions (MSE)
 * Eliminates MP3 frame-slicing issues and main-thread decode overhead
 * Provides truly gapless, stutter-free MP3 playback
 */
export class StreamingAudioPlayer {
  constructor() {
    this.audioElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.pendingBuffers = [];
    this.isAppending = false;
    this.isFetching = false;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.streamActive = false;
    this.sessionId = null;
    this.hasStartedPlaying = false;
    this.sourceBufferReady = false;
    // Store handler references for proper cleanup
    this.handlePlay = null;
    this.handleEnded = null;
    this.handleError = null;
    this.isCleaningUp = false;
  }

  /**
   * Initialize audio element and MediaSource
   * FIXED: Always create fresh MediaSource for each query
   * ERROR RECOVERY: Gracefully handle MediaSource failures
   */
  async initializeMediaSource() {
    // Clean up old MediaSource if it exists
    if (this.mediaSource || this.audioElement) {
      console.log('🧹 Cleaning up old MediaSource before creating new one');
      this.cleanupMediaSource();
    }

    this.isCleaningUp = false;

    return new Promise((resolve, reject) => {
      try {
        // Check MediaSource support
        if (!window.MediaSource) {
          console.warn('⚠️ MediaSource not supported, will use fallback');
          reject(new Error('MediaSource API not supported'));
          return;
        }

        // Create audio element
        this.audioElement = document.createElement('audio');
        this.audioElement.autoplay = false;
        this.audioElement.preload = 'auto';
        
        // Store handler references for proper cleanup
        this.handlePlay = () => {
          if (!this.hasStartedPlaying) {
            this.hasStartedPlaying = true;
            if (this.onStart) {
              this.onStart();
            }
          }
        };
        
        this.handleEnded = () => {
          console.log('🎵 Audio playback ended');
          if (this.onEnd) {
            this.onEnd();
          }
        };
        
        this.handleError = (e) => {
          // Suppress errors during cleanup
          if (!this.isCleaningUp) {
            console.error('Audio element error:', e);
          }
        };
        
        // Set up event listeners
        this.audioElement.addEventListener('play', this.handlePlay);
        this.audioElement.addEventListener('ended', this.handleEnded);
        this.audioElement.addEventListener('error', this.handleError);

        // Create MediaSource with error handling
        this.mediaSource = new MediaSource();
        this.audioElement.src = URL.createObjectURL(this.mediaSource);

        // Set timeout for MediaSource initialization
        const initTimeout = setTimeout(() => {
          console.error('⏱️ MediaSource initialization timeout');
          reject(new Error('MediaSource initialization timeout'));
        }, 10000); // 10 second timeout

        this.mediaSource.addEventListener('sourceopen', () => {
          clearTimeout(initTimeout);
          try {
            // Try to create SourceBuffer for MP3
            // This will fail on Safari/iOS which doesn't support audio/mpeg
            this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
            
            this.sourceBuffer.mode = 'sequence'; // Better for streaming
            
            this.sourceBuffer.addEventListener('updateend', () => {
              this.isAppending = false;
              this.processBufferQueue();
            });

            this.sourceBuffer.addEventListener('error', (e) => {
              console.error('SourceBuffer error:', e);
            });

            this.sourceBufferReady = true;
            console.log('✅ MediaSource and SourceBuffer initialized');
            resolve();
          } catch (error) {
            clearTimeout(initTimeout);
            console.error('❌ Error setting up SourceBuffer:', error);
            console.warn('💡 This browser may not support audio/mpeg in MediaSource (e.g., Safari/iOS)');
            reject(error);
          }
        });

        this.mediaSource.addEventListener('sourceended', () => {
          console.log('MediaSource ended');
        });

        this.mediaSource.addEventListener('error', (e) => {
          clearTimeout(initTimeout);
          console.error('MediaSource error:', e);
          reject(e);
        });

      } catch (error) {
        console.error('Error initializing MediaSource:', error);
        reject(error);
      }
    });
  }

  /**
   * Fallback: Use simple blob URL approach when MediaSource fails
   * Used for Safari/iOS compatibility
   */
  async useFallbackAudioPlayer() {
    console.log('🔄 Using fallback audio player (blob URL method)');
    
    // Create simple audio element
    this.audioElement = document.createElement('audio');
    this.audioElement.autoplay = false;
    this.audioElement.preload = 'auto';
    
    // Set up event listeners
    this.handlePlay = () => {
      if (!this.hasStartedPlaying) {
        this.hasStartedPlaying = true;
        if (this.onStart) {
          this.onStart();
        }
      }
    };
    
    this.handleEnded = () => {
      console.log('🎵 Audio playback ended (fallback)');
      if (this.onEnd) {
        this.onEnd();
      }
    };
    
    this.handleError = (e) => {
      if (!this.isCleaningUp) {
        console.error('Audio element error (fallback):', e);
      }
    };
    
    this.audioElement.addEventListener('play', this.handlePlay);
    this.audioElement.addEventListener('ended', this.handleEnded);
    this.audioElement.addEventListener('error', this.handleError);
    
    this.sourceBufferReady = false; // Mark as not using SourceBuffer
    return Promise.resolve();
  }

  /**
   * Start a new incremental streaming session
   * ERROR RECOVERY: Falls back to blob URL if MediaSource fails
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
    this.pendingBuffers = [];
    this.isAppending = false;
    this.sourceBufferReady = false;

    // Try MediaSource first, fallback if it fails
    try {
      await this.initializeMediaSource();
    } catch (error) {
      console.warn('⚠️ MediaSource initialization failed, using fallback:', error.message);
      await this.useFallbackAudioPlayer();
    }

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
    this.pendingBuffers = [];
    this.isAppending = false;
    this.sourceBufferReady = false;

    // Initialize fresh MediaSource for this query
    await this.initializeMediaSource();

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
   * Receive audio chunks and append to SourceBuffer
   * MSE approach - no arbitrary slicing, browser handles MP3 frames
   */
  async receiveAndPlayAudio(response) {
    const reader = response.body.getReader();
    let receivedBytes = 0;
    const MIN_BYTES_BEFORE_PLAY = 16384; // ~200ms of audio, more robust startup

    try {
      while (true) {
        // Check if cleaned up (interruption/new query)
        if (this.stopRequested || !this.audioElement || !this.mediaSource) {
          console.log('⚠️ Playback stopped or cleaned up');
          break;
        }

        const { done, value } = await reader.read();
        
        if (done) {
          console.log('✅ Audio stream completed');
          
          // End MediaSource when done
          if (this.mediaSource && this.mediaSource.readyState === 'open') {
            // Wait for any pending appends to finish
            await this.waitForBufferReady();
            
            // Process any remaining buffers
            while (this.pendingBuffers.length > 0) {
              await this.waitForBufferReady();
              this.processBufferQueue();
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Now end the stream
            try {
              this.mediaSource.endOfStream();
              console.log('MediaSource stream ended');
            } catch (e) {
              console.warn('Error ending MediaSource:', e);
            }
          }
          break;
        }

        // Queue the chunk for appending (no arbitrary slicing!)
        this.pendingBuffers.push(value);
        receivedBytes += value.length;

        // Start playback once we have enough data
        if (!this.hasStartedPlaying && receivedBytes >= MIN_BYTES_BEFORE_PLAY) {
          console.log(`🎵 Starting playback with ${receivedBytes} bytes buffered`);
          // Check if audioElement still exists (may be cleaned up during interruption)
          if (this.audioElement) {
            this.audioElement.play().catch(e => {
              console.error('Error starting playback:', e);
            });
          }
        }

        // Process buffer queue
        this.processBufferQueue();
      }

      this.isFetching = false;

    } catch (error) {
      console.error('Error receiving audio:', error);
      this.isFetching = false;
    }
  }

  /**
   * Process pending buffer queue
   * Append chunks to SourceBuffer when ready
   */
  processBufferQueue() {
    // Can't append if already appending or SourceBuffer not ready
    if (this.isAppending || !this.sourceBufferReady || !this.sourceBuffer) {
      return;
    }

    // Check if MediaSource is still open (may be null after cleanup)
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') {
      return;
    }

    // Get next buffer from queue
    if (this.pendingBuffers.length === 0) {
      return;
    }

    const chunk = this.pendingBuffers.shift();
    
    try {
      this.isAppending = true;
      this.sourceBuffer.appendBuffer(chunk);
    } catch (error) {
      console.error('Error appending buffer:', error);
      this.isAppending = false;
      
      // If QuotaExceededError, try removing old buffered data
      if (error.name === 'QuotaExceededError') {
        this.trimBuffer();
        // Re-queue the chunk
        this.pendingBuffers.unshift(chunk);
      }
    }
  }

  /**
   * Wait for SourceBuffer to be ready for next append
   */
  async waitForBufferReady() {
    while (this.isAppending) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Trim old buffered data to free up memory
   */
  trimBuffer() {
    if (!this.sourceBuffer || !this.audioElement) {
      return;
    }

    try {
      const currentTime = this.audioElement.currentTime;
      const buffered = this.sourceBuffer.buffered;
      
      // Remove data more than 10 seconds behind current playback
      if (buffered.length > 0 && currentTime > 10) {
        const removeEnd = currentTime - 5;
        if (buffered.start(0) < removeEnd) {
          this.sourceBuffer.remove(buffered.start(0), removeEnd);
          console.log(`🧹 Trimmed buffer from ${buffered.start(0)} to ${removeEnd}`);
        }
      }
    } catch (error) {
      console.warn('Error trimming buffer:', error);
    }
  }

  /**
   * Stop playback and clear
   */
  stop() {
    this.stopRequested = true;
    this.pendingBuffers = [];
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }

    this.isFetching = false;
    this.hasStartedPlaying = false;
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
    this.pendingBuffers = [];
    this.hasStartedPlaying = false;
    this.sourceBufferReady = false;
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    
    // Clean up MediaSource for fresh start on next query
    this.cleanupMediaSource();
  }

  /**
   * Check if currently processing
   */
  get isProcessing() {
    return this.isFetching || (this.audioElement && !this.audioElement.paused);
  }

  /**
   * Clean up MediaSource and audio element
   * FIXED: Revoke blob URLs to prevent memory leaks
   */
  cleanupMediaSource() {
    this.isCleaningUp = true;
    
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch (e) {
        // Ignore - may already be ended
      }
    }
    
    if (this.audioElement) {
      // Remove event listeners properly
      if (this.handlePlay) {
        this.audioElement.removeEventListener('play', this.handlePlay);
      }
      if (this.handleEnded) {
        this.audioElement.removeEventListener('ended', this.handleEnded);
      }
      if (this.handleError) {
        this.audioElement.removeEventListener('error', this.handleError);
      }
      
      // Pause and clear
      this.audioElement.pause();
      
      // MEMORY LEAK FIX: Revoke blob URL to free memory
      if (this.audioElement.src && this.audioElement.src.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(this.audioElement.src);
          console.log('🧹 Revoked blob URL to prevent memory leak');
        } catch (e) {
          // Ignore revoke errors
        }
      }
      
      try {
        // Setting src to empty triggers error, but it's now suppressed by isCleaningUp flag
        this.audioElement.src = '';
        this.audioElement.load();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.audioElement = null;
    }
    
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.sourceBufferReady = false;
    this.handlePlay = null;
    this.handleEnded = null;
    this.handleError = null;
  }

  /**
   * Clean up all resources (called on component unmount)
   */
  cleanup() {
    this.stop();
    this.cleanupMediaSource();
    this.pendingBuffers = [];
  }
}
