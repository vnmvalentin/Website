// ui/table/TableMirror.jsx — Bedien-Spiegelung am Tisch (Phase 7, REBUILD-PLAN.md 3.3 „overlay“): eine unsichtbare
// Liste von Knöpfen für alles, was am Tisch anfassbar ist — Hand, Brett, ausliegende Karten, Pfadkarte, Gegenstände.
// So lässt sich jede Phase nur mit der Tastatur spielen, und ein Screenreader liest vor, was auf dem Tisch liegt.
//
// Die Szene liefert die Ziele (room.targets()) und meldet neue Stände (room.subscribeTargets). Hat ein Knopf den Fokus,
// gilt sein Ziel in der Szene wie „unter dem Zeiger“ (room.setFocus): die Karte hebt sich, die Phase zeigt ihre
// Erklärung. Ausgelöst wird über dieselben Rückrufe wie ein Klick (room.trigger) — die Regeln bleiben in den Phasen.
//
// Tasten: Tab = nächste Gruppe · Pfeile = innerhalb der Gruppe (auf dem Brett hoch/runter = Reihe) · Pos1/Ende ·
// Eingabe oder Leertaste = anklicken · I = ansehen (wie Rechtsklick). Esc und die Tasten der Phase (G, Leertaste
// außerhalb der Liste) gelten weiter.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GROUPS, itemRank, pickKey, targetText } from "./mirrorText.js";

const HINT = "Pfeiltasten: wechseln · Eingabe: anklicken · I: ansehen · Tab: nächste Gruppe";

/** @param {{ room: any }} props */
export default function TableMirror({ room }) {
  const [targets, setTargets] = useState(/** @type {any[]} */ ([]));
  const [focusKey, setFocusKey] = useState(/** @type {string | null} */ (null));
  /** Zuletzt gewählter Knopf je Gruppe (der eine Tab-Halt der Gruppe). */
  const cursor = useRef(/** @type {Record<string, string>} */ ({}));
  /** Liegt der Fokus in der Liste? Bleibt wahr, wenn der fokussierte Knopf mit einem neuen Stand verschwindet. */
  const inside = useRef(false);
  const last = useRef({ group: "", index: 0 });
  const rootRef = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    const read = () => setTargets(room.targets());
    read();
    const off = room.subscribeTargets(read);
    return () => { off(); room.setFocus(null); };
  }, [room]);

  const groups = useMemo(() => GROUPS.map(([id, label]) => {
    let items = targets.filter((t) => t.group === id);
    if (id === "tisch") items = [...items].sort((a, b) => itemRank(a) - itemRank(b));
    return {
      id,
      label,
      items: items.map((t) => ({ ...t, key: id === "brett" ? `brett:${t.pick.row}:${t.pick.lane}` : pickKey(t.pick), text: targetText(t) })),
    };
  }).filter((g) => g.items.length), [targets]);

  // Neuer Stand: das fokussierte Ziel neu an die Szene geben (ein Feld wird zur Karte …); ist der Knopf weg (Karte
  // gespielt), geht der Fokus an den Nachbarn in derselben Gruppe — sonst an den Anfang der Liste
  useLayoutEffect(() => {
    if (!inside.current) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement && rootRef.current?.contains(el) && el.dataset.key) {
      const item = groups.flatMap((g) => g.items).find((x) => x.key === el.dataset.key);
      if (item) room.setFocus(item.pick);
      return;
    }
    const g = groups.find((x) => x.id === last.current.group) || groups[0];
    if (!g) { inside.current = false; room.setFocus(null); return; }
    const item = g.items[Math.min(last.current.index, g.items.length - 1)];
    rootRef.current?.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.focus();
  }, [groups, room]);

  const focusItem = (g, index) => {
    const item = g.items[Math.max(0, Math.min(g.items.length - 1, index))];
    rootRef.current?.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.focus();
  };

  const onKey = (e, g, index, item) => {
    const k = e.key;
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      e.stopPropagation();          // Leertaste beendet sonst den Zug (Taste der Phase)
      if (!e.repeat) room.trigger(item.pick, "click");
      return;
    }
    if (k === "i" || k === "I" || k === "?" || k === "ContextMenu" || (k === "F10" && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      room.trigger(item.pick, "context");
      return;
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: g.id === "brett" ? 4 : 1, ArrowUp: g.id === "brett" ? -4 : -1 }[k];
    if (step) { e.preventDefault(); focusItem(g, index + step); return; }
    if (k === "Home") { e.preventDefault(); focusItem(g, 0); return; }
    if (k === "End") { e.preventDefault(); focusItem(g, g.items.length - 1); }
  };

  const focused = focusKey ? groups.flatMap((g) => g.items).find((x) => x.key === focusKey) : null;

  return (
    <>
      <nav ref={rootRef} className="st-mirror" aria-label="Der Tisch, per Tastatur" aria-describedby="st-mirror-hint">
        <p id="st-mirror-hint">{HINT}</p>
        {groups.map((g) => {
          const stop = g.items.some((x) => x.key === cursor.current[g.id]) ? cursor.current[g.id] : g.items[0].key;
          return (
            <div key={g.id} role="group" aria-label={g.label}>
              {g.items.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  data-key={item.key}
                  tabIndex={item.key === stop ? 0 : -1}
                  aria-label={item.text}
                  onFocus={() => {
                    inside.current = true;
                    cursor.current[g.id] = item.key;
                    last.current = { group: g.id, index: i };
                    setFocusKey(item.key);
                    room.setFocus(item.pick);
                  }}
                  onBlur={(e) => {
                    const el = e.currentTarget;
                    // Verschwindet der Knopf mit einem neuen Stand, bleibt der Fokus „in der Liste“ (siehe oben)
                    setTimeout(() => {
                      if (!el.isConnected || rootRef.current?.contains(document.activeElement)) return;
                      inside.current = false;
                      setFocusKey(null);
                      room.setFocus(null);
                    }, 0);
                  }}
                  onKeyDown={(e) => onKey(e, g, i, item)}
                  // Screenreader lösen Knöpfe per Klick aus (Eingabe/Leertaste sind oben schon abgefangen)
                  onClick={() => room.trigger(item.pick, "click")}
                >
                  {item.text}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      {/* Für Sehende, die mit der Tastatur spielen: was gerade gewählt ist, als leise Zeile unten links */}
      {focused && (
        <div className="st-mirror-caption ss-paper" aria-hidden="true">
          <b>{focused.text}</b>
          <span>{HINT}</span>
        </div>
      )}
    </>
  );
}
