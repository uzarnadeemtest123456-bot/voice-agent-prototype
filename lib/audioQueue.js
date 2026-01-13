/**
 * Audio Queue Manager for Safari-Safe TTS Playback
 * Uses a single HTMLAudioElement with Blob URLs and optional MediaSource streaming
 * Follows PDF requirements: complete files, ordered playback, interruption support
 */

export class AudioQueue {
  constructor() {
    // Single HTMLAudioElement for Safari compatibility
    this.audio = new Audio();
    this.audio.playsInline = true;
    this.audio.preload = 'auto';

    // Queue management
    this.pendingAudioByChunkId = new Map(); // Map<chunkId, { url, start?, cleanup?, type }>
    this.nextChunkToPlay = 0;
    this.playing = false;

    // State tracking
    this.activeRequestId = null;
    this.onPlaybackComplete = null; // Callback when all audio finished
    this.onPlaybackStart = null; // Callback when audio starts playing
    this.onAutoplayBlocked = null; // Callback when Safari blocks playback
    this.hasCalledPlaybackStart = false; // Track if we've called onPlaybackStart for this request
    this.isPriming = false; // Suppress error noise during prime

    // Capability flags (calculated lazily in enqueueStream)
    this.streamingSupported = null;

    // Setup audio event handlers
    this.setupAudioHandlers();
  }

