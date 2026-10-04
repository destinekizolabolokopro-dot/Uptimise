"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DEPARTEMENTS } from "@/lib/departements";
import { CIBLES, SIGNAUX, type CibleKey } from "@/lib/targets";

const fmt = (n: number) => (n >= 10000 ? "10 000+" : new Intl.NumberFormat("fr-FR").format(n));

export function Filters({ totals }: { totals: Partial<Record<CibleKey, number>> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const cibles = params.getAll("cible");
  const signaux = params.getAll("sig");

  function push(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    startTransition(() => router.push(`/?${next.toString()}`, { scroll: false }));
  }

  function toggle(key: "cible" | "sig", value: string) {
    push((p) => {
      const values = p.getAll(key);
      p.delete(key);
      const nextValues = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
      nextValues.forEach((v) => p.append(key, v));
      if (key === "cible" && !nextValues.includes("difficulte")) p.delete("sig");
    });
  }

  // Recherche texte : déclenchée 500 ms après la dernière frappe
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => push((p) => (q ? p.set("q", q) : p.delete("q"))), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <section className="panel" aria-busy={pending}>
      <div className="grid-fields">
        <div className="field">
          <label className="label" htmlFor="zone">
            Zone de chalandise
          </label>
          <select
            id="zone"
            className="input"
            value={params.get("zone") ?? ""}
            onChange={(e) => push((p) => (e.target.value ? p.set("zone", e.target.value) : p.delete("zone")))}
          >
            <option value="">Toute la France</option>
            {DEPARTEMENTS.map(([code, name]) => (
              <option key={code} value={code}>
                {code} · {name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="recherche">
            Recherche
          </label>
          <input
            id="recherche"
            className="input"
            type="search"
            placeholder="Nom, secteur, ville"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <div className="label" id="cibles-titre">
          Cibles {cibles.length === 0 && <span style={{ textTransform: "none", letterSpacing: 0 }}>· toutes affichées</span>}
        </div>
        <div className="chips" role="group" aria-labelledby="cibles-titre">
          {CIBLES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="chip"
              title={c.hint}
              aria-pressed={cibles.includes(c.key)}
              onClick={() => toggle("cible", c.key)}
            >
              <span>{c.label}</span>
              {totals[c.key] !== undefined && <span className="count">{fmt(totals[c.key]!)}</span>}
            </button>
          ))}
        </div>
      </div>

      {cibles.includes("difficulte") && (
        <div className="subfilter">
          <div className="label" id="signaux-titre">
            Signaux de difficulté
          </div>
          <div className="chips" role="group" aria-labelledby="signaux-titre">
            {SIGNAUX.map((s) => (
              <button
                key={s.key}
                type="button"
                className="chip small"
                aria-pressed={signaux.includes(s.key)}
                onClick={() => toggle("sig", s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hint">
            {signaux.length === 0
              ? "Aucun signal choisi : les deux sont appliqués."
              : SIGNAUX.filter((s) => signaux.includes(s.key))
                  .map((s) => s.hint)
                  .join(" · ")}
          </div>
        </div>
      )}
    </section>
  );
}
