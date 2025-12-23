/**
 * Streamlined audio player for TTS with MiniMax streaming
 * Redesigned for minimal latency: receive text → stream to MiniMax → play audio immediately
 */
export class QueuedAudioPlayer {
  constructor() {
    this.textQueue = [];          // Text segments to convert
    this.audioQueue = [];         // Audio buffers ready to play
    this.isPlaying = false;
    this.isFetching = false;
    this.currentSource = null;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.audioContext = null;
    this.segmentCounter = 0;
    
    // Pre-initialize AudioContext to avoid latency
    this.initializeAudioContext();
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('🎵 [AudioPlayer] AudioContext initialized:', this.audioContext.state);
    }
  }

  async ensureAudioContextRunning() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('✅ [AudioPlayer] AudioContext resumed');
    }
  }

  async addToQueue(text) {
    if (!text || text.trim().length === 0) {
      console.log('⚠️ [AudioPlayer] Empty text, skipping');
      return;
    }

    const segmentIndex = this.segmentCounter++;
    console.log(`📝 [AudioPlayer] Segment ${segmentIndex}: Queuing text (${text.length} chars)`);
    
    this.textQueue.push({ text: text.trim(), index: segmentIndex });
    
    // Start processing immediately
    this.processQueue();
  }

  async processQueue() {
    // Fetch text and convert to audio
    if (!this.isFetching && this.textQueue.length > 0) {
      this.fetchNextAudio();
    }
    
    // Play audio from queue
    if (!this.isPlaying && this.audioQueue.length > 0) {
      this.playNextAudio();
    }
  }

  async fetchNextAudio() {
    if (this.stopRequested || this.textQueue.length === 0) return;
    
    this.isFetching = true;
    const { text, index } = this.textQueue.shift();
    
    const startTime = Date.now();
    console.log(`🎤 [AudioPlayer] Segment ${index}: Fetching from MiniMax...`);
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error(`TTS API failed: ${response.status}`);
      }
      
      // Stream audio chunks from response
      const reader = response.body.getReader();
      const chunks = [];
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
        chunks.push(value);
        
        if (firstChunkTime === null) {
          firstChunkTime = Date.now() - startTime;
          console.log(`⚡ [AudioPlayer] Segment ${index}: First audio chunk in ${firstChunkTime}ms`);
        }
      }
      
      // Combine chunks into single buffer
      if (chunks.length > 0) {
        const combinedBuffer = new Uint8Array(totalBytes);
        let offset = 0;
        
        for (const chunk of chunks) {
          combinedBuffer.set(chunk, offset);
          offset += chunk.byteLength;
        }
        
        console.log(`🎵 [AudioPlayer] Segment ${index}: Enqueuing ${totalBytes} bytes for playback`);
        this.audioQueue.push({ buffer: combinedBuffer.buffer, index });
        
        // Start playback if not already playing
        if (!this.isPlaying) {
          this.playNextAudio();
        }
      }
      
    } catch (error) {
      console.error(`❌ [AudioPlayer] Segment ${index}: Fetch error:`, error);
      // Don't retry, just continue with next segment
    } finally {
      this.isFetching = false;
      
      // Continue fetching next segment
      if (this.textQueue.length > 0 && !this.stopRequested) {
        this.fetchNextAudio();
      }
    }
  }

  async playNextAudio() {
    if (this.isPlaying || this.audioQueue.length === 0 || this.stopRequested) {
      return;
    }
    
    this.isPlaying = true;
    await this.ensureAudioContextRunning();
    
    const { buffer, index } = this.audioQueue.shift();
    const decodeStartTime = Date.now();
    
    console.log(`▶️ [AudioPlayer] Segment ${index}: Decoding audio...`);
    
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(buffer);
      const decodeTime = Date.now() - decodeStartTime;
      
      console.log(`✅ [AudioPlayer] Segment ${index}: Decoded in ${decodeTime}ms (duration: ${audioBuffer.duration.toFixed(2)}s)`);
      
      if (this.stopRequested) {
        console.log(`🚫 [AudioPlayer] Segment ${index}: Stopped before playback`);
        this.isPlaying = false;
        return;
      }
      
      // Play audio
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      this.currentSource = source;
      
      source.onended = () => {
        console.log(`⏹️ [AudioPlayer] Segment ${index}: Playback complete`);
        this.currentSource = null;
        this.isPlaying = false;
        
        // Play next audio or signal end
        if (this.audioQueue.length > 0) {
          this.playNextAudio();
        } else if (this.textQueue.length === 0 && !this.isFetching) {
          if (this.onEnd) this.onEnd();
        }
      };
      
      if (this.onStart && !this.stopRequested) {
        this.onStart();
      }
      
      console.log(`🔊 [AudioPlayer] Segment ${index}: Playing now (${audioBuffer.duration.toFixed(2)}s)`);
      source.start(0);
      
    } catch (error) {
      console.error(`❌ [AudioPlayer] Segment ${index}: Decode error:`, error);
      this.isPlaying = false;
      
      // Continue with next audio
      if (this.audioQueue.length > 0) {
        this.playNextAudio();
      } else if (this.textQueue.length === 0 && !this.isFetching) {
        if (this.onEnd) this.onEnd();
      }
    }
  }

  stop() {
    console.log('🛑 [AudioPlayer] Stop requested');
    this.stopRequested = true;
    this.textQueue = [];
    this.audioQueue = [];
    
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
    this.isFetching = false;
  }

  resume() {
    console.log('▶️ [AudioPlayer] Resume requested');
    this.stopRequested = false;
    this.processQueue();
  }

  clear() {
    console.log('🧹 [AudioPlayer] Clearing queues');
    this.textQueue = [];
    this.audioQueue = [];
    this.segmentCounter = 0;
  }

  cleanup() {
    console.log('🧹 [AudioPlayer] Cleanup');
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // Check if still processing
  get isProcessing() {
    return this.isPlaying || this.isFetching || this.textQueue.length > 0 || this.audioQueue.length > 0;
  }
}
