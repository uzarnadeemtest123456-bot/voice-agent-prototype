"use client";

import { useRef, useCallback, useEffect } from "react";
import { createConsumer } from "@rails/actioncable";

const STREAM_TIMEOUT_MS = 30000;
const CONNECT_TIMEOUT_MS = 10000;

const safeRandomId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const getConversationKey = (modelId) => `aip_conversation_${modelId}`;
const EXTERNAL_USER_HASH_KEY = "aip_external_user_hash";

const loadStoredValue = (key) => {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const storeValue = (key, value) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage failures
    }
};

/**
 * ActionCable stream hook (AIP ConversationChannel)
 * Keeps the same interface as the previous SSE hook.
 */
export function useAipStream() {
    const consumerRef = useRef(null);
    const subscriptionRef = useRef(null);
    const subscriptionIdRef = useRef(null);
    const connectedRef = useRef(false);
    const connectWaitersRef = useRef([]);

    const activeTagRef = useRef(null);
    const callbacksRef = useRef(null);
    const resolveRef = useRef(null);
    const rejectRef = useRef(null);
    const timeoutRef = useRef(null);

    const modelIdRef = useRef(null);
    const conversationIdRef = useRef(null);
    const externalUserHashRef = useRef(null);

    const clearTimeoutRef = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const finalize = useCallback((options = {}) => {
        clearTimeoutRef();

        const resolve = resolveRef.current;
        const reject = rejectRef.current;

        resolveRef.current = null;
        rejectRef.current = null;
        callbacksRef.current = null;
        activeTagRef.current = null;

        if (options.error && reject) {
            reject(options.error);
            return;
        }

        if (resolve) {
            resolve();
        }
    }, []);

    const handleReceived = useCallback((data) => {
        const callbacks = callbacksRef.current;
        if (!callbacks) return;

        if (callbacks.checkActive && !callbacks.checkActive()) {
            return;
        }

        const activeTag = activeTagRef.current;
        if (data?.tag && activeTag && data.tag !== activeTag) {
            return;
        }

        if (data?.type === "ResponseToken") {
            if (typeof data.content === "string" && data.content.length > 0) {
                callbacks.onTextChunk?.(data.content);
            }
            return;
        }

        if (data?.type === "ResponseEnd") {
            if (data.conversationId) {
                conversationIdRef.current = data.conversationId;
                if (modelIdRef.current) {
                    storeValue(getConversationKey(modelIdRef.current), data.conversationId);
                }
            }
            callbacks.onComplete?.();
            finalize();
            return;
        }

        if (data?.type === "Error") {
            const message = data.details || data.message || "Stream error";
            const err = new Error(message);
            callbacks.onError?.(err);
            finalize({ error: err });
        }
    }, [finalize]);

    const ensureSubscription = useCallback(() => {
        if (subscriptionRef.current) return subscriptionRef.current;

        const cableUrl = process.env.NEXT_PUBLIC_AIP_CABLE_URL;
        if (!cableUrl) {
            throw new Error("NEXT_PUBLIC_AIP_CABLE_URL is not configured");
        }

        if (!consumerRef.current) {
            consumerRef.current = createConsumer(cableUrl);
        }

        if (!subscriptionIdRef.current) {
            subscriptionIdRef.current = safeRandomId();
        }

        connectedRef.current = false;
        subscriptionRef.current = consumerRef.current.subscriptions.create(
            { channel: "ConversationChannel", id: subscriptionIdRef.current },
            {
                received: handleReceived,
                connected() {
                    connectedRef.current = true;
                    const waiters = connectWaitersRef.current.splice(0);
                    waiters.forEach((resolve) => resolve());
                },
                disconnected() {
                    connectedRef.current = false;
                },
            }
        );

        return subscriptionRef.current;
    }, [handleReceived]);

    const waitForConnected = useCallback(() => {
        if (connectedRef.current) return Promise.resolve();
        return new Promise((resolve, reject) => {
            let timeoutId;
            const wrappedResolve = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                resolve();
            };

            timeoutId = setTimeout(() => {
                const idx = connectWaitersRef.current.indexOf(wrappedResolve);
                if (idx >= 0) {
                    connectWaitersRef.current.splice(idx, 1);
                }
                reject(new Error("Cable connection timeout"));
            }, CONNECT_TIMEOUT_MS);

            connectWaitersRef.current.push(wrappedResolve);
        });
    }, []);

    const ensureSession = useCallback(() => {
        const modelId = process.env.NEXT_PUBLIC_AIP_MODEL_ID;
        if (!modelId) {
            throw new Error("NEXT_PUBLIC_AIP_MODEL_ID is not configured");
        }

        if (!modelIdRef.current) {
            modelIdRef.current = modelId;
        }

        if (conversationIdRef.current === null) {
            const storedConversationId = loadStoredValue(getConversationKey(modelId));
            if (storedConversationId) {
                conversationIdRef.current = storedConversationId;
            }
        }

        if (!externalUserHashRef.current) {
            let hash = loadStoredValue(EXTERNAL_USER_HASH_KEY);
            if (!hash) {
                hash = safeRandomId();
                storeValue(EXTERNAL_USER_HASH_KEY, hash);
            }
            externalUserHashRef.current = hash;
        }

        return modelId;
    }, []);

    const abort = useCallback(() => {
        if (!activeTagRef.current) return;
        finalize();
    }, [finalize]);

    const streamQuery = useCallback(async (userText, messageContext, callbacks = {}) => {
        if (!userText) {
            throw new Error("Query is required");
        }

        void messageContext;
        abort();

        const modelId = ensureSession();
        const subscription = ensureSubscription();
        await waitForConnected();

        const responseTag = safeRandomId();
        activeTagRef.current = responseTag;
        callbacksRef.current = callbacks;

        return new Promise((resolve, reject) => {
            resolveRef.current = resolve;
            rejectRef.current = reject;

            const payload = {
                modelId,
                content: userText,
                responseTag,
                externalUserHash: externalUserHashRef.current,
                conversationId: conversationIdRef.current || undefined,
                origin: typeof window !== "undefined" ? window.location.origin : undefined,
            };

            subscription.perform("sendMessage", payload);

            clearTimeoutRef();
            timeoutRef.current = setTimeout(() => {
                if (activeTagRef.current !== responseTag) return;
                const err = new Error("Stream timeout");
                finalize({ error: err });
            }, STREAM_TIMEOUT_MS);
        });
    }, [abort, ensureSession, ensureSubscription, finalize, waitForConnected]);

    const cleanup = useCallback(() => {
        abort();
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }
        if (consumerRef.current) {
            consumerRef.current.disconnect?.();
            consumerRef.current = null;
        }
        subscriptionIdRef.current = null;
        connectedRef.current = false;
        connectWaitersRef.current = [];
    }, [abort]);

    useEffect(() => () => cleanup(), [cleanup]);

    return {
        streamQuery,
        abort,
        cleanup,
    };
}
