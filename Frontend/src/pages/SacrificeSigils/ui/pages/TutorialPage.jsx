// ui/pages/TutorialPage.jsx — geführter Übungskampf gegen die KI. Hinweise erscheinen beim ersten Auftreten eines
// Konzepts (Ziehen, Opfer, Knochen, Wachs, Waage, Hinterreihe) und lassen sich abschalten.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../../../../components/SEO";
import { useLocalGame } from "../../net/useLocalGame.js";
import { createBattleMatch } from "../../engine/match.js";
import { getPrefs, usePrefs, setPrefs } from "../prefs.js";
import GameScreen from "../GameScreen.jsx";

const PLAYER_DECK = [
  "bestien_aschwolf", "gebeine_grabhund", "kerzenwesen_kerzengeist", "nachtvoegel_ziegenmelker", "wurzelvolk_dornbusch",
  "bestien_moorkeiler", "gebeine_knochensammler", "gehoernte_sturmwidder", "bestien_aschbaer", "nager_aschmaus",
];
const AI_DECK = [
  "nager_aschmaus", "stammlose_tintenkleks", "bestien_moorkeiler", "wurzelvolk_dornspross", "kriecher_moorunke",
  "stammlose_vogelscheuche", "tiefe_schlammgrundel", "nager_wuehlmaus", "myzel_schleimpilz", "gebeine_knochenwall",
];

/** Reihenfolge und Auslöser der Tipps. */
const TIPS = [
  { id: "welcome", title: "Willkommen am Tisch", text: "Ziel: Die Messingwaage links um 5 Gewichte zu dir neigen. Jeder Treffer, der nicht geblockt wird, legt Gewichte in deine Schale.", when: () => true },
  { id: "draw", title: "Ziehen ist Pflicht", text: "Zu Beginn deines Zugs ziehst du genau eine Karte – aus dem Hauptdeck (deine Draft-Karten) oder dem unendlichen Nebendeck (0/1-Moorlinge, gutes Opferfutter). Rechts antippen.", when: (m) => m.battle && m.battle.active === 0 && !m.battle.players[0].drew },
  { id: "blood", title: "Blut und Opfer", text: "Karten mit Blutstropfen verlangen Opfer: Tippe die Karte an, dann eigene Kreaturen auf dem Feld (jede = 1 Blut), dann den Zielslot und „Bestätigen“. Opfer geben außerdem Knochen.", when: (m) => m.battle?.players[0].drew && m.battle.players[0].hand.some((c) => c.cost.type === "blood" && c.cost.amount > 0) && [...m.battle.players[0].front, ...m.battle.players[0].back].some(Boolean) },
  { id: "bones", title: "Knochen", text: "Jede eigene Kreatur, die stirbt oder geopfert wird, gibt 1 Knochen. Knochen bleiben den ganzen Kampf und bezahlen Karten mit dem Knochen-Symbol.", when: (m) => m.battle?.players[0].bones > 0 },
  { id: "wax", title: "Wachs", text: "Jeden eigenen Zug bekommst du +1 Wachs (höchstens 6). Wachskarten kosten keine Opfer, sind aber oft vergänglich – die Zahl auf der Kerze zählt ihre letzten Züge.", when: (m) => m.battle?.players[0].wax >= 2 && m.battle.players[0].hand.some((c) => c.cost.type === "wax") },
  { id: "backrow", title: "Die Hinterreihe", text: "Du kannst auch in die Hinterreihe spielen. Dort greift niemand an und niemand wird angegriffen. Am Ende deines Zugs rückt die Karte vor, sobald der Slot davor frei ist.", when: (m) => m.battle?.turn >= 3 },
  { id: "scale", title: "Die Waage kippt", text: "Nur die Differenz zählt. Bei 4 wird es ernst: die Kerzen dunkeln, die Waage zittert. Überschüssiger Schaden über 5 bringt Splitter für den Händler.", when: (m) => m.battle && m.battle.scale !== 0 },
];

export default function TutorialPage() {
  const [run, setRun] = useState(0);
  return <TutorialRun key={run} run={run} restart={() => setRun((r) => r + 1)} />;
}

function TutorialRun({ run, restart }) {
  const navigate = useNavigate();
  const initialState = useMemo(() => createBattleMatch({
    seed: `TUTORIAL${run}`,
    names: [getPrefs().name || "Zeichner", "KI (Lehrling)"],
    decks: [PLAYER_DECK, AI_DECK],
    starter: 0,
  }), [run]);
  const game = useLocalGame({ seed: `TUTORIAL${run}`, settings: {}, names: [], aiLevel: "easy", initialState });
  const prefs = usePrefs();
  const [tip, setTip] = useState(/** @type {any} */ (null));

  // Nächsten noch nicht gesehenen Tipp zeigen, sobald sein Auslöser eintritt
  useEffect(() => {
    if (prefs.tipsOff || tip) return;
    const m = game.getMatch();
    const next = TIPS.find((t) => !prefs.seenTips.includes(t.id) && t.when(m));
    if (next) setTip(next);
  }, [game.batches, prefs.tipsOff, prefs.seenTips, tip, game]);

  const dismiss = () => {
    if (tip) setPrefs({ seenTips: [...new Set([...getPrefs().seenTips, tip.id])] });
    setTip(null);
  };

  return (
    <div>
      <SEO title="Sacrifice & Sigils – Tutorial" description="Geführter Übungskampf: Opfer, Knochen, Wachs, Waage und Hinterreihe Schritt für Schritt." path="/sacrifice-and-sigils/tutorial" noindex />
      <GameScreen game={game} onExit={() => navigate("/sacrifice-and-sigils")} />
      {tip && (
        <div className="fixed left-3 bottom-3 z-[80] max-w-[360px] ss-paper p-4 ss-fade-in" role="dialog" aria-label={tip.title}>
          <p className="ss-title !text-[var(--ink)] text-lg">{tip.title}</p>
          <p className="text-[0.98rem] mt-1">{tip.text}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="ss-btn ss-btn-sm" onClick={dismiss} autoFocus>Verstanden</button>
            <button type="button" className="ss-btn ss-btn-sm ss-btn-ghost !text-[var(--ink)]" onClick={() => { setPrefs({ tipsOff: true }); setTip(null); }}>Keine Tipps mehr</button>
          </div>
        </div>
      )}
      <div className="fixed right-3 top-16 z-[60] flex gap-2">
        <button type="button" className="ss-btn ss-btn-sm" onClick={() => { setPrefs({ seenTips: [], tipsOff: false }); restart(); }}>Neu starten</button>
      </div>
    </div>
  );
}
