# Voice Mode UI with Custom Voice Pipeline

A modern, real-time voice interface built with Next.js 15 featuring streaming AI responses from n8n Brain, progressive TTS, and beautiful animated visualizations.

## 🚀 Features

- **Real-time Voice Interaction** - Push-to-talk voice recording with instant STT
- **Streaming AI Responses** - Progressive text streaming from n8n Brain webhook
- **Progressive TTS** - Audio playback begins before full response completes
- **Audio Visualization** - Animated circle that responds to actual output audio amplitude
- **Modern Architecture:**
  - Next.js 15 (App Router)
  - React 19
  - Framer Motion (animations)
  - Tailwind CSS (styling)
  - OpenAI Whisper (STT)
  - OpenAI TTS (Text-to-Speech)
  - n8n Brain (AI orchestration)

## 📋 Prerequisites

- Node.js 18+ installed
- OpenAI API key
- n8n Brain webhook configured with streaming endpoint

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Edit the `.env.local` file in the root directory:

```env
# OpenAI API Key (for STT and TTS)
OPENAI_API_KEY=your_openai_api_key_here

# n8n Brain Webhook URL (streaming endpoint)
NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL=https://your-n8n-instance.com/webhook/brain

# Optional: STT Model (default: whisper-1)
VOICE_MODEL_STT=whisper-1

# Optional: TTS Model (default: tts-1)
VOICE_MODEL_TTS=tts-1

# Optional: TTS Voice (default: alloy)
# Options: alloy, echo, fable, onyx, nova, shimmer
TTS_VOICE=alloy
```

**Where to get your OpenAI API key:**
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy and paste it into `.env.local`

### 3. Set up n8n Brain Webhook

Your n8n Brain workflow must:

- Accept POST requests with JSON:
  ```json
  {
    "sessionId": "uuid",
    "userText": "transcribed user message",
    "client": {
      "source": "web",
      "ts": 1234567890
    }
  }
  ```

- Return streaming response with **SSE** (Server-Sent Events):
  ```
  Content-Type: text/event-stream
  
  event: delta
  data: {"text":"Hello"}
  
  event: delta
  data: {"text":" there!"}
  
  event: done
  data: {}
  ```

- **Critical:** Tools should return JSON directly to Brain. Brain is the only streaming source to the web app.

### 4. Run the Development Server

```bash
npm run dev
```

### 5. Open the Voice Mode UI

