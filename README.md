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
[MiniMax TTS] ← Custom voice cloning with streaming (low latency)
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

### 3. **Superior Text-to-Speech (TTS)**
- ❌ **Removed:** OpenAI TTS (stuttering issues)
- ❌ **Removed:** ElevenLabs TTS
- ✅ **New:** MiniMax TTS with Custom Voice Cloning
- High-fidelity speech-02-hd model
- Streaming support for ultra-low latency
- Custom voice profile (moss_audio) from your audio sample

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ installed
- OpenAI API key (for Whisper STT with context prompts)
- MiniMax API key & Group ID (for high-quality TTS with voice cloning)
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
# Required for: Whisper STT (cross-browser)
OPENAI_API_KEY=your_openai_api_key_here

# MiniMax API Configuration (Server-side only - SECURE)
# Required for: High-quality TTS with custom voice cloning
# Get your API key and Group ID from: https://platform.minimax.io/
MINIMAX_API_KEY=your_minimax_api_key_here
MINIMAX_GROUP_ID=your_minimax_group_id_here

# MiniMax Voice Configuration
# Custom cloned voice ID (moss_audio profile)
# This voice was created from your provided audio sample
MINIMAX_VOICE_ID=moss_audio_10aac8df-bbf2-11f0-9c0e-b68b6d146e10
```

### 3. Get API Keys

#### OpenAI API Key
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Add it to `.env.local`

#### MiniMax API Key & Group ID
1. Visit https://platform.minimax.io/ (International version)
2. Sign up for an account
3. Go to API Keys section
4. Generate a new API key
5. Copy your Group ID from the console
6. Add both to `.env.local`

**Note:** Make sure to use the international API endpoint (`api.minimaxi.chat`) as voice cloning is only supported there.

#### Custom Voice ID (Optional)
The default voice ID `moss_audio_10aac8df-bbf2-11f0-9c0e-b68b6d146e10` is already configured. This is a custom voice cloned from your audio sample. To create additional voices:
1. Visit MiniMax Voice Console
2. Upload your audio sample (at least 30 seconds recommended)
3. Train the voice model
4. Copy the generated Voice ID
5. Update `MINIMAX_VOICE_ID` in `.env.local`

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
   → MiniMax generates natural audio with custom voice
   → Streams audio chunks for instant playback
   → User hears smooth, natural response with cloned voice
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

### `/api/tts` - Text-to-Speech (Active)
- **Method:** POST
- **Input:** `{ text: "text to speak" }`
- **Output:** Audio stream (MP3)
- **Technology:** MiniMax with custom voice cloning
- **Quality:** High-fidelity (speech-02-hd model)
- **Features:** Streaming SSE support for ultra-low latency

## 🐛 Troubleshooting

### MiniMax API Error
**Problem:** "MINIMAX_API_KEY not configured" or "MINIMAX_GROUP_ID not configured"

**Solution:**
1. Get API key and Group ID from https://platform.minimax.io/
2. Add both to `.env.local`
3. Ensure you're using the international endpoint
4. Restart dev server

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
Whisper STT with Prompt → n8n → MiniMax TTS (Custom Voice Cloning)
✅ Works on ALL browsers
✅ Simple, direct flow (no extra API calls)
✅ Superior voice quality with custom voice
✅ Faster response time with streaming
✅ Voice consistency across all responses
```

## 💰 Cost Estimation

### Per Conversation (Avg 10 exchanges):

**OpenAI (Whisper STT with prompts):**
- ~$0.006/minute of audio
- 10 queries × 3 seconds = 30 seconds = **~$0.003**

**MiniMax (TTS with voice cloning):**
- Pricing varies by plan (check https://platform.minimax.io/)
- High-quality speech-02-hd model
- 10 responses × 100 chars = 1,000 chars

**Optimization tips:**
- Use sentence-level chunking for faster perceived response
- Cache common responses
- Leverage streaming to minimize latency

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
MINIMAX_VOICE_ID=your_custom_voice_id
```

Create custom voices in MiniMax Voice Console by uploading audio samples.

### Adjust TTS Settings

Edit `app/api/tts/route.js`:
```javascript
voice_setting: {
  voice_id: 'moss_audio_10aac8df-bbf2-11f0-9c0e-b68b6d146e10',
  speed: 1.0,      // 0.5-2.0 (speaking speed)
  pitch: 1.0,      // 0.5-2.0 (voice pitch)
  emotion: 'neutral' // Emotion: neutral, happy, sad, angry, etc.
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
- `MINIMAX_API_KEY`
- `MINIMAX_GROUP_ID`
- `MINIMAX_VOICE_ID` (optional, uses default if not set)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please open an issue or submit a pull request.

## 🔗 Resources

- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [MiniMax API Documentation](https://platform.minimax.io/docs)
- [MiniMax TTS Guide](https://blog.williamchong.cloud/code/2025/06/21/handling-minimax-tts-api-basic-and-streaming.html)
- [Next.js Documentation](https://nextjs.org/docs)
- [n8n Webhooks](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

---

**Built with ❤️ for universal browser support and natural voice interactions**
