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
