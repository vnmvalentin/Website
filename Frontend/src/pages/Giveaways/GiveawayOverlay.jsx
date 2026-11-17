// GiveawayOverlay.jsx — OBS-Quelle der Giveaways (/overlay/giveaway, 1920×1080, durchsichtig).
//
// Unten links eine kleine Karte zum laufenden Giveaway (Stichwort im Chat, Teilnehmer, Restzeit); ?karte=0 blendet sie
// aus. Nach einer Ziehung der große Moment in der Mitte: erst laufen Namen der Teilnehmer durch, dann stehen die
// Gewinner da. Wer die Quelle mitten im Moment neu lädt, sieht gleich die Gewinner — der Namenslauf spielt nur einmal.
// Abläufe hängen an Timern im Code (der Sparmodus ohne GPU nullt CSS-Animationen). ?lang=en für Englisch.
import React, { useEffect, useRef, useState } from "react";
import { Gift, Users, Clock, MessageSquare, Trophy } from "lucide-react";
import { giveawayStage } from "./giveawayApi";
import { GIVEAWAY_TEXTS } from "./giveawayTexts";
import "./giveawayOverlay.css";

const POLL_MS = 2000;
const STAGE_W = 1920;
const STAGE_H = 1080;
/** Namenslauf vor der Enthüllung. */
const ROLL_MS = 4500;
/** So lange bleibt der Moment stehen (wie SHOW_MS in Backend/giveaways/core.js). */
const SHOW_MS = 45 * 1000;
const HIDE_MS = 600;
const CONFETTI = 28;

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function useStage() {
  const [stage, setStage] = useState(null);
  const offset = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = () => giveawayStage()
      .then((d) => {
        if (!alive) return;
        offset.current = (Number(d.serverNow) || Date.now()) - Date.now();
        setStage(d);
      })
      .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return { stage, offset };
}

function useScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

function useTick(ms, active) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

/** Kleine Karte zum laufenden Giveaway. */
function RunningCard({ g, t, now }) {
  const left = g.endDate - now;
  return (
    <div className="gwo-card gwo-running">
      <div className="gwo-kicker"><Gift size={16} strokeWidth={2.4} /> Giveaway</div>
      <p className="gwo-title">{g.title}</p>
      {g.prize && <p className="gwo-prize"><Trophy size={15} /> {g.prize}</p>}
      <div className="gwo-row">
        <span className="gwo-join">
          {g.stichwort ? <><MessageSquare size={15} /> {t.ovJoin(g.stichwort)}</> : t.ovJoinWeb}
        </span>
        <span className="gwo-meta"><Users size={14} /> {g.count}</span>
        <span className="gwo-meta"><Clock size={14} /> {g.zustand === "offen" && left > 0 ? clock(left) : t.ovWaiting}</span>
      </div>
    </div>
  );
}

/** Der große Moment: Namenslauf, dann die Gewinner. */
function DrawShow({ show, t, rolling }) {
  const [rollName, setRollName] = useState("");
  // Als Text verglichen: jeder Abruf (alle 2 s) bringt ein neues Array — der Lauf soll dabei nicht neu starten
  const namesKey = (show.namen && show.namen.length ? show.namen : show.gewinner.map((w) => w.name)).join("\n");

  useEffect(() => {
    const names = namesKey ? namesKey.split("\n") : [];
    if (!rolling || !names.length) return undefined;
    let i = 0;
    let delay = 60;
    let timer = null;
    const step = () => {
      i += 1;
      setRollName(names[i % names.length]);
      delay = Math.min(260, delay * 1.08); // wird langsamer, wie ein auslaufendes Rad
      timer = setTimeout(step, delay);
    };
    step();
    return () => clearTimeout(timer);
  }, [rolling, namesKey]);

  return (
    <div className="gwo-card gwo-show">
      <div className="gwo-kicker"><Gift size={20} strokeWidth={2.4} /> {show.title}</div>
      {rolling ? (
        <>
          <p className="gwo-rolling-label">{t.ovDrawing}</p>
          <p className="gwo-rolling">{rollName}</p>
          <p className="gwo-sub"><Users size={16} /> {t.entries(show.count)}</p>
        </>
      ) : (
        <>
          <p className="gwo-rolling-label">{t.ovWinner(show.gewinner.length)}</p>
          <ul className={`gwo-winners${show.gewinner.length > 3 ? " is-many" : ""}`}>
            {show.gewinner.map((w, i) => (
              <li key={`${w.name}-${i}`} style={{ animationDelay: `${i * 120}ms` }}>
                {w.avatar ? <img src={w.avatar} alt="" /> : <span className="gwo-noavatar"><Trophy size={22} /></span>}
                <b>{w.name}</b>
              </li>
            ))}
          </ul>
          <p className="gwo-sub">{show.prize ? `${t.prize}: ${show.prize}` : t.ovCongrats}</p>
          <div className="gwo-confetti" aria-hidden="true">
            {Array.from({ length: CONFETTI }, (_, i) => (
              <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 140}ms`, animationDuration: `${2600 + (i % 5) * 300}ms` }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function GiveawayOverlay() {
  const params = new URLSearchParams(window.location.search);
  const t = GIVEAWAY_TEXTS.dict(params.get("lang") === "en" ? "en" : "de");
  const showCard = params.get("karte") !== "0";
  const scale = useScale();
  const { stage, offset } = useStage();
  const now = Date.now() + offset.current;

  // Namenslauf nur für einen Moment, den diese Quelle von Anfang an sieht
  const firstSeen = useRef(new Map());
  const show = stage?.show || null;
  if (show && !firstSeen.current.has(`${show.id}:${show.at}`)) firstSeen.current.set(`${show.id}:${show.at}`, now);
  const seenAt = show ? firstSeen.current.get(`${show.id}:${show.at}`) : 0;
  const elapsed = show ? now - show.at : 0;
  const freshShow = show && seenAt - show.at < 3000;
  const rolling = !!show && freshShow && elapsed < ROLL_MS;
  const showVisible = !!show && elapsed < SHOW_MS;

  useTick(rolling ? 100 : 500, !!stage);

  // Ausblenden mit kurzer Pause, statt hart zu verschwinden
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!show) return undefined;
    const rest = SHOW_MS - (Date.now() + offset.current - show.at);
    if (rest <= 0) return undefined;
    setLeaving(false);
    const id = setTimeout(() => setLeaving(true), Math.max(0, rest - HIDE_MS));
    return () => clearTimeout(id);
  }, [show, offset]);

  useEffect(() => {
    document.documentElement.classList.add("gwo-transparent");
    return () => document.documentElement.classList.remove("gwo-transparent");
  }, []);

  return (
    <div className="gwo-root">
      <div className="gwo-stage" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
        {showCard && stage?.laufend && !showVisible && (
          <div className="gwo-slot-card"><RunningCard g={stage.laufend} t={t} now={now} /></div>
        )}
        {showVisible && (
          <div className={`gwo-slot-show${leaving ? " is-leaving" : ""}`}>
            <DrawShow key={`${show.id}:${show.at}`} show={show} t={t} rolling={rolling} />
          </div>
        )}
      </div>
    </div>
  );
}
