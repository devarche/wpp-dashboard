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
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // Replace or prepend a conversation in the list
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

  // Create tag — optimistic (show immediately, replace with real on success)
  const handleCreateTag = async (name: string, color: string) => {
    const tempId = `optimistic-${Date.now()}`;
    const tempTag: Tag = { id: tempId, name, color, created_by: null, created_at: new Date().toISOString() };
    setTags((prev) => [...prev, tempTag].sort((a, b) => a.name.localeCompare(b.name)));

    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setTags((prev) => prev.map((t) => (t.id === tempId ? (data.tag as Tag) : t)));
    } catch {
      setTags((prev) => prev.filter((t) => t.id !== tempId));
    }
  };

  // Delete tag — optimistic (remove immediately, revert on error)
  const handleDeleteTag = async (tagId: string) => {
    const prevTags = tags;
    const prevConversations = conversations;

    setTags((prev) => prev.filter((t) => t.id !== tagId));
    setConversations((prev) =>
      prev.map((c) => ({ ...c, tags: (c.tags ?? []).filter((t) => t.id !== tagId) }))
    );
    if (selectedTagId === tagId) setSelectedTagId(null);

    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setTags(prevTags);
      setConversations(prevConversations);
    }
  };

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        tags={tags}
        selectedId={selectedId}
        selectedTagId={selectedTagId}
        archiveFilter={archiveFilter}
        onSelect={handleSelect}
        onTagFilterChange={setSelectedTagId}
        onArchiveFilterChange={setArchiveFilter}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
      />
      <ChatWindow
        conversation={selected}
        allTags={tags}
        onUpdate={replaceConversation}
      />
    </div>
  );
}
