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

`artifact/index.html` est une version autonome du site, publiée comme artefact claude.ai. L'annuaire et le CRM
partagé sont les mêmes, mais chaque commercial est identifié par son compte claude.ai.

Un artefact ne peut pas appeler les API publiques lui-même. L'annuaire est donc un instantané publié à côté de
la page (`annuaire.json`), que l'on régénère avec :

```bash
npx tsx scripts/export-annuaire.ts annuaire.json 10   # 10 entreprises par cible et par département
```

On republie ensuite l'artefact avec ce fichier. Les prospects, les statuts et les notes sont stockés dans la base
partagée de l'artefact, et ne sont pas affectés par une mise à jour de l'annuaire.
