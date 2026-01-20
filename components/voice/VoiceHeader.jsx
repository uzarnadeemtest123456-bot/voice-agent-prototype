"use client";

/**
 * Voice mode header section
 * Displays title, status, and error messages
 */
export default function VoiceHeader({ status, error }) {
    const getStatusText = () => {
        switch (status) {
            case "idle":
                return "Click Start to begin your conversation";
            case "listening":
                return "Hold the button to talk";
            case "recording":
                return "Recording... release to send";
            case "thinking":
                return "Processing...";
            case "speaking":
                return "Speaking...";
            case "error":
                return "Error occurred";
            default:
                return "";
        }
    };

    return (
        <div className="text-center space-y-4">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-4xl font-bold text-white">Voice Mode</h1>
                <p className="text-gray-400">{getStatusText()}</p>
                <p className="text-xs text-gray-500">
                    Whisper STT + ElevenLabs TTS + n8n Streaming
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200 text-center max-w-md mx-auto">
                    {error}
                </div>
            )}
        </div>
    );
}
