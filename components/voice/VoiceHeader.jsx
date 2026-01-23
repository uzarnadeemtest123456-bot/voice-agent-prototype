"use client";

/**
 * Voice mode header section
 * Displays title, status, and error messages
 */
export default function VoiceHeader({ status, error }) {
    const getStatusText = () => {
        switch (status) {
            case "idle":
                return "Ready to assist you";
            case "listening":
                return "Listening...";
            case "recording":
                return "Recording your message";
            case "thinking":
                return "Processing...";
            case "speaking":
                return "Assistant is responding";
            case "error":
                return "Connection error";
            default:
                return "";
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case "recording":
                return "text-red-600";
            case "listening":
            case "speaking":
                return "text-blue-600";
            case "thinking":
                return "text-emerald-600";
            case "error":
                return "text-red-600";
            default:
                return "text-slate-600";
        }
    };

    return (
        <div className="text-center mb-6">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">
                LivyAI Voice Assistant
            </h1>
            
            {/* Status */}
            <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full ${
                    status === "idle" ? "bg-slate-400" :
                    status === "error" ? "bg-red-500" :
                    "bg-blue-500 animate-pulse"
                }`}></div>
                <p className={`text-sm md:text-base font-medium ${getStatusColor()}`}>
                    {getStatusText()}
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                    <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <div className="text-sm">
                            <p className="font-semibold mb-1">Error</p>
                            <p>{error}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
