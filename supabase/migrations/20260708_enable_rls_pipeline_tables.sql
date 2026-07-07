-- Appliquée le 2026-07-08 via MCP (migration "enable_rls_pipeline_tables").
-- Sécurisation : RLS sur les tables pipeline exposées à la clé anon.
-- Le backend utilise la SERVICE KEY (bypass RLS) → aucun impact serveur.
-- Sans policy, anon/authenticated n'ont plus AUCUN accès (c'est le but).

alter table public.news_raw                 enable row level security;
alter table public.news_scored              enable row level security;
alter table public.interactions             enable row level security;
alter table public.commentaires_concurrents enable row level security;
alter table public.twitter_sources          enable row level security;
alter table public.api_costs                enable row level security;
alter table public.tendances_log            enable row level security;
alter table public.filtre_stats             enable row level security;
alter table public.resumes_enrichis         enable row level security;

-- comptes : le front lit la ligne de l'utilisateur connecté (app-sources.jsx)
-- → policy SELECT restreinte au propriétaire. Écritures : serveur uniquement.
alter table public.comptes enable row level security;
drop policy if exists "own compte select" on public.comptes;
create policy "own compte select" on public.comptes
  for select to authenticated
  using (user_id = auth.uid());
