"use client";

/**
 * Instructions shown when voice mode is idle
 */
export default function VoiceInstructions() {
    return (
        <div className="space-y-6">
            {/* Main heading */}
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">How to Use Voice Assistant</h2>
                <p className="text-slate-600">Follow these simple steps to communicate with our AI assistant</p>
            </div>

            {/* Instructions grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold">
                        1
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 mb-1">Start Conversation</h3>
                        <p className="text-sm text-slate-600">Click the "Start Conversation" button to begin</p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <div className="flex-shrink-0 w-10 h-10 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold">
                        2
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 mb-1">Hold to Talk</h3>
                        <p className="text-sm text-slate-600">Press and hold the button while speaking</p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                    <div className="flex-shrink-0 w-10 h-10 bg-purple-600 text-white rounded-lg flex items-center justify-center font-bold">
                        3
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 mb-1">Release to Send</h3>
                        <p className="text-sm text-slate-600">Release the button to send your message</p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <div className="flex-shrink-0 w-10 h-10 bg-amber-600 text-white rounded-lg flex items-center justify-center font-bold">
                        4
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 mb-1">Get Response</h3>
                        <p className="text-sm text-slate-600">Listen to the AI assistant's spoken response</p>
                    </div>
                </div>
            </div>

            {/* Additional info */}
            <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <h4 className="font-semibold text-slate-800 mb-1">Tips for Best Results</h4>
                        <ul className="text-sm text-slate-600 space-y-1">
                            <li>• Speak clearly and at a normal pace</li>
                            <li>• Use a quiet environment for better accuracy</li>
                            <li>• You can interrupt the AI at any time by holding the button again</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Technology badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-4 border-t border-slate-200">
                <span className="inline-flex items-center px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                    🎙️ Whisper AI Speech Recognition
                </span>
                <span className="inline-flex items-center px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                    🤖 Advanced AI Processing
                </span>
                <span className="inline-flex items-center px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                    🔊 Natural Voice Synthesis
                </span>
            </div>
        </div>
    );
}
