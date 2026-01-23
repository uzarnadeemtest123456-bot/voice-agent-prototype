"use client";

import { motion } from "framer-motion";

/**
 * Animated voice visualization orb
 * Displays a pulsing circle that responds to volume
 */
export default function VoiceOrb({ volume = 0, isActive = false }) {
    const circleScale = 1 + volume * 2; // Increased multiplier for more visible movement

    return (
        <div className="relative flex items-center justify-center h-48 w-full">
            {/* Outer ring */}
            <motion.div
                animate={{
                    scale: [1, 1.15, 1],
                    opacity: isActive ? [0.3, 0.5, 0.3] : 0.2,
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute w-40 h-40 rounded-full border-2 border-blue-200"
            />

            {/* Middle ring */}
            <motion.div
                animate={{
                    scale: [1, 1.08, 1],
                    opacity: isActive ? [0.2, 0.4, 0.2] : 0.1,
                }}
                transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.5,
                }}
                className="absolute w-36 h-36 rounded-full border border-emerald-200"
            />

            {/* Main orb with volume response */}
            <motion.div
                animate={{
                    scale: circleScale,
                }}
                transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                }}
                className="absolute"
            >
                <div
                    className={`w-28 h-28 rounded-full ${
                        isActive 
                            ? "bg-gradient-to-br from-blue-500 to-emerald-500" 
                            : "bg-gradient-to-br from-blue-400 to-emerald-400"
                    } shadow-lg`}
                    style={{
                        boxShadow: isActive 
                            ? `0 0 ${volume * 60 + 30}px rgba(37, 99, 235, 0.5), 0 0 ${volume * 40 + 20}px rgba(5, 150, 105, 0.3)` 
                            : '0 8px 16px rgba(0, 0, 0, 0.1)',
                    }}
                />
            </motion.div>

            {/* Inner highlight for depth */}
            <motion.div
                animate={{
                    scale: circleScale * 0.7,
                    opacity: isActive ? [0.6, 0.8, 0.6] : 0.5,
                }}
                transition={{
                    scale: {
                        type: "spring",
                        stiffness: 200,
                        damping: 15,
                    },
                    opacity: {
                        duration: 2,
                        repeat: Infinity,
                    },
                }}
                className="absolute w-20 h-20 rounded-full bg-gradient-to-br from-white/40 to-transparent"
            />

            {/* Center dot indicator */}
            <motion.div
                animate={{
                    scale: isActive ? [1, 1.3, 1] : 1,
                    opacity: isActive ? [0.8, 1, 0.8] : 0.6,
                }}
                transition={{
                    duration: 2,
                    repeat: isActive ? Infinity : 0,
                }}
                className="absolute w-3 h-3 rounded-full bg-white shadow-lg"
            />
        </div>
    );
}
