// ui/table/TableMenu.jsx — das Hauptmenü am Tisch (Rebuild „Am Tisch“, Phase 5).
//
// Ersetzt HomeScreen.jsx (Pergament mit Menüliste) und das Übungs-Formular, solange der Tisch im Kerzenlicht läuft:
// Der dunkle Raum mit dem Tisch, die Kerzen brennen, der Platz gegenüber ist leer. Auf dem Tisch liegen die drei
// Karten des Tages. Das Menü sind wenige Zeilen am linken Rand — keine Kästen, keine Knöpfe mit Rahmen.
// Was eine Zeile tut, steht nur für die Zeile unter dem Zeiger (eine Zeile darunter), nicht dauerhaft daneben.
// Die Szene gehört TableHost; die Zeilen stehen schon, bevor der Tisch fertig gedeckt ist.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings2, Volume2, VolumeX } from "lucide-react";
import TableHost from "./TableHost.jsx";
import CardDetail from "../card/CardDetail.jsx";
import BackToSite from "../../../../components/shell/BackToSite";
import { COLLECTIBLE, resolveCard } from "../../engine/cards.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../engine/match.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { usePrefs, setPrefs } from "../prefs.js";
import { useShell } from "../shellContext.js";
import { sound } from "../../audio/sound.js";
import { de } from "../../i18n/de.js";
import { stageModel } from "./stageModel.js";
import "./menu.css";

const BASE = "/sacrifice-and-sigils";

/** Gegner der Übung: drei KI-Stufen oder zu zweit an einem Gerät. */
const FOES = [["easy", "Leicht"], ["normal", "Normal"], ["hard", "Schwer"], ["hotseat", "Zu zweit"]];
const FOE_HINT = {
  easy: "Die KI spielt zufällige erlaubte Züge mit einfachen Faustregeln.",
  normal: "Die KI denkt einen Zug voraus und wägt Waage, Brett und Vorräte ab.",
  hard: "Die KI denkt zwei Züge voraus und draftet und wandert mit Plan.",
  hotseat: "Zwei Zeichner an einem Gerät — nach jedem Zug wird es weitergegeben.",
};

function randomSeed() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Die drei Karten des Tages (jeden Tag andere), wie sie auf dem Tisch liegen. */
function cardsOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  const legends = COLLECTIBLE.filter((c) => c.rarity !== "common");
  return [0, 1, 2].map((i) => resolveCard(legends[(day * 7 + i * 13) % legends.length].id, [], `menu${i}`));
}
const DAY_SPOTS = [{ x: -16, z: 6, ry: 0.16 }, { x: 2, z: -2, ry: -0.07 }, { x: 19, z: 8, ry: -0.22 }];

