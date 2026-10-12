// Ajoute à chaque entreprise la position (latitude, longitude) du centre de sa commune, pour la prospection
// « autour d'une ville, dans un rayon de X km ». Source : API Découpage administratif (geo.api.gouv.fr), gratuite.
// Usage : npx tsx scripts/geo-annuaire.ts annuaire.json [communes.json]
// Le fichier des communes est téléchargé s'il n'est pas fourni (environ 4 Mo).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { norm } from "../lib/phone-check";

type Commune = { nom: string; code: string; codesPostaux: string[]; centre?: { coordinates: [number, number] } };
type Company = { city: string | null; postalCode: string | null; lat?: number | null; lon?: number | null };

async function communes(path?: string): Promise<Commune[]> {
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch("https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre&format=json", { signal: AbortSignal.timeout(120000) });
      if (res.ok) { const list = await res.json(); if (path) writeFileSync(path, JSON.stringify(list)); return list; }
    } catch { /* nouvel essai */ }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  throw new Error("Communes indisponibles (geo.api.gouv.fr)");
}

async function main() {
  const [file, communesPath] = process.argv.slice(2);
  if (!file) { console.error("Usage : npx tsx scripts/geo-annuaire.ts annuaire.json [communes.json]"); process.exit(1); }
  const byCp = new Map<string, Commune[]>();
  for (const c of await communes(communesPath)) {
    if (!c.centre) continue;
    for (const cp of c.codesPostaux) { if (!byCp.has(cp)) byCp.set(cp, []); byCp.get(cp)!.push(c); }
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as { companies: Company[] };
  let found = 0;
  for (const co of data.companies) {
    const list = co.postalCode ? byCp.get(co.postalCode) ?? [] : [];
    const city = norm(co.city).replace(/\b(cedex|\d+)\b/g, "").trim();
    // La commune du code postal dont le nom correspond à la ville ; sinon la première de ce code postal
    const m = list.find((c) => norm(c.nom) === city) ?? list.find((c) => city && (norm(c.nom).includes(city) || city.includes(norm(c.nom)))) ?? list[0];
    if (m && m.centre) {
      const [lon, lat] = m.centre.coordinates;
      co.lat = Math.round(lat * 1000) / 1000; co.lon = Math.round(lon * 1000) / 1000; found++;
    } else { co.lat = null; co.lon = null; }
  }
  writeFileSync(file, JSON.stringify(data));
  console.log(`Positions : ${found} / ${data.companies.length} entreprises situées.`);
}

main();
