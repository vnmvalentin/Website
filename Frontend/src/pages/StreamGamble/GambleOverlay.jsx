import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createControlLink } from "../StreamScenes/sceneLink";
import { GAMBLE_LAYOUT_DEFAULT, GAMBLE_STAGE_H, GAMBLE_STAGE_W, demoMarbleEvent, mergeGambleLayout } from "./gambleLayout";
import "./gambleOverlay.css";

/**
 * OBS-Overlay für das Gamble-System aus Streamer.bot (StreamerBot/GambleCore.cs).
 * Hört auf Streamer.bots WebSocket (General/Custom, event "Gamble").
 *
 * Sichtbarkeit, Lage und Größe der drei Teile kommen aus dem Steuerpult /stream-szenen (Reiter „Gamble“),
 * abgefragt wie bei den Stream-Szenen alle 1,5 s. Ohne Verbindung gelten die Standardwerte.
 *
 * URL-Parameter:
 *   ?nur=rakete,murmeln,meldungen   nur diese Teile zeigen (je eine OBS-Quelle möglich)
 *   ?demo=1                         spielt Beispiel-Ereignisse ab (geht auch per Schalter im Steuerpult)
 *   ?ws=ws://127.0.0.1:8080/        andere Streamer.bot-Adresse
 */

/** Teil → Name im ?nur=-Parameter (ältere OBS-Links). */
const PART_PARAM = { rocket: "rakete", marbles: "murmeln", pot: "meldungen" };

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("de-DE");
const fmtX = (m) => `${(Number(m) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

const ROCKET_HIDE_AFTER_CRASH_MS = 9000;
const MARBLE_RESULT_MS = 15000;
const POT_WINNER_MS = 9000;

export default function GambleOverlay() {
  const [params] = useSearchParams();
  const parts = (params.get("nur") || "rakete,murmeln,meldungen").toLowerCase().split(",");
  const wsUrl = params.get("ws") || "ws://127.0.0.1:8080/";

  // Einstellungen aus dem Steuerpult
  const [layout, setLayout] = useState(GAMBLE_LAYOUT_DEFAULT);
  useEffect(() => {
    const link = createControlLink(null, { onSettings: (s) => setLayout(mergeGambleLayout(s?.gamble)) });
    return () => link.stop();
  }, []);
  const demo = params.get("demo") === "1" || layout.demo;

  // Bühne auf die Größe der Browserquelle bringen (bei 1920×1080 genau 1)
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const onResize = () => setFit(Math.min(window.innerWidth / GAMBLE_STAGE_W, window.innerHeight / GAMBLE_STAGE_H) || 1);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [rocket, setRocket] = useState(null);
  const [marbles, setMarbles] = useState(null);
  const [potWinner, setPotWinner] = useState(null);

  const handle = useCallback((ev) => {
    if (!ev || ev.event !== "Gamble") return;
    const now = Date.now();
    switch (ev.type) {
      case "rocket":
        if (ev.phase === "idle") setRocket((r) => (r && r.phase === "launch" ? r : null));
        else setRocket({ ...ev, receivedAt: now });
        break;
      case "marbles":
        if (ev.phase === "idle") setMarbles((m) => (m && m.phase === "result" ? m : null));
        // Zusammenführen: "closed" darf ohne Fahrerliste kommen
        else setMarbles((m) => ({ ...(m && m.phase !== "result" ? m : {}), ...ev }));
        break;
      case "marblesResult":
        setMarbles((m) => ({ ...(m || {}), ...ev, phase: "result", until: now + MARBLE_RESULT_MS }));
        break;
      case "potWinner":
        setPotWinner({ ...ev, until: now + POT_WINNER_MS });
        break;
      default:
        break;
    }
  }, []);

  // Durchsichtig in OBS
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => { document.body.style.background = prev; };
  }, []);

  // Streamer.bot-Verbindung (wie bei den Stream-Credits)
  useEffect(() => {
    if (demo) return undefined;
    let ws = null;
    let retry = null;
    let closed = false;
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        retry = setTimeout(connect, 3000);
        return;
      }
      ws.onopen = () => {
        ws.send(JSON.stringify({ request: "Subscribe", id: "gamble-sub", events: { General: ["Custom"] } }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (!msg.event || msg.event.source !== "General" || msg.event.type !== "Custom") return;
          let payload = msg.data;
          if (payload && typeof payload.data === "string") payload = JSON.parse(payload.data);
          handle(payload);
        } catch {
          /* fremde Nachricht */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      if (ws) ws.close();
    };
  }, [demo, wsUrl, handle]);

  // Demo-Ablauf; beim Ausschalten verschwinden die Beispiel-Karten
  useEffect(() => {
    if (!demo) return undefined;
    const stop = runDemo(handle);
    return () => {
      stop();
      setRocket(null);
      setMarbles(null);
      setPotWinner(null);
    };
  }, [demo, handle]);

  // Uhr für Countdowns und Ausblenden
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (potWinner && potWinner.until <= now) setPotWinner(null);
    if (marbles && marbles.phase === "result" && marbles.until <= now) setMarbles(null);
  }, [now, potWinner, marbles]);

  // Stabil, damit der Ausblend-Timer der Rakete nicht bei jedem Bild neu startet
  const hideRocket = useCallback(() => setRocket(null), []);

  const shown = Object.fromEntries(
    Object.entries(PART_PARAM).map(([k, p]) => [k, parts.includes(p) && layout[k].enabled])
  );

  return (
    <div className="gx-root">
      <div className="gx-stage" style={{ zoom: fit }}>
        {/* !gamble läuft nur im Chat, damit es bei vielen Würfen nicht staut */}
        <GambleStage
          layout={layout}
          shown={shown}
          rocket={rocket}
          marbles={marbles}
          potWinner={potWinner}
          now={now}
          onRocketDone={hideRocket}
        />
      </div>
    </div>
  );
}

/**
 * Die drei Teile auf der 1920×1080-Bühne. Teilt sich Overlay und Steuerpult (Vorschau),
 * damit beide garantiert gleich aussehen. Größe als zoom eine Ebene unter der Lage,
 * sonst würde zoom auch left/top mitskalieren.
 */
export function GambleStage({ layout, shown, rocket, marbles, potWinner, now, onRocketDone, editor }) {
  const slot = (id, content, extraClass = "") => {
    if (!content) return null;
    const l = layout[id];
    const visible = shown[id];
    if (!visible && !editor) return null;
    return (
      <div
        key={id}
        data-gamble-part={id}
        className={`gx-slot gx-slot--${id}${extraClass}${editor ? " is-editable" : ""}${editor?.selected === id ? " is-selected" : ""}${!visible ? " is-off" : ""}`}
        style={{ left: l.x, top: l.y }}
        onPointerDown={editor ? editor.onGrab(id) : undefined}
      >
        <div style={{ zoom: l.scale }}>{content}</div>
      </div>
    );
  };
  return (
    <>
      {slot("rocket", rocket && <RocketCard rocket={rocket} now={now} onDone={onRocketDone} />)}
      {slot("marbles", marbles && <MarbleCard m={marbles} now={now} />)}
      {slot(
        "pot",
        potWinner && (
          <div className="gx-pot">
            <div className="gx-pot__label">Topf gewonnen</div>
            <div className="gx-pot__name">{potWinner.user}</div>
            <div className="gx-pot__amount">{fmt(potWinner.amount)} Punkte</div>
          </div>
        )
      )}
    </>
  );
}

/* ── Rakete ─────────────────────────────────────────────────────────────── */

function RocketCard({ rocket, now, onDone }) {
  const launched = rocket.phase === "launch";
  const g = Number(rocket.growth) || 0.1;
  const crash = Number(rocket.crash) || 1;
  const crashT = Math.log(crash) / g; // Sekunden bis zur Explosion

  // Während des Flugs flüssig zeichnen (rAF), sonst reicht die 250-ms-Uhr
  const [frame, setFrame] = useState(Date.now());
  const startedAt = rocket.launchedAt || rocket.receivedAt;
  const elapsed = launched ? Math.max(0, (frame - startedAt) / 1000) : 0;
  const crashed = launched && elapsed >= crashT;

  useEffect(() => {
    // Nach der Explosion steht das Bild still — dann keine Bilder mehr anfordern
    if (!launched || crashed) return undefined;
    let raf = 0;
    const loop = () => {
      setFrame(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [launched, crashed]);

  const t = launched ? Math.min(elapsed, crashT) : 0;
  const mult = launched ? (crashed ? crash : Math.exp(g * t)) : 1;

  useEffect(() => {
    if (!crashed) return undefined;
    const end = setTimeout(onDone, ROCKET_HIDE_AFTER_CRASH_MS);
    return () => clearTimeout(end);
  }, [crashed, onDone]);

  const secondsLeft = Math.max(0, Math.ceil(((rocket.startsAt || 0) - now) / 1000));
  const bets = [...(rocket.bets || [])].sort((a, b) => a.target - b.target);
  const pot = bets.reduce((s, b) => s + (Number(b.bet) || 0), 0);

  return (
    <section className={`gx-card gx-rocket${crashed ? " is-crashed" : ""}`}>
      <header className="gx-head">
        <span className="gx-title">Rakete</span>
        <span className="gx-sub">
          {!launched && (secondsLeft > 0 ? `Start in ${secondsLeft} s` : "Start …")}
          {launched && !crashed && "im Flug"}
          {crashed && "explodiert"}
        </span>
      </header>

      <RocketChart g={g} t={t} mult={mult} crashed={crashed} launched={launched} />

      <div className="gx-mult">
        <span className={crashed ? "is-red" : launched ? "is-live" : ""}>{fmtX(mult)}</span>
      </div>

      {!launched && <div className="gx-hint">!rakete &lt;betrag&gt; &lt;ziel&gt; · z. B. !rakete 100 2,5</div>}

      <ul className="gx-list">
        {bets.slice(0, 6).map((b) => {
          const safe = launched && mult >= b.target;
          const lost = crashed && !safe;
          return (
            <li key={b.user} className={safe ? "is-win" : lost ? "is-lost" : ""}>
              <span className="gx-name">{b.user}</span>
              <span className="gx-dim">{fmt(b.bet)} auf {fmtX(b.target)}</span>
              <span className="gx-val">
                {safe ? `+${fmt(Math.floor(b.bet * b.target) - b.bet)}` : lost ? `−${fmt(b.bet)}` : ""}
              </span>
            </li>
          );
        })}
        {bets.length > 6 && <li className="gx-more">+{bets.length - 6} weitere</li>}
      </ul>
      <footer className="gx-foot">
        <span>{bets.length} an Bord</span>
        <span>{fmt(pot)} Punkte im Spiel</span>
      </footer>
    </section>
  );
}

const CH_W = 300;
const CH_H = 100;

function RocketChart({ g, t, mult, crashed, launched }) {
  // Achsen wachsen mit: Zeit mindestens 8 s, Höhe mindestens 2x
  const maxT = Math.max(8, t * 1.15);
  const maxM = Math.max(2, mult * 1.2);
  const x = (s) => (s / maxT) * CH_W;
  const y = (m) => CH_H - ((m - 1) / (maxM - 1)) * (CH_H - 8) - 4;

  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const s = (t * i) / steps;
    pts.push(`${x(s).toFixed(1)},${y(Math.exp(g * s)).toFixed(1)}`);
  }
  const tipX = x(t);
  const tipY = y(mult);
  // Steigung für die Ausrichtung der Rakete
  const ds = Math.max(0.05, t * 0.02);
  const angle = (Math.atan2(y(Math.exp(g * Math.max(0, t - ds))) - tipY, tipX - x(Math.max(0, t - ds))) * 180) / Math.PI;

  // Hilfslinien bei 2x, 5x, 10x, 25x, 50x
  const marks = [2, 5, 10, 25, 50].filter((m) => m < maxM);

  return (
    <svg className="gx-chart" viewBox={`0 0 ${CH_W} ${CH_H}`} preserveAspectRatio="none">
      {marks.map((m) => (
        <g key={m}>
          <line x1="0" x2={CH_W} y1={y(m)} y2={y(m)} className="gx-grid" />
          <text x="4" y={y(m) - 3} className="gx-gridlabel">{m}x</text>
        </g>
      ))}
      {launched && (
        <>
          <polyline points={`0,${CH_H} ${pts.join(" ")} ${tipX},${CH_H}`} className={`gx-area${crashed ? " is-red" : ""}`} />
          <polyline points={pts.join(" ")} className={`gx-line${crashed ? " is-red" : ""}`} />
        </>
      )}
      <g transform={`translate(${launched ? tipX : 14},${launched ? tipY : CH_H - 10}) rotate(${launched ? -angle : -30})`}>
        {crashed ? (
          <g className="gx-boom">
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 6} y1={Math.sin(a) * 6} x2={Math.cos(a) * 18} y2={Math.sin(a) * 18} />;
            })}
          </g>
        ) : (
          <g className="gx-ship">
            <path d="M14 0 L4 -6 L-8 -6 L-8 6 L4 6 Z" />
            <path d="M-8 -6 L-13 -11 L-12 -4 Z M-8 6 L-13 11 L-12 4 Z" className="gx-fin" />
            {launched && <path d="M-9 -3 L-20 0 L-9 3 Z" className="gx-flame" />}
          </g>
        )}
      </g>
    </svg>
  );
}

/* ── Murmelbahn (feste Preise) ──────────────────────────────────────────── */

const PLACE_LABEL = ["1. Platz", "2. Platz", "3. Platz"];

function MarbleCard({ m, now }) {
  const riders = m.riders ?? (m.players || []).length;
  const secondsLeft = m.closesAt ? Math.max(0, Math.ceil((m.closesAt - now) / 1000)) : null;

  if (m.phase === "result") {
    const placings = m.placings || [];
    return (
      <section className="gx-card gx-marbles">
        <header className="gx-head">
          <span className="gx-title">Murmelbahn</span>
          <span className="gx-sub">Ergebnis · {riders} Fahrer</span>
        </header>
        <div className="gx-winner">
          <span className="gx-dim">Sieger</span>
          <span className="gx-winner__name">{m.winner}</span>
        </div>
        <ul className="gx-list">
          {placings.map((p) => (
            <li key={p.place} className={p.win > 0 ? "is-win" : "is-quiet"}>
              <span className="gx-name">{p.user}</span>
              <span className="gx-dim">{PLACE_LABEL[p.place - 1]}</span>
              <span className="gx-val">{p.win > 0 ? `+${fmt(p.win)}` : "–"}</span>
            </li>
          ))}
        </ul>
        {m.participation > 0 && <footer className="gx-foot"><span>Jeder Fahrer: +{fmt(m.participation)} fürs Mitfahren</span></footer>}
      </section>
    );
  }

  const open = m.phase === "open";
  const prizes = m.prizes || [];
  return (
    <section className="gx-card gx-marbles">
      <header className="gx-head">
        <span className="gx-title">Murmelbahn</span>
        <span className="gx-sub">
          {open ? (secondsLeft !== null ? (secondsLeft > 0 ? `Start in ${secondsLeft} s` : "Start …") : "Anmeldung offen") : "Rennen läuft"}
        </span>
      </header>
      <ul className="gx-list">
        {prizes.map((p, i) => (
          <li key={i}>
            <span className="gx-name">{PLACE_LABEL[i]}</span>
            <span className="gx-dim" />
            <span className="gx-val">{fmt(p)}</span>
          </li>
        ))}
      </ul>
      {open && m.next && (
        <div className="gx-hint gx-hint--foot">
          Noch {m.next.missing} Fahrer bis zum Preis für Platz {m.next.place}
        </div>
      )}
      <footer className="gx-foot">
        <span>{riders} Fahrer</span>
        {m.participation > 0 && <span>+{fmt(m.participation)} fürs Mitfahren</span>}
      </footer>
    </section>
  );
}

/* ── Demo ───────────────────────────────────────────────────────────────── */

function runDemo(emit) {
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const E = (type, data) => emit({ event: "Gamble", type, at: Date.now(), ...data });

  const cycle = () => {
    const t0 = Date.now();
    // Murmelbahn: Fahrer kommen nach und nach dazu, ab 8 gibt es auch einen Preis für Platz 2
    for (let n = 3; n <= 10; n++) at((n - 3) * 1800, () => E("marbles", demoMarbleEvent(n, t0 + 16000)));
    at(16000, () => E("marbles", { phase: "closed", closesAt: 0 }));
    at(24000, () =>
      E("marblesResult", {
        winner: "Mira",
        riders: 10,
        participation: 20,
        placings: [
          { place: 1, user: "Mira", win: 350 },
          { place: 2, user: "Lenny_99", win: 175 },
        ],
      })
    );

    // Rakete
    const rbets = [
      { user: "Mira", bet: 100, target: 1.5 },
      { user: "Toastbrot", bet: 250, target: 2.5 },
      { user: "BlitzBirne", bet: 50, target: 5 },
      { user: "Kaktusmilch", bet: 500, target: 1.2 },
    ];
    at(2000, () => E("rocket", { phase: "open", startsAt: Date.now() + 10000, growth: 0.1, bets: rbets.slice(0, 2) }));
    at(5000, () => E("rocket", { phase: "open", startsAt: t0 + 12000, growth: 0.1, bets: rbets }));
    at(12000, () => E("rocket", { phase: "launch", startsAt: t0 + 12000, growth: 0.1, crash: 3.42, launchedAt: Date.now(), bets: rbets }));

    // Topf
    at(30000, () => E("potWinner", { user: "Kaktusmilch", amount: 1840, entrants: 23 }));
    at(42000, cycle);
  };
  cycle();
  return () => timers.forEach(clearTimeout);
}
