// FlickTrick.jsx — Trickschüsse: feste Stellungen (trickData.js, erzeugt und geprüft von tools/trickGen.mjs), ein
// Schuss, der Ball muss ins rechte Tor. Ohne :id die Übersicht in vier Stufen, mit :id die Aufgabe selbst. Daneben
// geschossen → die Stellung steht wieder da, beliebig viele Versuche. Sterne: 3 beim ersten Versuch, 2 bis zum
// dritten, sonst 1. Eine Stufe öffnet sich, sobald in der davor genug Aufgaben gelöst sind.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Crosshair, Lightbulb, List, Lock, RotateCcw, Star } from "lucide-react";
import SEO from "../../components/SEO";
import Pitch from "./components/Pitch.jsx";
import GameStage from "./components/GameStage.jsx";
import { FieldThumb } from "./components/FieldPicker.jsx";
import { POWERUP_ICON } from "./components/cardIcons.js";
import { CATALOG_LABEL } from "./progress.js";
import { FIELDS, POWERUPS } from "./engine/index.js";
import { loadStats, recordTrick, trickStarsFor } from "./stats.js";
import { playWhistle } from "./sound.js";
import { useFlickShell } from "./ui/shellContext.js";
import { TRICKS } from "./trickData.js";

const TIER_NAMES = { 1: "Aufwärmen", 2: "Mit Köpfchen", 3: "Knifflig", 4: "Meisterschüsse" };
const TIERS = [1, 2, 3, 4];
// So viele Aufgaben der Stufe davor müssen gelöst sein
const NEED_PREVIOUS = 4;
// Ab so vielen Fehlversuchen darf man sich die Lösung zeigen lassen
const HINT_AFTER = 5;
const MISS_MS = 900;

function tierOpen(tier, solved) {
  if (tier === 1) return true;
  return TRICKS.filter((t) => t.tier === tier - 1 && solved[t.id]).length >= NEED_PREVIOUS;
}

function Stars({ n, size = 16 }) {
  return (
    <span className="fk-stars" aria-label={`${n} von 3 Sternen`}>
      {[1, 2, 3].map((k) => <Star key={k} size={size} className={k <= n ? "on" : ""} fill={k <= n ? "currentColor" : "none"} />)}
    </span>
  );
}

