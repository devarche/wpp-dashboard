"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Eye,
  Megaphone,
  MessageSquare,
  Plus,
  Send,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Campaign, MetaTemplate } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  [col: string]: string;
}

interface ColumnMapping {
  phoneCol: string;
  variables: Record<string, string>; // varKey → CSV column name
}

// Per-component variable descriptor — each WhatsApp component type needs its own parameters block
interface TemplateVarKey {
  label: string;       // Human-readable: "Header {{1}}", "Cuerpo {{1}}", "Botón URL «Ver más» {{1}}"
  key: string;         // Unique key used in ColumnMapping.variables: "header_1", "body_1", "button_0_1"
  componentType: "header" | "body" | "button";
  varNum: number;
  buttonIndex?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

// Extract variables per component so we can build the correct WhatsApp API components array
function extractAllTemplateVars(template: MetaTemplate): TemplateVarKey[] {
  const vars: TemplateVarKey[] = [];

  for (const component of template.components ?? []) {
    const type = component.type.toUpperCase();

    if (type === "HEADER" && component.format === "TEXT" && component.text) {
      const nums = new Set<number>();
      for (const m of component.text.matchAll(/\{\{(\d+)\}\}/g)) {
        const n = parseInt(m[1]);
        if (!nums.has(n)) { nums.add(n); vars.push({ label: `Header {{${n}}}`, key: `header_${n}`, componentType: "header", varNum: n }); }
      }
    }

    if (type === "BODY" && component.text) {
      const nums = new Set<number>();
      for (const m of component.text.matchAll(/\{\{(\d+)\}\}/g)) {
        const n = parseInt(m[1]);
        if (!nums.has(n)) { nums.add(n); vars.push({ label: `Cuerpo {{${n}}}`, key: `body_${n}`, componentType: "body", varNum: n }); }
      }
    }

    if (type === "BUTTONS" && component.buttons) {
      component.buttons.forEach((btn, idx) => {
        // Same detection as SendTemplateModal: url_type DYNAMIC, OR has example array, OR URL contains {{
        const isDynamicUrl =
          btn.type === "URL" &&
          (btn.url_type === "DYNAMIC" ||
            Array.isArray(btn.example) ||
            (btn.url ?? "").includes("{{"));
        if (isDynamicUrl) {
          vars.push({ label: `Botón URL "${btn.text}" {{1}}`, key: `button_${idx}_1`, componentType: "button", varNum: 1, buttonIndex: idx });
        }
      });
    }
  }

  return vars;
}

function statusBadge(status: Campaign["status"]) {
  const map: Record<Campaign["status"], { label: string; cls: string }> = {
    draft:     { label: "Borrador", cls: "bg-[#2a3942] text-[#8696a0]" },
    running:   { label: "Enviando", cls: "bg-blue-900/40 text-blue-400" },
    paused:    { label: "Pausada",  cls: "bg-amber-900/40 text-amber-400" },
    completed: { label: "Completa", cls: "bg-[#00a884]/20 text-[#00a884]" },
  };
  const { label, cls } = map[status] ?? map.draft;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center bg-[#2a3942] rounded-lg px-3 py-2 min-w-[64px]">
      <div className="text-[#8696a0] mb-0.5">{icon}</div>
      <span className="text-[#e9edef] font-semibold text-sm">{value}</span>
      <span className="text-[#8696a0] text-[10px]">{label}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Send panel
  const [sendCampaignId, setSendCampaignId] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ phoneCol: "", variables: {} });
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; failures?: { phone: string; error: string }[] } | null>(null);
  const [sendPartial, setSendPartial] = useState(false);
  const [sendCount, setSendCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) =>
        setTemplates(
          (d.data ?? []).filter((t: MetaTemplate) => t.status === "APPROVED")
        )
      );
  }, [fetchCampaigns]);

  // ── Create campaign ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim() || !selectedTemplate || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          template: {
            meta_id: selectedTemplate.id,
            name: selectedTemplate.name,
            language: selectedTemplate.language,
            category: selectedTemplate.category,
            components: selectedTemplate.components,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("Create campaign failed:", err);
        return;
      }
      const data = await res.json();
      setCampaigns((prev) => [data.campaign as Campaign, ...prev]);
      setShowCreate(false);
      setNewName("");
      setSelectedTemplate(null);
    } finally {
      setCreating(false);
    }
  };

  // ── Delete campaign ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        setConfirmDeleteId(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── CSV upload & parse ──────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      const autoPhone =
        headers.find((h) =>
          /phone|tel[eé]fono|telefono|celular|whatsapp|number|n[uú]mero/i.test(h)
        ) ??
        headers[0] ??
        "";
      setColumnMapping({ phoneCol: autoPhone, variables: {} });
      setShowPreview(false);
      setSendResult(null);
      setSendPartial(false);
      setSendCount(rows.length);
    };
    reader.readAsText(file);
  };

  const openSendPanel = (campaignId: string) => {
    setSendCampaignId(campaignId);
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({ phoneCol: "", variables: {} });
    setShowPreview(false);
    setSendResult(null);
    setSendPartial(false);
    setSendCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Build recipients — produces the correct WhatsApp API components array ───
  function buildRecipients(campaign: Campaign, rows: ParsedRow[]) {
    // Match by name because campaign.template_id is a local UUID, not a Meta ID
    const tmpl = templates.find((t) => t.name === campaign.template?.name);
    const varKeys = tmpl ? extractAllTemplateVars(tmpl) : [];

    const headerVars = varKeys.filter(v => v.componentType === "header").sort((a, b) => a.varNum - b.varNum);
    const bodyVars   = varKeys.filter(v => v.componentType === "body").sort((a, b) => a.varNum - b.varNum);
    const buttonVars = varKeys.filter(v => v.componentType === "button");

    return rows
      .map((row) => {
        const phone = (row[columnMapping.phoneCol] ?? "").replace(/\D/g, "");
        if (!phone) return null;

        const components: unknown[] = [];

        if (headerVars.length > 0) {
          components.push({
            type: "header",
            parameters: headerVars.map(v => ({ type: "text", text: row[columnMapping.variables[v.key] ?? ""] ?? "" })),
          });
        }
        if (bodyVars.length > 0) {
          components.push({
            type: "body",
            parameters: bodyVars.map(v => ({ type: "text", text: row[columnMapping.variables[v.key] ?? ""] ?? "" })),
          });
        }
        for (const bv of buttonVars) {
          components.push({
            type: "button",
            sub_type: "url",
            index: bv.buttonIndex ?? 0,
            parameters: [{ type: "text", text: row[columnMapping.variables[bv.key] ?? ""] ?? "" }],
          });
        }

        return { phone, components: components.length > 0 ? components : undefined };
      })
      .filter(Boolean);
  }

  // ── Send campaign ───────────────────────────────────────────────────────────
  const handleSend = async (campaign: Campaign) => {
    if (!columnMapping.phoneCol || csvRows.length === 0 || sending) return;
    setSending(true);
    setSendResult(null);

    const rowsToSend = sendPartial ? csvRows.slice(0, sendCount) : csvRows;
    const recipients = buildRecipients(campaign, rowsToSend);

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, partial: sendPartial }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ sent: data.sent, failed: data.failed, failures: data.failures });
        await fetchCampaigns();
      }
    } finally {
      setSending(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────────
  const selectedCampaign = campaigns.find((c) => c.id === sendCampaignId) ?? null;
  const activeCampaignTemplate = selectedCampaign
    ? templates.find((t) => t.name === selectedCampaign.template?.name)
    : null;
  const templateVars = activeCampaignTemplate ? extractAllTemplateVars(activeCampaignTemplate) : [];
  const effectiveSendCount = sendPartial ? Math.min(sendCount, csvRows.length) : csvRows.length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-[#0b141a] overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Megaphone size={22} className="text-[#00a884]" />
            <h1 className="text-[#e9edef] text-xl font-semibold">Campañas</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00a884] text-white text-sm font-medium hover:bg-[#06cf9c] transition-colors"
          >
            <Plus size={15} />
            Nueva campaña
          </button>
        </div>

        {/* Campaign list */}
        {loading ? (
          <p className="text-[#8696a0] text-sm text-center py-16">Cargando…</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16">
            <Megaphone size={40} className="text-[#2a3942] mx-auto mb-3" />
            <p className="text-[#8696a0] text-sm">No hay campañas aún</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-[#202c33] rounded-xl border border-[#2a3942] overflow-hidden"
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === campaign.id ? null : campaign.id)
                    }
                    className="text-[#8696a0] hover:text-[#e9edef] transition-colors flex-shrink-0"
                  >
                    {expandedId === campaign.id ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>

                  {/* Name + tag color */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: campaign.tag?.color ?? "#00a884" }}
                    />
                    <span className="text-[#e9edef] font-medium text-sm truncate">
                      {campaign.name}
                    </span>
                  </div>

                  {/* Template name */}
                  <span className="text-[#8696a0] text-xs hidden md:block truncate max-w-[110px]">
                    {campaign.template?.name ?? "—"}
                  </span>

                  {statusBadge(campaign.status)}

                  {/* Stats */}
                  <div className="flex gap-1.5">
                    <StatBox label="Enviados" value={campaign.sent_count} icon={<Send size={11} />} />
                    <StatBox label="Leídos" value={campaign.read_count} icon={<CheckCheck size={11} />} />
                    <StatBox label="Replies" value={campaign.replied_count} icon={<MessageSquare size={11} />} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {campaign.tag && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded text-white font-medium"
                        style={{ backgroundColor: campaign.tag.color ?? "#00a884" }}
                      >
                        <TagIcon size={8} className="inline mr-0.5" />
                        {campaign.tag.name}
                      </span>
                    )}
                    {campaign.status === "draft" && (
                      <>
                        <button
                          onClick={() => openSendPanel(campaign.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00a884] text-white text-xs font-medium hover:bg-[#06cf9c] transition-colors"
                        >
                          <Send size={12} />
                          {campaign.sent_count > 0 ? "Continuar" : "Enviar"}
                        </button>

                        {confirmDeleteId === campaign.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(campaign.id)}
                              disabled={deleting}
                              className="text-[11px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium disabled:opacity-40"
                            >
                              {deleting ? "…" : "Eliminar"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] px-2 py-1 text-[#8696a0] hover:text-[#e9edef]"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(campaign.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-[#8696a0] hover:text-red-400 transition-colors"
                            title="Eliminar campaña"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === campaign.id && (
                  <div className="border-t border-[#2a3942] px-5 py-3 text-xs text-[#8696a0] space-y-1">
                    <p>
                      Template:{" "}
                      <span className="text-[#e9edef]">
                        {campaign.template?.name} ({campaign.template?.language})
                      </span>
                    </p>
                    <p>
                      Creada:{" "}
                      <span className="text-[#e9edef]">
                        {new Date(campaign.created_at).toLocaleString()}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { setShowCreate(false); setSelectedTemplate(null); setNewName(""); }}
        >
          <div
            className="bg-[#202c33] rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-[#2a3942]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[#e9edef] font-semibold">Nueva campaña</h2>
              <button onClick={() => setShowCreate(false)}>
                <X size={18} className="text-[#8696a0]" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[#8696a0] text-xs block mb-1">Nombre</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="Ej: Promo Enero 2026"
                  className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="text-[#8696a0] text-xs block mb-1">Template</label>
                <select
                  value={selectedTemplate?.id ?? ""}
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === e.target.value) ?? null;
                    setSelectedTemplate(t);
                  }}
                  className="w-full bg-[#2a3942] text-[#e9edef] rounded-lg px-3 py-2 text-sm outline-none"
                >
                  <option value="">— Seleccioná un template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-[#8696a0] text-sm hover:text-[#e9edef]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !selectedTemplate}
                className="px-4 py-2 rounded-lg bg-[#00a884] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#06cf9c] transition-colors"
              >
                {creating ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send panel (slide-over) ───────────────────────────────────────── */}
      {sendCampaignId && selectedCampaign && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60" onClick={() => setSendCampaignId(null)} />
          <div className="w-full max-w-xl bg-[#111b21] border-l border-[#2a3942] flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a3942] flex-shrink-0">
              <div>
                <h2 className="text-[#e9edef] font-semibold">{selectedCampaign.name}</h2>
                <p className="text-[#8696a0] text-xs mt-0.5">
                  Template: {selectedCampaign.template?.name}
                </p>
              </div>
              <button onClick={() => setSendCampaignId(null)}>
                <X size={18} className="text-[#8696a0]" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Already sent info */}
              {selectedCampaign.sent_count > 0 && (
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl px-4 py-3">
                  <p className="text-blue-400 text-sm font-medium">
                    Ya enviados: {selectedCampaign.sent_count} mensajes
                  </p>
                  <p className="text-[#8696a0] text-xs mt-0.5">
                    Subí un CSV con los contactos restantes para continuar.
                  </p>
                </div>
              )}

              {/* Step 1 — Upload CSV */}
              <section>
                <h3 className="text-[#e9edef] text-sm font-medium mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">1</span>
                  Subir CSV
                </h3>
                <div
                  className="border-2 border-dashed border-[#2a3942] rounded-xl p-6 text-center cursor-pointer hover:border-[#00a884]/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={22} className="text-[#8696a0] mx-auto mb-2" />
                  {csvRows.length > 0 ? (
                    <p className="text-[#00a884] text-sm font-medium">
                      {csvRows.length} contactos cargados
                    </p>
                  ) : (
                    <p className="text-[#8696a0] text-sm">Hacé clic para subir un CSV</p>
                  )}
                  {csvHeaders.length > 0 && (
                    <p className="text-[#8696a0] text-xs mt-1">
                      Columnas: {csvHeaders.join(", ")}
                    </p>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </section>

              {/* Step 2 — Column mapping */}
              {csvHeaders.length > 0 && (
                <section>
                  <h3 className="text-[#e9edef] text-sm font-medium mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">2</span>
                    Mapear columnas
                  </h3>

                  <div className="bg-[#202c33] rounded-xl border border-[#2a3942] p-4 space-y-3">
                    {/* Phone */}
                    <div className="flex items-center gap-3">
                      <span className="text-[#e9edef] text-xs w-32 flex-shrink-0 font-medium">
                        📱 Teléfono *
                      </span>
                      <select
                        value={columnMapping.phoneCol}
                        onChange={(e) =>
                          setColumnMapping((m) => ({ ...m, phoneCol: e.target.value }))
                        }
                        className="flex-1 bg-[#2a3942] text-[#e9edef] rounded-lg px-3 py-1.5 text-xs outline-none"
                      >
                        <option value="">— elegí columna —</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Template variables */}
                    {templateVars.length > 0 ? (
                      <div className="border-t border-[#2a3942] pt-3">
                        <p className="text-[#8696a0] text-[11px] mb-2">
                          Variables del template:
                        </p>
                        {templateVars.map((v) => (
                          <div key={v.key} className="flex items-center gap-3 mt-2">
                            <span className="text-[#e9edef] text-xs w-40 flex-shrink-0 font-mono bg-[#2a3942] rounded px-2 py-1 text-center truncate" title={v.label}>
                              {v.label}
                            </span>
                            <select
                              value={columnMapping.variables[v.key] ?? ""}
                              onChange={(e) =>
                                setColumnMapping((m) => ({
                                  ...m,
                                  variables: { ...m.variables, [v.key]: e.target.value },
                                }))
                              }
                              className="flex-1 bg-[#2a3942] text-[#e9edef] rounded-lg px-3 py-1.5 text-xs outline-none"
                            >
                              <option value="">— elegí columna —</option>
                              {csvHeaders.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[#8696a0] text-xs pt-1">
                        Este template no tiene variables de texto.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Step 3 — Cantidad a enviar */}
              {csvRows.length > 0 && (
                <section>
                  <h3 className="text-[#e9edef] text-sm font-medium mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">3</span>
                    Cantidad a enviar
                  </h3>

                  <div className="bg-[#202c33] rounded-xl border border-[#2a3942] p-4 space-y-3">
                    {/* Toggle */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSendPartial(false); setSendCount(csvRows.length); }}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                          !sendPartial
                            ? "bg-[#00a884] text-white"
                            : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
                        }`}
                      >
                        Todos ({csvRows.length})
                      </button>
                      <button
                        onClick={() => setSendPartial(true)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                          sendPartial
                            ? "bg-[#00a884] text-white"
                            : "bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef]"
                        }`}
                      >
                        Parcial
                      </button>
                    </div>

                    {/* Partial count input */}
                    {sendPartial && (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-[#8696a0] text-xs">Enviar primeros</span>
                          <input
                            type="number"
                            min={1}
                            max={csvRows.length}
                            value={sendCount}
                            onChange={(e) =>
                              setSendCount(Math.min(Math.max(1, parseInt(e.target.value) || 1), csvRows.length))
                            }
                            className="w-24 bg-[#2a3942] text-[#e9edef] rounded-lg px-3 py-1.5 text-sm outline-none text-center"
                          />
                          <span className="text-[#8696a0] text-xs">de {csvRows.length}</span>
                        </div>
                        <p className="text-[#8696a0] text-[11px]">
                          La campaña quedará en Borrador. Próximo envío: subí el CSV con las filas {effectiveSendCount + 1} en adelante.
                        </p>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* Step 4 — Preview */}
              {csvRows.length > 0 && columnMapping.phoneCol && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[#e9edef] text-sm font-medium flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">4</span>
                      Preview
                    </h3>
                    <button
                      onClick={() => setShowPreview((v) => !v)}
                      className="text-[#8696a0] text-xs flex items-center gap-1 hover:text-[#e9edef]"
                    >
                      <Eye size={12} />
                      {showPreview ? "Ocultar" : "Ver primeras filas"}
                    </button>
                  </div>

                  {showPreview && (
                    <div className="bg-[#202c33] rounded-xl border border-[#2a3942] overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#2a3942]">
                            <th className="text-left text-[#8696a0] px-3 py-2 whitespace-nowrap">
                              Teléfono
                            </th>
                            {templateVars.map((v) => (
                              <th key={v.key} className="text-left text-[#8696a0] px-3 py-2 font-mono whitespace-nowrap">
                                {v.label} → {columnMapping.variables[v.key] || "—"}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(sendPartial ? csvRows.slice(0, Math.min(effectiveSendCount, 5)) : csvRows.slice(0, 5)).map((row, i) => (
                            <tr key={i} className="border-b border-[#2a3942]/50 last:border-0">
                              <td className="text-[#e9edef] px-3 py-2 whitespace-nowrap">
                                {row[columnMapping.phoneCol] || (
                                  <span className="text-red-400">—</span>
                                )}
                              </td>
                              {templateVars.map((v) => (
                                <td key={v.key} className="text-[#e9edef] px-3 py-2 whitespace-nowrap">
                                  {columnMapping.variables[v.key]
                                    ? row[columnMapping.variables[v.key]]
                                    : <span className="text-[#8696a0]">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {effectiveSendCount > 5 && (
                        <p className="text-[#8696a0] text-[11px] px-3 py-2">
                          + {effectiveSendCount - 5} filas más
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Result */}
              {sendResult && (
                <div className="space-y-2">
                  <div className="bg-[#00a884]/10 border border-[#00a884]/30 rounded-xl px-4 py-3">
                    <p className="text-[#00a884] text-sm font-medium">
                      ✓ {sendResult.sent} mensajes enviados
                      {sendResult.failed > 0 && (
                        <span className="text-red-400 ml-1">· {sendResult.failed} fallidos</span>
                      )}
                    </p>
                    <p className="text-[#8696a0] text-xs mt-1">
                      Las conversaciones aparecerán en Archivados → filtro por tag &quot;{selectedCampaign.name}&quot;. Cuando un contacto responda, la conversación volverá a Activos automáticamente.
                    </p>
                  </div>
                  {sendResult.failures && sendResult.failures.length > 0 && (
                    <div className="bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3">
                      <p className="text-red-400 text-xs font-medium mb-2">Errores:</p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {sendResult.failures.map((f, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-[#e9edef] font-mono">{f.phone}</span>
                            <span className="text-[#8696a0] mx-1">—</span>
                            <span className="text-red-300">{f.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div className="px-5 py-4 border-t border-[#2a3942] flex-shrink-0">
              {sending ? (
                <div className="w-full py-2.5 rounded-lg bg-[#00a884]/20 text-[#00a884] text-sm text-center animate-pulse">
                  Enviando {effectiveSendCount} mensajes… esto puede tardar unos minutos
                </div>
              ) : sendResult ? (
                <button
                  onClick={() => setSendCampaignId(null)}
                  className="w-full py-2.5 rounded-lg bg-[#2a3942] text-[#e9edef] text-sm font-medium"
                >
                  Cerrar
                </button>
              ) : (
                <button
                  onClick={() => handleSend(selectedCampaign)}
                  disabled={!columnMapping.phoneCol || csvRows.length === 0}
                  className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#06cf9c] transition-colors flex items-center justify-center gap-2"
                >
                  <Send size={15} />
                  Enviar a {effectiveSendCount} contactos
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
