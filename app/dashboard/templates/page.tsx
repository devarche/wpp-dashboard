"use client";

import { useState, useEffect } from "react";
import TemplateCard from "@/components/TemplateCard";
import { RefreshCw, LayoutTemplate } from "lucide-react";
import type { MetaTemplate } from "@/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTemplates = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.data || []);
    } catch {
      setError(
        "Failed to load templates. Check WA_BUSINESS_ACCOUNT_ID and WA_TOKEN in your environment."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <LayoutTemplate size={24} className="text-[#00a884]" />
          <div>
            <h1 className="text-[#e9edef] text-xl font-semibold">Templates</h1>
            <p className="text-[#8696a0] text-sm mt-0.5">
              Manage and send WhatsApp message templates
            </p>
          </div>
        </div>
        <button
          onClick={fetchTemplates}
          disabled={loading}
          className="flex items-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] px-4 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded-xl p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#202c33] rounded-xl p-4 animate-pulse h-52"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
          {templates.length === 0 && !error && (
            <div className="col-span-3 text-center text-[#8696a0] py-20">
              No templates found in your WhatsApp Business Account.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
