// ui/Menue.jsx — Menü des Spieleabends (Esc oder Knopf oben): weiterspielen, Ton und Lautstärke,
// Mausgeschwindigkeit, wer im Zimmer ist (der Gastgeber kann jemanden hinauswerfen) und der Einladungslink.
// Das Zimmer läuft dabei weiter — es ist ein gemeinsamer Raum, keine Pause.
import React, { useEffect, useRef, useState } from "react";
import { Check, Crown, Link2, Play, UserX, Volume2, VolumeX, X } from "lucide-react";
import { abonniere, getLautstaerke, isMuted, setLautstaerke, setMuted } from "../sound.js";
import { normalizeSkin, skinColor } from "../../Worldflip/skins.js";

/**
 * @param {{ view: object, link: string, kopiert: boolean, mausTempo: number, onMausTempo: (v: number) => void,
 *   onEinladen: () => void, onKicken: (personId: number) => void, onWeiter: () => void, onZu: () => void }} props
 */
export default function Menue({ view, link, kopiert, mausTempo, onMausTempo, onEinladen, onKicken, onWeiter, onZu }) {
  const [, setTakt] = useState(0);
  const [sicher, setSicher] = useState(null); // Person, bei der „Hinauswerfen“ ein zweites Mal geklickt werden muss
  const weiterRef = useRef(null);
  // Ton auch über die Kopfleiste schaltbar: beide zeigen denselben Stand
  useEffect(() => abonniere(() => setTakt((t) => t + 1)), []);
  useEffect(() => {
    weiterRef.current?.focus();
  }, []);
  useEffect(() => {
    if (sicher === null) return undefined;
    const t = setTimeout(() => setSicher(null), 3000);
    return () => clearTimeout(t);
  }, [sicher]);

  const stumm = isMuted();
  const laut = Math.round(getLautstaerke() * 100);

  return (
    <div
      className="sa-menue-hintergrund"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onZu();
      }}
    >
      <div
        className="sa-panel sa-menue"
        role="dialog"
        aria-modal="true"
        aria-label="Menü"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onZu();
          }
        }}
      >
        <div className="sa-menue-kopf">
          <span className="sa-label">Menü</span>
          <button type="button" className="sa-icon-btn sa-icon-sm" onClick={onZu} aria-label="Menü schließen">
            <X size={16} />
          </button>
        </div>

        <button ref={weiterRef} type="button" className="sa-btn sa-btn-lg" onClick={onWeiter}>
          <Play size={17} />Weiter
        </button>

        <section className="sa-menue-teil">
          <div className="sa-menue-zeile">
            <span>Ton</span>
            <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => setMuted(!stumm)} aria-pressed={!stumm}>
              {stumm ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {stumm ? "Aus" : "An"}
            </button>
          </div>
          <label className="sa-menue-regler">
            <span>Lautstärke</span>
            <input type="range" min="0" max="100" step="5" value={laut} disabled={stumm} onChange={(e) => setLautstaerke(Number(e.target.value) / 100)} />
            <output>{laut} %</output>
          </label>
          <label className="sa-menue-regler">
            <span>Mausgeschwindigkeit</span>
            <input type="range" min="0.25" max="3" step="0.05" value={mausTempo} onChange={(e) => onMausTempo(Number(e.target.value))} />
            <output>{mausTempo.toFixed(2).replace(".", ",")}×</output>
          </label>
        </section>

        <section className="sa-menue-teil">
          <span className="sa-label">Im Zimmer</span>
          <ul className="sa-menue-leute">
            {view.leute.map((p) => (
              <li key={p.id}>
                <span className="sa-chip" style={{ background: skinColor(normalizeSkin(p.skin, p.id)) }} />
                <span className="sa-menue-name">{p.name}</span>
                {p.id === view.du && <small>du</small>}
                {p.id === view.hostId && <Crown size={13} aria-label="Gastgeber" className="text-[var(--sa-messing)]" />}
                {!p.connected && <small>weg</small>}
                {view.host && p.id !== view.du && (
                  <button
                    type="button"
                    className={`sa-btn sa-btn-sm ${sicher === p.id ? "" : "sa-btn-ghost"}`}
                    onClick={() => {
                      if (sicher === p.id) {
                        setSicher(null);
                        onKicken(p.id);
                      } else setSicher(p.id);
                    }}
                    title="Aus dem Zimmer werfen (kommt nicht wieder herein)"
                  >
                    <UserX size={14} />
                    {sicher === p.id ? "Wirklich?" : "Hinauswerfen"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {view.zuschauer > 0 && <div className="sa-menue-hinweis">+ {view.zuschauer} schauen zu</div>}
        </section>

        <section className="sa-menue-teil">
          <span className="sa-label">Einladen</span>
          <div className="sa-menue-link">
            <input className="sa-input" readOnly value={link} aria-label="Link zum Zimmer" onFocus={(e) => e.target.select()} />
            <button type="button" className="sa-btn sa-btn-sm" onClick={onEinladen}>
              {kopiert ? <Check size={14} /> : <Link2 size={14} />}
              {kopiert ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
