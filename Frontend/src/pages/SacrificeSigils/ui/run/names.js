// ui/run/names.js — Anzeigenamen der Gegner ohne Menschen (NPC, Boss, Spiegelgeist, Moorfürst).
import { de } from "../../i18n/de.js";
import { NPC_BY_ID } from "../../data/modes/moorwanderung/npcs.js";

/** Status eines Spielers als kurzer Text (Fortschrittsleiste, Späherturm). @param {any} view @param {any} st */
export function statusText(view, st) {
  if (!st) return "";
  switch (st.stage) {
    case "fight":
      return `kämpft gegen ${npcName(st.fightKind === "boss" ? st.bossId : st.npcId, view)}`;
    case "scene":
      return st.scene && de.nodes[st.scene] ? `bei: ${de.nodes[st.scene].name}` : de.run.status.scene;
    case "duel": {
      const vs = st.vs !== null && st.vs !== undefined ? view.players[st.vs]?.name : st.ghost?.kind === "lord" ? de.run.lord : de.run.mirror(view.players[st.ghost?.of]?.name || "?");
      return `Duell gegen ${vs}`;
    }
    case "duelDone":
      return st.won ? "Duell gewonnen" : "Duell verloren";
    default:
      return de.run.status[st.stage] || st.stage;
  }
}

/** Name eines NPC oder Bosses. @param {string|null} id @param {any} [_view] */
export function npcName(id, _view) {
  return (id && NPC_BY_ID[id]?.name) || "einen Bewohner des Moors";
}

/** NPC- oder Boss-Daten (Porträt, Zeilen, Regeln). @param {string|null} id */
export function npcDef(id) {
  return (id && NPC_BY_ID[id]) || null;
}

/**
 * Name des Gegners im eigenen Kampf.
 * @param {any} view Run-Sicht @param {any} info battleInfo @param {number} seat eigener Sitz
 */
export function opponentName(view, info, seat) {
  const other = info.seats[1 - seat];
  if (other !== null && other !== undefined) return view.players[other]?.name || "?";
  if (info.kind === "duel") return info.ghost?.kind === "lord" ? de.run.lord : de.run.mirror(view.players[info.ghost?.of]?.name || "?");
  return npcName(info.bossId || info.npcId, view);
}
