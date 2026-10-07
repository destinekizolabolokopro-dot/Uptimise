// Construit la version publique du site pour GitHub Pages (dossier docs/) à partir de artifact/index.html :
// présentation + annuaire, sans connexion ni base partagée.
// Usage : npx tsx scripts/build-pages.ts annuaire.min.json
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const data = process.argv[2];
if (!data) {
  console.error("Usage : npx tsx scripts/build-pages.ts annuaire.min.json");
  process.exit(1);
}

const page = readFileSync("artifact/index.html", "utf8");
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Les entreprises à appeler pour l'optimisation des charges, déjà triées : annuaire de prospection par département et par cible.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2314298C'/%3E%3Cpath d='M10 9v8a6 6 0 0 0 12 0V9' fill='none' stroke='%23fff' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E">
<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script>window.UPTIMISE_PUBLIC = true;</script>
</head>
<body>
${page}
</body>
</html>
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
copyFileSync(data, "docs/annuaire.min.json");
writeFileSync("docs/.nojekyll", "");
console.log("docs/ prêt : index.html, annuaire.min.json");
