// SeedRunnersRoom.jsx — ein Raum: Beitritt per Link-Code, Lobby, Rennen, Ergebnis.
//
// Die Seite zeigt je nach Raumphase eine andere Ansicht (siehe Backend/seedRunners/roomManager.js):
//   lobby → Lobby · loading/countdown/racing → RaceView + Rangliste · results → Ergebnis-Tabelle
// Der Server ist die einzige Quelle für Phase, Startzeit und Platzierung; gespielt wird lokal.
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, Check, LogOut, WifiOff, Eye, EyeOff, RotateCcw } from "lucide-react";
import SEO from "../../components/SEO";
import { useRoomSocket } from "./room/useRoomSocket.js";
import { getIdentity } from "./room/identity.js";
import Lobby from "./room/Lobby.jsx";
import RaceView from "./room/RaceView.jsx";
import Results from "./room/Results.jsx";
import Standings from "./room/Standings.jsx";
import { useSoundUnlock } from "./client/useSoundUnlock.js";
import { getLevelDoc } from "./levels/levelsApi.js";
import { validateDoc } from "./level/index.js";
import { createCustomLevelLoader } from "./room/customLevelLoader.js";
import { vorerzeugen } from "./client/generateWorldAsync.js";
import { Spinner } from "./ui/kit.jsx";
import { useShellBiome } from "./ui/shellContext.js";
import { merkeRaum, gemerkterRaum, vergissRaum, versteckeAdresse, verdeckt } from "./room/raumCode.js";
import { useCodeSichtbar } from "./room/useCodeSichtbar.js";
import { getFx, setFx, subscribeFx } from "./client/fxSettings.js";
import { MODE_LABELS } from "./room/labels.js";
import { formatTicks } from "./room/format.js";

const PLAYING_STATES = ["loading", "ready", "racing", "finished", "dnf"];
// Zeitjagd: so lange nach dem Klick bzw. Enter beginnt der nächste Versuch (kurzer Countdown, damit man bereit ist)
const NEW_ATTEMPT_DELAY_MS = 1200;
// Nach dem eigenen Ziel: so lange steht die Zielzeit, bevor das Zuschauen von selbst beginnt
const WATCH_AUTO_DELAY_MS = 2500;

function CenterCard({ children }) {
  return (
    <div className="w-full max-w-md mx-auto px-4 py-16">
      <div className="sr-panel p-6 text-center">{children}</div>
    </div>
  );
}

/** Eine Hinweis-Fläche neben der Rangliste (Level lädt, Zuschauer, falsche Version) */
function Notice({ children }) {
  return <div className="sr-panel p-6 text-center">{children}</div>;
}

/** Rundenangabe der Kopfzeile: in einer Serie "Runde 2 / 3", sonst die Runde dieser Sitzung (zählt ab der Lobby neu) */
function rundenText(state) {
  const series = state.series;
  return series && series.total > 1 ? `Runde ${series.index} / ${series.total}` : `Runde ${state.round.number}`;
}

/** Was läuft ab? Zeitjagd: das Rundenende; Rennen: die DNF-Frist, sobald jemand im Ziel ist */
function deadlineOf(round) {
  if (round?.mode === "timeattack" && round.endAt) return { label: "Restzeit", at: round.endAt };
  if (round?.dnfAt) return { label: "DNF-Frist", at: round.dnfAt };
  return null;
}

/** Kästchen: die anderen Läufer als Geister im eigenen Bild zeigen (Einstellung, gilt für alle Räume) */
function GeisterSchalter({ an }) {
  return (
    <label className="flex items-center gap-2.5 px-1 cursor-pointer">
      <input type="checkbox" checked={an} onChange={(e) => setFx({ geister: e.target.checked })} className="sr-check" />
      <span className="text-sm sr-ink">Geister der anderen zeigen</span>
    </label>
  );
}

