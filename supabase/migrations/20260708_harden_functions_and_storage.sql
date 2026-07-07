-- Appliquée le 2026-07-08 via MCP (migration "harden_functions_and_storage").
-- Durcissement : search_path figé + RPC serveur-only + listing bucket.

-- 1. search_path immuable (évite le hijack par schéma malveillant)
alter function public.consume_credits(uuid, integer, uuid, text, text) set search_path = public;
alter function public.reset_monthly_credits(text)                      set search_path = public;
alter function public.update_updated_at()                              set search_path = public;
alter function public.handle_new_user()                                set search_path = public;

-- 2. Fonctions appelées uniquement par le serveur (service key) ou par trigger :
--    plus d'exécution possible via /rest/v1/rpc avec la clé anon
revoke execute on function public.handle_new_user()                                from public, anon, authenticated;
revoke execute on function public.consume_credits(uuid, integer, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reset_monthly_credits(text)                      from public, anon, authenticated;

-- 3. Bucket brand-assets : plus de listing global. Chacun ne liste que son
--    dossier {user.id}/ (requis pour l'upsert des uploads). Les URLs publiques
--    des objets restent servies (bucket public = pas de RLS sur la lecture directe).
drop policy if exists "Brand assets are public" on storage.objects;
drop policy if exists "Users can read their own brand assets" on storage.objects;
create policy "Users can read their own brand assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = auth.uid()::text);
