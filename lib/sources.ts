// Récupération des entreprises depuis les sources publiques et gratuites :
//  - API Recherche d'entreprises (annuaire-entreprises.data.gouv.fr) : base SIRENE + finances + dirigeants
//  - BODACC (bodacc-datadila.opendatasoft.com) : procédures collectives et immatriculations
import nafCodes from "@socialgouv/codes-naf/index.json";
import {
  NAF_ENERGIE,
  RESEAUX_FRANCHISES,
  TRANCHES,
  type CibleKey,
  type SignalKey,
} from "./targets";

const SIRENE_URL = "https://recherche-entreprises.api.gouv.fr/search";
const BODACC_URL =
  "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";
const CACHE_SECONDS = 60 * 60 * 6;

export type Company = {
  siren: string;
  name: string;
  activity: string | null;
  city: string | null;
  postalCode: string | null;
  address: string | null;
  department: string | null;
  headcount: string | null;
  cible: CibleKey;
  signal: string | null;
  pitch: string;
  dirigeant: string | null;
};

export type SearchParams = {
  zone: string;
  q: string;
  cibles: CibleKey[];
  signaux: SignalKey[];
  page: number;
  /** Nombre de résultats par source (par défaut : PAGE_SIZE réparti entre les sources). */
  perSource?: number;
};

export type SourceResult = {
  cible: CibleKey;
  total: number;
  companies: Company[];
  error?: string;
};

const NAF_LABELS = new Map((nafCodes as { id: string; label: string }[]).map((n) => [n.id, n.label]));
const nafLabel = (code?: string | null) => (code ? NAF_LABELS.get(code) ?? code : null);

const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n / 1000)) + " k€";

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-'’(./&])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());

/** Met en forme les raisons sociales saisies en majuscules (« SARL DUPONT (EI) » → « Sarl Dupont (EI) »). */
const prettyName = (s: string) =>
  s === s.toUpperCase()
    ? titleCase(s).replace(/\b(Sas|Sarl|Sasu|Eurl|Sa|Sci|Snc|Ei|Eirl|Selarl|Scop|Gie|Sc)\b/g, (m) => m.toUpperCase())
    : s;

// ---------------------------------------------------------------------------
// SIRENE
// ---------------------------------------------------------------------------

type SireneEntreprise = {
  siren: string;
  nom_complet: string;
  nombre_etablissements_ouverts?: number;
  activite_principale?: string;
  categorie_entreprise?: string | null;
  tranche_effectif_salarie?: string | null;
  date_creation?: string;
  finances?: Record<string, { ca?: number | null; resultat_net?: number | null }> | null;
  dirigeants?: { type_dirigeant: string; nom?: string; prenoms?: string; qualite?: string; denomination?: string }[];
  siege?: {
    adresse?: string;
    code_postal?: string;
    libelle_commune?: string;
    departement?: string;
    liste_enseignes?: string[] | null;
  };
  matching_etablissements?: {
    adresse?: string;
    code_postal?: string;
    libelle_commune?: string;
    liste_enseignes?: string[] | null;
  }[];
};

/** fetch avec quelques tentatives : les API publiques limitent le débit (429) et coupent parfois. */
async function fetchJson<T>(url: URL, attempts = 3): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  let status = 0;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 700 * 2 ** i));
    try {
      const res = await fetch(url, { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(12_000) });
      status = res.status;
      if (res.ok) return { ok: true, data: (await res.json()) as T };
      if (res.status !== 429 && res.status < 500) break;
    } catch {
      status = 0;
    }
  }
  return { ok: false, status };
}

const errorMessage = (source: string, status: number) =>
  status === 429
    ? `${source} : trop de requêtes, réessayez dans un instant`
    : `${source} : service momentanément indisponible${status ? ` (${status})` : ""}, rechargez la page`;

const BIG_TRANCHES = "12,21,22,31,32,41,42";
const SMALL_TRANCHES = "01,02,03,11";

