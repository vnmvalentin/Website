// ui/path/DeckPicker.jsx — Karten des eigenen Decks auswählen (Szenen der Pfad-Phase).
import React, { useState } from "react";
import Card from "../card/Card.jsx";
import CardDetail from "../card/CardDetail.jsx";

/**
 * @param {{ deck: any[], selected: string[], onToggle: (uid: string) => void, isEnabled?: (dc: any) => boolean, width?: number, max?: number }} props
 *   deck: Einträge aus view.players[you].deck ({ uid, baseId, mods, card })
 */
export default function DeckPicker({ deck, selected, onToggle, isEnabled = () => true, width = 96 }) {
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  return (
    <div className="flex flex-wrap gap-2 justify-center max-h-[46vh] overflow-y-auto p-1">
      {deck.map((dc) => {
        const on = selected.includes(dc.uid);
        const enabled = isEnabled(dc);
        return (
          <div key={dc.uid} className="transition-transform" style={{ transform: on ? "translateY(-8px)" : undefined }}>
            <Card
              card={dc.card}
              width={width}
              selected={on}
              dim={!enabled && !on}
              onClick={() => enabled && onToggle(dc.uid)}
              onDetail={() => setDetail(dc.card)}
              tabIndex={enabled ? 0 : -1}
            />
          </div>
        );
      })}
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
