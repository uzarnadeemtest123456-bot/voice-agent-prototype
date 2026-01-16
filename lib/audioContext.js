/**
 * Singleton AudioContext Manager
 * Prevents multiple AudioContext instances from being created, which can hit browser limits.
 */

let sharedContext = null;

export const getAudioContext = () => {
    if (typeof window === "undefined") return null;

    if (!sharedContext || sharedContext.state === "closed") {
        // Determine constructor
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            sharedContext = new AudioContextClass();
        }
    }
    return sharedContext;
};

export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
        try {
            await ctx.resume();
        } catch (err) {
            console.warn("Error resuming audio context:", err);
        }
    }
    return ctx;
};
