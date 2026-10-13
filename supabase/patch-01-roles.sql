-- Correctif : un manager ne peut plus se nommer admin ni modifier un autre manager.
-- À coller dans Supabase › SQL Editor › Run. Sans risque pour les données.

-- Les managers gèrent des commerciaux : ils ne peuvent ni créer, ni modifier, ni supprimer un manager ou un admin
-- (sinon un manager pourrait se nommer admin). Seul le propriétaire change les rôles.
create or replace function public.roster_write_ok(p text, new_role text, old_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select p not like 'roster/%'
      or is_owner()
      or (coalesce(new_role, 'commercial') = 'commercial' and coalesce(old_role, 'commercial') = 'commercial')
$$;

drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_read on public.docs for select to authenticated using (can_access(path, false));
create policy docs_insert on public.docs for insert to authenticated
  with check (can_access(path, true) and parent = regexp_replace(path, '/[^/]+$', '') and roster_write_ok(path, data->>'role', null));
create policy docs_update on public.docs for update to authenticated
  using (can_access(path, true) and roster_write_ok(path, null, data->>'role'))
  with check (can_access(path, true) and parent = regexp_replace(path, '/[^/]+$', '') and roster_write_ok(path, data->>'role', null));
create policy docs_delete on public.docs for delete to authenticated using (can_access(path, true) and roster_write_ok(path, null, data->>'role'));

