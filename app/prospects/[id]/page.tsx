import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchLinks } from "@/lib/sources";
import { cibleLabel } from "@/lib/targets";
import { statutLabel } from "@/lib/crm";
import { addNote, deleteProspect } from "@/app/actions";
import { Footer, Header } from "@/components/Header";
import { ProspectForm } from "@/components/ProspectForm";
import { MailIcon, PhoneIcon } from "@/components/Icons";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [p, users] = await Promise.all([
    prisma.prospect.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!p) notFound();

  return (
    <>
      <Header user={user} current="prospects" />
      <main className="wrap">
        <div className="page-title">
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            <div className="eyebrow">{cibleLabel(p.cible)}</div>
            <h1 style={{ overflowWrap: "anywhere", fontSize: "clamp(34px, 5vw, 60px)" }}>{p.name}</h1>
            <div className="meta">
              {[p.activity, [p.postalCode, p.city].filter(Boolean).join(" "), p.headcount].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span className={`status ${p.status}`} style={{ fontSize: 15, padding: "6px 14px" }}>
            {statutLabel(p.status)}
          </span>
        </div>

        <div className="detail">
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section className="box">
              <h2>Contact</h2>
              {p.phone ? (
                <a className="appel" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>
                  <span className="num"><PhoneIcon /><span>{p.phone}</span></span>
                  <span className="cta">Appeler</span>
                </a>
              ) : (
                <p className="hint">Pas encore de numéro : cherchez-le puis renseignez-le ci-dessous pour toute l’équipe.</p>
              )}
              {p.email && (
                <a className="mail" href={`mailto:${p.email}`}><MailIcon /><span>{p.email}</span></a>
              )}
              <div className="find">
                {searchLinks(p).map((l) => (
                  <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                ))}
              </div>
            </section>

            <section className="box">
              <h2>Suivi</h2>
              <ProspectForm
                users={users}
                prospect={{
                  id: p.id,
                  status: p.status,
                  assignedToId: p.assignedToId,
                  phone: p.phone,
                  email: p.email,
                  website: p.website,
                  nextAction: p.nextAction ? p.nextAction.toISOString().slice(0, 10) : null,
                }}
              />
            </section>

            <section className="box">
              <h2>Notes d’appel</h2>
              <form action={addNote} className="form">
                <input type="hidden" name="prospectId" value={p.id} />
                <textarea name="content" className="input" placeholder="Compte rendu d’appel, interlocuteur, objections, charges à étudier…" required />
                <button className="btn" type="submit">Ajouter la note</button>
              </form>
              {p.notes.length > 0 && (
                <ul className="notes">
                  {p.notes.map((n) => (
                    <li key={n.id}>
                      <div className="by">{n.author.name} · {n.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
                      {n.content}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section className="box">
              <h2>Pourquoi l’appeler</h2>
              {p.signal && <div className="signal">{p.signal}</div>}
              {p.pitch && <p style={{ margin: 0 }}>{p.pitch}</p>}
            </section>
            <section className="box">
              <h2>Fiche entreprise</h2>
              <dl className="kv">
                <dt>SIREN</dt><dd>{p.siren}</dd>
                {p.dirigeant && (<><dt>Dirigeant</dt><dd>{p.dirigeant}</dd></>)}
                {p.address && (<><dt>Adresse</dt><dd>{p.address}</dd></>)}
                {p.website && (<><dt>Site</dt><dd><a href={p.website} target="_blank" rel="noreferrer">{p.website}</a></dd></>)}
                <dt>Suivi par</dt><dd>{p.assignedTo?.name ?? "Personne"}</dd>
                <dt>Ajouté par</dt><dd>{p.createdBy.name}, le {p.createdAt.toLocaleDateString("fr-FR")}</dd>
              </dl>
            </section>
            <form action={deleteProspect}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn danger" type="submit" style={{ width: "100%" }}>Retirer du CRM</button>
            </form>
            <Link href="/prospects" className="reset">← Retour aux prospects</Link>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
