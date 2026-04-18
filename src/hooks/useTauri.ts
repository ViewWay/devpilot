import { useEffect, useCallback, useRef } from "react";
import { listen, emit, invoke } from "../lib/ipc";
import { useChatStore } from "../stores/chatStore";

/**
 * Hook for Tauri event system — handles streaming AI responses.
 * In browser dev mode, this is a no-op (mock replies handled by chatStore).
 */
export function useTauriEvents() {
  const addMessage = useChatStore((s) => s.addMessage);
  const setError = useChatStore((s) => s.setError);
  const unlistenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Only set up listeners in Tauri runtime
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let cancelled = false;

    async function setup() {
      // Stream chunk — partial content from LLM
      const unlisten1 = await listen<{ sessionId: string; chunk: string }>(
        "stream_chunk",
        ({ sessionId, chunk }) => {
          if (cancelled) {return;}
          // Append chunk to the last assistant message, or create one
          const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
          if (!session) {return;}
          const msgs = session.messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === "assistant" && !lastMsg.content.endsWith("▌")) {
            // Update last message by replacing it
            useChatStore.setState((s) => ({
              sessions: s.sessions.map((sess) =>
                sess.id === sessionId
                  ? {
                      ...sess,
                      messages: [
                        ...sess.messages.slice(0, -1),
                        { ...lastMsg, content: lastMsg.content + chunk + "▌" },
                      ],
                    }
                  : sess,
              ),
            }));
          } else {
            addMessage(sessionId, { role: "assistant", content: chunk + "▌" });
          }
        },
      );

      // Stream done — final message
      const unlisten2 = await listen<{ sessionId: string; model: string }>(
        "stream_done",
        ({ sessionId, model }) => {
          if (cancelled) {return;}
          const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
          if (!session) {return;}
          const msgs = session.messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === "assistant") {
            useChatStore.setState((s) => ({
              sessions: s.sessions.map((sess) =>
                sess.id === sessionId
                  ? {
                      ...sess,
                      messages: [
                        ...sess.messages.slice(0, -1),
                        {
                          ...lastMsg,
                          content: lastMsg.content.replace(/▌$/, ""),
                          model,
                        },
                      ],
                    }
                  : sess,
              ),
            }));
          }
          useChatStore.setState({ isLoading: false });
        },
      );

      // Error from backend
      const unlisten3 = await listen<{ message: string }>("stream_error", ({ message }) => {
        if (cancelled) {return;}
        setError(message);
        useChatStore.setState({ isLoading: false });
      });

      unlistenersRef.current = [unlisten1, unlisten2, unlisten3];
    }

    setup();

    return () => {
      cancelled = true;
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
    };
  }, [addMessage, setError]);
}

/**
 * Send a message to the Tauri backend for AI processing.
 * Falls back to no-op in browser mode (chatStore handles mock).
 */
export function useSendMessage() {
  const isLoading = useChatStore((s) => s.isLoading);

  const send = useCallback(
    async (sessionId: string, content: string) => {
      if (isLoading) {return;}
      if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        // Browser mode — chatStore handles mock replies
        return;
      }
      try {
        useChatStore.setState({ isLoading: true, error: null });
        await emit("user_message", { sessionId, content });
      } catch (err) {
        useChatStore.getState().setError(err instanceof Error ? err.message : String(err));
        useChatStore.setState({ isLoading: false });
      }
    },
    [isLoading],
  );

  return send;
}

export { invoke, emit, listen };
