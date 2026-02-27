import type { SupabaseClient } from "@supabase/supabase-js";

type ContactRow = Record<string, unknown>;

/**
 * Find a contact by phone number, handling variations in format
 * (with or without country code prefix). If not found, creates a new one.
 *
 * Matching order:
 * 1. Exact: phone === stored
 * 2. Partial given:  stored phone ends with given   (DB "541167910548", CSV "1167910548")
 * 3. Partial stored: given phone ends with stored   (DB "1167910548", WA  "541167910548")
 *    → upgrades stored phone to full number so future lookups are exact
 * 4. Create new contact
 */
export async function findOrCreateContact(
  supabase: SupabaseClient,
  phone: string,
  name?: string | null
): Promise<ContactRow | null> {
  // ── 1. Exact match ──────────────────────────────────────────────────────────
  const { data: exact } = await supabase
    .from("contacts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (exact) {
    if (name && !exact.name) {
      await supabase.from("contacts").update({ name }).eq("id", exact.id);
      return { ...exact, name };
    }
    return exact as ContactRow;
  }

  // ── 2. DB has full number, given is shorter (CSV without country code) ──────
  //    e.g., DB "541167910548" LIKE "%1167910548"
  const { data: bySuffix } = await supabase
    .from("contacts")
    .select("*")
    .like("phone", `%${phone}`)
    .maybeSingle();

  if (bySuffix) {
    if (name && !bySuffix.name) {
      await supabase.from("contacts").update({ name }).eq("id", bySuffix.id);
      return { ...bySuffix, name } as ContactRow;
    }
    return bySuffix as ContactRow;
  }

  // ── 3. DB has partial number, given is full (WhatsApp with country code) ────
  //    Try stripping 1–3 digit prefix from given phone and looking up the remainder
  //    e.g., given "541167910548" → strip "54" → "1167910548" → exact match in DB
  for (const stripLen of [2, 3, 1]) {
    if (phone.length <= stripLen + 6) continue; // don't strip too aggressively
    const stripped = phone.slice(stripLen);
    const { data: byStripped } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", stripped)
      .maybeSingle();

    if (byStripped) {
      // Upgrade the stored partial phone to the full international number
      const updates: Record<string, unknown> = { phone };
      if (name && !byStripped.name) updates.name = name;
      await supabase.from("contacts").update(updates).eq("id", byStripped.id);
      return { ...byStripped, ...updates } as ContactRow;
    }
  }

  // ── 4. Create new contact ───────────────────────────────────────────────────
  const { data: newContact } = await supabase
    .from("contacts")
    .insert({ phone, name: name ?? null })
    .select()
    .single();

  return (newContact as ContactRow) ?? null;
}
