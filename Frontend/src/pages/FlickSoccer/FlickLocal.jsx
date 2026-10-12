// FlickLocal.jsx — Spiel ohne Server: gegen den Computer oder zu zweit an einem Gerät. Regeln und Physik kommen aus
// derselben Engine wie online; der Ablauf (VS-Einblendung → Schuss → Abspielen → Tor-Jubel → [Wiederholung] → nächster
// Zug … → Abpfiff) ist hier lokal.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RotateCcw, Home } from "lucide-react";
import SEO from "../../components/SEO";
import Pitch from "./components/Pitch.jsx";
import GameStage from "./components/GameStage.jsx";
import { matchInfo } from "./matchInfo.js";
import Scoreboard from "./components/Scoreboard.jsx";
import PowerupBar from "./components/PowerupBar.jsx";
import VsIntro from "./components/VsIntro.jsx";
import GoalBanner, { GOAL_MS } from "./components/GoalBanner.jsx";
import ReplayTag from "./components/ReplayTag.jsx";
import FinalWhistle from "./components/FinalWhistle.jsx";
import RematchSetup from "./components/RematchSetup.jsx";
import { useFlickShell } from "./ui/shellContext.js";
import { REPLAY, createMatch, currentPowerup, getField, passTurn, playShot as engineShot, normalizeSettings } from "./engine/index.js";
import { AI_LEVELS, chooseShot } from "./ai.js";
import { loadPrefs } from "./prefs.js";
import { recordMatch } from "./stats.js";
import { playWhistle } from "./sound.js";

const AI_THINK_MS = 450;
const AI_AIM_MS = 700;
// Der Computer trägt je nach Stärke ein festes Design
const AI_SKIN = { easy: "klassik", medium: "streifen", hard: "metall" };
const emptyPlay = () => ({ shots: 0, powerSum: 0, ballHits: 0, posts: 0, bankGoals: 0, kickoffGoals: 0 });

function configFrom(state) {
  if (state && (state.mode === "ai" || state.mode === "hotseat")) return state;
  // Direkt aufgerufen (Lesezeichen, Neuladen): mit den gemerkten Einstellungen
  const p = loadPrefs();
  return {
    mode: p.mode === "hotseat" ? "hotseat" : "ai",
    level: p.level,
    settings: { goalsToWin: p.goalsToWin, turnSeconds: p.turnSeconds, replay: p.replay, field: p.field, chaos: p.chaos },
    formations: [p.formation, p.mode === "hotseat" ? p.formation2 : "2-2"],
  };
}

