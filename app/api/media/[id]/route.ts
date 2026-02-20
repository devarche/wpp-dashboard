import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id: mediaId } = await params;
  const token = process.env.WA_TOKEN!;

  try {
    // Step 1: Get the temporary download URL from Meta
    const infoRes = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!infoRes.ok) {
      return new NextResponse("Media not found", { status: 404 });
    }
    const { url } = await infoRes.json();

    // Step 2: Download the actual bytes
    const mediaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mediaRes.ok) {
      return new NextResponse("Failed to fetch media", { status: 502 });
    }

    const contentType =
      mediaRes.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await mediaRes.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[media] error:", err);
    return new NextResponse("Error fetching media", { status: 500 });
  }
}
