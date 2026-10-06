# Uptimise · Annuaire de prospection

Site destiné aux commerciaux en **optimisation des charges** : il liste les entreprises intéressantes à appeler,
triées par cible et par zone. Il comprend aussi un **CRM partagé** pour savoir qui suit quel prospect, et ainsi
éviter qu'une même entreprise soit appelée deux fois.

## Fonctionnalités

- **Comptes commerciaux** : inscription libre, connexion par identifiant (e-mail) et mot de passe.
- **Annuaire** (données publiques, gratuites, toute la France) :
  - zone de chalandise par département, recherche par nom, secteur ou ville ;
  - cibles combinables :
    | Cible | Source / règle |
    |---|---|
    | Entreprises en difficulté | Au choix du commercial : *résultat net négatif* (derniers comptes publiés) et/ou *procédure collective* (sauvegarde ou redressement publiés au BODACC dans les 12 derniers mois) |
    | Grandes entreprises | Catégorie INSEE « GE » |
    | PME / ETI | 20 à 2 000 salariés |
    | TPE, commerces, artisans | 1 à 19 salariés, **hors grands groupes et franchises** (≤ 3 établissements, et exclusion d'une liste d'enseignes de réseaux à compléter dans `lib/targets.ts`) |
    | Gros consommateurs d'énergie | Codes NAF énergivores : boulangeries, restauration, froid, fonderies, blanchisseries… |
    | Nouvelles sociétés | Sociétés immatriculées ces 6 derniers mois (BODACC) |
  - chaque fiche indique l'activité, la ville, l'effectif, le signal détecté (résultat, procédure…), un argument
    d'accroche et le dirigeant ;
  - boutons de recherche rapide pour trouver le téléphone et le mail : Google, Google Maps, Pages Jaunes,
    LinkedIn, Societe.com et la fiche officielle.
- **CRM partagé** :
  - « Ajouter à mes prospects » attribue l'entreprise au commercial ; toute l'équipe voit ensuite sur la fiche
    « Suivi par X · statut » ;
  - le téléphone et le mail, une fois saisis, s'affichent sur la carte de l'annuaire avec le bouton **Appeler** ;
  - statuts (À appeler, Appelé, RDV pris, Proposition, Signé, Pas intéressé), réattribution, date de prochaine
    action et notes d'appel ;
  - vues *Mes prospects*, *Toute l'équipe* et *Non attribués*, avec un compteur par statut.

> Les API publiques ne fournissent ni téléphone ni e-mail. On les obtient en un clic grâce aux boutons de
> recherche, puis on les enregistre dans la fiche : ils restent alors disponibles pour toute l'équipe.

## Sources de données

- [API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) (SIRENE, comptes annuels,
  dirigeants). Gratuite, sans clé, limitée à 7 requêtes par seconde.
- [BODACC](https://bodacc-datadila.opendatasoft.com/) (procédures collectives, immatriculations). Gratuit, sans clé.

Les réponses sont mises en cache 6 heures côté serveur.

## Lancer en local

```bash
npm install
cp .env.example .env          # puis remplacer AUTH_SECRET par une valeur aléatoire (openssl rand -base64 32)
npx prisma db push            # crée la base SQLite
npm run dev                   # http://localhost:3000
```

## Mise en production

- La base est en SQLite par défaut. Pour un hébergement de type Vercel, passer `provider = "postgresql"` dans
  `prisma/schema.prisma` et renseigner `DATABASE_URL` (Neon, Supabase…), puis lancer `npx prisma db push`.
- Définir `AUTH_SECRET` (valeur longue et aléatoire).
- `npm run build && npm start`

## Stack

Next.js 15 (App Router, Server Actions), Prisma, sessions JWT (`jose`) et mots de passe hachés avec `bcryptjs`.

## Version artefact claude.ai

`artifact/index.html` est une version autonome du site, publiée comme artefact claude.ai. Elle s'ouvre sur le
**mode appel** : une entreprise à la fois, le numéro en grand, le dirigeant à demander et l'accroche à dire. Un
clic (ou les touches 1 à 5) enregistre le résultat de l'appel, et l'entreprise suivante s'affiche. La file est
commune à toute l'équipe : chaque fiche ouverte est réservée 20 minutes, les rappels reviennent à leur date et
les « pas de réponse » sont relancés automatiquement. L'annuaire et le CRM
partagé sont les mêmes, mais chaque commercial est identifié par son compte claude.ai.

Un artefact ne peut pas appeler les API publiques lui-même. L'annuaire est donc un instantané publié à côté de
la page (`annuaire.json`), que l'on régénère avec :

```bash
npx tsx scripts/export-annuaire.ts annuaire.json 10   # 10 entreprises par cible et par département
```

On ajoute ensuite les numéros de téléphone via Google Maps (Places API) :

```bash
GOOGLE_MAPS_API_KEY=... npx tsx scripts/enrich-phones.ts annuaire.json --max=1000 --depts=69,75
```

Google offre 1 000 recherches gratuites par mois, puis facture environ 35 $ les 1 000. Les résultats sont gardés
dans `phones-cache.json` : une même entreprise n'est jamais recherchée (ni payée) deux fois.

On republie ensuite l'artefact avec ce fichier. Les prospects, les statuts et les notes sont stockés dans la base
partagée de l'artefact, et ne sont pas affectés par une mise à jour de l'annuaire.

### Présentation et connexion

Le lien s'ouvre sur une **page de présentation** destinée aux futurs commerciaux : le principe de l'outil, une
journée type, les cibles, les espaces par rôle et comment rejoindre l'équipe. Le bouton « Se connecter » mène
aux **trois portes** (Commercial, Chef d'équipe, Admin). Seule la porte qui correspond au statut de la personne
s'ouvre : un chef ou un admin peut aussi ouvrir l'espace commercial pour appeler. Sur un appareil où l'on s'est
déjà connecté, le lien ouvre directement son espace.

### Rôles, inscription et suivi d'équipe

- **Admin** : le propriétaire de l'artefact. Il valide les inscriptions, nomme les chefs, suspend un accès.
- **Chef d'équipe** : valide les inscriptions des commerciaux, voit le tableau de bord de l'équipe (temps en ligne,
  début et fin de journée, appels, appels par heure, temps entre deux appels, RDV, objectifs, alertes d'inactivité
  ou de retard) et fixe les objectifs. Il a besoin de l'accès « Éditeur » dans le menu Partager.
- **Commercial** : s'inscrit à sa première visite (prénom, nom, téléphone), puis attend la validation. Il a besoin
  de l'accès « Contributeur ».

Ces règles sont appliquées par la base de l'artefact (et pas seulement par la page). Un commercial ne peut ni se
valider lui-même ni lire l'activité de ses collègues.

### Mise à jour de nuit

Chaque nuit, une tâche programmée recharge l'annuaire (SIRENE, BODACC), reprend les numéros déjà trouvés, en
cherche de nouveaux sur Google Maps si `GOOGLE_MAPS_API_KEY` est définie (33 par nuit, soit environ 1 000 par
mois, la part gratuite), compacte le fichier (`scripts/pack-annuaire.ts`) et republie l'artefact.
