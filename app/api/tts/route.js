/**
 * Text-to-Speech API Route using MiniMax
 * Simple non-streaming approach: Convert text chunk to complete audio
 * 
 * The streaming happens at the TEXT level (from n8n)
 * Each text chunk gets converted to audio and returned immediately
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const apiKey = process.env.MINIMAX_API_KEY;
    const groupId = process.env.MINIMAX_GROUP_ID;
    
    if (!apiKey) {
      console.error('❌ MINIMAX_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'MINIMAX_API_KEY not configured. Get it from https://platform.minimax.io/' },
        { status: 500 }
      );
    }

    if (!groupId) {
      console.error('❌ MINIMAX_GROUP_ID not found in environment variables');
      return NextResponse.json(
        { error: 'MINIMAX_GROUP_ID not configured. Find it in MiniMax console under API settings or account info.' },
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

    console.log('🎤 Generating TTS for:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));

    const voiceId = process.env.MINIMAX_VOICE_ID;
    
    // Call MiniMax TTS API - NON-STREAMING (much simpler!)
    const requestBody = {
      model: 'speech-2.6-turbo',
      text: text,
      stream: false,  // Get complete audio, not streaming
      output_format: 'hex',
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        format: 'mp3',
        sample_rate: 32000,
        bitrate: 128000,
        channel: 1
      }
    };
    
    const startTime = Date.now();
    const response = await fetch(
      `https://api.minimax.io/v1/t2a_v2`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ MiniMax API error:', response.status, errorText);
      return NextResponse.json(
        { error: `MiniMax API failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const elapsed = Date.now() - startTime;
    
    // Check for errors in response
    if (data.base_resp && data.base_resp.status_code !== 0) {
      console.error('❌ MiniMax API error:', data.base_resp);
      return NextResponse.json(
        { error: data.base_resp.status_msg || 'MiniMax API error' },
        { status: 500 }
      );
    }

    // Extract audio from response
    let audioHex = null;
    if (data.data && data.data.audio) {
      audioHex = data.data.audio;
    } else if (data.audio) {
      audioHex = data.audio;
    }

    if (!audioHex) {
      console.error('❌ No audio in response. Keys:', Object.keys(data));
      return NextResponse.json(
        { error: 'No audio data in response' },
        { status: 500 }
      );
    }

    // Convert hex to binary audio
    const audioBytes = hexToBytes(audioHex);
    
    console.log(`✅ Generated ${audioBytes.length} bytes of audio in ${elapsed}ms`);
    
    // Return audio as binary (application/octet-stream)
    return new NextResponse(audioBytes, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBytes.length.toString(),
      },
    });

  } catch (error) {
    console.error('❌ TTS API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Helper function to convert hex string to Uint8Array
function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

export const runtime = 'nodejs';
