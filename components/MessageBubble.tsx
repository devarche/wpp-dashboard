import { Check, CheckCheck, Clock, FileDown, Play, AlertCircle } from "lucide-react";
import type { Message } from "@/types";

interface Props {
  message: Message;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusTicks({ status }: { status: string }) {
  if (status === "sending") return <Clock size={12} className="text-[#8696a0] animate-pulse" />;
  if (status === "failed") return <AlertCircle size={12} className="text-red-400" />;
  if (status === "read") return <CheckCheck size={13} className="text-[#53bdeb]" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-[#8696a0]" />;
  if (status === "sent") return <Check size={13} className="text-[#8696a0]" />;
  return null;
}

function mediaUrl(id: string) {
  return `/api/media/${id}`;
}

function getMediaId(
  content: Record<string, unknown>,
  field: string
): string | null {
  const media = content[field] as { id?: string } | undefined;
  return media?.id ?? null;
}

function MessageContent({ message }: { message: Message }) {
  const c = message.content as Record<string, unknown>;

  if (message.type === "text") {
    const body =
      (c.text as { body?: string } | undefined)?.body ??
      (c.body as string) ??
      "";
    return (
      <p className="text-[#e9edef] text-sm whitespace-pre-wrap break-words leading-relaxed">
        {body}
      </p>
    );
  }

  if (message.type === "image") {
    const id = getMediaId(c, "image");
    const caption = (c.image as { caption?: string } | undefined)?.caption;
    return (
      <div>
        {id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(id)}
            alt={caption || "Image"}
            className="rounded-lg max-w-full max-h-64 object-cover"
          />
        ) : (
          <p className="text-[#8696a0] text-sm">[Image]</p>
        )}
        {caption && (
          <p className="text-[#e9edef] text-sm mt-1">{caption}</p>
        )}
      </div>
    );
  }

  if (message.type === "audio") {
    const id = getMediaId(c, "audio");
    return id ? (
      <audio controls className="w-56">
        <source src={mediaUrl(id)} />
      </audio>
    ) : (
      <div className="flex items-center gap-2 text-[#8696a0] text-sm">
        <Play size={14} />
        <span>[Audio]</span>
      </div>
    );
  }

  if (message.type === "video") {
    const id = getMediaId(c, "video");
    const caption = (c.video as { caption?: string } | undefined)?.caption;
    return (
      <div>
        {id ? (
          <video controls className="rounded-lg max-w-full max-h-64">
            <source src={mediaUrl(id)} />
          </video>
        ) : (
          <p className="text-[#8696a0] text-sm">[Video]</p>
        )}
        {caption && (
          <p className="text-[#e9edef] text-sm mt-1">{caption}</p>
        )}
      </div>
    );
  }

  if (message.type === "document") {
    const id = getMediaId(c, "document");
    const doc = c.document as
      | { filename?: string; mime_type?: string }
      | undefined;
    const filename = doc?.filename ?? "document";
    return id ? (
      <a
        href={mediaUrl(id)}
        download={filename}
        className="flex items-center gap-2 text-[#00a884] text-sm hover:underline"
      >
        <FileDown size={15} />
        {filename}
      </a>
    ) : (
      <p className="text-[#8696a0] text-sm">[Document: {filename}]</p>
    );
  }

  if (message.type === "template") {
    const tmpl = c.template as { name?: string } | undefined;
    return (
      <p className="text-[#e9edef] text-sm italic">
        {tmpl?.name ? `[Template: ${tmpl.name}]` : "[Template]"}
      </p>
    );
  }

  return (
    <p className="text-[#8696a0] text-sm">[{message.type}]</p>
  );
}

export default function MessageBubble({ message }: Props) {
  const isOut = message.direction === "outbound";

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[65%] rounded-xl px-3 py-2 shadow-sm transition-opacity ${
          message.status === "sending" ? "opacity-60" : "opacity-100"
        } ${
          isOut
            ? message.status === "failed" ? "bg-red-900/60 rounded-tr-none" : "bg-[#005c4b] rounded-tr-none"
            : "bg-[#202c33] rounded-tl-none"
        }`}
      >
        <MessageContent message={message} />
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
