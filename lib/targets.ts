// Définition des cibles de prospection proposées aux commerciaux.

export type CibleKey = "difficulte" | "grandes" | "pme" | "tpe" | "energie" | "nouvelles";
export type SignalKey = "pertes" | "procedure";

export const CIBLES: { key: CibleKey; label: string; hint: string }[] = [
  { key: "difficulte", label: "Entreprises en difficulté", hint: "Pertes ou procédure collective" },
  { key: "grandes", label: "Grandes entreprises", hint: "Plus de 5 000 salariés ou gros CA" },
  { key: "pme", label: "PME / ETI", hint: "20 à 2 000 salariés" },
  { key: "tpe", label: "TPE, commerces, artisans", hint: "Indépendants, hors grands groupes et franchises" },
  { key: "energie", label: "Gros consommateurs d’énergie", hint: "Boulangeries, restauration, froid, industrie…" },
  { key: "nouvelles", label: "Nouvelles sociétés", hint: "Immatriculées ces 6 derniers mois" },
];

export const SIGNAUX: { key: SignalKey; label: string; hint: string }[] = [
  { key: "pertes", label: "Résultat net négatif", hint: "Derniers comptes publiés en perte" },
  { key: "procedure", label: "Procédure collective", hint: "Sauvegarde ou redressement judiciaire (BODACC, 12 mois)" },
];

export const cibleLabel = (k: string | null | undefined) =>
  CIBLES.find((c) => c.key === k)?.label ?? "Prospect";

/** Codes NAF des activités où l'énergie pèse lourd dans les charges. */
export const NAF_ENERGIE = [
  "10.11Z", "10.13A", "10.13B", "10.51A", "10.51C", "10.52Z", "10.71A", "10.71B", "10.71C", "10.71D",
  "10.82Z", "10.89Z", "11.05Z", "13.30Z", "16.10A", "17.12Z", "17.21A", "20.16Z", "22.21Z", "22.22Z",
  "23.13Z", "23.32Z", "23.51Z", "23.61Z", "24.10Z", "24.51Z", "24.52Z", "24.53Z", "25.50A", "25.61Z",
  "52.10A", "52.10B", "55.10Z", "56.10A", "56.10C", "56.21Z", "93.11Z", "93.13Z", "96.01A", "96.01B",
];

/** Tranches d'effectif INSEE. */
export const TRANCHES: Record<string, string> = {
  "00": "0 salarié", "01": "1 à 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés",
  "11": "10 à 19 salariés", "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés",
  "31": "200 à 249 salariés", "32": "250 à 499 salariés", "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés", "51": "2 000 à 4 999 salariés", "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

/**
 * Enseignes de réseaux / franchises exclues de la cible « TPE, commerces, artisans ».
 * Liste indicative : à compléter selon le terrain.
 */
export const RESEAUX_FRANCHISES = [
  "CARREFOUR", "INTERMARCHE", "LECLERC", "SUPER U", "HYPER U", "MAGASINS U", "SYSTEME U", "AUCHAN",
  "CASINO", "FRANPRIX", "MONOPRIX", "SPAR", "VIVAL", "LIDL", "ALDI", "NETTO", "COCCINELLE", "PROXI",
  "MCDONALD", "BURGER KING", "KFC", "SUBWAY", "DOMINO", "PIZZA HUT", "FIVE GUYS", "O'TACOS",
  "BRIOCHE DOREE", "MARIE BLACHERE", "LA MIE CALINE", "BOULANGERIE ANGE", "COLUMBUS CAFE", "STARBUCKS",
  "BASIC FIT", "BASIC-FIT", "KEEP COOL", "FITNESS PARK", "L'ORANGE BLEUE",
  "SPEEDY", "MIDAS", "NORAUTO", "FEU VERT", "POINT S", "EUROREPAR", "CARTER CASH", "VULCO", "AD GARAGE",
  "CENTURY 21", "ORPI", "LAFORET", "GUY HOQUET", "STEPHANE PLAZA", "FONCIA", "CITYA", "NESTENN", "ERA IMMOBILIER",
  "KRYS", "AFFLELOU", "OPTIC 2000", "GENERALE D'OPTIQUE", "OPTICAL CENTER", "ATOL",
  "FRANCK PROVOST", "JEAN LOUIS DAVID", "DESSANGE", "TCHIP", "CAMILLE ALBANE", "SAINT ALGUE", "COIFF&CO",
  "ADECCO", "MANPOWER", "RANDSTAD", "SYNERGIE", "PROMAN", "TEMPORIS",
  "AXA", "ALLIANZ", "GROUPAMA", "MAAF", "MMA", "GAN", "GENERALI", "MACIF", "MAIF", "MATMUT",
  "NICOLAS", "CAVAVIN", "V AND B", "PICARD", "GRAND FRAIS", "BIOCOOP", "LA VIE CLAIRE", "NATURALIA",
  "JEFF DE BRUGES", "PANDORA", "YVES ROCHER", "BUREAU VALLEE", "TOP OFFICE", "MR BRICOLAGE", "BRICOMARCHE",
  "WELDOM", "GAMM VERT", "JARDILAND", "POINT VERT", "TRUFFAUT", "CUISINELLA", "SCHMIDT", "MOBALPA",
  "ADA", "RENT A CAR", "ERAM", "CAMAIEU", "ORCHESTRA", "SERGENT MAJOR", "ADHAP", "O2 CARE",
  "SHIVA", "COMPLETUDE", "ACADOMIA",
];
