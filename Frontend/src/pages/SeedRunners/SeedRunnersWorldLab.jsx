// SeedRunnersWorldLab.jsx — Werkbank für die Weltengenerierung (gen/PLANUNG_WELTTYPEN.md).
//
// Im Spiel sieht man immer nur ein Fenster von 480 × 270 Pixeln und merkt nie, ob die Welt als
// Ganzes eine Form hat. Hier liegt sie komplett auf dem Tisch: Gelände, Zonen, Höhenprofil und —
// als grüne Punkte — alles, was der Bewegungsgraph vom Start aus erreicht. Reißt eine Route ab,
// sieht man sofort, wo. Mit „Spielen" läuft man dieselbe Welt direkt an.
//
// Entwicklerwerkzeug, absichtlich nicht im Menü verlinkt.
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Dice5, Grid2x2, Play, X } from "lucide-react";
import SEO from "../../components/SEO";
import RaceView from "./room/RaceView.jsx";
import SeedGalerie from "./SeedGalerie.jsx";
import { generateWorldAsync, dropPendingWorlds } from "./client/generateWorldAsync.js";
import { drawOverview, overviewScale } from "./client/worldOverview.js";
import { WELTTYPEN } from "./gen/world/registry.js";
import { BIOMES } from "./gen/biomes.js";
import { SPEED_CLASSES } from "./sim/classes.js";

const OWN_CLOCK = { toLocal: (ms) => ms, get offset() { return 0; } };

const field = "bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white focus:border-violet-500 focus:outline-none";
const btn = "flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold px-3 py-2 rounded-md transition-colors";

const Kpi = ({ label, value, warn }) => (
  <div className="px-3 py-2">
    <p className="text-[11px] uppercase tracking-wider text-white/35">{label}</p>
    <p className={`text-sm tabular-nums ${warn ? "text-amber-300" : "text-white"}`}>{value}</p>
  </div>
);

