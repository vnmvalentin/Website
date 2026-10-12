// ui/ProfileDialog.jsx — Profil in drei Reitern: Profil (Name, Statistik, Spielstil), Designs (Scheibe, Ball, Rasen,
// Torjubel) und Erfolge. Alles nur in diesem Browser (prefs.js, stats.js); Kataloge in engine/skins.js und progress.js.
import React, { useEffect, useState } from "react";
import { X, Award, Check } from "lucide-react";
import SkinPicker from "../components/SkinPicker.jsx";
import LookPicker from "../components/LookPicker.jsx";
import DiscPreview from "../components/DiscPreview.jsx";
import { FORMATIONS, SKIN_IDS, unlockedSkins } from "../engine/index.js";
import { ACHIEVEMENTS, BALLS, TURFS, CELEBRATIONS, achievementDone, itemUnlocked } from "../progress.js";
import { loadStats, playStyle } from "../stats.js";

const TABS = [["profil", "Profil"], ["designs", "Designs"], ["erfolge", "Erfolge"]];

const STAT_ROWS = [
  ["played", "Partien"],
  ["wins", "Siege"],
  ["goals", "Tore"],
  ["cleanSheets", "Zu null"],
  ["onlineWins", "Online-Siege"],
  ["chaosWins", "Chaos-Siege"],
  ["bankGoals", "Bandentore"],
  ["posts", "Pfostentreffer"],
];

function Stat({ label, value }) {
  return (
    <div className="fk-stat">
      <dt className="fk-label text-[11px]">{label}</dt>
      <dd className="fk-display fk-num text-[22px] mt-1">{value}</dd>
    </div>
  );
}

const countOpen = (catalog, stats) => Object.keys(catalog).filter((id) => itemUnlocked(catalog, id, stats)).length;

export default function ProfileDialog({ onClose, prefs, updatePrefs }) {
  const [stats] = useState(loadStats);
  const [tab, setTab] = useState("profil");
  const [showSecond, setShowSecond] = useState(prefs.mode === "hotseat");
  const style = playStyle(stats);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pct = (v) => (v === null ? "–" : `${v} %`);
  return (
    <div className="fk-dialog-backdrop" onClick={onClose}>
      <div
        className="fk-card fk-dialog fk-dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fk-profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 px-5 pt-5 pb-3">
          <DiscPreview skin={prefs.skin} team={0} size={52} />
          <div className="min-w-0 flex-1">
            <p className="fk-label">Profil</p>
            <h2 id="fk-profile-title" className="fk-display text-[26px] truncate">{prefs.name.trim() || "Ohne Namen"}</h2>
          </div>
          <button type="button" onClick={onClose} className="fk-icon-btn shrink-0" aria-label="Schließen"><X size={17} /></button>
        </div>
        <div className="fk-tabs px-5" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="fk-tab" onClick={() => setTab(id)}>
              {label}
              {id === "erfolge" && <span className="fk-faint fk-num ml-1.5">{stats.achievements}/{ACHIEVEMENTS.length}</span>}
            </button>
          ))}
        </div>

        {tab === "profil" && (
          <div className="fk-rows">
            <section className="px-5 py-4">
              <label className="grid gap-1.5">
                <span className="fk-section-title">Name</span>
                <input
                  className="fk-input"
                  maxLength={20}
                  value={prefs.name}
                  onChange={(e) => updatePrefs({ name: e.target.value })}
                  placeholder="So sehen dich Gegner (online Pflicht)"
                />
              </label>
            </section>
            <section className="px-5 py-4">
              <h3 className="fk-section-title mb-3">Spielstil</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Siegquote" value={pct(style.winRate)} />
                <Stat label="Tore je Partie" value={style.goalsPerMatch === null ? "–" : String(style.goalsPerMatch).replace(".", ",")} />
                <Stat label="Ø Schusskraft" value={pct(style.avgPower)} />
                <Stat label="Ball getroffen" value={pct(style.hitRate)} />
              </dl>
              <p className="fk-dim text-[14px] mt-3">
                {style.favorite
                  ? <>Lieblingsaufstellung: <b>{FORMATIONS[style.favorite.id]?.name}</b> — {style.favorite.played}-mal gespielt, {style.favorite.winRate} % gewonnen.</>
                  : "Spiele ein paar Partien, dann steht hier deine Lieblingsaufstellung."}
              </p>
            </section>
            <section className="px-5 py-4">
              <h3 className="fk-section-title mb-3">Statistik</h3>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STAT_ROWS.map(([key, label]) => <Stat key={key} label={label} value={stats[key]} />)}
              </dl>
              <p className="fk-faint text-[12.5px] mt-3">
                Gezählt wird nur in diesem Browser. Spiele zu zweit an einem Gerät zählen nur als Partie.
              </p>
            </section>
          </div>
        )}

        {tab === "designs" && (
          <div className="fk-rows">
            <section className="px-5 py-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h3 className="fk-section-title">Scheibe</h3>
                <span className="fk-faint text-[13px]">{unlockedSkins(stats).length} von {SKIN_IDS.length} frei</span>
              </div>
              <SkinPicker value={prefs.skin} onChange={(skin) => updatePrefs({ skin })} team={0} stats={stats} />
              <button type="button" className="fk-faint text-[13px] underline underline-offset-2 mt-3" onClick={() => setShowSecond((v) => !v)}>
                {showSecond ? "Scheibe für Blau ausblenden" : "Scheibe für Blau beim Spiel zu zweit wählen"}
              </button>
              {showSecond && (
                <div className="mt-3">
                  <SkinPicker value={prefs.skin2} onChange={(skin2) => updatePrefs({ skin2 })} team={1} stats={stats} />
                </div>
              )}
            </section>
            {[["ball", "Ball", BALLS], ["turf", "Rasen", TURFS], ["celebration", "Torjubel", CELEBRATIONS]].map(([kind, label, catalog]) => (
              <section key={kind} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h3 className="fk-section-title">{label}</h3>
                  <span className="fk-faint text-[13px]">{countOpen(catalog, stats)} von {Object.keys(catalog).length} frei</span>
                </div>
                <LookPicker kind={kind} value={prefs[kind]} onChange={(id) => updatePrefs({ [kind]: id })} stats={stats} />
              </section>
            ))}
            <p className="fk-faint text-[12.5px] px-5 py-3">Ball, Rasen und Torjubel siehst nur du — online sieht dein Gegner nur deine Scheibe.</p>
          </div>
        )}

        {tab === "erfolge" && (
          <ul className="fk-achievements px-5 py-4">
            {ACHIEVEMENTS.map((a) => {
              const done = achievementDone(a, stats);
              const have = Math.min(a.count, Number(stats[a.stat]) || 0);
              return (
                <li key={a.id} className={`fk-achievement${done ? " done" : ""}`}>
                  <span className="fk-achievement-badge">{done ? <Check size={16} /> : <Award size={16} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[14.5px] leading-tight">{a.name}</span>
                    <span className="block fk-faint text-[12.5px] leading-snug">{a.desc}</span>
                  </span>
                  {!done && a.count > 1 && <span className="fk-faint fk-num text-[13px]">{have}/{a.count}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
