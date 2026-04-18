import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";

export function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <MessageList />
      <MessageInput />
    </div>
  );
}
