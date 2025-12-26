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
    this.allSegmentsFetched = false;
    this.streamEnded = false;
    this.mediaSourceId = 0;
  }

  async initializeMSE() {
    if (this.isInitialized) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Create audio element (or reuse existing one)
        if (!this.audioElement) {
          this.audioElement = new Audio();
          this.audioElement.autoplay = false;
          
          // Audio element event handlers - set once
          this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            this.hasStartedPlayback = false;
            
            if (this.textQueue.length === 0 && !this.isFetching) {
              if (this.onEnd) this.onEnd();
            }
          });
          
          this.audioElement.addEventListener('error', (e) => {
            // Ignore errors when src is empty (during cleanup/reset)
            if (!this.audioElement.src || this.audioElement.src === '' || this.audioElement.src === window.location.href) {
              return;
            }
          });
        }
        
        // Create MediaSource
        this.mediaSourceId++;
        const currentMediaSourceId = this.mediaSourceId;
        this.mediaSource = new MediaSource();
        this.audioElement.src = URL.createObjectURL(this.mediaSource);
        
        this.mediaSource.addEventListener('sourceopen', () => {
          try {
            // Ignore stale events from old MediaSource instances
            if (currentMediaSourceId !== this.mediaSourceId) {
              return;
            }
            
            // Double-check state before creating SourceBuffer
            if (this.mediaSource.readyState !== 'open') {
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
              // Error handled silently
            });
            
            this.isInitialized = true;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        
        this.mediaSource.addEventListener('sourceclose', () => {
          this.isInitialized = false;
        });
        
        this.mediaSource.addEventListener('error', (e) => {
          reject(e);
        });
        
      } catch (error) {
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
        if (this.onStart) this.onStart();
      })
      .catch(e => {
        this.hasStartedPlayback = false;
        this.isPlaying = false;
      });
  }

  async addToQueue(text) {
    if (!text || text.trim().length === 0) {
      return;
    }

    const segmentIndex = this.segmentCounter++;
    
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
    } catch (error) {
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
      
      try {
        this.mediaSource.endOfStream();
      } catch (e) {
        // Error handled silently
      }
    }
  }

  async fetchNextAudio() {
    if (this.stopRequested || this.textQueue.length === 0) return;
    
    this.isFetching = true;
    const { text, index } = this.textQueue.shift();
    
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
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        if (this.stopRequested) {
          reader.cancel();
          this.isFetching = false;
          return;
        }
        
        // Append chunk IMMEDIATELY (true streaming!)
        await this.appendChunk(value, index);
      }
      
    } catch (error) {
      // Error handled silently
    } finally {
      this.isFetching = false;
      
      // Continue fetching next segment
      if (this.textQueue.length > 0 && !this.stopRequested) {
        this.fetchNextAudio();
      } else if (this.textQueue.length === 0) {
        // All segments fetched - mark as complete and check if we can close stream
        this.allSegmentsFetched = true;
        // Trigger check to see if we should close the MediaSource
        this.checkStreamComplete();
      }
    }
  }

  stop() {
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
    this.stopRequested = false;
    this.processQueue();
  }

  clear() {
    this.textQueue = [];
    this.pendingChunks = [];
    this.segmentCounter = 0;
    this.hasStartedPlayback = false;
    this.allSegmentsFetched = false;
    this.streamEnded = false;
    
    // If MediaSource is in 'ended' state, we need to create a new one for next conversation
    if (this.mediaSource && this.mediaSource.readyState === 'ended') {
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
        // Error handled silently
      }
    }
  }

  cleanup() {
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
