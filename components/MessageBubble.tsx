import { Check, CheckCheck } from "lucide-react";
import type { Message } from "@/types";

interface Props {
  message: Message;
}

function getMessageText(message: Message): string {
  const c = message.content as Record<string, unknown>;
  if (message.type === "text") {
    const text = c.text as { body?: string } | undefined;
    return text?.body ?? (c.body as string) ?? "";
  }
  if (message.type === "image") return "[Image]";
  if (message.type === "audio") return "[Audio]";
  if (message.type === "video") return "[Video]";
  if (message.type === "document") return "[Document]";
  if (message.type === "template") {
    const tmpl = c.template as { name?: string } | undefined;
    return tmpl?.name ? `[Template: ${tmpl.name}]` : "[Template]";
  }
  return `[${message.type}]`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusTicks({ status }: { status: string }) {
  if (status === "read")
    return <CheckCheck size={13} className="text-[#53bdeb]" />;
  if (status === "delivered")
    return <CheckCheck size={13} className="text-[#8696a0]" />;
  if (status === "sent") return <Check size={13} className="text-[#8696a0]" />;
  return null;
}

export default function MessageBubble({ message }: Props) {
  const isOut = message.direction === "outbound";
  const text = getMessageText(message);

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[65%] rounded-xl px-3 py-2 shadow-sm ${
          isOut
            ? "bg-[#005c4b] rounded-tr-none"
            : "bg-[#202c33] rounded-tl-none"
        }`}
      >
        <p className="text-[#e9edef] text-sm whitespace-pre-wrap break-words leading-relaxed">
          {text}
        </p>
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOut ? "justify-end" : "justify-start"
          }`}
        >
          <span className="text-[#8696a0] text-xs">
            {formatTime(message.created_at)}
          </span>
          {isOut && <StatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  );
}
