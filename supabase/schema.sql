-- Uptimise · base de données Supabase
-- À coller une seule fois dans Supabase › SQL Editor › New query, puis « Run ».
-- On peut le relancer sans risque : il ne supprime aucune donnée.
--
-- Principe : une seule table « docs » range tous les documents de l'application par chemin
-- (roster/<id>, prospects/<siren>, prospects/<siren>/notes/<id>, …), comme la base de l'artefact claude.ai.
-- Les droits sont appliqués par la base elle-même (Row Level Security), pas seulement par la page.

create table if not exists public.docs (
  path text primary key,
  parent text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists docs_parent_idx on public.docs (parent);
alter table public.docs replica identity full;

create table if not exists public.leases (path text primary key, holder text not null, until timestamptz not null);
create table if not exists public.owners (user_id uuid primary key);
create table if not exists public.people (id uuid primary key, name text, created_at timestamptz not null default now());
create table if not exists public.app_secrets (name text primary key, value text not null);

-- ------------------------------------------------------------------ Qui est qui
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from owners where user_id = auth.uid())
$$;

create or replace function public.my_roster() returns jsonb
language sql stable security definer set search_path = public as $$
  select data from docs where path = 'roster/' || auth.uid()::text
$$;

-- Membre : inscription validée (ou propriétaire)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or coalesce(my_roster()->>'status' = 'active', false)
$$;

-- Manager ou admin validé (équivaut à l'accès « Éditeur » de l'artefact)
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or coalesce(my_roster()->>'status' = 'active' and my_roster()->>'role' in ('chef', 'admin'), false)
$$;

-- Le tout premier compte créé devient le propriétaire (l'admin de l'outil)
create or replace function public.claim_first_owner() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  lock table owners in exclusive mode;
  if not exists (select 1 from owners) then insert into owners values (auth.uid()); end if;
  return is_owner();
end $$;

-- ------------------------------------------------------------------ Règles d'accès par chemin
create or replace function public.can_access(p text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  seg text[] := string_to_array(p, '/');
  me text := auth.uid()::text;
begin
  if me is null then return false; end if;
  if is_owner() then return true; end if;
  case seg[1]
    -- Inscription et profil : chacun le sien, les managers voient tout
    when 'signups', 'profiles' then return seg[2] = me or is_editor();
    -- Équipe, groupes, objectifs : lus par les membres, modifiés par les managers
    when 'roster' then return case when writing then is_editor() else (seg[2] = me or is_member()) end;
    when 'config', 'groups' then return case when writing then is_editor() else is_member() end;
    -- Codes d'équipe : managers seulement
    when 'groupcodes' then return is_editor();
    -- Activité : chacun la sienne, les managers voient tout
    when 'activity' then return seg[2] = me or is_editor();
    -- Le reste (prospects, notes) : membres validés
    else return is_member();
  end case;
end $$;

alter table public.docs enable row level security;
drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_read on public.docs for select to authenticated using (can_access(path, false));
create policy docs_insert on public.docs for insert to authenticated
  with check (can_access(path, true) and parent = regexp_replace(path, '/[^/]+$', ''));
create policy docs_update on public.docs for update to authenticated
  using (can_access(path, true)) with check (can_access(path, true) and parent = regexp_replace(path, '/[^/]+$', ''));
create policy docs_delete on public.docs for delete to authenticated using (can_access(path, true));

-- Mise à jour partielle d'un document (les champs donnés remplacent les anciens, les autres restent)
create or replace function public.doc_update(p_path text, p_patch jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  update docs set data = data || p_patch, updated_at = now() where path = p_path;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return true;
end $$;

-- Réservation courte d'une fiche (deux commerciaux ne prennent jamais la même en même temps)
alter table public.leases enable row level security;
create or replace function public.acquire_lease(p_path text, p_holder text, p_ttl_ms integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then return false; end if;
  insert into leases (path, holder, until) values (p_path, p_holder, now() + make_interval(secs => p_ttl_ms / 1000.0))
  on conflict (path) do update set holder = excluded.holder, until = excluded.until
    where leases.until < now() or leases.holder = excluded.holder;
  return found;
end $$;

-- Noms affichés
alter table public.people enable row level security;
drop policy if exists people_read on public.people;
drop policy if exists people_self on public.people;
drop policy if exists people_self_update on public.people;
create policy people_read on public.people for select to authenticated using (true);
create policy people_self on public.people for insert to authenticated with check (id = auth.uid());
create policy people_self_update on public.people for update to authenticated using (id = auth.uid());

alter table public.owners enable row level security;
drop policy if exists owners_read on public.owners;
create policy owners_read on public.owners for select to authenticated using (true);

-- Clé de lecture des numéros : réservée aux membres validés, posée par le propriétaire
alter table public.app_secrets enable row level security;
drop policy if exists secrets_read on public.app_secrets;
drop policy if exists secrets_write on public.app_secrets;
create policy secrets_read on public.app_secrets for select to authenticated using (is_member());
create policy secrets_write on public.app_secrets for all to authenticated using (is_owner()) with check (is_owner());

-- Pour la mise à jour de nuit : SIREN des entreprises signalées « Mauvais numéro » (rien d'autre)
create or replace function public.wrong_numbers() returns setof text
language sql stable security definer set search_path = public as $$
  select coalesce(data->>'siren', split_part(path, '/', 2)) from docs where parent = 'prospects' and data->>'status' = 'mauvais_numero'
$$;
grant execute on function public.wrong_numbers() to anon, authenticated;

-- Temps réel : la page est prévenue de chaque changement
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; when undefined_object then null;
end $$;
