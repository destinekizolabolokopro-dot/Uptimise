// Règles communes pour décider qu'un numéro trouvé sur Google Maps est bien celui de l'entreprise.
// Un numéro n'est publié que s'il est prouvé : même code postal ET un mot distinctif du nom (pas « boulangerie »,
// « restaurant », la ville…) présent dans le nom de la fiche Google, ou dans le domaine du site web.

export const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Mots trop courants pour identifier une entreprise : formes juridiques, métiers, mots de liaison.
const GENERIC = new Set(`
sarl sas sasu eurl sci snc scop selarl selas earl gaec ei eirl sa holding societe ste compagnie cie groupe group
france francaise francais international nouvelle nouveau les des aux sur sous pour par avec the and chez
entreprise entreprises services service conseil conseils gestion commerce distribution industrie industries
boulangerie patisserie boucherie charcuterie traiteur restaurant restauration brasserie pizzeria cafe bar hotel
garage auto automobiles pharmacie cabinet agence atelier maison centre studio boutique magasin market supermarche
transports transport logistique construction batiment travaux renovation plomberie electricite menuiserie maconnerie
peinture couverture chauffage nettoyage securite location immobilier immobiliere assurances assurance expertise comptable
architecture sante medical dentaire infirmier kine coiffure beaute optique fleurs taxi ambulances formation
energie solutions technologies systemes ingenierie developpement production fabrication equipement equipements
`.split(/\s+/).filter(Boolean));

/** Mots qui distinguent vraiment l'entreprise (au moins 4 lettres, hors mots courants et hors nom de la ville). */
export function distinctiveWords(name: string, city?: string | null) {
  const town = new Set(norm(city).split(" "));
  return [...new Set(norm(name.replace(/\(.*?\)/g, " ")).split(" "))]
    .filter((w) => w.length >= 4 && !GENERIC.has(w) && !town.has(w) && !/^\d+$/.test(w));
}

/** Numéro français ordinaire : fixe ou mobile, pas de numéro spécial (08) ni de format inconnu. */
export function validPhone(p: string | null | undefined) {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^33/, "0");
  return /^0[1-79]\d{8}$/.test(d);
}
export const phoneKey = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "").slice(-9);

type Place = { displayName?: { text?: string }; formattedAddress?: string };
type Co = { name: string; city: string | null; postalCode: string | null };

/** La fiche Google est-elle sûrement cette entreprise ? `names` : nom légal, enseignes, nom du dirigeant… */
export function strictMatch(c: Co, place: Place, names: string[] = [c.name]) {
  const addr = norm(place.formattedAddress);
  const sameTown = c.postalCode ? addr.split(" ").includes(c.postalCode) : Boolean(c.city && addr.includes(norm(c.city)));
  if (!sameTown) return false;
  const placeWords = new Set(norm(place.displayName?.text).split(" "));
  return names.some((n) => {
    const ws = distinctiveWords(n, c.city);
    return ws.length > 0 && ws.some((w) => placeWords.has(w));
  });
}

/** Le site web trouvé contient-il un mot distinctif du nom dans son domaine ? */
export function websiteConfirms(c: Co, website: string | null | undefined) {
  if (!website) return false;
  const host = website.replace(/^https?:\/\//, "").split("/")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  return distinctiveWords(c.name, c.city).some((w) => w.length >= 5 && host.includes(w));
}
