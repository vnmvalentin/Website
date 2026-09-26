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
        <p>Lobby → <b>Draft</b> → [<b>Kampf</b> → <b>Pfad</b>] × n → Ende. Wer zuerst die eingestellte Zahl an Kämpfen gewinnt (2 oder 3), gewinnt das Match. Aufgeben kostet das ganze Match.</p>
        <p>Im Draft entsteht aus dem Seed ein Pool aus 24 Karten (14 gewöhnlich, 6 ungewöhnlich, 3 selten, 1 legendär). Beim <b>gemeinsamen Pool</b> wird im Snake-Draft 1-2-2-2… gewählt, bei <b>getrennten Pools</b> wählt jeder gleichzeitig 1 aus 5 aufgedeckten Karten. Danach wählst du einen Totem-Kopf und dein Nebendeck. Legendäre Karten gibt es nur einmal pro Match.</p>
      </Section>

      <Section title="Die Waage">
        <p>Direkter Schaden legt Gewichte in deine Schale – nur die Differenz zählt. Wer <b>{SCALE_WIN} im Vorteil</b> ist, gewinnt den Kampf. Jeder Punkt darüber gibt Splitter.</p>
        <p>Ab Zug {STALEMATE_TURN} (beide zusammen gezählt) brennt die Kerze nieder: Am Ende jedes Zugs bekommt der aktive Spieler 1 Gewicht gegen sich, alle 6 Züge eines mehr.</p>
      </Section>

      <Section title="Drei Ressourcen">
        <p className="flex items-start gap-2"><BloodDrop size={16} /> <span><b>Blut</b> – opfere eigene Kreaturen beim Ausspielen. Jede zählt als 1 Blut (manche mehr). Blut wird nie gespeichert.</span></p>
        <p className="flex items-start gap-2"><Bone size={18} /> <span><b>Knochen</b> – jede eigene Kreatur, die stirbt oder geopfert wird, gibt 1 Knochen. Sie bleiben den ganzen Kampf.</span></p>
        <p className="flex items-start gap-2"><CandleStub size={20} /> <span><b>Wachs</b> – zu Beginn jedes eigenen Zugs +1 (höchstens {WAX_MAX}). Wachskarten sind berechenbar, oft aber vergänglich (Kerzendocht).</span></p>
      </Section>

      <Section title="Dein Zug">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>Zugbeginn:</b> +1 Wachs.</li>
          <li><b>Ziehen (Pflicht):</b> eine Karte aus dem Hauptdeck <i>oder</i> dem unendlichen Nebendeck. Handlimit {HAND_LIMIT}: Wer darüber zieht, wirft ab.</li>
          <li><b>Aktionen:</b> Karten ausspielen (auch in die Hinterreihe), Items benutzen, einmal den Hammer (eigene Karte zerstören: Knochen, aber kein Blut).</li>
          <li><b>Angriff:</b> Beim Zugende greift jede eigene Frontkarte von links nach rechts an. Steht gegenüber eine Karte, bekommt sie Schaden, sonst geht er auf die Waage. Überschüssiger Schaden verfällt.</li>
          <li><b>Zugende:</b> Effekte (Wandern, Heilung, Kerzendocht …), dann rücken Karten der Hinterreihe vor, wenn vor ihnen frei ist.</li>
        </ol>
        <p>Die Hinterreihe greift nicht an und wird nicht angegriffen – außer durch <i>Hinterhalt</i>. Aus einem leeren Hauptdeck zu ziehen kostet Verwesung: 1 Gewicht, dann 2, dann 3 …</p>
        <p>Jeder beginnt mit 3 Karten aus dem Hauptdeck und 1 Nebendeck-Karte. Den Startspieler des nächsten Kampfs bestimmt der Verlierer des vorigen; wer als Zweiter beginnt, bekommt +1 Wachs.</p>
      </Section>

      <Section title="Sigils und Totems">
        <p>Sigils sind die Fähigkeiten der Karten – alle 47 stehen im <Link className="underline" to="/sacrifice-and-sigils/kartenbuch">Kartenbuch</Link>. Eine Karte trägt höchstens 4.</p>
        <p>Ein <b>Totem</b> besteht aus Kopf und Basis. Ein Stammkopf gibt allen Karten eines Stamms die Basis-Sigil, ein Lanenkopf jeder eigenen Karte in seiner Lane – oder, mit einer Lanen-Eigenschaft, einen besonderen Effekt.</p>
      </Section>

      <Section title="Der Pfad durchs Moor">
        <p>Zwischen den Kämpfen wandern beide gleichzeitig über dieselbe Moorkarte und wählen pro Ebene einen erreichbaren Knoten: Kartenwahl, Verschmelzung, Sigil-Transfer, Lagerfeuer, Karte entfernen, Händler, Totem-Schrein, Kopist oder ein seltenes Ereignis. Was der andere gewählt hat, siehst du erst danach – und auch dann nur die Orte, nicht die Karten.</p>
        <p><b>Splitter</b> gibt es für Überschuss auf der Waage (1 pro Punkt über 5), 3 für einen Sieg und 2 für eine Niederlage. Du trägst höchstens 3 Items.</p>
      </Section>

      <Section title="Bedienung">
        <p>Karte antippen, dann einen Slot antippen. Blutkarten: erst die Opfer nacheinander antippen, dann den Zielslot, dann bestätigen. Auf dem Desktop geht auch Drag & Drop. Lange drücken oder Rechtsklick öffnet die Detailansicht. Ein Klick während einer Animation überspringt sie.</p>
      </Section>
    </div>
  );
}
