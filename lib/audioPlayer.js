/**
 * Audio Player Utility for Streaming TTS
 * Handles chunked audio playback with immediate start
 */

export class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.onPlaybackStart = null;
    this.onPlaybackEnd = null;
    this.stopRequested = false;
  }

  async initialize() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async playAudio(audioData) {
    await this.initialize();
    
    try {
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(audioData);
      
      // Create audio source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      this.currentSource = source;
      
      // Set up playback callbacks
      return new Promise((resolve, reject) => {
        source.onended = () => {
          this.isPlaying = false;
          this.currentSource = null;
          if (this.onPlaybackEnd) this.onPlaybackEnd();
          resolve();
        };

        // Start playback
        source.start(0);
        this.isPlaying = true;
        
        if (this.onPlaybackStart) this.onPlaybackStart();
      });
      
    } catch (error) {
      console.error('Audio playback error:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.audioQueue = [];
    this.stopRequested = true;
  }

  cleanup() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Queue-based audio player for text segments with parallel fetching
 */
export class QueuedAudioPlayer {
  constructor() {
    this.textQueue = [];          // Text segments waiting to be fetched
    this.audioQueue = [];         // Pre-fetched audio buffers ready to play
    this.isProcessing = false;
    this.isFetching = false;
    this.currentAudio = null;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.maxPrefetch = 2;         // Number of segments to prefetch ahead
  }

  async addToQueue(text) {
    this.textQueue.push(text);
    
    // Start playback if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    // Start prefetching if not already running
    if (!this.isFetching && this.audioQueue.length < this.maxPrefetch) {
      this.prefetchNext();
    }
  }

  async prefetchNext() {
    if (this.isFetching || this.stopRequested) {
      return;
    }
    
    this.isFetching = true;
    
    // Prefetch up to maxPrefetch segments
    while (this.textQueue.length > 0 && this.audioQueue.length < this.maxPrefetch && !this.stopRequested) {
      const text = this.textQueue.shift();
      
      try {
        // Call TTS API
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        });

        if (response.ok) {
          const audioData = await response.arrayBuffer();
          this.audioQueue.push(audioData);
        } else {
          console.error('TTS API error:', response.status);
        }
      } catch (error) {
        console.error('TTS prefetch error:', error);
      }
    }
    
    this.isFetching = false;
  }

  async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;

    while ((this.audioQueue.length > 0 || this.textQueue.length > 0) && !this.stopRequested) {
      
      // Wait for audio to be available if not yet fetched
      while (this.audioQueue.length === 0 && this.textQueue.length > 0 && !this.stopRequested) {
        await this.prefetchNext();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (this.audioQueue.length === 0) break;
      
      const audioData = this.audioQueue.shift();
      
      // Play audio
      await this.playAudioBuffer(audioData);
      
      // Trigger prefetch for next segment while audio is playing
      if (this.textQueue.length > 0 && this.audioQueue.length < this.maxPrefetch && !this.isFetching) {
        this.prefetchNext(); // Don't await - fetch in parallel
      }
    }

    this.isProcessing = false;
    
    // Restart if new items were added during processing
    if ((this.textQueue.length > 0 || this.audioQueue.length > 0) && !this.stopRequested) {
      this.processQueue();
    }
  }

  async playAudioBuffer(audioData) {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      audioContext.decodeAudioData(audioData, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        
        this.currentAudio = source;
        
        source.onended = () => {
          this.currentAudio = null;
          audioContext.close();
          if (this.onEnd) this.onEnd();
          resolve();
        };

        if (this.onStart) this.onStart();
        source.start(0);
      }, (error) => {
        console.error('Audio decode error:', error);
        audioContext.close();
        reject(error);
      });
    });
  }

  stop() {
    this.stopRequested = true;
    this.textQueue = [];
    this.audioQueue = [];
    
    if (this.currentAudio) {
      try {
        this.currentAudio.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentAudio = null;
    }
  }

  resume() {
    this.stopRequested = false;
  }

  clear() {
    this.textQueue = [];
    this.audioQueue = [];
  }
}
