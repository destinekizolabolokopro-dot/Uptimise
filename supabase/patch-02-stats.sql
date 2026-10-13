-- Uptimise · patch 02 : statistiques de consommation des numéros (pour le robot de nuit)
-- À coller dans Supabase › SQL Editor › New query, puis « Run ». Sans risque : il ne modifie aucune donnée.
-- Il ne renvoie que des SIREN et des compteurs (aucun nom, aucun numéro, aucune note).
create or replace function public.pool_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with worked as (
    select coalesce(data->>'siren', split_part(path, '/', 2)) as siren,
           data->>'createdAt' as created, data->>'lastCallAt' as last_call
    from docs
    where parent = 'prospects'
      and (coalesce((data->>'attempts')::numeric, 0) > 0
           or data->>'lastCallAt' is not null
           or data->>'status' in ('signe', 'perdu', 'rdv', 'proposition', 'mauvais_numero'))
  )
  select jsonb_build_object(
    'worked', coalesce((select jsonb_agg(siren) from worked), '[]'::jsonb),
    'new14',  (select count(*) from worked where created >= to_char(now() - interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS')),
    'calls7', (select count(*) from worked where last_call >= to_char(now() - interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS'))
  )
$$;
grant execute on function public.pool_stats() to anon, authenticated;
