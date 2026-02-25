"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Archive, Search, Tag as TagIcon, UserCheck, X } from "lucide-react";
import type { Conversation, Tag } from "@/types";

const TAG_COLORS = [
  "#00a884", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface Props {
  conversations: Conversation[];
  tags: Tag[];
  selectedId: string | null;
  selectedTagId: string | null;
  archiveFilter: "active" | "archived";
  onSelect: (conversation: Conversation) => void;
  onTagFilterChange: (tagId: string | null) => void;
  onArchiveFilterChange: (filter: "active" | "archived") => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: string) => void;
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

export default function ConversationList({
  conversations,
  tags,
  selectedId,
  selectedTagId,
  archiveFilter,
  onSelect,
  onTagFilterChange,
  onArchiveFilterChange,
  onCreateTag,
  onDeleteTag,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const filtered = conversations.filter((c) => {
    if (archiveFilter === "active" && c.archived) return false;
    if (archiveFilter === "archived" && !c.archived) return false;
    if (filter === "mine" && !(c.assignees ?? []).includes(userId ?? "")) return false;
    if (selectedTagId && !(c.tags ?? []).some((t) => t.id === selectedTagId)) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.phone?.includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    try {
      await onCreateTag(name, selectedColor);
      setNewTagName("");
    } finally {
      setCreatingTag(false);
    }
  };

  return (
    <div className="w-80 flex-shrink-0 border-r border-[#2a3942] flex flex-col bg-[#111b21]">
      {/* Header */}
      <div className="p-3 border-b border-[#2a3942] space-y-2">
        <h2 className="text-[#e9edef] font-semibold px-1">Chats</h2>

        {/* Todas / Mías */}
        <div className="flex gap-1">
          {(["all", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
                filter === f
                  ? "bg-[#00a884] text-white"
                  : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
              }`}
            >
              {f === "all" ? "Todas" : "Mías"}
            </button>
          ))}
        </div>

        {/* Activos / Archivados */}
        <div className="flex gap-1">
          {(["active", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onArchiveFilterChange(f)}
              className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
                archiveFilter === f
                  ? "bg-[#00a884] text-white"
                  : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
              }`}
            >
              {f === "active" ? "Activos" : "Archivados"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar"
            className="w-full bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] rounded-lg pl-9 pr-4 py-2 text-sm outline-none"
          />
        </div>

        {/* Tag filter */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <TagIcon size={11} className="text-[#8696a0]" />
            <span className="text-[#8696a0] text-[11px]">Filtrar por tag</span>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 flex-wrap mb-2">
            <button
              onClick={() => onTagFilterChange(null)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                selectedTagId === null
                  ? "bg-[#00a884] text-white"
                  : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
              }`}
            >
              Todas
            </button>
            {tags.map((tag) => (
              <div key={tag.id} className="relative group flex items-center">
                <button
                  onClick={() => onTagFilterChange(selectedTagId === tag.id ? null : tag.id)}
                  className="pl-2 pr-5 py-0.5 rounded text-[11px] font-medium text-white transition-opacity"
                  style={{ backgroundColor: tag.color || "#00a884" }}
                >
                  {tag.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTag(tag.id);
                  }}
                  className="absolute right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar tag"
                >
                  <X size={9} className="text-white/80 hover:text-white" />
                </button>
              </div>
            ))}
          </div>

          {/* Create tag */}
          <div className="space-y-1.5">
            {/* Color picker */}
            <div className="flex gap-1.5">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-4 h-4 rounded-full flex-shrink-0 transition-transform ${
                    selectedColor === c ? "ring-2 ring-white scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {/* Name + submit */}
            <div className="flex gap-1">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTag();
                  }
                }}
                placeholder="Nueva tag…"
                className="flex-1 bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] rounded px-2 py-1 text-xs outline-none"
              />
              <button
                onClick={handleCreateTag}
                disabled={creatingTag || !newTagName.trim()}
                className="px-2.5 py-1 rounded text-white text-xs font-bold disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: selectedColor }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-[#8696a0] text-sm">
            No hay conversaciones
          </div>
        ) : (
          filtered.map((conv) => {
            const displayName = conv.contact?.name || conv.contact?.phone || "Unknown";
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
                {/* Avatar */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center text-[#e9edef] font-semibold text-sm">
                    {initial}
                  </div>
                  {isAssigned && (
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                        isAssignedToMe ? "bg-[#00a884]" : "bg-[#8696a0]"
                      }`}
                    >
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
                      {conv.last_message || "Sin mensajes"}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 flex-shrink-0 bg-[#00a884] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                        {conv.unread_count > 9 ? "9+" : conv.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Tags + archive badge */}
                  {(conv.archived || (conv.tags ?? []).length > 0) && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {conv.archived && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#202c33] text-[#8696a0] inline-flex items-center gap-1">
                          <Archive size={9} />
                          Archivado
                        </span>
                      )}
                      {(conv.tags ?? []).slice(0, 2).map((tag) => (
                        <span
                          key={tag.id}
                          className="text-[10px] px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: tag.color || "#00a884" }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {(conv.tags ?? []).length > 2 && (
                        <span className="text-[10px] text-[#8696a0]">
                          +{(conv.tags ?? []).length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
