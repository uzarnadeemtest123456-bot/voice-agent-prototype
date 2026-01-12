import { Suspense } from "react";
import VoiceModeUI from "@/components/VoiceModeUI";
import VoiceLoading from "./loading";

export const metadata = {
  title: "Voice Mode | AI Assistant",
  description: "Real-time voice conversation with AI using Whisper STT and ElevenLabs TTS",
};

export default function VoicePage() {
  return (
    <Suspense fallback={<VoiceLoading />}>
      <VoiceModeUI />
    </Suspense>
  );
}
