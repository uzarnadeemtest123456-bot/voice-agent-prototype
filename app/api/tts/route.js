/**
 * ElevenLabs TTS API Endpoint
 * Returns complete audio files per text chunk for Safari-safe playback
 * Follows architecture requirements: server-side calls, complete files, no MSE
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured' },
        { status: 500 }
      );
    }

    if (!voiceId) {
      return NextResponse.json(
        { error: 'ELEVENLABS_VOICE_ID not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, requestId, chunkId } = body;
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    console.log(`🎤 TTS Request [req:${requestId}, chunk:${chunkId}]: "${text.substring(0, 50)}..."`);

    // Call ElevenLabs TTS API
    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    
    const elevenLabsResponse = await fetch(elevenLabsUrl, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
      // Forward abort signal from client
      signal: request.signal,
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error('❌ ElevenLabs API error:', errorText);
      return NextResponse.json(
        { error: 'ElevenLabs TTS failed', details: errorText },
        { status: elevenLabsResponse.status }
      );
    }

    // Get audio bytes
    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    console.log(`✅ TTS Response [req:${requestId}, chunk:${chunkId}]: ${audioBuffer.byteLength} bytes`);

    // Return complete audio file with proper headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Request-Id': String(requestId),
        'X-Chunk-Id': String(chunkId),
      },
    });

  } catch (error) {
    // Check if request was aborted
    if (error.name === 'AbortError') {
      console.log('⚠️ TTS request aborted');
      return new NextResponse(null, { status: 499 }); // Client closed request
    }

    console.error('❌ TTS API error:', error);
    return NextResponse.json(
      { error: 'TTS generation failed', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
