-- Uptimise · RÉINITIALISATION DU SITE (irréversible)
-- Supprime TOUS les comptes (y compris l'admin), leurs profils, l'équipe, les groupes, les codes et l'activité.
-- Le premier compte créé ensuite redevient l'admin. La clé de lecture des numéros (app_secrets) est conservée.
-- À coller dans Supabase › SQL Editor › New query, puis « Run ».

-- ÉTAPE 1 · comptes et données d'équipe
delete from docs where split_part(path, '/', 1) in ('roster', 'signups', 'profiles', 'activity', 'groups', 'groupcodes', 'config');
delete from leases;
delete from people;
delete from owners;
delete from auth.users;

-- ÉTAPE 2 · (facultative) fiches prospects, notes et historique d'appels : le CRM repart de zéro.
-- Ne la lance que si tu veux effacer aussi le suivi des entreprises. Retire les deux tirets de la ligne pour l'activer.
-- delete from docs where split_part(path, '/', 1) = 'prospects';

-- Vérification : tout doit afficher 0, et phones_key doit afficher 1
select (select count(*) from auth.users) as comptes, (select count(*) from owners) as admins,
       (select count(*) from docs where split_part(path, '/', 1) in ('roster','signups','profiles')) as fiches_equipe,
       (select count(*) from app_secrets where name = 'phones_key') as cle_numeros;
