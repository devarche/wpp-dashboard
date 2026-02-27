import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/campaigns/[id] — single campaign with recipients
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: campaign, error } = await service
    .from("campaigns")
    .select("*, template:templates(name, language), tag:chat_tags(name, color)")
    .eq("id", id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  const { count: repliedCount } = await service
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .not("replied_at", "is", null);

  return NextResponse.json({ campaign: { ...campaign, replied_count: repliedCount ?? 0 } });
}

// DELETE /api/campaigns/[id] — delete a draft campaign
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: campaign } = await service
    .from("campaigns")
    .select("status, tag_id, sent_count")
    .eq("id", id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Solo se pueden eliminar campañas en borrador" }, { status: 400 });
  }

  // Delete recipients first (FK constraint)
  await service.from("campaign_recipients").delete().eq("campaign_id", id);

  const { error } = await service.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up auto-created tag if campaign was never sent
  if (campaign.tag_id && (campaign.sent_count ?? 0) === 0) {
    await service.from("chat_tags").delete().eq("id", campaign.tag_id);
  }

  return NextResponse.json({ ok: true });
}
