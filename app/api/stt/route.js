/**
 * Cross-Browser Speech-to-Text API using OpenAI Whisper
 * Works on ALL browsers (Firefox, Tor, Brave, Chrome, etc.)
 * Accepts audio blob and returns transcribed text
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 STT requests per minute

const MAX_MAP_SIZE = 10000; // Safety cap to prevent OOM

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

  // Probabilistic cleanup (run only 5% of the time)
  // This avoids O(N) iteration on every single request
  if (Math.random() < 0.05) {
    cleanupExpiredEntries(now);
  }

  // Hard safety limit
  if (requestCounts.size > MAX_MAP_SIZE) {
    console.warn('⚠️ Rate limit map exceeded safety cap, clearing all entries');
    requestCounts.clear();
  }

  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

function cleanupExpiredEntries(now) {
  for (const [key, value] of requestCounts.entries()) {
    if (now - value.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      requestCounts.delete(key);
    }
  }
}

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

    // RATE LIMITING: Check rate limit
    const clientId =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('user-agent') ||
      'unknown';
    if (!checkRateLimit(clientId)) {
      console.warn(`⚠️ STT rate limit exceeded for ${clientId}`);
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
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

    // Detect audio format more robustly
    const audioType = audioFile.type || '';
    const origName = audioFile.name || 'audio';

    // Map common mime types to extensions Whisper accepts well
    const mimeToExt = (mime) => {
      const m = mime.toLowerCase();
      if (m.includes('webm')) return 'webm';
      if (m.includes('ogg')) return 'ogg';
      if (m.includes('wav')) return 'wav';
      if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
      if (m.includes('mp4') || m.includes('m4a') || m.includes('aac') || m.includes('x-m4a')) return 'mp4'; // mp4 container
      return null;
    };

    let ext = mimeToExt(audioType);

    // If mime is missing or unhelpful, sniff magic bytes
    if (!ext) {
      const buf = Buffer.from(await audioFile.arrayBuffer());
      // WEBM: 1A 45 DF A3
      if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) ext = 'webm';
      // MP4: "ftyp" around offset 4
      else if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) ext = 'mp4';
      // OGG: "OggS"
      else if (buf.length >= 4 && buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) ext = 'ogg';
      // WAV: "RIFF"
      else if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) ext = 'wav';
      else ext = 'webm'; // last resort
    }

    const fileName = origName.includes('.') ? origName : `audio.${ext}`;

    // Use the incoming mime if present, otherwise pick a sane one
    const forcedMime =
      audioType ||
      (ext === 'mp4' ? 'audio/mp4' :
        ext === 'ogg' ? 'audio/ogg' :
          ext === 'wav' ? 'audio/wav' :
            ext === 'mp3' ? 'audio/mpeg' :
              'audio/webm');

    console.log(`🎙️ STT processing: ${audioFile.size} bytes, type: ${audioType || '(none)'}, using: ${fileName} (${forcedMime})`);

    const file = new File([audioFile], fileName, { type: forcedMime });

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
