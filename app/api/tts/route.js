/**
 * Text-to-Speech API Route
 * Accepts text and returns streaming audio using OpenAI TTS
 * Supports immediate playback as audio chunks arrive
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Parse JSON body
    const body = await request.json();
    const text = body.text;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Prepare request for OpenAI TTS with fallback defaults
    const ttsModel = process.env.VOICE_MODEL_TTS || 'tts-1';
    const ttsVoice = process.env.TTS_VOICE || 'alloy';

    // Use OpenAI SDK for streaming
    const response = await openai.audio.speech.create({
      model: ttsModel,
      voice: ttsVoice,
      input: text,
      response_format: 'mp3',
      speed: 1.05
    });

    // Get the response as an array buffer
    const audioBuffer = await response.arrayBuffer();
    
    // Return audio with proper headers for streaming
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

// Export runtime config for Node.js features
export const runtime = 'nodejs';
