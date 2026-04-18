import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { Send, Paperclip, Globe, Sparkles, StopCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export function MessageInput() {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasContent = input.trim().length > 0;
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage(trimmed, selectedModel.name);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, sendMessage, selectedModel.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Show slash command hint
  const showSlashHint = input.trim().startsWith("/") && !input.includes(" ");

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
      <div className="mx-auto max-w-3xl">
        {/* Slash command autocomplete hint */}
        {showSlashHint && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {["/help", "/clear", "/model", "/compact", "/cost"].map((cmd) => (
              <button
                key={cmd}
                onClick={() => setInput(cmd + " ")}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        {/* Input container */}
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors",
            hasContent ? "border-ring" : "border-input",
          )}
        >
          {/* Attach */}
          <button
            title={t("attachFile")}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Paperclip size={15} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none"
            onKeyDown={handleKeyDown}
          />

          {/* Web search */}
          <button
            title={t("webSearch")}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Globe size={15} />
          </button>

          {/* Send / Stop */}
          {isLoading ? (
            <button
              title={t("stopGeneration")}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/90 text-white transition-colors hover:bg-destructive"
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
            >
              <Send size={14} />
            </button>
          )}
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
