/**
 * Streaming Audio Player for WebSocket-based TTS
 * Supports incremental text streaming for minimum latency
 * Eliminates prosody resets and stuttering
 */
export class StreamingAudioPlayer {
  constructor() {
    this.audioContext = null;
    this.currentSource = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.isFetching = false;
    this.onStart = null;
    this.onEnd = null;
    this.stopRequested = false;
    this.streamWriter = null;
    this.streamController = null;
    this.streamActive = false;
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Start a new incremental streaming session
   * Opens WebSocket connection and begins streaming first chunk
   */
  async startIncrementalStream(initialText) {
    if (!initialText || initialText.trim().length === 0) {
      console.warn('No initial text to stream');
      return;
    }

    if (this.streamActive) {
      console.warn('Stream already active');
      return;
    }

    this.stopRequested = false;
    this.isFetching = true;
    this.streamActive = true;

    await this.initializeAudioContext();

    try {
      // Generate unique session ID
      const sessionId = Date.now().toString() + Math.random().toString(36).substring(7);
      this.sessionId = sessionId;

      console.log(`📤 Starting incremental stream with session: ${sessionId}`);

      // Start initial request with first chunk
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: initialText, 
          sessionId: sessionId,
          isFirst: true,
          isLast: false 
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS Stream API failed: ${response.status}`);
      }

      // Get session ID from response headers
      const responseSessionId = response.headers.get('X-Session-Id');
      if (responseSessionId) {
        this.sessionId = responseSessionId;
      }

      console.log(`✅ Stream started with initial text (${initialText.length} chars)`);

      // Start receiving and playing audio
      this.receiveAndPlayAudio(response);

    } catch (error) {
      console.error('Error starting incremental stream:', error);
      this.isFetching = false;
      this.streamActive = false;
      this.sessionId = null;
      throw error;
    }
  }

  /**
   * Send additional text chunk to active stream
   */
  async sendTextChunk(text) {
    if (!this.sessionId || !this.streamActive) {
      console.warn('Stream not active');
      return;
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    try {
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: text, 
          sessionId: this.sessionId,
          isFirst: false,
          isLast: false 
        }),
      });

      if (!response.ok) {
        console.error('Failed to send text chunk:', response.status);
        return;
      }

      console.log(`📤 Sent text chunk (${text.length} chars)`);
    } catch (error) {
      console.error('Error sending text chunk:', error);
    }
  }

  /**
   * Signal end of text input and close stream
   */
  async endIncrementalStream() {
    if (!this.sessionId || !this.streamActive) {
      return;
    }

    try {
      const response = await fetch('/api/tts-stream-incremental', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text: '', 
          sessionId: this.sessionId,
          isFirst: false,
          isLast: true 
        }),
      });

      if (!response.ok) {
        console.error('Failed to end stream:', response.status);
      }

      console.log('🏁 Stream ended');
      this.sessionId = null;
      this.streamActive = false;
    } catch (error) {
      console.error('Error ending stream:', error);
    }
  }

  /**
   * Legacy method for backward compatibility
   * Streams complete text at once
   */
  async streamText(text) {
    if (!text || text.trim().length === 0) {
      console.warn('No text to stream');
      return;
    }

    this.stopRequested = false;
    this.isFetching = true;

    await this.initializeAudioContext();

    try {
      const response = await fetch('/api/tts-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text }),
      });

      if (!response.ok) {
        throw new Error(`TTS Stream API failed: ${response.status}`);
      }

      // Start receiving and playing audio
      await this.receiveAndPlayAudio(response);

    } catch (error) {
      console.error('Error streaming TTS:', error);
      this.isFetching = false;
      throw error;
    }
  }

  /**
   * Receive audio chunks and play them
   */
  async receiveAndPlayAudio(response) {
    const reader = response.body.getReader();
    let buffer = new Uint8Array();
    let isFirstChunk = true;
    const INITIAL_BUFFER_SIZE = 2048; // Reduced for faster start (was 4096)
    const ONGOING_BUFFER_SIZE = 8192; // Larger chunks after initial playback

    try {
      while (true) {
        if (this.stopRequested) {
          console.log('⚠️ Playback stopped by user');
          break;
        }

        const { done, value } = await reader.read();
        
        if (done) {
          console.log('✅ Audio stream completed');
          break;
        }

        // Accumulate audio data
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Use smaller buffer for first chunk to reduce latency
        const bufferThreshold = isFirstChunk ? INITIAL_BUFFER_SIZE : ONGOING_BUFFER_SIZE;

        // Try to decode and play chunks as they arrive
        if (buffer.length >= bufferThreshold) {
          // For first chunk, use exact threshold for faster start
          // For subsequent chunks, use larger sizes for efficiency
          const chunkSize = isFirstChunk ? INITIAL_BUFFER_SIZE : 
                           Math.min(ONGOING_BUFFER_SIZE, buffer.length);
          
          const chunk = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize);
          
          this.audioQueue.push(chunk.buffer);
          
          // Start playback if not already playing
          if (!this.isPlaying) {
            this.playQueue();
          }
          
          if (isFirstChunk) {
            isFirstChunk = false;
            console.log('🎵 First audio chunk queued - playback starting');
          }
        }
      }

      // Play any remaining data
      if (buffer.length > 0) {
        this.audioQueue.push(buffer.buffer);
      }

      this.isFetching = false;

    } catch (error) {
      console.error('Error receiving audio:', error);
      this.isFetching = false;
    }
  }

  /**
   * Play audio from the queue
   */
  async playQueue() {
    if (this.isPlaying) return;
    
    this.isPlaying = true;

    while ((this.audioQueue.length > 0 || this.isFetching) && !this.stopRequested) {
      // Wait for audio if queue is empty but still fetching
      if (this.audioQueue.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      const audioData = this.audioQueue.shift();
      
      try {
        await this.playAudioBuffer(audioData);
      } catch (error) {
        console.error('Error playing audio buffer:', error);
      }
    }

    this.isPlaying = false;
    
    if (this.onEnd) {
      this.onEnd();
    }
  }

  /**
   * Play a single audio buffer
   */
  async playAudioBuffer(audioData) {
    return new Promise((resolve, reject) => {
      this.audioContext.decodeAudioData(
        audioData,
        (buffer) => {
          if (this.stopRequested) {
            resolve();
            return;
          }

          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioContext.destination);
          
          this.currentSource = source;
          
          source.onended = () => {
            this.currentSource = null;
            resolve();
          };

          if (this.onStart && !this.isPlaying) {
            this.onStart();
          }
          
          source.start(0);
        },
        (error) => {
          console.error('Audio decode error:', error);
          resolve(); // Continue even on error
        }
      );
    });
  }

  /**
   * Stop playback and clear queue
   */
  stop() {
    this.stopRequested = true;
    this.audioQueue = [];
    this.fullText = '';
    
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null;
    }

    this.isFetching = false;
    this.isPlaying = false;
  }

  /**
   * Resume after stop
   */
  resume() {
    this.stopRequested = false;
  }

  /**
   * Clear audio queue
   */
  clear() {
    this.audioQueue = [];
    this.fullText = '';
  }

  /**
   * Check if currently processing
   */
  get isProcessing() {
    return this.isFetching || this.isPlaying;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
