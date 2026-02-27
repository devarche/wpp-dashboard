import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
];

function randomColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

function normalizeTagKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// GET /api/campaigns — list all campaigns with replied_count
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: campaigns, error } = await service
    .from("campaigns")
    .select("*, template:templates(name, language), tag:chat_tags(name, color)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // replied_count: count recipients with replied_at not null
  const enriched = await Promise.all(
    (campaigns ?? []).map(async (campaign) => {
      const { count } = await service
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .not("replied_at", "is", null);

      return { ...campaign, replied_count: count ?? 0 };
    })
  );

  return NextResponse.json({ campaigns: enriched });
}

// POST /api/campaigns — create a draft campaign
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const templateId = typeof body?.template_id === "string" ? body.template_id : null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: "template_id is required" }, { status: 400 });

  const service = createServiceClient();

  // Auto-create a campaign tag
  const color = randomColor();
  const normalized = normalizeTagKey(name);
  const { data: tag, error: tagErr } = await service
    .from("chat_tags")
    .upsert(
      { name, normalized_name: normalized, color, created_by: user.id },
      { onConflict: "normalized_name" }
    )
    .select()
    .single();

  if (tagErr || !tag) {
    return NextResponse.json({ error: tagErr?.message ?? "Failed to create tag" }, { status: 500 });
  }

  // Create the campaign linked to the tag
  const { data: campaign, error: campErr } = await service
    .from("campaigns")
    .insert({
      name,
      template_id: templateId,
      tag_id: tag.id,
      status: "draft",
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
    })
    .select("*, template:templates(name, language), tag:chat_tags(name, color)")
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: campErr?.message ?? "Failed to create campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign: { ...campaign, replied_count: 0 } });
}
