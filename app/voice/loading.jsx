/**
 * Loading skeleton for voice page
 */
export default function VoiceLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-8">
            <div className="w-full max-w-7xl h-[90vh] flex gap-8">
                {/* Left Side - Loading skeleton */}
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    {/* Header skeleton */}
                    <div className="text-center space-y-2">
                        <div className="h-10 w-48 bg-gray-700/50 rounded-lg animate-pulse mx-auto" />
                        <div className="h-4 w-64 bg-gray-700/30 rounded animate-pulse mx-auto" />
                    </div>

                    {/* Orb skeleton */}
                    <div className="relative flex items-center justify-center h-96">
                        <div className="w-64 h-64 rounded-full bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 animate-pulse" />
                    </div>

                    {/* Button skeleton */}
                    <div className="h-14 w-48 bg-gray-700/50 rounded-full animate-pulse" />
                </div>
            </div>
        </div>
    );
}
