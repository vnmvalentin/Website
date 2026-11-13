// FlickLocal.jsx — Spiel ohne Server: gegen den Computer (frei oder als Tour-Partie) oder zu zweit an einem Gerät.
// Regeln und Physik kommen aus derselben Engine wie online; der Ablauf (VS-Einblendung → Schuss → Abspielen →
// Tor-Jubel → [Wiederholung] → nächster Zug … → Abpfiff) ist hier lokal.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RotateCcw, Home, ArrowRight, Map as MapIcon, Star } from "lucide-react";
import SEO from "../../components/SEO";
import Pitch from "./components/Pitch.jsx";
import GameStage from "./components/GameStage.jsx";
import { matchInfo } from "./matchInfo.js";
import Scoreboard from "./components/Scoreboard.jsx";
import CardHand from "./components/CardHand.jsx";
import CardFlash from "./components/CardFlash.jsx";
import EventFlash from "./components/EventFlash.jsx";
import { EmoteBubbles, EMOTE_SHOW_MS } from "./components/Emotes.jsx";
import VsIntro from "./components/VsIntro.jsx";
import GoalBanner, { GOAL_MS } from "./components/GoalBanner.jsx";
import ReplayTag from "./components/ReplayTag.jsx";
import FinalWhistle from "./components/FinalWhistle.jsx";
import RematchSetup from "./components/RematchSetup.jsx";
import { useFlickShell } from "./ui/shellContext.js";
import {
  REPLAY, FORMATION_IDS, canPlayCard, chaosHand, createMatch, currentEvent, getField, passTurn, playShot as engineShot, normalizeSettings,
  shotMods, usablePower,
} from "./engine/index.js";
import { AI_LEVELS, chooseShot } from "./ai.js";
import { loadPrefs } from "./prefs.js";
import { recordMatch } from "./stats.js";
import { playCard, playEvent, playWhistle } from "./sound.js";
import { TOUR_STAGES, starsFor, tourStage } from "./tour.js";

const AI_THINK_MS = 450;
const AI_AIM_MS = 700;
// Der Computer trägt je nach Stärke ein festes Design
const AI_SKIN = { easy: "klassik", medium: "streifen", hard: "metall", profi: "schaedel" };
// Was der Computer nach einem Tor sagt (Schnell-Nachrichten, engine EMOTES)
const AI_SAYS = { scored: ["haha", "schoen", "traum", "wow"], conceded: ["nein", "glueck", "ups", "knapp"], won: ["gg", "haha"], lost: ["gg", "nochmal"] };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const emptyPlay = () => ({ shots: 0, powerSum: 0, ballHits: 0, posts: 0, bankGoals: 0, kickoffGoals: 0, cards: 0 });

function configFrom(state) {
  if (state && (state.mode === "ai" || state.mode === "hotseat")) return state;
  // Direkt aufgerufen (Lesezeichen, Neuladen): mit den gemerkten Einstellungen
  const p = loadPrefs();
  return {
    mode: p.mode === "hotseat" ? "hotseat" : "ai",
    level: p.level,
    settings: { goalsToWin: p.goalsToWin, turnSeconds: p.turnSeconds, replay: p.replay, field: p.field, chaos: p.chaos },
    formations: [p.formation, p.mode === "hotseat" ? p.formation2 : FORMATION_IDS[Math.floor(Math.random() * FORMATION_IDS.length)]],
  };
}

