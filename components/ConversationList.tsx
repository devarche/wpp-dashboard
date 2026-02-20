"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, UserCheck } from "lucide-react";
import type { Conversation } from "@/types";

interface Props {
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ConversationList({ selectedId, onSelect }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchConversations = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setConversations((data as Conversation[]) ?? []);
  }, []);

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchConversations();

    const supabase = createClient();
    const channel = supabase
      .channel("conversations-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  const filtered = conversations.filter((c) => {
    if (filter === "mine" && !(c.assignees ?? []).includes(userId ?? "")) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.phone?.includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-80 flex-shrink-0 border-r border-[#2a3942] flex flex-col bg-[#111b21]">
      {/* Header */}
      <div className="p-3 border-b border-[#2a3942]">
        <h2 className="text-[#e9edef] font-semibold px-1 mb-2">Chats</h2>

        {/* Filter toggle */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
              filter === "all"
                ? "bg-[#00a884] text-white"
                : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setFilter("mine")}
            className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
              filter === "mine"
                ? "bg-[#00a884] text-white"
                : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
            }`}
          >
            Mías
          </button>
        </div>

        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] rounded-lg pl-9 pr-4 py-2 text-sm outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[#8696a0] text-sm">
            {search || filter === "mine" ? "No hay conversaciones" : "No conversations yet"}
          </div>
        ) : (
          filtered.map((conv) => {
            const displayName =
              conv.contact?.name || conv.contact?.phone || "Unknown";
            const initial = displayName[0].toUpperCase();
            const assignees = conv.assignees ?? [];
            const isAssignedToMe = assignees.includes(userId ?? "");
            const isAssigned = assignees.length > 0;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#202c33] transition-colors border-b border-[#2a3942]/40 text-left ${
                  selectedId === conv.id ? "bg-[#2a3942]" : ""
                }`}
              >
                {/* Avatar with assigned indicator */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center text-[#e9edef] font-semibold text-sm">
                    {initial}
                  </div>
                  {isAssigned && (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${isAssignedToMe ? "bg-[#00a884]" : "bg-[#8696a0]"}`}>
                      <UserCheck size={9} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-[#e9edef] font-medium text-sm truncate">
                      {displayName}
                    </span>
                    <span className="text-[#8696a0] text-xs flex-shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-[#8696a0] text-xs truncate">
                      {conv.last_message || "No messages yet"}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 flex-shrink-0 bg-[#00a884] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                        {conv.unread_count > 9 ? "9+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
