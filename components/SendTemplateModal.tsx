"use client";

import { useState, useMemo } from "react";
import { X, Send, CheckCircle } from "lucide-react";
import type { MetaTemplate, MetaTemplateComponent } from "@/types";

interface Props {
  template: MetaTemplate;
  onClose: () => void;
}

/** Extract unique variable names in order of appearance (supports {{1}} and {{name}}) */
function extractVarNames(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); result.push(m[1]); }
  }
  return result;
}

/** Returns ordered list of variable names for a component */
function getVarNames(comp: MetaTemplateComponent, field: "body" | "header"): string[] {
  const exampleCount =
    field === "body"
      ? (comp.example?.body_text?.[0]?.length ?? 0)
      : (comp.example?.header_text?.length ?? 0);

  if (exampleCount > 0) {
    // Prefer names from text when count matches
    const fromText = comp.text ? extractVarNames(comp.text) : [];
    if (fromText.length === exampleCount) return fromText;
    return Array.from({ length: exampleCount }, (_, i) => String(i + 1));
  }
  // No examples — parse text for any {{...}}
  return comp.text ? extractVarNames(comp.text) : [];
}

function replaceVars(text: string, names: string[], vals: string[]): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
    const idx = names.indexOf(varName);
    return idx >= 0 ? (vals[idx] || `{{${varName}}}`) : `{{${varName}}}`;
  });
}

