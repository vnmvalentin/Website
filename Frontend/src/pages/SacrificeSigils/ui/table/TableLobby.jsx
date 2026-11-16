// ui/table/TableLobby.jsx — die Lobby am Tisch (Rebuild „Am Tisch“, Phase 5).
//
// Ersetzt LobbyScreen.jsx (Kasten mit Wachssiegel-Porträts und Formular), solange der Tisch im Kerzenlicht läuft.
// Derselbe Tisch wie im Hauptmenü: wer einen Raum öffnet, sitzt allein da, der Platz gegenüber ist leer. Setzt sich
// jemand dazu, kommt die Gestalt (mit seiner Maske) aus dem Dunkel an den Tisch; geht er, verschwindet sie wieder.
// Die Einstellungen liegen als Zettel auf dem Tisch — der Gastgeber klickt einen Zettel an und stellt ihn um, der
// Gast sieht, was gilt. Bereit ist man mit dem eigenen Siegelstempel (oder Leertaste); wird das Gegenüber bereit,
// drückt seine Hand den Stempel ins Wachs. Sind beide bereit, beginnt der Draft am selben Tisch.
// Raumcode, Link und Seed stehen als eine schmale Zeile oben — sie müssen sich kopieren und tippen lassen.
// Gesten gehen schon hier (außer Zeigen: es liegt noch keine Karte).
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, Eye, Settings2 } from "lucide-react";
import TableHost from "./TableHost.jsx";
import GestureWheel from "./GestureWheel.jsx";
import { GESTURES, cleanMask } from "./masks.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { usePrefs } from "../prefs.js";
import { useShell } from "../shellContext.js";
import { sound } from "../../audio/sound.js";
import { de } from "../../i18n/de.js";
import { stageModel } from "./stageModel.js";
import "./menu.css";

/** Die Zettel der Einstellungen: Beschriftung, Werte (der Reihe nach umgestellt) und was sie bedeuten. */
const SETTINGS = [
  { key: "zirkel", label: "Zirkel", values: Object.values(ZIRKEL).map((z) => [z.id, z.name.replace(/-Zirkel$/, "")]), help: "Welche Karten im Spiel sind. Beide spielen denselben Zirkel." },
  { key: "draftMode", label: "Draft", values: [["shared", "Gemeinsam"], ["separate", "Getrennt"]], help: "Gemeinsam: ihr nehmt abwechselnd aus denselben Karten. Getrennt: jeder wählt 2 aus 4 eigenen, gleichzeitig." },
  { key: "winsNeeded", label: "Siege", values: [[1, "Bis 1 Sieg"], [2, "Bis 2 Siege"], [3, "Bis 3 Siege"]], help: "Wie viele Kämpfe man gewinnen muss." },
  { key: "turnTimer", label: "Zugzeit", values: [[45, "45 Sekunden"], [60, "60 Sekunden"], [90, "90 Sekunden"], [0, "Ohne Uhr"]], help: "So lange läuft das Stundenglas je Zug." },
  { key: "pathLength", label: "Pfad", values: [[2, "Kurz"], [3, "Normal"], [4, "Lang"]], help: "Wie viele Orte zwischen zwei Kämpfen besucht werden." },
  { key: "spectators", label: "Zuschauer", values: [[true, "Erlaubt"], [false, "Nicht erlaubt"]], help: "Ob andere mit dem Link zusehen dürfen." },
];
/** Lage der Zettel: zwei Reihen zu drei in der vorderen Tischhälfte (hinten wäre die Schrift zu klein). */
const SPOTS = [[-21, 3], [0, 3], [21, 3], [-21, 17], [0, 17], [21, 17]];
const valueText = (s, v) => (s.values.find(([x]) => x === v) || [v, String(v)])[1];

/**
 * @param {{ room: any, game: any, me: number, opp: number, isHost: boolean, onLeave: () => void }} props
 */
