/**
 * Incremental Streaming TTS API Route using ElevenLabs
 * Accepts text chunks and streams audio in real-time
 * For minimum latency - audio starts before n8n finishes
 */

import { NextResponse } from 'next/server';
import WebSocket from 'ws';

// Store active sessions (in production, use Redis or similar)
const activeSessions = new Map();

// Session timeout configuration
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_TIMEOUT_MS) {
      console.log(`🧹 Cleaning up expired session: ${sessionId}`);
      try {
        if (session.ws && session.ws.readyState === 1) {
          session.ws.close();
        }
        if (session.writer) {
          session.writer.close().catch(() => {});
        }
      } catch (e) {
        // Ignore cleanup errors
      }
      activeSessions.delete(sessionId);
    }
  }
}, CLEANUP_INTERVAL_MS);

export async function POST(request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, sessionId, isFirst, isLast } = body;
    
    if (!text && !isLast) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    
    // If this is the first chunk, create new session
    if (isFirst || !sessionId || !activeSessions.has(sessionId)) {
      const newSessionId = sessionId || Date.now().toString();
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128`;
      
      console.log(`🔌 Creating new TTS session: ${newSessionId}`);
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': apiKey
        }
      });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      let wsReady = false;

      ws.on('open', () => {
        console.log(`✅ WebSocket connected for session ${newSessionId}`);
        wsReady = true;
        
        // Send initial text with configuration
        const message = {
          text: text || '',
          voice_settings: {
            stability: 0.70,
            similarity_boost: 0.55,
            style: 0.0,
            use_speaker_boost: true
          },
          try_trigger_generation: true,
          xi_api_key: apiKey
        };
        
        ws.send(JSON.stringify(message));
        console.log(`📝 Sent initial text: ${text?.length || 0} chars`);
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.audio) {
            const audioBuffer = Buffer.from(message.audio, 'base64');
            await writer.write(audioBuffer);
          }
          
          if (message.isFinal) {
            console.log(`✅ Session ${newSessionId} completed`);
            await writer.close();
            ws.close();
            activeSessions.delete(newSessionId);
          }
          
          if (message.error) {
            console.error(`❌ ElevenLabs error in session ${newSessionId}:`, message.error);
            await writer.abort(new Error(message.error));
            ws.close();
            activeSessions.delete(newSessionId);
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      });

      ws.on('error', async (error) => {
        console.error(`❌ WebSocket error in session ${newSessionId}:`, error);
        try {
          await writer.abort(error);
        } catch (e) {
          // Ignore
        }
        activeSessions.delete(newSessionId);
      });

      ws.on('close', async () => {
        console.log(`🔌 WebSocket closed for session ${newSessionId}`);
        try {
          await writer.close();
        } catch (e) {
          // Ignore
        }
        activeSessions.delete(newSessionId);
      });

      // Store session with timestamp
      activeSessions.set(newSessionId, { 
        ws, 
        writer, 
        wsReady: () => wsReady,
        createdAt: Date.now()
      });

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!wsReady) {
            ws.close();
            activeSessions.delete(newSessionId);
            reject(new Error('WebSocket connection timeout'));
          }
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          activeSessions.delete(newSessionId);
          reject(error);
        });
      });

      // Return streaming response with session ID
      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Transfer-Encoding': 'chunked',
          'X-Content-Type-Options': 'nosniff',
          'X-Session-Id': newSessionId,
        },
      });
    }

    // Append to existing session
    const session = activeSessions.get(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    if (!session.wsReady() || session.ws.readyState !== WebSocket.OPEN) {
      return NextResponse.json(
        { error: 'WebSocket not ready' },
        { status: 503 }
      );
    }

    // Send additional text chunk
    if (text && text.trim().length > 0) {
      const message = {
        text: text,
        try_trigger_generation: true
      };
      
      session.ws.send(JSON.stringify(message));
      console.log(`📝 Appended text to session ${sessionId}: ${text.length} chars`);
    }

    // If this is the last chunk, signal end
    if (isLast) {
      session.ws.send(JSON.stringify({ text: '' }));
      console.log(`🏁 Sent end signal to session ${sessionId}`);
    }

    return NextResponse.json({ 
      success: true,
      sessionId,
      appended: true 
    });

  } catch (error) {
    console.error('TTS Incremental Stream API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
