import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchCompanies } from "@/lib/sources";
import { CIBLES, SIGNAUX, type CibleKey, type SignalKey } from "@/lib/targets";
import { departementName } from "@/lib/departements";
import { Filters } from "@/components/Filters";
import { CompanyCard } from "@/components/CompanyCard";
import { Footer, Header } from "@/components/Header";

type Search = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export default async function Annuaire({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const zone = typeof sp.zone === "string" ? sp.zone : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Math.min(40, Number(sp.page) || 1));
  const selected = list(sp.cible).filter((c): c is CibleKey => CIBLES.some((x) => x.key === c));
  const signaux = list(sp.sig).filter((s): s is SignalKey => SIGNAUX.some((x) => x.key === s));
  const cibles = selected.length ? selected : CIBLES.map((c) => c.key);

  const { companies, totals, total, hasMore, errors } = await searchCompanies({ zone, q, cibles, signaux, page });

  const prospects = await prisma.prospect.findMany({
    where: { siren: { in: companies.map((c) => c.siren) } },
    select: {
      id: true, siren: true, status: true, phone: true, email: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });
  const crm = new Map(prospects.map((p) => [p.siren, p]));

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) list(v).forEach((x) => p.append(k, x));
    p.set("page", String(n));
    return `/?${p.toString()}`;
  };

  return (
    <>
      <Header user={user} current="annuaire" />
      <main className="wrap">
        <section className="hero">
          <div className="hero-main">
            <div className="eyebrow">Annuaire de prospection</div>
            <h1>
              <span>Les entreprises</span>
              <span>à appeler,</span>
              <span className="serif">déjà triées.</span>
            </h1>
          </div>
          <p>
            Choisissez votre zone de chalandise et vos cibles. Ajoutez une entreprise à vos prospects : toute
            l’équipe voit qui la suit, et personne n’appelle deux fois.
          </p>
        </section>

        <Suspense>
          <Filters totals={totals} />
        </Suspense>

        <section className="results">
          <div className="results-head">
            <div>
              <h2>
                {total >= 10000 ? "10 000+" : new Intl.NumberFormat("fr-FR").format(total)} entreprise{total > 1 ? "s" : ""}
              </h2>
              <div className="sub">
                {zone ? `${zone} · ${departementName(zone)}` : "Toute la France"}
                {q && ` · « ${q} »`}
                {page > 1 && ` · page ${page}`}
              </div>
            </div>
            {(selected.length > 0 || zone || q) && (
              <Link className="reset" href="/">
                Tout réafficher
              </Link>
            )}
          </div>

          {errors.map((e) => (
            <div key={e} className="alert">
              {e}
            </div>
          ))}

          {companies.length === 0 ? (
            <div className="empty">Aucune entreprise ne correspond à ces critères. Élargissez la zone ou les cibles.</div>
          ) : (
            <div className="cards">
              {companies.map((c) => (
                <CompanyCard key={c.siren} c={c} crm={crm.get(c.siren)} userId={user.id} />
              ))}
            </div>
          )}

          <nav className="pager" aria-label="Pagination">
            {page > 1 && (
              <Link className="chip" href={pageHref(page - 1)}>
                ← Précédentes
              </Link>
            )}
            {hasMore && page < 40 && (
              <Link className="chip" href={pageHref(page + 1)}>
                Suivantes →
              </Link>
            )}
          </nav>
        </section>
      </main>
      <Footer />
    </>
  );
}
