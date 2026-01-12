"use client";

/**
 * Error boundary for voice page
 */
export default function VoiceError({ error, reset }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-6">
                {/* Error icon */}
                <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg
                        className="w-10 h-10 text-red-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                    </svg>
                </div>

                {/* Error message */}
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
                    <p className="text-gray-400">
                        {error?.message || "An unexpected error occurred while loading voice mode."}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
                    >
                        Try Again
                    </button>
                    <a
                        href="/"
                        className="px-6 py-3 rounded-full font-semibold text-white bg-gray-700 hover:bg-gray-600 transition-all"
                    >
                        Go Home
                    </a>
                </div>
            </div>
        </div>
    );
}
