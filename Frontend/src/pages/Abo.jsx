// Abo.jsx — /abo: Stand des Abos und der Weg zum Kündigen. Eigene, direkt erreichbare Seite,
// damit man nicht erst im Profil oder im Twitch-Dashboard suchen muss. Der Inhalt ist derselbe
// Baustein wie im Profil (components/AboPanel.jsx).
import React, { useContext } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import AboPanel from "../components/AboPanel";
import NotFound from "./NotFound";
import { salesVisible } from "../config/legal";
import { PREMIUM_PRICE } from "../utils/billingApi";

export default function Abo() {
  const { user, login } = useContext(TwitchAuthContext);
  // Solange nichts verkauft wird, gibt es diese Seite nicht (siehe config/legal.js)
  if (!salesVisible()) return <NotFound />;

  return (
    <div className="w-full max-w-2xl mx-auto text-white">
      <SEO title="Abo verwalten" description="Premium-Abo ansehen, verwalten oder kündigen." path="/abo" noindex />
      <h1 className="text-2xl font-bold">Premium-Abo</h1>
      <p className="mt-2 text-sm text-white/60">
        {PREMIUM_PRICE} pro Monat, monatlich kündbar. Schaltet die Stream-Szenen der{" "}
        <Link to="/twitch-tools" className="text-violet-300 hover:text-violet-200">Twitch-Overlay-Tools</Link> frei.
      </p>

      <div className="mt-6 rounded-md bg-[#0d0d14] border border-white/10 p-5">
        {user ? (
          <AboPanel returnPath="/abo" />
        ) : (
          <>
            <p className="text-sm text-white/70">Das Abo hängt an deinem Twitch-Konto. Melde dich an, um es zu sehen oder zu kündigen.</p>
            <button type="button" onClick={() => login()} className="mt-4 h-10 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-sm font-bold transition-colors">
              Mit Twitch anmelden
            </button>
          </>
        )}
      </div>
    </div>
  );
}
