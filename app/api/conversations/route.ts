import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONVERSATION_SELECT, formatConversation } from "@/lib/conversations";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const conversations = (data ?? []).map((row) => formatConversation(row));

  return NextResponse.json({ conversations });
}
