import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchTemplates } from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  void request; // unused but required by Next.js handler signature

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await fetchTemplates();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[templates] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch templates",
      },
      { status: 500 }
    );
  }
}
