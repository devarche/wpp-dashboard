"use client";

import { useCallback, useEffect, useState } from "react";
import { Tag as TagIcon, Trash2, Plus } from "lucide-react";
import type { Tag } from "@/types";

const TAG_COLORS = [
  "#00a884", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function SettingsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setTags(data.tags ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreate = async () => {
    const name = newTagName.trim();
    if (!name || creating) return;

    const tempId = `optimistic-${Date.now()}`;
    const tempTag: Tag = { id: tempId, name, color: selectedColor, created_by: null, created_at: new Date().toISOString() };

    setTags((prev) => [...prev, tempTag].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName("");
    setCreating(true);

    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: selectedColor }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setTags((prev) => prev.map((t) => (t.id === tempId ? (data.tag as Tag) : t)));
    } catch {
      setTags((prev) => prev.filter((t) => t.id !== tempId));
      setNewTagName(name);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tagId: string) => {
    const prev = tags;
    setDeletingId(tagId);
    setTags((t) => t.filter((tag) => tag.id !== tagId));

    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setTags(prev);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full bg-[#0b141a] overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-[#e9edef] text-xl font-semibold mb-8">Configuración</h1>

        {/* Tags section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TagIcon size={16} className="text-[#00a884]" />
            <h2 className="text-[#e9edef] font-medium">Tags</h2>
          </div>

          {/* Create new tag */}
          <div className="bg-[#202c33] rounded-xl p-4 mb-4 border border-[#2a3942]">
            <p className="text-[#8696a0] text-xs mb-3">Nueva tag</p>

            {/* Color picker */}
            <div className="flex gap-2 mb-3">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full flex-shrink-0 transition-transform ${
                    selectedColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-[#202c33] scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {/* Name + button */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
                placeholder="Nombre de la tag…"
                className="flex-1 bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newTagName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: selectedColor }}
              >
                <Plus size={15} />
                Crear
              </button>
            </div>

            {/* Preview */}
            {newTagName.trim() && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[#8696a0] text-xs">Preview:</span>
                <span
                  className="text-xs px-2 py-0.5 rounded text-white font-medium"
                  style={{ backgroundColor: selectedColor }}
                >
                  {newTagName.trim()}
                </span>
              </div>
            )}
          </div>

          {/* Tag list */}
          <div className="bg-[#202c33] rounded-xl border border-[#2a3942] overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-[#8696a0] text-sm">Cargando…</div>
            ) : tags.length === 0 ? (
              <div className="p-6 text-center text-[#8696a0] text-sm">
                Aún no hay tags creadas
              </div>
            ) : (
              tags.map((tag, i) => (
                <div
                  key={tag.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < tags.length - 1 ? "border-b border-[#2a3942]" : ""
                  }`}
                >
                  {/* Color dot */}
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color || "#00a884" }}
                  />

                  {/* Name pill */}
                  <span
                    className="text-xs px-2 py-0.5 rounded text-white font-medium"
                    style={{ backgroundColor: tag.color || "#00a884" }}
                  >
                    {tag.name}
                  </span>

                  <span className="flex-1" />

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(tag.id)}
                    disabled={deletingId === tag.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8696a0] hover:bg-red-900/30 hover:text-red-400 transition-colors disabled:opacity-40"
                    title="Eliminar tag"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
