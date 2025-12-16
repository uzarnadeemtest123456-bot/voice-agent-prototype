# Voice AI Assistant - Universal Browser Support

A Next.js voice assistant with cross-browser support, intelligent query processing, and high-quality text-to-speech.

## 🎯 Architecture Overview

```
User Speech
    ↓
[Whisper STT] ← Works on ALL browsers (Chrome, Firefox, Brave, Tor, etc.)
    ↓
[OpenAI GPT] ← Cleans/rephrases query (fixes "TuxMat" pronunciations)
    ↓
[n8n Webhook] ← Handles all queries, streams responses
    ↓
[ElevenLabs TTS] ← Natural, emotional speech (no stuttering)
    ↓
User Hears Response
```

## ✨ Key Features

### 1. **Universal Speech-to-Text (STT)**
- ✅ Works on **ALL browsers** (Firefox, Tor, Brave, Chrome, Edge, Safari)
- Uses OpenAI Whisper API instead of browser-specific APIs
- Records audio using standard MediaRecorder API
- High accuracy transcription

### 2. **Simplified Query Flow**
- ❌ **Removed:** Intent classification logic
- ✅ **New:** Direct query → rephrase → n8n
- OpenAI only cleans/rephrases queries (fixes pronunciation errors)
- All responses come from n8n (streaming supported)

### 3. **Superior Text-to-Speech (TTS)**
- ❌ **Removed:** OpenAI TTS (stuttering issues)
- ✅ **New:** ElevenLabs TTS
- Natural, emotional, human-like voices
- Streaming support for instant playback
- No stuttering or robotic sound

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ installed
- OpenAI API key (for Whisper STT + query cleanup)
- ElevenLabs API key (for TTS)
- n8n webhook URL configured

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create/update `.env.local`:

```bash
# n8n Brain Webhook URL (streaming endpoint)
NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL=your_n8n_webhook_url_here

# OpenAI API Configuration
# Required for: Whisper STT (cross-browser), Query rephrasing/cleanup
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs API Configuration
# Required for: High-quality TTS (natural, emotional, no stuttering)
# Get your API key from: https://elevenlabs.io/
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# ElevenLabs Voice Configuration (Optional)
# Default: Rachel (21m00Tcm4TlvDq8ikWAM) - natural, warm, clear
# Other options: Bella (EXAVITQu4vr4xnSDxMaL), Josh (TxGEqnHWrfWFTfGW9XjX)
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

### 3. Get API Keys

#### OpenAI API Key
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Add it to `.env.local`

#### ElevenLabs API Key
1. Visit https://elevenlabs.io/
2. Sign up for a free account (10,000 characters/month free tier)
3. Go to Profile → API Keys
4. Generate a new API key
5. Add it to `.env.local`

#### Choose ElevenLabs Voice (Optional)
1. Visit https://elevenlabs.io/voice-library
2. Browse and preview voices
3. Find voice you like and copy its ID
4. Update `ELEVENLABS_VOICE_ID` in `.env.local`

**Popular voices:**
- Rachel (21m00Tcm4TlvDq8ikWAM) - Natural, warm, clear [Default]
- Bella (EXAVITQu4vr4xnSDxMaL) - Expressive, youthful
- Josh (TxGEqnHWrfWFTfGW9XjX) - Deep, authoritative male voice

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000/voice

## 🎙️ How to Use

1. **Click "Start"** - Grants microphone permission and starts recording
2. **Speak your question** - The app records your audio
3. **Click "Stop Speaking"** - Stops recording and processes your query
4. **Wait for response** - Query is transcribed → cleaned → sent to n8n → spoken back

### User Flow:

```
1. User clicks "Start"
   → Microphone permission granted
   → Recording begins

2. User speaks: "what are stuck mats made of?"
   → Audio recorded to browser memory

3. User clicks "Stop Speaking"
   → Recording stops
   → Audio sent to Whisper API
   → Transcribed: "what are stuck mats made of"

4. Query cleaned by OpenAI
   → Fixed: "what are TuxMat mats made of"

5. Cleaned query sent to n8n
   → n8n processes and streams response

6. Response converted to speech
   → ElevenLabs generates natural audio
   → Plays immediately as chunks arrive
   → User hears smooth, natural response
