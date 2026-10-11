// Fusionne le nouvel annuaire (export du jour) avec l'ancien : rien n'est perdu d'une nuit à l'autre.
// Les entreprises de l'ancien annuaire absentes du nouveau sont conservées (avec leur numéro), et les
// numéros déjà trouvés sont reportés sur le nouvel annuaire. Clé : SIREN + département.
// Usage : npx tsx scripts/merge-annuaire.ts ancien.min.json nouveau.json [max-entreprises]
// Le fichier nouveau.json (format complet) est réécrit avec le résultat.
import { readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, unknown> & { siren: string; department: string | null; phone?: string | null; phoneCheckedAt?: string | null };

function read(path: string): { generatedAt: string; companies: Row[] } {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.companies) return raw;
  return {
    generatedAt: raw.generatedAt,
    companies: raw.rows.map((r: unknown[]) => Object.fromEntries(raw.fields.map((f: string, i: number) => {
      const v = r[i] ?? null;
      return [f, v !== null && raw.dicts[f] ? raw.dicts[f][v as number] : v];
    }))),
  };
}

const [oldPath, newPath, maxArg] = process.argv.slice(2);
const max = Number(maxArg ?? 20000);
const old = read(oldPath);
const fresh = read(newPath);
const key = (c: Row) => `${c.siren}|${c.department}`;

// Numéros déjà connus, par SIREN
const known = new Map<string, Row>();
for (const c of old.companies) if (c.phoneCheckedAt) known.set(c.siren, c);
for (const c of fresh.companies) {
  const k = known.get(c.siren);
  if (k && !c.phoneCheckedAt) Object.assign(c, { phone: k.phone ?? null, website: k.website ?? null, mapsUrl: k.mapsUrl ?? null, phoneCheckedAt: k.phoneCheckedAt });
}
// Anciennes entreprises absentes de l'export du jour : conservées, celles avec numéro en priorité
const seen = new Set(fresh.companies.map(key));
const kept = old.companies.filter((c) => !seen.has(key(c))).sort((a, b) => Number(Boolean(b.phone)) - Number(Boolean(a.phone)));
const companies = [...fresh.companies, ...kept].slice(0, max);
writeFileSync(newPath, JSON.stringify({ generatedAt: fresh.generatedAt, companies }));
const withPhone = new Set(companies.filter((c) => c.phone).map((c) => c.siren)).size;
console.log(`${fresh.companies.length} lignes du jour + ${Math.min(kept.length, Math.max(0, max - fresh.companies.length))} conservées = ${companies.length} ; ${withPhone} entreprises avec numéro.`);
