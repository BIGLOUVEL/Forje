-- Appliquée le 2026-07-17 via MCP (migration "blaise_v4_reset_undo")
-- Blaise V4 : système de reset 3 niveaux + annulation d'actions appliquées.
-- Principe : JAMAIS de suppression destructive — on coupe (topic_break),
-- on purge (blaise_summary), on archive (archived) ; tout est traçable.

-- Résumé long terme de la conversation (mémoire au-delà des 12 derniers
-- messages) — purgeable par le reset niveau 2.
alter table clients add column if not exists blaise_summary text;
alter table clients add column if not exists blaise_summary_updated_at timestamptz;

-- Marqueurs de fil : 'topic_break' (niveau 1) | 'memory_reset' (niveau 2).
-- Le context builder repart du dernier marqueur.
alter table blaise_messages add column if not exists message_type text;

-- Reset niveau 3 : les messages sont archivés, jamais supprimés.
alter table blaise_messages add column if not exists archived boolean default false;

-- Journal d'application : ancienne ET nouvelle valeur de chaque champ modifié
-- par update_brand_identity / save_strategy → bouton "Annuler" (24h).
create table if not exists identity_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients not null,
  changed_fields jsonb not null,      -- { logo_url: {old, new}, brand_colors: {old, new}, ... }
  source text default 'blaise',       -- blaise | manual | onboarding
  reverted boolean default false,
  created_at timestamptz default now()
);
create index if not exists identity_changes_client_idx
  on identity_changes (client_id, created_at);
alter table identity_changes enable row level security;
drop policy if exists "own changes" on identity_changes;
create policy "own changes" on identity_changes for all
  using (client_id in (select id from clients where user_id = auth.uid()));
