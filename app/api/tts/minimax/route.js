/**
 * Minimax TTS API Endpoint
 * Returns streaming audio from Minimax API
 * Follows architecture requirements: server-side calls, streaming support
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const apiKey = process.env.MINIMAX_API_KEY;
        const voiceId = process.env.MINIMAX_VOICE_ID;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'MINIMAX_API_KEY not configured' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { text, requestId, chunkId } = body;

        if (!text || text.trim().length === 0) {
            return NextResponse.json(
                { error: 'No text provided' },
                { status: 400 }
            );
        }

        const minimaxUrl = 'https://api.minimax.io/v1/t2a_v2';

        // Minimax T2A v2 Payload
        const payload = {
            model: "speech-2.6-turbo", // High speed model suitable for streaming
            text: text,
            stream: true,
            voice_setting: {
                voice_id: voiceId || "male-qn-qingse", // Default if not provided
                speed: 1.1,
                vol: 1.0,
                pitch: 0
            },
            audio_setting: {
                format: "mp3",
                sample_rate: 32000,
                bitrate: 128000,
                channel: 1
            }
        };

        const minimaxResponse = await fetch(minimaxUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: request.signal,
        });

        if (!minimaxResponse.ok) {
            const errorText = await minimaxResponse.text();
            console.error('❌ Minimax API error:', errorText);
            return NextResponse.json(
                { error: 'Minimax TTS generation failed', details: errorText },
                { status: minimaxResponse.status }
            );
        }

        // Minimax returns SSE (text/event-stream) with "data: { \"data\": { \"audio\": \"<hex>\" } }"
        // We need to decode this stream into raw audio bytes for the frontend

        const decoder = new TextDecoder();
        const hexToBytes = (hexString) => {
            // Ensure even length
            const cleanHex = hexString.length % 2 === 0 ? hexString : hexString.slice(0, -1);
            if (!cleanHex) return new Uint8Array();
            const pairs = cleanHex.match(/.{1,2}/g);
            if (!pairs) return new Uint8Array();
            return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
        };

        const getOverlapSize = (existing, incoming) => {
            // Find the longest suffix of "existing" that is a prefix of "incoming"
            const maxCheck = Math.min(existing.length, incoming.length);
            for (let i = maxCheck; i >= 2; i -= 2) {
                if (existing.endsWith(incoming.slice(0, i))) {
                    return i;
                }
            }
            return 0;
        };

        const transformStream = new TransformStream({
            start() {
                this.buffer = "";
                this.accumulatedHex = ""; // Track all audio we've already emitted
            },
            async transform(chunk, controller) {
                const text = decoder.decode(chunk, { stream: true });
                this.buffer += text;

                const lines = this.buffer.split("\n");
                this.buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.trim().startsWith("data:")) {
                        try {
                            const jsonStr = line.substring(5).trim();
                            if (!jsonStr) continue;

                            const data = JSON.parse(jsonStr);

                            // Check for audio data (hex string)
                            const audioHex = data.data?.audio;
                            if (typeof audioHex === "string" && audioHex.trim()) {
                                const hexString = audioHex.trim();
                                let emitHex = hexString;

                                if (this.accumulatedHex) {
                                    if (hexString.startsWith(this.accumulatedHex)) {
                                        // Pure accumulation: only send the new delta
                                        emitHex = hexString.slice(this.accumulatedHex.length);
                                        this.accumulatedHex = hexString;
                                    } else if (this.accumulatedHex.startsWith(hexString)) {
                                        // Entire chunk already sent, skip
                                        emitHex = "";
                                    } else {
                                        // Try to align on overlap to avoid replaying already-spoken audio
                                        const overlapSize = getOverlapSize(this.accumulatedHex, hexString);
                                        if (overlapSize > 0) {
                                            emitHex = hexString.slice(overlapSize);
                                            this.accumulatedHex += emitHex;
                                        } else {
                                            // Treat as a new delta and append so future accumulation detection still works
                                            this.accumulatedHex += emitHex;
                                        }
                                    }
                                } else {
                                    // First chunk
                                    this.accumulatedHex = emitHex;
                                }

                                if (emitHex.length > 0) {
                                    const bytes = hexToBytes(emitHex);
                                    if (bytes.length) {
                                        controller.enqueue(bytes);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn("Error parsing Minimax SSE line:", e);
                        }
                    }
                }
            }
        });

        // Pipe the Minimax response through our transformer
        const audioStream = minimaxResponse.body.pipeThrough(transformStream);

        return new NextResponse(audioStream, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-store',
                'X-Request-Id': String(requestId),
                'X-Chunk-Id': String(chunkId),
            },
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            return new NextResponse(null, { status: 499 });
        }

        console.error('❌ Minimax TTS API error:', error);
        return NextResponse.json(
            { error: 'TTS generation failed', message: error.message },
            { status: 500 }
        );
    }
}

export const runtime = 'nodejs';
