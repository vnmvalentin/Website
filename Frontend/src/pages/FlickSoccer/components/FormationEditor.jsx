// components/FormationEditor.jsx — eigene Aufstellung bauen: fünf Scheiben auf der eigenen Hälfte verschieben. Geprüft
// wird laufend mit derselben Funktion wie auf dem Server (engine customProblem) — und zwar für alle Felder, damit die
// Aufstellung überall passt. Eine Scheibe mit Problem wird markiert, der Grund steht darunter; speichern geht erst,
// wenn alles passt.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlipVertical2, Trash2, X } from "lucide-react";
import { FIELD, FORMATIONS, FORMATION_IDS, PIECE, customProblem, encodeCustom, formationInfo, parseCustom } from "../engine/index.js";
import { TEAM_COLORS } from "../render.js";

const HALF_W = FIELD.W / 2 + 20;
const PAD = 40;
const VIEW_W = HALF_W + PAD;

// auf Tausendstel runden — genau so wird gespeichert, also auch so prüfen
const snap = (spots) => parseCustom(encodeCustom(spots));

export default function FormationEditor({ start, team = 0, isNew = false, onSave, onDelete = null, onClose }) {
  const [spots, setSpots] = useState(() => snap(formationInfo(start).spots));
  const [drag, setDrag] = useState(null); // Index der gezogenen Scheibe
  const svgRef = useRef(null);
  const problem = useMemo(() => customProblem(spots), [spots]);
  const col = TEAM_COLORS[team];
  const g0 = (FIELD.H - FIELD.GOAL_W) / 2;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toField = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = -PAD + ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((e.clientY - rect.top) / rect.height) * FIELD.H;
    // im Feld halten; die genauen Grenzen prüft customProblem
    return [
      Math.max(PIECE.R + 2, Math.min(FIELD.W / 2 - PIECE.R - 2, x)) / FIELD.W,
      Math.max(PIECE.R + 2, Math.min(FIELD.H - PIECE.R - 2, y)) / FIELD.H,
    ];
  };
  const move = (i, e) => setSpots((s) => snap(s.map((p, k) => (k === i ? toField(e) : p))));

  const onDown = (i) => (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(i);
  };
  const onMove = (i) => (e) => {
    if (drag === i) move(i, e);
  };
  const onUp = () => setDrag(null);

  // Pfeiltasten: die Scheibe im Fokus feinfühlig verschieben
  const onKeyDown = (i) => (e) => {
    const step = e.shiftKey ? 0.02 : 0.005;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setSpots((s) => snap(s.map((p, k) => (k === i ? [Math.max(0.03, Math.min(0.47, p[0] + d[0])), Math.max(0.05, Math.min(0.95, p[1] + d[1]))] : p))));
  };

  return (
    <div className="fk-dialog-backdrop" onClick={onClose}>
      <div className="fk-card fk-dialog fk-editor" role="dialog" aria-modal="true" aria-labelledby="fk-editor-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 id="fk-editor-title" className="fk-display text-2xl">{isNew ? "Eigene Aufstellung" : "Aufstellung ändern"}</h2>
            <p className="fk-faint text-[13px] mt-1">Scheiben ziehen. Das gegnerische Team steht gespiegelt gegenüber.</p>
          </div>
          <button type="button" onClick={onClose} className="fk-icon-btn" aria-label="Schließen"><X size={17} /></button>
        </div>
        <div className="px-5">
          <svg
            ref={svgRef}
            viewBox={`${-PAD} 0 ${VIEW_W} ${FIELD.H}`}
            className="fk-editor-pitch"
            // passt sich der Fensterhöhe an; das Seitenverhältnis bleibt exakt, weil die Zeigerposition daraus umgerechnet wird
            style={{ touchAction: "none", aspectRatio: `${VIEW_W} / ${FIELD.H}`, width: `min(100%, calc((100dvh - 250px) * ${VIEW_W / FIELD.H}))` }}
          >
            <rect x={-PAD} y="0" width={VIEW_W} height={FIELD.H} fill="#2c8545" />
            {Array.from({ length: 4 }, (_, k) => (
              <rect key={k} x={k * 2 * (FIELD.W / 14)} y="0" width={FIELD.W / 14} height={FIELD.H} fill="rgb(0 0 0 / 0.05)" />
            ))}
            <rect x={-PAD} y={g0} width={PAD} height={FIELD.GOAL_W} fill="#10221a" />
            {/* gesperrt: Mittelkreis und alles hinter der Mittellinie */}
            <rect x={FIELD.W / 2} y="0" width="20" height={FIELD.H} fill="rgb(0 0 0 / 0.3)" />
            <circle cx={FIELD.W / 2} cy={FIELD.H / 2} r={FIELD.CENTER_R} fill="rgb(0 0 0 / 0.3)" />
            <g fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth="3.5">
              <rect x="2" y="2" width={HALF_W} height={FIELD.H - 4} />
              <line x1={FIELD.W / 2} y1="0" x2={FIELD.W / 2} y2={FIELD.H} />
              <circle cx={FIELD.W / 2} cy={FIELD.H / 2} r={FIELD.CENTER_R} />
              <rect x="2" y={FIELD.H * 0.2} width={FIELD.W * 0.16} height={FIELD.H * 0.6} />
              <rect x="2" y={FIELD.H * 0.29} width={FIELD.W * 0.065} height={FIELD.H * 0.42} />
            </g>
            {spots.map(([fx, fy], i) => {
              const bad = problem?.index === i;
              return (
                <g
                  key={i}
                  tabIndex={0}
                  role="slider"
                  aria-label={`Scheibe ${i + 1}`}
                  aria-valuetext={`${Math.round(fx * 100)} % vom eigenen Tor, ${Math.round(fy * 100)} % von oben`}
                  className="fk-editor-disc"
                  style={{ cursor: drag === i ? "grabbing" : "grab" }}
                  onPointerDown={onDown(i)}
                  onPointerMove={onMove(i)}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onKeyDown={onKeyDown(i)}
                >
                  <circle cx={fx * FIELD.W + 2} cy={fy * FIELD.H + 5} r={PIECE.R} fill="rgb(0 0 0 / 0.3)" />
                  <circle cx={fx * FIELD.W} cy={fy * FIELD.H} r={PIECE.R - 3} fill={col.main} stroke={bad ? "#ffd84a" : "#f4f6f4"} strokeWidth="6" />
                  {bad && <circle cx={fx * FIELD.W} cy={fy * FIELD.H} r={PIECE.R + 7} fill="none" stroke="#ffd84a" strokeWidth="3" strokeDasharray="7 6" />}
                  <text x={fx * FIELD.W} y={fy * FIELD.H + 9} textAnchor="middle" fontSize="27" fontWeight="900" fontStyle="italic" fill="#fff" style={{ pointerEvents: "none" }}>
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className={`text-[13.5px] mt-2 min-h-[20px] ${problem ? "fk-editor-warn" : "fk-faint"}`} aria-live="polite">
            {problem ? `Scheibe ${problem.index + 1}: ${problem.reason}` : "Passt auf allen Feldern."}
          </p>
        </div>
        <div className="px-5 py-4 flex flex-wrap items-center gap-2">
          <select
            className="fk-input fk-select"
            value=""
            onChange={(e) => e.target.value && setSpots(snap(FORMATIONS[e.target.value].spots))}
            aria-label="Vorlage laden"
          >
            <option value="">Vorlage laden …</option>
            {FORMATION_IDS.map((id) => <option key={id} value={id}>{FORMATIONS[id].name}</option>)}
          </select>
          <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost" onClick={() => setSpots((s) => snap(s.map(([x, y]) => [x, 1 - y])))} title="Oben und unten tauschen">
            <FlipVertical2 size={15} /> Spiegeln
          </button>
          <span className="flex-1" />
          {onDelete && (
            <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost" onClick={onDelete}><Trash2 size={15} /> Löschen</button>
          )}
          <button type="button" className="fk-btn" disabled={!!problem} onClick={() => onSave(encodeCustom(spots))}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
