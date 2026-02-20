"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageBubble from "./MessageBubble";
import { Send, MessageSquare, Users, X } from "lucide-react";
import type { Conversation, Message } from "@/types";

interface AuthUser {
  id: string;
  email: string;
}

interface Props {
  conversation: Conversation | null;
  onUpdate: (conversation: Conversation) => void;
}

export default function ChatWindow({ conversation, onUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [showAssignees, setShowAssignees] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Get current user + all users
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));

    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setAllUsers(d.users ?? []));
  }, []);

  // Toggle a user in the assignees array
  const handleToggleAssignee = async (uid: string) => {
    if (!conversation) return;
    const current = conversation.assignees ?? [];
    const next = current.includes(uid)
      ? current.filter((id) => id !== uid)
      : [...current, uid];

    const supabase = createClient();
    const { data } = await supabase
      .from("conversations")
      .update({ assignees: next })
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
      // Subscribe to conversation updates (assignees, status, etc.)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversation.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("conversations")
            .select("*, contact:contacts(*)")
            .eq("id", conversation.id)
            .single();
          if (data) onUpdate(data as Conversation);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, onUpdate]);

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
        setText(msg);
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

  const assignees = conversation.assignees ?? [];
  const assigneeEmails = assignees
    .map((id) => allUsers.find((u) => u.id === id)?.email ?? id.slice(0, 8))
    .join(", ");

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      {/* Header */}
      <div className="h-16 bg-[#202c33] border-b border-[#2a3942] flex items-center px-4 gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center text-[#e9edef] font-semibold text-sm flex-shrink-0">
          {displayName[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#e9edef] font-medium text-sm">{displayName}</p>
          <p className="text-[#8696a0] text-xs truncate">
            {assignees.length > 0 ? (
              <span className="text-[#00a884]">→ {assigneeEmails}</span>
            ) : (
              conversation.contact?.phone
            )}
          </p>
        </div>

        {/* Assignees dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowAssignees((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              assignees.length > 0
                ? "bg-[#00a884]/20 text-[#00a884]"
                : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
            }`}
          >
            <Users size={13} />
            {assignees.length > 0 ? `${assignees.length} asignado${assignees.length > 1 ? "s" : ""}` : "Asignar"}
          </button>

          {showAssignees && (
            <div className="absolute right-0 top-9 w-64 bg-[#202c33] border border-[#2a3942] rounded-xl shadow-xl z-20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3942]">
                <span className="text-[#e9edef] text-xs font-medium">Asignar a</span>
                <button onClick={() => setShowAssignees(false)}>
                  <X size={14} className="text-[#8696a0]" />
                </button>
              </div>
              {allUsers.length === 0 ? (
                <p className="text-[#8696a0] text-xs p-3">Cargando usuarios…</p>
              ) : (
                allUsers.map((u) => {
                  const isAssigned = assignees.includes(u.id);
                  const isMe = u.id === userId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleToggleAssignee(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a3942] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isAssigned
                            ? "bg-[#00a884] border-[#00a884]"
                            : "border-[#8696a0]"
                        }`}
                      >
                        {isAssigned && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[#e9edef] text-xs truncate">
                        {u.email}
                        {isMe && <span className="text-[#8696a0] ml-1">(vos)</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Opt-out warning */}
      {conversation.contact?.opted_out && (
        <div className="bg-amber-900/30 border-b border-amber-700/40 px-4 py-2 flex-shrink-0">
          <span className="text-amber-400 text-xs font-medium">
            ⚠ Este contacto ha optado por no recibir mensajes (opt-out). No podés enviarle templates de marketing.
          </span>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-1"
        onClick={() => setShowAssignees(false)}
      >
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