  /**
   * Setup audio element event handlers
   */
  setupAudioHandlers() {
    this.audio.addEventListener('ended', () => {
      console.log(`🔊 Chunk ${this.nextChunkToPlay - 1} finished playing`);

      // Cleanup the entry we just played
      const entry = this.pendingAudioByChunkId.get(this.nextChunkToPlay - 1);
      if (entry) {
        entry.cleanup?.();
        this.pendingAudioByChunkId.delete(this.nextChunkToPlay - 1);
      }

      this.playing = false;

      // Try to play next chunk
      this.drainQueue();
    });

    this.audio.addEventListener('error', (e) => {
      // Ignore priming errors (e.g., data URI not supported) and let prime handle logging
      if (this.isPriming) {
        console.warn('⚠️ Ignoring audio error during prime:', e);
        return;
      }

      // Only handle errors during actual playback, not during cleanup
      // When src is empty or just the page URL, it's a spurious error from clearing the source
      if (this.audio.src && this.audio.src !== '' && this.audio.src !== window.location.href) {
        console.error('❌ Audio playback error:', e);

        // Cleanup the entry that failed
        const playingChunkId = this.nextChunkToPlay - 1;
        const entry = this.pendingAudioByChunkId.get(playingChunkId);
        if (entry) {
          entry.cleanup?.();
          this.pendingAudioByChunkId.delete(playingChunkId);
        }

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

    // Store in map with cleanup
    this.pendingAudioByChunkId.set(chunkId, {
      type: 'blob',
      url: blobUrl,
      cleanup: () => URL.revokeObjectURL(blobUrl),
    });

    // Try to start playback
    this.drainQueue();
  }

  /**
   * Add streaming audio chunk using MediaSource for earliest playback
   */
  enqueueStream(requestId, chunkId, reader, mimeType = 'audio/mpeg') {
    if (requestId !== this.activeRequestId) {
      console.log(`⚠️ Discarding streaming audio from old request ${requestId} (current: ${this.activeRequestId})`);
      return false;
    }

    if (!this.isStreamingSupported(mimeType)) {
      console.warn('⚠️ MediaSource streaming not supported on this browser, using blob path');
      return false;
    }

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      try {
        reader.cancel();
      } catch (err) {
        // Ignore cancellation errors
      }
      if (mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream();
        } catch (err) {
          // Ignore endOfStream errors on cleanup
        }
      }
      URL.revokeObjectURL(objectUrl);
    };

    const start = () => {
      if (start.started) return;
      start.started = true;

      mediaSource.addEventListener('sourceopen', async () => {
        let sourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          sourceBuffer.mode = 'sequence'; // Crucial: Ignore internal timestamps, play in append order
        } catch (err) {
          console.warn('⚠️ Could not create SourceBuffer, falling back to blob', err);
          cleanup();
          return;
        }

        // Pump reader into SourceBuffer
        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value?.length) {
              await this.appendToSourceBuffer(sourceBuffer, value);
            }
          }
          if (!cancelled && mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
        } catch (err) {
          if (!cancelled) {
            console.error('❌ Error appending streaming audio:', err);
            try {
              mediaSource.endOfStream();
            } catch (_) {
              // Ignore
            }
          }
        }
      }, { once: true });
    };

    this.pendingAudioByChunkId.set(chunkId, {
      type: 'stream',
      url: objectUrl,
      start,
      cleanup,
    });

    this.drainQueue();
    return true;
  }

  /**
   * Append audio bytes to SourceBuffer while respecting updating state
   */
  appendToSourceBuffer(sourceBuffer, chunk) {
    const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);

    const waitForReady = () => {
      if (!sourceBuffer.updating) return Promise.resolve();
      return new Promise((resolve) => {
        const onUpdate = () => {
          sourceBuffer.removeEventListener('updateend', onUpdate);
          resolve();
        };
        sourceBuffer.addEventListener('updateend', onUpdate);
      });
    };

    return waitForReady().then(() => new Promise((resolve, reject) => {
      const cleanup = () => {
        sourceBuffer.removeEventListener('updateend', handleUpdateEnd);
        sourceBuffer.removeEventListener('error', handleError);
      };
      const handleUpdateEnd = () => {
        cleanup();
        resolve();
      };
      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      sourceBuffer.addEventListener('updateend', handleUpdateEnd);
      sourceBuffer.addEventListener('error', handleError);
      try {
        sourceBuffer.appendBuffer(data);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }));
  }

  /**
   * Feature-detect whether streaming via MSE is appropriate for this browser
   * Avoids Firefox/Safari where mp3 MSE is unreliable or unsupported
   */
  isStreamingSupported(mimeType) {
    if (this.streamingSupported !== null) return this.streamingSupported;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.streamingSupported = false;
      return this.streamingSupported;
    }

    const ua = navigator.userAgent || '';
    const isSafari = /safari/i.test(ua) && !/chrome|crios|android/i.test(ua);
    const isFirefox = /firefox/i.test(ua);

    if (isSafari || isFirefox) {
      this.streamingSupported = false;
      return this.streamingSupported;
    }

    this.streamingSupported = !!(window.MediaSource && MediaSource.isTypeSupported(mimeType));
    return this.streamingSupported;
  }

  /**
   * Prime the audio element during a user gesture to satisfy Safari autoplay rules
   */
  async prime() {
    this.isPriming = true;

    // Generate a tiny valid silent WAV to avoid decode errors (works across browsers)
    const silentUrl = this.createSilentWavUrl();
    this.audio.muted = true;
    this.audio.src = silentUrl;

    try {
      await this.audio.play();
    } catch (err) {
      console.warn('⚠️ Audio prime failed (autoplay likely still blocked):', err);
      // Fallback: try Web Audio unlock with a zero-gain oscillator
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start(0);
        osc.stop(ctx.currentTime + 0.01);
        await ctx.resume();
        await new Promise((resolve) => setTimeout(resolve, 10));
        await ctx.close();
      } catch (fallbackErr) {
        console.warn('⚠️ Fallback AudioContext prime failed:', fallbackErr);
      }
    } finally {
      this.isPriming = false;
    }

    // Reset and unmute for real playback
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.muted = false;
    this.audio.src = '';

    // Revoke the generated URL
    URL.revokeObjectURL(silentUrl);
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
      const currentChunkId = this.nextChunkToPlay;
      const entry = this.pendingAudioByChunkId.get(currentChunkId);
      if (!entry) break;

      console.log(`▶️ Playing chunk ${currentChunkId}`);

      this.playing = true;

      // Start streaming append (if applicable) before triggering playback
      if (entry.start) {
        entry.start();
      }

      this.audio.src = entry.url;

      // Notify playback start ONLY for the first chunk of this request
      if (this.onPlaybackStart && !this.hasCalledPlaybackStart) {
        this.hasCalledPlaybackStart = true;
        this.onPlaybackStart();
      }

      try {
        // Skip if this is a failed chunk
        if (entry.type === 'failed') {
          console.log(`⚠️ Skipping failed chunk ${currentChunkId}`);
          this.pendingAudioByChunkId.delete(currentChunkId);
          this.playing = false; // Allow loop to advance to the next available chunk
          this.nextChunkToPlay++;
          continue;
        }

        await this.audio.play();
        this.nextChunkToPlay++;

        // Wait for 'ended' event to continue
        return;
      } catch (err) {
        console.error('❌ Error playing audio:', err);
        // If Safari blocks autoplay, surface it so UI can prompt user to tap
        if (err.name === 'NotAllowedError' || err.name === 'DOMException') {
          this.playing = false;
          if (this.onAutoplayBlocked) {
            this.onAutoplayBlocked(err);
          }
          // Leave current chunk queued so it can retry after unlock
          return;
        }

        // Remove the bad entry and move on
        entry.cleanup?.();
        this.pendingAudioByChunkId.delete(currentChunkId);
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
   * Mark a chunk as failed so the queue doesn't stall waiting for it
   * @param {number} requestId - Request ID
   * @param {number} chunkId - Chunk ID that failed
   */
  markChunkFailed(requestId, chunkId) {
    if (requestId !== this.activeRequestId) {
      return;
    }

    console.log(`❌ Marking chunk ${chunkId} as failed`);

    // Add a placeholder entry so drainQueue finds it and skips it
    this.pendingAudioByChunkId.set(chunkId, {
      type: 'failed',
      url: '',
      cleanup: null
    });

    // Try to proceed
    this.drainQueue();
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
    for (const entry of this.pendingAudioByChunkId.values()) {
      entry.cleanup?.();
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

  /**
   * Build a short silent WAV and return an object URL
   */
  createSilentWavUrl() {
    // PCM 16-bit mono, 44.1kHz, 50 samples (~1ms) of silence
    const sampleRate = 44100;
    const numSamples = 50;
    const bytesPerSample = 2;
    const blockAlign = 1 * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // Bits per sample

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    // Samples are already zeroed (silence)

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
