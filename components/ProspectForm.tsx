"use client";

import { useActionState, useTransition } from "react";
import { updateProspect } from "@/app/actions";
import { STATUTS } from "@/lib/crm";

type Props = {
  prospect: {
    id: string;
    status: string;
    assignedToId: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    nextAction: string | null;
  };
  users: { id: string; name: string }[];
};

export function ProspectForm({ prospect: p, users }: Props) {
  const [state, action, pending] = useActionState(updateProspect, undefined);
  const [, startTransition] = useTransition();
  return (
    <form
      className="form"
      // Soumission manuelle : évite la remise à zéro automatique du formulaire par React après l'envoi.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="id" value={p.id} />
      <div className="grid-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        <div className="field">
          <label className="label" htmlFor="status">Statut</label>
          <select id="status" name="status" className="input" defaultValue={p.status}>
            {STATUTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="assignedToId">Suivi par</label>
          <select id="assignedToId" name="assignedToId" className="input" defaultValue={p.assignedToId ?? ""}>
            <option value="">Personne (libre)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" className="input" defaultValue={p.phone ?? ""} placeholder="04 00 00 00 00" />
        </div>
        <div className="field">
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" defaultValue={p.email ?? ""} placeholder="contact@…" />
        </div>
        <div className="field">
          <label className="label" htmlFor="website">Site web</label>
          <input id="website" name="website" type="url" className="input" defaultValue={p.website ?? ""} placeholder="https://…" />
        </div>
        <div className="field">
          <label className="label" htmlFor="nextAction">Prochaine action</label>
          <input id="nextAction" name="nextAction" type="date" className="input" defaultValue={p.nextAction ?? ""} />
        </div>
      </div>
      {state?.error && <div className="alert" role="alert">{state.error}</div>}
      {state?.ok && <div className="ok" role="status">{state.ok}</div>}
      <button className="btn" type="submit" disabled={pending}>Enregistrer</button>
    </form>
  );
}
