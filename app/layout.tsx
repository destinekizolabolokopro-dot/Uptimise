import type { Metadata } from "next";
import { Jost, Instrument_Serif } from "next/font/google";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-jost" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Uptimise · Annuaire de prospection",
  description: "Les entreprises à appeler pour l'optimisation des charges, déjà triées.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${jost.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