function sireneParams(cible: CibleKey, signal?: SignalKey): Record<string, string> | null {
  switch (cible) {
    case "grandes":
      return { categorie_entreprise: "GE" };
    case "pme":
      return { categorie_entreprise: "PME,ETI", tranche_effectif_salarie: BIG_TRANCHES };
    case "tpe":
      return { categorie_entreprise: "PME", tranche_effectif_salarie: SMALL_TRANCHES };
    case "energie":
      return { activite_principale: NAF_ENERGIE.join(","), tranche_effectif_salarie: "02,03,11," + BIG_TRANCHES };
    case "difficulte":
      return signal === "pertes" ? { resultat_net_max: "-1" } : null;
    default:
      return null;
  }
}

function lastFinances(e: SireneEntreprise) {
  const years = Object.keys(e.finances ?? {}).sort();
  const year = years.at(-1);
  if (!year) return null;
  return { year, ...e.finances![year] };
}

function firstDirigeant(e: SireneEntreprise) {
  const p = e.dirigeants?.find((d) => d.type_dirigeant === "personne physique" && d.nom);
  if (!p) return null;
  const nom = titleCase(p.nom!.replace(/\s*\(.*\)\s*/, ""));
  const prenom = p.prenoms ? titleCase(p.prenoms.split(/[ ,]/)[0]) : "";
  return [`${prenom} ${nom}`.trim(), p.qualite].filter(Boolean).join(" · ");
}

function isNetworkOrFranchise(e: SireneEntreprise) {
  if ((e.nombre_etablissements_ouverts ?? 1) > 3) return true;
  const names = [
    e.nom_complet,
    ...(e.siege?.liste_enseignes ?? []),
    ...(e.matching_etablissements ?? []).flatMap((m) => m.liste_enseignes ?? []),
  ]
    .join(" | ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return RESEAUX_FRANCHISES.some((brand) =>
    new RegExp(`(^|[^A-Z0-9])${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`).test(names),
  );
}

function pitchFor(cible: CibleKey, e: SireneEntreprise): { pitch: string; signal: string | null } {
  const fin = lastFinances(e);
  const naf = e.activite_principale ?? "";
  const etab = e.nombre_etablissements_ouverts ?? 1;
  switch (cible) {
    case "difficulte":
      return {
        signal: fin?.resultat_net != null ? `Résultat ${fin.year} : ${euros(fin.resultat_net)}` : null,
        pitch: "Comptes dans le rouge : chaque charge fixe renégociée améliore directement le résultat.",
      };
    case "grandes":
      return {
        signal: fin?.ca ? `CA ${fin.year} : ${euros(fin.ca)}` : null,
        pitch: `${etab} établissement${etab > 1 ? "s" : ""} ouvert${etab > 1 ? "s" : ""} : télécoms, flotte et énergie à regrouper. Viser un seul poste de charges pour obtenir un rendez-vous.`,
      };
    case "pme":
      return {
        signal: fin?.ca ? `CA ${fin.year} : ${euros(fin.ca)}` : null,
        pitch: "Souvent sans service achats : le dirigeant ou le DAF négocie seul tous ses contrats.",
      };
    case "tpe":
      return {
        signal: null,
        pitch: "Loyer, assurances, énergie et télécoms rarement comparés : gains rapides et décision en un rendez-vous.",
      };
    case "energie": {
      let pitch = "Activité énergivore : contrat d’électricité et de gaz à remettre en concurrence.";
      if (naf.startsWith("10.71")) pitch = "Fours et chambres froides : la facture d’énergie pèse de plus en plus lourd.";
      else if (naf.startsWith("56") || naf.startsWith("55")) pitch = "Cuisine, chauffage et froid : trois postes d’énergie à optimiser.";
      else if (naf.startsWith("52.10")) pitch = "Entreposage et froid 24 h/24 : contrat d’électricité à remettre en concurrence.";
      else if (naf.startsWith("96.01")) pitch = "Machines énergivores et contrats jamais renégociés.";
      else if (naf.startsWith("93")) pitch = "Chauffage, eau chaude et éclairage en continu : énergie et maintenance à revoir.";
      return { signal: fin?.ca ? `CA ${fin.year} : ${euros(fin.ca)}` : null, pitch };
    }
    default:
      return { signal: null, pitch: "" };
  }
}

