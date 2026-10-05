// Exporte un instantané de l'annuaire (toutes cibles, tous départements) en JSON,
// utilisé par la version « artefact » du site, qui ne peut pas appeler les API elle-même.
// Usage : npx tsx scripts/export-annuaire.ts [fichier-de-sortie.json] [résultats-par-source]
import { writeFileSync } from "node:fs";
import { DEPARTEMENTS } from "../lib/departements";
import { searchCompanies, type Company } from "../lib/sources";
import { CIBLES } from "../lib/targets";

const out = process.argv[2] ?? "annuaire.json";
const perSource = Number(process.argv[3] ?? 10);

async function main() {
  const rows: Company[] = [];
  const failed: string[] = [];
  for (const [code, name] of DEPARTEMENTS) {
    let res = await searchCompanies({
      zone: code, q: "", cibles: CIBLES.map((c) => c.key), signaux: ["pertes", "procedure"], page: 1, perSource,
    });
    if (res.errors.length) {
      await new Promise((r) => setTimeout(r, 3000));
      res = await searchCompanies({
        zone: code, q: "", cibles: CIBLES.map((c) => c.key), signaux: ["pertes", "procedure"], page: 1, perSource,
      });
    }
    if (res.errors.length) failed.push(code);
    rows.push(...res.companies.map((c) => ({ ...c, department: code })));
    console.log(`${code} ${name}: ${res.companies.length}${res.errors.length ? " (incomplet)" : ""}`);
    await new Promise((r) => setTimeout(r, 800));
  }
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), companies: rows }));
  console.log(`\n${rows.length} entreprises → ${out}. Départements incomplets : ${failed.join(", ") || "aucun"}`);
}

main();
