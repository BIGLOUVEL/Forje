-- Appliquée le 2026-07-07 via MCP (migration "demo_landing_tables").
-- Landing démo : board de veille public + génération sans compte.

create table if not exists public.demo_veille (
  id           uuid primary key default gen_random_uuid(),
  profile_key  text not null check (profile_key in ('ballon_bleu','frame')),
  titre        text not null,
  description  text,
  source       text,
  url          text not null,
  score        int  not null,               -- score affiché 0-100 (score_total x 10)
  published_at timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (profile_key, url)
);
alter table public.demo_veille enable row level security;
drop policy if exists "anon read demo_veille" on public.demo_veille;
create policy "anon read demo_veille" on public.demo_veille for select using (true);

create table if not exists public.demo_generations (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  visitor_id text,
  preset     text not null,
  news_id    uuid,
  cached     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists demo_generations_ip_idx      on public.demo_generations (ip_hash, created_at);
create index if not exists demo_generations_visitor_idx on public.demo_generations (visitor_id, created_at);
create index if not exists demo_generations_created_idx on public.demo_generations (created_at);
alter table public.demo_generations enable row level security; -- server-only

create table if not exists public.demo_cache (
  preset     text not null,
  news_id    uuid not null,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (preset, news_id)
);
alter table public.demo_cache enable row level security; -- server-only

create table if not exists public.demo_events (
  id         bigint generated always as identity primary key,
  event      text not null,
  props      jsonb,
  visitor_id text,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index if not exists demo_events_event_idx on public.demo_events (event, created_at);
alter table public.demo_events enable row level security; -- server-only

-- Comptes de veille démo (UUID fixes, référencés par routes/demo.js)
insert into public.comptes (
  id, nom, langue, instagram_url, niche_principale, sous_niches, ton, angle_editorial,
  niveau_expertise_audience, audience_age, audience_type,
  keywords_niche, sources_prioritaires, formats_favoris,
  fenetre_reaction_breaking, fenetre_reaction_trending, ratio_contenu,
  sujets_a_eviter, abonnes
) values
(
  'a0000000-0000-4000-8000-000000000001',
  'Ballon Bleu', 'fr', 'https://instagram.com/ballonbleu.demo', 'football',
  array['ligue 1','mercato','équipe de france','ligue des champions','psg','om','premier league'],
  'direct, passionné, côté supporter',
  'l''actu foot traitée à chaud — terrain, vestiaire, mercato',
  'intermédiaire', '18-34', 'grand public passionné',
  array['football','foot','mercato','ligue 1','psg','om','ol','bleus','transfert','match','but','club','uefa','champions league','coupe du monde','sélection','entraîneur','stade'],
  array['L''Équipe','RMC Sport','Foot Mercato'],
  array['Post','Carrousel'],
  '30 minutes', '3 heures', '70% actu chaude / 30% analyse',
  array['paris sportifs','rumeurs sans source'],
  42000
),
(
  'a0000000-0000-4000-8000-000000000002',
  'Frame', 'fr', 'https://instagram.com/frame.demo', 'médias et industrie culturelle',
  array['cinéma','streaming','presse','réseaux sociaux','télévision','création','ia générative'],
  'éditorial, précis, curieux',
  'décrypter comment les images et les médias façonnent la culture',
  'averti', '25-44', 'professionnels des médias et curieux exigeants',
  array['cinéma','film','netflix','streaming','médias','presse','journalisme','audiovisuel','série','festival','box-office','plateforme','tiktok','youtube','instagram','ia générative','publicité','audience'],
  array['Les Inrocks','Le Monde Culture','The Verge'],
  array['Post','Carrousel'],
  '2 heures', '6 heures', '50% actu / 50% analyse',
  array['télé-réalité','people sans angle média'],
  38000
)
on conflict (id) do nothing;
