"use client";

/**
 * TTS Provider Selection Component
 * Allows user to switch between ElevenLabs and Minimax
 */
export function TTSProviderSelector({ selectedProvider, onProviderChange, disabled }) {
    return (
        <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="block text-sm font-semibold text-slate-700 text-center">
                Voice Provider
            </label>

            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => onProviderChange("elevenlabs")}
                    disabled={disabled}
                    className={`p-4 rounded-xl border-2 transition-all ${
                        selectedProvider === "elevenlabs"
                            ? "border-blue-600 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            selectedProvider === "elevenlabs" 
                                ? "bg-blue-600 text-white" 
                                : "bg-slate-100 text-slate-600"
                        }`}>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className={`text-sm font-semibold ${
                                selectedProvider === "elevenlabs" ? "text-blue-900" : "text-slate-700"
                            }`}>
                                ElevenLabs
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                Expressive
                            </div>
                        </div>
                        {selectedProvider === "elevenlabs" && (
                            <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                                Active
                            </div>
                        )}
                    </div>
                </button>

                <button
                    onClick={() => onProviderChange("minimax")}
                    disabled={disabled}
                    className={`p-4 rounded-xl border-2 transition-all ${
                        selectedProvider === "minimax"
                            ? "border-emerald-600 bg-emerald-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            selectedProvider === "minimax" 
                                ? "bg-emerald-600 text-white" 
                                : "bg-slate-100 text-slate-600"
                        }`}>
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <div className={`text-sm font-semibold ${
                                selectedProvider === "minimax" ? "text-emerald-900" : "text-slate-700"
                            }`}>
                                Minimax
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                Fast
                            </div>
                        </div>
                        {selectedProvider === "minimax" && (
                            <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                                Active
                            </div>
                        )}
                    </div>
                </button>
            </div>

            <p className="text-xs text-center text-slate-500">
                {selectedProvider === "elevenlabs" 
                    ? "High-quality, emotional voice with natural intonation" 
                    : "Ultra-low latency for real-time conversations"}
            </p>
        </div>
    );
}
