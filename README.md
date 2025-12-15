# Voice Mode - OpenAI Optimized Conversation System

A natural, cost-optimized voice conversation system using browser STT, intelligent routing, and OpenAI TTS.

## 🎯 Features

- **Free Browser STT**: Uses Chrome's built-in speech recognition (no API cost!)
- **Smart Intent Routing**: Automatically determines if query needs tool call or direct response
- **Streaming TTS**: OpenAI Text-to-Speech with immediate playback
- **Natural Conversation Flow**: Auto-detects speech end, handles interruptions
- **Cost Optimized**: Single OpenAI call for classification + response

## 🏗️ Architecture

```
User speaks → Browser STT (free) → Intent Classification (gpt-4o-mini) →
  ├─ Simple query → Direct OpenAI response → OpenAI TTS
  └─ Complex query → n8n webhook → Stream response → OpenAI TTS
```

### Cost Breakdown per Conversation Turn:

**Simple greeting/question:**
- Browser STT: **FREE**
- Intent + Response: **1 OpenAI call** (~$0.0001 with gpt-4o-mini)
- TTS: **$0.015 per 1000 chars**

**Complex tool-based query:**
- Browser STT: **FREE**
- Intent classification: **1 OpenAI call** (~$0.00005)
- n8n processing: **(your n8n LLM cost)**
- TTS: **$0.015 per 1000 chars**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- OpenAI API key
- Chrome, Edge, or Safari browser

### Installation

1. Clone and install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your OpenAI API key:
```env
OPENAI_API_KEY=sk-your-key-here
```

3. Run the development server:
```bash
npm run dev
```

4. Open http://localhost:3000/voice

## ⚙️ Configuration

### Environment Variables

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL=your_n8n_webhook_url

# Optional (defaults shown)
INTENT_MODEL=gpt-4o-mini           # Model for intent classification
VOICE_MODEL_TTS=tts-1              # tts-1 (faster) or tts-1-hd (quality)
TTS_VOICE=alloy                    # Voice: alloy, echo, fable, onyx, nova, shimmer
```

### Voice Selection

Available OpenAI TTS voices:
- **alloy** - Neutral, balanced (default)
- **echo** - Male, clear
- **fable** - British accent, warm
- **onyx** - Deep, authoritative
- **nova** - Female, friendly
- **shimmer** - Soft, gentle

### Adjusting Silence Detection

In `components/VoiceModeUI.jsx`, adjust the silence timeout (default 800ms):

```javascript
silenceTimerRef.current = setTimeout(() => {
  // Process speech
}, 800); // Change this value (in milliseconds)
```

## 🎙️ How It Works

### 1. Speech Input
- Browser's built-in speech recognition captures user voice
- Auto-detects when user finishes speaking (800ms silence)
- No API cost for transcription!

### 2. Intent Classification
- Single API call to OpenAI (gpt-4o-mini)
- Determines if query needs tool call or can be answered directly
- If direct answer: response is included in same API call

### 3. Response Generation
- **Direct replies**: Uses response from classification step
- **Tool calls**: Routes to n8n webhook for complex processing

### 4. Text-to-Speech
- OpenAI TTS streams high-quality audio
- Splits text into segments for faster initial playback
- Starts speaking as soon as first segment is ready

### 5. Continuous Conversation
- Auto-resumes listening after response completes
- Handles user interruptions gracefully
- Maintains conversation history for context

## 🎨 UI States

- **Idle**: Waiting to start
- **Listening**: Capturing user speech
- **Thinking**: Processing query and routing
- **Speaking**: Playing TTS response

## 🔧 API Endpoints

### `/api/chat/intent`
Classifies intent and provides direct responses.

**Request:**
```json
{
  "query": "Hello, how are you?",
  "conversationHistory": [...]
}
```

**Response:**
```json
{
  "intent": "direct_reply",
  "response": "Hello! I'm doing great, thank you for asking!",
  "confidence": 0.95
}
```

### `/api/tts`
Converts text to speech using OpenAI.

**Request:**
```json
{
  "text": "Hello, how can I help you?"
}
```

**Response:** Audio stream (audio/mpeg)

## 📊 Performance Optimization

### Latency Optimization
- Browser STT: **0ms** (local processing)
- Intent classification: **200-500ms**
- TTS first chunk: **300-500ms**
- **Total time to first sound: ~500-1000ms**

### Cost Optimization
- Free browser STT saves ~$0.006/min vs Whisper
- Single API call for classification + simple responses
- Efficient model selection (gpt-4o-mini for routing)
- n8n handles complex queries with its own LLM

### Quality
- OpenAI TTS: Natural, professional voice quality
- Context-aware responses with conversation history
- Smooth interruption handling
- Automatic silence detection

## 🛠️ Development

### Project Structure
```
├── app/
│   ├── api/
│   │   ├── chat/intent/    # Intent classification
│   │   ├── tts/            # Text-to-Speech
│   │   └── stt/            # (Optional) Whisper STT
│   └── voice/              # Voice mode page
├── components/
│   └── VoiceModeUI.jsx     # Main voice interface
├── lib/
│   ├── audioPlayer.js      # Audio playback utilities
│   ├── sse.js              # Server-sent events parser
│   └── audioLevel.js       # Volume animations
└── .env.local              # Configuration
```

### Customizing Intent Classification

Edit `app/api/chat/intent/route.js` to modify classification logic:

```javascript
const messages = [
  {
    role: 'system',
    content: `Your classification prompt here...`
  }
];
```

### Adjusting TTS Chunking

In `components/VoiceModeUI.jsx`, modify `extractNextSegment()` to change how text is split for TTS:

```javascript
function extractNextSegment(text, startIndex) {
  // Customize chunking logic here
  // Default: Split by sentences, then commas, then 30 char chunks
}
```

## 🐛 Troubleshooting

### Speech recognition not working
- **Solution**: Use Chrome, Edge, or Safari (Firefox not supported)
- Check microphone permissions in browser settings

### No audio playback
- **Solution**: Click the page first (browser autoplay policy)
- Check OPENAI_API_KEY is configured correctly

### High latency
- **Solution**: Use `tts-1` instead of `tts-1-hd`
- Reduce chunk size in `extractNextSegment()`
- Consider adjusting silence detection timeout

### OpenAI API errors
- **Solution**: Verify API key has sufficient credits
- Check API key has access to required models
- Review API rate limits

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 💡 Future Improvements

- [ ] Support for multiple languages
- [ ] Custom wake word detection
- [ ] Voice activity detection (VAD) for better silence detection
- [ ] Conversation memory/summary
- [ ] User preferences storage
- [ ] Mobile app support
- [ ] WebRTC for lower latency
- [ ] Real-time voice modulation
