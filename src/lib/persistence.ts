/**
 * Persistence layer — bridges Zustand stores with Tauri backend (SQLite).
 *
 * In browser dev mode (no Tauri), all operations are no-ops and the stores
 * use their in-memory mock data. When running in Tauri, every mutation is
 * mirrored to the backend database so sessions survive app restarts.
 */

import { invoke, isTauriRuntime } from "./ipc";
import type {
  SessionInfoIPC,
  MessageInfoIPC,
} from "./ipc";

// ── Session persistence ──────────────────────────────────────

export async function persistCreateSession(
  id: string,
  title: string,
  model: string,
  provider: string,
): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    await invoke<SessionInfoIPC>("create_session", {
      id,
      title,
      model,
      provider,
    });
  } catch (err) {
    console.error("[persistence] create_session failed:", err);
  }
}

export async function persistDeleteSession(id: string): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    await invoke("delete_session", { id });
  } catch (err) {
    console.error("[persistence] delete_session failed:", err);
  }
}

export async function persistUpdateSessionTitle(
  id: string,
  title: string,
): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    await invoke("update_session_title", { id, title });
  } catch (err) {
    console.error("[persistence] update_session_title failed:", err);
  }
}

export async function persistArchiveSession(
  _id: string,
  _archived: boolean,
): Promise<void> {
  if (!isTauriRuntime()) { return; }
  // Archive is implemented as a setting; the backend doesn't have a dedicated
  // archive column yet, so we use the settings table.
  try {
    await invoke("set_setting", {
      key: `session.${_id}.archived`,
      value: _archived ? "true" : "false",
    });
  } catch (err) {
    console.error("[persistence] archive_session failed:", err);
  }
}

// ── Message persistence ──────────────────────────────────────

export async function persistAddMessage(
  sessionId: string,
  messageId: string,
  role: string,
  content: string,
  model?: string,
): Promise<void> {
  if (!isTauriRuntime()) { return; }
  try {
    await invoke("add_message", {
      sessionId,
      id: messageId,
      role,
      content,
      model: model ?? null,
    });
  } catch (err) {
    console.error("[persistence] add_message failed:", err);
  }
}

export async function persistUpdateMessageContent(
  _sessionId: string,
  _messageId: string,
  _content: string,
): Promise<void> {
  // The backend doesn't have a separate update_message_content command yet.
  // For now, message content updates (streaming chunks) are handled in-memory
  // only. The final content is saved when the stream completes via add_message
  // or a future update_message command.
  // TODO: Add update_message_content Tauri command for robust persistence.
}

// ── Boot-time hydration ──────────────────────────────────────

export interface HydratedSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  messages: HydratedMessage[];
}

export interface HydratedMessage {
  id: string;
  role: string;
  content: string;
  model?: string;
  timestamp: string;
  streaming?: boolean;
}

/**
 * Load all sessions from the Tauri backend.
 * Returns null if not in Tauri runtime (caller should use mock data).
 */
export async function hydrateSessions(): Promise<HydratedSession[] | null> {
  if (!isTauriRuntime()) { return null; }
  try {
    const sessions = await invoke<SessionInfoIPC[]>("list_sessions");

    // Check archive status from settings
    const result: HydratedSession[] = [];
    for (const session of sessions) {
      let archived = false;
      try {
        const val = await invoke<{ key: string; value: string } | null>(
          "get_setting",
          { key: `session.${session.id}.archived` },
        );
        archived = val?.value === "true";
      } catch {
        // No archive setting — not archived
      }

      // Load messages for this session
      const messages = await invoke<MessageInfoIPC[]>(
        "get_session_messages",
        { sessionId: session.id },
      );

      result.push({
        id: session.id,
        title: session.title,
        model: session.model,
        provider: session.provider,
        archived,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          model: m.model ?? undefined,
          timestamp: m.createdAt,
        })),
      });
    }

    return result;
  } catch (err) {
    console.error("[persistence] hydrateSessions failed:", err);
    return null;
  }
}
