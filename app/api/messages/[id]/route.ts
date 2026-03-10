import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const WA_API_VERSION = process.env.WA_API_VERSION || "v22.0";
const WA_TOKEN = process.env.WA_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID!;

function waUrl(path: string) {
  return `https://graph.facebook.com/${WA_API_VERSION}${path}`;
}

// DELETE /api/messages/[id] — delete a sent message
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: message } = await service
    .from("messages")
    .select("wamid, direction")
    .eq("id", id)
    .single();

  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (message.direction !== "outbound") return NextResponse.json({ error: "Only outbound messages can be deleted" }, { status: 400 });

  // Attempt WhatsApp API delete (best-effort)
  if (message.wamid) {
    await fetch(waUrl(`/${WA_PHONE_NUMBER_ID}/messages/${message.wamid}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    }).catch(() => null);
  }

  // Delete from local DB
  await service.from("messages").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}

// PATCH /api/messages/[id] — edit a sent text message
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const service = createServiceClient();

  const { data: message } = await service
    .from("messages")
    .select("wamid, direction, type, content, conversation_id")
    .eq("id", id)
    .single();

  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (message.direction !== "outbound") return NextResponse.json({ error: "Only outbound messages can be edited" }, { status: 400 });
  if (message.type !== "text") return NextResponse.json({ error: "Only text messages can be edited" }, { status: 400 });

  // Attempt WhatsApp API edit (best-effort)
  if (message.wamid) {
    const { data: conv } = await service
      .from("conversations")
      .select("contact:contacts(phone)")
      .eq("id", message.conversation_id)
      .maybeSingle();
    const phone = (conv?.contact as { phone?: string } | null)?.phone;

    if (phone) {
      await fetch(waUrl(`/${WA_PHONE_NUMBER_ID}/messages`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          context: { message_id: message.wamid },
          text: { body: text.trim(), preview_url: false },
        }),
      }).catch(() => null);
    }
  }

  // Update local DB
  const updatedContent = { ...(message.content as Record<string, unknown>), text: { body: text.trim() } };
  await service.from("messages").update({ content: updatedContent }).eq("id", id);

  return NextResponse.json({ ok: true });
}