function fromSirene(cible: CibleKey, e: SireneEntreprise, zone: string): Company {
  const { pitch, signal } = pitchFor(cible, e);
  // Quand une zone est choisie, on affiche l'établissement situé dans cette zone plutôt que le siège.
  const local = zone && e.siege?.departement !== zone ? e.matching_etablissements?.[0] : undefined;
  const site = local ?? e.siege;
  return {
    siren: e.siren,
    name: prettyName(e.nom_complet),
    activity: nafLabel(e.activite_principale),
    city: site?.libelle_commune ? titleCase(site.libelle_commune) : null,
    postalCode: site?.code_postal ?? null,
    address: site?.adresse ?? null,
    department: local ? zone : e.siege?.departement ?? null,
    headcount: e.tranche_effectif_salarie ? TRANCHES[e.tranche_effectif_salarie] ?? null : null,
    cible,
    signal,
    pitch,
    dirigeant: firstDirigeant(e),
  };
}

async function searchSirene(
  cible: CibleKey,
  params: Record<string, string>,
  p: SearchParams,
  perPage: number,
): Promise<SourceResult> {
  const independents = cible === "tpe";
  // On demande plus de résultats pour compenser le filtre réseaux / franchises.
  const size = Math.min(25, independents ? perPage * 2 : perPage);
  const build = (page: number, per: number) => {
    const url = new URL(SIRENE_URL);
    const query: Record<string, string> = {
      ...params,
      etat_administratif: "A",
      est_association: "false",
      est_collectivite_territoriale: "false",
      page: String(page),
      per_page: String(per),
    };
    if (p.q) query.q = p.q;
    if (p.zone) query.departement = p.zone;
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  };

  type Payload = { results: SireneEntreprise[]; total_results: number };
  let page = p.page;
  let total: number | null = null;
  if (independents) {
    // L'API classe les entreprises par nombre d'établissements décroissant : les chaînes et
    // réseaux arrivent en premier. On lit donc la liste par la fin, où se trouvent les indépendants.
    const head = await fetchJson<Payload>(build(1, 1));
    if (!head.ok) return { cible, total: 0, companies: [], error: errorMessage("Annuaire des entreprises", head.status) };
    total = head.data.total_results;
    // L'API n'accepte que 10 000 résultats et 1 000 pages au maximum.
    const lastPage = Math.max(1, Math.min(1000, Math.ceil(Math.min(total, 10_000) / size)));
    page = lastPage - (p.page - 1);
    if (page < 1) return { cible, total, companies: [] };
  }

  const res = await fetchJson<Payload>(build(page, size));
  if (!res.ok) return { cible, total: 0, companies: [], error: errorMessage("Annuaire des entreprises", res.status) };
  let results = res.data.results;
  if (independents) results = results.filter((e) => !isNetworkOrFranchise(e));
  // Le filtre de l'API porte sur un exercice quelconque : on garde celles dont les derniers comptes sont en perte.
  if (params.resultat_net_max) results = results.filter((e) => (lastFinances(e)?.resultat_net ?? 0) < 0);
  return {
    cible,
    total: total ?? res.data.total_results,
    companies: results.slice(0, perPage).map((e) => fromSirene(cible, e, p.zone)),
  };
}

// ---------------------------------------------------------------------------
// BODACC
// ---------------------------------------------------------------------------

