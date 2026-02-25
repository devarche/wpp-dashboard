"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageBubble from "./MessageBubble";
import { Archive, ArchiveRestore, MessageSquare, Send, Tag as TagIcon, Users, X } from "lucide-react";
import type { Conversation, Message, Tag } from "@/types";

interface AuthUser {
  id: string;
  email: string;
}

interface Props {
  conversation: Conversation | null;
  allTags: Tag[];
  onUpdate: (conversation: Conversation) => void;
}

function upsertMessage(list: Message[], next: Message): Message[] {
  const idx = list.findIndex(
    (m) => m.id === next.id || (next.wamid && m.wamid === next.wamid)
  );
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = next;
  return copy;
}

export default function ChatWindow({ conversation, allTags, onUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
  const [showAssignees, setShowAssignees] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));

    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setAllUsers(d.users ?? []));
  }, []);

  // ── Optimistic: toggle archive ──────────────────────────────────────────────
  const handleToggleArchive = async () => {
    if (!conversation) return;
    const prev = conversation;
    const nextArchived = !conversation.archived;
    onUpdate({ ...conversation, archived: nextArchived });

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: nextArchived }),
      });
      if (!res.ok) throw new Error("failed");
      const { conversation: updated } = await res.json();
      if (updated) onUpdate(updated as Conversation);
    } catch {
      onUpdate(prev);
    }
  };

  // ── Optimistic: toggle tag ──────────────────────────────────────────────────
  const handleToggleTag = async (tagId: string) => {
    if (!conversation) return;
    const prev = conversation;
    const currentIds = (conversation.tags ?? []).map((t) => t.id);
    const nextIds = currentIds.includes(tagId)
      ? currentIds.filter((id) => id !== tagId)
      : [...currentIds, tagId];
    const nextTags = allTags.filter((t) => nextIds.includes(t.id));

    onUpdate({ ...conversation, tags: nextTags });

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_ids: nextIds }),
      });
      if (!res.ok) throw new Error("failed");
      const { conversation: updated } = await res.json();
      if (updated) onUpdate(updated as Conversation);
    } catch {
      onUpdate(prev);
    }
  };

  // ── Optimistic: toggle assignee ─────────────────────────────────────────────
  const handleToggleAssignee = async (uid: string) => {
    if (!conversation) return;
    const prev = conversation;
    const current = conversation.assignees ?? [];
    const next = current.includes(uid)
      ? current.filter((id) => id !== uid)
      : [...current, uid];

    onUpdate({ ...conversation, assignees: next });

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/assignees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignees: next }),
      });
      if (!res.ok) throw new Error("failed");
      const { conversation: updated } = await res.json();
      if (updated) onUpdate(updated as Conversation);
    } catch {
      onUpdate(prev);
    }
  };

  // ── Fetch messages + realtime ────────────────────────────────────────────────
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
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => setMessages((prev) => upsertMessage(prev, payload.new as Message))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === (payload.new as Message).id ? (payload.new as Message) : m))
          )
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Optimistic: send message ─────────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() || !conversation || sending) return;
    const msg = text.trim();
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const optimistic: Message = {
      id: tempId,
      conversation_id: conversation.id,
      wamid: null,
      direction: "outbound",
      type: "text",
      content: { text: { body: msg } },
      status: "sending",
      created_at: now,
    };

    setMessages((prev) => [...prev, optimistic]);
    onUpdate({ ...conversation, last_message: msg, last_message_at: now });
    setText("");
    setSending(true);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id, text: msg }),
      });

      if (!res.ok) {
        // Mark as failed, restore text
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
        );
        setText(msg);
        return;
      }

      // The realtime INSERT will arrive and upsert the real message,
      // replacing the optimistic one via the wamid match in upsertMessage.
      // If realtime is slow, we remove the temp after a delay.
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== tempId || m.status !== "sending"));
      }, 4000);
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
        <p className="text-[#8696a0] text-sm">Seleccioná una conversación</p>
      </div>
    );
  }

  const displayName = conversation.contact?.name || conversation.contact?.phone || "Unknown";
  const assignees = conversation.assignees ?? [];
  const tags = conversation.tags ?? [];
  const assigneeEmails = assignees
    .map((id) => allUsers.find((u) => u.id === id)?.email ?? id.slice(0, 8))
    .join(", ");

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] overflow-hidden">
      {/* Header */}
      <div className="h-16 bg-[#202c33] border-b border-[#2a3942] flex items-center px-4 gap-2 flex-shrink-0">
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

        {/* Archive */}
        <button
          onClick={handleToggleArchive}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
            conversation.archived
              ? "bg-[#00a884]/20 text-[#00a884]"
              : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
          }`}
          title={conversation.archived ? "Desarchivar" : "Archivar"}
        >
          {conversation.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </button>

        {/* Tags dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => { setShowTags((v) => !v); setShowAssignees(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tags.length > 0
                ? "bg-[#00a884]/20 text-[#00a884]"
                : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
            }`}
          >
            <TagIcon size={13} />
            {tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? "s" : ""}` : "Tags"}
          </button>

          {showTags && (
            <div className="absolute right-0 top-11 w-56 bg-[#202c33] border border-[#2a3942] rounded-xl shadow-xl z-20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3942]">
                <span className="text-[#e9edef] text-xs font-medium">Tags</span>
                <button onClick={() => setShowTags(false)}>
                  <X size={14} className="text-[#8696a0]" />
                </button>
              </div>
              {allTags.length === 0 ? (
                <p className="text-[#8696a0] text-xs p-3">Sin tags creadas</p>
              ) : (
                allTags.map((tag) => {
                  const isOn = tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a3942] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isOn ? "bg-[#00a884] border-[#00a884]" : "border-[#8696a0]"
                        }`}
                      >
                        {isOn && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || "#00a884" }}
                      />
                      <span className="text-[#e9edef] text-xs truncate">{tag.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Assignees dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => { setShowAssignees((v) => !v); setShowTags(false); }}
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
            <div className="absolute right-0 top-11 w-64 bg-[#202c33] border border-[#2a3942] rounded-xl shadow-xl z-20 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3942]">
                <span className="text-[#e9edef] text-xs font-medium">Asignar a</span>
                <button onClick={() => setShowAssignees(false)}>
                  <X size={14} className="text-[#8696a0]" />
                </button>
              </div>
              {allUsers.length === 0 ? (
                <p className="text-[#8696a0] text-xs p-3">Cargando…</p>
              ) : (
                allUsers.map((u) => {
                  const isOn = assignees.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleToggleAssignee(u.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a3942] transition-colors"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isOn ? "bg-[#00a884] border-[#00a884]" : "border-[#8696a0]"
                        }`}
                      >
                        {isOn && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[#e9edef] text-xs truncate">
                        {u.email}
                        {u.id === userId && <span className="text-[#8696a0] ml-1">(vos)</span>}
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
            ⚠ Este contacto optó por no recibir mensajes (opt-out).
          </span>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-1"
        onClick={() => { setShowAssignees(false); setShowTags(false); }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#8696a0] text-sm">Sin mensajes</p>
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
          placeholder="Escribí un mensaje"
          className="flex-1 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-4 py-2 text-sm outline-none"
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
