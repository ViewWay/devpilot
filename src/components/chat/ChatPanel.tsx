import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useChatStore } from "../../stores/chatStore";
import { Loader2, AlertCircle } from "lucide-react";

export function ChatPanel() {
  const isLoading = useChatStore((s) => s.isLoading);
  const error = useChatStore((s) => s.error);

  return (
    <div className="flex h-full flex-col">
      {isLoading && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Thinking...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2">
          <AlertCircle size={14} className="text-destructive" />
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}
      <MessageList />
      <MessageInput />
    </div>
  );
}
