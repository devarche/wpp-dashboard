"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import type { Conversation } from "@/types";

export default function DashboardPage() {
  const [selected, setSelected] = useState<Conversation | null>(null);

  const handleSelect = async (conversation: Conversation) => {
    setSelected(conversation);
    // Mark as read
    if (conversation.unread_count > 0) {
      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", conversation.id);
    }
  };

  return (
    <div className="flex h-full">
      <ConversationList
        selectedId={selected?.id ?? null}
        onSelect={handleSelect}
      />
      <ChatWindow conversation={selected} />
    </div>
  );
}