type BodaccRecord = {
  id: string;
  commercant: string;
  ville?: string;
  cp?: string;
  numerodepartement?: string;
  registre?: string[];
  dateparution: string;
  jugement?: string | null;
  listepersonnes?: string | null;
};

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
const frDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });

function parseJson<T>(s?: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

type BodaccPersonne = {
  typePersonne?: string;
  activite?: string;
  denomination?: string;
  formeJuridique?: string;
  administration?: string;
  adresseSiegeSocial?: { numeroVoie?: string; typeVoie?: string; nomVoie?: string; codePostal?: string; ville?: string };
  adressePP?: { numeroVoie?: string; typeVoie?: string; nomVoie?: string; codePostal?: string; ville?: string };
};

function bodaccPersonne(r: BodaccRecord): BodaccPersonne | null {
  const lp = parseJson<{ personne: BodaccPersonne | BodaccPersonne[] }>(r.listepersonnes);
  if (!lp) return null;
  return Array.isArray(lp.personne) ? lp.personne[0] : lp.personne;
}

function fromBodacc(cible: CibleKey, r: BodaccRecord): Company | null {
  const siren = r.registre?.find((x) => /^\d{9}$/.test(x));
  if (!siren) return null;
  const pers = bodaccPersonne(r);
  const adr = pers?.adresseSiegeSocial ?? pers?.adressePP;
  const address = adr
    ? [adr.numeroVoie, adr.typeVoie, adr.nomVoie].filter(Boolean).join(" ") + ` ${adr.codePostal ?? ""} ${adr.ville ?? ""}`
    : null;
  const dirigeant = pers?.administration?.split(/[,;]/)[0]?.trim() ?? null;
  let signal: string | null = null;
  let pitch = "";
  if (cible === "difficulte") {
    const j = parseJson<{ nature?: string; date?: string }>(r.jugement);
    const nature = j?.nature?.replace(/^Jugement (d'ouverture d'une procédure de |d'ouverture de la procédure de |arrêtant le |modifiant le )?/i, "") ?? "Procédure collective";
    signal = `${nature.charAt(0).toUpperCase()}${nature.slice(1)} · BODACC du ${frDate(r.dateparution)}`;
    pitch = "Sous procédure collective : l’entreprise doit réduire ses charges pour tenir son plan. Loyers, énergie et assurances à renégocier en priorité.";
  } else {
    signal = `Immatriculée · BODACC du ${frDate(r.dateparution)}`;
    pitch = "Société toute récente : contrats d’énergie, d’assurance, de télécoms et de locaux à signer maintenant.";
  }
  return {
    siren,
    name: prettyName(pers?.denomination ?? r.commercant),
    activity: pers?.activite ? pers.activite.charAt(0).toUpperCase() + pers.activite.slice(1) : pers?.formeJuridique ?? null,
    city: r.ville ?? adr?.ville ?? null,
    postalCode: r.cp ?? adr?.codePostal ?? null,
    address,
    department: r.numerodepartement ?? null,
    headcount: null,
    cible,
    signal,
    pitch,
    dirigeant,
  };
}

async function searchBodacc(cible: CibleKey, p: SearchParams, perPage: number): Promise<SourceResult> {
  const where: string[] = [];
  if (cible === "difficulte") {
    where.push(`familleavis="collective"`, `dateparution>=date'${isoDaysAgo(365)}'`);
    where.push(`(jugement like "*sauvegarde*" or jugement like "*redressement*")`);
    where.push(`not (jugement like "*liquidation*")`);
  } else {
    where.push(`familleavis="creation"`, `dateparution>=date'${isoDaysAgo(183)}'`);
    where.push(`listepersonnes like "*\\"pm\\"*"`);
  }
  if (p.zone) where.push(`numerodepartement="${p.zone.replace(/"/g, "")}"`);
  if (p.q) where.push(`search(${JSON.stringify(p.q)})`);

  const url = new URL(BODACC_URL);
  url.searchParams.set("where", where.join(" and "));
  url.searchParams.set("order_by", "dateparution desc");
  url.searchParams.set("limit", String(perPage));
  url.searchParams.set("offset", String((p.page - 1) * perPage));
  url.searchParams.set("select", "id,commercant,ville,cp,numerodepartement,registre,dateparution,jugement,listepersonnes");

  const res = await fetchJson<{ total_count: number; results: BodaccRecord[] }>(url);
  if (!res.ok) return { cible, total: 0, companies: [], error: errorMessage("BODACC", res.status) };
  const data = res.data;
  return {
    cible,
    total: data.total_count,
    companies: data.results.map((r) => fromBodacc(cible, r)).filter((c): c is Company => c !== null),
  };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

type Job = { cible: CibleKey; run: (perPage: number) => Promise<SourceResult> };

export const PAGE_SIZE = 24;

export async function searchCompanies(p: SearchParams) {
  const jobs: Job[] = [];
  for (const cible of p.cibles) {
    if (cible === "nouvelles") {
      jobs.push({ cible, run: (n) => searchBodacc(cible, p, n) });
    } else if (cible === "difficulte") {
      const signaux = p.signaux.length ? p.signaux : (["pertes", "procedure"] as SignalKey[]);
      for (const s of signaux) {
        if (s === "procedure") jobs.push({ cible, run: (n) => searchBodacc(cible, p, n) });
        else jobs.push({ cible, run: (n) => searchSirene(cible, sireneParams(cible, s)!, p, n) });
      }
    } else {
      jobs.push({ cible, run: (n) => searchSirene(cible, sireneParams(cible)!, p, n) });
    }
  }

  const perJob = p.perSource ?? Math.max(3, Math.ceil(PAGE_SIZE / Math.max(1, jobs.length)));
  // Requêtes légèrement décalées pour rester sous la limite de débit de l'API (7 req/s).
  const settled = await Promise.allSettled(
    jobs.map((j, i) => new Promise((r) => setTimeout(r, i * 250)).then(() => j.run(perJob))),
  );
  const results: SourceResult[] = settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { cible: jobs[i].cible, total: 0, companies: [], error: "Source indisponible" },
  );

  // Totaux par cible (pour les compteurs des filtres)
  const totals: Partial<Record<CibleKey, number>> = {};
  for (const r of results) totals[r.cible] = (totals[r.cible] ?? 0) + r.total;

  // Entrelace les résultats des différentes cibles et supprime les doublons
  const seen = new Set<string>();
  const companies: Company[] = [];
  const max = Math.max(0, ...results.map((r) => r.companies.length));
  for (let i = 0; i < max; i++) {
    for (const r of results) {
      const c = r.companies[i];
      if (c && !seen.has(c.siren)) {
        seen.add(c.siren);
        companies.push(c);
      }
    }
  }

  const hasMore = results.some((r) => r.companies.length > 0 && r.total > p.page * perJob);
  const errors = [...new Set(results.map((r) => r.error).filter(Boolean))] as string[];
  return { companies, totals, total: results.reduce((a, r) => a + r.total, 0), hasMore, errors };
}

/** Liens de recherche rapide pour trouver le téléphone et le mail. */
export function searchLinks(c: { name: string; city: string | null; siren: string }) {
  const who = encodeURIComponent(c.name);
  const where = encodeURIComponent(c.city ?? "");
  const both = encodeURIComponent(`${c.name} ${c.city ?? ""}`.trim());
  return [
    { label: "Google", href: `https://www.google.com/search?q=${both}+t%C3%A9l%C3%A9phone` },
    { label: "Maps", href: `https://www.google.com/maps/search/${both}` },
    { label: "Pages Jaunes", href: `https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=${who}&ou=${where}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/search/results/companies/?keywords=${who}` },
    { label: "Societe.com", href: `https://www.societe.com/cgi-bin/search?champs=${c.siren}` },
    { label: "Fiche officielle", href: `https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}` },
  ];
}
