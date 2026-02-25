-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Tags + Archive
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add archived column to conversations
alter table conversations
  add column if not exists archived boolean not null default false;

-- 2. Create chat_tags table
create table if not exists chat_tags (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  normalized_name text not null unique,
  color           text not null default '#00a884',
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now()
);

-- 3. Create conversation_tags junction table
create table if not exists conversation_tags (
  conversation_id uuid not null references conversations(id) on delete cascade,
  tag_id          uuid not null references chat_tags(id) on delete cascade,
  primary key (conversation_id, tag_id)
);

-- 4. Indexes
create index if not exists idx_conversation_tags_conv on conversation_tags(conversation_id);
create index if not exists idx_conversation_tags_tag  on conversation_tags(tag_id);

-- 5. RLS
alter table chat_tags          enable row level security;
alter table conversation_tags  enable row level security;

create policy "auth_all_chat_tags"
  on chat_tags for all to authenticated
  using (true) with check (true);

create policy "auth_all_conversation_tags"
  on conversation_tags for all to authenticated
  using (true) with check (true);

-- 6. Enable realtime (run separately in Dashboard → Database → Replication if needed)
alter publication supabase_realtime add table chat_tags;
alter publication supabase_realtime add table conversation_tags;
