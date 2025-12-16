/**
 * Cross-Browser Speech-to-Text API using OpenAI Whisper
 * Works on ALL browsers (Firefox, Tor, Brave, Chrome, etc.)
 * Accepts audio blob and returns transcribed text
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

    // Get audio blob from form data
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Convert blob to File object for Whisper API
    const file = new File([audioFile], 'audio.webm', { type: 'audio/webm' });

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'json'
      // No prompt to avoid hallucinations on silence
    });

    console.log('Whisper transcription:', transcription.text);

    return NextResponse.json({
      text: transcription.text,
      success: true
    });

  } catch (error) {
    console.error('Whisper STT error:', error);
    return NextResponse.json(
      { error: 'Speech recognition failed', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
