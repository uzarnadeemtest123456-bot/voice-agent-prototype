"use client";

import { useRef, useEffect } from "react";

/**
 * Conversation transcript panel
 * Displays message history with streaming support
 */
export default function ConversationPanel({
    messages,
    currentAssistantText,
    processingStage,
}) {
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, currentAssistantText, processingStage]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800">Conversation History</h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs font-medium text-green-700">Live</span>
                </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                {/* Empty state */}
                {messages.length === 0 && !currentAssistantText && !processingStage && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-600">No messages yet</p>
                            <p className="text-xs text-slate-400 mt-1">Start the conversation to see messages here</p>
                        </div>
                    </div>
                )}

                {/* Message history */}
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                                msg.role === "user"
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold opacity-75">
                                    {msg.role === "user" ? "You" : "Assistant"}
                                </span>
                            </div>
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                        </div>
                    </div>
                ))}

                {/* Streaming assistant response */}
                {currentAssistantText && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-xl px-4 py-3 bg-slate-100 text-slate-800 border border-slate-200">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold opacity-75">Assistant</span>
                                <div className="flex gap-1">
                                    <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></span>
                                    <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                            <p className="text-sm leading-relaxed">{currentAssistantText}</p>
                        </div>
                    </div>
                )}

                {/* Processing indicator */}
                {!currentAssistantText && processingStage && (
                    <div className="flex justify-start">
                        <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                </div>
                                <span className="text-sm font-medium text-slate-600">
                                    {processingStage === "transcribing" && "Processing Voice"}
                                    {processingStage === "generating" && "Processing Answer"}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
