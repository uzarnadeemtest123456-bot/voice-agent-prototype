"use client";

/**
 * Instructions shown when voice mode is idle
 */
export default function VoiceInstructions() {
    return (
        <div className="text-center text-sm text-gray-500 space-y-2">
            <p className="text-base font-semibold text-gray-300">
                Click Start and speak naturally!
            </p>
            <p className="text-sm text-green-400">
                ✓ Auto-detects when you stop speaking (1s silence)
            </p>
            <p className="text-xs text-gray-400">
                No need to press any button - just stop talking!
            </p>
            <p className="text-xs mt-2 text-gray-600">
                Whisper STT + n8n Intelligence
            </p>
        </div>
    );
}
