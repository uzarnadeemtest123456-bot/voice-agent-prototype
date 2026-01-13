"use client";

/**
 * TTS Provider Selection Component
 * Allows user to switch between ElevenLabs and Minimax
 */
export function TTSProviderSelector({ selectedProvider, onProviderChange, disabled }) {
    return (
        <div className={`flex flex-col items-center space-y-3 transition-opacity duration-300 ${disabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <span className="text-gray-400 text-sm font-medium tracking-wide uppercase">
                Voice Provider
            </span>

            <div className="flex bg-gray-800/50 backdrop-blur-sm p-1 rounded-xl border border-gray-700/50 shadow-lg relative">
                {/* Sliding background */}
                <div
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-indigo-500 rounded-lg shadow-md transition-all duration-300 ease-out ${selectedProvider === 'minimax' ? 'translate-x-[calc(100%+8px)]' : 'translate-x-0'
                        }`}
                />

                <button
                    onClick={() => onProviderChange("elevenlabs")}
                    disabled={disabled}
                    className={`relative z-10 px-6 py-2 rounded-lg text-sm font-medium transition-colors duration-200 min-w-[140px] flex items-center justify-center gap-2 ${selectedProvider === "elevenlabs" ? "text-white" : "text-gray-400 hover:text-gray-200"
                        }`}
                >
                    <span>ElevenLabs</span>
                    {selectedProvider === "elevenlabs" && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                    )}
                </button>

                <button
                    onClick={() => onProviderChange("minimax")}
                    disabled={disabled}
                    className={`relative z-10 px-6 py-2 rounded-lg text-sm font-medium transition-colors duration-200 min-w-[140px] flex items-center justify-center gap-2 ${selectedProvider === "minimax" ? "text-white" : "text-gray-400 hover:text-gray-200"
                        }`}
                >
                    <span>Minimax</span>
                    {selectedProvider === "minimax" && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                    )}
                </button>
            </div>

            <div className="h-6 text-xs text-center text-gray-500 font-mono">
                {selectedProvider === "elevenlabs" ? (
                    <span>High-quality, emotional, expressive</span>
                ) : (
                    <span>Ultra-low latency, speech-01-turbo</span>
                )}
            </div>
        </div>
    );
}
