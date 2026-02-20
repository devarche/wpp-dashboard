import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const VERIFY_TOKEN = process.env.WA_WEBHOOK_VERIFY_TOKEN!;

// ─── Meta Webhook Verification (GET) ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ─── Incoming Events (POST) ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // ── Incoming messages ──────────────────────────────────────────────
        for (const waMessage of value.messages ?? []) {
          const contactInfo = (value.contacts ?? []).find(
            (c: { wa_id: string }) => c.wa_id === waMessage.from
          );

          // 1. Upsert contact
          const { data: contact, error: contactErr } = await supabase
            .from("contacts")
            .upsert(
              {
                phone: waMessage.from,
                name: contactInfo?.profile?.name ?? null,
              },
              { onConflict: "phone" }
            )
            .select()
            .single();

          if (contactErr || !contact) {
            console.error("[webhook] contact upsert:", contactErr);
            continue;
          }

          // 2. Find or create conversation
          let { data: conversation } = await supabase
            .from("conversations")
            .select("*")
            .eq("contact_id", contact.id)
            .maybeSingle();

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({ contact_id: contact.id })
              .select()
              .single();
            conversation = newConv;
          }
          if (!conversation) continue;

          // 3. Build text preview for the conversation list
          let preview = "";
          const t = waMessage.type as string;
          if (t === "text") preview = waMessage.text?.body ?? "";
          else if (t === "image") preview = waMessage.image?.caption || "[Image]";
          else if (t === "audio") preview = "[Audio]";
          else if (t === "video") preview = "[Video]";
          else if (t === "document")
            preview = `[Document: ${waMessage.document?.filename ?? "file"}]`;
          else preview = `[${t}]`;

          // 4. Upsert message (idempotent — Meta can send duplicates)
          await supabase
            .from("messages")
            .upsert(
              {
                conversation_id: conversation.id,
                wamid: waMessage.id,
                direction: "inbound",
                type: waMessage.type,
                content: waMessage,
                status: "delivered",
              },
              { onConflict: "wamid" }
            );

          // 5. Update conversation summary
          await supabase
            .from("conversations")
            .update({
              last_message: preview,
              last_message_at: new Date(
                parseInt(waMessage.timestamp) * 1000
              ).toISOString(),
              unread_count: (conversation.unread_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);
        }

        // ── Delivery / read status updates ────────────────────────────────
        for (const statusUpdate of value.statuses ?? []) {
          await supabase
            .from("messages")
            .update({ status: statusUpdate.status })
            .eq("wamid", statusUpdate.id);
        }
      }
    }

    // Meta expects a 200 quickly — always return OK
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    // Still return 200 so Meta doesn't retry endlessly
    return NextResponse.json({ ok: true });
  }
}
