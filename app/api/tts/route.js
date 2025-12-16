/**
 * Text-to-Speech API Route using ElevenLabs
 * Much better quality than OpenAI TTS - natural, emotional, no stuttering
 * Supports streaming for instant playback
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured. Please add it to .env.local' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const text = body.text;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    // ElevenLabs voice ID (default: Rachel - natural, warm, clear)
    // Other good voices: 21m00Tcm4TlvDq8ikWAM (Rachel), EXAVITQu4vr4xnSDxMaL (Bella)
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    
    // Call ElevenLabs TTS API with streaming
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5', // Fast model with great quality
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return NextResponse.json(
        { error: `ElevenLabs API failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    // Stream the audio directly to the client
    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
