import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { findOrCreateContact } from "@/lib/contacts";

const OPT_OUT_KEYWORDS = new Set([
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit",
  "cancelar", "detener", "parar", "salir", "baja", "desuscribir", "no quiero",
]);
const OPT_IN_KEYWORDS = new Set([
  "start", "subscribe", "suscribir", "iniciar", "inicio", "alta",
]);

function detectOptChange(text: string): "opt_out" | "opt_in" | null {
  const normalized = text.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.has(normalized)) return "opt_out";
  if (OPT_IN_KEYWORDS.has(normalized)) return "opt_in";
  return null;
}

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

          // 1. Find or create contact (deduplicates by phone, handles country code variations)
          const optChange =
            waMessage.type === "text"
              ? detectOptChange(waMessage.text?.body ?? "")
              : null;

          const contact = await findOrCreateContact(
            supabase,
            waMessage.from,
            contactInfo?.profile?.name ?? null
          );

          if (!contact) {
            console.error("[webhook] contact lookup failed for", waMessage.from);
            continue;
          }

          // Apply opt-in / opt-out if detected
          if (optChange === "opt_out") {
            await supabase.from("contacts").update({ opted_out: true }).eq("id", contact.id);
          } else if (optChange === "opt_in") {
            await supabase.from("contacts").update({ opted_out: false }).eq("id", contact.id);
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
          //    Always unarchive on inbound reply — any archived conversation becomes active
          const isArchivedCampaign =
            conversation.campaign_id != null && conversation.archived === true;

          await supabase
            .from("conversations")
            .update({
              last_message: preview,
              last_message_at: new Date(
                parseInt(waMessage.timestamp) * 1000
              ).toISOString(),
              unread_count: (conversation.unread_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
              ...(conversation.archived ? { archived: false } : {}),
            })
            .eq("id", conversation.id);

          // 6. Mark campaign recipient as replied (if this was a campaign conversation)
          if (isArchivedCampaign) {
            await supabase
              .from("campaign_recipients")
              .update({ replied_at: new Date().toISOString(), status: "replied" })
              .eq("campaign_id", conversation.campaign_id)
              .eq("contact_id", contact.id)
              .is("replied_at", null); // only first reply
          }
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
