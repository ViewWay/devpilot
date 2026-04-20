import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useI18n } from "../../i18n";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { Send, Paperclip, Globe, Sparkles, StopCircle, X, Image, FileText } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Attachment, AttachmentIPC } from "../../types";

const SLASH_COMMANDS = [
  { cmd: "/help", descKey: "slashHelp", icon: "❓" },
  { cmd: "/clear", descKey: "slashClear", icon: "🧹" },
  { cmd: "/model", descKey: "slashModel", icon: "🤖" },
  { cmd: "/compact", descKey: "slashCompact", icon: "📦" },
  { cmd: "/cost", descKey: "slashCost", icon: "💰" },
  { cmd: "/doctor", descKey: "slashDoctor", icon: "🩺" },
];

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const ACCEPTED_DOC_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/csv",
  "text/x-python",
  "text/javascript",
  "application/typescript",
  "text/x-rust",
  "text/x-c",
  "text/x-c++",
  "text/css",
  "text/html",
  "application/pdf",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 5;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {return `${bytes}B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)}KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function generateId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

/** Encode attachments to base64 for IPC serialization. */
async function encodeAttachments(attachments: Attachment[]): Promise<AttachmentIPC[]> {
  const results: AttachmentIPC[] = [];
  for (const att of attachments) {
    // For images, the preview already has the base64 data URL
    if (att.preview && isImageType(att.type)) {
      results.push({
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        base64Data: att.preview,
        preview: att.preview,
      });
    } else {
      // Read file as data URL for non-image or non-preview attachments
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(att.file);
        });
        results.push({
          id: att.id,
          name: att.name,
          size: att.size,
          type: att.type,
          base64Data: dataUrl,
        });
      } catch {
        // Skip files that can't be read
      }
    }
  }
  return results;
}

export function MessageInput({ sessionId }: { sessionId?: string } = {}) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  const hasContent = input.trim().length > 0 || attachments.length > 0;
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const isStreaming = !!streamingMessageId;
  const selectedModel = useUIStore((s) => s.selectedModel);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveSession = useChatStore((s) => s.setActiveSession);

  // Filter commands based on input
  const filteredCommands = useMemo(() =>
    input.startsWith("/") && !input.includes(" ")
      ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.trim()))
      : [],
    [input],
  );

  useEffect(() => {
    setShowCommands(filteredCommands.length > 0);
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {return;}
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, [input]);

  // Process files into attachments
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {return false;}
      return ACCEPTED_IMAGE_TYPES.includes(f.type) || ACCEPTED_DOC_TYPES.includes(f.type);
    });

    const newAttachments: Attachment[] = [];
    for (const file of validFiles) {
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS) {break;}

      const att: Attachment = {
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      // Generate preview for images
      if (isImageType(file.type)) {
        try {
          att.preview = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        } catch {
          // no preview
        }
      }

      newAttachments.push(att);
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS));
    }
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  }, [processFiles]);

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isLoading) {return;}

    // Encode image attachments to base64 for IPC
    const ipcAttachments = await encodeAttachments(attachments);

    if (trimmed || ipcAttachments.length > 0) {
      // If a specific sessionId is provided (e.g. in split view),
      // temporarily switch to that session for sending.
      if (sessionId) {
        const prev = useChatStore.getState().activeSessionId;
        setActiveSession(sessionId);
        sendMessage(trimmed, selectedModel.name, ipcAttachments.length > 0 ? ipcAttachments : undefined);
        // Restore previous active session after a tick
        if (prev) {
          setTimeout(() => setActiveSession(prev), 0);
        }
      } else {
        sendMessage(trimmed, selectedModel.name, ipcAttachments.length > 0 ? ipcAttachments : undefined);
      }
    }
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // Announce to screen readers
    setAnnounceText(t("a11y.messageSent"));
    setTimeout(() => setAnnounceText(""), 1000);
  }, [input, isLoading, sendMessage, selectedModel.name, attachments, sessionId, setActiveSession, t]);

  const handleStop = useCallback(() => {
    useChatStore.getState().abortStreaming();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showCommands) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const cmd = filteredCommands[selectedIndex];
          if (cmd) {
            setInput(cmd.cmd + " ");
            textareaRef.current?.focus();
          }
          return;
        }
        if (e.key === "Escape") {
          setShowCommands(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showCommands, filteredCommands, selectedIndex],
  );

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
      <div className="mx-auto w-full max-w-4xl relative 2xl:max-w-5xl">
        {/* Screen reader live region for announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">{announceText}</div>

        {/* Slash command autocomplete menu */}
        {showCommands && (
          <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50" role="listbox" aria-label={t("slashHelp")}>
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.cmd}
                onClick={() => {
                  setInput(cmd.cmd + " ");
                  textareaRef.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                  idx === selectedIndex ? "bg-accent text-accent-foreground" : "text-popover-foreground hover:bg-accent/50",
                )}
                role="option"
                aria-selected={idx === selectedIndex}
              >
                <span className="text-base">{cmd.icon}</span>
                <span className="font-mono text-xs font-medium w-16">{cmd.cmd}</span>
                <span className="text-xs text-muted-foreground">{t(cmd.descKey)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input container with drag overlay */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative"
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
              <div className="flex flex-col items-center gap-1 text-primary">
                <Paperclip size={24} />
                <span className="text-xs font-medium">{t("dropFilesHere")}</span>
              </div>
            </div>
          )}

          {/* Attachment preview bar */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1 pr-1 text-xs text-foreground"
                >
                  {att.preview ? (
                    <img src={att.preview} alt={att.name} className="h-6 w-6 rounded object-cover" />
                  ) : isImageType(att.type) ? (
                    <Image size={14} className="text-primary shrink-0" />
                  ) : (
                    <FileText size={14} className="text-muted-foreground shrink-0" />
                  )}
                  <span className="max-w-[100px] truncate">{att.name}</span>
                  <span className="text-muted-foreground">{formatFileSize(att.size)}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                    aria-label={`${t("a11y.removeAttachment")} ${att.name}`}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className={cn(
              "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors",
              hasContent ? "border-ring" : "border-input",
              isDragOver && "border-primary",
            )}
          >
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title={t("attachFile")}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("attachFile")}
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_DOC_TYPES].join(",")}
              className="hidden"
              onChange={handleFileInput}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("inputPlaceholder")}
              rows={1}
              className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none"
              onKeyDown={handleKeyDown}
              aria-label={t("a11y.messageInput")}
            />

            {/* Web search */}
            <button
              title={t("webSearch")}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t("a11y.webSearch")}
            >
              <Globe size={15} />
            </button>

            {/* Send / Stop */}
            {isLoading || isStreaming ? (
              <button
                onClick={handleStop}
                title={t("stopGeneration")}
                className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/90 text-white transition-colors hover:bg-destructive"
                aria-label={t("a11y.stopGeneration")}
              >
                <StopCircle size={14} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                className={cn(
                  "mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  hasContent
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
                )}
                disabled={!hasContent}
                aria-label={t("a11y.sendMessage")}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{t("inputHint")}</span>
          <div className="flex items-center gap-1">
            <Sparkles size={10} />
            <span>DevPilot v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
