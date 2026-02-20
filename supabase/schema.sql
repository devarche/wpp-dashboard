-- ─────────────────────────────────────────────────────────────────────────────
-- WPP Dashboard – Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────────────────────

-- contacts: one row per WhatsApp phone number
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique not null,          -- e.g. "5491112345678"
  name        text,                          -- from WhatsApp profile
  profile_pic text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- conversations: one thread per contact
create table if not exists conversations (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid references contacts(id) on delete cascade,
  last_message     text,
  last_message_at  timestamptz,
  unread_count     int default 0,
  status           text default 'open',      -- open | closed | pending
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- messages: every individual message in every conversation
create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  wamid            text unique,              -- WhatsApp message ID (e.g. wamid.xxx)
  direction        text not null check (direction in ('inbound', 'outbound')),
  type             text not null,            -- text | image | audio | video | document | template | …
  content          jsonb not null default '{}',
  status           text default 'sent',      -- sent | delivered | read | failed
  created_at       timestamptz default now()
);

-- templates: cached copy of your approved Meta templates
create table if not exists templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  language          text default 'es_AR',
  category          text,
  components        jsonb default '[]',
  status            text,                    -- APPROVED | PENDING | REJECTED
  meta_template_id  text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- campaigns: bulk send jobs (phase 2)
create table if not exists campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  template_id      uuid references templates(id),
  status           text default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  sent_count       int default 0,
  delivered_count  int default 0,
  read_count       int default 0,
  scheduled_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- campaign_recipients: one row per contact per campaign
create table if not exists campaign_recipients (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references campaigns(id) on delete cascade,
  contact_id   uuid references contacts(id),
  status       text default 'pending',       -- pending | sent | delivered | read | failed
  wamid        text,
  sent_at      timestamptz,
  created_at   timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_conversations_contact  on conversations(contact_id);
create index if not exists idx_conversations_updated  on conversations(last_message_at desc nulls last);
create index if not exists idx_messages_conversation  on messages(conversation_id);
create index if not exists idx_messages_created       on messages(created_at);
create index if not exists idx_messages_wamid         on messages(wamid) where wamid is not null;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Authenticated dashboard users can read/write everything.
-- The webhook uses the service-role key, which bypasses RLS entirely.

alter table contacts           enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table templates          enable row level security;
alter table campaigns          enable row level security;
alter table campaign_recipients enable row level security;

-- Helper macro: grant all operations to any authenticated user
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts', 'conversations', 'messages',
    'templates', 'campaigns', 'campaign_recipients'
  ] loop
    execute format(
      'create policy "auth_all_%s" on %I for all to authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime for the tables the dashboard subscribes to.
-- Run these in the Supabase Dashboard → Database → Replication
-- OR uncomment the lines below (requires pg_publication_tables permission):

-- alter publication supabase_realtime add table conversations;
-- alter publication supabase_realtime add table messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- After running this SQL, go to:
--   Supabase Dashboard → Database → Replication
--   and enable realtime for "conversations" and "messages" tables.
-- ─────────────────────────────────────────────────────────────────────────────
