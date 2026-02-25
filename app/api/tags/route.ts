import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeTagKey(name: string) {
  return normalizeTagName(name).toLowerCase();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("chat_tags")
    .select("*")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tags: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = typeof body?.name === "string" ? normalizeTagName(body.name) : "";
  const color = typeof body?.color === "string" ? body.color : "#00a884";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const normalizedName = normalizeTagKey(name);
  const service = createServiceClient();

  const { data, error } = await service
    .from("chat_tags")
    .upsert(
      {
        name,
        normalized_name: normalizedName,
        color,
        created_by: user.id,
      },
      { onConflict: "normalized_name" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag: data });
}
