"use client";

import { useVoiceMode } from "@/hooks/useVoiceMode";
import {
  VoiceOrb,
  VoiceControls,
  ConversationPanel,
  VoiceHeader,
  VoiceInstructions,
  TTSProviderSelector,
} from "./voice";

/**
 * Main Voice Mode UI Component
 * Orchestrates all voice interaction sub-components
 */
export default function VoiceModeUI() {
  const {
    status,
    processingStage,
    volume,
    error,
    messages,
    currentAssistantText,
    needsAudioUnlock,
    startVoiceMode,
    handleAudioUnlockRetry,
    interruptSpeaking,
    isActive,
    ttsProvider,
    setTtsProvider,
  } = useVoiceMode();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-8">
      <div className="w-full max-w-7xl h-[90vh] flex gap-8">
        {/* Left Side - Main Voice Interface */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-8">
          <VoiceHeader status={status} error={error} />

          <VoiceOrb volume={volume} />

          <VoiceControls
            status={status}
            isActive={isActive}
            needsAudioUnlock={needsAudioUnlock}
            onStart={startVoiceMode}
            onAudioUnlock={handleAudioUnlockRetry}
          />

          <div className="mt-8 transition-all duration-300 transform">
            <TTSProviderSelector
              selectedProvider={ttsProvider}
              onProviderChange={setTtsProvider}
              disabled={status !== "idle"}
            />
          </div>

          {status === "idle" && <VoiceInstructions />}
        </div>

        {/* Right Side - Conversation Transcript */}
        {isActive && (
          <ConversationPanel
            messages={messages}
            currentAssistantText={currentAssistantText}
            processingStage={processingStage}
            status={status}
            onInterrupt={interruptSpeaking}
          />
        )}
      </div>
    </div>
  );
}