Navigate to: [http://localhost:3000/voice](http://localhost:3000/voice)

## 🎯 How It Works

1. **Click "Start"** - Initializes microphone access and begins recording
2. **Speak your message** - Audio is captured in real-time
3. **Click "Stop"** - Stops recording and triggers:
   - Speech-to-Text (Whisper API)
   - n8n Brain webhook call (streaming)
   - Progressive TTS playback
4. **Watch the circle** - Reacts to actual audio output levels during TTS playback
5. **View conversation** - Real-time transcript on the right panel

## 📁 Project Structure

```
vapi_voice_test/
├── app/
│   ├── api/
│   │   ├── stt/
│   │   │   └── route.js          # Speech-to-Text endpoint (OpenAI Whisper)
│   │   └── tts/
│   │       └── route.js          # Text-to-Speech endpoint (OpenAI TTS)
│   ├── voice/
│   │   └── page.jsx              # Voice mode route
│   ├── layout.js                 # Root layout
│   └── globals.css               # Global styles
├── components/
│   └── VoiceModeUI.jsx           # Main voice UI component
├── lib/
│   ├── sse.js                    # SSE parser utility
│   ├── ttsQueue.js               # Sequential TTS playback manager
│   └── audioLevel.js             # Audio visualization utilities
├── .env.local                     # Environment variables
└── package.json
```

## 🔧 Key Components

### VoiceModeUI Component

The main component that handles:
- Microphone capture with MediaRecorder
- Audio recording and STT via `/api/stt`
- n8n Brain webhook streaming consumption
- Progressive TTS with sequential playback
- Real-time audio visualization
- State management for UI updates

### API Routes

**`/api/stt`** - Speech-to-Text
- Accepts: `multipart/form-data` with audio file
- Returns: `{ "text": "transcribed text" }`

**`/api/tts`** - Text-to-Speech
- Accepts: `{ "text": "text to speak" }`
- Returns: Audio blob (audio/mpeg)

### Utility Libraries

**`lib/sse.js`** - SSE Parser
- Parses Server-Sent Events format
- Handles `event:` and `data:` lines
- Supports JSON data payloads

**`lib/ttsQueue.js`** - TTS Queue Manager
- Sequential audio playback
- Volume analysis for visualization
- Queue management with promises

**`lib/audioLevel.js`** - Audio Visualization
- RMS-based volume calculation
- Breathing animation for idle state

## 🎨 Customization

### Adjust Circle Animation Reactivity

In `components/VoiceModeUI.jsx`:

```javascript
// Line ~524 - Change scale multiplier
const circleScale = 1 + volume * 1.5; // Adjust 1.5 for more/less reactivity
```

### Change TTS Voice

Edit `.env.local`:

```env
TTS_VOICE=nova  # Options: alloy, echo, fable, onyx, nova, shimmer
```

### Adjust TTS Segment Size

In `components/VoiceModeUI.jsx`, modify `extractNextSegment()`:

```javascript
// Speak chunks after 180 chars (adjust as needed)
if (remaining.length >= 180) {
  // ...
}
```

### Change Colors

Modify the Tailwind classes in `VoiceModeUI.jsx`:
- `from-purple-500 via-pink-500 to-purple-500` - Main circle gradient
- `from-blue-500 to-purple-600` - Inner circle gradient
- `from-purple-600 to-pink-600` - Start button gradient

## 🐛 Troubleshooting

### "OPENAI_API_KEY not configured" Error
- Ensure `.env.local` exists in the root directory
- Verify the variable name is exactly: `OPENAI_API_KEY`
- Restart the dev server after changing environment variables

### "N8N_BRAIN_WEBHOOK_URL not configured" Error
- Add `NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL` to `.env.local`
- Must be a `NEXT_PUBLIC_` variable to work in the browser
- Verify the URL is accessible from your browser

### "Microphone access denied" Error
- Grant microphone permissions in your browser
- Use HTTPS in production (required for getUserMedia)
- Check browser console for specific errors

### No Animation / Circle Not Reacting
- Check browser console for errors
- Ensure TTS audio is playing (check audio element in DevTools)
- Verify AudioContext is initialized (some browsers require user interaction)

### No Speech Detected
- Speak louder or closer to the microphone
- Ensure microphone is working (test in system settings)
- Check audio is being recorded (look for blob size > 0 in console)

### Streaming Not Working
- Verify n8n Brain webhook returns `Content-Type: text/event-stream`
- Check n8n Brain workflow is configured for streaming
- Look for CORS errors in browser console
- Ensure webhook URL is correct and accessible

## 🔒 Security Notes

- Never commit `.env.local` to version control (already in `.gitignore`)
- Keep your OpenAI API key secure
- Use environment variables for all sensitive data
- Consider rate limiting for production deployments

## 📚 Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI TTS API](https://platform.openai.com/docs/guides/text-to-speech)
- [Next.js Documentation](https://nextjs.org/docs)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [n8n Documentation](https://docs.n8n.io)

## 🏗️ Architecture Notes

### Critical Constraint: Brain is the Only Streamer

- **Brain workflow** streams responses to the web app via SSE
- **Tool workflows** return single JSON responses (no streaming)
- When Brain needs a tool, it calls the tool workflow via HTTP, waits for JSON, then continues streaming
- This avoids trying to relay streams through n8n HTTP nodes (which buffer)

### Progressive TTS Flow

1. Brain streams text chunks to the app
2. App accumulates text in a buffer
3. When a sentence or chunk is complete, it's sent to TTS API
4. Audio is enqueued for sequential playback
5. Volume analysis drives the circle animation
6. Process continues until stream completes

## 📝 License

MIT

## 🤝 Contributing

Feel free to open issues or submit pull requests!

---

Built with ❤️ using Next.js, OpenAI, and n8n
