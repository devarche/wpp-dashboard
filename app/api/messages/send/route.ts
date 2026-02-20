import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    // Auth guard
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversation_id, text } = await request.json();
    if (!conversation_id || !text?.trim()) {
      return NextResponse.json(
        { error: "conversation_id and text are required" },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    // Fetch conversation + contact phone
    const { data: conversation, error: convErr } = await service
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const toPhone = conversation.contact.phone;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID!;

    // Send via WhatsApp Cloud API
    const waRes = await sendTextMessage(phoneNumberId, toPhone, text.trim());
    const wamid = waRes.messages?.[0]?.id ?? null;

    // Persist outbound message
    await service.from("messages").insert({
      conversation_id,
      wamid,
      direction: "outbound",
      type: "text",
      content: { text: { body: text.trim() } },
      status: "sent",
    });

    // Update conversation preview
    await service
      .from("conversations")
      .update({
        last_message: text.trim(),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    return NextResponse.json({ ok: true, wamid });
  } catch (err: unknown) {
    console.error("[send] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 500 }
    );
  }
}