export default function SeedRunnersWorldLab() {
  const [seed, setSeed] = useState("welt-1");
  // Nur noch "Lang": Kurze und mittlere Zufallswelten sind in 20–40 s vorbei, selbst lange spielen sich in 1–1:30 min
  // (Rückmeldung 26.09.2026). Konstant wie das Tempo — die Längen bleiben im Generator erhalten.
  const length = "long";
  // Nur noch Super schnell: Normal/Schnell fühlten sich langweilig an, die weiten Sprünge und das
  // Überspringen ganzer Streckenabschnitte machen erst bei diesem Tempo wirklich Spaß (Rückmeldung
  // 24.09.2026). Konstant statt Auswahl — für die anderen Klassen bleibt die Sim/der Generator
  // unverändert nutzbar (sim/classes.js), nur diese Werkbank bietet sie nicht mehr an.
  const speedClass = "super";
  const [biome, setBiome] = useState("random");
  const [difficulty, setDifficulty] = useState(3);
  const [showReach, setShowReach] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [galerie, setGalerie] = useState(false);
  const canvasRef = useRef(null);

  // Erzeugt wird im Worker (client/generateWorldAsync.js). Trifft eine Antwort ein, deren Auftrag
  // nicht mehr der aktuelle ist, wird sie verworfen — sonst überholt beim schnellen Klicken durch
  // die Seeds eine alte Welt die neue.
  const [world, setWorld] = useState(null);
  const [fehler, setFehler] = useState(null);
  const auftrag = useRef(0);

  useEffect(() => {
    const meiner = ++auftrag.current;
    setFehler(null);
    // Nur noch Pfad (alte Welttypen und Kernideen seit 26.09.2026 stillgelegt)
    generateWorldAsync({ seed, length, speedClass, biome, difficulty, worldType: "pfad" })
      .then((r) => { if (auftrag.current === meiner) setWorld(r); })
      .catch((e) => { if (auftrag.current === meiner) setFehler(e.message); });
  }, [seed, length, speedClass, biome, difficulty]);

  useEffect(() => () => { dropPendingWorlds(); }, []);

  const level = world?.level || null;
  const check = world?.report || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !level) return;
    const scale = overviewScale(level, 1400);
    canvas.width = level.width * scale;
    canvas.height = level.height * scale;
    canvas.style.width = `${canvas.width}px`;
    drawOverview(canvas.getContext("2d"), level, { scale, reachable: showReach ? check?.reachable : null });
  }, [level, check, showReach]);

  // Beim Spielen bekommt RaceView eine stabile Referenz, sonst startet der Lauf bei jedem Rendern neu
  const [playLevel, setPlayLevel] = useState(null);
  const startPlay = () => { setPlayLevel(level); setPlaying(true); };

  return (
    <div className="page-fade w-full max-w-[1480px] mx-auto px-2 md:px-4 py-8">
      <SEO title="Seed Runners: Welten-Werkbank" description="Entwicklerwerkzeug für die Weltengenerierung." path="/seed-runners/welten" noindex />

      <div className="flex items-center justify-between gap-3 mb-5">
        <Link to="/seed-runners" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white transition-colors">
          <ArrowLeft size={13} />
          Seed Runners
        </Link>
        <h1 className="font-display text-lg font-bold text-white">Welten-Werkbank <span className="text-white/35 text-sm font-normal">· Welttypen, Phase C</span></h1>
      </div>

      <div className="bg-[#0d0d14] border border-white/10 rounded-md p-3 mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Seed</span>
          <input className={`${field} w-40`} value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button type="button" className={btn} onClick={() => setSeed(`welt-${Math.floor(Math.random() * 100000)}`)}>
          <Dice5 size={14} />Neu würfeln
        </button>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Länge</span>
          <div className={`${field} text-white/60`}>Lang</div>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Tempo</span>
          <div className={`${field} text-white/60`}>{SPEED_CLASSES[speedClass].label}</div>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Biom</span>
          {/* Nur die Biome des Pfads — eine Fabrik ist keine Wiese. */}
          <select className={field} value={biome} onChange={(e) => setBiome(e.target.value)}>
            <option value="random">Zufall</option>
            {WELTTYPEN.pfad.biome
              .map((b) => <option key={b} value={b}>{BIOMES[b].label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Schwierigkeit</span>
          <select className={field} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer pb-1.5">
          <input type="checkbox" checked={showReach} onChange={(e) => setShowReach(e.target.checked)} className="accent-violet-500 w-4 h-4" />
          Erreichbares zeigen
        </label>
        <button type="button" className={`${btn} ml-auto`} onClick={() => setGalerie((v) => !v)}>
          <Grid2x2 size={14} />{galerie ? "Galerie aus" : "Galerie"}
        </button>
        <button type="button" className={`${btn} disabled:opacity-40`} disabled={!level && !playing} onClick={playing ? () => setPlaying(false) : startPlay}>
          {playing ? <><X size={14} />Schließen</> : <><Play size={14} />Spielen</>}
        </button>
      </div>

      <div className="bg-[#0d0d14] border border-white/10 rounded-md mb-4">
        {!level ? (
          <p className="px-3 py-3 text-sm text-white/45">{fehler ? `Fehlgeschlagen: ${fehler}` : "Welt wird erzeugt …"}</p>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 divide-x divide-y lg:divide-y-0 divide-white/10">
            <Kpi label="Leitidee" value={level.meta.leitidee?.name || "keine"} />
            <Kpi label="Autor" value={level.meta.autor || "—"} />
            {/* Motive: je Phrase „wiederholte / geplante“ Züge an den Wiederholungen (pfad/motive.js) */}
            <Kpi
              label="Motive"
              value={level.meta.motive?.length ? level.meta.motive.map((m) => `${m.id} ${m.wiederholt}/${m.geplant - m.laenge}`).join(" · ") : "—"}
            />
            <Kpi label="Größe" value={`${level.width} × ${level.height}`} />
            {/* Gezählt wird, was terrain.js WIRKLICH gebaut hat — nicht, was das Layout wollte. */}
            <Kpi label="Abkürzungen" value={level.layout.shortcuts.length} />
            <Kpi label="Ziel erreichbar" value={check.reachedFinish ? "ja" : "nein"} warn={!check.reachedFinish} />
            <Kpi
              label="Route reißt"
              value={[...check.deadZones, ...check.brokenZones].join(", ") || "nirgends"}
              warn={check.deadZones.length + check.brokenZones.length > 0}
            />
            <Kpi label="Abkürzungs-Mängel" value={check.badShortcuts.join(", ") || "keine"} warn={check.badShortcuts.length > 0} />
            <Kpi label="Reparaturen" value={level.meta.repairs.length} warn={level.meta.repairs.length > 0} />
            <Kpi label="Erzeugen / Prüfen" value={`${world.genMs.toFixed(1)} / ${world.checkMs.toFixed(1)} ms`} />
          </div>
          {level.meta.leitidee && (
            <p className="px-3 py-2 border-t border-white/10 text-sm text-white/60">{level.meta.leitidee.satz}</p>
          )}
          </>
        )}
      </div>

      {playing && playLevel && (
        <div className="mb-4">
          <RaceView
            level={playLevel}
            roundNumber={1}
            phase="countdown"
            startAt={Date.now() + 1200}
            clock={OWN_CLOCK}
            epoch={1}
            finishNote="Im Ziel"
          />
        </div>
      )}

      {galerie ? (
        <SeedGalerie
          length={length}
          speedClass={speedClass}
          difficulty={difficulty}
          onWaehlen={(e) => { setSeed(e.seed); setGalerie(false); }}
        />
      ) : (
        <div className="bg-[#0d0d14] border border-white/10 rounded-md p-3 overflow-x-auto">
          <canvas ref={canvasRef} className="block max-w-none" />
          <p className="text-xs text-white/35 mt-2 leading-relaxed">
            Blaue Linie: geplantes Höhenprofil der Hauptroute · grüne Punkte: was der Bewegungsgraph vom Start aus
            erreicht · orange: die Trittsteine einer Abkürzung · grün Start, gelb Checkpoint, rosa Ziel · Elemente: rot Spike, orange Säge, magenta Laser, grün Feder, blau Mover (mit Bahn), cyan Kristall, gelb Anker.
          </p>
        </div>
      )}
    </div>
  );
}
