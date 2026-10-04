"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register } from "@/app/actions";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, undefined);
  return (
    <form action={action} className="form">
      {mode === "register" && (
        <div className="field">
          <label className="label" htmlFor="name">Nom et prénom</label>
          <input id="name" name="name" className="input" autoComplete="name" required />
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="email">Identifiant (e-mail)</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 8 : undefined}
          required
        />
      </div>
      {state?.error && <div className="alert" role="alert">{state.error}</div>}
      <button className="btn" type="submit" disabled={pending}>
        {mode === "login" ? "Se connecter" : "Créer mon compte"}
      </button>
      <div className="hint">
        {mode === "login" ? (
          <>Pas encore de compte ? <Link href="/inscription">Créer un compte</Link></>
        ) : (
          <>Déjà inscrit ? <Link href="/connexion">Se connecter</Link></>
        )}
      </div>
    </form>
  );
}
