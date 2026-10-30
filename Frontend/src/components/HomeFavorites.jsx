// HomeFavorites.jsx — die Favoriten der Startseite (ersetzt die drei Türen, die dem Nutzer zu voll waren):
//  1. Clash Royale Minigames — breite Karte im Clash-Royale-Look (Rautenkachel, Arcade-Knöpfe, Modus-Logos)
//  2. Win Tracker + 3. Win Challenge — die ECHTEN Overlays laufen live in der Karte (HomeOverlayDemos.jsx, lazy);
//     darunter lassen sich die Vorlagen durchklicken, ohne Klick wechseln sie von selbst.
// 3D: alle drei neigen sich unter dem Zeiger (utils/useTilt.js), die Logos liegen in unterschiedlicher Tiefe.
// Bewusst ohne Leuchten, ohne Verlaufstext, ohne Vergrößern (Design-Vorgaben der Seite).
import React, { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useTilt } from "../utils/useTilt";
import { OVERLAY_TEMPLATES } from "../pages/ClashRoyale/WinTracker/overlayTheme";
import { STYLE_PRESETS } from "../pages/WinChallenge/stylePresets";
import crownImg from "../assets/clashRoyale/ui/crown.png";
import trophyImg from "../assets/clashRoyale/ui/trophy.png";

const HomeOverlayDemo = lazy(() => import("./HomeOverlayDemos"));

const CR_FONT_HREF = "https://fonts.googleapis.com/css2?family=Lilita+One&display=swap";
const LOOK_MS = 4200;

// Modus-Logos (public/cr-modes) mit Tiefe: z = wie weit das Logo beim Neigen mitwandert
const MODE_LOGOS = [
  { id: "auction", label: "Elixier Auktion", z: 1.6 },
  { id: "snake", label: "Snake Royale", z: 0.8 },
  { id: "dark-maze", label: "Dunkles Labyrinth", z: 1.2 },
  { id: "bingo", label: "Bingo Royale", z: 1.0 },
  { id: "pyramid-draft", label: "Pyramiden-Draft", z: 1.5 },
  { id: "angel-royale", label: "Angel Royale", z: 0.7 },
];

function useCrFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${CR_FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CR_FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

function MinigamesHero() {
  const tilt = useTilt(4, [14, 10]);
  return (
    <section ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}
      className="fav-hero cr-arcade-bg" aria-labelledby="fav-cr-title">
      <div className="fav-hero-copy">
        <p className="fav-hero-kicker">
          <img src={crownImg} alt="" draggable={false} className="w-7 h-7 object-contain" />
          Clash Royale · 2–8 Spieler
        </p>
        <h2 id="fav-cr-title" className="fav-hero-title">Deck Draft Minigames</h2>
        <p className="fav-hero-text">
          Zehn Draft-Modi für deine Freunde oder deinen Chat: bieten, angeln, durchs Labyrinth tappen — und am Ende mit dem Deck
          gegeneinander antreten. Im Browser, ohne Anmeldung.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          <Link to="/clash-royale" className="cr-arcade-btn cr-arcade-btn--green">Jetzt spielen</Link>
          <Link to="/clash" className="cr-arcade-btn cr-arcade-btn--blue">Alles zu Clash Royale</Link>
        </div>
      </div>
      <div className="fav-hero-logos" aria-hidden="true">
        {MODE_LOGOS.map((m, i) => (
          <img key={m.id} src={`/cr-modes/${m.id}.png`} alt="" draggable={false} loading="lazy"
            style={{ "--z": m.z, animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </section>
  );
}

/** Wechselt die Vorlage von selbst, bis jemand selbst eine wählt */
function useLooks(list) {
  const [i, setI] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (manual || list.length < 2) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;
    const id = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % list.length); }, LOOK_MS);
    return () => clearInterval(id);
  }, [manual, list.length]);
  return [list[i], (idx) => { setManual(true); setI(idx); }];
}

function OverlayFavorite({ kind, kicker, icon, title, text, to, cta, looks, lookHint }) {
  const tilt = useTilt(5, [6, 5]);
  const [look, choose] = useLooks(looks);
  return (
    <section ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}
      className="fav-card" aria-labelledby={`fav-${kind}`}>
      <div className="fav-card-stage">
        <Suspense fallback={null}>
          <HomeOverlayDemo kind={kind} look={look.id} />
        </Suspense>
      </div>
      <div className="fav-card-looks" role="tablist" aria-label={lookHint}>
        {looks.map((l, idx) => (
          <button key={l.id} type="button" role="tab" aria-selected={l.id === look.id}
            className={l.id === look.id ? "is-on" : ""} onClick={() => choose(idx)}>{l.label}</button>
        ))}
      </div>
      <div className="fav-card-body">
        <p className="fav-card-kicker">{icon}{kicker}</p>
        <h2 id={`fav-${kind}`} className="font-display text-2xl font-bold text-white tracking-tight">{title}</h2>
        <p className="text-sm text-white/55 leading-relaxed mt-2">{text}</p>
        <Link to={to} className="fav-card-cta">
          {cta} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export default function HomeFavorites() {
  useCrFont();
  return (
    <div className="flex flex-col gap-6 md:gap-7">
      <MinigamesHero />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-7">
        <OverlayFavorite
          kind="win-tracker"
          kicker="Clash Royale · OBS-Overlay"
          icon={<img src={trophyImg} alt="" draggable={false} className="w-4 h-4 object-contain" />}
          title="Win Tracker"
          text="Liga, Trophäen, Deck und die letzten Matches deines Accounts — aktualisiert sich nach jedem Kampf von selbst."
          to="/clash-royale/win-tracker"
          cta="Overlay einrichten"
          looks={OVERLAY_TEMPLATES.map((t) => ({ id: t.id, label: t.label }))}
          lookHint="Look des Win Trackers"
        />
        <OverlayFavorite
          kind="win-challenge"
          kicker="Für jeden Stream · OBS-Overlay"
          title="Win Challenge"
          text="Deine Challenges mit Zählern, Timer und Chat-Befehlen — Farben, Schrift und Aufbau stellst du selbst ein."
          to="/WinChallenge-Overlay"
          cta="Challenge erstellen"
          looks={STYLE_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
          lookHint="Look der Win Challenge"
        />
      </div>
    </div>
  );
}
