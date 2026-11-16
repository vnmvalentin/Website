// ui/path/PathResultBanner.jsx — kurzes Papierbanner mit dem Ergebnis einer eigenen Pfad-Szene (neue Karte, verbrannt,
// zusammengenäht …). Aus PathScreen.jsx herausgelöst, damit es die Pergament-Ansicht und der Tisch im Kerzenlicht
// (ui/table) gleichermaßen zeigen.
import React, { useEffect, useState } from "react";
import SigilIcon from "../icons/SigilIcon.jsx";
import Card from "../card/Card.jsx";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { particles } from "../anim/particles.js";

const RESULT_TEXT = {
  gainCard: (e) => (e.cursed ? "Die Tintenwitwe lächelt. Eine verfluchte Zeichnung ist in deinem Deck." : "Neu in deinem Deck"),
  fused: () => "Zusammengenäht",
  transferred: () => "Das Sigil hat sich eingebrannt",
  campfireBoost: (e) => `Die Flammen stärken die Karte${e.next != null ? ` – nächstes Risiko ${Math.round(e.next * 100)} %` : ""}`,
  campfireLost: () => "Die Karte ist verbrannt …",
  removed: () => "Aus dem Deck getilgt",
  bought: (e) => `${de.items[e.item].name} gekauft`,
  copied: () => "Kopie angefertigt",
  ferried: () => "Der Fährmann hat getauscht",
  oracle: () => "Das Orakel hat gesprochen",
  eclipse: () => "Der Mond verdunkelt sich",
  gamble: (e) => (e.win ? `Gewonnen! +${e.amount} Splitter` : `Verloren: −${e.amount} Splitter`),
  deckChanged: () => "Dein Deck hat sich verändert",
  totemBuilt: () => "Totem geschnitzt",
  totemPart: () => "Neues Totem-Teil",
  pathFlaw: (e) => `Niederlage: eine Karte bekommt bis zum Ende des Pfads ${e.sigil.startsWith("kerzendocht") ? "Kerzendocht 3" : "Treibgut"}`,
  wreck: (e) => (e.item ? `Im Wrack gefunden: ${de.items[e.item].name}` : e.shards ? `Taschen voll – ${e.shards} Splitter statt eines Items` : "Aus dem Wrack kam etwas mit. Eine verfluchte Zeichnung ist in deinem Deck."),
  tideBound: (e) => `Die Karte gehört jetzt den Gezeiten (${e.tide === "high" ? de.tide.highShort : de.tide.lowShort}) und ist stärker`,
};

/**
 * @param {{ events: any[], you: 0|1|null }} props  events: die Chargen des Spiels (game.batches), die letzte zählt
 */
export default function PathResultBanner({ events, you }) {
  const [result, setResult] = useState(/** @type {any} */ (null));
  const lastBatch = events[events.length - 1];
  useEffect(() => {
    if (!lastBatch || you === null) return undefined;
    const ev = [...lastBatch.events].reverse().find((e) => RESULT_TEXT[e.type] && (e.player === undefined || e.player === you));
    if (!ev) return undefined;
    setResult({ ev, id: lastBatch.id });
    if (ev.type === "campfireLost") {
      sound.play("fire");
      particles.burst("ember", window.innerWidth / 2, window.innerHeight / 2, { n: 40, spread: 2 });
    } else if (ev.type === "fused") sound.play("needle");
    else if (ev.type === "transferred") sound.play("fire");
    else if (ev.type === "totemBuilt") particles.burst("shavings", window.innerWidth / 2, window.innerHeight / 2);
    const t = setTimeout(() => setResult((r) => (r?.id === lastBatch.id ? null : r)), 2600);
    return () => clearTimeout(t);
  }, [lastBatch, you]);

  if (!result) return null;
  return (
    <div className="ss-banner ss-paper" style={{ animationDuration: "2.6s", top: "45%" }} role="status">
      <p className="ss-title !text-[var(--ink)] text-2xl mb-2">{RESULT_TEXT[result.ev.type](result.ev)}</p>
      {result.ev.card && (
        <div className={`relative inline-block ${result.ev.type === "campfireLost" ? "ss-a-tear" : result.ev.type === "fused" ? "ss-a-land" : ""}`}>
          <Card card={result.ev.card} width={150} />
          {result.ev.type === "transferred" && <span className="absolute left-1/2 top-1/3 ss-a-burnin" aria-hidden><SigilIcon sigil={result.ev.sigil} size={56} /></span>}
        </div>
      )}
      {result.ev.victimCard && <p className="text-sm mt-2 text-[var(--ink)]">{result.ev.victimCard.name} bekommt Kerzendocht 3.</p>}
    </div>
  );
}
