/**
 * WebSocket-based Streaming TTS API Route using ElevenLabs
 * GOLD STANDARD - Single persistent connection for entire AI response
 * Eliminates prosody resets and stuttering between chunks
 */

import { NextResponse } from 'next/server';
import WebSocket from 'ws';

export async function POST(request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured. Please add it to .env.local' },
        { status: 500 }
      );
    }

    // Get text from request body
    const body = await request.json();
    const text = body.text;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    // Get voice ID
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    
    // Create WebSocket URL
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128`;
    
    console.log('🔌 Connecting to ElevenLabs WebSocket...');
    
    // Create WebSocket connection to ElevenLabs
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': apiKey
      }
    });

    // Create a readable stream for the response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    let wsReady = false;

    // WebSocket connection opened
    ws.on('open', () => {
      console.log('✅ WebSocket connected to ElevenLabs');
      wsReady = true;
      
      // Send text with configuration
      const message = {
        text: text,
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
      console.log(`📝 Sent text to ElevenLabs (${text.length} chars)`);
      
      // Signal end of text input
      ws.send(JSON.stringify({ text: '' }));
      console.log('🏁 Sent end signal to ElevenLabs');
    });

    // Receive audio chunks from ElevenLabs
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.audio) {
          // Audio chunk received - decode base64 and send to client
          const audioBuffer = Buffer.from(message.audio, 'base64');
          await writer.write(audioBuffer);
        }
        
        if (message.isFinal) {
          console.log('✅ ElevenLabs stream completed');
          await writer.close();
          ws.close();
        }
        
        if (message.error) {
          console.error('❌ ElevenLabs error:', message.error);
          await writer.abort(new Error(message.error));
          ws.close();
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    });

    ws.on('error', async (error) => {
      console.error('❌ WebSocket error:', error);
      try {
        await writer.abort(error);
      } catch (e) {
        // Writer might already be closed
      }
    });

    ws.on('close', async () => {
      console.log('🔌 WebSocket closed');
      try {
        await writer.close();
      } catch (e) {
        // Writer might already be closed
      }
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!wsReady) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Return streaming response
    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (error) {
    console.error('TTS Stream API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
