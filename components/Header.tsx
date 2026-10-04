import Link from "next/link";
import { logout } from "@/app/actions";

export function Header({ user, current }: { user: { name: string }; current: "annuaire" | "prospects" }) {
  return (
    <>
      <div className="banner" role="note">
        Données officielles et publiques · SIRENE, comptes annuels et BODACC, mises à jour chaque jour
      </div>
      <div className="wrap">
        <header className="site-header">
          <Link href="/" className="logo">
            [Uptimise]
          </Link>
          <nav className="nav" aria-label="Navigation principale">
            <Link href="/" aria-current={current === "annuaire" ? "page" : undefined}>
              Annuaire
            </Link>
            <Link href="/prospects" aria-current={current === "prospects" ? "page" : undefined}>
              Prospects
            </Link>
            <span className="who">{user.name}</span>
            <form action={logout}>
              <button className="linklike" type="submit">
                Déconnexion
              </button>
            </form>
          </nav>
        </header>
      </div>
    </>
  );
}

export function Footer() {
  return (
    <div className="wrap">
      <footer className="site-footer">
        <span>[Uptimise] · Optimisation des charges</span>
        <span>
          Sources : <a href="https://annuaire-entreprises.data.gouv.fr">Annuaire des entreprises</a> ·{" "}
          <a href="https://www.bodacc.fr">BODACC</a>
        </span>
      </footer>
    </div>
  );
}
