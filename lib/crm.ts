export const STATUTS = [
  { key: "a_appeler", label: "À appeler" },
  { key: "appele", label: "Appelé – à relancer" },
  { key: "rdv", label: "RDV pris" },
  { key: "proposition", label: "Proposition envoyée" },
  { key: "signe", label: "Signé" },
  { key: "perdu", label: "Pas intéressé" },
] as const;

export type StatutKey = (typeof STATUTS)[number]["key"];

export const statutLabel = (k: string) => STATUTS.find((s) => s.key === k)?.label ?? k;
export const isStatut = (k: string): k is StatutKey => STATUTS.some((s) => s.key === k);
