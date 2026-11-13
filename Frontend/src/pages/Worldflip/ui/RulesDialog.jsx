// ui/RulesDialog.jsx — Regeln von Worldflip: Grundregel, die vier Welten mit Gesetz und Ereignissen, alle Effektkarten.
import React, { useEffect } from "react";
import { X } from "lucide-react";
import CardImg from "../components/CardImg.jsx";
import { EVENTS, EVENTS_BY_WORLD, KINDS, RULES, WORLDS } from "../engine/index.js";

// Beispielkarte je Art: Karten ohne feste Welt bekommen eine zum Zeigen
const SPECIALS = Object.keys(KINDS)
  .filter((k) => k !== "n")
  .map((k, i) => ({ k, w: KINDS[k].world === null ? i % 4 : KINDS[k].world }));

export default function RulesDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="wf-dialog-backdrop" onClick={onClose}>
      <div className="wf-card wf-dialog" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-labelledby="wf-rules-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 id="wf-rules-title" className="wf-display text-2xl">Regeln</h2>
          <button type="button" onClick={onClose} className="wf-icon-btn" aria-label="Schließen"><X size={17} /></button>
        </div>
        <div className="wf-rows px-5 pb-5 text-[15px]">
          <section className="py-3">
            <h3 className="wf-section-title mb-1">Ziel</h3>
            <p className="wf-dim">Wer zuerst alle Karten los ist, gewinnt. Im 2 gegen 2 gewinnt das Team, sobald einer von beiden leer ist.</p>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-1">Dein Zug</h3>
            <p className="wf-dim">
              Leg eine Karte, die zur aktuellen Welt gehört (gleiche Farbe) oder dieselbe Zahl bzw. dasselbe Symbol zeigt wie die
              oberste Karte. Passt nichts, zieh vom Stapel — passt die gezogene Karte, darfst du sie gleich legen.
            </p>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-1">Die Welt kippt</h3>
            <p className="wf-dim">
              Der Tisch schwebt immer über der Welt, die gerade gilt. Legt jemand eine andere Farbe, dreht sich die neue Welt unter
              den Tisch — und mit ihr wechselt das Gesetz. Bei der Wirbel-Karte dreht sich der Tisch einmal herum, danach wird
              andersherum gespielt (die Pfeile am Tischrand zeigen die Richtung).
            </p>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-2">Vier Welten, vier Gesetze</h3>
            <p className="wf-dim mb-3">
              Jede Karte lädt ihre Welt auf. Die Ladung bleibt, auch wenn die Welt wechselt. Bei {RULES.CHARGE_MAX} bricht die Welt
              aus und löst ihr angekündigtes Ereignis aus. Die Ladung siehst du am Weltenrad oben in der Mitte und an den leuchtenden
              Steinen am Tischrand; oben links steht, welches Ereignis der aktuellen Welt als Nächstes kommt.
            </p>
            <ul className="grid gap-4 sm:grid-cols-2">
              {WORLDS.map((w, i) => (
                <li key={w.id}>
                  <div className="flex gap-2 items-center mb-1">
                    <span className="wf-chip" style={{ background: w.color }} />
                    <b>{w.name}</b>
                  </div>
                  <p className="mb-1"><b style={{ color: w.color }}>{w.law}:</b> <span className="wf-dim">{w.lawText}</span></p>
                  <ul className="text-sm wf-dim">
                    {EVENTS_BY_WORLD[i].map((id) => <li key={id}><b className="text-[var(--wf-text)]">{EVENTS[id].name}</b> — {EVENTS[id].text}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-2">Effektkarten</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {SPECIALS.map((c) => (
                <li key={c.k} className="flex gap-3 items-center">
                  <CardImg card={c} className="w-12 shrink-0" />
                  <span>
                    <b>{KINDS[c.k].name}</b>
                    {KINDS[c.k].world >= 0 && KINDS[c.k].world !== null && <span className="wf-faint text-sm"> · nur {WORLDS[KINDS[c.k].world].name}</span>}
                    <br /><span className="wf-dim">{KINDS[c.k].text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-1">2 gegen 2</h3>
            <p className="wf-dim">
              Partner sitzen sich gegenüber. „Gegner“ auf den Karten und bei Weltereignissen meint dann nur das andere Team — dein
              Partner bleibt von Feuerwalze, Ausbruch und Finsternis verschont. Ein Ziel darfst du trotzdem frei wählen.
            </p>
          </section>
          <section className="py-3">
            <h3 className="wf-section-title mb-1">Finsternis</h3>
            <p className="wf-dim">
              Im Dunkeln siehst du nur die Rückseiten deiner Karten, die Reihenfolge bleibt aber gleich. Greifst du daneben,
              kommt die Karte zurück und du ziehst eine Strafkarte.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
