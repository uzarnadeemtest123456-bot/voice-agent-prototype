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
        <div className="flex flex-col items-center gap-4 w-full">
            {/* Control Buttons */}
            <div className="flex gap-3 justify-center flex-wrap w-full">
                {!isActive && (
                    <button
                        type="button"
                        onClick={onStart}
                        disabled={status === "error"}
                        className={`w-full px-6 py-3 rounded-xl font-semibold text-white transition-all ${
                            status === "error"
                                ? "bg-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 shadow-md hover:shadow-lg"
                        }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                            </svg>
                            Start Conversation
                        </span>
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
                        className={`w-full px-6 py-4 rounded-xl font-semibold text-white transition-all shadow-md select-none touch-manipulation ${
                            isRecording
                                ? "bg-gradient-to-r from-red-500 to-red-600 shadow-lg"
                                : "bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 hover:shadow-lg"
                        }`}
                        style={{
                            WebkitTouchCallout: 'none',
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                            touchAction: 'manipulation'
                        }}
                    >
                        <span className="flex items-center justify-center gap-2">
                            {isRecording ? (
                                <>
                                    <div className="w-3 h-3 rounded-full bg-white animate-pulse"></div>
                                    Release to Send
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                                    </svg>
                                    Hold to Talk
                                </>
                            )}
                        </span>
                    </button>
                )}

                {needsAudioUnlock && (
                    <button
                        type="button"
                        onClick={onAudioUnlock}
                        className="w-full px-6 py-3 rounded-xl font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-all shadow-md hover:shadow-lg"
                    >
                        <span className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                            </svg>
                            Enable Audio
                        </span>
                    </button>
                )}
            </div>

            {/* Status Info */}
            {isActive && (
                <div className="text-xs text-slate-500 text-center">
                    Press and hold <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-slate-700">Space</kbd> or the button to speak
                </div>
            )}
        </div>
    );
}
