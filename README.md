# Voice AI Assistant - Universal Browser Support

A Next.js voice assistant with cross-browser support, intelligent query processing, and high-quality text-to-speech.

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+ installed
- OpenAI API key (for Whisper STT with context prompts)
- MiniMax API key & Group ID (for high-quality TTS with voice cloning)
- n8n webhook URL configured

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
