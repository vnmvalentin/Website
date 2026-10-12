// FlickRoom.jsx — Online-Raum (1v1 per Link). Der Server ist die einzige Quelle der Wahrheit: Er prüft und rechnet
// jeden Schuss (Backend/flickSoccer/roomManager.js) und schickt Startzustand + Schuss. Dieser Browser spielt ihn mit
// derselben Physik ab und übernimmt danach den Zustand vom Server. Eigene Schüsse laufen sofort los, ohne auf die
// Antwort zu warten.
//
// /flick-soccer/neu legt einen Raum an (Einstellungen aus dem Menü) und ersetzt die Adresse dann durch den Code.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Check, Copy, Home, Loader2, LogOut, RotateCcw, Eye } from "lucide-react";
import SEO from "../../components/SEO";
import Pitch from "./components/Pitch.jsx";
import GameStage from "./components/GameStage.jsx";
import { matchInfo } from "./matchInfo.js";
import Scoreboard from "./components/Scoreboard.jsx";
import PowerupBar from "./components/PowerupBar.jsx";
import MatchOptions from "./components/MatchOptions.jsx";
import { EmoteBar, EmoteBubbles, EMOTE_SHOW_MS } from "./components/Emotes.jsx";
import VsIntro from "./components/VsIntro.jsx";
import GoalBanner, { GOAL_MS } from "./components/GoalBanner.jsx";
import ReplayTag from "./components/ReplayTag.jsx";
import FinalWhistle from "./components/FinalWhistle.jsx";
import RematchSetup from "./components/RematchSetup.jsx";
import DiscPreview from "./components/DiscPreview.jsx";
import { useFlickShell } from "./ui/shellContext.js";
import FormationPicker from "./components/FormationPicker.jsx";
import { FORMATIONS, REPLAY, currentPowerup, getField, kickoffState } from "./engine/index.js";
import { getToken, loadPrefs } from "./prefs.js";
import { playNotify, playWhistle } from "./sound.js";
import { recordMatch } from "./stats.js";


const TEAM_NAME = ["Rot", "Blau"];
const emptyPlay = () => ({ shots: 0, powerSum: 0, ballHits: 0, posts: 0, bankGoals: 0, kickoffGoals: 0 });

