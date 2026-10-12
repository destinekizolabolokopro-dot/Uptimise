// Ne garde dans l'annuaire que les numéros prouvés. Les autres sont retirés de l'annuaire publié et gardés
// à part (fichier « en attente ») jusqu'à leur vérification.
//
// Un numéro est prouvé quand :
//   - c'est un numéro ordinaire (pas de 08) et il n'appartient qu'à une seule entreprise de l'annuaire ;
//   - personne de l'équipe ne l'a signalé « Mauvais numéro » ;
//   - et la fiche Google d'où il vient est sûrement cette entreprise : même code postal et un mot distinctif
//     du nom dans le nom de la fiche (ou dans le domaine de son site web).
//
// Usage :
//   [GOOGLE_MAPS_API_KEY=...] npx tsx scripts/verify-phones.ts annuaire.json --pending=verification.json [--wrong=mauvais.txt] [--max=1500]
//
// Avec la clé, les numéros en attente sont contrôlés sur Google Maps sans redemander le téléphone : la recherche
// ne demande que le nom, l'adresse et le lien de la fiche (tarif « Pro » de Google, dans son palier gratuit mensuel).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { phoneKey, strictMatch, validPhone, websiteConfirms } from "../lib/phone-check";

type Company = {
  siren: string; name: string; city: string | null; postalCode: string | null;
  phone?: string | null; website?: string | null; mapsUrl?: string | null; phoneCheckedAt?: string | null; phoneProof?: string | null;
};
type Pending = { phone: string; website: string | null; mapsUrl: string | null; checkedAt: string | null };

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const file = process.argv[2];
if (!file || !args.pending) {
  console.error("Usage : npx tsx scripts/verify-phones.ts annuaire.json --pending=verification.json [--wrong=mauvais.txt] [--max=1500]");
  process.exit(1);
}
const key = process.env.GOOGLE_MAPS_API_KEY;
const max = key ? Number(args.max ?? 1500) : 0;
const data = JSON.parse(readFileSync(file, "utf8")) as { companies: Company[] };
const pending: Record<string, Pending> = existsSync(args.pending) ? JSON.parse(readFileSync(args.pending, "utf8")) : {};
const wrong = new Set(args.wrong && existsSync(args.wrong) ? readFileSync(args.wrong, "utf8").split(/\s+/).filter(Boolean) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1. Candidats : un par SIREN (numéro publié non prouvé, ou numéro en attente)
const bySiren = new Map<string, Company>();
for (const c of data.companies) if (!bySiren.has(c.siren)) bySiren.set(c.siren, c);
const cand = new Map<string, Pending & { proof: string | null }>();
for (const c of bySiren.values()) {
  if (c.phone) cand.set(c.siren, { phone: c.phone, website: c.website ?? null, mapsUrl: c.mapsUrl ?? null, checkedAt: c.phoneCheckedAt ?? null, proof: c.phoneProof ?? null });
  else if (pending[c.siren]) cand.set(c.siren, { ...pending[c.siren], proof: null });
}

// 2. Rejets sûrs : format, numéro partagé par plusieurs entreprises, signalé « Mauvais numéro »
const owners = new Map<string, Set<string>>();
for (const [s, p] of cand) { const k = phoneKey(p.phone); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k)!.add(s); }
const verdict = new Map<string, string>(); // siren -> preuve ("site", "google", …) ou "rejet:<raison>"
for (const [s, p] of cand) {
  if (wrong.has(s)) verdict.set(s, "rejet:signalé mauvais numéro");
  else if (!validPhone(p.phone)) verdict.set(s, "rejet:numéro spécial ou invalide");
  else if (owners.get(phoneKey(p.phone))!.size > 1) verdict.set(s, "rejet:numéro partagé par plusieurs entreprises");
  else if (p.proof) verdict.set(s, p.proof);
  else if (websiteConfirms(bySiren.get(s)!, p.website)) verdict.set(s, "site");
}

