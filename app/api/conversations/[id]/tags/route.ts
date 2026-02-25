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
  const payload = await request.json();
  const rawTagIds: unknown = payload?.tag_ids;
  if (!Array.isArray(rawTagIds)) {
    return NextResponse.json({ error: "tag_ids must be an array of strings" }, { status: 400 });
  }
  const tagIds: string[] = rawTagIds.filter(
    (value: unknown): value is string => typeof value === "string"
  );

  const service = createServiceClient();

  const { error: deleteError } = await service
    .from("conversation_tags")
    .delete()
    .eq("conversation_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (tagIds.length > 0) {
    const { error: insertError } = await service.from("conversation_tags").insert(
      tagIds.map((tagId) => ({
        conversation_id: id,
        tag_id: tagId,
      }))
    );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { conversation, error: fetchError } = await getConversationById(id);
  if (fetchError || !conversation) {
    return NextResponse.json(
      { error: fetchError?.message || "Conversation not found" },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversation });
}
