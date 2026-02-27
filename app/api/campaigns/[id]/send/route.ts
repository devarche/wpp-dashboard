import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp";
import { findOrCreateContact } from "@/lib/contacts";

interface Recipient {
  phone: string;
  name?: string;
  components?: unknown[];
}

interface FailedRecipient {
  phone: string;
  error: string;
}

const SEND_DELAY_MS = 150; // ~6 msgs/sec — well within WhatsApp limits

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /api/campaigns/[id]/send
// Body: { recipients: Recipient[] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const recipients: Recipient[] = Array.isArray(body?.recipients) ? body.recipients : [];
  const partial: boolean = body?.partial === true;

  if (recipients.length === 0) {
    return NextResponse.json({ error: "recipients array is empty" }, { status: 400 });
  }

  const service = createServiceClient();

  // Load campaign + template (including components to extract body preview)
  const { data: campaign, error: campErr } = await service
    .from("campaigns")
    .select("*, template:templates(name, language, components)")
    .eq("id", id)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Campaign already sent" }, { status: 400 });
  }

  const tmpl = campaign.template as { name: string; language: string; components?: { type: string; text?: string }[] } | null;
  const templateName = tmpl?.name;
  const templateLang = tmpl?.language ?? "es_AR";
  // Extract body text for message preview
  const templateBody = tmpl?.components?.find((c) => c.type === "BODY")?.text ?? null;

  if (!templateName) {
    return NextResponse.json({ error: "Template not found" }, { status: 400 });
  }

  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID!;

  // Mark campaign as running
  await service
    .from("campaigns")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", id);

  let sent = 0;
  let failed = 0;
  const failures: FailedRecipient[] = [];

  for (const recipient of recipients) {
    const phone = recipient.phone.replace(/\D/g, ""); // strip non-digits
    if (!phone) { failed++; continue; }

    try {
      // 1. Find or create contact (deduplicates by phone suffix/prefix matching)
      const contact = await findOrCreateContact(service, phone, recipient.name ?? null);
      if (!contact) { failed++; continue; }
      // Use the stored phone number (may include country code) for the WhatsApp API call
      const waPhone = (contact.phone as string) || phone;

      // 2. Find or create conversation
      let { data: conversation } = await service
        .from("conversations")
        .select("id, archived, campaign_id")
        .eq("contact_id", contact.id)
        .maybeSingle();

      if (!conversation) {
        const { data: newConv } = await service
          .from("conversations")
          .insert({
            contact_id: contact.id,
            campaign_id: id,
            archived: true,
          })
          .select("id, archived, campaign_id")
          .single();
        conversation = newConv;
      } else {
        // Update existing conversation: archive + link campaign
        await service
          .from("conversations")
          .update({
            campaign_id: id,
            archived: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      if (!conversation) { failed++; continue; }

      // 3. Apply campaign tag to conversation
      if (campaign.tag_id) {
        await service
          .from("conversation_tags")
          .upsert(
            { conversation_id: conversation.id, tag_id: campaign.tag_id },
            { onConflict: "conversation_id,tag_id" }
          );
      }

      // 4. Create campaign_recipient record
      const { data: recipientRecord } = await service
        .from("campaign_recipients")
        .insert({
          campaign_id: id,
          contact_id: contact.id,
          status: "pending",
        })
        .select("id")
        .single();

      // 5. Send template via WhatsApp API (use stored phone which may include country code)
      const waRes = await sendTemplateMessage(
        phoneNumberId,
        waPhone,
        templateName,
        templateLang,
        recipient.components
      );
      const wamid = waRes.messages?.[0]?.id ?? null;
      const now = new Date().toISOString();

      // 6. Insert outbound message record
      await service.from("messages").insert({
        conversation_id: conversation.id,
        wamid,
        direction: "outbound",
        type: "template",
        content: { template: { name: templateName, language: templateLang, body: templateBody } },
        status: "sent",
      });

      // 7. Update conversation preview
      await service
        .from("conversations")
        .update({
          last_message: `[Template: ${templateName}]`,
          last_message_at: now,
          updated_at: now,
        })
        .eq("id", conversation.id);

      // 8. Update recipient record
      if (recipientRecord) {
        await service
          .from("campaign_recipients")
          .update({ wamid, status: "sent", sent_at: now })
          .eq("id", recipientRecord.id);
      }

      sent++;
    } catch (err) {
      if (err instanceof WhatsAppApiError && err.code === 131026) {
        // Opted out — mark contact
        await service.from("contacts").update({ opted_out: true }).eq("phone", phone);
      }
      failed++;
      // Extract a human-readable error message
      let errMsg = "Error desconocido";
      if (err instanceof WhatsAppApiError) {
        try {
          const body = JSON.parse(err.message);
          errMsg = body?.error?.message ?? err.message;
        } catch {
          errMsg = err.message;
        }
      } else if (err instanceof Error) {
        errMsg = err.message;
      }
      failures.push({ phone, error: errMsg });
      console.error(`[campaign/send] failed for ${phone}:`, err);
    }

    await delay(SEND_DELAY_MS);
  }

  // Update campaign counters + status
  // Accumulate sent_count in case this is a follow-up partial send
  await service
    .from("campaigns")
    .update({
      sent_count: (campaign.sent_count ?? 0) + sent,
      status: partial ? "draft" : "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, sent, failed, failures });
}
