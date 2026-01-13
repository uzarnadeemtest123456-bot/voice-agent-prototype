"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";

/**
 * Conversation transcript panel
 * Displays message history with streaming support
 */
export default function ConversationPanel({
    messages,
    currentAssistantText,
    processingStage,
    status,
    onInterrupt,
}) {
    const messagesEndRef = useRef(null);
    const isSpeaking = status === "speaking";

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, currentAssistantText]);

    return (
        <div className="w-96 bg-gray-800/50 backdrop-blur rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Conversation</h3>
                {isSpeaking && (
                    <button
                        onClick={() => onInterrupt?.()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-purple-500/40 border border-white/10"
                        aria-label="Interrupt speech"
                    >
                        <span className="text-lg leading-none">■</span>
                        <span>Stop</span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {/* Empty state */}
                {messages.length === 0 && !currentAssistantText && (
                    <div className="text-center text-gray-500 text-sm mt-8">
                        Your conversation will appear here...
                    </div>
                )}

                {/* Message history */}
                {messages.map((msg, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === "user"
                                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                                    : "bg-gray-700 text-gray-100"
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold opacity-70">
                                    {msg.role === "user" ? "You" : "Assistant"}
                                </span>
                            </div>
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                        </div>
                    </motion.div>
                ))}

                {/* Streaming assistant response */}
                {currentAssistantText && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                    >
                        <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-700 text-gray-100">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold opacity-70">Assistant</span>
                                <div className="flex gap-1">
                                    <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></span>
                                    <span
                                        className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"
                                        style={{ animationDelay: "0.2s" }}
                                    ></span>
                                    <span
                                        className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"
                                        style={{ animationDelay: "0.4s" }}
                                    ></span>
                                </div>
                            </div>
                            <p className="text-sm leading-relaxed">{currentAssistantText}</p>
                        </div>
                    </motion.div>
                )}

                {/* Processing indicator */}
                {!currentAssistantText && processingStage && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                    >
                        <div className="bg-gray-700 text-gray-100 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                                    <span
                                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.2s" }}
                                    ></span>
                                    <span
                                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                                        style={{ animationDelay: "0.4s" }}
                                    ></span>
                                </div>
                                <span className="text-sm font-medium">
                                    {processingStage === "transcribing" && "Processing voice..."}
                                    {processingStage === "generating" && "Processing answer..."}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #a855f7, #ec4899);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #9333ea, #db2777);
        }

        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #a855f7 rgba(0, 0, 0, 0.2);
        }
      `}</style>
        </div>
    );
}
