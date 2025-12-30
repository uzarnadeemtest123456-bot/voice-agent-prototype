/**
 * Text-to-Speech API Route using ElevenLabs
 * TRUE STREAMING PROXY - Pipes audio chunks directly without buffering
 * Optimized for lowest latency and smoothest playback
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'MINIMAX_API_KEY not configured. Get it from https://platform.minimax.io/' },
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

    const voiceId = process.env.MINIMAX_VOICE_ID;
    
    // MiniMax TTS API configuration with explicit output format
    const requestBody = {
      model: 'speech-2.6-turbo',
      text: text,
      stream: true,
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 1
      },
      audio_setting: {
        format: 'mp3',
        sample_rate: 32000,
        bitrate: 128000,
        channel: 2
      }
    };
    
    const response = await fetch(
      `https://api-uw.minimax.io/v1/t2a_v2`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          text: text,
          // OPTIMIZED MODEL: eleven_turbo_v2_5 is fastest, but use eleven_flash_v2_5 for even better speed
          // Options: 'eleven_flash_v2_5' (fastest), 'eleven_turbo_v2_5' (fast), 'eleven_turbo_v2' (stable)
          model_id: 'eleven_turbo_v2_5',
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
      return NextResponse.json(
        { error: `MiniMax API failed: ${response.status}`, details: errorText },
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
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
