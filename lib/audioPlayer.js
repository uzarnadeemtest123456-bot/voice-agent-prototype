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
 * Queue-based audio player for text segments
 */
export class QueuedAudioPlayer {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentAudio = null;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
  }

  async addToQueue(text) {
    this.queue.push(text);
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.stopRequested) {
      const text = this.queue.shift();
      
      try {
        // Call TTS API
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          console.error('TTS API error:', response.status);
          continue;
        }

        // Get audio data
        const audioData = await response.arrayBuffer();
        
        // Play audio
        await this.playAudioBuffer(audioData);
        
      } catch (error) {
        console.error('TTS processing error:', error);
      }
    }

    this.isProcessing = false;
    if (this.queue.length > 0 && !this.stopRequested) {
      await this.processQueue();
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
    this.queue = [];
    
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
    this.queue = [];
  }
}