function LobbyAtTable({ room: scene, game, me, opp, isHost, onLeave }) {
  const { room, you, lobby } = game;
  const { showTip, openSettings } = useShell();
  const prefs = usePrefs();
  const [toast, setToast] = useState(/** @type {string|null} */ (null));
  const [wheel, setWheel] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const [copied, setCopied] = useState(false);
  const [seedDraft, setSeedDraft] = useState(room.seedInput || "");
  const toastTimer = useRef(/** @type {any} */ (null));
  const lastGesture = useRef(0);
  const flash = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const mine = you !== null ? room.seats[you] : null;
  const other = room.seats[opp];
  const oppName = other?.name || "";
  const spectator = you === null;

  const toggleReady = async () => {
    if (!mine) return;
    const next = !mine.ready;
    const res = await lobby.setReady(next);
    if (!res?.ok) { sound.play("error"); return; }
    if (next) scene.pressSeal();
    else sound.play("draw");
  };
  const change = async (key) => {
    const s = SETTINGS.find((x) => x.key === key);
    if (!s) return;
    if (!isHost) { flash("Die Einstellungen wählt der Gastgeber."); return; }
    const i = s.values.findIndex(([v]) => v === room.settings[key]);
    const next = s.values[(i + 1) % s.values.length][0];
    sound.play("draw");
    const res = await lobby.setSettings({ [key]: next });
    if (!res?.ok) sound.play("error");
  };
  const doGesture = (kind) => {
    setWheel(null);
    if (spectator || !other) return;
    const now = Date.now();
    if (now - lastGesture.current < 1200) return;
    lastGesture.current = now;
    scene.gesture(kind, "me", null);
    game.sendGesture?.(kind);
  };

  // Szene: Zettel, Stempel, Blick
  const notes = SETTINGS.map((s, i) => ({
    id: s.key, x: SPOTS[i][0], z: SPOTS[i][1], w: 19, h: 8.6, ry: [0.03, -0.02, 0.04, -0.03, 0.02, -0.04][i],
    lines: [{ text: s.label, size: 0.8 }, { text: valueText(s, room.settings[s.key]), size: 1.25 }],
    click: isHost,
  }));
  if (mine) notes.push({ id: "bereit", x: 52, z: 19, w: 17, h: 5.2, ry: -0.05, mark: !!mine.ready, lines: [{ text: mine.ready ? "Bereit" : "Stempeln: bereit", size: 1 }] });
  const model = {
    ...stageModel({ stage: "lobby", zirkel: room.settings.zirkel, seat: me, myTurn: !spectator, oppTurn: false }),
    notes,
  };
  useEffect(() => {
    scene.sync(model);
    scene.setUi({ canEnd: !!mine });
    scene.setTimer(null);
  });

  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p, how, at) => {
    if (how === "context") {
      if (!spectator && other) setWheel(at || { x: window.innerWidth / 2, y: window.innerHeight * 0.55 });
      return;
    }
    if (!p || how !== "click") return;
    if (p.type === "seal") toggleReady();
    else if (p.type === "note" && p.id !== "bereit") change(p.id);
  };
  handlers.current.hover = (p, at) => {
    const T = (title, ...lines) => <><b>{title}</b>{lines.filter(Boolean).map((l, i) => <React.Fragment key={i}><br /><span className="opacity-80">{l}</span></React.Fragment>)}</>;
    let content = null;
    const s = p?.type === "note" ? SETTINGS.find((x) => x.key === p.id) : null;
    if (s) content = T(`${s.label}: ${valueText(s, room.settings[s.key])}`, s.help, isHost ? `Anklicken: ${valueText(s, s.values[(s.values.findIndex(([v]) => v === room.settings[s.key]) + 1) % s.values.length][0])}` : "Wählt der Gastgeber.");
    else if (p?.type === "seal" && mine) content = T(mine.ready ? "Bereit" : "Stempeln: bereit", mine.ready ? "Noch einmal stempeln: doch nicht bereit." : "Sind beide bereit, beginnt der Draft. (Leertaste)");
    else if (p?.type === "oppSeal" && other) content = T(`${oppName}: ${other.ready ? "bereit" : "noch nicht bereit"}`);
    showTip(content ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content } : null);
  };
  useEffect(() => {
    scene.setHandlers({
      onIntent: (p, how, at) => handlers.current.intent(p, how, at),
      onHover: (p, at) => handlers.current.hover(p, at),
    });
    scene.setPose(spectator ? "seite" : "lobby");
    return () => { scene.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Das Gegenüber setzt sich (Knarren), steht auf, wird bereit (seine Hand stempelt)
  const seen = useRef({ seated: !!other, ready: !!other?.ready });
  useEffect(() => {
    const was = seen.current;
    const now = { seated: !!other, ready: !!other?.ready };
    seen.current = now;
    if (now.seated && !was.seated) { sound.play("creak"); flash(`${oppName} setzt sich an den Tisch.`); }
    if (!now.seated && was.seated) sound.play("creak");
    if (now.seated && now.ready && !was.ready) scene.oppStamp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!other, !!other?.ready]);
  // Geste des Gegenübers
  useEffect(() => {
    const g = game.gesture;
    if (!g || g.seat === you || g.seat !== opp) return;
    scene.gesture(g.kind, "opp", null);
    if (prefs.reduceMotion) flash(`${oppName} ${GESTURES.find((x) => x.id === g.kind)?.does || ""}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gesture?.n]);

  // Tasten: Leertaste = Stempel, G = Gesten
  useEffect(() => {
    const on = (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === " " || e.code === "Space") { e.preventDefault(); toggleReady(); }
      else if ((e.key === "g" || e.key === "G") && !spectator && other) setWheel((w) => (w ? null : { x: window.innerWidth / 2, y: window.innerHeight * 0.55 }));
      else if (e.key === "Escape" && wheel) setWheel(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const link = `${window.location.origin}/sacrifice-and-sigils/raum/${room.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      sound.play("seal");
      setTimeout(() => setCopied(false), 1500);
    } catch { flash(link); }
  };

  const notice = spectator ? "Du schaust zu. Das Match beginnt, sobald beide Zeichner bereit sind."
    : !other ? "Noch sitzt niemand gegenüber. Teile den Link oder den Code."
      : mine?.ready && !other.ready ? `Warte, bis ${oppName} bereit ist …`
        : !mine?.ready && other.ready ? `${oppName} ist bereit. Stempeln, wenn du es auch bist.`
        : !mine?.ready ? `${oppName} sitzt dir gegenüber. Stempeln, wenn du bereit bist.`
          : null;

  return (
    <>
      <div className="sl-bar">
        <span className="sl-code" title="Code des Tischs">{room.code}</span>
        <button type="button" className="sm-quiet" onClick={copy}>{copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? de.ui.copied : de.ui.copyLink}</button>
        <label className="sl-seed">
          <span>{de.ui.seed}</span>
          <input
            className="sm-input sm-input-sm uppercase"
            value={isHost ? seedDraft : room.seedInput || ""}
            placeholder="zufällig"
            disabled={!isHost}
            maxLength={24}
            onChange={(e) => setSeedDraft(e.target.value.toUpperCase())}
            onBlur={() => isHost && lobby.setSettings({}, seedDraft)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        </label>
        {room.spectators > 0 && <span className="sm-quiet" title={de.ui.spectators}><Eye size={15} aria-hidden /> {room.spectators}</span>}
        <span className="sl-gap" />
        <button type="button" className="sm-quiet" onClick={openSettings}><Settings2 size={15} aria-hidden /> {de.ui.settings}</button>
        <button type="button" className="sm-quiet" onClick={onLeave}>Aufstehen</button>
      </div>
      {(toast || notice || game.notice) && <div className="st-toast ss-paper" role="status">{toast || game.notice || notice}</div>}
      {wheel && <GestureWheel at={wheel} omit={["zeigen"]} onPick={doGesture} onClose={() => setWheel(null)} />}
    </>
  );
}

/**
 * Die Lobby eines Online-Raums am Tisch.
 * @param {{ game: any, onFallback: () => void }} props
 */
export default function TableLobby({ game, onFallback }) {
  const navigate = useNavigate();
  const { room, you } = game;
  const me = you ?? 0;
  const opp = 1 - me;
  const other = room.seats[opp];
  const isHost = you !== null && you === room.hostSeat;
  const leave = () => { game.lobby.leave(); navigate("/sacrifice-and-sigils"); };
  return (
    <TableHost
      zirkel={room.settings.zirkel}
      seated={!!other}
      oppMask={other?.mask ? cleanMask(other.mask) : undefined}
      oppAway={!!other && other.connected === false}
      quiet
      onFallback={onFallback}
    >
      {(scene) => <LobbyAtTable room={scene} game={game} me={me} opp={opp} isHost={isHost} onLeave={leave} />}
    </TableHost>
  );
}
