-- Uptimise · patch 03 : suppression de comptes par l'admin + protection du « premier compte = admin »
-- À coller dans Supabase › SQL Editor › New query, puis « Run ». On peut le relancer sans risque.

-- Qui est admin : le propriétaire, ou un compte validé avec le rôle « admin »
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or coalesce(my_roster()->>'status' = 'active' and my_roster()->>'role' = 'admin', false)
$$;

-- Supprime un compte entièrement : connexion, fiche d'équipe, profil, activité, réservations.
-- Les fiches prospects qu'il suivait sont libérées (elles restent dans le CRM). Un admin peut supprimer n'importe quel
-- compte, y compris le sien et celui d'un autre admin.
create or replace function public.delete_account(p_uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid_text text := p_uid::text;
begin
  if auth.uid() is null or not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from docs where path in ('roster/' || uid_text, 'signups/' || uid_text, 'profiles/' || uid_text, 'activity/' || uid_text)
     or path like 'activity/' || uid_text || '/%';
  update docs set data = data - 'assignedTo' - 'lockedBy' - 'lockedUntil', updated_at = now()
   where parent = 'prospects' and (data->>'assignedTo' = uid_text or data->>'lockedBy' = uid_text);
  delete from leases where holder = uid_text;
  delete from people where id = p_uid;
  delete from owners where user_id = p_uid;
  if to_regclass('auth.users') is not null then execute 'delete from auth.users where id = $1' using p_uid; end if;
  return true;
end $$;
revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;

-- Un compte supprimé (dont le jeton de connexion court encore une heure) ne peut plus devenir propriétaire
create or replace function public.claim_first_owner() returns boolean
language plpgsql security definer set search_path = public as $$
declare alive boolean := true;
begin
  if auth.uid() is null then return false; end if;
  if to_regclass('auth.users') is not null then execute 'select exists (select 1 from auth.users where id = $1)' into alive using auth.uid(); end if;
  if not alive then return false; end if;
  lock table owners in exclusive mode;
  if not exists (select 1 from owners) then insert into owners values (auth.uid()); end if;
  return is_owner();
end $$;
