/**
 * Audio Queue Manager for Safari-Safe TTS Playback
 * Uses HTMLAudioElement with Blob URLs (no MediaSource/MSE)
 * Follows PDF requirements: complete files, ordered playback, interruption support
 */

export class AudioQueue {
  constructor() {
    // Single HTMLAudioElement for Safari compatibility
    this.audio = new Audio();
    
    // Queue management
    this.pendingAudioByChunkId = new Map(); // Map<chunkId, blobUrl>
    this.nextChunkToPlay = 0;
    this.playing = false;
    
    // State tracking
    this.activeRequestId = null;
    this.onPlaybackComplete = null; // Callback when all audio finished
    this.onPlaybackStart = null; // Callback when audio starts playing
    this.hasCalledPlaybackStart = false; // Track if we've called onPlaybackStart for this request
    
    // Setup audio event handlers
    this.setupAudioHandlers();
  }

  /**
   * Setup audio element event handlers
   */
  setupAudioHandlers() {
    this.audio.addEventListener('ended', () => {
      console.log(`🔊 Chunk ${this.nextChunkToPlay - 1} finished playing`);
      
      // Revoke the blob URL to free memory
      const blobUrl = this.pendingAudioByChunkId.get(this.nextChunkToPlay - 1);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        this.pendingAudioByChunkId.delete(this.nextChunkToPlay - 1);
      }
      
      this.playing = false;
      
      // Try to play next chunk
      this.drainQueue();
    });

    this.audio.addEventListener('error', (e) => {
      // Only handle errors during actual playback, not during cleanup
      // When src is empty or just the page URL, it's a spurious error from clearing the source
      if (this.audio.src && this.audio.src !== '' && this.audio.src !== window.location.href) {
        console.error('❌ Audio playback error:', e);
        this.playing = false;
        
        // Try to continue with next chunk
        this.nextChunkToPlay++;
        this.drainQueue();
      }
    });

    this.audio.addEventListener('canplay', () => {
      console.log(`✅ Chunk ${this.nextChunkToPlay} ready to play`);
    });
  }

  /**
   * Add audio chunk to queue
   * @param {number} requestId - Request ID for this audio
   * @param {number} chunkId - Chunk ID
   * @param {Blob} audioBlob - Audio data
   */
  enqueue(requestId, chunkId, audioBlob) {
    // Check if this audio is from the current active request
    if (requestId !== this.activeRequestId) {
      console.log(`⚠️ Discarding audio from old request ${requestId} (current: ${this.activeRequestId})`);
      return;
    }

    // Create blob URL
    const blobUrl = URL.createObjectURL(audioBlob);
    
    console.log(`📥 Enqueued chunk ${chunkId} (${audioBlob.size} bytes)`);
    
    // Store in map
    this.pendingAudioByChunkId.set(chunkId, blobUrl);
    
    // Try to start playback
    this.drainQueue();
  }

  /**
   * Drain queue - play chunks in order
   */
  async drainQueue() {
    // If already playing, return
    if (this.playing) {
      return;
    }

    // Check if next chunk is available
    while (this.pendingAudioByChunkId.has(this.nextChunkToPlay)) {
      const blobUrl = this.pendingAudioByChunkId.get(this.nextChunkToPlay);
      
      console.log(`▶️ Playing chunk ${this.nextChunkToPlay}`);
      
      this.playing = true;
      this.audio.src = blobUrl;
      
      // Notify playback start ONLY for the first chunk of this request
      if (this.onPlaybackStart && !this.hasCalledPlaybackStart) {
        this.hasCalledPlaybackStart = true;
        this.onPlaybackStart();
      }
      
      try {
        await this.audio.play();
        this.nextChunkToPlay++;
        
        // Wait for 'ended' event to continue
        return;
      } catch (err) {
        console.error('❌ Error playing audio:', err);
        this.playing = false;
        this.nextChunkToPlay++;
        
        // Continue to next chunk
        continue;
      }
    }

    // No more chunks to play
    if (!this.playing && this.nextChunkToPlay > 0) {
      // All chunks played, notify completion
      if (this.onPlaybackComplete) {
        this.onPlaybackComplete();
      }
    }
  }

  /**
   * Stop all audio and clear queue
   */
  stopAll() {
    console.log('🛑 Stopping all audio and clearing queue');
    
    // Pause and reset audio
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.src = '';
    
    // Revoke all pending blob URLs
    for (const [chunkId, blobUrl] of this.pendingAudioByChunkId.entries()) {
      URL.revokeObjectURL(blobUrl);
    }
    
    // Clear queue
    this.pendingAudioByChunkId.clear();
    this.nextChunkToPlay = 0;
    this.playing = false;
  }

  /**
   * Set active request ID
   * This should be called when starting a new query
   */
  setActiveRequest(requestId) {
    if (this.activeRequestId !== requestId) {
      console.log(`🔄 Switching to new request ${requestId} (was ${this.activeRequestId})`);
      
      // Stop current playback and clear queue
      this.stopAll();
      
      this.activeRequestId = requestId;
      this.nextChunkToPlay = 0;
      this.hasCalledPlaybackStart = false; // Reset for new request
    }
  }

  /**
   * Get current playback state
   */
  isPlaying() {
    return this.playing;
  }

  /**
   * Get queue size
   */
  getQueueSize() {
    return this.pendingAudioByChunkId.size;
  }

  /**
   * Check if queue is empty and nothing is playing
   */
  isEmpty() {
    return !this.playing && this.pendingAudioByChunkId.size === 0;
  }

  /**
   * Cleanup - revoke all URLs and reset
   */
  cleanup() {
    this.stopAll();
    this.activeRequestId = null;
    this.onPlaybackComplete = null;
    this.onPlaybackStart = null;
  }
}