// 3. Contrôle Google (nom + adresse de la fiche), seulement pour ce qui reste
type Place = { displayName?: { text?: string }; formattedAddress?: string; googleMapsUri?: string };
async function search(textQuery: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key!, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.googleMapsUri" },
    body: JSON.stringify({ textQuery, languageCode: "fr", regionCode: "FR", pageSize: 5 }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { places?: Place[] }).places ?? [];
}
/** Enseignes de l'établissement (API publique Recherche d'entreprises, gratuite). */
async function enseignes(c: Company): Promise<string[]> {
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${c.siren}&per_page=1`, { signal: AbortSignal.timeout(12000) });
    const e = res.ok ? ((await res.json()) as { results: any[] }).results[0] : null;
    if (!e) return [];
    const etabs = [e.siege, ...(e.matching_etablissements ?? [])].filter(Boolean).filter((x: any) => !c.postalCode || x.code_postal === c.postalCode);
    return [...new Set(etabs.flatMap((x: any) => [...(x.liste_enseignes ?? []), x.nom_commercial].filter(Boolean)) as string[])];
  } catch { return []; }
}
/** Retrouve la fiche Google d'où vient le numéro et vérifie qu'elle est bien celle de l'entreprise. */
async function googleCheck(c: Company, mapsUrl: string | null): Promise<{ ok: boolean; calls: number }> {
  if (!mapsUrl) return { ok: false, calls: 0 };
  const town = `${c.postalCode ?? ""} ${c.city ?? ""}`.trim();
  const same = (await search(`${c.name.replace(/\(.*?\)/g, "")} ${town}`)).find((p) => p.googleMapsUri === mapsUrl);
  if (same) return { ok: strictMatch(c, same), calls: 1 };
  // Fiche trouvée à l'origine par l'enseigne commerciale : on la recherche par l'enseigne
  const ens = await enseignes(c);
  if (!ens.length) return { ok: false, calls: 1 };
  const viaEns = (await search(`${ens[0]} ${town}`)).find((p) => p.googleMapsUri === mapsUrl);
  return { ok: Boolean(viaEns && strictMatch(c, viaEns, [c.name, ...ens])), calls: 2 };
}

async function main() {
  let calls = 0, ok = 0, ko = 0;
  for (const [s, p] of cand) {
    if (verdict.has(s) || calls >= max) continue;
    try {
      const r = await googleCheck(bySiren.get(s)!, p.mapsUrl);
      calls += r.calls;
      if (r.ok) { verdict.set(s, "google"); ok++; }
      else { verdict.set(s, "rejet:fiche Google différente"); ko++; }
    } catch (e) { console.error(String(e)); break; }
    await sleep(120);
  }

  // 4. Écriture : l'annuaire ne garde que les numéros prouvés
  const out: Record<string, Pending> = {};
  const why: Record<string, number> = {};
  for (const c of data.companies) {
    const p = cand.get(c.siren);
    if (!p) continue;
    const v = verdict.get(c.siren);
    if (v && !v.startsWith("rejet:")) {
      Object.assign(c, { phone: p.phone, website: p.website, mapsUrl: p.mapsUrl, phoneCheckedAt: p.checkedAt, phoneProof: v });
    } else {
      // Retiré de l'annuaire ; gardé en attente s'il n'est pas encore jugé (jamais redemandé à Google s'il est rejeté)
      Object.assign(c, { phone: null, website: null, mapsUrl: null, phoneProof: null, phoneCheckedAt: p.checkedAt ?? new Date().toISOString() });
      if (!v) out[c.siren] = { phone: p.phone, website: p.website, mapsUrl: p.mapsUrl, checkedAt: p.checkedAt };
    }
  }
  for (const v of verdict.values()) why[v] = (why[v] ?? 0) + 1;
  writeFileSync(file, JSON.stringify(data));
  writeFileSync(args.pending, JSON.stringify(out));
  const verified = new Set(data.companies.filter((c) => c.phone).map((c) => c.siren)).size;
  console.log(`Contrôles Google ce passage : ${calls} (${ok} confirmés, ${ko} rejetés).`);
  console.log(`Détail : ${Object.entries(why).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  console.log(`Annuaire : ${verified} entreprises avec un numéro vérifié ; ${Object.keys(out).length} numéros en attente de vérification.`);
}

main();
