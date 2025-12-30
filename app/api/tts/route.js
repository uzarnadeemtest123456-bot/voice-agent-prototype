/**
 * Text-to-Speech API Route using ElevenLabs
 * TRUE STREAMING PROXY - Pipes audio chunks directly without buffering
 * Optimized for lowest latency and smoothest playback
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
          // OPTIMIZED MODEL: eleven_turbo_v2_5 is fastest, but use eleven_flash_v2_5 for even better speed
          // Options: 'eleven_flash_v2_5' (fastest), 'eleven_turbo_v2_5' (fast), 'eleven_turbo_v2' (stable)
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            // OPTIMIZED FOR STABILITY & NO STUTTERING:
            stability: 0.70,              // Increased from 0.5 to 0.70 for more consistent voice (less variation = less stutter)
            similarity_boost: 0.55,       // Reduced from 0.75 to 0.55 for less processing overhead
            style: 0.0,                   // Keep at 0 for neutral, consistent delivery
            use_speaker_boost: true       // Enhances clarity without adding latency
          },
          // Optional: Add output format for better compatibility
          output_format: 'mp3_44100_128' // High quality MP3, widely supported
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

    // ✨ TRUE STREAMING: Pipe the response body directly to client without buffering
    // This eliminates the 200-500ms delay from buffering the entire audio
    // Audio chunks flow: ElevenLabs → Next.js (pass-through) → Browser
    
    if (!response.body) {
      throw new Error('No response body from ElevenLabs');
    }

    // Create a streaming response that pipes ElevenLabs directly to the client
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Transfer-Encoding': 'chunked', // Enable chunked transfer
        'X-Content-Type-Options': 'nosniff',
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