export default function FlickRoom() {
  const { code: rawCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeCode = String(rawCode || "").toUpperCase();
  const creating = routeCode === "NEU";

  const { prefs, updatePrefs, openProfile } = useFlickShell();
  const [nameDraft, setNameDraft] = useState(prefs.name);
  // Name, mit dem verbunden wird — fest für diesen Besuch, damit Tippen im Profil nicht neu verbindet
  const [joinName, setJoinName] = useState(() => prefs.name.trim());
  const [phase, setPhase] = useState(prefs.name.trim() ? "connecting" : "name"); // name | connecting | room | notFound | kicked
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null);
  const [seat, setSeat] = useState(null);
  const [offset, setOffset] = useState(0); // Serverzeit − Ortszeit
  const [playback, setPlayback] = useState(null);
  const [banner, setBanner] = useState(null); // { team } während der Tor-Einblendung
  const [introFor, setIntroFor] = useState(null); // Spielnummer, deren VS-Einblendung gerade läuft
  const [replaying, setReplaying] = useState(false);
  const [unlocked, setUnlocked] = useState([]);
  // { start, shot, mods, mine, kickoff } des zuletzt abgespielten Schusses (Wiederholung, Statistik)
  const lastPlayRef = useRef(null);
  const playRef = useRef(emptyPlay()); // was die eigenen Schüsse dieser Partie ergeben haben
  const [bubbles, setBubbles] = useState({ 0: null, 1: null }); // Emotes über dem Feld
  const bubbleTimers = useRef({});
  const goalTimerRef = useRef(null);
  const replayNoRef = useRef(0);
  const recordedRef = useRef(null);
  const roomRef = useRef(null);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const codeRef = useRef(creating ? null : routeCode);
  const seenSeqRef = useRef(null); // letzter abgespielter Schuss (null = noch keinen Zustand gesehen)
  const ownShotRef = useRef(false); // eigener Schuss läuft schon, die Server-Bestätigung nicht nochmal abspielen
  const playbackGoalRef = useRef(null);
  const createRef = useRef(location.state?.create || null);

  const name = joinName;

  // ── Verbindung ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!name) return undefined;
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;
    const token = getToken();

    const enter = () => {
      const p = loadPrefs();
      if (!codeRef.current) {
        const c = createRef.current || {
          settings: { goalsToWin: p.goalsToWin, turnSeconds: p.turnSeconds, replay: p.replay, field: p.field, chaos: p.chaos },
          formation: p.formation,
        };
        socket.emit("fs:create", { name, token, settings: c.settings, formation: c.formation, skin: p.skin }, (res) => {
          if (!res?.ok) {
            setError(res?.error || "Raum konnte nicht erstellt werden.");
            return;
          }
          codeRef.current = res.code;
          setSeat(res.seat);
          setPhase("room");
          navigate(`/flick-soccer/${res.code}`, { replace: true });
        });
        return;
      }
      socket.emit("fs:join", { code: codeRef.current, name, token, formation: p.formation, skin: p.skin }, (res) => {
        if (!res?.ok) {
          if (res?.error === "notFound") setPhase("notFound");
          else setError(res?.error || "Beitritt fehlgeschlagen.");
          return;
        }
        setSeat(res.seat);
        setPhase("room");
      });
    };

    socket.on("connect", enter);
    socket.on("fs:room", (v) => {
      setOffset(v.serverNow - Date.now());
      setRoom(v);
    });
    socket.on("fs:notice", ({ text }) => {
      setToast(text);
    });
    socket.on("fs:emote", ({ seat: from, id }) => {
      if (from !== 0 && from !== 1) return;
      setBubbles((b) => ({ ...b, [from]: { id, key: Date.now() } }));
      clearTimeout(bubbleTimers.current[from]);
      bubbleTimers.current[from] = setTimeout(() => setBubbles((b) => ({ ...b, [from]: null })), EMOTE_SHOW_MS);
    });
    socket.on("fs:kicked", () => {
      setPhase("kicked");
      socket.disconnect();
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // Bewusst nur am Namen: der Code wechselt von „neu" auf den echten Code, ohne dass die Verbindung neu aufgebaut wird
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Neue Schüsse vom Server abspielen ─────────────────────────────────────
  // Layout-Effekt: läuft vor dem nächsten Bild, sonst blitzt für einen Frame schon der Endstand auf
  useLayoutEffect(() => {
    if (!room) return;
    const last = room.lastShot;
    const seq = last?.seq ?? 0;
    if (seenSeqRef.current === null) {
      // erster Zustand nach dem Beitreten: nichts nachspielen
      seenSeqRef.current = seq;
      return;
    }
    if (seq <= seenSeqRef.current || !last) return;
    seenSeqRef.current = seq;
    if (ownShotRef.current && last.team === seat) {
      ownShotRef.current = false;
      return;
    }
    playbackGoalRef.current = last.goal;
    // Ein neuer Schuss beendet eine noch laufende Tor-Einblendung/Wiederholung (der Gegner hat übersprungen)
    clearTimeout(goalTimerRef.current);
    setBanner(null);
    setReplaying(false);
    const mods = last.power ? { power: last.power, team: last.team } : null;
    lastPlayRef.current = { start: last.start, shot: last.shot, mods, mine: false, kickoff: false };
    setPlayback({ id: `s${seq}`, start: last.start, shot: last.shot, mods });
  }, [room, seat]);

  roomRef.current = room;
  const finishGoal = useCallback(() => {
    clearTimeout(goalTimerRef.current);
    setReplaying(false);
    setBanner(null);
    setPlayback(null);
  }, []);

  const onPlaybackEnd = useCallback(
    (id, goal, steps, summary) => {
      // Ende einer Torwiederholung: kurz stehen lassen, dann weiter
      if (String(id).startsWith("r")) {
        if (id === `r${replayNoRef.current}`) goalTimerRef.current = setTimeout(finishGoal, REPLAY.PAD_MS);
        return;
      }
      const play = lastPlayRef.current;
      // Statistik nur für die eigenen Schüsse
      if (play?.mine && summary) {
        const st = playRef.current;
        st.shots += 1;
        st.powerSum += summary.power;
        if (summary.ballHit) st.ballHits += 1;
        st.posts += summary.posts;
        if (goal === play.team && summary.ballWall) st.bankGoals += 1;
        if (goal === play.team && play.kickoff) st.kickoffGoals += 1;
      }
      if (goal === null) {
        setPlayback(null);
        return;
      }
      playWhistle(false);
      setBanner({ team: goal });
      clearTimeout(goalTimerRef.current);
      goalTimerRef.current = setTimeout(() => {
        if (!roomRef.current?.settings.replay || !play) {
          finishGoal();
          return;
        }
        replayNoRef.current += 1;
        setBanner(null);
        setReplaying(true);
        setPlayback({ id: `r${replayNoRef.current}`, start: play.start, shot: play.shot, mods: play.mods, steps, replay: true });
      }, GOAL_MS);
    },
    [finishGoal],
  );
  useEffect(() => () => {
    clearTimeout(goalTimerRef.current);
    Object.values(bubbleTimers.current).forEach(clearTimeout);
  }, []);

  // Gegner fragt nach dem Abpfiff eine Revanche an → deutlich melden (Hinweis + Ton), und die Zeile kurz hervorheben
  const oppSeat = seat !== null ? room?.seats?.[1 - seat] : null;
  const oppWants = room?.phase === "over" && !!oppSeat?.rematch;
  const [oppJustAsked, setOppJustAsked] = useState(false);
  const oppWantsRef = useRef(false);
  useEffect(() => {
    const before = oppWantsRef.current;
    oppWantsRef.current = oppWants;
    if (!oppWants || before) return undefined;
    playNotify();
    setToast(`${oppSeat?.name || "Dein Gegner"} will eine Revanche!`);
    setOppJustAsked(true);
    const id = setTimeout(() => setOppJustAsked(false), 1200);
    return () => clearTimeout(id);
    // oppSeat nur für den Namen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppWants]);

  // Design im Profil geändert → an den Raum schicken (der Server übernimmt es jederzeit)
  const mySkin = seat !== null ? room?.seats?.[seat]?.skin : null;
  useEffect(() => {
    if (mySkin && prefs.skin && mySkin !== prefs.skin) socketRef.current?.emit("fs:skin", { skin: prefs.skin });
  }, [mySkin, prefs.skin]);

  // Beendetes Spiel einmal zählen (Design-Freischaltungen); Zuschauer zählen nicht
  useEffect(() => {
    if (!room || room.phase !== "over" || seat === null || !room.seats[seat] || recordedRef.current === room.matchNo) return;
    recordedRef.current = room.matchNo;
    setUnlocked(
      recordMatch({
        mode: "online", myTeam: seat, score: room.match.score, winner: room.match.winner, goalsToWin: room.settings.goalsToWin,
        field: room.settings.field, chaos: room.settings.chaos, formation: room.match.formations[seat], play: playRef.current,
      }),
    );
  }, [room, seat]);

  // Neues Spiel (Start oder Revanche): alte Wiedergabe verwerfen, VS-Einblendung zeigen. Wer mitten in ein laufendes
  // Spiel kommt (Neuladen, Zuschauer), sieht sie nicht.
  const seenMatchNoRef = useRef(null);
  const matchNo = room?.phase === "playing" || room?.phase === "over" ? room.matchNo : null;
  useLayoutEffect(() => {
    if (matchNo === null || matchNo === seenMatchNoRef.current) return;
    const first = seenMatchNoRef.current === null;
    seenMatchNoRef.current = matchNo;
    if (first && (room.phase !== "playing" || room.match.shotCount > 0)) return;
    clearTimeout(goalTimerRef.current);
    setPlayback(null);
    setBanner(null);
    setReplaying(false);
    setUnlocked([]);
    playRef.current = emptyPlay();
    setIntroFor(matchNo);
    // room absichtlich nicht in den Abhängigkeiten: nur der Wechsel der Spielnummer zählt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchNo]);
  const endIntro = useCallback(() => setIntroFor(null), []);

  const shoot = useCallback(
    (shot) => {
      const socket = socketRef.current;
      if (!socket || !room?.match) return;
      ownShotRef.current = true;
      // dasselbe Power-up, das der Server gleich anwendet (Chaos-Modus)
      const power = currentPowerup(room.match);
      const mods = power ? { power, team: seat } : null;
      const start = room.match.state;
      const f = getField(start.field);
      lastPlayRef.current = { start, shot, mods, mine: true, team: seat, kickoff: start.ball.x === f.W / 2 && start.ball.y === f.H / 2 };
      setPlayback({ id: `own${Date.now()}`, start, shot, mods });
      socket.emit("fs:shoot", shot, (res) => {
        if (!res?.ok) {
          ownShotRef.current = false;
          setPlayback(null);
          setToast(res?.error || "Schuss abgelehnt.");
        }
      });
    },
    [room, seat],
  );

  const emit = (event, payload = {}) => socketRef.current?.emit(event, payload, (res) => {
    if (res && !res.ok && res.error) setToast(res.error);
  });

  const leave = () => {
    socketRef.current?.emit("fs:leave", {});
    navigate("/flick-soccer");
  };

  const saveName = (e) => {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 20);
    if (!n) return;
    updatePrefs({ name: n });
    setJoinName(n);
    setPhase("connecting");
  };

  const shareUrl = room ? `${window.location.origin}/flick-soccer/${room.code}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setToast("Kopieren nicht möglich — Link bitte von Hand kopieren.");
    }
  };

  const lobbyPreview = useMemo(
    () => kickoffState([room?.seats[0]?.formation, room?.seats[1]?.formation], room?.settings.field),
    [room?.seats, room?.settings.field],
  );

  // ── Ansichten ohne Raum ───────────────────────────────────────────────────
  const seo = <SEO title="Flick Soccer — Online" description="Flick Soccer online: Scheiben-Fußball per Link." path="/flick-soccer" noindex />;

  if (phase === "name") {
    return (
      <div className="w-full max-w-[460px] mx-auto px-4 py-10">
        {seo}
        <form onSubmit={saveName} className="fk-card px-5 py-5 grid gap-3">
          <h1 className="fk-display text-[28px]">Mitspielen</h1>
          <p className="fk-dim">Unter welchem Namen soll dein Gegner dich sehen?</p>
          <input className="fk-input" maxLength={20} autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Dein Name" />
          <button type="submit" className="fk-btn" disabled={!nameDraft.trim()}>Weiter</button>
        </form>
      </div>
    );
  }
  if (phase === "notFound" || phase === "kicked") {
    return (
      <div className="w-full max-w-[460px] mx-auto px-4 py-10">
        {seo}
        <div className="fk-card px-5 py-5 grid gap-3">
          <h1 className="fk-display text-[28px]">{phase === "kicked" ? "Anderes Fenster" : "Raum nicht gefunden"}</h1>
          <p className="fk-dim">
            {phase === "kicked"
              ? "Dein Platz wurde in einem anderen Fenster geöffnet. Spiel dort weiter."
              : "Den Raum gibt es nicht (mehr). Vielleicht ist das Spiel vorbei oder der Code falsch."}
          </p>
          <Link to="/flick-soccer" className="fk-btn"><Home size={16} /> Zum Menü</Link>
        </div>
      </div>
    );
  }
  if (!room || phase !== "room") {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 fk-dim py-16">
        {seo}
        {error ? <span className="fk-red">{error}</span> : <><Loader2 size={18} className="animate-spin" /> Verbinde …</>}
      </div>
    );
  }

  // ── Raum ─────────────────────────────────────────────────────────────────
  const me = seat !== null ? room.seats[seat] : null;
  const spectator = !me;
  const isHost = seat === 0;
  const match = room.match;
  const names = [room.seats[0]?.name || "Frei", room.seats[1]?.name || "Frei"];
  const deadline = room.turnEndsAt ? room.turnEndsAt - offset : null;
  const busy = !!playback || !!banner || introFor !== null;

  if (room.phase === "lobby") {
    const opponent = seat !== null ? room.seats[1 - seat] : null;
    return (
      <div className="w-full max-w-[1400px] mx-auto px-4 py-5 lg:py-8">
        {seo}
        {toast && <div className="fk-toast">{toast}</div>}
        <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr] items-start">
          <div className="fk-card">
            <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
              <div>
                <p className="fk-label">Raum</p>
                <h1 className="fk-display text-[34px] tracking-[0.08em]">{room.code}</h1>
              </div>
              <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost" onClick={leave}><LogOut size={15} /> Verlassen</button>
            </div>
            <div className="fk-rows">
              <section className="px-5 py-4">
                <h2 className="fk-section-title mb-2">Link teilen</h2>
                <div className="flex gap-2">
                  <input className="fk-input text-[14px]" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Einladungslink" />
                  <button type="button" className="fk-btn fk-btn-quiet" onClick={copy} aria-label="Link kopieren">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </section>
              <section className="px-5 py-4">
                <h2 className="fk-section-title mb-2">Spieler</h2>
                <ul className="grid gap-1.5">
                  {[0, 1].map((t) => {
                    const s = room.seats[t];
                    return (
                      <li key={t} className="flex items-center gap-2.5">
                        <span className={`fk-cap fk-cap-${t}`} aria-hidden="true" />
                        <span className="font-semibold truncate">{s ? s.name : <span className="fk-faint font-normal">wartet auf Gegner …</span>}</span>
                        {t === seat && <span className="fk-chip">du</span>}
                        {s && !s.connected && <span className="fk-chip">getrennt</span>}
                        {s && <span className="fk-faint text-[14px] ml-auto">{FORMATIONS[s.formation]?.name}</span>}
                        {s?.ready && <span className="fk-chip" style={{ color: "var(--fk-lime)" }}><Check size={13} /> bereit</span>}
                      </li>
                    );
                  })}
                </ul>
                {spectator && <p className="fk-faint text-[14px] mt-2 flex items-center gap-1.5"><Eye size={15} /> Du schaust zu.</p>}
              </section>
              {!spectator && (
                <section className="px-5 py-4">
                  <h2 className="fk-section-title mb-2">Dein Design</h2>
                  <button type="button" className="fk-profile-chip w-full" onClick={openProfile}>
                    <DiscPreview skin={me.skin} team={seat} size={40} />
                    <span className="min-w-0 text-left flex-1">
                      <span className="block font-bold">{me.name}</span>
                      <span className="block fk-faint text-[12.5px]">Design und Name im Profil ändern</span>
                    </span>
                  </button>
                </section>
              )}
              <section className="px-5 py-4 grid gap-3">
                <MatchOptions value={room.settings} disabled={!isHost} onChange={(patch) => emit("fs:settings", { settings: patch })} />
                {!isHost && <p className="fk-faint text-[13px]">Die Regeln legt {room.seats[0]?.name || "der Gastgeber"} fest.</p>}
              </section>
              {!spectator && (
                <div className="px-5 py-4">
                  <button
                    type="button"
                    className={`fk-btn fk-btn-lg w-full ${me.ready ? "fk-btn-ghost" : ""}`}
                    disabled={!opponent}
                    onClick={() => emit("fs:ready", { ready: !me.ready })}
                  >
                    {me.ready ? "Doch nicht bereit" : "Bereit"}
                  </button>
                  <p className="fk-faint text-[13px] mt-2">
                    {!opponent ? "Schick den Link an deinen Gegner." : me.ready ? `Warte auf ${opponent.name} …` : "Sind beide bereit, geht es los."}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="fk-card p-4 @container">
            <div className="hidden lg:block mb-4">
              <Pitch
                state={lobbyPreview}
                maxHeightOffset={400}
                skins={[room.seats[0]?.skin, room.seats[1]?.skin]}
                look={{ turf: prefs.turf, ball: prefs.ball }}
              />
            </div>
            {spectator ? (
              <p className="fk-faint text-[13px]">Anstoß-Aufstellung beider Teams</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h2 className="fk-section-title">Deine Aufstellung</h2>
                  <span className="fk-faint text-[13px] truncate">{FORMATIONS[me.formation]?.hint}</span>
                </div>
                <FormationPicker
                  value={me.formation}
                  team={seat}
                  className="grid-cols-3 sm:grid-cols-5 @2xl:grid-cols-10"
                  onChange={(formation) => {
                    emit("fs:formation", { formation });
                    updatePrefs({ formation });
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Spiel oder Ergebnis
  const over = room.phase === "over";
  const myTurn = !spectator && room.phase === "playing" && match.turn === seat;
  let hint;
  if (over || introFor !== null || banner || replaying) hint = null;
  else if (busy) hint = "Der Ball rollt …";
  else if (spectator) hint = `${TEAM_NAME[match.turn]} (${names[match.turn]}) ist am Zug.`;
  else if (myTurn) hint = "Du bist dran: Scheibe drücken, zurückziehen, loslassen.";
  else hint = `${names[match.turn]} ist am Zug.`;

  const winner = match.winner;
  let resultText = "";
  if (over) {
    if (spectator) resultText = `${names[winner]} gewinnt`;
    else resultText = winner === seat ? "Gewonnen" : "Verloren";
  }
  const showOverlay = over && !busy;
  // Während der Ball noch rollt, kennt der Server das Ergebnis schon — Tor erst nach dem Einschlag zählen,
  // und als „am Zug" gilt solange noch der Schütze.
  const shownScore = [...match.score];
  if (playback && !banner && !replaying && room.lastShot && room.lastShot.goal !== null) shownScore[room.lastShot.goal] -= 1;
  const shownTurn = playback && room.lastShot ? room.lastShot.team : match.turn;

  const chaos = room.settings.chaos;
  const disconnected = !over && room.seats.some((s) => s && !s.connected);
  const power = !over && !playback ? currentPowerup(match) : null;
  // Eigener Jubel bei eigenen Toren (Zuschauer: Standard)
  const celebrations = [seat === 0 ? prefs.celebration : "konfetti", seat === 1 ? prefs.celebration : "konfetti"];

  return (
    <GameStage
      board={
        <Scoreboard
          names={names}
          score={shownScore}
          turn={shownTurn}
          winner={busy ? null : winner}
          deadline={busy || over ? null : deadline}
          turnSeconds={room.settings.turnSeconds}
        />
      }
      power={
        chaos && !over
          ? (playback ? <div className="fk-power" style={{ borderColor: "var(--fk-line)" }}><span className="fk-power-hint">Der Ball rollt …</span></div> : <PowerupBar match={match} names={names} />)
          : null
      }
      foot={
        <>
          <p className="fk-dim text-[14px]">
            {hint}
            {disconnected && <span className="fk-red ml-2">Gegner getrennt — wartet bis zu 60 s.</span>}
          </p>
          {!spectator && <EmoteBar onSend={(id) => socketRef.current?.emit("fs:emote", { id })} />}
        </>
      }
      leaveLabel={spectator ? "Verlassen" : over ? "Menü" : "Aufgeben"}
      confirmLeave={!spectator && !over}
      onLeave={leave}
      info={matchInfo(room.settings)}
    >
      {seo}
      {toast && <div className="fk-toast">{toast}</div>}
      <Pitch
        fill
        state={match.state}
        playback={playback}
        onPlaybackEnd={onPlaybackEnd}
        aimTeam={myTurn && !busy ? seat : null}
        onShoot={shoot}
        skins={[room.seats[0]?.skin, room.seats[1]?.skin]}
        look={{ turf: prefs.turf, ball: prefs.ball }}
        celebrations={celebrations}
        turnPower={power ? { power, team: match.turn } : null}
      >
        <EmoteBubbles bubbles={bubbles} />
        {introFor !== null && <VsIntro key={introFor} names={names} formations={match.formations} onDone={endIntro} />}
        {banner && <GoalBanner team={banner.team} scorer={names[banner.team]} score={match.score} />}
        {replaying && <ReplayTag onSkip={finishGoal} />}
        {showOverlay && (
          <FinalWhistle
            label={room.forfeit !== null && room.forfeit !== undefined ? "Aufgabe" : "Abpfiff"}
            resultText={resultText}
            team={winner}
            score={match.score}
            unlocked={unlocked}
            myTeam={seat ?? 0}
            extra={
              !spectator && room.seats[0] && room.seats[1] ? (
                <>
                  <div className="fk-rematch-status" aria-live="polite">
                    {[seat, 1 - seat].map((t) => {
                      const s = room.seats[t];
                      const isMe = t === seat;
                      return (
                        <div key={t} className={`fk-rematch-row${s.rematch ? " wants" : ""}${!isMe && oppJustAsked ? " new" : ""}`}>
                          <span className={`fk-cap fk-cap-${t}`} aria-hidden="true" />
                          <span className="font-bold truncate">{isMe ? "Du" : s.name}</span>
                          <span className="fk-faint text-[13px] truncate">{FORMATIONS[s.formation]?.name}</span>
                          <span className="state">
                            {s.rematch ? (isMe ? "bereit" : "will Revanche") : !s.connected ? "getrennt" : isMe ? "noch nicht" : "überlegt noch"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <RematchSetup
                    entries={[{
                      team: seat,
                      label: "",
                      value: me.formation,
                      onChange: (formation) => {
                        emit("fs:formation", { formation });
                        updatePrefs({ formation });
                      },
                    }]}
                  />
                </>
              ) : null
            }
          >
            {!spectator && (
              <>
                <button
                  type="button"
                  className="fk-btn"
                  disabled={me?.rematch || !room.seats[0] || !room.seats[1]}
                  onClick={() => emit("fs:rematch")}
                >
                  <RotateCcw size={16} />{" "}
                  {me?.rematch ? `Warte auf ${oppSeat?.name || "Gegner"} …` : oppWants ? "Revanche annehmen" : "Revanche"}
                </button>
                <button type="button" className="fk-btn fk-btn-ghost" onClick={leave}><Home size={16} /> Menü</button>
              </>
            )}
            {!spectator && (!room.seats[0] || !room.seats[1]) && (
              <p className="fk-faint text-[13px] w-full mt-1">Dein Gegner ist weg. Teile den Link für einen neuen.</p>
            )}
          </FinalWhistle>
        )}
      </Pitch>
    </GameStage>
  );
}
