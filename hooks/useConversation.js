"use client";

import { useState, useRef, useCallback } from "react";

/**
 * Hook to manage conversation history
 */
export function useConversation() {
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]);

    // Sync ref
    const setMessagesWithRef = useCallback((newMessages) => {
        if (typeof newMessages === "function") {
            setMessages((prev) => {
                const next = newMessages(prev);
                messagesRef.current = next;
                return next;
            });
        } else {
            setMessages(newMessages);
            messagesRef.current = newMessages;
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessagesWithRef([]);
    }, [setMessagesWithRef]);

    const addUserMessage = useCallback(
        (text) => {
            const newMsg = { role: "user", text };
            setMessagesWithRef((prev) => [...prev, newMsg]);
            return newMsg;
        },
        [setMessagesWithRef]
    );

    const addAssistantMessage = useCallback(
        (text) => {
            const newMsg = { role: "assistant", text };
            setMessagesWithRef((prev) => [...prev, newMsg]);
            return newMsg;
        },
        [setMessagesWithRef]
    );

    const getRecentContext = useCallback((limit = 10) => {
        return messagesRef.current.slice(-limit).map((msg) => ({
            role: msg.role,
            content: msg.text,
        }));
    }, []);

    return {
        messages,
        messagesRef,
        setMessages: setMessagesWithRef,
        clearMessages,
        addUserMessage,
        addAssistantMessage,
        getRecentContext,
    };
}
