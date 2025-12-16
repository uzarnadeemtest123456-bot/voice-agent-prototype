/**
 * Query Rephrasing API
 * Takes raw speech-to-text output and cleans/rephrases it
 * Fixes pronunciation errors like "tuxmat" variants
 * No intent logic - always returns cleaned text for n8n
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

    const body = await request.json();
    const { query } = body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'No query provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a text correction assistant. Your job is to clean up speech-to-text transcriptions.

Common issues to fix:
- Brand name "TuxMat" is often misheard as: "stack mat", "stuck mat", "text max", "tux matt", "tucks mat", "customers set", etc.
- Fix grammar and punctuation
- Correct obvious pronunciation errors
- Keep the user's intent unchanged

Examples:
Input: "what are stuck mats made of"
Output: "what are TuxMat mats made of"

Input: "tell me about text max for my honda civic"
Output: "tell me about TuxMat for my Honda Civic"

Input: "whats the status of order number 119395"
Output: "what's the status of order number 119395"

Rules:
1. Always normalize brand name variations to "TuxMat"
2. Fix grammar but keep user's intent and tone
3. Keep order numbers, vehicle models, and product types intact
4. Output ONLY the corrected text, no explanations
5. If the input is already clean, return it as-is`
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const rephrased = completion.choices[0].message.content.trim();
    
    console.log('Rephrasing:', {
      original: query,
      rephrased: rephrased
    });

    return NextResponse.json({
      original: query,
      rephrased: rephrased,
      success: true
    });

  } catch (error) {
    console.error('Rephrase API error:', error);
    return NextResponse.json(
      { error: 'Rephrasing failed', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
