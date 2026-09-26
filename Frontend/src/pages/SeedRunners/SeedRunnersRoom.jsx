// SeedRunnersRoom.jsx — ein Raum: Beitritt per Link-Code, Lobby, Rennen, Ergebnis.
//
// Die Seite zeigt je nach Raumphase eine andere Ansicht (siehe Backend/seedRunners/roomManager.js):
//   lobby → Lobby · loading/countdown/racing → RaceView + Rangliste · results → Ergebnis-Tabelle
// Der Server ist die einzige Quelle für Phase, Startzeit und Platzierung; gespielt wird lokal.
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, Check, LogOut, WifiOff, Eye, EyeOff } from "lucide-react";
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
import { getFx, subscribeFx } from "./client/fxSettings.js";

const PLAYING_STATES = ["loading", "ready", "racing", "finished", "dnf"];

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
  const { status, connected, state, me, you, error, notice, epoch, join, actions, clock } = useRoomSocket(code);

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
    body = (
      // Nebeneinander erst, wenn Spielfeld (fest) + Rangliste wirklich nebeneinander passen — sonst
      // rutscht die Rangliste unter das Bild, statt das Bild zusammenzuquetschen.
      <div className="grid 2xl:grid-cols-[auto_300px] gap-4 items-start justify-center">
        <RaceView
          key={round.number}
          params={round.kind === "custom" ? undefined : round.params}
          level={round.kind === "custom" ? customLevel.level : undefined}
          roundNumber={round.number}
          phase={phase}
          startAt={round.startAt}
          clock={clock}
          epoch={epoch}
          frozen={me.state === "dnf"}
          playerColor={me.color}
          meState={me.state}
          onReady={(hash, checkpoints) => actions.ready(hash, checkpoints)}
          onCheckpoint={(index, tick) => actions.checkpoint(index, tick)}
          onFinish={(payload) => actions.finish(payload)}
        />
        <div className="space-y-3">
          <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} />
          {phase === "racing" && me.state === "racing" && (
            <button type="button" onClick={() => actions.giveUp()} className="sr-btn sr-btn-sm sr-btn-ghost w-full">
              Aufgeben (DNF)
            </button>
          )}
          <p className="text-xs sr-faint leading-relaxed px-1">
            <span className="sr-kbd">R</span> bringt dich zurück zum letzten Checkpoint; die Zeit läuft weiter.
          </p>
        </div>
      </div>
    );
  } else {
    // Zuschauer (zu spät gekommen, nicht rechtzeitig fertig, falsche Version)
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
        <Standings players={state.players} meId={you?.id} checkpointTotal={checkpointTotal} />
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
          <p className="sr-label">{phase === "lobby" ? "Lobby" : phase === "results" ? "Ergebnis" : "Rennen"}{round ? ` · Runde ${round.number}` : ""}</p>
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
