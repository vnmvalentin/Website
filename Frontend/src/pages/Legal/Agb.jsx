// Agb.jsx — /agb: Allgemeine Geschäftsbedingungen für das Premium-Abo. Die kostenlosen Werkzeuge
// und Spiele sind hier nur am Rand erwähnt; geregelt wird der bezahlte Teil.
import React from "react";
import { Link } from "react-router-dom";
import LegalPage, { Section, List, Operator, Mail } from "./LegalPage";
import { LEGAL } from "../../config/legal";
import { PREMIUM_INCLUDES, PREMIUM_PRICE } from "../../utils/billingApi";

const A = ({ to, children }) => <Link to={to} className="text-violet-300 hover:text-violet-200">{children}</Link>;

export default function Agb() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen" description="AGB für das Premium-Abo auf vnmvalentin.de" path="/agb">
      <Section title="1. Geltungsbereich und Anbieter">
        <p>
          Diese Bedingungen gelten für das kostenpflichtige Premium-Abo auf vnmvalentin.de. Die übrigen Werkzeuge und Spiele der
          Website sind kostenlos und können ohne Abo genutzt werden.
        </p>
        <p>Vertragspartner ist:</p>
        <Operator />
        <p>E-Mail: <Mail /></p>
      </Section>

      <Section title="2. Leistung">
        <p>Das Premium-Abo schaltet für die Dauer der Laufzeit folgende Funktionen der Twitch-Overlay-Tools frei:</p>
        <List items={PREMIUM_INCLUDES} />
        <p>
          Es handelt sich um eine digitale Dienstleistung, die über die Website bereitgestellt wird. Das Abo ist an das
          Twitch-Konto gebunden, mit dem es abgeschlossen wurde, und nicht übertragbar.
        </p>
        <p>
          Die Funktionen bauen auf Schnittstellen von Twitch auf. Ändert oder beendet Twitch eine Schnittstelle, kann sich eine
          Funktion ändern oder entfallen. Fällt dadurch ein wesentlicher Teil der Leistung dauerhaft weg, können Sie das Abo
          sofort kündigen; bereits gezahlte Beträge für die Zeit nach dem Wegfall erstatten wir anteilig.
        </p>
      </Section>

      <Section title="3. Vertragsschluss">
        <p>
          Die Darstellung des Abos auf der Website ist kein bindendes Angebot. Mit dem Klick auf „Zahlungspflichtig abonnieren“
          gelangen Sie zur Bezahlseite unseres Zahlungsdienstleisters Stripe. Der Vertrag kommt zustande, sobald Sie die
          Bestellung dort abschließen und die Zahlung bestätigt wird.
        </p>
        <p>
          Zum Abschluss ist ein Twitch-Konto nötig. Das Abo richtet sich an Personen mit Rechnungsadresse in Deutschland oder
          einem anderen Mitgliedstaat der Europäischen Union. Bestellungen mit einer Rechnungsadresse außerhalb der EU nehmen
          wir nicht an; in diesem Fall wird das Abo beendet und die Zahlung vollständig erstattet.
        </p>
        <p>Vertragssprache ist Deutsch. Den Vertragstext speichern wir nicht gesondert; diese Bedingungen sind jederzeit hier abrufbar.</p>
      </Section>

      <Section title="4. Preis und Zahlung">
        <p>
          Das Abo kostet {PREMIUM_PRICE} pro Monat.{" "}
          {LEGAL.kleinunternehmer
            ? "Als Kleinunternehmer im Sinne von § 19 Abs. 1 UStG berechnen wir keine Umsatzsteuer; der genannte Preis ist der Endpreis."
            : "Der genannte Preis ist der Endpreis."}
        </p>
        <p>
          Der Betrag wird monatlich im Voraus über Stripe eingezogen, erstmals bei Vertragsschluss. Welche Zahlungsarten zur
          Verfügung stehen, zeigt die Bezahlseite. Schlägt eine Abbuchung fehl, versucht Stripe sie erneut; bleibt sie aus, endet
          der Zugang zu den Premium-Funktionen.
        </p>
      </Section>

      <Section title="5. Laufzeit und Kündigung">
        <p>
          Das Abo läuft auf unbestimmte Zeit und verlängert sich jeweils um einen Monat. Sie können es jederzeit zum Ende des
          bezahlten Monats kündigen. Bis dahin bleiben die Funktionen nutzbar.
        </p>
        <p>
          Kündigen können Sie unter <A to="/abo">Abo kündigen</A>, in Ihrem <A to="/profile">Profil</A> oder per E-Mail an{" "}
          <Mail />. Das Recht zur Kündigung aus wichtigem Grund bleibt unberührt.
        </p>
        <p>
          Wir können das Abo mit einer Frist von einem Monat zum Ende eines Abrechnungsmonats kündigen, insbesondere wenn wir
          das Angebot einstellen.
        </p>
      </Section>

      <Section title="6. Widerrufsrecht">
        <p>
          Verbraucherinnen und Verbrauchern steht ein Widerrufsrecht zu. Die Belehrung und ein Muster-Formular finden Sie unter{" "}
          <A to="/widerruf">Widerrufsrecht</A>.
        </p>
      </Section>

      <Section title="7. Verfügbarkeit">
        <p>
          Wir bemühen uns um einen störungsfreien Betrieb, können eine ununterbrochene Verfügbarkeit aber nicht zusagen.
          Wartungsarbeiten, Störungen bei Twitch oder beim Hosting können die Nutzung vorübergehend einschränken.
        </p>
      </Section>

      <Section title="8. Haftung">
        <p>
          Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Schäden aus der Verletzung des Lebens, des
          Körpers oder der Gesundheit. Bei leichter Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen
          Vertragspflicht und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Die Haftung nach dem
          Produkthaftungsgesetz bleibt unberührt.
        </p>
      </Section>

      <Section title="9. Schlussbestimmungen">
        <p>
          Es gilt deutsches Recht. Gegenüber Verbraucherinnen und Verbrauchern gilt diese Rechtswahl nur, soweit ihnen dadurch
          nicht der Schutz zwingender Bestimmungen des Staates entzogen wird, in dem sie ihren gewöhnlichen Aufenthalt haben.
        </p>
        <p>Sollte eine Bestimmung unwirksam sein, bleiben die übrigen Bestimmungen wirksam.</p>
      </Section>
    </LegalPage>
  );
}