/** Eine Wahl aus wenigen Wörtern nebeneinander (Übung): das gewählte Wort leuchtet. */
function Pick({ label, options, value, onChange }) {
  return (
    <div className="sm-pick" role="radiogroup" aria-label={label}>
      <span className="sm-pick-label">{label}</span>
      <span className="sm-pick-opts">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className="sm-word" onClick={() => { sound.play("draw"); onChange(v); }}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * Das Menü über dem Tisch (bedient die Szene nur für die Karten des Tages).
 * @param {{ room: any, cards: any[], onInspect: (c: any) => void }} props
 */
function MenuTable({ room, cards, onInspect }) {
  const { showTip } = useShell();
  const handlers = useRef(/** @type {any} */ ({}));
  handlers.current.intent = (p) => {
    if (p?.type !== "loose") return;
    const c = cards.find((x) => x.uid === p.uid);
    if (c) onInspect(c);
  };
  handlers.current.hover = (p, at) => {
    const c = p?.type === "loose" ? cards.find((x) => x.uid === p.uid) : null;
    showTip(c ? { x: at.x, y: at.y - 18, bottom: at.y + 22, content: <><b>{c.name}</b><br /><span className="opacity-80">Karte des Tages · anklicken zum Ansehen</span></> } : null);
  };
  useEffect(() => {
    room.setHandlers({ onIntent: (p, how) => handlers.current.intent(p, how), onHover: (p, at) => handlers.current.hover(p, at) });
    room.setPose("raum");
    room.sync({
      ...stageModel({ stage: "menu", zirkel: "moor", seat: 0, myTurn: true, oppTurn: false }),
      loose: cards.map((card, i) => ({ uid: card.uid, card, ...DAY_SPOTS[i], scale: 1.25, from: "drop" })),
    });
    room.setUi({});
    return () => { room.setHandlers(null); showTip(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  return null;
}

/** @param {{ onFallback: () => void }} props  onFallback: der Tisch geht in diesem Browser nicht — bisheriges Menü */
export default function TableMenu({ onFallback }) {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const { openSettings } = useShell();
  const [view, setView] = useState(/** @type {"main"|"join"|"practice"} */ ("main"));
  const [name, setName] = useState(prefs.name || "");
  const [editName, setEditName] = useState(!prefs.name);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [detail, setDetail] = useState(/** @type {any} */ (null));
  const [muted, setMuted] = useState(sound.settings.muted);
  const [foe, setFoe] = useState("normal");
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, turnTimer: 0 });
  const [seed, setSeed] = useState("");
  const [name2, setName2] = useState("Zweiter Zeichner");
  const nameRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const cards = useMemo(cardsOfTheDay, []);

  useEffect(() => sound.subscribe((s) => setMuted(s.muted)), []);
  // Esc: aus einem Untermenü zurück (das Kartenblatt schließt sich selbst)
  useEffect(() => {
    const on = (e) => {
      if (e.key !== "Escape" || detail) return;
      if (view !== "main") { setView("main"); setErr(""); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view, detail]);

  /** Name übernehmen; fehlt er, wird nach ihm gefragt. @returns {string|null} */
  const needName = () => {
    const n = name.trim();
    if (!n) {
      setEditName(true);
      setErr("Wie heißt du, Zeichner?");
      sound.play("error");
      requestAnimationFrame(() => nameRef.current?.focus());
      return null;
    }
    setPrefs({ name: n.slice(0, 24) });
    return n;
  };
  const go = (to) => { sound.play("seal"); navigate(to); };

  const join = (e) => {
    e.preventDefault();
    if (!needName()) return;
    const c = code.trim().toUpperCase();
    // Tische der Moorwanderung haben sechs Zeichen und beginnen mit W
    if (/^W[A-Z0-9]{5}$/.test(c)) { go(`${BASE}/moorwanderung/${c}`); return; }
    if (!/^[A-Z0-9]{5}$/.test(c)) { setErr("Der Code hat fünf Zeichen (Moorwanderung: sechs, beginnt mit W)."); sound.play("error"); return; }
    go(`${BASE}/raum/${c}`);
  };

  const startPractice = () => {
    const me = needName();
    if (!me) return;
    const hotseat = foe === "hotseat";
    const level = hotseat ? "normal" : foe;
    const lvlName = FOES.find((f) => f[0] === level)[1];
    const config = {
      seed: (seed || randomSeed()).toUpperCase(),
      settings: normalizeSettings(settings),
      names: hotseat ? [me, name2.trim() || "Zweiter Zeichner"] : [me, `KI (${lvlName})`],
      aiLevel: level,
      hotseat,
    };
    sound.play("seal");
    navigate(`${BASE}/uebung`, { state: { practice: config } });
  };

  const MAIN = [
    { key: "create", label: "Tisch eröffnen", sub: "Einen Raum öffnen und den Link teilen — gegen einen Freund.", act: () => { if (needName()) go(`${BASE}/raum/neu`); } },
    { key: "join", label: "An einen Tisch setzen", sub: "Mit dem Code eines Freundes an seinen Tisch.", act: () => { setView("join"); setErr(""); } },
    { key: "practice", label: "Übung", sub: "Gegen die KI in drei Stufen, oder zu zweit an einem Gerät.", act: () => { setView("practice"); setErr(""); } },
    { key: "run", label: "Moorwanderung", sub: "Run-Modus für 2–6 Zeichner: Pfade, Gestalten im Moor, Lebenssiegel.", act: () => go(`${BASE}/moorwanderung`) },
    { key: "tutorial", label: de.ui.tutorial, sub: "Ein geführter Übungskampf.", act: () => go(`${BASE}/tutorial`) },
    { key: "codex", label: de.ui.codex, sub: "Alle Karten und Sigils.", act: () => go(`${BASE}/kartenbuch`) },
    { key: "guide", label: de.ui.guide, sub: "Die Regeln in Ruhe nachlesen.", act: () => go(`${BASE}/anleitung`) },
  ];
  const lineProps = (sub) => ({
    onMouseEnter: () => setHint(sub),
    onFocus: () => setHint(sub),
    onMouseLeave: () => setHint(""),
    onBlur: () => setHint(""),
  });
  const zirkelOpts = Object.values(ZIRKEL).map((z) => [z.id, z.name.replace(/-Zirkel$/, "")]);
  const set = (k) => (v) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <>
      <TableHost zirkel="moor" seated={false} quiet mirror={false} onFallback={onFallback}>
        {(room) => <MenuTable room={room} cards={cards} onInspect={setDetail} />}
      </TableHost>
      <div className="sm-root">
        <header className="sm-head">
          <h1 className="sm-title">Sacrifice <em>&amp;</em> Sigils</h1>
          <p className="sm-tagline">Eine versunkene Kapelle im Aschemoor.<br />Zwei Zeichner, ein Tisch, eine Waage.</p>
        </header>

        <div className="sm-name">
          {editName ? (
            <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setPrefs({ name: name.trim().slice(0, 24) }); setEditName(false); setErr(""); } }}>
              <label className="sm-pick-label" htmlFor="sm-name">{de.ui.yourName}</label>
              <input
                id="sm-name"
                ref={nameRef}
                className="sm-input"
                value={name}
                maxLength={24}
                placeholder="Zeichner"
                autoComplete="nickname"
                onChange={(e) => { setName(e.target.value); setErr(""); }}
                onBlur={() => { if (name.trim()) { setPrefs({ name: name.trim().slice(0, 24) }); setEditName(false); } }}
              />
            </form>
          ) : (
            <button type="button" className="sm-quiet" onClick={() => { setEditName(true); requestAnimationFrame(() => nameRef.current?.focus()); }} title="Namen ändern">
              Am Tisch als <b>{name}</b>
            </button>
          )}
        </div>

        {view === "main" && (
          <nav className="sm-list" aria-label="Hauptmenü">
            {MAIN.map((it) => (
              <button key={it.key} type="button" className="sm-line" data-menu={it.key} onClick={it.act} {...lineProps(it.sub)}>
                {it.label}
              </button>
            ))}
          </nav>
        )}

        {view === "join" && (
          <form className="sm-list" onSubmit={join}>
            <label className="sm-pick-label" htmlFor="sm-code">{de.ui.code} des Tischs</label>
            <input
              id="sm-code"
              className="sm-input sm-code"
              value={code}
              maxLength={6}
              placeholder="ABCDE"
              autoFocus
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }}
            />
            <button type="submit" className="sm-line" data-menu="join-go">Hinsetzen</button>
            <button type="button" className="sm-line sm-line-back" onClick={() => { setView("main"); setErr(""); }}>{de.ui.back}</button>
          </form>
        )}

        {view === "practice" && (
          <div className="sm-list">
            <Pick label="Gegner" options={FOES} value={foe} onChange={setFoe} />
            {foe === "hotseat" && (
              <label className="sm-pick">
                <span className="sm-pick-label">Zweiter Zeichner</span>
                <input className="sm-input sm-input-sm" value={name2} maxLength={24} onChange={(e) => setName2(e.target.value)} />
              </label>
            )}
            <Pick label="Zirkel" options={zirkelOpts} value={settings.zirkel} onChange={set("zirkel")} />
            <Pick label="Draft" options={[["shared", "Gemeinsam"], ["separate", "Getrennt"]]} value={settings.draftMode} onChange={set("draftMode")} />
            <Pick label="Siege" options={[[1, "1"], [2, "2"], [3, "3"]]} value={settings.winsNeeded} onChange={set("winsNeeded")} />
            <Pick label="Pfad" options={[[2, "Kurz"], [3, "Normal"], [4, "Lang"]]} value={settings.pathLength} onChange={set("pathLength")} />
            <label className="sm-pick">
              <span className="sm-pick-label">{de.ui.seed}</span>
              <input className="sm-input sm-input-sm uppercase" value={seed} placeholder="zufällig" maxLength={24} onChange={(e) => setSeed(e.target.value.toUpperCase())} />
            </label>
            <p className="sm-hint sm-hint-static">{FOE_HINT[foe]}</p>
            <button type="button" className="sm-line" data-menu="practice-go" onClick={startPractice}>An den Tisch</button>
            <button type="button" className="sm-line sm-line-back" onClick={() => setView("main")}>{de.ui.back}</button>
          </div>
        )}

        {view === "main" && <p className="sm-hint" aria-live="polite">{err ? "" : hint}</p>}
        {err && <p className="sm-err" role="alert">{err}</p>}

        <footer className="sm-foot">
          <button type="button" className="sm-quiet" onClick={openSettings}><Settings2 size={15} aria-hidden /> {de.ui.settings}</button>
          <button type="button" className="sm-quiet" onClick={() => sound.set({ muted: !muted })} aria-label={muted ? "Ton an" : "Ton aus"}>
            {muted ? <VolumeX size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />} {muted ? "Ton an" : "Ton aus"}
          </button>
          <BackToSite className="sm-quiet" iconSize={15} alwaysLabel />
        </footer>
      </div>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
