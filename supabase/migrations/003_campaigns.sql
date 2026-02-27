-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Campaigns v2 (campaign_id on conversations, tag_id on campaigns)
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Link conversations to the campaign that created them
alter table conversations
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

-- 2. Each campaign auto-creates a tag — store the reference
alter table campaigns
  add column if not exists tag_id uuid references chat_tags(id) on delete set null;

-- 3. Track when a campaign recipient replied
alter table campaign_recipients
  add column if not exists replied_at timestamptz;

-- 4. Indexes for fast lookups
create index if not exists idx_conversations_campaign
  on conversations(campaign_id) where campaign_id is not null;
