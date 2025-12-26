/**
 * TRUE Streaming Audio Player using MediaSource Extensions (MSE)
 * Plays audio as chunks arrive - no waiting for complete download
 */
export class QueuedAudioPlayer {
  constructor() {
    this.textQueue = [];
    this.isPlaying = false;
    this.isFetching = false;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.segmentCounter = 0;
    
    // MSE components - single persistent instance
    this.audioElement = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.pendingChunks = [];
    this.isAppending = false;
    this.hasStartedPlayback = false;
    this.isInitialized = false;
    this.allSegmentsFetched = false; // NEW: Track when all segments are done
    this.streamEnded = false; // NEW: Track if we've called endOfStream
    this.mediaSourceId = 0; // NEW: Track MediaSource instances to ignore stale events
    
    console.log('🎵 [AudioPlayer] Initialized with MSE support');
  }

  async initializeMSE() {
    if (this.isInitialized) {
      console.log('✅ [AudioPlayer] MSE already initialized');
      return;
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Create audio element (or reuse existing one)
        if (!this.audioElement) {
          console.log('🆕 [AudioPlayer] Creating new audio element');
          this.audioElement = new Audio();
          this.audioElement.autoplay = false;
          
          // Audio element event handlers - set once
          this.audioElement.addEventListener('ended', () => {
            console.log('⏹️ [AudioPlayer] Playback ended');
            this.isPlaying = false;
            this.hasStartedPlayback = false;
            
            if (this.textQueue.length === 0 && !this.isFetching) {
              if (this.onEnd) this.onEnd();
            }
          });
          
          this.audioElement.addEventListener('error', (e) => {
            // Ignore errors when src is empty (during cleanup/reset)
            if (!this.audioElement.src || this.audioElement.src === '' || this.audioElement.src === window.location.href) {
              console.log('ℹ️ [AudioPlayer] Audio error during cleanup (expected)');
              return;
            }
            console.error('❌ [AudioPlayer] Audio element error:', e);
            // Get more details about the error
            if (this.audioElement.error) {
              console.error('Error details:', {
                code: this.audioElement.error.code,
                message: this.audioElement.error.message
              });
            }
          });
        }
        
        // Create MediaSource
        this.mediaSourceId++;
        const currentMediaSourceId = this.mediaSourceId;
        console.log(`🆕 [AudioPlayer] Creating new MediaSource (ID: ${currentMediaSourceId})`);
        this.mediaSource = new MediaSource();
        this.audioElement.src = URL.createObjectURL(this.mediaSource);
        
        this.mediaSource.addEventListener('sourceopen', () => {
          try {
            console.log(`🔓 [AudioPlayer] MediaSource opened (ID: ${currentMediaSourceId})`);
            
            // Ignore stale events from old MediaSource instances
            if (currentMediaSourceId !== this.mediaSourceId) {
              console.warn(`⚠️ [AudioPlayer] Ignoring sourceopen from old MediaSource (ID: ${currentMediaSourceId}, current: ${this.mediaSourceId})`);
              return;
            }
            
            // Double-check state before creating SourceBuffer
            if (this.mediaSource.readyState !== 'open') {
              console.warn('⚠️ [AudioPlayer] MediaSource not in open state, ignoring stale event');
              return;
            }
            
            // Create SourceBuffer for MP3
            this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
            
            // Handle buffer updates
            this.sourceBuffer.addEventListener('updateend', () => {
              this.isAppending = false;
              
              // Start playback after initial buffer if not already playing
              if (!this.hasStartedPlayback && this.audioElement.buffered.length > 0) {
                const buffered = this.audioElement.buffered.end(0);
                // Start playing once we have ~0.5 seconds buffered
                if (buffered > 0.5) {
                  this.startPlayback();
                }
              }
              
              // Process next pending chunk
              this.processPendingChunks();
            });
            
            this.sourceBuffer.addEventListener('error', (e) => {
              console.error('❌ [AudioPlayer] SourceBuffer error:', e);
            });
            
            this.isInitialized = true;
            console.log('✅ [AudioPlayer] SourceBuffer created and ready');
            resolve();
          } catch (error) {
            console.error('❌ [AudioPlayer] Failed to create SourceBuffer:', error);
            reject(error);
          }
        });
        
        this.mediaSource.addEventListener('sourceclose', () => {
          console.log('🔒 [AudioPlayer] MediaSource closed');
          this.isInitialized = false;
        });
        
        this.mediaSource.addEventListener('error', (e) => {
          console.error('❌ [AudioPlayer] MediaSource error:', e);
          reject(e);
        });
        
      } catch (error) {
        console.error('❌ [AudioPlayer] MSE initialization failed:', error);
        reject(error);
      }
    });
  }

  startPlayback() {
    if (this.hasStartedPlayback || !this.audioElement) return;
    
    this.hasStartedPlayback = true;
    this.isPlaying = true;
    
    this.audioElement.play()
      .then(() => {
        console.log('🔊 [AudioPlayer] Playback started');
        if (this.onStart) this.onStart();
      })
      .catch(e => {
        console.error('❌ [AudioPlayer] Failed to start playback:', e);
        this.hasStartedPlayback = false;
        this.isPlaying = false;
      });
  }

  async addToQueue(text) {
    if (!text || text.trim().length === 0) {
      console.log('⚠️ [AudioPlayer] Empty text, skipping');
      return;
    }

    const segmentIndex = this.segmentCounter++;
    console.log(`📝 [AudioPlayer] Segment ${segmentIndex}: Queuing text (${text.length} chars)`);
    
    this.textQueue.push({ text: text.trim(), index: segmentIndex });
    
    // Initialize MSE on first text
    if (!this.isInitialized) {
      await this.initializeMSE();
    }
    
    // Start processing immediately
    this.processQueue();
  }

  async processQueue() {
    if (!this.isFetching && this.textQueue.length > 0) {
      this.fetchNextAudio();
    }
  }

  async appendChunk(chunk, segmentIndex) {
    this.pendingChunks.push({ chunk, segmentIndex });
    this.processPendingChunks();
  }

  processPendingChunks() {
    // Can't append if already appending or no chunks waiting
    if (this.isAppending || this.pendingChunks.length === 0) {
      // NEW: Check if we should close the stream after processing all chunks
      this.checkStreamComplete();
      return;
    }
    
    // Can't append if SourceBuffer is busy or not ready
    if (!this.sourceBuffer || this.sourceBuffer.updating) {
      return;
    }
    
    // Can't append if MediaSource is not open
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') {
      return;
    }
    
    try {
      const { chunk, segmentIndex } = this.pendingChunks.shift();
      this.isAppending = true;
      this.sourceBuffer.appendBuffer(chunk);
      console.log(`📦 [AudioPlayer] Segment ${segmentIndex}: Appended ${chunk.byteLength} bytes to buffer`);
    } catch (error) {
      console.error('❌ [AudioPlayer] Failed to append chunk:', error);
      this.isAppending = false;
      // Retry after a short delay
      setTimeout(() => this.processPendingChunks(), 50);
    }
  }

  checkStreamComplete() {
    // Only close the stream once when: all segments fetched + no pending chunks + not already ended
    if (this.allSegmentsFetched && 
        this.pendingChunks.length === 0 && 
        !this.isFetching && 
        !this.streamEnded &&
        this.mediaSource && 
        this.mediaSource.readyState === 'open') {
      
      this.streamEnded = true;
      console.log('🏁 [AudioPlayer] All data processed, closing MediaSource stream');
      
      try {
        this.mediaSource.endOfStream();
        console.log('✅ [AudioPlayer] MediaSource.endOfStream() called - ended event will fire when playback completes');
      } catch (e) {
        console.error('❌ [AudioPlayer] Error calling endOfStream:', e);
      }
    }
  }

  async fetchNextAudio() {
    if (this.stopRequested || this.textQueue.length === 0) return;
    
    this.isFetching = true;
    const { text, index } = this.textQueue.shift();
    
    const startTime = Date.now();
    console.log(`🎤 [AudioPlayer] Segment ${index}: Streaming from server...`);
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error(`TTS API failed: ${response.status}`);
      }
      
      // Stream chunks and append IMMEDIATELY as they arrive
      const reader = response.body.getReader();
      let totalBytes = 0;
      let chunkCount = 0;
      let firstChunkTime = null;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [AudioPlayer] Segment ${index}: Stream complete (${chunkCount} chunks, ${totalBytes} bytes in ${elapsed}ms)`);
          break;
        }
        
        if (this.stopRequested) {
          console.log(`🚫 [AudioPlayer] Segment ${index}: Stopped during fetch`);
          reader.cancel();
          this.isFetching = false;
          return;
        }
        
        chunkCount++;
        totalBytes += value.byteLength;
        
        if (firstChunkTime === null) {
          firstChunkTime = Date.now() - startTime;
          console.log(`⚡ [AudioPlayer] Segment ${index}: First chunk in ${firstChunkTime}ms (${value.byteLength} bytes)`);
        }
        
        // Append chunk IMMEDIATELY (true streaming!)
        await this.appendChunk(value, index);
        
        console.log(`🎵 [AudioPlayer] Segment ${index}: Chunk ${chunkCount} (${value.byteLength} bytes) → queued for MSE`);
      }
      
    } catch (error) {
      console.error(`❌ [AudioPlayer] Segment ${index}: Fetch error:`, error);
    } finally {
      this.isFetching = false;
      
      // Continue fetching next segment
      if (this.textQueue.length > 0 && !this.stopRequested) {
        this.fetchNextAudio();
      } else if (this.textQueue.length === 0) {
        // All segments fetched - mark as complete and check if we can close stream
        console.log('✅ [AudioPlayer] All segments fetched');
        this.allSegmentsFetched = true;
        // Trigger check to see if we should close the MediaSource
        this.checkStreamComplete();
      }
    }
  }

  stop() {
    console.log('🛑 [AudioPlayer] Stop requested');
    this.stopRequested = true;
    this.textQueue = [];
    this.pendingChunks = [];
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    
    this.isPlaying = false;
    this.isFetching = false;
    this.isAppending = false;
    this.hasStartedPlayback = false;
  }

  resume() {
    console.log('▶️ [AudioPlayer] Resume requested');
    this.stopRequested = false;
    this.processQueue();
  }

  clear() {
    console.log('🧹 [AudioPlayer] Clearing queues');
    this.textQueue = [];
    this.pendingChunks = [];
    this.segmentCounter = 0;
    this.hasStartedPlayback = false;
    this.allSegmentsFetched = false; // NEW: Reset for next conversation
    this.streamEnded = false; // NEW: Reset for next conversation
    
    // If MediaSource is in 'ended' state, we need to create a new one for next conversation
    if (this.mediaSource && this.mediaSource.readyState === 'ended') {
      console.log('🔄 [AudioPlayer] MediaSource ended, will reinitialize for next conversation');
      // Clean up current MediaSource
      if (this.audioElement) {
        this.audioElement.src = '';
      }
      this.mediaSource = null;
      this.sourceBuffer = null;
      this.isInitialized = false;
    } else if (this.mediaSource && this.mediaSource.readyState === 'open') {
      // If still open, just abort the buffer for reuse
      try {
        if (this.sourceBuffer && !this.sourceBuffer.updating) {
          this.sourceBuffer.abort();
        }
      } catch (e) {
        console.log('ℹ️ [AudioPlayer] Could not abort SourceBuffer');
      }
    }
  }

  cleanup() {
    console.log('🧹 [AudioPlayer] Cleanup');
    this.stop();
    
    // Close MediaSource
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch (e) {
        // Already ended
      }
    }
    
    // Clean up audio element
    if (this.audioElement) {
      this.audioElement.src = '';
      this.audioElement = null;
    }
    
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.isInitialized = false;
  }

  get isProcessing() {
    return this.isPlaying || this.isFetching || this.textQueue.length > 0 || this.pendingChunks.length > 0;
  }
}
