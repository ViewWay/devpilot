import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../../i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { MessageActionBar } from "./MessageActionBar";
import type { Message } from "../../types";

type UserMessageProps = {
  message: Message;
};

/**
 * UserMessage — renders a user message bubble, right-aligned with
 * a rounded corner style. Includes markdown rendering and a copy action.
 */
export function UserMessage({ message }: UserMessageProps) {
  const { t } = useI18n();
  const fontSize = useSettingsStore((s) => s.fontSize);

  return (
    <div className="group flex justify-end" role="article" aria-label={t("a11y.userMessage")}>
      <div
        className="max-w-[75%] rounded-2xl rounded-br-sm bg-user-bubble px-4 py-3 leading-relaxed text-user-bubble-foreground prose-user text-sm"
        style={{ fontSize }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {typeof message.content === "string" ? message.content : ""}
        </ReactMarkdown>
        <div className="flex items-center justify-between mt-1">
          <div className="text-[10px] text-user-bubble-foreground/60">{message.timestamp}</div>
          <MessageActionBar content={typeof message.content === "string" ? message.content : ""} />
        </div>
      </div>
    </div>
  );
}
