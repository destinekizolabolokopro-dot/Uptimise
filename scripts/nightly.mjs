// Mise à jour de nuit (GitHub Actions) : sans dépendance, juste Node 20.
//  1. appelle Supabase (garde le projet gratuit éveillé) et lit les SIREN signalés « Mauvais numéro » ;
//  2. si la clé PHONES_KEY est fournie, retire ces numéros du fichier chiffré et de l'annuaire (hasPhone).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("supabase/config.json", "utf8"));
const res = await fetch(`${cfg.url}/rest/v1/rpc/wrong_numbers`, {
  method: "POST",
  headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, "content-type": "application/json" },
  body: "{}",
});
if (!res.ok) { console.error("Supabase a répondu", res.status, await res.text()); process.exit(1); }
const wrong = new Set(await res.json());
console.log(`Supabase répond (garde-éveil OK) · ${wrong.size} entreprise(s) signalée(s) « mauvais numéro ».`);

const key = process.env.PHONES_KEY;
if (!key) { console.log("PHONES_KEY absente : le fichier de numéros n'est pas modifié."); process.exit(0); }
const k = Buffer.from(key, "base64");

const encFile = "docs/telephones.enc.json";
const env = JSON.parse(readFileSync(encFile, "utf8"));
const buf = Buffer.from(env.data, "base64");
const d = createDecipheriv("aes-256-gcm", k, Buffer.from(env.iv, "base64"));
d.setAuthTag(buf.subarray(buf.length - 16));
const phones = JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8"));

const gone = Object.keys(phones).filter((s) => wrong.has(s));
if (!gone.length) { console.log("Rien à retirer."); process.exit(0); }
for (const s of gone) delete phones[s];

const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", k, iv);
const out = Buffer.concat([c.update(JSON.stringify(phones), "utf8"), c.final(), c.getAuthTag()]);
writeFileSync(encFile, JSON.stringify({ v: 1, iv: iv.toString("base64"), data: out.toString("base64") }));

const ann = JSON.parse(readFileSync("docs/annuaire.min.json", "utf8"));
const iS = ann.fields.indexOf("siren"), iH = ann.fields.indexOf("hasPhone");
for (const r of ann.rows) if (gone.includes(r[iS])) { while (r.length <= iH) r.push(null); r[iH] = null; }
writeFileSync("docs/annuaire.min.json", JSON.stringify(ann));
console.log(`${gone.length} numéro(s) retiré(s) du site.`);
