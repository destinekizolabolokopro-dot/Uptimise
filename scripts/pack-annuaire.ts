// Compacte l'annuaire pour la page artefact : les textes répétés (activités, accroches, effectifs, villes)
// sont rangés une seule fois dans des dictionnaires, chaque entreprise devient une ligne de valeurs.
// Usage : npx tsx scripts/pack-annuaire.ts annuaire.json annuaire.min.json
import { readFileSync, writeFileSync } from "node:fs";

const FIELDS = [
  "siren", "name", "activity", "city", "postalCode", "address", "department", "headcount",
  "cible", "signal", "pitch", "dirigeant", "phone", "website", "mapsUrl", "phoneCheckedAt",
] as const;
const DICT = new Set(["activity", "city", "headcount", "cible", "pitch", "department"]);

const [src, out] = process.argv.slice(2);
const data = JSON.parse(readFileSync(src, "utf8")) as { generatedAt: string; companies: Record<string, unknown>[] };
const dicts: Record<string, string[]> = {};
const index: Record<string, Map<string, number>> = {};
for (const f of DICT) { dicts[f] = []; index[f] = new Map(); }

const rows = data.companies.map((c) =>
  FIELDS.map((f) => {
    const v = (c[f] ?? null) as string | null;
    if (v === null || v === "") return null;
    if (!DICT.has(f)) return v;
    let i = index[f].get(v);
    if (i === undefined) { i = dicts[f].length; dicts[f].push(v); index[f].set(v, i); }
    return i;
  }),
);
// Retire les valeurs nulles en fin de ligne
for (const r of rows) while (r.length && r[r.length - 1] === null) r.pop();

writeFileSync(out, JSON.stringify({ v: 2, generatedAt: data.generatedAt, fields: FIELDS, dicts, rows }));
console.log(`${rows.length} entreprises → ${out}`);
