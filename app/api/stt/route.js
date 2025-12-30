/**
 * Cross-Browser Speech-to-Text API using OpenAI Whisper
 * Works on ALL browsers (Firefox, Tor, Brave, Chrome, etc.)
 * Accepts audio blob and returns transcribed text
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Common Whisper hallucinations when there's silence or background noise
const HALLUCINATION_PATTERNS = [
  /^thank you\.?$/i,
  /^thanks\.?$/i,
  /^yes\.?$/i,
  /^yeah\.?$/i,
  /^yep\.?$/i,
  /^okay\.?$/i,
  /^ok\.?$/i,
  /^bye\.?$/i,
  /^goodbye\.?$/i,
  /^hello\.?$/i,
  /^hi\.?$/i,
  /^hmm\.?$/i,
  /^uh\.?$/i,
  /^um\.?$/i,
  /^ah\.?$/i,
  /^oh\.?$/i,
  /^you\.?$/i,
  /^\s*$/,
  /^\.+$/,
  /^thank you for watching\.?$/i,
  /^thanks for watching\.?$/i,
  /^subscribe\.?$/i,
  /^please subscribe\.?$/i,
  /^subtitles by.*$/i,
  /^\[.*\]$/,
  /^\(.*\)$/,
];

function isLikelyHallucination(text) {
  const trimmed = text.trim();
  
  // Empty or very short
  if (trimmed.length === 0 || trimmed.length < 2) {
    return true;
  }
  
  // Check against hallucination patterns
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  return false;
}

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

    // Transcribe using Whisper with temperature=0 to reduce hallucinations
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
      temperature: 0.0, // Lower temperature = less creative/hallucinatory
      // prompt: "Transcribe the following audio. If there is no speech, return empty." // Can help but may introduce bias
    });

    console.log('Whisper raw transcription:', transcription.text);

    // Filter out hallucinations
    if (isLikelyHallucination(transcription.text)) {
      console.log('⚠️ Detected hallucination, returning empty string');
      return NextResponse.json({
        text: '',
        success: true,
        filtered: true
      });
    }

    return NextResponse.json({
      text: transcription.text,
      success: true
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Speech recognition failed', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
