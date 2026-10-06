// Ajoute le téléphone (et le site web) de chaque entreprise de l'annuaire via Google Maps (Places API).
//
// Usage :
//   GOOGLE_MAPS_API_KEY=... npx tsx scripts/enrich-phones.ts annuaire.json [options]
// Options :
//   --max=1000          nombre maximal d'appels payants (1 000 gratuits par mois chez Google)
//   --depts=69,75,13    départements à traiter en priorité (les autres ensuite, dans la limite de --max)
//   --cache=phones-cache.json   résultats déjà obtenus (jamais redemandés, donc jamais repayés)
//   --from=ancien-annuaire.json  reprend les numéros d'un annuaire déjà enrichi (mise à jour de nuit)
//
// Le fichier d'annuaire est réécrit avec les champs phone, website et mapsUrl renseignés.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Company = {
  siren: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  department: string | null;
  cible: string;
  phone?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  phoneCheckedAt?: string | null;
};
type Hit = { phone: string | null; website: string | null; mapsUrl: string | null; checkedAt: string };

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => a.replace(/^--/, "").split("=") as [string, string]),
);
const file = process.argv[2];
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!file) {
  console.error("Usage : GOOGLE_MAPS_API_KEY=... npx tsx scripts/enrich-phones.ts annuaire.json [--max=1000] [--depts=69,75]");
  process.exit(1);
}
if (!key) console.log("GOOGLE_MAPS_API_KEY absente : aucune nouvelle recherche, seuls les numéros déjà connus sont repris.");
const max = key ? Number(args.max ?? 1000) : 0;
const depts = (args.depts ?? "").split(",").filter(Boolean);
const cacheFile = args.cache ?? "phones-cache.json";
const cache: Record<string, Hit> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Le résultat Google est-il bien la même entreprise ? (même code postal ou même ville, et un mot du nom en commun) */
function matches(c: Company, place: { formattedAddress?: string; displayName?: { text?: string } }) {
  const addr = norm(place.formattedAddress ?? "");
  const sameTown = (c.postalCode && addr.includes(c.postalCode)) || (c.city && addr.includes(norm(c.city)));
  const words = norm(c.name.replace(/\(.*?\)/g, ""))
    .split(" ")
    .filter((w) => w.length > 3 && !["societe", "france", "groupe", "entreprise", "services"].includes(w));
  const placeName = norm(place.displayName?.text ?? "");
  const sameName = words.length === 0 || words.some((w) => placeName.includes(w));
  return Boolean(sameTown && sameName);
}

async function lookup(c: Company): Promise<Hit> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key!,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: `${c.name.replace(/\(.*?\)/g, "")} ${c.postalCode ?? ""} ${c.city ?? ""}`.trim(),
      languageCode: "fr",
      regionCode: "FR",
      pageSize: 3,
    }),
  });
  if (!res.ok) throw new Error(`Google Places ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    places?: { displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string }[];
  };
  const place = (data.places ?? []).find((p) => p.nationalPhoneNumber && matches(c, p));
  return {
    phone: place?.nationalPhoneNumber ?? null,
    website: place?.websiteUri ?? null,
    mapsUrl: place?.googleMapsUri ?? null,
    checkedAt: new Date().toISOString(),
  };
}

/** Lit un annuaire au format complet ({companies}) ou compact ({fields, dicts, rows}). */
function readAnnuaire(path: string): Company[] {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.companies) return raw.companies;
  return raw.rows.map((r: unknown[]) =>
    Object.fromEntries(raw.fields.map((f: string, i: number) => {
      const v = r[i] ?? null;
      return [f, v !== null && raw.dicts[f] ? raw.dicts[f][v as number] : v];
    })),
  );
}

async function main() {
  const data = JSON.parse(readFileSync(file, "utf8")) as { companies: Company[] };
  // Numéros déjà connus : dans l'annuaire lui-même ou dans un annuaire précédent (--from)
  const known = [...data.companies, ...(args.from && existsSync(args.from) ? readAnnuaire(args.from) : [])];
  for (const c of known) {
    if (c.phoneCheckedAt && !cache[c.siren]) {
      cache[c.siren] = { phone: c.phone ?? null, website: c.website ?? null, mapsUrl: c.mapsUrl ?? null, checkedAt: c.phoneCheckedAt };
    }
  }
  const rank = (c: Company) => (depts.length && c.department && depts.includes(c.department) ? 0 : 1);
  const todo = [...new Map(data.companies.map((c) => [c.siren, c])).values()]
    .filter((c) => !cache[c.siren])
    .sort((a, b) => rank(a) - rank(b));

  let calls = 0;
  let found = 0;
  for (const c of todo) {
    if (calls >= max) break;
    try {
      cache[c.siren] = await lookup(c);
      calls++;
      if (cache[c.siren].phone) found++;
    } catch (e) {
      console.error(String(e));
      break; // clé invalide, quota atteint… on s'arrête sans perdre ce qui est déjà trouvé
    }
    if (calls % 50 === 0) {
      writeFileSync(cacheFile, JSON.stringify(cache));
      console.log(`${calls} recherches, ${found} numéros trouvés`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  writeFileSync(cacheFile, JSON.stringify(cache));

  for (const c of data.companies) {
    const hit = cache[c.siren];
    if (hit) Object.assign(c, { phone: hit.phone, website: hit.website, mapsUrl: hit.mapsUrl, phoneCheckedAt: hit.checkedAt });
  }
  writeFileSync(file, JSON.stringify(data));
  const withPhone = data.companies.filter((c) => c.phone).length;
  console.log(`\n${calls} recherches payantes ce passage, ${found} numéros trouvés.`);
  console.log(`Annuaire : ${withPhone} / ${data.companies.length} entreprises avec un numéro.`);
}

main();
