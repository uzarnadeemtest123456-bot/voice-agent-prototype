/**
 * TTS Queue Manager
 * Handles sequential playback of TTS audio segments
 * Ensures segments play one after another without overlap
 */

export class TTSQueue {
  constructor() {
    this.queue = [];
    this.isPlaying = false;
    this.currentAudio = null;
    this.audioContext = null;
    this.onVolumeChange = null; // Callback for volume updates
    this.analyser = null;
    this.source = null;
    this.animationFrameId = null;
  }

  /**
   * Initialize Web Audio API context
   */
  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
    }
  }

  /**
   * Add audio segment to queue and play if not already playing
   * @param {Blob} audioBlob - Audio data from TTS API
   */
  async enqueue(audioBlob) {
    return new Promise((resolve, reject) => {
      this.queue.push({ audioBlob, resolve, reject });
      if (!this.isPlaying) {
        this.playNext();
      }
    });
  }

  /**
   * Play next item in queue
   */
  async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.stopVolumeAnalysis();
      if (this.onVolumeChange) {
        this.onVolumeChange(0); // Reset volume to 0
      }
      return;
    }

    this.isPlaying = true;
    const { audioBlob, resolve, reject } = this.queue.shift();

    try {
      await this.playAudio(audioBlob);
      resolve();
      this.playNext(); // Play next in queue
    } catch (error) {
      console.error('Error playing audio:', error);
      reject(error);
      this.playNext(); // Continue with next even on error
    }
  }

  /**
   * Play a single audio blob
   * @param {Blob} audioBlob
   */
  async playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
      try {
        this.initAudioContext();
        
        const audio = new Audio();
        this.currentAudio = audio;
        
        const url = URL.createObjectURL(audioBlob);
        audio.src = url;

        // Set up Web Audio API for volume analysis
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target.result;
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Create source and connect to analyser
            this.source = this.audioContext.createBufferSource();
            this.source.buffer = audioBuffer;
            this.source.connect(this.analyser);
            
            // Start volume analysis
            this.startVolumeAnalysis();
            
            // Play using HTML5 Audio (simpler for playback control)
            audio.play().catch(reject);
          } catch (error) {
            console.error('Error decoding audio:', error);
            // Fall back to playing without analysis
            audio.play().catch(reject);
          }
        };
        reader.readAsArrayBuffer(audioBlob);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          this.stopVolumeAnalysis();
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          this.stopVolumeAnalysis();
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start analyzing volume levels for visualization
   */
  startVolumeAnalysis() {
    if (!this.analyser || !this.onVolumeChange) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const analyze = () => {
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average amplitude (RMS-like)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // Normalize to 0-1 range (255 is max)
      const normalizedVolume = Math.min(1, average / 128);
      
      if (this.onVolumeChange) {
        this.onVolumeChange(normalizedVolume);
      }
      
      this.animationFrameId = requestAnimationFrame(analyze);
    };
    
    analyze();
  }

  /**
   * Stop volume analysis
   */
  stopVolumeAnalysis() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        // Already disconnected
      }
      this.source = null;
    }
  }

  /**
   * Stop all playback and clear queue
   */
  stop() {
    // Clear queue
    this.queue = [];
    
    // Stop current audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // Stop volume analysis
    this.stopVolumeAnalysis();
    
    // Reset state
    this.isPlaying = false;
    
    // Reset volume callback
    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }

  /**
   * Set callback for volume changes
   * @param {Function} callback - Called with volume value (0-1)
   */
  setVolumeCallback(callback) {
    this.onVolumeChange = callback;
  }

  /**
   * Check if currently playing
   */
  get playing() {
    return this.isPlaying;
  }

  /**
   * Get queue length
   */
  get length() {
    return this.queue.length;
  }
}
