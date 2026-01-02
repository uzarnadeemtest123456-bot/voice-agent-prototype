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
const SESSION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (shorter to prevent ElevenLabs timeout)
const CLEANUP_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

// MEMORY LEAK FIX: Use on-demand cleanup instead of persistent setInterval
let cleanupTimer = null;

function scheduleCleanup() {
  // Clear any existing timer
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }
  
  // Only schedule cleanup if there are active sessions
  if (activeSessions.size > 0) {
    cleanupTimer = setTimeout(() => {
      const now = Date.now();
      let hasExpired = false;
      
      for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.createdAt > SESSION_TIMEOUT_MS) {
          console.log(`🧹 Cleaning up expired session: ${sessionId}`);
          hasExpired = true;
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
      
      // Reschedule if there are still active sessions
      if (activeSessions.size > 0) {
        scheduleCleanup();
      } else {
        cleanupTimer = null;
      }
    }, CLEANUP_INTERVAL_MS);
  } else {
    cleanupTimer = null;
  }
}

// Simple rate limiting (per session ID)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // Max 100 requests per minute per session

function checkRateLimit(identifier) {
  const now = Date.now();
  const record = requestCounts.get(identifier) || { count: 0, windowStart: now };
  
  // Reset window if expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  
  record.count++;
  requestCounts.set(identifier, record);
  
  // Cleanup old entries periodically
  if (requestCounts.size > 1000) {
    for (const [key, value] of requestCounts.entries()) {
      if (now - value.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        requestCounts.delete(key);
      }
    }
  }
  
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

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
    
    // RATE LIMITING: Check rate limit
    const clientId = sessionId || request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientId)) {
      console.warn(`⚠️ Rate limit exceeded for ${clientId}`);
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
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
            // BUG FIX: Only close if we actually requested to end input
            const sess = activeSessions.get(newSessionId);
            if (sess?.endingRequested) {
              console.log(`✅ Session ${newSessionId} fully completed (endingRequested)`);
              await writer.close();
              ws.close();
              activeSessions.delete(newSessionId);
            } else {
              // Important: do NOT close the stream here - more chunks may be coming
              console.log(`ℹ️ isFinal received for chunk, keeping session open: ${newSessionId}`);
            }
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

      // Store session with timestamp, cleanup flag, and endingRequested flag
      activeSessions.set(newSessionId, { 
        ws, 
        writer, 
        wsReady: () => wsReady,
        createdAt: Date.now(),
        cleanupScheduled: false,
        endingRequested: false // BUG FIX: Track when client requests end
      });
      
      // MEMORY LEAK FIX: Schedule cleanup timer
      scheduleCleanup();

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

    // BUG FIX: If this is the last chunk, mark endingRequested and signal end
    if (isLast) {
      session.endingRequested = true; // BUG FIX: Mark that we're ending
      session.ws.send(JSON.stringify({ text: '' }));
      console.log(`🏁 Sent end signal to session ${sessionId} (endingRequested = true)`);
      
      // Mark cleanup as scheduled to prevent double cleanup
      if (!session.cleanupScheduled) {
        session.cleanupScheduled = true;
        
        // Close WebSocket after delay to allow final audio chunks
        // This is the ONLY cleanup path to prevent race condition
        setTimeout(() => {
          if (activeSessions.has(sessionId)) {
            const sess = activeSessions.get(sessionId);
            console.log(`🧹 Scheduled cleanup for session ${sessionId}`);
            try {
              if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
                sess.ws.close();
              }
              activeSessions.delete(sessionId);
              // Reschedule cleanup check
              scheduleCleanup();
            } catch (e) {
              // Ignore
            }
          }
        }, 2000); // Give 2 seconds for final audio chunks
      }
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