function TrickList() {
  const [stats] = useState(loadStats);
  const solved = stats.trick;
  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 pt-5 pb-10">
      <SEO title="Flick Soccer — Trickschüsse" description="Flick Soccer Trickschüsse: ein Schuss, ein Tor." path="/flick-soccer/trick" noindex />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/flick-soccer" className="fk-faint text-[13px] inline-flex items-center gap-1.5 hover:text-[var(--fk-text)]"><ArrowLeft size={14} /> Menü</Link>
          <h1 className="fk-display text-[38px] sm:text-[48px] mt-2">Trickschüsse</h1>
          <p className="fk-dim mt-2 text-[14.5px] max-w-[640px]">
            Eine feste Stellung, ein Schuss: Der Ball muss ins rechte Tor — über die Bande, durchs Portal oder an allen
            vorbei. Du hast beliebig viele Versuche. Drei Sterne gibt es für einen Treffer beim ersten Versuch, zwei bis zum
            dritten.
          </p>
        </div>
        <div className="fk-tour-total">
          <Star size={22} fill="currentColor" />
          <span className="fk-display fk-num text-[30px]">{stats.trickStars}</span>
          <span className="fk-faint fk-num">/ {TRICKS.length * 3}</span>
        </div>
      </header>
      <div className="grid gap-8">
        {TIERS.map((tier) => {
          const list = TRICKS.filter((t) => t.tier === tier);
          const open = tierOpen(tier, solved);
          const done = list.filter((t) => solved[t.id]).length;
          return (
            <section key={tier}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="fk-section-title"><span className="fk-faint fk-num mr-2">{tier}</span>{TIER_NAMES[tier]}</h2>
                <span className="fk-faint fk-num text-[13px]">
                  {open ? `${done} / ${list.length} gelöst` : `Löse ${NEED_PREVIOUS} Aufgaben aus „${TIER_NAMES[tier - 1]}“`}
                </span>
              </div>
              <div className="fk-trick-grid">
                {list.map((t) => {
                  const Icon = t.power ? POWERUP_ICON[t.power] : null;
                  const number = TRICKS.indexOf(t) + 1;
                  const inner = (
                    <>
                      <span className="fk-tour-field">
                        <FieldThumb id={t.field} />
                        {!open && <span className="fk-tour-lock"><Lock size={18} /></span>}
                      </span>
                      <span className="fk-tour-body">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[15px]">Aufgabe {number}</span>
                          <Stars n={solved[t.id] || 0} size={14} />
                        </span>
                        <span className="fk-tour-tags">
                          <span>{FIELDS[t.field].name}</span>
                          {Icon && <span className="chaos"><Icon size={12} className="inline -mt-0.5 mr-1" />{POWERUPS[t.power].name}</span>}
                        </span>
                      </span>
                    </>
                  );
                  return open ? (
                    <Link key={t.id} to={`/flick-soccer/trick/${t.id}`} className="fk-tour-card">{inner}</Link>
                  ) : (
                    <div key={t.id} className="fk-tour-card locked" aria-disabled="true">{inner}</div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TrickPlay({ trick }) {
  const navigate = useNavigate();
  const { prefs } = useFlickShell();
  const number = TRICKS.indexOf(trick) + 1;
  const state = useMemo(() => ({ field: trick.field, pieces: trick.pieces, ball: trick.ball }), [trick]);
  const mods = useMemo(() => (trick.power ? { power: trick.power, team: 0 } : null), [trick]);
  const [tries, setTries] = useState(0); // Fehlversuche
  const [playback, setPlayback] = useState(null);
  const [result, setResult] = useState(null); // null | "miss" | { stars, unlocked }
  const [showHint, setShowHint] = useState(false);
  const idRef = useRef(0);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const next = TRICKS[number] || null;
  // die nächste Aufgabe kann in einer noch gesperrten Stufe liegen — dann geht es zurück zur Übersicht
  const nextOpen = next && (next.tier === trick.tier || tierOpen(next.tier, { ...loadStats().trick, [trick.id]: 1 }));
  const solved = result && result !== "miss";

  const shoot = useCallback(
    (shot) => {
      idRef.current += 1;
      setShowHint(false);
      setPlayback({ id: idRef.current, start: state, shot, mods });
    },
    [state, mods],
  );

  const onPlaybackEnd = useCallback(
    (id, goal) => {
      if (id !== idRef.current) return;
      if (goal === 0) {
        playWhistle(false);
        const stars = trickStarsFor(tries + 1);
        setResult({ stars, unlocked: recordTrick(trick.id, tries + 1) });
        return;
      }
      // daneben (oder Eigentor): kurz stehen lassen, dann steht die Stellung wieder da
      setResult("miss");
      setTries((n) => n + 1);
      timerRef.current = setTimeout(() => {
        setPlayback(null);
        setResult(null);
      }, MISS_MS);
    },
    [tries, trick.id],
  );

  const retry = () => {
    clearTimeout(timerRef.current);
    setPlayback(null);
    setResult(null);
    setTries(0);
    setShowHint(false);
  };

  const Icon = trick.power ? POWERUP_ICON[trick.power] : null;
  return (
    <GameStage
      board={
        <div className="fk-trick-board">
          <Crosshair size={16} />
          <span className="fk-display text-[15px]">Trickschuss {number}</span>
          <span className="fk-faint">{TIER_NAMES[trick.tier]} · {FIELDS[trick.field].name}</span>
          <span className="fk-num font-bold">Versuch {tries + 1}</span>
        </div>
      }
      foot={
        <>
          <p className="fk-dim text-[14px]">
            {result === "miss" ? "Daneben — gleich nochmal." : "Ein Schuss mit einer roten Scheibe: Der Ball muss ins rechte Tor."}
            {Icon && <span className="ml-2 fk-lime"><Icon size={14} className="inline -mt-0.5 mr-1" />Karte {POWERUPS[trick.power].name}: {POWERUPS[trick.power].hint}</span>}
          </p>
          {!solved && tries >= HINT_AFTER && (
            <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost" onClick={() => setShowHint((v) => !v)}>
              <Lightbulb size={15} /> {showHint ? "Lösung ausblenden" : "Lösung zeigen"}
            </button>
          )}
        </>
      }
      leaveLabel="Übersicht"
      onLeave={() => navigate("/flick-soccer/trick")}
      info={`Trickschuss ${number} · ${FIELDS[trick.field].name}`}
    >
      <SEO title={`Flick Soccer — Trickschuss ${number}`} description="Flick Soccer Trickschuss." path="/flick-soccer/trick" noindex />
      <Pitch
        fill
        state={state}
        playback={playback}
        onPlaybackEnd={onPlaybackEnd}
        aimTeam={!playback ? 0 : null}
        onShoot={shoot}
        skins={[prefs.skin, "klassik"]}
        look={{ ball: prefs.ball }}
        celebrations={[prefs.celebration, "konfetti"]}
        turnPower={mods}
        ghostAim={showHint && !playback ? trick.solution : null}
      >
        {solved && (
          <div className="fk-trick-done" role="dialog" aria-label="Aufgabe gelöst">
            <p className="fk-label fk-lime">Trickschuss {number}</p>
            <p className="fk-display text-[clamp(28px,4.4vw,46px)] mt-1">Getroffen</p>
            <div className="fk-final-stars mt-3" style={{ marginBottom: 0 }}>
              {[1, 2, 3].map((n) => <Star key={n} size={34} className={n <= result.stars ? "on" : ""} fill={n <= result.stars ? "currentColor" : "none"} />)}
            </div>
            <p className="fk-faint text-[13px] mt-2">
              {tries === 0 ? "Beim ersten Versuch." : `Nach ${tries + 1} Versuchen${result.stars < 3 ? " — drei Sterne gibt es beim ersten Versuch" : ""}.`}
            </p>
            {result.unlocked.length > 0 && (
              <p className="text-[13.5px] mt-3">
                <span className="fk-label fk-lime mr-2">Neu</span>
                {result.unlocked.map((u) => `${CATALOG_LABEL[u.kind]} ${u.name}`).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {nextOpen && (
                <button type="button" className="fk-btn" onClick={() => navigate(`/flick-soccer/trick/${next.id}`)}>
                  Nächste Aufgabe <ArrowRight size={16} />
                </button>
              )}
              <button type="button" className={`fk-btn${nextOpen ? " fk-btn-ghost" : ""}`} onClick={retry}><RotateCcw size={16} /> Nochmal</button>
              <button type="button" className="fk-btn fk-btn-ghost" onClick={() => navigate("/flick-soccer/trick")}><List size={16} /> Übersicht</button>
            </div>
          </div>
        )}
      </Pitch>
    </GameStage>
  );
}

export default function FlickTrick() {
  const { id } = useParams();
  const trick = id ? TRICKS.find((t) => t.id === id) : null;
  // key: eine andere Aufgabe beginnt mit frischem Zustand
  if (trick) return <TrickPlay key={trick.id} trick={trick} />;
  return <TrickList />;
}
