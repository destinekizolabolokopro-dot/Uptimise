// Mise à jour de nuit (GitHub Actions). Le robot règle son effort sur l'activité de l'équipe :
//   stock = numéros vérifiés pas encore appelés ; rythme = nouvelles entreprises appelées par jour (14 derniers jours) ;
//   objectif = 3 semaines d'avance (au moins 300 numéros). Stock suffisant → il ne dépense rien (et l'équipe utilise
//   les numéros déjà gardés) ; stock trop bas → il cherche juste ce qu'il faut, dans la limite du budget mensuel.
// Il retire aussi les numéros signalés « Mauvais numéro ».
//
// Variables : PHONES_KEY (clé du fichier chiffré), GOOGLE_MAPS_API_KEY (facultative : sans elle, aucune recherche),
//             GOOGLE_MONTHLY_BUDGET (dollars pour toute l'équipe, 175 par défaut), GOOGLE_NIGHT_CAP (recherches max par nuit, 400 par défaut).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { phoneKey, strictMatch, validPhone } from "../lib/phone-check";

const FREE_SEARCHES = 1000, PRICE = 0.035, TARGET_DAYS = 21, FLOOR = 300, DEFAULT_SUCCESS = 0.27;
const budget = Number(process.env.GOOGLE_MONTHLY_BUDGET ?? 175), nightCap = Number(process.env.GOOGLE_NIGHT_CAP ?? 400);
const cfg = JSON.parse(readFileSync("supabase/config.json", "utf8"));
const rpc = async (name: string) => {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "content-type": "application/json" }, body: "{}",
  });
  if (!r.ok) throw new Error(`${name} : ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// 1. Supabase : garde-éveil + mauvais numéros + consommation
let wrong: Set<string>;
try { wrong = new Set(await rpc("wrong_numbers")); }
catch (e) { console.error("Supabase ne répond pas :", String(e)); process.exit(1); }
let stats: { worked: string[]; new14: number; calls7: number } | null = null;
try { stats = await rpc("pool_stats"); }
catch (e) { console.log("Statistiques indisponibles (patch-02-stats.sql pas encore lancé ?) : le robot ne cherche pas de nouveaux numéros.", String(e).slice(0, 80)); }
console.log(`Supabase répond · ${wrong.size} « mauvais numéro »${stats ? ` · ${stats.worked.length} entreprises travaillées, ${stats.new14} nouvelles sur 14 jours` : ""}.`);

// 2. Fichiers
const key = process.env.PHONES_KEY;
if (!key) { console.log("PHONES_KEY absente : fichier de numéros inchangé."); process.exit(0); }
const k = Buffer.from(key, "base64");
const encFile = "docs/telephones.enc.json";
const env = JSON.parse(readFileSync(encFile, "utf8"));
const buf = Buffer.from(env.data, "base64");
const dec = createDecipheriv("aes-256-gcm", k, Buffer.from(env.iv, "base64"));
dec.setAuthTag(buf.subarray(buf.length - 16));
const phones: Record<string, (string | null)[]> = JSON.parse(Buffer.concat([dec.update(buf.subarray(0, buf.length - 16)), dec.final()]).toString("utf8"));

mkdirSync("data", { recursive: true });
const readJson = <T,>(p: string, d: T): T => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const searched = new Set<string>(readJson<string[]>("data/searched.json", []));
const month = new Date().toISOString().slice(0, 7);
let usage = readJson<{ month: string; searches: number; found: number; total: number; totalFound: number }>("data/usage.json", { month, searches: 0, found: 0, total: 0, totalFound: 0 });
if (usage.month !== month) usage = { ...usage, month, searches: 0, found: 0 };

const ann = JSON.parse(readFileSync("docs/annuaire.min.json", "utf8"));
const F = (n: string) => ann.fields.indexOf(n);
const [iS, iName, iCity, iPC, iDep, iH] = ["siren", "name", "city", "postalCode", "department", "hasPhone"].map(F);
const cell = (r: unknown[], i: number, f: string) => { const v = r[i] ?? null; return v !== null && ann.dicts[f] ? ann.dicts[f][v as number] : v; };
const setHas = (siren: string, on: boolean) => { for (const r of ann.rows) if (r[iS] === siren) { while (r.length <= iH) r.push(null); r[iH] = on ? 1 : null; } };

let changed = false;
for (const s of wrong) if (phones[s]) { delete phones[s]; setHas(s, false); searched.add(s); changed = true; console.log("Retiré (mauvais numéro) :", s); }

// 3. Faut-il chercher ce soir ?
const g = process.env.GOOGLE_MAPS_API_KEY;
if (stats && g) {
  const worked = new Set(stats.worked);
  const stock = Object.keys(phones).filter((s) => !worked.has(s)).length;
  const perDay = stats.new14 / 14;
  const target = Math.max(FLOOR, Math.ceil(perDay * TARGET_DAYS));
  const success = usage.total >= 150 ? Math.max(0.05, usage.totalFound / usage.total) : DEFAULT_SUCCESS;
  const missing = target - stock;
  const monthLeft = Math.max(0, FREE_SEARCHES + Math.floor(budget / PRICE) - usage.searches);
  const n = missing <= 0 ? 0 : Math.min(Math.ceil(missing / success), nightCap, monthLeft);
  console.log(`Stock ${stock} numéros non appelés · rythme ${perDay.toFixed(1)}/jour · objectif ${target} · manque ${Math.max(0, missing)} → ${n} recherche(s) ce soir (mois : ${usage.searches} faites, ${monthLeft} possibles).`);
  if (n > 0) {
    // entreprises sans numéro ni recherche, départements les plus travaillés d'abord
    const depCount = new Map<string, number>();
    for (const r of ann.rows) if (worked.has(r[iS])) { const d = cell(r, iDep, "department") as string; depCount.set(d, (depCount.get(d) ?? 0) + 1); }
    const known = new Set(Object.values(phones).map((p) => phoneKey(p[0])));
    const seen = new Set<string>(), todo: { siren: string; name: string; city: string | null; postalCode: string | null; dep: string }[] = [];
    for (const r of ann.rows) {
      const siren = r[iS] as string;
      if (seen.has(siren) || searched.has(siren) || phones[siren] || r[iH]) continue;
      seen.add(siren);
      todo.push({ siren, name: String(cell(r, iName, "name")), city: cell(r, iCity, "city") as string | null, postalCode: cell(r, iPC, "postalCode") as string | null, dep: String(cell(r, iDep, "department")) });
    }
    todo.sort((a, b) => (depCount.get(b.dep) ?? 0) - (depCount.get(a.dep) ?? 0));
    let done = 0, found = 0;
    for (const c of todo) {
      if (done >= n) break;
      let places: { displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string }[] = [];
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": g, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri" },
          body: JSON.stringify({ textQuery: `${c.name.replace(/\(.*?\)/g, "")} ${c.postalCode ?? ""} ${c.city ?? ""}`.trim(), languageCode: "fr", regionCode: "FR", pageSize: 3 }),
        });
        if (!res.ok) { console.error("Google a refusé :", res.status, "— arrêt des recherches."); break; }
        places = ((await res.json()) as { places?: typeof places }).places ?? [];
      } catch (e) { console.error("Erreur réseau :", String(e).slice(0, 80)); break; }
      done++; searched.add(c.siren);
      const p = places.find((x) => validPhone(x.nationalPhoneNumber) && strictMatch(c, x));
      if (p && !known.has(phoneKey(p.nationalPhoneNumber))) {
        phones[c.siren] = [p.nationalPhoneNumber!, p.websiteUri ?? null, p.googleMapsUri ?? null, "google"];
        known.add(phoneKey(p.nationalPhoneNumber)); setHas(c.siren, true); found++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    usage.searches += done; usage.found += found; usage.total += done; usage.totalFound += found;
    changed = true;
    console.log(`${done} recherche(s), ${found} numéro(s) vérifié(s) ajouté(s).`);
  }
} else if (!g) console.log("GOOGLE_MAPS_API_KEY absente : aucune nouvelle recherche.");

// 4. Écriture
writeFileSync("data/searched.json", JSON.stringify([...searched].sort()));
writeFileSync("data/usage.json", JSON.stringify(usage));
if (changed) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const out = Buffer.concat([c.update(JSON.stringify(phones), "utf8"), c.final(), c.getAuthTag()]);
  writeFileSync(encFile, JSON.stringify({ v: 1, iv: iv.toString("base64"), data: out.toString("base64") }));
  writeFileSync("docs/annuaire.min.json", JSON.stringify(ann));
}
