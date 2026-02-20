"use client";

import { useState, useMemo } from "react";
import { X, Send, CheckCircle } from "lucide-react";
import type { MetaTemplate, MetaTemplateComponent } from "@/types";

interface Props {
  template: MetaTemplate;
  onClose: () => void;
}

function extractVarIndices(text: string): number[] {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  return [...new Set(matches.map((m) => parseInt(m[1])))].sort((a, b) => a - b);
}

function replaceVars(text: string, vars: Record<number, string>) {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[parseInt(n)] || `{{${n}}}`);
}

export default function SendTemplateModal({ template, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Parse template components
  const headerComp = template.components?.find((c) => c.type === "HEADER");
  const bodyComp = template.components?.find((c) => c.type === "BODY");
  const footerComp = template.components?.find((c) => c.type === "FOOTER");
  const buttonsComp = template.components?.find((c) => c.type === "BUTTONS");

  // Detect variables in header (text only)
  const headerVarIndices = useMemo(
    () => (headerComp?.format === "TEXT" && headerComp.text ? extractVarIndices(headerComp.text) : []),
    [headerComp]
  );

  // Detect variables in body
  const bodyVarIndices = useMemo(
    () => (bodyComp?.text ? extractVarIndices(bodyComp.text) : []),
    [bodyComp]
  );

  // Detect dynamic URL buttons (have {{1}} in URL or url_type === "DYNAMIC")
  const dynamicButtons = useMemo(
    () =>
      (buttonsComp?.buttons ?? [])
        .map((btn, idx) => ({ ...btn, idx }))
        .filter(
          (btn) =>
            btn.type === "URL" &&
            (btn.url_type === "DYNAMIC" || (btn.url ?? "").includes("{{"))
        ),
    [buttonsComp]
  );

  const hasVars =
    headerVarIndices.length > 0 ||
    bodyVarIndices.length > 0 ||
    dynamicButtons.length > 0;

  // State for each variable value
  const [headerVars, setHeaderVars] = useState<Record<number, string>>({});
  const [bodyVars, setBodyVars] = useState<Record<number, string>>({});
  const [buttonVars, setButtonVars] = useState<Record<number, string>>({});

  // Build preview with current values
  const bodyPreview = bodyComp?.text ? replaceVars(bodyComp.text, bodyVars) : "";

  // Build the components array for Meta API
  function buildComponents() {
    const comps = [];

    if (headerVarIndices.length > 0) {
      comps.push({
        type: "header",
        parameters: headerVarIndices.map((n) => ({
          type: "text",
          text: headerVars[n] ?? "",
        })),
      });
    }

    if (bodyVarIndices.length > 0) {
      comps.push({
        type: "body",
        parameters: bodyVarIndices.map((n) => ({
          type: "text",
          text: bodyVars[n] ?? "",
        })),
      });
    }

    dynamicButtons.forEach((btn) => {
      comps.push({
        type: "button",
        sub_type: "url",
        index: btn.idx,
        parameters: [{ type: "text", text: buttonVars[btn.idx] ?? "" }],
      });
    });

    return comps.length > 0 ? comps : undefined;
  }

  const handleSend = async () => {
    const cleaned = phone.trim().replace(/\D/g, "");
    if (!cleaned) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleaned,
          templateName: template.name,
          language: template.language,
          components: buildComponents(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send template");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#202c33] rounded-2xl p-6 w-full max-w-md border border-[#2a3942] shadow-2xl my-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-[#e9edef] font-semibold">Send Template</h2>
          <button
            onClick={onClose}
            className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Template preview */}
        <div className="bg-[#111b21] rounded-xl p-4 mb-5 space-y-1">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[#e9edef] font-medium text-sm">{template.name}</p>
            <span className="text-[#8696a0] text-xs">{template.language}</span>
          </div>
          {headerComp?.format === "TEXT" && headerComp.text && (
            <p className="text-[#e9edef] text-xs font-semibold">
              {replaceVars(headerComp.text, headerVars)}
            </p>
          )}
          {headerComp?.format && headerComp.format !== "TEXT" && (
            <p className="text-[#8696a0] text-xs italic">[{headerComp.format}]</p>
          )}
          {bodyComp?.text && (
            <p className="text-[#8696a0] text-xs leading-relaxed whitespace-pre-wrap">
              {bodyPreview}
            </p>
          )}
          {footerComp?.text && (
            <p className="text-[#8696a0] text-xs italic mt-1">{footerComp.text}</p>
          )}
          {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {buttonsComp.buttons.map((btn, i) => (
                <span
                  key={i}
                  className="text-[#00a884] text-xs border border-[#2a3942] rounded px-2 py-0.5"
                >
                  {btn.text}
                </span>
              ))}
            </div>
          )}
        </div>

        {success ? (
          <div className="text-center py-4">
            <CheckCircle size={36} className="text-[#00a884] mx-auto mb-3" />
            <p className="text-[#e9edef] font-medium">Template sent!</p>
            <button
              onClick={onClose}
              className="mt-4 text-[#8696a0] hover:text-[#e9edef] text-sm transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Phone number */}
            <div className="mb-4">
              <label className="block text-[#8696a0] text-sm mb-2">
                Phone number (with country code)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 5491112345678"
                className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-4 py-2.5 outline-none focus:ring-2 ring-[#00a884] transition-shadow text-sm"
                autoFocus
              />
              <p className="text-[#8696a0] text-xs mt-1">Digits only, no + or spaces</p>
            </div>

            {/* Header variables */}
            {headerVarIndices.length > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Header variables</p>
                {headerVarIndices.map((n) => (
                  <div key={n} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">{`{{${n}}}`}</label>
                    <input
                      type="text"
                      value={headerVars[n] ?? ""}
                      onChange={(e) =>
                        setHeaderVars((prev) => ({ ...prev, [n]: e.target.value }))
                      }
                      placeholder={`Value for {{${n}}}`}
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Body variables */}
            {bodyVarIndices.length > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Body variables</p>
                {bodyVarIndices.map((n) => (
                  <div key={n} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">{`{{${n}}}`}</label>
                    <input
                      type="text"
                      value={bodyVars[n] ?? ""}
                      onChange={(e) =>
                        setBodyVars((prev) => ({ ...prev, [n]: e.target.value }))
                      }
                      placeholder={`Value for {{${n}}}`}
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Dynamic URL button variables */}
            {dynamicButtons.length > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Button URL suffix</p>
                {dynamicButtons.map((btn) => (
                  <div key={btn.idx} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">
                      {btn.text} — <span className="text-[#8696a0]">{btn.url}</span>
                    </label>
                    <input
                      type="text"
                      value={buttonVars[btn.idx] ?? ""}
                      onChange={(e) =>
                        setButtonVars((prev) => ({ ...prev, [btn.idx]: e.target.value }))
                      }
                      placeholder="URL suffix / dynamic value"
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending || !phone.trim()}
              className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#06cf9c] text-white py-2.5 px-4 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={15} />
              {sending ? "Sending…" : "Send"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