export default function FlickLocal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [config] = useState(() => configFrom(location.state));
  const settings = normalizeSettings(config.settings);
  const vsAi = config.mode === "ai";
  const { prefs, updatePrefs } = useFlickShell();
  // Aufstellungen für das nächste Spiel — nach dem Abpfiff änderbar, die Revanche übernimmt sie
  const [formations, setFormations] = useState(config.formations);
  const myName = prefs.name.trim() || "Du";
  const skins = vsAi ? [prefs.skin, AI_SKIN[config.level] || "klassik"] : [prefs.skin, prefs.skin2];
  // Eigener Jubel bei eigenen Toren; zu zweit an einem Gerät für beide
  const celebrations = vsAi ? [prefs.celebration, "konfetti"] : [prefs.celebration, prefs.celebration];

  const [startingTeam, setStartingTeam] = useState(0);
  const [match, setMatch] = useState(() => createMatch({ settings, formations: config.formations, startingTeam: 0 }));
  const [intro, setIntro] = useState(true);
  const [playback, setPlayback] = useState(null);
  const [goal, setGoal] = useState(null); // { team, score } von der Tor-Einblendung bis zum Anstoß
  const [replaying, setReplaying] = useState(false);
  const [unlocked, setUnlocked] = useState([]);
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

  const busy = intro || !!playback || !!goal || !!aiAim;
  const over = match.winner !== null;
  const humanTurn = !vsAi || match.turn === 0;
  const names = vsAi ? [myName, `Computer · ${AI_LEVELS[config.level]?.label || "Mittel"}`] : ["Rot", "Blau"];
  const power = currentPowerup(match);

  const shoot = useCallback(
    (shot) => {
      const team = match.turn;
      const r = engineShot(match, team, shot);
      if (!r) return;
      const f = getField(match.state.field);
      pendingRef.current = {
        ...r, start: match.state, team,
        mods: r.power ? { power: r.power, team } : null,
        kickoff: match.state.ball.x === f.W / 2 && match.state.ball.y === f.H / 2, // Schuss direkt vom Anstoß
      };
      idRef.current += 1;
      setDeadline(null);
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
        if (scored === 0 && summary.ballWall) p.bankGoals += 1;
        if (scored === 0 && info.kickoff) p.kickoffGoals += 1;
      }
      if (scored === null) {
        setPlayback(null);
        setMatch(info.match);
        return;
      }
      playWhistle(false);
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
    [later, finishGoal, settings.replay, vsAi],
  );

  // Beendete Partie einmal zählen (Freischaltungen, Erfolge, Spielstil)
  useEffect(() => {
    if (match.winner === null || recordedRef.current === match) return;
    recordedRef.current = match;
    setUnlocked(
      recordMatch({
        mode: config.mode, myTeam: 0, score: match.score, winner: match.winner,
        goalsToWin: settings.goalsToWin, level: config.level, field: settings.field, chaos: settings.chaos,
        formation: match.formations[0], play: playRef.current,
      }),
    );
  }, [match, config.mode, config.level, settings.goalsToWin, settings.field, settings.chaos]);

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

  // Computerzug: kurz „überlegen", den Pfeil zeigen, schießen
  useEffect(() => {
    if (!vsAi || busy || over || match.turn !== 1) return undefined;
    const think = setTimeout(() => {
      const p = currentPowerup(match);
      const shot = chooseShot(match.state, 1, config.level, p ? { power: p, team: 1 } : null);
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
    setMatch(createMatch({ settings, formations, startingTeam: nextStart }));
    setIntro(true);
  };

  let hint;
  if (over || intro || goal) hint = null;
  else if (playback) hint = "Der Ball rollt …";
  else if (vsAi && match.turn === 1) hint = "Der Computer ist am Zug.";
  else hint = `${vsAi ? "Du bist" : match.turn === 0 ? "Rot ist" : "Blau ist"} dran: Scheibe drücken, zurückziehen, loslassen.`;

  let resultText = "";
  if (over) {
    if (vsAi) resultText = match.winner === 0 ? "Gewonnen" : "Verloren";
    else resultText = match.winner === 0 ? "Rot gewinnt" : "Blau gewinnt";
  }
  const scorerName = goal ? (vsAi ? (goal.team === 0 ? myName : "Computer") : goal.team === 0 ? "Rot" : "Blau") : "";

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
      power={settings.chaos && !over ? <PowerupBar match={match} names={vsAi ? [myName, "Computer"] : names} /> : null}
      foot={hint ? <p className="fk-dim text-[14px]">{hint}</p> : null}
      leaveLabel={over ? "Menü" : "Aufgeben"}
      confirmLeave={!over}
      onLeave={() => navigate("/flick-soccer")}
      info={matchInfo(settings)}
    >
      <SEO title="Flick Soccer — Spiel" description="Flick Soccer: Scheiben-Fußball im Browser." path="/flick-soccer/spiel" noindex />
      <Pitch
        fill
        state={match.state}
        playback={playback}
        onPlaybackEnd={onPlaybackEnd}
        aimTeam={!busy && !over && humanTurn ? match.turn : null}
        skins={skins}
        look={{ turf: prefs.turf, ball: prefs.ball }}
        celebrations={celebrations}
        turnPower={power && !over ? { power, team: match.turn } : null}
        onShoot={shoot}
        ghostAim={aiAim}
      >
        {intro && (
          <VsIntro
            key={startingTeam}
            names={vsAi ? [myName, "Computer"] : names}
            tags={vsAi ? [null, AI_LEVELS[config.level]?.label] : []}
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
            }
          >
            <button type="button" className="fk-btn" onClick={rematch}><RotateCcw size={16} /> Revanche</button>
            <button type="button" className="fk-btn fk-btn-ghost" onClick={() => navigate("/flick-soccer")}><Home size={16} /> Menü</button>
          </FinalWhistle>
        )}
      </Pitch>
    </GameStage>
  );
}
