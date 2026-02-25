"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Archive, ChevronDown, Search, Tag as TagIcon, UserCheck, X } from "lucide-react";
import type { Conversation, Tag } from "@/types";

interface Props {
  conversations: Conversation[];
  tags: Tag[];
  selectedId: string | null;
  selectedTagIds: string[];
  archiveFilter: "active" | "archived";
  onSelect: (conversation: Conversation) => void;
  onTagFilterChange: (tagIds: string[]) => void;
  onArchiveFilterChange: (filter: "active" | "archived") => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ConversationList({
  conversations,
  tags,
  selectedId,
  selectedTagIds,
  archiveFilter,
  onSelect,
  onTagFilterChange,
  onArchiveFilterChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [userId, setUserId] = useState<string | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagFilterChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagFilterChange([...selectedTagIds, tagId]);
    }
  };

  const filtered = conversations.filter((c) => {
    if (archiveFilter === "active" && c.archived) return false;
    if (archiveFilter === "archived" && !c.archived) return false;
    if (filter === "mine" && !(c.assignees ?? []).includes(userId ?? "")) return false;
    // Multi-select: show conversations that have ALL selected tags
    if (selectedTagIds.length > 0) {
      const convTagIds = (c.tags ?? []).map((t) => t.id);
      if (!selectedTagIds.every((id) => convTagIds.includes(id))) return false;
    }
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

        {/* Tag multi-select filter */}
        <div ref={tagDropdownRef} className="relative">
          <button
            onClick={() => setShowTagDropdown((v) => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
              selectedTagIds.length > 0
                ? "bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/30"
                : "bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]"
            }`}
          >
            <TagIcon size={13} className="flex-shrink-0" />
            <span className="flex-1 text-left">
              {selectedTagIds.length === 0
                ? "Filtrar por tags"
                : `${selectedTagIds.length} tag${selectedTagIds.length > 1 ? "s" : ""} seleccionada${selectedTagIds.length > 1 ? "s" : ""}`}
            </span>
            <ChevronDown
              size={13}
              className={`flex-shrink-0 transition-transform ${showTagDropdown ? "rotate-180" : ""}`}
            />
          </button>

          {/* Selected tag chips */}
          {selectedTagIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selectedTagIds.map((id) => {
                const tag = tags.find((t) => t.id === id);
                if (!tag) return null;
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                    style={{ backgroundColor: tag.color || "#00a884" }}
                  >
                    {tag.name}
                    <button
                      onClick={() => toggleTag(id)}
                      className="opacity-70 hover:opacity-100"
                    >
                      <X size={9} />
                    </button>
                  </span>
                );
              })}
              <button
                onClick={() => onTagFilterChange([])}
                className="text-[10px] text-[#8696a0] hover:text-[#e9edef] px-1 py-0.5"
              >
                Limpiar
              </button>
            </div>
          )}

          {/* Dropdown */}
          {showTagDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#202c33] border border-[#2a3942] rounded-xl shadow-xl z-30 overflow-hidden">
              {tags.length === 0 ? (
                <p className="text-[#8696a0] text-xs p-3 text-center">
                  Sin tags — creá una en Configuración
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto">
                  {tags.map((tag) => {
                    const isOn = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#2a3942] transition-colors text-left"
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isOn ? "border-transparent" : "border-[#8696a0]"
                          }`}
                          style={isOn ? { backgroundColor: tag.color || "#00a884" } : {}}
                        >
                          {isOn && (
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        {/* Color dot */}
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color || "#00a884" }}
                        />
                        <span className="text-[#e9edef] text-xs truncate">{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
