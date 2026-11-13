// Abo.jsx — /abo: Stand des Abos und der Weg zum Kündigen. Eigene, direkt erreichbare Seite,
// damit man nicht erst im Profil oder im Twitch-Dashboard suchen muss. Der Inhalt ist derselbe
// Baustein wie im Profil (components/AboPanel.jsx).
import React, { useContext } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import AboPanel from "../components/AboPanel";
import { Page, PageHeader, Card, TwitchLoginButton } from "../components/ui";
import NotFound from "./NotFound";
import { salesVisible } from "../config/legal";
import { PREMIUM_PRICE } from "../utils/billingApi";

export default function Abo() {
  const { user } = useContext(TwitchAuthContext);
  // Solange nichts verkauft wird, gibt es diese Seite nicht (siehe config/legal.js)
  if (!salesVisible()) return <NotFound />;

  return (
    <Page width="narrow">
      <SEO title="Abo verwalten" description="Premium-Abo ansehen, verwalten oder kündigen." path="/abo" noindex />
      <PageHeader
        title="Premium-Abo"
        description={
          <>
            {PREMIUM_PRICE} pro Monat, monatlich kündbar. Schaltet die Stream-Szenen der{" "}
            <Link to="/twitch-tools" className="text-accent-soft hover:text-white">Twitch-Overlay-Tools</Link> frei.
          </>
        }
      />

      <Card>
        {user ? (
          <AboPanel returnPath="/abo" />
        ) : (
          <>
            <p className="text-sm text-white/70">Das Abo hängt an deinem Twitch-Konto. Melde dich an, um es zu sehen oder zu kündigen.</p>
            <TwitchLoginButton className="mt-4" />
          </>
        )}
      </Card>
    </Page>
  );
}
