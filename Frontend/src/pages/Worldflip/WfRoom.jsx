// WfRoom.jsx — Online-Raum (2 bis 4 Spieler per Link). Der Server ist die einzige Quelle der Wahrheit
// (Backend/worldflip/roomManager.js): Er prüft jeden Zug und schickt diesem Browser seine Sicht samt den Ereignissen
// des Zugs. Der Tisch (components/GameTable.jsx) spielt sie ab. Solange keine Runde läuft, liegt die Lobby über dem
// leeren Tisch.
//
// /worldflip/neu legt einen Raum an und ersetzt die Adresse dann durch den Code.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Bot, Check, Copy, Crown, Home, Loader2, LogOut, Play, RotateCcw } from "lucide-react";
import SEO from "../../components/SEO";
import GameTable from "./components/GameTable.jsx";
import EndPanel from "./components/EndPanel.jsx";
import { RULES, TEAMS } from "./engine/index.js";
import { normalizeSkin, skinColor } from "./skins.js";
import { useWfShell } from "./ui/shellContext.js";
import { getToken } from "./prefs.js";

export default function WfRoom() {
  const { code: rawCode } = useParams();
  const navigate = useNavigate();
  const routeCode = String(rawCode || "").toUpperCase();
  const creating = routeCode === "NEU";

  const { prefs, updatePrefs } = useWfShell();
  const [nameDraft, setNameDraft] = useState(prefs.name);
  // Name, mit dem verbunden wird — fest für diesen Besuch, damit Tippen nicht neu verbindet
  const [joinName, setJoinName] = useState(() => prefs.name.trim());
  const [phase, setPhase] = useState(prefs.name.trim() ? "connecting" : "name"); // name | connecting | room | notFound | kicked
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null);
  const [offset, setOffset] = useState(0); // Serverzeit − Ortszeit
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  // navigate ändert sich mit jeder Adresse — über eine Ref benutzen, sonst baut der Wechsel von /neu auf den Code die
  // Verbindung neu auf (und der gerade angelegte Raum wäre beim Verlassen schon wieder weg)
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const tableRef = useRef(null);
  const codeRef = useRef(creating ? null : routeCode);
  const seen = useRef({ matchNo: null, seq: null });
  const settingsRef = useRef({ players: prefs.players, teams: prefs.teams, handSize: prefs.handSize });
  const skinRef = useRef(prefs.skin); // eigener Blob (im Menü gestaltet): so sehen einen die anderen

  // ── Verbindung ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!joinName) return undefined;
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;
    const token = getToken();
    seen.current = { matchNo: null, seq: null };
    const enter = () => {
      if (!codeRef.current) {
        socket.emit("wf:create", { name: joinName, token, settings: settingsRef.current, skin: skinRef.current }, (res) => {
          if (!res?.ok) {
            setError(res?.error || "Raum konnte nicht erstellt werden.");
            return;
          }
          codeRef.current = res.code;
          setPhase("room");
          navigateRef.current(`/worldflip/${res.code}`, { replace: true });
        });
        return;
      }
      socket.emit("wf:join", { code: codeRef.current, name: joinName, token, skin: skinRef.current }, (res) => {
        if (!res?.ok) {
          if (res?.error === "notFound") setPhase("notFound");
          else setError(res?.error || "Beitritt fehlgeschlagen.");
          return;
        }
        setPhase("room");
      });
    };

    socket.on("connect", enter);
    socket.on("wf:room", (v) => {
      setOffset(v.serverNow - Date.now());
      setRoom(v);
      if (!v.game) {
        seen.current = { matchNo: null, seq: null };
        return;
      }
      const s = seen.current;
      const table = tableRef.current;
      if (!table) return;
      if (s.matchNo !== v.matchNo || s.seq === null) {
        // neue Runde oder gerade erst dazugekommen: Tisch aufbauen
        table.push({ fresh: true, view: v.game, players: v.players, seat: v.you });
      } else if (v.batch.seq === s.seq + 1) {
        table.push({ events: v.batch.events, view: v.game, players: v.players });
      } else {
        // nichts Neues am Tisch (jemand kam oder ging) oder ein Zug verpasst: nur den Stand übernehmen
        table.push({ events: [], view: v.game, players: v.players });
      }
      seen.current = { matchNo: v.matchNo, seq: v.batch.seq };
    });
    socket.on("wf:notice", ({ text }) => setToast(text));
    socket.on("wf:kicked", () => {
      setPhase("kicked");
      socket.disconnect();
    });

    return () => {
      socket.emit("wf:leave", {});
      socket.disconnect();
      socketRef.current = null;
    };
  }, [joinName]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, payload, (res) => {
      if (res && !res.ok && res.error) setToast(res.error);
    });
  }, []);
  const onAct = useCallback((action) => emit("wf:action", { action }), [emit]);
  const setSettings = (patch) => emit("wf:settings", { settings: patch });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/worldflip/${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setToast("Kopieren ging nicht — markier die Adresse oben im Browser.");
    }
  };

  const seo = <SEO title="Worldflip online" description="Worldflip online spielen: Raum per Link teilen, bis zu vier Spieler." path="/worldflip" noindex />;

  // ── Vor dem Raum ──────────────────────────────────────────────────────────
  if (phase === "name") {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        {seo}
        <form
          className="wf-card p-5 w-full max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nameDraft.trim();
            if (!n) return;
            updatePrefs({ name: n });
            setJoinName(n);
            setPhase("connecting");
          }}
        >
          <h1 className="wf-display text-2xl mb-1">{creating ? "Raum erstellen" : "Mitspielen"}</h1>
          <p className="wf-dim mb-4">Wie heißt du am Tisch?</p>
          <input className="wf-input mb-4" autoFocus value={nameDraft} maxLength={20} placeholder="Dein Name" onChange={(e) => setNameDraft(e.target.value)} />
          <button type="submit" className="wf-btn w-full" disabled={!nameDraft.trim()}>Weiter</button>
        </form>
      </div>
    );
  }
  if (phase === "notFound" || phase === "kicked") {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        {seo}
        <div className="wf-card p-5 w-full max-w-sm">
          <h1 className="wf-display text-2xl mb-2">{phase === "notFound" ? "Raum nicht gefunden" : "Platz woanders geöffnet"}</h1>
          <p className="wf-dim mb-4">
            {phase === "notFound" ? "Diesen Raum gibt es nicht mehr. Räume verschwinden, wenn alle gegangen sind." : "Dein Platz wurde in einem anderen Fenster geöffnet."}
          </p>
          <Link to="/worldflip" className="wf-btn"><Home size={16} />Zum Menü</Link>
        </div>
      </div>
    );
  }

  const inLobby = room && room.phase === "lobby";
  const total = room ? (room.settings.bots ? Math.max(room.players.length, room.settings.players) : room.players.length) : 0;
  const deadline = room?.turnEndsAt ? room.turnEndsAt - offset : null;

  return (
    <>
      {seo}
      <GameTable
        ref={tableRef}
        onAct={onAct}
        deadline={room?.phase === "playing" ? deadline : null}
        turnSeconds={room?.settings.turnSeconds || 0}
        renderOverlay={({ view, table, busy }) => (
          <>
            {toast && <div className="wf-panel wf-toast">{toast}</div>}

            {(!room || phase === "connecting") && (
              <div className="wf-center">
                <div className="wf-card p-5 flex items-center gap-3">
                  {error ? <span>{error}</span> : <><Loader2 size={18} className="animate-spin" /><span>Verbinde …</span></>}
                </div>
              </div>
            )}

            {inLobby && (
              <div className="wf-center">
                <div className="wf-card p-5 w-full max-w-md">
                  <div className="flex items-end justify-between gap-3 mb-4">
                    <div>
                      <div className="wf-label">Raum</div>
                      <div className="wf-display text-3xl wf-num tracking-widest">{room.code}</div>
                    </div>
                    <button type="button" className="wf-btn wf-btn-sm wf-btn-quiet" onClick={copyLink}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Kopiert" : "Link kopieren"}
                    </button>
                  </div>

                  <ul className="wf-rows wf-card mb-4">
                    {Array.from({ length: Math.max(total, room.players.length) }, (_, i) => {
                      const p = room.players[i];
                      return (
                        <li key={i} className="wf-seat">
                          <span className="wf-seat-dot" style={{ background: p ? (room.settings.teams ? TEAMS[p.team].color : skinColor(normalizeSkin(p.skin, i))) : "var(--wf-surface-3)" }} />
                          {p ? (
                            <>
                              <span className="font-semibold" style={p.connected ? undefined : { opacity: 0.5 }}>{p.name}{i === room.you ? " (du)" : ""}</span>
                              {i === 0 && <Crown size={14} className="wf-faint" aria-label="Gastgeber" />}
                              {room.settings.teams && <span className="wf-dim text-sm ml-auto">{TEAMS[p.team].name}</span>}
                              {room.settings.teams && i === room.you && (
                                <button type="button" className="wf-btn wf-btn-sm wf-btn-quiet" onClick={() => emit("wf:team", { team: 1 - p.team })}>Wechseln</button>
                              )}
                            </>
                          ) : (
                            <span className="wf-dim inline-flex items-center gap-2"><Bot size={15} />Bot — oder wer noch dazukommt</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="grid gap-3 mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <span>Modus</span>
                      <div className="wf-seg">
                        <button type="button" disabled={!room.host} aria-pressed={!room.settings.teams} onClick={() => setSettings({ teams: false })}>Jeder gegen jeden</button>
                        <button type="button" disabled={!room.host} aria-pressed={room.settings.teams} onClick={() => setSettings({ teams: true })}>2 gegen 2</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Plätze am Tisch</span>
                      <div className="wf-seg">
                        {[2, 3, 4].map((n) => (
                          <button key={n} type="button" disabled={!room.host || room.settings.teams} aria-pressed={room.settings.players === n} onClick={() => setSettings({ players: n })}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Freie Plätze</span>
                      <div className="wf-seg">
                        <button type="button" disabled={!room.host} aria-pressed={room.settings.bots} onClick={() => setSettings({ bots: true })}>Bots</button>
                        <button type="button" disabled={!room.host} aria-pressed={!room.settings.bots} onClick={() => setSettings({ bots: false })}>leer</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Handkarten</span>
                      <div className="wf-seg">
                        {RULES.HAND_SIZES.map((n) => (
                          <button key={n} type="button" disabled={!room.host} aria-pressed={room.settings.handSize === n} onClick={() => setSettings({ handSize: n })}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Zugzeit</span>
                      <div className="wf-seg">
                        {RULES.TURN_SECONDS.map((n) => (
                          <button key={n} type="button" disabled={!room.host} aria-pressed={room.settings.turnSeconds === n} onClick={() => setSettings({ turnSeconds: n })}>{n} s</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {room.host ? (
                      <button type="button" className="wf-btn flex-1" disabled={total < RULES.MIN_PLAYERS} onClick={() => emit("wf:start")}><Play size={17} />Runde starten</button>
                    ) : (
                      <span className="wf-dim flex-1 self-center">{room.you === null ? "Du schaust zu." : "Der Gastgeber startet die Runde."}</span>
                    )}
                    <Link to="/worldflip" className="wf-btn wf-btn-ghost"><LogOut size={16} />Verlassen</Link>
                  </div>
                  {room.host && total < RULES.MIN_PLAYERS && <p className="wf-faint text-sm mt-2">Zu zweit geht es los — oder schalte Bots für freie Plätze ein.</p>}
                  {room.settings.teams && <p className="wf-faint text-sm mt-2">Partner sitzen sich gegenüber. Angriffe und Weltereignisse treffen nur das andere Team.</p>}
                </div>
              </div>
            )}

            {room && room.phase !== "lobby" && view && view.winner !== null && !busy && (
              <EndPanel view={view} table={table}>
                {room.host ? (
                  <button type="button" className="wf-btn" onClick={() => emit("wf:start")}><RotateCcw size={16} />Nächste Runde</button>
                ) : (
                  <span className="wf-dim self-center">Der Gastgeber startet die nächste Runde.</span>
                )}
                <Link to="/worldflip" className="wf-btn wf-btn-ghost"><LogOut size={16} />Verlassen</Link>
                {room.humans.length > 1 && <p className="wf-faint text-sm w-full">Dabei: {room.humans.join(", ")}</p>}
              </EndPanel>
            )}
          </>
        )}
      />
    </>
  );
}
