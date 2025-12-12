/**
 * Audio Level Analyzer
 * Analyzes audio input/output for visualization
 */

export class AudioLevelAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.animationFrameId = null;
    this.onLevelChange = null;
  }

  /**
   * Initialize analyzer with an audio stream
   * @param {MediaStream} stream - Audio stream from getUserMedia
   * @param {Function} callback - Called with level value (0-1)
   */
  async initWithStream(stream, callback) {
    this.onLevelChange = callback;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    this.startAnalysis();
  }

  /**
   * Initialize analyzer with an audio element
   * @param {HTMLAudioElement} audioElement
   * @param {Function} callback - Called with level value (0-1)
   */
  async initWithAudioElement(audioElement, callback) {
    this.onLevelChange = callback;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    
    this.source = this.audioContext.createMediaElementSource(audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    this.startAnalysis();
  }

  /**
   * Start analyzing audio levels
   */
  startAnalysis() {
    if (!this.analyser || !this.dataArray) return;

    const analyze = () => {
      this.analyser.getByteFrequencyData(this.dataArray);
      
      // Calculate RMS (Root Mean Square) for better volume representation
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const value = this.dataArray[i] / 255;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / this.dataArray.length);
      
      // Apply some scaling to make it more visible (0-1 range)
      const level = Math.min(1, rms * 2);
      
      if (this.onLevelChange) {
        this.onLevelChange(level);
      }
      
      this.animationFrameId = requestAnimationFrame(analyze);
    };
    
    analyze();
  }

  /**
   * Stop analysis and cleanup
   */
  stop() {
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
    
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {
        // Already disconnected
      }
      this.analyser = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    
    if (this.onLevelChange) {
      this.onLevelChange(0);
    }
  }
}

/**
 * Simple breathing animation calculator for idle state
 * @param {number} time - Current time in milliseconds
 * @returns {number} Scale value (0.95 - 1.05)
 */
export function getBreathingScale(time) {
  // Slow sine wave for gentle breathing effect
  const breathingSpeed = 0.002; // Slow breathing
  const breathingAmount = 0.05; // Small amplitude
  return 1 + Math.sin(time * breathingSpeed) * breathingAmount;
}
