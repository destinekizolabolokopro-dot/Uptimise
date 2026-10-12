// Deuxième recherche de numéros pour les entreprises que la première n'a pas trouvées.
// Deux tentatives, dans l'ordre, une seule recherche Google par tentative et arrêt dès qu'un numéro sûr est trouvé :
//   1. l'enseigne commerciale (lue gratuitement dans la base SIRENE) + ville
//   2. pour un entrepreneur individuel : prénom et nom du dirigeant + ville
// Un résultat n'est retenu que s'il est prouvé : même code postal et un mot distinctif de l'enseigne ou du nom.
// (L'ancienne recherche par adresse seule est abandonnée : une autre entreprise peut être à la même adresse.)
//
// Usage :
//   GOOGLE_MAPS_API_KEY=... npx tsx scripts/enrich-phones-pass2.ts annuaire.json --cache=phones-cache.json [--max=2000]
// Le cache est complété (champ pass2) : une entreprise déjà retentée n'est jamais recherchée de nouveau.
import { readFileSync, writeFileSync } from "node:fs";
import { strictMatch, validPhone } from "../lib/phone-check";

type Company = {
  siren: string; name: string; city: string | null; postalCode: string | null; address: string | null;
  dirigeant: string | null; activity: string | null; department: string | null;
  phone?: string | null; website?: string | null; mapsUrl?: string | null; phoneCheckedAt?: string | null; phoneProof?: string | null;
};
type Hit = { phone: string | null; website: string | null; mapsUrl: string | null; checkedAt: string; pass2?: string; proof?: string | null };
type Place = { displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string };

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const file = process.argv[2];
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!file || !key || !args.cache) {
  console.error("Usage : GOOGLE_MAPS_API_KEY=... npx tsx scripts/enrich-phones-pass2.ts annuaire.json --cache=phones-cache.json [--max=2000]");
  process.exit(1);
}
const max = Number(args.max ?? 2000);
const cache: Record<string, Hit> = JSON.parse(readFileSync(args.cache, "utf8"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
async function places(textQuery: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key!,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery, languageCode: "fr", regionCode: "FR", pageSize: 5 }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { places?: Place[] }).places ?? [];
}

/** Enseignes et nom commercial de l'établissement, depuis l'API publique Recherche d'entreprises (gratuite). */
async function enseignes(c: Company): Promise<string[]> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${c.siren}&per_page=1`, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const e = ((await res.json()) as { results: any[] }).results[0];
        if (!e) return [];
        const etabs = [e.siege, ...(e.matching_etablissements ?? [])].filter(Boolean);
        const local = etabs.filter((x: any) => !c.postalCode || x.code_postal === c.postalCode);
        const list = (local.length ? local : etabs).flatMap((x: any) => [...(x.liste_enseignes ?? []), x.nom_commercial].filter(Boolean));
        return [...new Set(list as string[])].filter((n) => norm(n) && norm(n) !== norm(c.name));
      }
    } catch { /* nouvel essai */ }
    await sleep(800 * (i + 1));
  }
  return [];
}

const isSoleTrader = (c: Company) => /\(EI\)|\bEI\b/i.test(c.name) || /, /.test(c.name.replace(/\(.*?\)/g, ""));
function personName(c: Company) {
  // Dirigeant connu (« Prénom Nom · Qualité ») ou nom de l'entrepreneur individuel (« NOM, Prénom »)
  if (c.dirigeant) return c.dirigeant.split(" · ")[0];
  const [nom, prenom] = c.name.replace(/\(.*?\)/g, "").split(",").map((x) => x.trim());
  return prenom ? `${prenom.split(" ")[0]} ${nom}` : null;
}

async function tryCompany(c: Company): Promise<{ hit: Place | null; how: string; calls: number }> {
  let calls = 0;
  const town = `${c.postalCode ?? ""} ${c.city ?? ""}`.trim();

  // 1. Enseigne commerciale
  for (const ens of (await enseignes(c)).slice(0, 1)) {
    calls++;
    const hit = (await places(`${ens} ${town}`)).find((p) => validPhone(p.nationalPhoneNumber) && strictMatch(c, p, [c.name, ens]));
    if (hit) return { hit, how: "enseigne", calls };
  }

  // 2. Entrepreneur individuel : dirigeant + ville
  const person = isSoleTrader(c) ? personName(c) : null;
  if (person) {
    calls++;
    const hit = (await places(`${person} ${c.activity ?? ""} ${town}`)).find((p) => validPhone(p.nationalPhoneNumber) && strictMatch(c, p, [person]));
    if (hit) return { hit, how: "dirigeant", calls };
  }

  return { hit: null, how: "", calls };
}

async function main() {
  const data = JSON.parse(readFileSync(file, "utf8")) as { companies: Company[] };
  const unique = [...new Map(data.companies.map((c) => [c.siren, c])).values()];
  const todo = unique.filter((c) => cache[c.siren] && !cache[c.siren].phone && !cache[c.siren].pass2);
  console.log(`${todo.length} entreprises sans numéro à retenter`);

  let calls = 0, found = 0, done = 0;
  const by: Record<string, number> = {};
  for (const c of todo) {
    if (calls >= max) break;
    try {
      const r = await tryCompany(c);
      calls += r.calls;
      cache[c.siren] = r.hit
        ? { phone: r.hit.nationalPhoneNumber ?? null, website: r.hit.websiteUri ?? null, mapsUrl: r.hit.googleMapsUri ?? null, checkedAt: new Date().toISOString(), pass2: r.how, proof: r.how }
        : { ...cache[c.siren], pass2: "aucun" };
      if (r.hit) { found++; by[r.how] = (by[r.how] ?? 0) + 1; }
    } catch (e) {
      console.error(String(e));
      break;
    }
    if (++done % 40 === 0) {
      writeFileSync(args.cache, JSON.stringify(cache));
      console.log(`${calls} recherches, ${found} numéros trouvés`);
    }
    await sleep(120);
  }
  writeFileSync(args.cache, JSON.stringify(cache));

  for (const c of data.companies) {
    const hit = cache[c.siren];
    if (hit) Object.assign(c, { phone: hit.phone, website: hit.website, mapsUrl: hit.mapsUrl, phoneCheckedAt: hit.checkedAt, phoneProof: hit.proof ?? null });
  }
  writeFileSync(file, JSON.stringify(data));
  const withPhone = new Set(data.companies.filter((c) => c.phone).map((c) => c.siren)).size;
  console.log(`\n${calls} recherches payantes, ${found} numéros trouvés (${Object.entries(by).map(([k, v]) => `${k} : ${v}`).join(", ")}).`);
  console.log(`Annuaire : ${withPhone} / ${unique.length} entreprises avec un numéro.`);
}

main();
