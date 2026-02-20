const WA_API_VERSION = process.env.WA_API_VERSION || "v22.0";
const WA_TOKEN = process.env.WA_TOKEN!;
const WA_BUSINESS_ACCOUNT_ID = process.env.WA_BUSINESS_ACCOUNT_ID!;

function apiUrl(path: string) {
  return `https://graph.facebook.com/${WA_API_VERSION}${path}`;
}

async function assertOk(res: Response) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(err));
  }
}

export async function fetchTemplates() {
  const url = apiUrl(
    `/${WA_BUSINESS_ACCOUNT_ID}/message_templates?limit=100&fields=id,name,status,category,language,components`
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
    cache: "no-store",
  });
  await assertOk(res);
  return res.json();
}

export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  text: string
) {
  const res = await fetch(apiUrl(`/${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  await assertOk(res);
  return res.json();
}

export async function sendTemplateMessage(
  phoneNumberId: string,
  to: string,
  templateName: string,
  language: string,
  components?: unknown[]
) {
  const res = await fetch(apiUrl(`/${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        ...(components?.length ? { components } : {}),
      },
    }),
  });
  await assertOk(res);
  return res.json();
}
