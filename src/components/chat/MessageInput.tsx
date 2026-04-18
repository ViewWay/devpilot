import { useState } from "react";
import { useI18n } from "../../i18n";
import { Send, Paperclip, Globe, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

export function MessageInput() {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const hasContent = input.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
      <div className="mx-auto max-w-3xl">
        {/* Input container */}
        <div className={cn(
          "flex items-end gap-2 rounded-xl border bg-background px-3 py-2 transition-colors",
          hasContent ? "border-ring" : "border-input",
        )}>
          {/* Attach */}
          <button
            title={t("attachFile")}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Paperclip size={15} />
          </button>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                // TODO: send
              }
            }}
          />

          {/* Web search */}
          <button
            title={t("webSearch")}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Globe size={15} />
          </button>

          {/* Send */}
          <button
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
