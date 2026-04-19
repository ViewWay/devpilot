import { useEffect, useCallback, useRef } from "react";
import { listen, invoke, isTauriRuntime, STREAM_EVENTS } from "../lib/ipc";
import type {
  StreamChunkEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  ProviderConfigIPC,
  ChatRequestIPC,
  MessageIPC,
} from "../lib/ipc";
import { useChatStore } from "../stores/chatStore";
import { useUsageStore } from "../stores/usageStore";

/**
 * Hook for Tauri event system — handles streaming AI responses.
 *
 * When running inside Tauri, listens for `stream-chunk`, `stream-done`,
 * and `stream-error` events emitted by the Rust backend and updates
 * the chat store accordingly.
 *
 * In browser dev mode, this is a no-op (mock replies handled by chatStore).
 */
export function useTauriEvents() {
  const unlistenersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!isTauriRuntime()) {return;}

    let cancelled = false;

    async function setup() {
      // ── stream-chunk ──────────────────────────────
      const unlistenChunk = await listen<StreamChunkEvent>(
        STREAM_EVENTS.CHUNK,
        (payload) => {
          if (cancelled) {return;}
          const { sessionId, delta } = payload;

          const session = useChatStore
            .getState()
            .sessions.find((s) => s.id === sessionId);
          if (!session) {return;}

          const msgs = session.messages;
          const lastMsg = msgs[msgs.length - 1];

          // If last message is assistant and still streaming, append delta
          if (lastMsg?.role === "assistant" && lastMsg.streaming) {
            useChatStore.getState().updateMessageContent(
              sessionId,
              lastMsg.id,
              lastMsg.content + (delta ?? ""),
              true,
            );
          } else {
            // First chunk — create a new assistant message
            useChatStore.getState().addMessage(sessionId, {
              role: "assistant",
              content: delta ?? "",
              model: undefined,
              streaming: true,
            });
          }
        },
      );

      // ── stream-done ───────────────────────────────
      const unlistenDone = await listen<StreamDoneEvent>(
        STREAM_EVENTS.DONE,
        (payload) => {
          if (cancelled) {return;}
          const { sessionId, usage } = payload;

          const session = useChatStore
            .getState()
            .sessions.find((s) => s.id === sessionId);
          if (!session) {return;}

          const msgs = session.messages;
          const lastMsg = msgs[msgs.length - 1];

          // Mark streaming as finished
          if (lastMsg?.role === "assistant" && lastMsg.streaming) {
            useChatStore.getState().updateMessageContent(
              sessionId,
              lastMsg.id,
              lastMsg.content,
              false,
            );
          }

          useChatStore.setState({ isLoading: false, streamingMessageId: null });

          // Record usage
          if (usage) {
            const model = lastMsg?.model ?? "";
            const provider =
              useChatStore.getState().sessions.find((s) => s.id === sessionId)
                ?.provider ?? "";
            useUsageStore.getState().recordUsageFromTokens({
              sessionId,
              model,
              provider,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            });
          }
        },
      );

      // ── stream-error ──────────────────────────────
      const unlistenError = await listen<StreamErrorEvent>(
        STREAM_EVENTS.ERROR,
        (payload) => {
          if (cancelled) {return;}
          useChatStore.getState().setError(payload.message);
          useChatStore.setState({ isLoading: false, streamingMessageId: null });

          // Mark any streaming message as finished
          const { sessions, activeSessionId } = useChatStore.getState();
          const session = sessions.find((s) => s.id === activeSessionId);
          if (session) {
            const lastMsg =
              session.messages[session.messages.length - 1];
            if (lastMsg?.streaming) {
              useChatStore.getState().updateMessageContent(
                session.id,
                lastMsg.id,
                lastMsg.content,
                false,
              );
            }
          }
        },
      );

      unlistenersRef.current = [unlistenChunk, unlistenDone, unlistenError];
    }

    setup();

    return () => {
      cancelled = true;
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
    };
  }, []);
}

/**
 * Send a message to the Tauri backend for AI processing.
 *
 * In browser mode, returns false so the chatStore can handle mock replies.
 * In Tauri mode, invokes `send_message_stream` and returns true.
 */
export function useSendMessage() {
  const isLoading = useChatStore((s) => s.isLoading);

  const send = useCallback(
    async (sessionId: string, content: string, model: string, providerId: string) => {
      if (isLoading) {return true;}

      if (!isTauriRuntime()) {
        // Browser mode — let chatStore handle mock replies
        return false;
      }

      try {
        useChatStore.setState({ isLoading: true, error: null });

        // Build the provider config from providerStore
        const { useProviderStore } = await import("../stores/providerStore");
        const provider = useProviderStore.getState().getProviderById(providerId);
        if (!provider) {
          throw new Error(`Provider "${providerId}" not found`);
        }

        // Build the provider config for IPC
        const providerConfig: ProviderConfigIPC = {
          id: provider.id,
          name: provider.name,
          providerType: mapProviderType(provider.id),
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey || undefined,
          models: provider.models.map((m) => ({
            id: m.id,
            name: m.name,
            provider: mapProviderType(provider.id),
            maxInputTokens: m.maxTokens,
            maxOutputTokens: 4096,
            supportsStreaming: m.supportsStreaming,
            supportsTools: true,
            supportsVision: m.supportsVision,
            inputPricePerMillion: m.inputPrice,
            outputPricePerMillion: m.outputPrice,
          })),
          enabled: provider.enabled,
        };

        // Build the chat request from current session messages
        const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
        const messages: MessageIPC[] = (session?.messages ?? []).map((msg) => ({
          role: msg.role as "user" | "assistant" | "system" | "tool",
          content: [{ type: "text" as const, text: msg.content }],
        }));

        // Add the new user message
        messages.push({
          role: "user",
          content: [{ type: "text", text: content }],
        });

        const chatRequest: ChatRequestIPC = {
          model,
          messages,
          stream: true,
        };

        // Invoke the streaming command
        await invoke("send_message_stream", {
          provider: providerConfig,
          chatRequest,
          sessionId,
        });

        return true;
      } catch (err) {
        useChatStore
          .getState()
          .setError(err instanceof Error ? err.message : String(err));
        useChatStore.setState({ isLoading: false });
        return true; // Even on error, we tried Tauri
      }
    },
    [isLoading],
  );

  return send;
}

/** Map provider ID to provider type string matching Rust enum. */
function mapProviderType(providerId: string): string {
  if (providerId.includes("anthropic")) {return "anthropic";}
  if (providerId.includes("openai")) {return "openai";}
  if (providerId.includes("openrouter")) {return "openrouter";}
  if (providerId.includes("ollama")) {return "ollama";}
  if (providerId.includes("google")) {return "google";}
  if (providerId.includes("qwen")) {return "qwen";}
  if (providerId.includes("deepseek")) {return "deepseek";}
  if (providerId.includes("zhipu") || providerId.includes("glm")) {return "glm";}
  return "custom";
}

export { invoke, isTauriRuntime };
