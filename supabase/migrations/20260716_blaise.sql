-- Appliquée le 2026-07-16 via MCP (migration "blaise_messages_and_strategy")
-- Blaise, le directeur artistique IA : conversation persistée + stratégie réseaux.

create table if not exists blaise_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients not null,
  role text not null,               -- 'user' | 'assistant'
  content jsonb not null,           -- blocs Anthropic (texte + bloc custom blaise_events)
  images text[],                    -- urls générées dans ce tour
  created_at timestamptz default now()
);
create index if not exists blaise_messages_client_created_idx
  on blaise_messages (client_id, created_at);
alter table blaise_messages enable row level security;
drop policy if exists "own messages" on blaise_messages;
create policy "own messages" on blaise_messages for all
  using (client_id in (select id from clients where user_id = auth.uid()));

alter table clients add column if not exists strategy jsonb;
