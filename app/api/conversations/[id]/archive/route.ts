import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getConversationById } from "@/lib/conversations";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { archived } = await request.json();
  if (typeof archived !== "boolean") {
    return NextResponse.json({ error: "archived must be boolean" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("conversations")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { conversation, error: fetchError } = await getConversationById(id);
  if (fetchError || !conversation) {
    return NextResponse.json(
      { error: fetchError?.message || "Conversation not found" },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversation });
}
