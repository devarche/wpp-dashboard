import { Megaphone } from "lucide-react";

export default function CampaignsPage() {
  return (
    <div className="h-full flex items-center justify-center bg-[#0b141a]">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#202c33] mb-4">
          <Megaphone size={28} className="text-[#00a884]" />
        </div>
        <h2 className="text-[#e9edef] text-xl font-semibold">Campaigns</h2>
        <p className="text-[#8696a0] text-sm mt-2 leading-relaxed">
          Bulk campaign management is coming soon. You&apos;ll be able to create
          campaigns, pick a template, upload a contact list, schedule sends, and
          track open and delivery rates here.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-xs text-[#8696a0] bg-[#202c33] px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-pulse" />
          Coming soon
        </div>
      </div>
    </div>
  );
}
