/**
 * Text-to-Speech API Route using MiniMax with Streaming
 * Redesigned for minimal latency: text chunk → audio stream → immediate playback
 * 
 * Flow: n8n streams text → client sends chunks → MiniMax streams audio → client plays
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
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `MiniMax API failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    // Stream audio chunks immediately as they arrive from MiniMax
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    const audioStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }
            
            // Decode SSE stream
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete SSE events (delimited by \n\n)
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            
            for (const event of events) {
              if (!event.trim()) continue;
              
              // Parse SSE format: "data: {...}"
              const lines = event.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const eventData = JSON.parse(line.substring(6));
                    
                    // Check for errors
                    if (eventData.base_resp && eventData.base_resp.status_code !== 0) {
                      controller.error(new Error(eventData.base_resp.status_msg || 'MiniMax streaming error'));
                      return;
                    }
                    
                    // Extract status and audio hex data
                    const status = eventData?.data?.status;
                    let audioHex = null;
                    
                    if (eventData.data?.audio) {
                      audioHex = eventData.data.audio;
                    } else if (eventData.audio) {
                      audioHex = eventData.audio;
                    }
                    
                    // Only process and send chunks when status === 1 (streaming audio)
                    // status === 2 means done/summary, no audio to send
                    if (status === 1 && audioHex && audioHex.length > 0) {
                      // Convert hex to binary and immediately enqueue
                      const audioBuf = Buffer.from(audioHex, 'hex');
                      
                      // Stream immediately - don't accumulate
                      controller.enqueue(audioBuf);
                    }
                  } catch (parseError) {
                    // Skip malformed SSE data
                  }
                }
              }
            }
          }
        } catch (error) {
          controller.error(error);
        }
      }
    });
    
    // Return streaming audio response
    return new NextResponse(audioStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
