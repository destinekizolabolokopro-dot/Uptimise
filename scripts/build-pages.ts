// Construit le site hébergé (dossier docs/, servi par GitHub Pages) à partir de artifact/index.html.
//
// Deux versions :
//   - sans supabase/config.json : vitrine publique (présentation + annuaire, sans connexion ni numéros) ;
//   - avec supabase/config.json : l'outil complet (comptes par e-mail, rôles, appels, suivi d'équipe) sur Supabase.
//     Les numéros sont alors publiés chiffrés (docs/telephones.enc.json) : seuls les membres validés reçoivent la clé.
//
// Usage : [PHONES_KEY=<clé base64>] npx tsx scripts/build-pages.ts annuaire.min.json
// Sans PHONES_KEY, le fichier chiffré existant est conservé tel quel.
import { createCipheriv, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const data = process.argv[2];
if (!data) {
  console.error("Usage : [PHONES_KEY=…] npx tsx scripts/build-pages.ts annuaire.min.json");
  process.exit(1);
}
const sbConfig = existsSync("supabase/config.json") ? JSON.parse(readFileSync("supabase/config.json", "utf8")) as { url: string; anonKey: string } : null;
const hosted = Boolean(sbConfig && sbConfig.url && sbConfig.anonKey);

const page = readFileSync("artifact/index.html", "utf8");
const head = hosted
  ? `<script>window.UPTIMISE_SUPABASE = ${JSON.stringify({ url: sbConfig!.url, anonKey: sbConfig!.anonKey })};</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="supabase-runtime.js"></script>`
  : `<script>window.UPTIMISE_PUBLIC = true;</script>`;
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Les entreprises à appeler pour l'optimisation des charges, déjà triées : annuaire de prospection par département et par cible.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2314298C'/%3E%3Cpath d='M10 9v8a6 6 0 0 0 12 0V9' fill='none' stroke='%23fff' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${page}
</body>
</html>
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
if (hosted) copyFileSync("web/supabase-runtime.js", "docs/supabase-runtime.js");

// Annuaire publié sans les numéros ni les liens issus de Google Maps (site ouvert à tous, données personnelles
// des entrepreneurs individuels, conditions de Google). Il indique seulement qu'un numéro vérifié existe (hasPhone),
// pour que le questionnaire de profil puisse compter les entreprises avant la validation de l'accès.
const raw = JSON.parse(readFileSync(data, "utf8")) as { fields: string[]; rows: unknown[][] };
const f = (name: string) => raw.fields.indexOf(name);
const [iPhone, iWeb, iMaps, iProof, iSiren] = [f("phone"), f("website"), f("mapsUrl"), f("phoneProof"), f("siren")];
const phones: Record<string, unknown[]> = {};
for (const r of raw.rows) {
  const phone = r[iPhone];
  if (phone) phones[r[iSiren] as string] = [phone, r[iWeb] ?? null, r[iMaps] ?? null, iProof >= 0 ? r[iProof] ?? null : null];
}
const hidden = ["phone", "website", "mapsUrl", "phoneCheckedAt", "phoneProof"].map(f).filter((i) => i >= 0);
raw.fields = [...raw.fields, "hasPhone"];
for (const r of raw.rows) {
  const has = Boolean(r[iPhone]);
  while (r.length < raw.fields.length - 1) r.push(null);
  for (const i of hidden) r[i] = null;
  r.push(has ? 1 : null);
  while (r.length && r[r.length - 1] === null) r.pop();
}
writeFileSync("docs/annuaire.min.json", JSON.stringify(raw));

// Numéros chiffrés (AES-256-GCM) pour la version complète
const key = process.env.PHONES_KEY;
if (hosted && key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(phones), "utf8"), c.final(), c.getAuthTag()]);
  writeFileSync("docs/telephones.enc.json", JSON.stringify({ v: 1, iv: iv.toString("base64"), data: enc.toString("base64") }));
}
writeFileSync("docs/.nojekyll", "");
console.log(`docs/ prêt (${hosted ? "outil complet sur Supabase" : "vitrine publique"}) : ${Object.keys(phones).length} numéros vérifiés${hosted ? (key ? ", chiffrés" : " (fichier chiffré inchangé : PHONES_KEY absente)") : ", non publiés"}.`);
