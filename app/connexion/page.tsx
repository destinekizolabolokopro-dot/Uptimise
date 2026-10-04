import { AuthForm } from "@/components/AuthForm";

export default function Page() {
  return (
    <>
      <div className="banner" role="note">[Uptimise] · Annuaire de prospection · Optimisation des charges</div>
      <main className="auth">
        <div className="auth-card">
          <div className="eyebrow">Espace commerciaux</div>
          <h1>
            Bon retour,
            <br />
            <span className="serif">on appelle ?</span>
          </h1>
          <AuthForm mode="login" />
        </div>
      </main>
    </>
  );
}
