import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATUTS, isStatut, statutLabel } from "@/lib/crm";
import { cibleLabel } from "@/lib/targets";
import { Footer, Header } from "@/components/Header";

type Search = Record<string, string | string[] | undefined>;
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("fr-FR") : "—");

export default async function Prospects({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const vue = sp.vue === "equipe" ? "equipe" : sp.vue === "libres" ? "libres" : "miens";
  const statut = typeof sp.statut === "string" && isStatut(sp.statut) ? sp.statut : null;

  const scope: Prisma.ProspectWhereInput =
    vue === "miens" ? { assignedToId: user.id } : vue === "libres" ? { assignedToId: null } : {};

  const [rows, counts] = await Promise.all([
    prisma.prospect.findMany({
      where: { ...scope, ...(statut ? { status: statut } : {}) },
      include: { assignedTo: { select: { id: true, name: true } } },
      orderBy: [{ nextAction: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 500,
    }),
    prisma.prospect.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);
  const count = (k: string) => counts.find((c) => c.status === k)?._count ?? 0;
  const href = (p: Record<string, string | null>) => {
    const s = new URLSearchParams();
    const merged = { vue, statut, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) s.set(k, v);
    return `/prospects?${s.toString()}`;
  };

  return (
    <>
      <Header user={user} current="prospects" />
      <main className="wrap">
        <div className="page-title">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="eyebrow">CRM partagé</div>
            <h1>
              Prospects <span className="serif">en cours.</span>
            </h1>
          </div>
          <div className="chips" role="group" aria-label="Vue">
            {[
              ["miens", "Mes prospects"],
              ["equipe", "Toute l’équipe"],
              ["libres", "Non attribués"],
            ].map(([k, l]) => (
              <Link key={k} className="chip small" aria-pressed={vue === k} href={href({ vue: k, statut: null })}>
                {l}
              </Link>
            ))}
          </div>
        </div>

        <div className="stats">
          {STATUTS.map((s) => (
            <Link
              key={s.key}
              className="stat"
              aria-current={statut === s.key}
              href={href({ statut: statut === s.key ? null : s.key })}
            >
              <div className="n">{count(s.key)}</div>
              <div className="l">{s.label}</div>
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            Aucun prospect ici pour l’instant. <Link href="/">Parcourez l’annuaire</Link> et ajoutez des entreprises.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Cible</th>
                  <th>Statut</th>
                  <th>Suivi par</th>
                  <th>Téléphone</th>
                  <th>Prochaine action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="name" href={`/prospects/${p.id}`}>
                        {p.name}
                      </Link>
                      <div className="hint">{[p.postalCode, p.city].filter(Boolean).join(" ")}</div>
                    </td>
                    <td>{cibleLabel(p.cible)}</td>
                    <td>
                      <span className={`status ${p.status}`}>{statutLabel(p.status)}</span>
                    </td>
                    <td>{p.assignedTo ? (p.assignedTo.id === user.id ? "Moi" : p.assignedTo.name) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {p.phone ? <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a> : "—"}
                    </td>
                    <td>{fmtDate(p.nextAction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
