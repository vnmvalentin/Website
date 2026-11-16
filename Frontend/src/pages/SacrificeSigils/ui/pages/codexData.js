// ui/pages/codexData.js — Daten des Kartenbuchs (Filter, Sigil-Auswahl), gemeinsam für Seite und Buch am Tisch.
import { useMemo, useState } from "react";
import { ALL_CARDS } from "../../data/cards/index.js";
import { SIGILS, parseSigil } from "../../engine/sigils/index.js";
import { tribeIdsOf } from "../../data/tribes.js";
import { getZirkel } from "../../engine/zirkel/index.js";

export const SIGIL_CATEGORIES = ["bewegung", "angriff", "verteidigung", "ressourcen", "feld"];

/** Sigils, die im Kartenbuch stehen: Grund-Sigils überall, zirkeleigene (Wachs, Salz, Gezeiten) nur in ihrem. */
export const publicSigilsOf = (zirkelId) => Object.values(SIGILS).filter((s) => !s.hidden && (!s.zirkel || s.zirkel === zirkelId));

/** Filter und Kartenliste des Kartenbuchs. */
export function useCodexCards() {
  const [zirkelId, setZirkelId] = useState("moor");
  const [tribe, setTribe] = useState("");
  const [cost, setCost] = useState("");
  const [rarity, setRarity] = useState("");
  const [sigil, setSigil] = useState("");
  const [q, setQ] = useState("");
  const [showTokens, setShowTokens] = useState(false);
  const cards = useMemo(() => ALL_CARDS.filter((c) => {
    if (c.zirkel !== zirkelId) return false;
    if (!showTokens && (c.token || c.cursed)) return false;
    if (tribe && c.tribe !== tribe) return false;
    if (cost && c.cost.type !== cost) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (sigil && !c.sigils.some((s) => parseSigil(s).id === sigil)) return false;
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => a.tribe.localeCompare(b.tribe) || a.cost.type.localeCompare(b.cost.type) || a.cost.amount - b.cost.amount), [zirkelId, tribe, cost, rarity, sigil, q, showTokens]);
  const switchZirkel = (/** @type {string} */ id) => {
    setZirkelId(id);
    setTribe("");
    setCost("");
    setSigil("");
  };
  return {
    zirkelId, switchZirkel, z: getZirkel(zirkelId), tribeIds: tribeIdsOf(zirkelId), publicSigils: publicSigilsOf(zirkelId),
    tribe, setTribe, cost, setCost, rarity, setRarity, sigil, setSigil, q, setQ, showTokens, setShowTokens, cards,
  };
}