export default function SeedRunnersRoom() {
  useSoundUnlock();   // der erste Klick in der Lobby schaltet den Ton fürs Rennen frei
  // Der Code kommt aus der Adresse (Einladungslink) oder — nach dem Beitreten steht dort nur noch /seed-runners/raum
  // (Streamer-Schutz, room/raumCode.js) — aus dem Sitzungsspeicher dieses Tabs
  const { code: rawCode } = useParams();
  const code = String(rawCode || gemerkterRaum() || "").toUpperCase();
  const [codeOffen, setCodeOffen] = useCodeSichtbar();
  useEffect(() => {
    if (!code) return;
    merkeRaum(code);
    versteckeAdresse();
  }, [code]);
  const navigate = useNavigate();
  const { status, connected, state, me, you, error, notice, epoch, join, actions, clock, remote } = useRoomSocket(code);

  const [name, setName] = useState(() => getIdentity().name);
  const [toast, setToast] = useState(null);
  const [copied, setCopied] = useState(false);
  const customLoaderRef = useRef(null);
  if (!customLoaderRef.current) customLoaderRef.current = createCustomLevelLoader({ getLevelDoc, validateDoc });
  const customLoader = customLoaderRef.current;
  const [customLevel, setCustomLevel] = useState({ code: null, status: "idle", level: null });
  // Die Oberfläche nimmt das Biom der Runde an (bzw. das in der Lobby eingestellte)
  useShellBiome(state?.round?.params?.biome && state.round.params.biome !== "random" ? state.round.params.biome : state?.settings?.biome);

  // Pfad-Level der nächsten Runde schon auf dem Ergebnisbildschirm im Hintergrund bauen (Phase D): Der Server nennt ihre
  // Parameter erst dort, gebaut wird im Worker — beim Start der Runde steht es dann meist schon bereit
  const naechste = state?.series?.naechste || null;
  useEffect(() => { if (naechste) vorerzeugen(naechste); }, [JSON.stringify(naechste)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom-Level für die laufende Runde laden (mit Cache: eine während der Ergebnis-Anzeige vorgeladene Runde
  // steht sofort bereit). Ohne Login/Nachricht an den Server, solange nicht geladen ist — ein langsamer Ladevorgang
  // wirkt für den Raum wie ein langsamer Client und endet nötigenfalls als Zuschauer (wie bisher schon).
  useEffect(() => {
    const round = state?.round;
    if (round?.kind !== "custom" || !round.custom) return undefined;
    const code = round.custom.code;
    let alive = true;
    setCustomLevel({ code, status: "loading", level: null });
    customLoader.load(code).then((level) => {
      if (alive) setCustomLevel({ code, status: level ? "ready" : "error", level });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round?.number, state?.round?.kind, state?.round?.custom?.code]);

  // Während die Ergebnis-Tabelle steht, schon die nächste Custom-Runde laden — sie ist dann bereit, sobald der
  // Host weiterklickt, statt erst dann anzufangen
  useEffect(() => {
    const series = state?.series;
    if (state?.phase !== "results" || !series?.hasNext) return;
    const next = series.plan[series.index];
    if (next?.kind === "custom") customLoader.preload(next.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.series?.index, state?.series?.hasNext]);

  // Wunschfarbe aus den Einstellungen: Ändert man sie in Lobby oder Ergebnis, übernimmt der Raum sie gleich (wenn sie frei ist)
  const wunschFarbe = useSyncExternalStore(subscribeFx, () => getFx().farbe, () => null);
  const meColor = state?.players?.find((p) => p.id === you?.id)?.color;
  const phaseNow = state?.phase;
  // (auch eine Änderung mitten im Rennen: Sie greift, sobald Ergebnis oder Lobby kommt. Ist die Farbe vergeben, gibt es EINE
  // Meldung — nicht bei jedem Rundenwechsel wieder, bis man eine andere wählt)
  const farbVersuch = useRef(null);
  useEffect(() => {
    if (!wunschFarbe || !meColor || wunschFarbe === meColor || (phaseNow !== "lobby" && phaseNow !== "results")) return;
    if (farbVersuch.current === wunschFarbe) return;
    farbVersuch.current = wunschFarbe;
    actions.setColor(wunschFarbe).then((res) => { if (res && !res.ok && res.error) setToast(res.error); });
  }, [wunschFarbe, meColor, phaseNow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    setToast(notice.text);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const submitName = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) join(trimmed);
  };

  const leave = async () => {
    await actions.leave();
    vergissRaum();
    navigate("/seed-runners");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/seed-runners/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* Zwischenablage gesperrt */ }
  };

  // ── Zeitjagd: Versuche ──────────────────────────────────────────────────────
  // Jeder Versuch ist ein frischer Lauf auf derselben Karte (neue Welt, Uhr ab 0). Der erste startet mit dem gemeinsamen
  // Countdown, jeder weitere kurz nach dem Klick bzw. Enter. Die Nummer gehört zur Runde und fängt dort wieder bei 1 an.
  const geister = useSyncExternalStore(subscribeFx, () => getFx().geister, () => true);
  // (die Runden-id, nicht die Nummer: Die Nummer beginnt in jeder Sitzung wieder bei 1)
  const roundId = state?.round?.id ?? null;
  const timeattack = state?.round?.mode === "timeattack";
  const [versuch, setVersuch] = useState({ round: null, n: 1, startAt: null });
  // Hardcore: in welcher Runde (round.id) man gestorben ist — der Lauf hält sofort an, auch bevor der Server antwortet
  const [gestorbenIn, setGestorbenIn] = useState(null);
  const attempt = versuch.round === roundId ? versuch.n : 1;
  const attemptStartAt = versuch.round === roundId ? versuch.startAt : null;
  const bestRef = useRef(null);    // { round, attempt, payload } — für das erneute Senden nach einem Reconnect
  const meRacing = state?.phase === "racing" && me?.state === "racing";
  const neuerVersuch = useCallback(() => {
    if (!timeattack || !meRacing) return;
    // Serverzeit jetzt = lokale Zeit + Versatz (ohne Messung: Uhren als gleich annehmen)
    const serverNow = Date.now() + (clock.offset ?? 0);
    setVersuch({ round: roundId, n: attempt + 1, startAt: serverNow + NEW_ATTEMPT_DELAY_MS });
  }, [timeattack, meRacing, clock, roundId, attempt]);
  useEffect(() => {
    if (!timeattack || !meRacing) return undefined;
    const onKey = (e) => {
      if ((e.code !== "Enter" && e.code !== "NumpadEnter") || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t && t.closest && t.closest("[role='dialog'], [data-sr-popup]")) return;
      e.preventDefault();
      neuerVersuch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timeattack, meRacing, neuerVersuch]);
  // Nach einem Reconnect die bisher beste Zeit noch einmal melden (die Rennansicht kennt nur den laufenden Versuch)
  useEffect(() => {
    const best = bestRef.current;
    if (epoch > 1 && timeattack && best && best.round === roundId) actions.finish({ ...best.payload, attempt: best.attempt });
  }, [epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zuschauen ──────────────────────────────────────────────────────────────
  // Wer gerade nicht selbst läuft (im Ziel, aufgegeben, zu spät gekommen), kann einem Läufer folgen. Nach dem eigenen Ziel
  // geht das nach einer kurzen Pause von selbst los (beim Führenden); fällt der Beobachtete heraus, kommt der nächste.
  const [watchId, setWatchId] = useState(null);
  const [watchAuto, setWatchAuto] = useState(true);   // false, sobald man selbst "Zuschauen beenden" wählt
  const inRace = state?.phase === "racing" || state?.phase === "countdown";
  const canWatch = inRace && !!me && !(me.state === "racing" || me.state === "ready" || me.state === "loading" || me.state === "incompatible");
  const aktiveLaeufer = (state?.players || [])
    .filter((p) => p.state === "racing" && p.connected && p.id !== you?.id)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
  const aktiveKey = aktiveLaeufer.map((p) => p.id).join(",");
  useEffect(() => {
    if (!canWatch) {
      if (watchId) setWatchId(null);
      return undefined;
    }
    if (watchId && aktiveLaeufer.some((p) => p.id === watchId)) return undefined;
    if (!watchAuto && !watchId) return undefined;
    const next = aktiveLaeufer[0]?.id || null;
    if (!watchId) {
      // Erst die eigene Zielzeit zeigen, dann umschalten
      const t = setTimeout(() => setWatchId(next), WATCH_AUTO_DELAY_MS);
      return () => clearTimeout(t);
    }
    setWatchId(next);
    return undefined;
  }, [canWatch, watchId, watchAuto, aktiveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWatchAuto(true); setWatchId(null); }, [roundId]);
  const chooseWatch = (id) => {
    setWatchId(id);
    setWatchAuto(!!id);
  };

  // ── Zwischenzustände ────────────────────────────────────────────────────────
  if (status === "connecting" || status === "joining") {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-20 text-center">
        <SEO title="Seed Runners" description="Tritt einem Seed-Runners-Raum bei." path="/seed-runners" noindex />
        <Spinner size={26} className="mx-auto mb-3" />
        <p className="sr-dim text-sm">{status === "joining" ? "Trete bei …" : "Verbinde …"}</p>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <CenterCard>
        <SEO title="Seed Runners" description="Dieser Raum wurde nicht gefunden." path="/seed-runners" noindex />
        <h1 className="sr-display text-2xl mb-2">Raum nicht gefunden</h1>
        <p className="text-sm sr-dim mb-5">Der Link ist abgelaufen, oder alle haben den Raum verlassen.</p>
        <button type="button" onClick={() => { vergissRaum(); navigate("/seed-runners"); }} className="sr-btn">Zum Hauptmenü</button>
      </CenterCard>
    );
  }

  if (status === "kicked") {
    return (
      <CenterCard>
        <SEO title="Seed Runners" description="Du bist in einem anderen Fenster beigetreten." path="/seed-runners" noindex />
        <h1 className="sr-display text-2xl mb-2">Anderes Fenster aktiv</h1>
        <p className="text-sm sr-dim mb-5">Du bist mit demselben Namen in einem anderen Fenster beigetreten. Hier kannst du den Platz zurückholen.</p>
        <button type="button" onClick={() => window.location.reload()} className="sr-btn">Hier weiterspielen</button>
      </CenterCard>
    );
  }

  if (status === "name" || !state) {
    return (
      <CenterCard>
        <SEO title="Seed Runners · Einladung" description="Tritt einem Seed-Runners-Raum bei." path="/seed-runners" noindex />
        <p className="sr-label mb-2">Einladung</p>
        <h1 className="sr-display text-2xl mb-5">Ab ins Rennen</h1>
        <form onSubmit={submitName} className="space-y-3">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Dein Name"
            className="sr-input text-center"
          />
          {error && <p className="text-sm sr-bad">{error}</p>}
          <button type="submit" className="sr-btn w-full">Beitreten</button>
        </form>
      </CenterCard>
    );
  }

  // ── Im Raum ─────────────────────────────────────────────────────────────────
  const isHost = state.hostId === you?.id;
  const phase = state.phase;
  const playing = !!me && PLAYING_STATES.includes(me.state);
  const round = state.round;
  const checkpointTotal = round?.checkpointTotal || 0;

  let body;
  if (phase === "lobby") {
    body = <Lobby state={state} meId={you?.id} isHost={isHost} actions={actions} code={code} />;
  } else if (phase === "results") {
    body = <Results state={state} meId={you?.id} isHost={isHost} actions={actions} />;
  } else if (playing && round && round.kind === "custom" && (customLevel.code !== round.custom?.code || customLevel.status !== "ready")) {
    // Eigenes Level wird gerade geladen (oder das Laden ist gescheitert) — noch keine Runde zum Zeigen. Auch solange noch das
    // Level der VORIGEN Runde im Zustand steht (erstes Rendern nach dem Rundenwechsel, bevor der Lade-Effekt läuft): Sonst
    // meldete die Rennansicht dessen Hash und der Spieler landete als „veraltete Version“ bei den Zuschauern.
    body = (
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <Notice>
          {customLevel.code === round.custom?.code && customLevel.status === "error" ? (
            <>
              <h2 className="sr-display text-xl mb-1.5">Level nicht ladbar</h2>
              <p className="text-sm sr-dim">Vielleicht wurde es inzwischen gelöscht. Du schaust diese Runde zu und spielst in der nächsten mit.</p>
            </>
          ) : (
            <>
              <Spinner size={22} className="mx-auto mb-3" />
              <p className="text-sm sr-dim">Lädt „{round.custom?.name}“ von {round.custom?.creatorName} …</p>
            </>
          )}
        </Notice>
        <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} />
      </div>
    );
  } else if (playing && round) {
    const hardcore = !!round.hardcore;
    const stopped = me.state === "dnf" || (hardcore && gestorbenIn === round.id) || (timeattack && me.state === "finished");
    // Rangliste und Knöpfe: neben dem Bild auf der Seite — und als Seitenspalte, wenn der Lauf den Bildschirm füllt
    const seite = (
      <div className="space-y-3">
        <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} mode={round.mode} canWatch={canWatch} watchingId={watchId} onWatch={chooseWatch} />
        {timeattack && meRacing && (
          <button type="button" onClick={neuerVersuch} className="sr-btn sr-btn-sm w-full">
            <RotateCcw size={14} />
            Neuer Versuch <span className="sr-kbd ml-1">Enter</span>
          </button>
        )}
        {phase === "racing" && me.state === "racing" && gestorbenIn !== round.id && (
          <button type="button" onClick={() => actions.giveUp()} className="sr-btn sr-btn-sm sr-btn-ghost w-full">
            {timeattack ? (me.finishTicks !== null ? "Fertig — Bestzeit behalten" : "Beenden (ohne Zeit)") : "Aufgeben (DNF)"}
          </button>
        )}
        <GeisterSchalter an={geister} />
        <p className="text-xs sr-faint leading-relaxed px-1">
          {hardcore
            ? "Hardcore: Ein Tod und du bist raus; zurück zum Checkpoint ist gesperrt."
            : <><span className="sr-kbd">R</span> bringt dich zurück zum letzten Checkpoint; die Zeit läuft weiter.</>}
          {timeattack && <> <span className="sr-kbd">Enter</span> startet einen neuen Versuch von vorn — die beste Zeit zählt.</>}
          {canWatch && " Mit dem Auge in der Rangliste schaust du einem Läufer zu."}
        </p>
      </div>
    );
    body = (
      // Nebeneinander erst, wenn Spielfeld (fest) + Rangliste wirklich nebeneinander passen — sonst
      // rutscht die Rangliste unter das Bild, statt das Bild zusammenzuquetschen.
      // (minmax(0, auto): Ohne die 0 richtet sich die Spalte nach der festen Bildbreite und ragt auf schmalen
      // Bildschirmen — Handy, Tablet — links und rechts aus der Seite.)
      <div className="grid grid-cols-[minmax(0,auto)] 2xl:grid-cols-[auto_300px] gap-4 items-start justify-center">
        <RaceView
          key={round.number}
          params={round.kind === "custom" ? undefined : round.params}
          level={round.kind === "custom" ? customLevel.level : undefined}
          // (Zeitjagd: jeder Versuch baut die Welt neu auf — deshalb steckt die Versuchsnummer mit drin)
          roundNumber={round.number * 1000 + attempt}
          phase={phase}
          startAt={attempt > 1 && attemptStartAt ? attemptStartAt : round.startAt}
          clock={clock}
          epoch={epoch}
          frozen={stopped}
          playerColor={me.color}
          meState={me.state}
          finishNote={timeattack ? (me.finishTicks !== null ? `Bestzeit ${formatTicks(me.finishTicks)} · Enter für einen neuen Versuch` : "Enter für einen neuen Versuch") : undefined}
          onReady={(hash, checkpoints) => { if (state.phase === "loading") actions.ready(hash, checkpoints); }}
          onCheckpoint={(index, tick) => actions.checkpoint(index, tick, timeattack ? attempt : undefined)}
          onFinish={(payload) => {
            if (timeattack) {
              const best = bestRef.current;
              if (!best || best.round !== round.id || payload.ticks < best.payload.ticks) bestRef.current = { round: round.id, attempt, payload };
              actions.finish({ ...payload, attempt });
            } else {
              actions.finish(payload);
            }
          }}
          onPosition={(pos) => actions.position({ ...pos, a: attempt })}
          remote={remote}
          runners={aktiveLaeufer}
          spectate={canWatch && watchId ? aktiveLaeufer.find((p) => p.id === watchId) || null : null}
          deadline={deadlineOf(round)}
          extraStats={timeattack ? [{ label: "Versuch", value: attempt }, { label: "Bestzeit", value: formatTicks(me.finishTicks) }] : undefined}
          hardcore={hardcore}
          onDeath={() => { setGestorbenIn(round.id); actions.giveUp({ died: true }); }}
          vollbild
          panel={seite}
        />
        {seite}
      </div>
    );
  } else if (inRace && round && me?.state !== "incompatible" && (round.kind !== "custom" || (customLevel.code === round.custom?.code && customLevel.status === "ready"))) {
    // Zuschauer (zu spät gekommen, nicht rechtzeitig fertig): dasselbe Level, die Kamera folgt einem der Läufer
    body = (
      <div className="grid grid-cols-[minmax(0,auto)] 2xl:grid-cols-[auto_300px] gap-4 items-start justify-center">
        <RaceView
          key={round.number}
          params={round.kind === "custom" ? undefined : round.params}
          level={round.kind === "custom" ? customLevel.level : undefined}
          roundNumber={round.number}
          phase={phase}
          startAt={round.startAt}
          clock={clock}
          epoch={epoch}
          frozen
          watchOnly
          meState="spectator"
          remote={remote}
          runners={aktiveLaeufer}
          spectate={watchId ? aktiveLaeufer.find((p) => p.id === watchId) || null : null}
          deadline={deadlineOf(round)}
        />
        <div className="space-y-3">
          <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} mode={round.mode} canWatch={canWatch} watchingId={watchId} onWatch={chooseWatch} />
          <GeisterSchalter an={geister} />
          <p className="text-xs sr-faint leading-relaxed px-1">Du schaust diese Runde zu und spielst in der nächsten mit.</p>
        </div>
      </div>
    );
  } else {
    // Zuschauer ohne Level (falsche Version, eigenes Level nicht ladbar)
    body = (
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <Notice>
          {me?.state === "incompatible" ? (
            <>
              <h2 className="sr-display text-xl mb-1.5">Veraltete Version</h2>
              <p className="text-sm sr-dim mb-4">Dein Level weicht von den anderen ab. Lade die Seite neu, dann bist du in der nächsten Runde dabei.</p>
              <button type="button" onClick={() => window.location.reload()} className="sr-btn">Seite neu laden</button>
            </>
          ) : (
            <>
              <h2 className="sr-display text-xl mb-1.5">Runde läuft</h2>
              <p className="text-sm sr-dim">Du schaust zu und spielst in der nächsten Runde mit.</p>
            </>
          )}
        </Notice>
        <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} mode={round?.mode} />
      </div>
    );
  }

  return (
    // Breiter als die übrigen Seiten: Das Spielfeld hat eine feste Größe (RaceView), daneben soll die
    // Rangliste noch Platz haben, ohne dass das Bild kleiner wird.
    <div className={`w-full ${phase === "lobby" || phase === "results" ? "max-w-[1320px]" : "max-w-[1480px]"} mx-auto px-4 py-6 md:py-8`}>
      <SEO title={`Seed Runners · ${phase === "lobby" ? "Lobby" : phase === "results" ? "Ergebnis" : "Rennen"}`} description="Live-Rennen in Seed Runners." path="/seed-runners" noindex />

      {toast && <div className="sr-toast">{toast}</div>}

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="sr-label">{phase === "lobby" ? "Lobby" : phase === "results" ? "Ergebnis" : "Rennen"}{round ? ` · ${rundenText(state)}` : ""}{round?.mode === "timeattack" ? ` · ${MODE_LABELS.timeattack}` : ""}{round?.hardcore ? " · Hardcore" : ""}</p>
          <div className="flex items-center gap-2">
            <h1 className="sr-display text-3xl tracking-wider" aria-label={codeOffen ? `Code ${code}` : "Code verdeckt"}>{verdeckt(code, codeOffen)}</h1>
            <button
              type="button"
              onClick={() => setCodeOffen(!codeOffen)}
              className="sr-icon-btn !w-8 !h-8"
              title={codeOffen ? "Code verdecken (z. B. beim Streamen)" : "Code zeigen"}
              aria-label={codeOffen ? "Code verdecken" : "Code zeigen"}
            >
              {codeOffen ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyLink} className="sr-btn sr-btn-sm sr-btn-ghost">
            {copied ? <Check size={14} className="sr-good" /> : <Copy size={14} />}
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
          <button type="button" onClick={leave} className="sr-btn sr-btn-sm sr-btn-quiet">
            <LogOut size={14} />
            Verlassen
          </button>
        </div>
      </div>

      {!connected && (
        <div className="sr-banner sr-banner-warn mb-4">
          <WifiOff size={13} />
          Verbindung wird wiederhergestellt — dein Lauf geht lokal weiter, Meldungen holen wir nach.
        </div>
      )}

      {body}
    </div>
  );
}
