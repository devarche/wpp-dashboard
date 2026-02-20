"use client";

import { useState } from "react";
import { Send, CheckCircle, XCircle, Clock } from "lucide-react";
import SendTemplateModal from "./SendTemplateModal";
import type { MetaTemplate } from "@/types";

interface Props {
  template: MetaTemplate;
}

const STATUS = {
  APPROVED: {
    Icon: CheckCircle,
    color: "text-green-400",
    bg: "bg-green-900/20 border-green-500/20",
    label: "Approved",
  },
  PENDING: {
    Icon: Clock,
    color: "text-yellow-400",
    bg: "bg-yellow-900/20 border-yellow-500/20",
    label: "Pending",
  },
  REJECTED: {
    Icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-900/20 border-red-500/20",
    label: "Rejected",
  },
} as const;

export default function TemplateCard({ template }: Props) {
  const [showModal, setShowModal] = useState(false);

  const statusKey = template.status as keyof typeof STATUS;
  const status = STATUS[statusKey] ?? STATUS.PENDING;
  const { Icon } = status;

  const bodyComponent = template.components?.find((c) => c.type === "BODY");
  const headerComponent = template.components?.find((c) => c.type === "HEADER");

  return (
    <>
      <div className="bg-[#202c33] border border-[#2a3942] rounded-xl p-4 flex flex-col gap-3 hover:border-[#3d5263] transition-colors">
        {/* Card header */}
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 className="text-[#e9edef] font-medium text-sm truncate">
              {template.name}
            </h3>
            <p className="text-[#8696a0] text-xs mt-0.5">
              {template.language} · {template.category}
            </p>
          </div>
          <span
            className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${status.bg} ${status.color}`}
          >
            <Icon size={11} />
            {status.label}
          </span>
        </div>

        {/* Header component label */}
        {headerComponent && (
          <p className="text-[#8696a0] text-xs uppercase tracking-wide font-semibold">
            {headerComponent.format ?? "HEADER"}
          </p>
        )}

        {/* Body preview */}
        {bodyComponent?.text ? (
          <p className="text-[#e9edef] text-sm bg-[#111b21] rounded-lg p-3 line-clamp-3 leading-relaxed flex-1">
            {bodyComponent.text}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Send button */}
        <button
          onClick={() => setShowModal(true)}
          disabled={template.status !== "APPROVED"}
          className="flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#06cf9c] text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={13} />
          Send Template
        </button>
      </div>

      {showModal && (
        <SendTemplateModal
          template={template}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
