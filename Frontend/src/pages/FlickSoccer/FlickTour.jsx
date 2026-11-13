// FlickTour.jsx — die Tour: vier Pokale mit je fünf Gegnern (tour.js). Jede Karte zeigt den Gegner mit seiner Scheibe,
// sein Feld und die Regeln; gespielt wird gegen den Computer (FlickLocal mit den Angaben aus tourConfig). Ein Gegner
// wird frei, sobald der davor einmal besiegt ist. Sterne: 3 ohne Gegentor, 2 mit einem, sonst 1.
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Play, Star } from "lucide-react";
import SEO from "../../components/SEO";
import DiscPreview from "./components/DiscPreview.jsx";
import { FieldThumb } from "./components/FieldPicker.jsx";
import { FIELDS, formationInfo } from "./engine/index.js";
import { AI_LEVELS } from "./ai.js";
import { loadStats } from "./stats.js";
import { useFlickShell } from "./ui/shellContext.js";
import { TOUR_CUPS, TOUR_MAX_STARS, TOUR_STAGES, stageOpen, tourConfig, tourStage } from "./tour.js";

function Stars({ n, size = 16 }) {
  return (
    <span className="fk-stars" aria-label={`${n} von 3 Sternen`}>
      {[1, 2, 3].map((k) => <Star key={k} size={size} className={k <= n ? "on" : ""} fill={k <= n ? "currentColor" : "none"} />)}
    </span>
  );
}

export default function FlickTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const { prefs } = useFlickShell();
  const [stats] = useState(loadStats);
  const tour = stats.tour;

  const play = (stage) => navigate("/flick-soccer/spiel", { state: tourConfig(stage, prefs.formation) });

  // „Nächster Gegner" aus dem Abpfiff-Bildschirm: gleich weiter ins Spiel
  const autoPlay = location.state?.play;
  useEffect(() => {
    const stage = tourStage(autoPlay);
    if (stage && stageOpen(stage, tour)) {
      navigate("/flick-soccer/spiel", { replace: true, state: tourConfig(stage, prefs.formation) });
    }
    // nur beim Öffnen der Seite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // der erste offene Gegner ohne Sieg ist „dran"
  const current = TOUR_STAGES.find((s) => stageOpen(s, tour) && !tour[s.id]) || null;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 pt-5 pb-10">
      <SEO title="Flick Soccer — Tour" description="Flick Soccer Tour: 20 Gegner in vier Pokalen." path="/flick-soccer/tour" noindex />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/flick-soccer" className="fk-faint text-[13px] inline-flex items-center gap-1.5 hover:text-[var(--fk-text)]"><ArrowLeft size={14} /> Menü</Link>
          <h1 className="fk-display text-[38px] sm:text-[48px] mt-2">Tour</h1>
          <p className="fk-dim mt-2 text-[14.5px] max-w-[640px]">
            20 Gegner, jeder mit eigenem Feld und eigener Spielweise. Ein Sieg bringt bis zu drei Sterne: drei ohne Gegentor,
            zwei mit einem. Sterne schalten neue Scheiben frei. Du spielst mit deiner Aufstellung aus dem Menü
            ({formationInfo(prefs.formation).name}).
          </p>
        </div>
        <div className="fk-tour-total">
          <Star size={22} fill="currentColor" />
          <span className="fk-display fk-num text-[30px]">{stats.tourStars}</span>
          <span className="fk-faint fk-num">/ {TOUR_MAX_STARS}</span>
        </div>
      </header>

      <div className="grid gap-8">
        {TOUR_CUPS.map((cup, ci) => {
          const stages = TOUR_STAGES.filter((s) => s.cup === cup.id);
          const got = stages.reduce((a, s) => a + (tour[s.id] || 0), 0);
          return (
            <section key={cup.id}>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="fk-section-title"><span className="fk-faint fk-num mr-2">{ci + 1}</span>{cup.name}</h2>
                <span className="fk-faint fk-num text-[13px]">{got} / {stages.length * 3} Sterne</span>
              </div>
              <div className="fk-tour-grid">
                {stages.map((s) => {
                  const open = stageOpen(s, tour);
                  const stars = tour[s.id] || 0;
                  const isCurrent = current?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`fk-tour-card${isCurrent ? " current" : ""}${s.boss ? " boss" : ""}`}
                      disabled={!open}
                      onClick={() => play(s)}
                      title={open ? `Gegen ${s.name} spielen` : "Besiege erst den Gegner davor"}
                    >
                      <span className="fk-tour-field">
                        <FieldThumb id={s.field} />
                        <span className="fk-tour-disc"><DiscPreview skin={s.skin} team={1} number={(s.index % 5) + 1} size={54} /></span>
                        {!open && <span className="fk-tour-lock"><Lock size={20} /></span>}
                      </span>
                      <span className="fk-tour-body">
                        <span className="flex items-center justify-between gap-2">
                          <span className="fk-label text-[10.5px]">{s.boss ? "Endgegner" : `Gegner ${s.index + 1}`}</span>
                          <Stars n={stars} />
                        </span>
                        <span className="block font-bold text-[16px] leading-tight mt-1">{s.name}</span>
                        <span className="block fk-faint text-[12.5px] leading-snug mt-0.5">{s.line}</span>
                        <span className="fk-tour-tags">
                          <span>{FIELDS[s.field].name}</span>
                          <span>{AI_LEVELS[s.level].label}</span>
                          <span>{s.goals} Tore</span>
                          {s.chaos && <span className="chaos">Chaos</span>}
                        </span>
                        {s.special && (
                          <span className="fk-tour-special">
                            <b>{s.special[0]}</b> {s.special[1]}
                          </span>
                        )}
                        {isCurrent && <span className="fk-tour-go"><Play size={13} fill="currentColor" /> Jetzt spielen</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
