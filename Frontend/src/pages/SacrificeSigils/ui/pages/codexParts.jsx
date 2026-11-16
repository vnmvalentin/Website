// ui/pages/codexParts.jsx — Inhalt des Kartenbuchs, gemeinsam für die Seite (CodexPage.jsx, Ausweichweg) und das Buch
// am Tisch (table/TableBook.jsx): Kartenfilter, Sigil-Lexikon, Items/Totems/Ereignisse/Stämme.
// Die Rahmen setzt jede Ansicht selbst (Box = ein Abschnitt mit Überschrift).
import React from "react";
import SigilIcon from "../icons/SigilIcon.jsx";
import { ALL_CARDS } from "../../data/cards/index.js";
import { tribeIdsOf } from "../../data/tribes.js";
import { ITEMS } from "../../data/items.js";
import { LANE_PROPS } from "../../data/totems.js";
import { getZirkel } from "../../engine/zirkel/index.js";
import { de } from "../../i18n/de.js";
import { SIGIL_CATEGORIES, publicSigilsOf } from "./codexData.js";

/**
 * Sigil-Lexikon nach Kategorien. onShowCards(id): „Karten mit diesem Sigil“.
 * @param {{ zirkelId: string, Box: React.ComponentType<any>, onShowCards: (id: string) => void }} props
 */
export function SigilLexicon({ zirkelId, Box, onShowCards }) {
  const z = getZirkel(zirkelId);
  const list = publicSigilsOf(zirkelId);
  return (
    <>
      {SIGIL_CATEGORIES.map((cat) => (
        <Box key={cat} title={de.sigilCategories[cat]}>
          <div className="ss-sigil-list">
            {list.filter((s) => s.category === cat).map((s) => (
              <div key={s.id} className="flex gap-3 items-start ss-keep">
                <SigilIcon sigil={s.id === "kerzendocht" ? "kerzendocht:3" : s.id} size={40} />
                <div>
                  <p className="ss-title !text-[var(--ink)]">{de.sigils[s.id].name}{z.totemBaseSigils.includes(s.id) ? <span className="text-xs opacity-60"> · Totem-Körper</span> : null}</p>
                  <p className="text-[0.95rem]">{de.sigils[s.id].desc}</p>
                  {de.sigils[s.id].example && <p className="text-sm italic opacity-70">{de.sigils[s.id].example}</p>}
                  <button type="button" className="text-xs underline opacity-70" onClick={() => onShowCards(s.id)}>Karten mit diesem Sigil</button>
                </div>
              </div>
            ))}
          </div>
        </Box>
      ))}
      <Box title="Besondere Angriffswerte">
        <ul className="space-y-1">{Object.values(de.specials).map((s) => <li key={s.name}><b>{s.name}:</b> {s.desc}</li>)}</ul>
      </Box>
    </>
  );
}

/**
 * Items, Totem-Körper, Lanen-Eigenschaften, Ereignisse, Stämme (und im Gezeiten-Zirkel die Gezeiten).
 * @param {{ zirkelId: string, Box: React.ComponentType<any> }} props
 */
export function CodexMore({ zirkelId, Box }) {
  const z = getZirkel(zirkelId);
  const tribeIds = tribeIdsOf(zirkelId);
  return (
    <>
      {z.tide && (
        <Box title="Gezeiten" wide>
          <p className="mb-2">Beide Zeichner teilen einen Wasserstand: Ebbe → steigendes Wasser → Flut → fallendes Wasser, je eine Runde. Der Kampf beginnt bei Ebbe.</p>
          <ul className="space-y-1.5">{de.tide.effects.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2">{de.costs.salt.desc}</p>
        </Box>
      )}
      <Box title={`Items (${ITEMS.length})`}>
        <ul className="space-y-1.5">{ITEMS.map((i) => <li key={i.id}><b>{de.items[i.id].name}</b> <span className="opacity-60">({i.price} Splitter)</span>: {de.items[i.id].desc}</li>)}</ul>
      </Box>
      <Box title={`Seltene Ereignisse (${z.events.length})`}>
        <ul className="space-y-1.5">{z.events.map((e) => <li key={e}><b>{de.events[e].name}:</b> {de.events[e].intro}</li>)}</ul>
      </Box>
      <Box title={`Totem-Körper (${z.totemBaseSigils.length})`}>
        <div className="flex flex-wrap gap-2">{z.totemBaseSigils.map((s) => <span key={s} className="flex items-center gap-1 text-sm"><SigilIcon sigil={s} size={20} />{de.sigils[s].name}</span>)}</div>
        <p className="text-sm mt-2 opacity-75">Mit einem Stammkopf gilt der Körper für alle Karten des Stamms, mit einem Lanenkopf für jede eigene Karte in der Lane.</p>
      </Box>
      <Box title={`Lanen-Eigenschaften (${LANE_PROPS.length})`}>
        <ul className="space-y-1.5">{LANE_PROPS.map((p) => <li key={p}><b>{de.totems.props[p].name}:</b> {de.totems.props[p].desc}</li>)}</ul>
      </Box>
      <Box title="Stämme" wide>
        <div className="ss-tribe-list">
          {tribeIds.map((t) => <p key={t}><b>{de.tribes[t].name}:</b> {de.tribes[t].identity} <span className="opacity-60">({ALL_CARDS.filter((c) => c.tribe === t && !c.token && !c.cursed).length})</span></p>)}
        </div>
      </Box>
    </>
  );
}
