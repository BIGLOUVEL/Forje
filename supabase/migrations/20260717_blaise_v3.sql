-- Appliquée le 2026-07-17 via MCP (migration "blaise_v3_rules_brief_schedule")
-- Blaise V3 : mémoire éditoriale + brief du jour + planification des posts.

-- Mémoire éditoriale : chaque feedback durable du client devient une règle
-- réinjectée dans le system prompt de Blaise ET les pipelines de génération.
create table if not exists client_editorial_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients not null,
  rule text not null,              -- "Jamais de points d'exclamation dans les titres"
  source text default 'blaise',    -- blaise | manual
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists client_editorial_rules_client_idx
  on client_editorial_rules (client_id, active);
alter table client_editorial_rules enable row level security;
drop policy if exists "own rules" on client_editorial_rules;
create policy "own rules" on client_editorial_rules for all
  using (client_id in (select id from clients where user_id = auth.uid()));

-- Brief du jour : message assistant inséré par le cron, séparé dans le fil.
alter table blaise_messages add column if not exists is_daily_brief boolean default false;

-- Planification : un post programmé = generated_posts.scheduled_at non null
-- (le calendrier lit ces entrées ; pas de table séparée).
alter table generated_posts add column if not exists scheduled_at timestamptz;
create index if not exists generated_posts_scheduled_idx
  on generated_posts (client_id, scheduled_at);
