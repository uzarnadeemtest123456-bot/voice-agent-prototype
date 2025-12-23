/**
 * Queue-based audio player for text segments with parallel fetching
 * Uses single shared AudioContext for seamless playback (no stuttering)
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
    this.maxPrefetch = 4;         // Increased from 2 to 4 for smoother playback
    this.audioContext = null;     // Shared AudioContext (FIX for stuttering!)
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('🎵 AudioContext created:', this.audioContext.state);
    }
    
    if (this.audioContext.state === 'suspended') {
      console.log('⏸️ AudioContext suspended, resuming...');
      try {
        await this.audioContext.resume();
        console.log('✅ AudioContext resumed:', this.audioContext.state);
      } catch (err) {
        console.error('❌ Failed to resume AudioContext:', err);
      }
    }
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
        console.log('🎤 Calling TTS API for text:', text.substring(0, 50) + '...');
        
        // Call TTS API - simple approach, gets complete audio file
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        });

        console.log('📡 TTS API response status:', response.status);

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log('📋 Content-Type:', contentType);
          
          // Get audio as binary data
          const audioData = await response.arrayBuffer();
          console.log(`✅ Received ${audioData.byteLength} bytes of audio`);
          
          // Add to queue for playback
          this.audioQueue.push(audioData);
          
          // Start processing if not already started
          if (!this.isProcessing) {
            console.log('🎬 Starting audio playback processing...');
            this.processQueue();
          }
        } else {
          const errorText = await response.text();
          console.error('❌ TTS API error:', response.status, errorText);
        }
      } catch (error) {
        console.error('❌ TTS prefetch error:', error);
      }
    }
    
    this.isFetching = false;
  }


  async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;

    // Initialize shared AudioContext once
    await this.initializeAudioContext();

    while ((this.audioQueue.length > 0 || this.textQueue.length > 0) && !this.stopRequested) {
      
      // Wait for audio to be available if not yet fetched
      while (this.audioQueue.length === 0 && this.textQueue.length > 0 && !this.stopRequested) {
        await this.prefetchNext();
        await new Promise(resolve => setTimeout(resolve, 10)); // Ultra-fast polling - 10ms
      }
      
      if (this.audioQueue.length === 0) break;
      
      const audioData = this.audioQueue.shift();
      
      // Play audio using shared context
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
      // Reuse shared AudioContext instead of creating new one each time!
      this.audioContext.decodeAudioData(
        audioData.slice(0), // Clone the ArrayBuffer
        (buffer) => {
          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioContext.destination);
          
          this.currentAudio = source;
          
          source.onended = () => {
            this.currentAudio = null;
            // Don't close context - reuse it!
            if (this.onEnd) this.onEnd();
            resolve();
          };

          if (this.onStart) this.onStart();
          
          console.log(`▶️ Playing audio buffer: ${buffer.duration.toFixed(2)}s`);
          source.start(0);
        }, 
        (error) => {
          console.error('❌ Audio decode error:', error);
          // Try to continue with next segment instead of failing
          resolve();
        }
      );
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

  // Clean up when component unmounts
  cleanup() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
