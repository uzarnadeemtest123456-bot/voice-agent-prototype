/**
 * Intent Classification & Direct Response API
 * Determines if user query needs tool call or can be answered directly
 * For direct replies, also generates the response
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
    const { query, conversationHistory = [] } = body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'No query provided' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Build conversation context
    const messages = [
      {
        role: 'system',
        content: `You are a voice-first AI assistant whose ONLY job is intent classification and response selection.

                  You must decide whether:
                  1) The user should receive a direct reply
                  2) The request requires a tool call (handled later by code)

                  IMPORTANT SPEECH-TO-TEXT ISSUE:
                  The brand name "TuxMat" is frequently misheard by speech-to-text systems.

                  Treat ALL of the following as the same brand:
                  - stack mat
                  - stuck mat
                  - text max
                  - tux matt
                  - tucks mat
                  - customers set
                  - any similar-sounding variation

                  Always normalize these internally to the exact brand name: "TuxMat".

                  ────────────────────────
                  INTENT RULES
                  ────────────────────────

                  Use "direct_reply" when:
                  - Greetings or small talk
                  - General knowledge unrelated to TuxMat
                  - Explanations you can answer without TuxMat-specific data

                  Use "needs_tool" when:
                  - The user asks about TuxMat products
                  - Materials or manufacturing origin
                  - Definitions of mat types (floor mats, trunk mats, cargo mats)
                  - Vehicle-specific recommendations
                  - Order details or order status (including order numbers)

                  Common TuxMat-related questions include:
                  - What is TuxMat made of?
                  - Where is TuxMat made?
                  - What are trunk mats?
                  - What is the best mat for a specific vehicle?
                  - What are the details of my order number 119395?

                  ────────────────────────
                  NORMALIZATION AWARENESS
                  ────────────────────────

                  If the intent is "needs_tool":
                  - Assume the query will be normalized later by code
                  - Mentally treat any misheard brand name as "TuxMat"
                  - Preserve key entities such as:
                    - Order numbers
                    - Vehicle make/model
                    - Product type

                  DO NOT perform tool calls yourself.
                  DO NOT output normalized queries.
                  Your job ends at intent classification.

                  ────────────────────────
                  OUTPUT FORMAT (MANDATORY)
                  ────────────────────────

                  Respond in this EXACT JSON format and nothing else:

                  {
                    "intent": "direct_reply" or "needs_tool",
                    "response": "your response text here (ONLY if intent is direct_reply)",
                    "confidence": 0.0-1.0
                  }

                  Rules:
                  - If intent is "needs_tool", omit the response field or leave it empty
                  - Do not add extra keys
                  - Do not explain your reasoning
                  - Do not include markdown

                  `
      }
    ];

    // Add conversation history for context
    conversationHistory.slice(-4).forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });

    // Add current query
    messages.push({
      role: 'user',
      content: query
    });

    // Call OpenAI with cheaper model for classification
    const completion = await openai.chat.completions.create({
      model: process.env.INTENT_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    console.log('Intent classification:', {
      query,
      intent: result.intent,
      confidence: result.confidence
    });

    return NextResponse.json({
      intent: result.intent || 'direct_reply',
      response: result.response || '',
      confidence: result.confidence || 0.9,
      model: completion.model
    });

  } catch (error) {
    console.error('Intent API error:', error);
    return NextResponse.json(
      { error: 'Intent classification failed', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