```

## 📁 Project Structure

```
vapi_voice_test/
├── app/
│   ├── api/
│   │   ├── stt/
│   │   │   └── route.js           # Whisper STT (cross-browser)
│   │   ├── rephrase/
│   │   │   └── route.js           # Query cleanup (fixes pronunciations)
│   │   ├── tts/
│   │   │   └── route.js           # ElevenLabs TTS
│   │   └── chat/intent/
│   │       └── route.js           # [DEPRECATED] Old intent logic
│   └── voice/
│       └── page.jsx               # Voice mode page
├── components/
│   └── VoiceModeUI.jsx            # Main voice interface component
├── lib/
│   ├── audioPlayer.js             # Audio playback queue manager
│   ├── audioLevel.js              # Breathing animation helper
│   ├── sse.js                     # Server-sent events parser
│   └── ttsQueue.js                # TTS queue utility
└── .env.local                     # Environment configuration
```

## 🔧 API Endpoints

### `/api/stt` - Speech-to-Text
- **Method:** POST
- **Input:** FormData with audio blob
- **Output:** Transcribed text
- **Technology:** OpenAI Whisper
- **Browser Support:** All (Firefox, Tor, Brave, Chrome, etc.)

### `/api/rephrase` - Query Cleanup
- **Method:** POST
- **Input:** `{ query: "raw user speech" }`
- **Output:** `{ rephrased: "cleaned query" }`
- **Purpose:** Fix pronunciation errors, normalize brand names

### `/api/tts` - Text-to-Speech
- **Method:** POST
- **Input:** `{ text: "text to speak" }`
- **Output:** Audio stream (MP3)
- **Technology:** ElevenLabs
- **Quality:** High (natural, emotional, no stuttering)

## 🐛 Troubleshooting

### ElevenLabs API Error
**Problem:** "ELEVENLABS_API_KEY not configured"

**Solution:**
1. Get API key from https://elevenlabs.io/
2. Add to `.env.local`
3. Restart dev server

### Microphone Not Working
**Problem:** "Could not access microphone"

**Solution:**
1. Grant microphone permission when prompted
2. Check browser settings → Privacy → Microphone
3. Ensure HTTPS (or localhost for development)

### Whisper Transcription Fails
**Problem:** "Transcription failed"

**Solution:**
1. Verify OpenAI API key is valid
2. Ensure you have API credits
3. Check recording is at least 1 second long

### n8n Webhook Not Responding
**Problem:** "n8n webhook failed"

**Solution:**
1. Verify `NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL` is correct
2. Ensure n8n workflow is active
3. Check n8n logs for errors

## 🆚 What Changed?

### Old Architecture (Browser-Dependent)
```
Browser STT (WebKit) → Intent Classification → OpenAI/n8n → OpenAI TTS
❌ Only worked on Chrome/Edge/Safari
❌ Complex intent routing logic
❌ OpenAI TTS stutters
```

### New Architecture (Universal)
```
Whisper STT → Query Cleanup → n8n → ElevenLabs TTS
✅ Works on ALL browsers
✅ Simple, direct flow
✅ Superior voice quality
```

## 💰 Cost Estimation

### Per Conversation (Avg 10 exchanges):

**OpenAI (Whisper STT):**
- ~$0.006/minute of audio
- 10 queries × 3 seconds = 30 seconds = **~$0.003**

**OpenAI (Query Cleanup):**
- ~$0.0001 per query
- 10 queries = **~$0.001**

**ElevenLabs (TTS):**
- Free tier: 10,000 characters/month
- Paid: ~$0.30 per 1,000 characters
- 10 responses × 100 chars = 1,000 chars = **~$0.30**

**Total per conversation:** ~$0.30 (mostly TTS)

**Optimization tips:**
- Use ElevenLabs free tier (10k chars/month = ~100 responses)
- Cache common responses
- Batch similar queries

## 📝 Common Pronunciation Fixes

The rephrase API automatically fixes these common errors:

| User Says | Whisper Hears | Rephrased To |
|-----------|---------------|--------------|
| "TuxMat" | "stuck mat" | "TuxMat" |
| "TuxMat" | "text max" | "TuxMat" |
| "TuxMat" | "tucks mat" | "TuxMat" |
| "Honda Civic" | "honda civic" | "Honda Civic" |
| "order 119395" | "order one one nine three nine five" | "order 119395" |

## 🎨 Customization

### Change TTS Voice

Edit `.env.local`:
```bash
ELEVENLABS_VOICE_ID=your_preferred_voice_id
```

Browse voices: https://elevenlabs.io/voice-library

### Adjust TTS Settings

Edit `app/api/tts/route.js`:
```javascript
voice_settings: {
  stability: 0.5,        // 0-1 (higher = more consistent)
  similarity_boost: 0.75, // 0-1 (higher = more similar to original)
  style: 0.0,            // 0-1 (higher = more expressive)
  use_speaker_boost: true // Enhance voice clarity
}
```

### Change n8n Webhook Payload

Edit `components/VoiceModeUI.jsx` → `callBrainWebhook()`:
```javascript
body: JSON.stringify({
  query: userText,
  knowledge_model: 23,  // Your model ID
  country: "CA",        // Your country code
  // Add custom fields here
})
```

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Settings → Environment Variables
```

### Environment Variables for Production

Ensure these are set in your deployment platform:
- `NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID` (optional)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or submit a pull request.

## 🔗 Resources

- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [ElevenLabs Documentation](https://docs.elevenlabs.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [n8n Webhooks](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

---

**Built with ❤️ for universal browser support and natural voice interactions**
