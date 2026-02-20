"use client";

import { useState } from "react";
import { X, Send, CheckCircle } from "lucide-react";
import type { MetaTemplate } from "@/types";

interface Props {
  template: MetaTemplate;
  onClose: () => void;
}

export default function SendTemplateModal({ template, onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const bodyComponent = template.components?.find((c) => c.type === "BODY");

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#202c33] rounded-2xl p-6 w-full max-w-md border border-[#2a3942] shadow-2xl">
        {/* Modal header */}
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
        <div className="bg-[#111b21] rounded-xl p-4 mb-5">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[#e9edef] font-medium text-sm">{template.name}</p>
            <span className="text-[#8696a0] text-xs">{template.language}</span>
          </div>
          {bodyComponent?.text && (
            <p className="text-[#8696a0] text-xs leading-relaxed line-clamp-4">
              {bodyComponent.text}
            </p>
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
              <p className="text-[#8696a0] text-xs mt-1">
                Digits only, no + or spaces
              </p>
            </div>

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
