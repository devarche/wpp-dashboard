"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import type { Conversation, Tag } from "@/types";

export default function DashboardPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const replaceConversation = useCallback((updated: Conversation) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((c) => (c.id === updated.id ? updated : c));
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setTags(data.tags ?? []);
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations();
    fetchTags();
  }, [fetchConversations, fetchTags]);

  // If a tag gets deleted elsewhere, remove it from the active filter
  useEffect(() => {
    const validIds = new Set(tags.map((t) => t.id));
    setSelectedTagIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [tags]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("dashboard-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        fetchConversations()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        fetchConversations()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_tags" }, () =>
        fetchConversations()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_tags" }, () => {
        fetchTags();
        fetchConversations();
      })
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchConversations();
        fetchTags();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchConversations, fetchTags]);

  // Select conversation + mark as read (optimistic)
  const handleSelect = async (conv: Conversation) => {
    setSelectedId(conv.id);
    if (conv.unread_count > 0) {
      replaceConversation({ ...conv, unread_count: 0 });
      const supabase = createClient();
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conv.id);
    }
  };

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        tags={tags}
        selectedId={selectedId}
        selectedTagIds={selectedTagIds}
        archiveFilter={archiveFilter}
        onSelect={handleSelect}
        onTagFilterChange={setSelectedTagIds}
        onArchiveFilterChange={setArchiveFilter}
      />
      <ChatWindow
        conversation={selected}
        allTags={tags}
        onUpdate={replaceConversation}
      />
    </div>
  );
}
