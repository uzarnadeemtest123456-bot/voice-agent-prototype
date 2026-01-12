"use client";

import { motion } from "framer-motion";

/**
 * Animated voice visualization orb
 * Displays a pulsing circle that responds to volume
 */
export default function VoiceOrb({ volume = 0 }) {
    const circleScale = 1 + volume * 1.5;

    return (
        <div className="relative flex items-center justify-center h-96">
            {/* Outer glow */}
            <motion.div
                animate={{
                    scale: circleScale,
                }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                }}
                className="absolute"
            >
                <div
                    className="w-64 h-64 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-80"
                    style={{
                        filter: `blur(${volume * 20 + 5}px)`,
                        boxShadow: `0 0 ${volume * 100 + 50}px rgba(168, 85, 247, 0.6)`,
                    }}
                />
            </motion.div>

            {/* Inner orb */}
            <motion.div
                animate={{
                    scale: circleScale * 0.8,
                }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                }}
                className="absolute w-48 h-48 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 opacity-70"
            />

            {/* Center dot */}
            <div className="absolute w-4 h-4 rounded-full bg-white" />
        </div>
    );
}
