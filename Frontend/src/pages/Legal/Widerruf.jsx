// Widerruf.jsx — /widerruf: Widerrufsbelehrung und Muster-Widerrufsformular für das Premium-Abo.
// Der Wortlaut folgt dem gesetzlichen Muster für Dienstleistungen (Anlage 1 und 2 zu Art. 246a § 1
// Abs. 2 EGBGB); eingesetzt werden nur die Angaben des Betreibers aus config/legal.js.
import React from "react";
import LegalPage, { Section, Operator, Mail } from "./LegalPage";
import { LEGAL } from "../../config/legal";

export default function Widerruf() {
  return (
    <LegalPage title="Widerrufsrecht" description="Widerrufsbelehrung und Muster-Widerrufsformular für das Premium-Abo." path="/widerruf">
      <Section title="Widerrufsbelehrung">
        <p>
          Verbraucherinnen und Verbrauchern steht beim Abschluss des Premium-Abos ein Widerrufsrecht nach Maßgabe der folgenden
          Belehrung zu.
        </p>
      </Section>

      <Section title="Widerrufsrecht">
        <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
        <p>Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.</p>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter
          Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das
          beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
        </p>
        <Operator />
        <p>E-Mail: <Mail />{LEGAL.phone && <><br />Telefon: {LEGAL.phone}</>}</p>
        <p>
          Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf
          der Widerrufsfrist absenden.
        </p>
      </Section>

      <Section title="Folgen des Widerrufs">
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und
          spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags
          bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen
          Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall
          werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.
        </p>
        <p>
          Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen
          angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des
          Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum
          Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.
        </p>
      </Section>

      <Section title="Muster-Widerrufsformular">
        <p>(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 space-y-3 text-white/80">
          <p>An</p>
          <Operator />
          <p>E-Mail: <Mail /></p>
          <p>
            Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden
            Dienstleistung: Premium-Abo auf vnmvalentin.de
          </p>
          <p>Bestellt am (*):</p>
          <p>Name des/der Verbraucher(s):</p>
          <p>Twitch-Name des Kontos, an dem das Abo hängt:</p>
          <p>Anschrift des/der Verbraucher(s):</p>
          <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):</p>
          <p>Datum:</p>
          <p className="text-xs text-white/45">(*) Unzutreffendes streichen.</p>
        </div>
      </Section>
    </LegalPage>
  );
}
