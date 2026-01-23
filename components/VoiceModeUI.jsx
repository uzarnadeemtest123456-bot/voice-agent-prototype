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
    isActive,
    isRecording,
    ttsProvider,
    setTtsProvider,
    startPushToTalk,
    stopPushToTalk,
  } = useVoiceMode();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl">
        {/* Header */}
        <VoiceHeader status={status} error={error} />

        {/* Main Content Grid */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left Column - Voice Controls */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            {/* Voice Orb Card */}
            <div className="card-effect rounded-2xl p-6">
              <VoiceOrb volume={volume} isActive={isActive} />
            </div>

            {/* Controls Card */}
            <div className="card-effect rounded-2xl p-6">
              <VoiceControls
                status={status}
                isActive={isActive}
                needsAudioUnlock={needsAudioUnlock}
                onStart={startVoiceMode}
                onAudioUnlock={handleAudioUnlockRetry}
                onPushToTalkStart={startPushToTalk}
                onPushToTalkEnd={stopPushToTalk}
                isRecording={isRecording}
              />
            </div>

            {/* Provider Selector Card - Only show when NOT active */}
            {!isActive && (
              <div className="card-effect rounded-2xl p-6">
                <TTSProviderSelector
                  selectedProvider={ttsProvider}
                  onProviderChange={setTtsProvider}
                  disabled={status !== "idle"}
                />
              </div>
            )}
          </div>

          {/* Right Column - Conversation & Instructions */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {isActive ? (
              <div className="card-effect rounded-2xl p-6 h-[600px]">
                <ConversationPanel
                  messages={messages}
                  currentAssistantText={currentAssistantText}
                  processingStage={processingStage}
                />
              </div>
            ) : (
              <div className="card-effect rounded-2xl p-6">
                <VoiceInstructions />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
