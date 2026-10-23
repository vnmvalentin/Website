// Impressum.jsx — /impressum. Die Angaben kommen aus config/legal.js.
import React from "react";
import LegalPage, { Section, Operator, Mail } from "./LegalPage";
import { LEGAL } from "../../config/legal";

export default function Impressum() {
  return (
    <LegalPage title="Impressum" description="Anbieterkennzeichnung von vnmvalentin.de" path="/impressum">
      <Section title="Angaben gemäß § 5 DDG">
        <Operator />
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail: <Mail />
          {LEGAL.phone && <><br />Telefon: {LEGAL.phone}</>}
        </p>
      </Section>

      {(LEGAL.vatId || LEGAL.kleinunternehmer) && (
        <Section title="Umsatzsteuer">
          {LEGAL.vatId && <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {LEGAL.vatId}</p>}
          {LEGAL.kleinunternehmer && <p>Als Kleinunternehmer im Sinne von § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.</p>}
        </Section>
      )}

      <Section title="Verantwortlich für den Inhalt gemäß § 18 Abs. 2 MStV">
        <Operator />
      </Section>

      <Section title="Verbraucherstreitbeilegung">
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </p>
      </Section>

      <Section title="Marken und Inhalte Dritter">
        <p>
          Diese Website ist ein unabhängiges Angebot und steht in keiner Verbindung zu Twitch Interactive, Inc. oder Discord Inc.
          Die genannten Namen und Logos sind Marken ihrer jeweiligen Inhaber.
        </p>
        <p>
          Inhalte zu Clash Royale sind Fan-Inhalte: This content is not affiliated with, endorsed, sponsored, or specifically
          approved by Supercell and Supercell is not responsible for it. For more information see Supercell’s Fan Content Policy:
          www.supercell.com/fan-content-policy.
        </p>
      </Section>
    </LegalPage>
  );
}
