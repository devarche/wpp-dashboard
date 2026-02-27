import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTemplateMessage, WhatsAppApiError } from "@/lib/whatsapp";
import { findOrCreateContact } from "@/lib/contacts";

export async function POST(request: NextRequest) {
  let to = "";
  try {
    // Auth guard
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { to: toParam, templateName, language, components } = await request.json();
    to = toParam;
    if (!to || !templateName) {
      return NextResponse.json(
        { error: "to and templateName are required" },
        { status: 400 }
      );
    }

    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID!;

    // Send via WhatsApp Cloud API
    const waRes = await sendTemplateMessage(
      phoneNumberId,
      to,
      templateName,
      language ?? "es_AR",
      components
    );
    const wamid = waRes.messages?.[0]?.id ?? null;

    // Persist to DB (upsert contact → find/create conversation → insert message)
    const service = createServiceClient();

    const contact = await findOrCreateContact(service, to);

    if (contact) {
      let { data: conversation } = await service
        .from("conversations")
        .select("*")
        .eq("contact_id", contact.id)
        .maybeSingle();

      if (!conversation) {
        const { data: newConv } = await service
          .from("conversations")
          .insert({ contact_id: contact.id })
          .select()
          .single();
        conversation = newConv;
      }

      if (conversation) {
        // Look up template body text for message preview
        const { data: localTmpl } = await service
          .from("templates")
          .select("components")
          .eq("name", templateName)
          .maybeSingle();
        const tmplComponents = localTmpl?.components as { type: string; text?: string }[] | null;
        const templateBody = tmplComponents?.find((c) => c.type === "BODY")?.text ?? null;

        const preview = `[Template: ${templateName}]`;
        await service.from("messages").insert({
          conversation_id: conversation.id,
          wamid,
          direction: "outbound",
          type: "template",
          content: { template: { name: templateName, language, body: templateBody } },
          status: "sent",
        });
        await service
          .from("conversations")
          .update({
            last_message: preview,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }
    }

    return NextResponse.json({ ok: true, wamid });
  } catch (err: unknown) {
    if (err instanceof WhatsAppApiError && err.code === 131026) {
      const service2 = createServiceClient();
      await service2.from("contacts").update({ opted_out: true }).eq("phone", to);
      return NextResponse.json({ error: "opted_out", opted_out: true }, { status: 400 });
    }
    console.error("[templates/send] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send template" },
      { status: 500 }
    );
  }
}
