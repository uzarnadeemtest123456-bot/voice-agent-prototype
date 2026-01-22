"use client";

/**
 * Instructions shown when voice mode is idle
 */
export default function VoiceInstructions() {
    return (
        <div className="text-center text-sm text-gray-500 space-y-2">
            <p className="text-base font-semibold text-gray-300">
                Click Start, then hold to talk.
            </p>
            <p className="text-sm text-green-400">
                ✓ Release the button to send your message
            </p>
            <p className="text-xs text-gray-400">
                Hold to interrupt the AI and ask a new question anytime.
            </p>
            <p className="text-xs mt-2 text-gray-600">
                Whisper STT + AIP Intelligence
            </p>
        </div>
    );
}
