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

    const voiceId = process.env.MINIMAX_VOICE_ID;
    
    // MiniMax TTS API configuration - kept as specified
    const requestBody = {
      model: 'speech-2.6-hd',
      text: text,
      stream: true,
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
    
    const startTime = Date.now();
    console.log(`🎤 [TTS] Streaming text to MiniMax: "${text.substring(0, 50)}..."`);
    
    const response = await fetch(
      `https://api.minimax.io/v1/t2a_v2`,
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
      console.error('❌ MiniMax API error:', response.status, errorText);
      return NextResponse.json(
        { error: `MiniMax API failed: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    // MiniMax sends cumulative chunks - collect all and send only the last (complete) one
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkTime = null;
    let audioChunkCount = 0;
    let lastAudioBuffer = null;
    let totalAudioBytes = 0;
    
    const audioStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              const elapsed = Date.now() - startTime;
              console.log(`✅ [TTS] Complete: ${audioChunkCount} chunks received, sending last chunk (${lastAudioBuffer?.length || 0} bytes) in ${elapsed}ms`);
              
              // Send only the last chunk (which contains the complete audio)
              if (lastAudioBuffer) {
                controller.enqueue(lastAudioBuffer);
              }
              
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
                      console.error('❌ [TTS] MiniMax error:', eventData.base_resp);
                      controller.error(new Error(eventData.base_resp.status_msg || 'MiniMax streaming error'));
                      return;
                    }
                    
                    // Extract audio hex data
                    let audioHex = null;
                    if (eventData.data?.audio) {
                      audioHex = eventData.data.audio;
                    } else if (eventData.audio) {
                      audioHex = eventData.audio;
                    }
                    
                    if (audioHex && audioHex.length > 0) {
                      // Convert hex to binary
                      const audioBuffer = Buffer.from(audioHex, 'hex');
                      audioChunkCount++;
                      totalAudioBytes += audioBuffer.length;
                      
                      if (firstChunkTime === null) {
                        firstChunkTime = Date.now() - startTime;
                        console.log(`⚡ [TTS] First audio chunk in ${firstChunkTime}ms (${audioBuffer.length} bytes)`);
                      }
                      
                      // Keep overwriting with latest chunk (cumulative)
                      lastAudioBuffer = audioBuffer;
                      console.log(`🎵 [TTS] Chunk ${audioChunkCount}: ${audioBuffer.length} bytes (kept as last)`);
                    }
                  } catch (parseError) {
                    console.error('❌ [TTS] Failed to parse SSE data:', parseError);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ [TTS] Stream error:', error);
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
    console.error('❌ [TTS] API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