export default function SendTemplateModal({ template, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const headerComp = template.components?.find((c) => c.type === "HEADER");
  const bodyComp = template.components?.find((c) => c.type === "BODY");
  const footerComp = template.components?.find((c) => c.type === "FOOTER");
  const buttonsComp = template.components?.find((c) => c.type === "BUTTONS");

  // Variable names per section (supports {{1}} and {{name}})
  const headerVarNames = useMemo(
    () => (headerComp?.format === "TEXT" && headerComp ? getVarNames(headerComp, "header") : []),
    [headerComp]
  );
  const bodyVarNames = useMemo(
    () => (bodyComp ? getVarNames(bodyComp, "body") : []),
    [bodyComp]
  );
  const headerVarCount = headerVarNames.length;
  const bodyVarCount = bodyVarNames.length;

  // Example placeholder values from Meta
  const headerExamples = useMemo(
    () => headerComp?.example?.header_text ?? [],
    [headerComp]
  );
  const bodyExamples = useMemo(
    () => bodyComp?.example?.body_text?.[0] ?? [],
    [bodyComp]
  );

  // Dynamic URL buttons: url_type DYNAMIC, or has example, or URL contains {{
  const dynamicButtons = useMemo(
    () =>
      (buttonsComp?.buttons ?? [])
        .map((btn, idx) => ({ ...btn, idx }))
        .filter(
          (btn) =>
            btn.type === "URL" &&
            (btn.url_type === "DYNAMIC" ||
              Array.isArray(btn.example) ||
              (btn.url ?? "").includes("{{"))
        ),
    [buttonsComp]
  );

  const hasVars = headerVarCount > 0 || bodyVarCount > 0 || dynamicButtons.length > 0;

  // State: arrays indexed 0..N-1
  const [headerVals, setHeaderVals] = useState<string[]>([]);
  const [bodyVals, setBodyVals] = useState<string[]>([]);
  const [buttonVals, setButtonVals] = useState<Record<number, string>>({});

  // Live preview
  const bodyPreview =
    bodyComp?.text && bodyVarCount > 0
      ? replaceVars(bodyComp.text, bodyVarNames, bodyVals)
      : bodyComp?.text ?? "";

  function buildComponents() {
    const comps = [];

    // Named variables (non-numeric) require parameter_name in the API call
    function makeParam(varName: string, value: string) {
      const isNamed = isNaN(parseInt(varName, 10));
      return isNamed
        ? { type: "text", parameter_name: varName, text: value }
        : { type: "text", text: value };
    }

    if (headerVarCount > 0) {
      comps.push({
        type: "header",
        parameters: headerVarNames.map((varName, i) => makeParam(varName, headerVals[i] ?? "")),
      });
    }

    if (bodyVarCount > 0) {
      comps.push({
        type: "body",
        parameters: bodyVarNames.map((varName, i) => makeParam(varName, bodyVals[i] ?? "")),
      });
    }

    dynamicButtons.forEach((btn) => {
      comps.push({
        type: "button",
        sub_type: "url",
        index: btn.idx,
        parameters: [{ type: "text", text: buttonVals[btn.idx] ?? "" }],
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
      const components = buildComponents();
      const res = await fetch("/api/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleaned,
          templateName: template.name,
          language: template.language,
          components,
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
          <button onClick={onClose} className="text-[#8696a0] hover:text-[#e9edef] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Preview */}
        <div className="bg-[#111b21] rounded-xl p-4 mb-5 space-y-1">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[#e9edef] font-medium text-sm">{template.name}</p>
            <span className="text-[#8696a0] text-xs">{template.language}</span>
          </div>
          {headerComp?.format === "TEXT" && headerComp.text && (
            <p className="text-[#e9edef] text-xs font-semibold">
              {headerVarCount > 0 ? replaceVars(headerComp.text, headerVarNames, headerVals) : headerComp.text}
            </p>
          )}
          {headerComp?.format && headerComp.format !== "TEXT" && (
            <p className="text-[#8696a0] text-xs italic">[{headerComp.format}]</p>
          )}
          {bodyComp?.text && (
            <p className="text-[#8696a0] text-xs leading-relaxed whitespace-pre-wrap">{bodyPreview}</p>
          )}
          {footerComp?.text && (
            <p className="text-[#8696a0] text-xs italic mt-1">{footerComp.text}</p>
          )}
          {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {buttonsComp.buttons.map((btn, i) => (
                <span key={i} className="text-[#00a884] text-xs border border-[#2a3942] rounded px-2 py-0.5">
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
            <button onClick={onClose} className="mt-4 text-[#8696a0] hover:text-[#e9edef] text-sm transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Phone */}
            <div className="mb-4">
              <label className="block text-[#8696a0] text-sm mb-2">Phone number (with country code)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 5491112345678"
                className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-4 py-2.5 outline-none focus:ring-2 ring-[#00a884] text-sm"
                autoFocus
              />
              <p className="text-[#8696a0] text-xs mt-1">Digits only, no + or spaces</p>
            </div>

            {/* Header vars */}
            {headerVarCount > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Header variables</p>
                {headerVarNames.map((varName, i) => (
                  <div key={varName} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">{varName}</label>
                    <input
                      type="text"
                      value={headerVals[i] ?? ""}
                      onChange={(e) =>
                        setHeaderVals((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      placeholder={headerExamples[i] ?? `Value for ${varName}`}
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Body vars */}
            {bodyVarCount > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Body variables</p>
                {bodyVarNames.map((varName, i) => (
                  <div key={varName} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">{varName}</label>
                    <input
                      type="text"
                      value={bodyVals[i] ?? ""}
                      onChange={(e) =>
                        setBodyVals((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      placeholder={bodyExamples[i] ?? `Value for ${varName}`}
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Dynamic button URL vars */}
            {dynamicButtons.length > 0 && (
              <div className="mb-4">
                <p className="text-[#8696a0] text-xs mb-2 uppercase tracking-wide">Button URL suffix</p>
                {dynamicButtons.map((btn) => (
                  <div key={btn.idx} className="mb-2">
                    <label className="block text-[#8696a0] text-xs mb-1">
                      {btn.text}
                      {btn.url && <span className="ml-1 opacity-50">{btn.url}</span>}
                    </label>
                    <input
                      type="text"
                      value={buttonVals[btn.idx] ?? ""}
                      onChange={(e) =>
                        setButtonVals((prev) => ({ ...prev, [btn.idx]: e.target.value }))
                      }
                      placeholder={btn.example?.[0] ?? "URL suffix"}
                      className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2 outline-none focus:ring-2 ring-[#00a884] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {!hasVars && (
              <p className="text-[#8696a0] text-xs mb-4 italic">
                This template has no variables.
              </p>
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