export default function FlickLocal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [config] = useState(() => configFrom(location.state));
  const settings = normalizeSettings(config.settings);
  const vsAi = config.mode === "ai";
  const stage = vsAi ? tourStage(config.tour) : null; // Tour-Gegner oder null
  const { prefs, updatePrefs } = useFlickShell();
  // Aufstellungen für das nächste Spiel — nach dem Abpfiff änderbar, die Revanche übernimmt sie
  const [formations, setFormations] = useState(config.formations);
  const myName = prefs.name.trim() || "Du";
  const aiName = stage ? stage.name : "Computer";
  const skins = vsAi ? [prefs.skin, stage ? stage.skin : AI_SKIN[config.level] || "klassik"] : [prefs.skin, prefs.skin2];
  // Eigener Jubel bei eigenen Toren; zu zweit an einem Gerät für beide
  const celebrations = vsAi ? [prefs.celebration, "konfetti"] : [prefs.celebration, prefs.celebration];

  const [startingTeam, setStartingTeam] = useState(0);
  // Sonderregel und Vorsprung eines Tour-Endgegners (tour.js)
  const extra = { rule: config.rule || null, handicap: config.handicap || 0 };
  const [match, setMatch] = useState(() => createMatch({ settings, formations: config.formations, startingTeam: 0, ...extra }));
  const [bubbles, setBubbles] = useState({ 0: null, 1: null }); // Schnell-Nachrichten des Computers
  const [eventFlash, setEventFlash] = useState(null); // { key, event } — Einblendung, wenn ein Ereignis beginnt
  const [intro, setIntro] = useState(true);
  const [playback, setPlayback] = useState(null);
  const [goal, setGoal] = useState(null); // { team, score } von der Tor-Einblendung bis zum Anstoß
  const [replaying, setReplaying] = useState(false);
  const [unlocked, setUnlocked] = useState([]);
  const [card, setCard] = useState(null); // im Chaos-Modus für den nächsten Schuss gewählte Karte
  const [flash, setFlash] = useState(null); // { key, power, team } — Einblendung der ausgespielten Karte
  const recordedRef = useRef(null);
  const goalRef = useRef(null); // { next } — Spielstand nach dem Tor, bis neu aufgestellt wird
  const playRef = useRef(emptyPlay()); // was die eigenen Schüsse dieser Partie ergeben haben (Statistik)
  const [aiAim, setAiAim] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const pendingRef = useRef(null);
  const idRef = useRef(0);
  const timersRef = useRef([]);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // Der Computer meldet sich nach Toren und am Ende — nicht jedes Mal, sonst nervt es
  const say = useCallback(
    (list, chance = 0.65) => {
      if (Math.random() > chance) return;
      setBubbles((b) => ({ ...b, 1: { id: pick(list), key: Date.now() } }));
      later(() => setBubbles((b) => ({ ...b, 1: null })), EMOTE_SHOW_MS);
    },
    [later],
  );

  const busy = intro || !!playback || !!goal || !!aiAim;
  const over = match.winner !== null;
  const humanTurn = !vsAi || match.turn === 0;
  const names = vsAi ? [myName, stage ? aiName : `Computer · ${AI_LEVELS[config.level]?.label || "Mittel"}`] : ["Rot", "Blau"];
  const shortNames = vsAi ? [myName, aiName] : names;

  // Eine gewählte Karte gilt nur für den Zug, in dem sie gewählt wurde
  useEffect(() => {
    setCard(null);
  }, [match.turn, match.shotCount]);
  const myCard = usablePower(match, match.turn, card);

  const shoot = useCallback(
    (shot) => {
      const team = match.turn;
      const r = engineShot(match, team, shot);
      if (!r) return;
      const f = getField(match.state.field);
      pendingRef.current = {
        ...r, start: match.state, team,
        mods: r.mods,
        kickoff: match.state.ball.x === f.W / 2 && match.state.ball.y === f.H / 2, // Schuss direkt vom Anstoß
      };
      idRef.current += 1;
      setDeadline(null);
      if (r.power) {
        setFlash({ key: idRef.current, power: r.power, team });
        playCard();
      }
      setPlayback({ id: idRef.current, start: match.state, shot: r.shot, mods: pendingRef.current.mods });
    },
    [match],
  );

  // Tor fertig (nach Einblendung bzw. Wiederholung): neu aufstellen — oder bei Sieg der Abpfiff
  const finishGoal = useCallback(() => {
    const g = goalRef.current;
    if (!g) return;
    goalRef.current = null;
    setReplaying(false);
    setPlayback(null);
    setGoal(null);
    setMatch(g.next);
  }, []);

  const onPlaybackEnd = useCallback(
    (id, scored, steps, summary) => {
      // Ende einer Torwiederholung (IDs mit „r"): kurz stehen lassen, dann weiter
      if (String(id).startsWith("r")) {
        if (id === `r${idRef.current}`) later(finishGoal, REPLAY.PAD_MS);
        return;
      }
      if (id !== idRef.current || !pendingRef.current) return;
      const info = pendingRef.current;
      pendingRef.current = null;
      // Statistik nur für die eigenen Schüsse gegen den Computer
      if (vsAi && info.team === 0 && summary) {
        const p = playRef.current;
        p.shots += 1;
        p.powerSum += summary.power;
        if (summary.ballHit) p.ballHits += 1;
        p.posts += summary.posts;
        if (info.power) p.cards += 1;
        if (scored === 0 && summary.ballWall) p.bankGoals += 1;
        if (scored === 0 && info.kickoff) p.kickoffGoals += 1;
      }
      if (scored === null) {
        setPlayback(null);
        setMatch(info.match);
        return;
      }
      playWhistle(false);
      if (vsAi && info.match.winner === null) later(() => say(scored === 1 ? AI_SAYS.scored : AI_SAYS.conceded), 500);
      const g = { next: info.match };
      goalRef.current = g;
      setGoal({ team: scored, score: info.match.score });
      later(() => {
        if (goalRef.current !== g) return;
        if (!settings.replay) {
          finishGoal();
          return;
        }
        idRef.current += 1;
        setReplaying(true);
        setPlayback({ id: `r${idRef.current}`, start: info.start, shot: info.shot, mods: info.mods, steps: info.result.steps, replay: true });
      }, GOAL_MS);
    },
    [later, finishGoal, settings.replay, vsAi, say],
  );

  // Beendete Partie einmal zählen (Freischaltungen, Erfolge, Spielstil, Tour-Sterne)
  useEffect(() => {
    if (match.winner === null || recordedRef.current === match) return;
    recordedRef.current = match;
    setUnlocked(
      recordMatch({
        mode: config.mode, myTeam: 0, score: match.score, winner: match.winner,
        goalsToWin: settings.goalsToWin, level: config.level, field: settings.field, chaos: settings.chaos,
        formation: match.formations[0], tourId: config.tour || null, handicap: match.handicap || 0, play: playRef.current,
      }),
    );
    if (config.mode === "ai") later(() => say(match.winner === 1 ? AI_SAYS.won : AI_SAYS.lost, 1), 2600);
  }, [match, config.mode, config.level, config.tour, settings.goalsToWin, settings.field, settings.chaos, later, say]);

  // Ereignis des laufenden Zugs (Chaos): beim Beginn groß einblenden
  const event = currentEvent(match);
  const eventBlock = match.chaos ? `${event}/${Math.floor((match.chaos.turns || 0) / 2)}` : "";
  useEffect(() => {
    if (!event || intro) return;
    setEventFlash({ key: eventBlock, event });
    playEvent();
    // nur wenn ein neues Ereignis beginnt (oder die VS-Einblendung endet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventBlock, intro]);

  const endIntro = useCallback(() => setIntro(false), []);

  // Zugzeit für Menschen
  useEffect(() => {
    if (busy || over || !humanTurn || !settings.turnSeconds) {
      setDeadline(null);
      return undefined;
    }
    const ms = settings.turnSeconds * 1000;
    setDeadline(Date.now() + ms);
    const id = setTimeout(() => setMatch((m) => passTurn(m)), ms);
    return () => clearTimeout(id);
  }, [busy, over, humanTurn, settings.turnSeconds, match.turn, match.shotCount]);

  // Computerzug: kurz „überlegen", den Pfeil (und seine Karte) zeigen, schießen
  useEffect(() => {
    if (!vsAi || busy || over || match.turn !== 1) return undefined;
    const think = setTimeout(() => {
      const shot = chooseShot(match.state, 1, config.level, canPlayCard(match, 1) ? chaosHand(match, 1) : [], shotMods(match, 1, null));
      if (!shot) {
        setMatch((m) => passTurn(m));
        return;
      }
      setAiAim(shot);
      later(() => {
        setAiAim(null);
        shoot(shot);
      }, AI_AIM_MS);
    }, AI_THINK_MS);
    return () => clearTimeout(think);
  }, [vsAi, busy, over, match, config.level, shoot, later]);

  const rematch = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const nextStart = 1 - startingTeam;
    setStartingTeam(nextStart);
    pendingRef.current = null;
    playRef.current = emptyPlay();
    setPlayback(null);
    setGoal(null);
    goalRef.current = null;
    setReplaying(false);
    setUnlocked([]);
    setAiAim(null);
    setFlash(null);
    setEventFlash(null);
    setBubbles({ 0: null, 1: null });
    setMatch(createMatch({ settings, formations, startingTeam: nextStart, ...extra }));
    setIntro(true);
  };

  let hint;
  if (over || intro || goal) hint = null;
  else if (playback) hint = "Der Ball rollt …";
  else if (vsAi && match.turn === 1) hint = `${aiName} ist am Zug.`;
  else hint = `${vsAi ? "Du bist" : match.turn === 0 ? "Rot ist" : "Blau ist"} dran: Scheibe drücken, zurückziehen, loslassen.`;

  let resultText = "";
  if (over) {
    if (vsAi) resultText = match.winner === 0 ? "Gewonnen" : "Verloren";
    else resultText = match.winner === 0 ? "Rot gewinnt" : "Blau gewinnt";
  }
  const scorerName = goal ? shortNames[goal.team] : "";

  // Tour: Sterne dieser Partie und der nächste Gegner
  const conceded = match.score[1] - (match.handicap || 0); // der Vorsprung eines Endgegners zählt nicht als Gegentor
  const stars = stage && over ? starsFor(match.winner === 0, conceded) : 0;
  const nextStage = stage ? TOUR_STAGES[stage.index + 1] || null : null;
  // Karte, die im Ruhezustand auf dem Feld gezeigt wird: die eigene Auswahl oder die des zielenden Computers
  const shownPower = over ? null : aiAim ? aiAim.power : !busy && humanTurn ? myCard : null;

  return (
    <GameStage
      board={
        <Scoreboard
          names={names}
          score={goal ? goal.score : match.score}
          turn={match.turn}
          winner={goal ? null : match.winner}
          deadline={deadline}
          turnSeconds={settings.turnSeconds}
        />
      }
      power={
        settings.chaos && !over ? (
          <CardHand
            match={match}
            names={shortNames}
            canPick={!busy && humanTurn}
            selected={myCard}
            onSelect={(id) => {
              setCard(id);
              if (id) playCard();
            }}
            played={aiAim?.power || (playback && !replaying && flash?.key === playback.id ? flash.power : null) || null}
          />
        ) : null
      }
      foot={hint ? <p className="fk-dim text-[14px]">{hint}</p> : null}
      leaveLabel={over ? (stage ? "Tour" : "Menü") : "Aufgeben"}
      confirmLeave={!over}
      onLeave={() => navigate(stage ? "/flick-soccer/tour" : "/flick-soccer")}
      info={[stage ? `Tour · ${stage.cupName}` : null, matchInfo(settings), stage?.special ? `${stage.special[0]}: ${stage.special[1]}` : null].filter(Boolean).join(" · ")}
    >
      <SEO title="Flick Soccer — Spiel" description="Flick Soccer: Scheiben-Fußball im Browser." path="/flick-soccer/spiel" noindex />
      <Pitch
        fill
        state={match.state}
        playback={playback}
        onPlaybackEnd={onPlaybackEnd}
        aimTeam={!busy && !over && humanTurn ? match.turn : null}
        skins={skins}
        look={{ ball: prefs.ball }}
        celebrations={celebrations}
        turnPower={!over && (shownPower || event) ? { power: shownPower, team: match.turn, event } : null}
        onShoot={(shot) => shoot({ ...shot, power: myCard })}
        ghostAim={aiAim}
      >
        {flash && <CardFlash key={flash.key} power={flash.power} team={flash.team} name={shortNames[flash.team]} />}
        {eventFlash && !intro && !over && <EventFlash key={eventFlash.key} event={eventFlash.event} />}
        <EmoteBubbles bubbles={bubbles} names={shortNames} />
        {intro && (
          <VsIntro
            key={startingTeam}
            names={shortNames}
            tags={vsAi ? [null, stage?.special ? stage.special[0] : AI_LEVELS[config.level]?.label] : []}
            formations={match.formations}
            onDone={endIntro}
          />
        )}
        {goal && !replaying && <GoalBanner team={goal.team} scorer={scorerName} score={goal.score} />}
        {replaying && <ReplayTag onSkip={finishGoal} />}
        {over && !goal && (
          <FinalWhistle
            resultText={resultText}
            team={match.winner}
            score={match.score}
            unlocked={unlocked}
            myTeam={0}
            extra={
              <>
                {stage && (
                  <div className="fk-final-stars" aria-label={`${stars} von 3 Sternen`}>
                    {[1, 2, 3].map((n) => <Star key={n} size={34} className={n <= stars ? "on" : ""} fill={n <= stars ? "currentColor" : "none"} />)}
                    <p className="fk-faint text-[13px] w-full mt-1">
                      {match.winner !== 0
                        ? `${stage.name} bleibt ungeschlagen — versuch es noch einmal.`
                        : stars === 3
                          ? "Ohne Gegentor: alle drei Sterne."
                          : `Für drei Sterne: gewinne ohne Gegentor (${conceded === 1 ? "ein Gegentor" : "mehrere Gegentore"} in dieser Partie).`}
                    </p>
                  </div>
                )}
                <RematchSetup
                  entries={(vsAi ? [0] : [0, 1]).map((t) => ({
                    team: t,
                    label: vsAi ? "" : t === 0 ? "Rot" : "Blau",
                    value: formations[t],
                    onChange: (id) => {
                      setFormations((f) => (t === 0 ? [id, f[1]] : [f[0], id]));
                      updatePrefs(t === 0 ? { formation: id } : { formation2: id });
                    },
                  }))}
                />
              </>
            }
          >
            {stage && match.winner === 0 && nextStage && (
              <button
                type="button"
                className="fk-btn"
                onClick={() => navigate("/flick-soccer/tour", { state: { play: nextStage.id } })}
              >
                Nächster Gegner <ArrowRight size={16} />
              </button>
            )}
            <button type="button" className={`fk-btn${stage && match.winner === 0 && nextStage ? " fk-btn-ghost" : ""}`} onClick={rematch}>
              <RotateCcw size={16} /> {stage ? "Nochmal" : "Revanche"}
            </button>
            {stage ? (
              <button type="button" className="fk-btn fk-btn-ghost" onClick={() => navigate("/flick-soccer/tour")}><MapIcon size={16} /> Tour</button>
            ) : (
              <button type="button" className="fk-btn fk-btn-ghost" onClick={() => navigate("/flick-soccer")}><Home size={16} /> Menü</button>
            )}
          </FinalWhistle>
        )}
      </Pitch>
    </GameStage>
  );
}
