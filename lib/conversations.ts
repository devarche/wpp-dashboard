import { createServiceClient } from "@/lib/supabase/service";
import type { Conversation, Tag } from "@/types";

type RawConversation = Omit<Conversation, "tags"> & {
  conversation_tags?: Array<{ tag?: Tag | null }>;
};

export const CONVERSATION_SELECT =
  "*, contact:contacts(*), conversation_tags(tag:chat_tags(*))";

function normalizeTag(tag: Tag): Tag {
  return {
    ...tag,
    color: tag.color || "#00a884",
  };
}

export function formatConversation(raw: RawConversation): Conversation {
  const { conversation_tags, ...conversation } = raw;
  const tags =
    conversation_tags
      ?.map((entry) => entry.tag)
      .filter((tag): tag is Tag => Boolean(tag))
      .map(normalizeTag) ?? [];

  return {
    ...conversation,
    assignees: conversation.assignees ?? [],
    archived: conversation.archived ?? false,
    campaign_id: conversation.campaign_id ?? null,
    tags,
  };
}

export async function getConversationById(id: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return { conversation: null, error };
  }

  return { conversation: formatConversation(data as RawConversation), error: null };
}
