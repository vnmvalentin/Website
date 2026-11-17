// Datenschutz.jsx — /datenschutz: Datenschutzerklärung der Website (ohne den Discord-Bot, der hat
// seine eigene unter /discord-bot/privacy).
//
// Beschrieben ist, was die Website tatsächlich tut. Kommt ein neuer Dienst dazu (Einbettung,
// Zahlungsart, Auswertung), gehört er hier hinein — ebenso, wenn einer wegfällt.
import React from "react";
import { Link } from "react-router-dom";
import LegalPage, { Section, List, Operator, Mail } from "./LegalPage";
import { LEGAL } from "../../config/legal";

const A = ({ to, children }) => <Link to={to} className="text-accent-soft hover:text-white underline-offset-2 hover:underline">{children}</Link>;

export default function Datenschutz() {
  return (
    <LegalPage title="Datenschutzerklärung" description="Welche Daten vnmvalentin.de verarbeitet und wofür." path="/datenschutz">
      <Section title="1. Verantwortlicher">
        <Operator />
        <p>E-Mail: <Mail /></p>
        <p>
          Für den Discord-Bot gilt zusätzlich die <A to="/discord-bot/privacy">Datenschutzerklärung des Discord-Bots</A>.
        </p>
      </Section>

      <Section title="2. Aufruf der Website">
        <p>
          Beim Aufruf überträgt Ihr Browser technisch notwendige Daten an unseren Server: IP-Adresse, Zeitpunkt, aufgerufene
          Adresse, Browserkennung und die zuvor besuchte Seite. Ohne diese Daten lässt sich die Website nicht ausliefern
          (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p>
          Der Server steht bei {LEGAL.hoster || "[Hosting-Anbieter fehlt]"}, der die Daten in unserem Auftrag verarbeitet.
          {LEGAL.logRetentionDays !== null && (
            LEGAL.logRetentionDays > 0
              ? ` Zugriffsprotokolle werden nach ${LEGAL.logRetentionDays} Tagen gelöscht.`
              : " Zugriffsprotokolle mit IP-Adressen werden nicht aufbewahrt."
          )}
        </p>
      </Section>

      <Section title="3. Besucherstatistik ohne Cookies">
        <p>
          Wir zählen selbst, welche Seiten wie oft aufgerufen werden — ohne Cookies und ohne Dienste Dritter. Gespeichert werden
          nur Tagessummen (Aufrufe, Besucher, Verweildauer, Herkunft, Browsersprache, Gerätetyp).
        </p>
        <p>
          Damit ein Besuch am selben Tag nicht doppelt zählt, bilden wir aus IP-Adresse und Browserkennung zusammen mit einem
          täglich neu gewürfelten Zufallswert eine Prüfsumme. Sie wird beim Tageswechsel gelöscht; danach lässt sich kein Besuch
          mehr zuordnen, und über mehrere Tage hinweg ist niemand wiedererkennbar (Art. 6 Abs. 1 lit. f DSGVO). Für angemeldete
          Konten gilt zusätzlich der Absatz „Nutzungstage“ in Abschnitt 4.
        </p>
      </Section>

      <Section title="4. Anmeldung und Konto">
        <p>
          Sie können sich mit Twitch, mit Discord oder ohne beides als Gast anmelden. Jede Anmeldung gehört zu einem Konto
          auf dieser Website; verknüpfen Sie später einen weiteren Anmeldeweg, werden die Daten beider Konten zusammengeführt.
          Zur Anmeldung setzen wir ein technisch notwendiges Sitzungs-Cookie (Art. 6 Abs. 1 lit. b DSGVO, § 25 Abs. 2 TDDDG).
        </p>
        <List items={[
          "Twitch: Wir erhalten von Twitch Ihre Twitch-ID, Ihren Anmelde- und Anzeigenamen und Ihr Profilbild. Twitch ist nötig für Win Tracker, Overlays und die Streamer-Werkzeuge.",
          "Discord: Wir erhalten von Discord Ihre Discord-ID, Ihren Namen und Ihr Profilbild — nur zum Anmelden, ohne Zugriff auf Ihre Server oder Nachrichten.",
          "Gast: Wir legen ein Konto ohne Namen und ohne Kontaktdaten an und zeigen Ihnen einmal einen Wiederherstellungscode. Gespeichert wird davon nur eine Prüfsumme.",
        ]} />
        <p>
          Am Konto speichern wir Ihren Anzeigenamen, die gewählte Sprache und die Spielstände, Erfahrungspunkte und Abzeichen
          der Spiele, die Sie mit Ihrem Konto spielen. Im Profil können Sie Anmeldewege lösen und das Konto mit allen diesen
          Daten selbst löschen.
        </p>
        <p>
          <strong className="text-white/80">Nutzungstage:</strong> Für angemeldete Konten halten wir fest, an welchen Tagen das
          Konto die Website genutzt hat — nur das Datum, ohne Uhrzeit und ohne aufgerufene Seiten. Daraus zählen wir, wie viele
          neue Konten nach 1, 7 und 30 Tagen wiederkommen. Die Tage werden nach 120 Tagen gelöscht (Art. 6 Abs. 1 lit. f DSGVO;
          unser Interesse: zu sehen, ob die Website neue Besucher hält).
        </p>
        <p>
          Mit Twitch angemeldet, speichern wir unter Ihrer Twitch-ID außerdem, was Sie in den Werkzeugen und den
          Twitch-Bereichen anlegen: zum Beispiel Overlays und deren Einstellungen, Spielstände von Farm und adVentures,
          Ranglisten-Einträge und veröffentlichte Level.
        </p>
        <p>
          Verbinden Sie die Twitch-Overlay-Tools mit Ihrem Kanal, speichern wir dafür ein Zugriffstoken von Twitch
          verschlüsselt. Es dient nur dazu, die von Ihnen eingeschalteten Module mit Daten zu versorgen (etwa Ziele,
          Abstimmungen, Vorhersagen), und wird gelöscht, wenn Sie die Verbindung trennen.
        </p>
      </Section>

      <Section title="5. Discord-Bot-Dashboard">
        <p>
          Für das Dashboard des Discord-Bots verbinden Sie freiwillig Ihr Discord-Konto mit Ihrem Twitch-Konto. Dabei erhalten
          wir von Discord Ihre Discord-ID, Ihren Namen und die Liste Ihrer Server und speichern die Zugriffsschlüssel
          verschlüsselt, um Ihnen Ihre Server anzeigen zu können. Die Verbindung lässt sich jederzeit lösen
          (Art. 6 Abs. 1 lit. a DSGVO). Sie ist unabhängig von der Anmeldung mit Discord aus Abschnitt 4.
        </p>
      </Section>

      <Section title="6. Speicher im Browser">
        <p>
          Einige Einstellungen bleiben nur in Ihrem Browser (lokaler Speicher), zum Beispiel Sprache, Lautstärke, Designs und
          Spieleinstellungen. Diese Daten verlassen Ihr Gerät nicht und lassen sich über die Browser-Einstellungen löschen.
        </p>
      </Section>

      <Section title="7. Premium-Abo, Laden und Zahlung über Stripe">
        <p>
          Zahlungen wickelt Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, Irland, ab.
          Auf der Bezahlseite geben Sie Ihre Zahlungsdaten, E-Mail-Adresse und Rechnungsadresse direkt bei Stripe ein; wir
          erhalten keine Karten- oder Kontonummern (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p>Bei uns gespeichert werden:</p>
        <List items={[
          "beim Abo: Ihre Twitch-ID zusammen mit der Kundennummer bei Stripe und der Stand des Abos (aktiv, gekündigt, Ende des bezahlten Zeitraums)",
          "bei Käufen im Laden: die Kennung Ihres Kontos, Art und Betrag des Kaufs, die gekauften Designs und die Kennung der Bezahlsitzung bei Stripe",
          "der Zeitpunkt, zu dem Sie vor dem Kauf dem sofortigen Beginn zugestimmt haben",
        ]} />
        <p>
          Auf der Dankesliste im Laden steht Ihr Kontoname nur, wenn Sie das beim Unterstützen oder später ausdrücklich wählen
          (Art. 6 Abs. 1 lit. a DSGVO). Sie können den Eintrag dort jederzeit wieder entfernen. Löschen Sie Ihr Konto,
          entfallen Abzeichen, Designs und der Eintrag; die Buchung selbst bewahren wir ohne Bezug zum Konto auf, solange es
          steuer- und handelsrechtliche Fristen verlangen.
        </p>
        <p>
          Stripe verarbeitet Daten auch in eigener Verantwortung, unter anderem zur Betrugsvermeidung, und kann sie dafür in die
          USA übermitteln. Näheres steht in der Datenschutzerklärung von Stripe (stripe.com/de/privacy). Abrechnungsdaten
          bewahren wir so lange auf, wie es steuer- und handelsrechtliche Fristen verlangen.
        </p>
      </Section>

      <Section title="8. Inhalte von Dritten">
        <p>Beim Laden bestimmter Seiten ruft Ihr Browser Inhalte direkt bei anderen Anbietern ab. Dabei erfahren diese Ihre IP-Adresse.</p>
        <List items={[
          "Schriften: Die Website lädt Schriftarten von Google Fonts (Google Ireland Limited, Dublin; Übermittlung in die USA möglich).",
          "Twitch: Auf einzelnen Seiten sind Streams oder Clips von Twitch eingebettet (Twitch Interactive, Inc., USA); Profilbilder kommen von Twitch-Servern.",
          "Clash Royale: Kartenbilder werden von Supercell (api-assets.clashroyale.com) geladen; alle übrigen Symbole liegen auf unserem Server.",
        ]} />
        <p>Rechtsgrundlage ist unser Interesse an einer einheitlichen Darstellung und an der Einbindung dieser Inhalte (Art. 6 Abs. 1 lit. f DSGVO).</p>
      </Section>

      <Section title="9. Speicherdauer">
        <p>
          Daten zu Ihrem Konto bleiben gespeichert, solange Sie die Website nutzen. Ihr Konto mit Spielständen und Abzeichen
          können Sie im Profil selbst löschen; Daten, die unter Ihrer Twitch-ID liegen (Abschnitt 4), löschen wir auf Wunsch —
          eine E-Mail an <Mail /> genügt. Nutzungstage löschen wir nach 120 Tagen. Ausgenommen sind Daten, die wir aus
          gesetzlichen Gründen aufbewahren müssen.
        </p>
      </Section>

      <Section title="10. Ihre Rechte">
        <List items={[
          "Auskunft über die zu Ihnen gespeicherten Daten (Art. 15 DSGVO)",
          "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
          "Löschung (Art. 17 DSGVO) und Einschränkung der Verarbeitung (Art. 18 DSGVO)",
          "Datenübertragbarkeit (Art. 20 DSGVO)",
          "Widerspruch gegen Verarbeitungen, die auf berechtigtem Interesse beruhen (Art. 21 DSGVO)",
          "Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)",
        ]} />
        <p>
          Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Behörde Ihres
          Wohnorts.
        </p>
      </Section>
    </LegalPage>
  );
}
