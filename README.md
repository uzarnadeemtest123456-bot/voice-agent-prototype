# Voice AI Assistant - Universal Browser Support

A Next.js voice assistant with cross-browser support, intelligent query processing, and high-quality text-to-speech.

## 🎯 Architecture Overview

```
User Speech
    ↓
[Whisper STT with Prompt] ← Works on ALL browsers + handles brand names accurately
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
- ❌ **Removed:** Separate rephrase API call
- ✅ **New:** Direct Whisper STT → n8n
- Whisper prompt handles brand name accuracy (TuxMat, etc.)
- All responses come from n8n (streaming supported)

### 3. **Flexible Text-to-Speech (TTS)**
- ✅ **New:** Support for both **ElevenLabs** and **Minimax**
- **ElevenLabs:** Natural, emotional, human-like voices
- **Minimax:** Ultra-low latency, cost-effective high speed generation
- User-selectable provider from the UI interface
- Streaming support for both providers

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ installed
- OpenAI API key (for Whisper STT with context prompts)
- ElevenLabs API key (optional, for high-quality TTS)
- Minimax API key (optional, for low-latency TTS)
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
# Required if using ElevenLabs TTS
# Get your API key from: https://elevenlabs.io/
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# ElevenLabs Voice Configuration (Optional)
# Default: Rachel (21m00Tcm4TlvDq8ikWAM) - natural, warm, clear
# Other options: Bella (EXAVITQu4vr4xnSDxMaL), Josh (TxGEqnHWrfWFTfGW9XjX)
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Minimax API Configuration
# Required if using Minimax TTS
# Get your API key/Group ID from: https://platform.minimax.io/
MINIMAX_API_KEY=your_minimax_api_key_here
MINIMAX_GROUP_ID=your_minimax_group_id_here

# Minimax Voice Configuration (Optional)
# Default: male-qn-qingse
MINIMAX_VOICE_ID=male-qn-qingse

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
   → Audio sent to Whisper API with context prompt
   → Whisper accurately transcribes: "what are TuxMat mats made of"

4. Transcribed query sent directly to n8n
   → n8n processes and streams response

5. Response converted to speech
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
│   │   │   └── route.js           # Whisper STT with context prompts
│   │   ├── tts/
│   │   │   └── route.js           # MiniMax TTS with streaming
│   │   ├── rephrase/
│   │   │   └── route.js           # [NOT USED] Legacy rephrase logic
│   │   └── chat/intent/
│   │       └── route.js           # [NOT USED] Legacy intent logic
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

### `/api/stt` - Speech-to-Text (Active)
- **Method:** POST
- **Input:** FormData with audio blob
- **Output:** `{ text: "transcribed text", success: true }`
- **Technology:** OpenAI Whisper with context prompts
- **Browser Support:** All (Firefox, Tor, Brave, Chrome, etc.)
- **Features:** Brand name accuracy via prompt parameter

### `/api/tts/elevenlabs` - ElevenLabs TTS
- **Method:** POST
- **Input:** `{ text: "text to speak", requestId, chunkId }`
- **Output:** Audio stream (MP3)
- **Features:** Streaming support, cross-browser compatible

### `/api/tts/minimax` - Minimax TTS
- **Method:** POST
- **Input:** `{ text: "text to speak", requestId, chunkId }`
- **Output:** Audio stream (MP3)
- **Features:** Streaming support, ultra-low latency, cross-browser compatible

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

### New Architecture (Universal & Optimized)
```
Whisper STT with Prompt → n8n → ElevenLabs TTS
✅ Works on ALL browsers
✅ Simple, direct flow (no extra API calls)
✅ Superior voice quality
✅ Faster response time
```

## 💰 Cost Estimation

### Per Conversation (Avg 10 exchanges):

**OpenAI (Whisper STT with prompts):**
- ~$0.006/minute of audio
- 10 queries × 3 seconds = 30 seconds = **~$0.003**

**ElevenLabs (TTS):**
- Free tier: 10,000 characters/month
- Paid: ~$0.30 per 1,000 characters
- 10 responses × 100 chars = 1,000 chars = **~$0.30**

**Total per conversation:** ~$0.303 (mostly TTS)
**Savings:** Eliminated separate rephrase API calls = faster + cheaper!

**Optimization tips:**
- Use ElevenLabs free tier (10k chars/month = ~100 responses)
- Cache common responses
- Batch similar queries

## 📝 How Whisper Prompt Helps

The Whisper API uses a context prompt to accurately transcribe brand names and technical terms:

**Prompt includes:** "TuxMat floor mats, trunk mats, cargo liners. Honda Civic, Toyota Camry, Ford F-150..."

| User Says | Without Prompt | With Prompt ✅ |
|-----------|----------------|----------------|
| "TuxMat" | "stuck mat" | "TuxMat" |
| "TuxMat" | "text max" | "TuxMat" |
| "TuxMat" | "tucks mat" | "TuxMat" |
| "Honda Civic" | "honda civic" | "Honda Civic" |
| "Ford F-150" | "ford f one fifty" | "Ford F-150" |

**To customize:** Edit `app/api/stt/route.js` and update the `prompt` parameter with your domain-specific terms.

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
  knowledge_model: 21,  // Your model ID
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
