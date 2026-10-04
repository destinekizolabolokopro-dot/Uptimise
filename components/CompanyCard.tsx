import Link from "next/link";
import type { Company } from "@/lib/sources";
import { searchLinks } from "@/lib/sources";
import { cibleLabel } from "@/lib/targets";
import { statutLabel } from "@/lib/crm";
import { ClaimButton } from "./ClaimButton";
import { MailIcon, PhoneIcon, UserIcon } from "./Icons";

export type CrmInfo = {
  id: string;
  status: string;
  phone: string | null;
  email: string | null;
  assignedTo: { id: string; name: string } | null;
};

const telHref = (phone: string) => "tel:" + phone.replace(/[^\d+]/g, "").replace(/^0/, "+33");

export function CompanyCard({ c, crm, userId }: { c: Company; crm?: CrmInfo; userId: string }) {
  const meta = [c.activity, [c.postalCode, c.city].filter(Boolean).join(" "), c.headcount].filter(Boolean).join(" · ");
  const mine = crm?.assignedTo?.id === userId;

  return (
    <article className="fiche">
      <div className="fiche-top">
        <span className="fiche-cat">{cibleLabel(c.cible)}</span>
        {crm ? (
          <span className={`tag ${mine ? "mine" : "taken"}`}>
            {crm.assignedTo ? (mine ? "Mon prospect" : `Suivi par ${crm.assignedTo.name}`) : "Dans le CRM"} ·{" "}
            {statutLabel(crm.status)}
          </span>
        ) : (
          <span className="tag">SIREN {c.siren}</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h3>{crm ? <Link href={`/prospects/${crm.id}`}>{c.name}</Link> : c.name}</h3>
        {meta && <div className="meta">{meta}</div>}
      </div>

      <div className="sep" />

      {c.signal && <div className="signal">{c.signal}</div>}
      <p>{c.pitch}</p>
      {c.dirigeant && (
        <div className="dirigeant">
          <UserIcon />
          <span>{c.dirigeant}</span>
        </div>
      )}

      <div className="actions">
        {crm?.phone && (
          <a className="appel" href={telHref(crm.phone)}>
            <span className="num">
              <PhoneIcon />
              <span>{crm.phone}</span>
            </span>
            <span className="cta">Appeler</span>
          </a>
        )}
        {crm?.email && (
          <a className="mail" href={`mailto:${crm.email}`}>
            <MailIcon />
            <span>{crm.email}</span>
          </a>
        )}
        {!crm && <ClaimButton payload={JSON.stringify(c)} />}
        {crm && !crm.phone && (
          <Link className="btn-outline" href={`/prospects/${crm.id}`}>
            Renseigner le téléphone et le mail
          </Link>
        )}
        {!crm?.phone && (
          <div className="find" aria-label="Trouver le téléphone et le mail">
            {searchLinks(c).map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
