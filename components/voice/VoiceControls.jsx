"use client";

/**
 * Voice mode control buttons
 * Start, stop, and audio unlock controls
 */
export default function VoiceControls({
    status,
    isActive,
    needsAudioUnlock,
    onStart,
    onPushToTalkStart,
    onPushToTalkEnd,
    isRecording,
    onAudioUnlock,
}) {
    return (
        <div className="flex flex-col items-center gap-4">
            {/* Control Buttons */}
            <div className="flex gap-4 justify-center flex-wrap">
                {!isActive && (
                    <button
                        type="button"
                        onClick={onStart}
                        disabled={status === "error"}
                        className={`px-8 py-4 rounded-full font-semibold text-white transition-all transform hover:scale-105 ${status === "error"
                                ? "bg-gray-600 cursor-not-allowed"
                                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/50"
                            }`}
                    >
                        Start Conversation
                    </button>
                )}

                {isActive && (
                    <button
                        type="button"
                        onPointerDown={onPushToTalkStart}
                        onPointerUp={onPushToTalkEnd}
                        onPointerLeave={onPushToTalkEnd}
                        onPointerCancel={onPushToTalkEnd}
                        onKeyDown={(event) => {
                            if (event.repeat) return;
                            if (event.key === " " || event.key === "Enter") {
                                event.preventDefault();
                                onPushToTalkStart?.();
                            }
                        }}
                        onKeyUp={(event) => {
                            if (event.key === " " || event.key === "Enter") {
                                event.preventDefault();
                                onPushToTalkEnd?.();
                            }
                        }}
                        aria-pressed={isRecording}
                        className={`px-8 py-4 rounded-full font-semibold text-white transition-all transform ${isRecording
                                ? "bg-red-600 shadow-lg shadow-red-500/40 scale-105"
                                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-purple-500/50"
                            }`}
                    >
                        {isRecording ? "Release to Send" : "Hold to Talk"}
                    </button>
                )}

                {needsAudioUnlock && (
                    <button
                        type="button"
                        onClick={onAudioUnlock}
                        className="px-6 py-3 rounded-full font-semibold text-white bg-yellow-600 hover:bg-yellow-700 transition-all shadow-lg"
                    >
                        Tap to Enable Audio
                    </button>
                )}
            </div>

            {/* Status Indicator */}
            <div className="flex items-center justify-center gap-2">
                <div
                    className={`w-2 h-2 rounded-full transition-colors ${isActive
                            ? "bg-green-500 animate-pulse"
                            : status === "error"
                                ? "bg-red-500"
                                : "bg-gray-500"
                        }`}
                />
                <span className="text-sm text-gray-400">
                    {isActive ? "Active" : status === "error" ? "Error" : "Offline"}
                </span>
            </div>
        </div>
    );
}
