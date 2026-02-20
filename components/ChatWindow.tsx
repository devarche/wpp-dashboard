"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageBubble from "./MessageBubble";
import { Send, MessageSquare, UserCheck, UserMinus } from "lucide-react";
import type { Conversation, Message } from "@/types";

interface Props {
  conversation: Conversation | null;
  onUpdate: (conversation: Conversation) => void;
}

export default function ChatWindow({ conversation, onUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const handleAssign = async () => {
    if (!conversation || !userId) return;
    const newAssigned = conversation.assigned_to === userId ? null : userId;
    const supabase = createClient();
    const { data } = await supabase
      .from("conversations")
      .update({ assigned_to: newAssigned })
      .eq("id", conversation.id)
      .select("*, contact:contacts(*)")
      .single();
    if (data) onUpdate(data as Conversation);
  };

  // Fetch messages when conversation changes + subscribe to realtime
  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      return;
    }

    const supabase = createClient();

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) ?? []);
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === (payload.new as Message).id
                ? (payload.new as Message)
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !conversation || sending) return;
    const msg = text.trim();
    setText("");
    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id, text: msg }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Send failed:", err);
        setText(msg); // restore on failure
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0b141a] gap-3">
        <div className="w-16 h-16 rounded-full bg-[#202c33] flex items-center justify-center">
          <MessageSquare size={28} className="text-[#8696a0]" />
        </div>
        <p className="text-[#8696a0] text-sm">
          Select a conversation to start chatting
        </p>
      </div>
    );
  }

  const displayName =
    conversation.contact?.name ||
    conversation.contact?.phone ||
    "Unknown";

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      {/* Header */}
      <div className="h-16 bg-[#202c33] border-b border-[#2a3942] flex items-center px-4 gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center text-[#e9edef] font-semibold text-sm flex-shrink-0">
          {displayName[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#e9edef] font-medium text-sm">{displayName}</p>
          <p className="text-[#8696a0] text-xs">
            {conversation.contact?.phone}
          </p>
        </div>
        {/* Assign button */}
        <button
          onClick={handleAssign}
          title={conversation.assigned_to === userId ? "Desasignar" : "Asignar a mí"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
            conversation.assigned_to === userId
              ? "bg-[#00a884]/20 text-[#00a884] hover:bg-red-900/20 hover:text-red-400"
              : conversation.assigned_to !== null
              ? "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
              : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
          }`}
        >
          {conversation.assigned_to === userId ? (
            <><UserMinus size={13} /> Desasignar</>
          ) : (
            <><UserCheck size={13} /> Asignar</>
          )}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#8696a0] text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="h-16 bg-[#202c33] border-t border-[#2a3942] flex items-center px-4 gap-3 flex-shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          className="flex-1 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-4 py-2 text-sm outline-none"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white transition-colors hover:bg-[#06cf9c] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
