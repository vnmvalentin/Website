// ui/pages/GuidePage.jsx — Anleitung: die Regeln in Ruhe.
import React from "react";
import { Link } from "react-router-dom";
import SEO from "../../../../components/SEO";
import { BloodDrop, Bone, CandleStub } from "../icons/GameIcons.jsx";
import { SCALE_WIN, HAND_LIMIT, WAX_MAX, STALEMATE_TURN } from "../../engine/battle.js";

const Section = ({ title, children }) => (
  <section className="ss-paper p-5 md:p-6">
    <h2 className="ss-title !text-[var(--ink)] text-2xl mb-2">{title}</h2>
    <div className="space-y-2 text-[1.02rem]">{children}</div>
  </section>
);

export default function GuidePage() {
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8 space-y-5">
      <SEO title="Sacrifice & Sigils – Anleitung" description="Regeln von Sacrifice & Sigils: Draft, Opfer, Knochen, Wachs, die Waage, Hinterreihe, Sigils, Totems und der Pfad durchs Aschemoor." path="/sacrifice-and-sigils/anleitung" />
      <h1 className="ss-title text-4xl">Anleitung</h1>
      <p className="ss-dim">Lieber ausprobieren? Das <Link className="underline" to="/sacrifice-and-sigils/tutorial">Tutorial</Link> führt durch einen Übungskampf.</p>

      <Section title="Das Match">
        <p>Lobby → <b>Draft</b> → <b>Pfad</b> → <b>Kampf</b> → [<b>Pfad</b> → <b>Kampf</b>] … → Ende. Wer zuerst die eingestellte Zahl an Kämpfen gewinnt (1, 2 oder 3), gewinnt das Match. Aufgeben kostet das ganze Match.</p>
        <p>Im Draft entsteht aus dem Seed ein Pool aus 24 Karten (14 gewöhnlich, 6 ungewöhnlich, 3 selten, 1 legendär), aufgeteilt in <b>6 Runden à 4 Karten</b>. 3 bis 5 gewöhnliche oder ungewöhnliche Karten kommen doppelt vor – nie in derselben Runde; zwei gleiche lassen sich später verschmelzen. Beim <b>gemeinsamen Pool</b> wird pro Runde abwechselnd gewählt (A, B, A, B), der erste Zugriff wechselt jede Runde. Danach wählt ihr nacheinander Totem-Kopf und Nebendeck-Totem – was einer nimmt, ist für den anderen weg, und auch hier wechselt der Erstzugriff. Bei <b>getrennten Pools</b> sieht jeder eigene 4 Karten pro Runde, nimmt 2 davon, beide gleichzeitig. Legendäre Karten gibt es nur einmal pro Match.</p>
      </Section>

      <Section title="Die Waage">
        <p>Direkter Schaden legt Gewichte in deine Schale – nur die Differenz zählt. Wer <b>{SCALE_WIN} im Vorteil</b> ist, gewinnt den Kampf. Jeder Punkt darüber gibt Splitter.</p>
        <p>Ab Zug {STALEMATE_TURN} (beide zusammen gezählt) brennt die Kerze nieder: Am Ende jedes Zugs bekommt der aktive Spieler 1 Gewicht gegen sich, alle 6 Züge eines mehr.</p>
      </Section>

      <Section title="Totems">
        <p>Ein <b>Stammkopf</b> gibt allen Karten eines Stamms ein Sigil, ein <b>Lanenkopf</b> wirkt auf eine Lane. Der <b>Nebendeck-Kopf</b> gibt jedem deiner Moorlinge ein Sigil – hier gibt es auch Opfer-Sigils wie Dreifachblut oder Wachsgabe, die auf einem ganzen Stamm zu stark wären. Köpfe und Basen tauschst du im Totem-Schrein auf dem Pfad.</p>
      </Section>

      <Section title="Drei Ressourcen">
        <p className="flex items-start gap-2"><BloodDrop size={16} /> <span><b>Blut</b> – opfere eigene Kreaturen beim Ausspielen. Jede zählt als 1 Blut (manche mehr). Blut wird nie gespeichert und hat deshalb keine eigene Anzeige; geopferte Karten geben wie jeder Tod 1 Knochen.</span></p>
        <p className="flex items-start gap-2"><Bone size={18} /> <span><b>Knochen</b> – jede eigene Kreatur, die stirbt oder geopfert wird, gibt 1 Knochen. Sie bleiben den ganzen Kampf.</span></p>
        <p className="flex items-start gap-2"><CandleStub size={20} /> <span><b>Wachs</b> – zu Beginn jedes eigenen Zugs +1 (höchstens {WAX_MAX}). Wachskarten sind berechenbar, oft aber vergänglich (Kerzendocht).</span></p>
      </Section>

      <Section title="Dein Zug">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Zugbeginn:</b> +1 Wachs (Gezeiten: Salz aus der Uferreihe, dann wechselt ggf. der Wasserstand).</li>
          <li><b>Ziehen (Pflicht):</b> eine Karte aus dem Hauptdeck <i>oder</i> dem unendlichen Nebendeck (für beide gleich: Moorlinge, 0/1). Handlimit {HAND_LIMIT}: Wer darüber zieht, wirft ab.</li>
          <li><b>Aktionen:</b> Karten ausspielen (auch in die Hinterreihe), Items benutzen, einmal den Hammer (eigene Karte zerstören: Knochen, aber kein Blut).</li>
          <li><b>Angriff:</b> Beim Zugende greift jede eigene Frontkarte von links nach rechts an. Steht gegenüber eine Karte, bekommt sie Schaden, sonst geht er auf die Waage. <b>Überlauf:</b> Stirbt die Frontkarte, trifft der Rest die Karte der Hinterreihe dahinter, was dann noch übrig ist, landet auf der Waage. Beispiel: 7 Angriff gegen 2 Leben vorn und 3 Leben dahinter – beide sterben, 2 gehen auf die Waage. Schild und Panzer gelten für jede getroffene Karte. Eine abgetauchte Karte (Tauchgang) besetzt die Lane nicht: Der volle Angriff geht direkt auf die Waage.</li>
          <li><b>Zugende:</b> Effekte (Wandern, Heilung, Kerzendocht …), dann rücken Karten der Hinterreihe vor, wenn vor ihnen frei ist.</li>
        </ol>
        <p>Die Hinterreihe greift nicht an und wird nicht angegriffen – außer durch <i>Hinterhalt</i>. Aus einem leeren Hauptdeck zu ziehen kostet Verwesung: 1 Gewicht, dann 2, dann 3 …</p>
        <p>Jeder beginnt mit 3 Karten aus dem Hauptdeck und 1 Nebendeck-Karte. Den Startspieler des nächsten Kampfs bestimmt der Verlierer des vorigen. Im jeweils <b>ersten eigenen Zug</b> greift bei beiden Spielern noch niemand an. Wer als Zweiter beginnt, bekommt +1 Wachs und +1 Knochen.</p>
      </Section>

      <Section title="Sigils und Totems">
        <p>Sigils sind die Fähigkeiten der Karten – alle stehen im <Link className="underline" to="/sacrifice-and-sigils/kartenbuch">Kartenbuch</Link>. Eine Karte trägt höchstens 4.</p>
        <p>Ein <b>Totem</b> besteht aus Kopf und Basis. Ein Stammkopf gibt allen Karten eines Stamms die Basis-Sigil, ein Lanenkopf jeder eigenen Karte in seiner Lane – oder, mit einer Lanen-Eigenschaft, einen besonderen Effekt.</p>
      </Section>

      <Section title="Zwei Zirkel">
        <p>Ein <b>Zirkel</b> ist eine eigene Deck-Welt; beide Zeichner spielen denselben (Lobby: „Zirkel“). Waage, Ziehen, Opfern, Überlauf und Totems gelten überall gleich.</p>
        <p><b>Moor-Zirkel:</b> Blut, Knochen und <b>Wachs</b> (+1 pro Zug), Tiere aus dem Aschemoor, Nebendeck: Moorlinge.</p>
        <p><b>Gezeiten-Zirkel:</b> Blut, Knochen und <b>Salz</b>: zu Beginn jedes eigenen Zugs +1 Salz für jede eigene Karte in der <b>Uferreihe</b> (so heißt hier die Hinterreihe), höchstens 8. Nebendeck: Strandkrabben. Wer als Zweiter beginnt, bekommt +2 Salz und +2 Knochen.</p>
        <p>Beide teilen einen <b>Wasserstand</b>, der jede Runde (beide Züge) weiterläuft: Ebbe → steigendes Wasser → Flut → fallendes Wasser. Der Kampf beginnt bei Ebbe.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Ebbe:</b> Wer eine ganz leere Lane hat, findet zu Zugbeginn eine Nebendeck-Karte.</li>
          <li><b>Flut:</b> Die Uferreihen stehen unter Wasser – nichts rückt nach, Überlauf geht an ihnen vorbei direkt auf die Waage. Karten mit <i>Treibgut</i> werden fortgespült, <i>Heimkehrer</i> kommen auf die Hand zurück.</li>
          <li><b>Hochwasser</b> (steigend, Flut) und <b>Niedrigwasser</b> (fallend, Ebbe): Karten mit Wellen-Zeichen sind nur bei Hochwasser spielbar, Karten mit Sandrippel nur bei Niedrigwasser – dafür sind sie günstiger. Brandung, Gezeitenschild und Flaschenpost werden bei Hochwasser stärker, Watt-Läufer wandern bei Niedrigwasser.</li>
        </ul>
      </Section>

      <Section title="Der Pfad">
        <p>Direkt nach dem Draft und zwischen den Kämpfen wandern beide gleichzeitig über dieselbe Karte (Moor oder Küste) und wählen pro Ebene einen erreichbaren Knoten: Kartenwahl, Verschmelzung, Sigil-Transfer, Lagerfeuer, Karte entfernen, Händler, Totem-Schrein, Kopist oder ein seltenes Ereignis. Was der andere gewählt hat, siehst du erst danach – und auch dann nur die Orte, nicht die Karten.</p>
        <p>Beide starten mit <b>3 Splittern</b>. Weitere gibt es für Überschuss auf der Waage (1 pro Punkt über 5), 3 für einen Sieg und 2 für eine Niederlage. Du trägst höchstens 3 Items.</p>
      </Section>

      <Section title="Bedienung">
        <p>Karte antippen, dann einen Slot antippen. Blutkarten: erst die Opfer nacheinander antippen, dann den Zielslot, dann bestätigen. Auf dem Desktop geht auch Drag & Drop. Lange drücken oder Rechtsklick öffnet die Detailansicht, auf dem Desktop reicht kurzes Verweilen mit der Maus. Ein Klick während einer Animation überspringt sie.</p>
        <p>Tastatur: Mit Tab durch Hand, Slots und Knöpfe, Enter wählt aus bzw. spielt, <kbd>i</kbd> zeigt die Details einer Karte, Escape schließt sie.</p>
      </Section>
    </div>
  );
}
