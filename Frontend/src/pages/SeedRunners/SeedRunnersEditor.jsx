// SeedRunnersEditor.jsx — der Level-Editor von Seed Runners: Ein Entwurf (im Browser gespeichert) wird gebaut,
// jederzeit angespielt und später verifiziert und veröffentlicht.
//
// Aufbau: Palette links, Leinwand mit Werkzeugleiste in der Mitte, Prüfung/Eigenschaften/Level-Angaben rechts —
// eine flache Fläche mit Trennlinien. Das Dokument samt Verlauf liegt im Reducer (editor/editorReducer.js); alles
// andere (Werkzeug, Auswahl, Ansicht) ist gewöhnlicher Zustand. Gespeichert wird automatisch.
//
// Testspiel: läuft mit RaceView, also mit derselben Sim, demselben Rendering und denselben Tasten wie im
// Rennen — nur ohne Server. Es kann am Levelstart oder ab der Kachel unter dem Zeiger beginnen; danach
// geht es exakt an die alte Stelle im Editor zurück (der Editor bleibt dabei im Hintergrund erhalten).
import React, { useCallback, useContext, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Brush, Square, Eraser, MousePointer2, Hand, Undo2, Redo2, Copy, Scissors, ClipboardPaste, Trash2,
  FlipHorizontal2, FlipVertical2, ZoomIn, ZoomOut, Maximize, Grid3x3, Link2, Route, Play, Crosshair, RotateCcw,
  Check, Loader2, AlertTriangle, ShieldCheck, BadgeCheck, ShieldAlert, Upload, Globe,
} from "lucide-react";
import SEO from "../../components/SEO";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import RaceView from "./room/RaceView.jsx";
import EditorCanvas from "./editor/EditorCanvas.jsx";
import Palette from "./editor/Palette.jsx";
import PropertiesPanel from "./editor/PropertiesPanel.jsx";
import LevelSettings from "./editor/LevelSettings.jsx";
import IssuesPanel from "./editor/IssuesPanel.jsx";
import VerifyRun from "./editor/VerifyRun.jsx";
import PublishPanel from "./editor/PublishPanel.jsx";
import { levelPath } from "./levels/shareCode.js";
import { verificationState } from "./editor/verification.js";
import { getVerification } from "./room/levelApi.js";
import { formatTicks } from "./room/format.js";
import { buttonClass, primaryButtonClass } from "./editor/fields.jsx";
import { editorReducer, initEditorState } from "./editor/editorReducer.js";
import { canUndo, canRedo } from "./editor/history.js";
import { buildPreview } from "./editor/previewWorld.js";
import { createDraftStore, browserStorage } from "./editor/drafts.js";
import { DEFAULT_BRUSH, brushLabel } from "./editor/palette.js";
import * as ops from "./editor/ops.js";
import { validateDoc } from "./level/index.js";
import { BIOMES } from "./gen/biomes.js";
import { ELEMENT_SCHEMA } from "./sim/elements/schema.js";

const COUNTDOWN_MS = 1300;
const AUTOSAVE_MS = 700;
// Solo gibt es keinen Uhrenabgleich: Die Startzeit ist schon die eigene Zeit.
const OWN_CLOCK = { toLocal: (t) => t };
const noop = () => {};

const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

const TILE_NAMES = { "#": "Block", I: "Eis", W: "Klebrige Wand", ">": "Förderband →", "<": "Förderband ←", "=": "Einweg-Plattform", S: "Start", C: "Checkpoint", E: "Ziel", G: "Greifanker" };

function describeCell(doc, x, y) {
  const el = ops.hitElement(doc, x, y);
  if (el) return ELEMENT_SCHEMA[el.type].label;
  const ch = ops.tileAt(doc, x, y);
  return ch && ch !== "." ? TILE_NAMES[ch] : "Luft";
}

function ToolButton({ icon: Icon, label, shortcut, active, onClick, disabled }) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded-md border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-violet-500/20 border-violet-400/60 text-white" : "border-transparent text-white/65 hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon size={16} />
    </button>
  );
}

const Divider = () => <span className="w-px h-5 bg-white/10 mx-1 shrink-0" />;

/** Inhalts-Hash eines Dokuments, falls es gültig ist (für die Entwurfsliste) */
function hashOf(doc) {
  const res = validateDoc(doc, { smoke: false });
  return res.ok ? res.hash : null;
}

function VerifyBadge({ state }) {
  const base = "flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 whitespace-nowrap";
  if (state.kind === "verified") {
    return (
      <span className={`${base} text-green-300 border-green-400/30 bg-green-500/8`} title="Du hast dieses Level durchgespielt, der Server hat den Lauf bestätigt. Gilt für genau diesen Spielinhalt.">
        <BadgeCheck size={13} />Verifiziert · {formatTicks(state.ticks)}
      </span>
    );
  }
  if (state.kind === "outdated") {
    return (
      <span className={`${base} text-amber-300 border-amber-400/30 bg-amber-500/8`} title="Die Spielphysik wurde seit deinem Lauf aktualisiert. Spiele das Level einmal neu durch.">
        <ShieldAlert size={13} />Verifizierung veraltet
      </span>
    );
  }
  return (
    <span
      className={`${base} text-white/45 border-white/10`}
      title={state.kind === "changed" ? "Gelände, Elemente oder Tempo-Klasse wurden seit der Verifizierung geändert. Spiele das Level erneut durch." : "Spiele dein Level einmal komplett durch, damit der Server bestätigt, dass es schaffbar ist."}
    >
      <ShieldCheck size={13} />{state.kind === "changed" ? "Nicht verifiziert — Inhalt geändert" : "Nicht verifiziert"}
    </span>
  );
}

function SaveStatus({ save }) {
  if (save.state === "error") return <span className="flex items-center gap-1.5 text-amber-300 text-xs" title={save.error}><AlertTriangle size={13} />Nicht gespeichert</span>;
  if (save.state === "saving") return <span className="flex items-center gap-1.5 text-white/40 text-xs"><Loader2 size={13} className="animate-spin" />Speichert …</span>;
  return <span className="flex items-center gap-1.5 text-white/40 text-xs"><Check size={13} />Gespeichert</span>;
}

// ── Testspiel ───────────────────────────────────────────────────────────────

function TestPlay({ play, onRestart, onExit }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-white/10">
        <button type="button" onClick={onExit} className={buttonClass}><ArrowLeft size={14} />Zurück zum Editor (Esc)</button>
        <button type="button" onClick={onRestart} className={buttonClass}><RotateCcw size={14} />Neu starten (N)</button>
        <span className="text-xs text-white/40 ml-auto">
          {play.startTile ? `Start bei ${play.startTile.tx} | ${play.startTile.ty}` : "Start am Levelstart"} · Testlauf: zählt nicht als Verifizierung
        </span>
      </div>
      <div className="p-3">
        <RaceView
          level={play.level}
          startTile={play.startTile}
          roundNumber={play.round}
          phase="countdown"
          startAt={play.startAt}
          clock={OWN_CLOCK}
          epoch={1}
          finishNote="Ziel erreicht — Esc führt zurück in den Editor, N startet neu."
          onReady={noop}
        />
      </div>
    </div>
  );
}

// ── Arbeitsbereich ───────────────────────────────────────────────────────────

function EditorWorkspace({ draftId, initialDoc, store }) {
  const [state, dispatch] = useReducer(editorReducer, initialDoc, initEditorState);
  const doc = state.hist.present;

  const [tool, setTool] = useState("brush");
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const [selection, setSelection] = useState(null);
  const [pathEdit, setPathEdit] = useState(false);
  const [pendingPortal, setPendingPortal] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [hover, setHoverState] = useState(null);
  const [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(2);
  const [play, setPlay] = useState(null);
  const [testErrors, setTestErrors] = useState(null);
  const [verifyRun, setVerifyRun] = useState(null);
  const [verifyGate, setVerifyGate] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [published, setPublished] = useState(() => store.getPublished(draftId));
  const [localVer, setLocalVer] = useState(() => store.getVerification(draftId));
  const [serverVer, setServerVer] = useState(null);
  const auth = useContext(TwitchAuthContext);
  const user = auth?.user || null;
  const [save, setSave] = useState({ state: "saved", error: "" });

  // Der Zeiger wird zusätzlich als Ref geführt: Tastenkürzel (Einfügen, Testen ab Zeiger) müssen die Kachel unter der
  // Maus im Moment des Tastendrucks kennen, nicht die des letzten Renders.
  const hoverRef = useRef(null);
  const clipboard = useRef(null);
  const viewRef = useRef(null);
  const apiRef = useRef(null);
  const noticeTimer = useRef(0);
  const dirtyDoc = useRef(false);
  const docRef = useRef(doc);
  const firstRender = useRef(true);

  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const commit = useCallback((next) => dispatch({ type: "commit", doc: next }), []);
  const setHover = useCallback((cell) => { hoverRef.current = cell; setHoverState(cell); }, []);

  // Messzugang für automatisierte Tests — nur mit ?debug in der Adresse, sonst existiert er gar nicht
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return undefined;
    window.__srEditor = {
      doc: () => docRef.current,
      view: () => ({ ...viewRef.current }),
      // Mitte einer Kachel in Bildschirmkoordinaten (für Mausereignisse des Tests)
      cellCenter(tx, ty) {
        const r = document.querySelector("[data-editor-canvas]").getBoundingClientRect();
        const v = viewRef.current;
        return { x: r.left + ((tx + 0.5) * 16 - v.x) * v.zoom, y: r.top + ((ty + 0.5) * 16 - v.y) * v.zoom };
      },
    };
    return () => { delete window.__srEditor; };
  }, []);

  // ── Abgeleitetes ──
  const preview = useMemo(() => buildPreview(doc), [doc]);
  const deferredDoc = useDeferredValue(doc);
  const check = useMemo(() => validateDoc(deferredDoc, { smoke: false }), [deferredDoc]);
  const selectedEl = useMemo(() => {
    if (!selection || selection.x0 !== selection.x1 || selection.y0 !== selection.y1) return null;
    return ops.elementAt(doc, selection.x0, selection.y0);
  }, [doc, selection]);
  const selectedCheckpoint = useMemo(() => {
    if (selectedEl || !selection || selection.x0 !== selection.x1 || selection.y0 !== selection.y1) return null;
    if (ops.tileAt(doc, selection.x0, selection.y0) !== 'C') return null;
    return { tx: selection.x0, ty: selection.y0, order: ops.getCheckpointOrder(doc, selection.x0, selection.y0) };
  }, [doc, selection, selectedEl]);
  const palette = (BIOMES[doc.meta.biome] || BIOMES.meadow).palette;

  // Verifizierung: Der Server ist maßgeblich; beim Öffnen wird er einmal nach dem aktuellen Stand gefragt (nur angemeldet).
  // Danach genügt der Hash-Vergleich mit dem Merker — jede Änderung am Spielinhalt ändert den Hash und entwertet ihn.
  const currentHash = check.ok ? check.hash : null;
  const openingHash = useRef(currentHash);
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId || !openingHash.current) return undefined;
    let alive = true;
    getVerification(openingHash.current).then((res) => { if (alive && res) setServerVer({ hash: openingHash.current, ...res }); });
    return () => { alive = false; };
  }, [userId]);
  const verState = verificationState({ hash: currentHash, local: localVer, server: serverVer });
  const onVerified = useCallback((v) => {
    store.setVerification(draftId, v);
    // Der Hash gehört auch in die Entwurfsliste, falls der Entwurf seit dem Anlegen nie geändert (also nie autogespeichert) wurde
    store.save(draftId, docRef.current, hashOf(docRef.current));
    setLocalVer(v);
    setServerVer({ hash: v.hash, verified: true, current: true, ticks: v.ticks, deaths: v.deaths, verifiedAt: v.verifiedAt });
  }, [store, draftId]);

  const onPublished = useCallback((p) => {
    store.setPublished(draftId, p);
    setPublished(p);
  }, [store, draftId]);

  const markers = useMemo(() => {
    const list = preview.issues.map((i) => ({ tx: i.tx, ty: i.ty, level: "error" }));
    if (check.ok) {
      for (const w of check.warnings) if (w.tx !== undefined) list.push({ tx: w.tx, ty: w.ty, level: "warn" });
    } else {
      for (const e of check.errors) {
        const m = /\((\d+)\|(\d+)\)/.exec(e);
        if (m) list.push({ tx: Number(m[1]), ty: Number(m[2]), level: "error" });
      }
    }
    return list;
  }, [preview, check]);

  // Der Pfad-Modus gilt nur, solange ein Element mit Pfad gewählt ist
  const pathActive = pathEdit && !!selectedEl?.path;

  // ── Automatisch speichern ──
  useEffect(() => {
    docRef.current = doc;
    if (firstRender.current) { firstRender.current = false; return undefined; }
    dirtyDoc.current = true;
    setSave((s) => (s.state === "saving" ? s : { state: "saving", error: "" }));
    const t = setTimeout(() => {
      const res = store.save(draftId, doc, hashOf(doc));
      dirtyDoc.current = !res.ok;
      setSave(res.ok ? { state: "saved", error: "" } : { state: "error", error: res.error });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, draftId, store]);

  // Beim Verlassen der Seite nichts verlieren: ausstehende Änderung sofort schreiben
  useEffect(() => {
    const flush = () => { if (dirtyDoc.current) { store.save(draftId, docRef.current, hashOf(docRef.current)); dirtyDoc.current = false; } };
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, [draftId, store]);

  // ── Aktionen ──
  const clearSelection = useCallback(() => { setSelection(null); setPathEdit(false); }, []);
  const undo = useCallback(() => { dispatch({ type: "undo" }); setPendingPortal(null); }, []);
  const redo = useCallback(() => { dispatch({ type: "redo" }); setPendingPortal(null); }, []);

  const pickBrush = useCallback((b) => {
    setBrush(b);
    // Gelände darf im Rechteck-Werkzeug bleiben; Elemente setzt nur der Pinsel
    setTool((t) => (t === "rect" && b.kind !== "element" ? t : "brush"));
    setPendingPortal(null);
    setPathEdit(false);
  }, []);

  const deleteSelection = () => {
    if (!selection) return;
    commit(ops.clearRegion(doc, selection));
    setPathEdit(false);
  };
  const copy = () => {
    if (!selection) return flash("Wähle zuerst einen Bereich (Auswahl-Werkzeug).");
    clipboard.current = ops.copyRegion(doc, selection);
    return flash("Kopiert.");
  };
  const cut = () => {
    if (!selection) return flash("Wähle zuerst einen Bereich (Auswahl-Werkzeug).");
    clipboard.current = ops.copyRegion(doc, selection);
    return deleteSelection();
  };
  const paste = () => {
    const clip = clipboard.current;
    if (!clip) return flash("Die Zwischenablage ist leer.");
    const at = hoverRef.current || (selection ? { x: selection.x0, y: selection.y0 } : { x: 0, y: 0 });
    commit(ops.pasteRegion(doc, clip, at.x, at.y));
    return setSelection({ x0: at.x, y0: at.y, x1: Math.min(doc.width - 1, at.x + clip.w - 1), y1: Math.min(doc.height - 1, at.y + clip.h - 1) });
  };
  const mirror = (axis) => {
    if (!selection) return flash("Wähle zuerst einen Bereich, den du spiegeln willst.");
    return commit(ops.mirrorRegion(doc, selection, axis));
  };
  const changeElement = (patch) => selectedEl && commit(ops.updateElement(doc, selectedEl.tx, selectedEl.ty, patch));
  const setCheckpointOrder = (order) => selectedCheckpoint && commit(ops.setCheckpointOrder(doc, selectedCheckpoint.tx, selectedCheckpoint.ty, order));
  const focusTile = (tx, ty) => {
    apiRef.current?.focusOn(tx, ty);
    setSelection({ x0: tx, y0: ty, x1: tx, y1: ty });
  };
  const zoomBy = (factor) => { apiRef.current?.zoomBy(factor); setZoom(apiRef.current?.zoom() ?? 2); };
  const fitView = () => { apiRef.current?.fit(); setZoom(apiRef.current?.zoom() ?? 2); };

  const startTest = (startTile) => {
    const res = validateDoc(doc, { smoke: true });
    if (!res.ok) {
      setTestErrors(res.errors);
      return;
    }
    setTestErrors(null);
    setPlay({ level: res.level, startTile, round: 1, startAt: Date.now() + COUNTDOWN_MS });
  };
  const startVerify = () => {
    setTestErrors(null);
    if (!user) {
      setVerifyGate(true);
      return;
    }
    setVerifyGate(false);
    const res = validateDoc(doc, { smoke: true });
    if (!res.ok) {
      setTestErrors(res.errors);
      return;
    }
    // Die Momentaufnahme wird gesperrt gespielt und ist genau das, was der Server bekommt (kanonisches Dokument + Hash)
    setVerifyRun({ level: res.level, doc: res.doc, hash: res.hash, round: 1, startAt: Date.now() + COUNTDOWN_MS });
  };
  const restartVerify = () => setVerifyRun((r) => (r ? { ...r, round: r.round + 1, startAt: Date.now() + COUNTDOWN_MS } : r));
  const exitVerify = () => setVerifyRun(null);
  const restartTest = () => setPlay((p) => (p ? { ...p, round: p.round + 1, startAt: Date.now() + COUNTDOWN_MS } : p));
  const exitTest = () => setPlay(null);
  const testFromCursor = () => {
    const at = hoverRef.current || (selection ? { x: selection.x0, y: selection.y0 } : null);
    if (!at) return flash("Bewege den Zeiger auf die Stelle im Level, ab der du testen willst.");
    if (ops.tileAt(doc, at.x, at.y) && ops.isSolidChar(ops.tileAt(doc, at.x, at.y))) return flash("Diese Kachel ist fest — wähle eine freie Stelle.");
    return startTest({ tx: at.x, ty: at.y });
  };

  // ── Tastenkürzel ── (ein Listener, der immer die aktuellen Funktionen ruft)
  const keys = useRef(null);
  useEffect(() => {
    keys.current = (e) => {
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (play || verifyRun) {
        if (e.key === "Escape") { if (play) exitTest(); else exitVerify(); }
        else if (k === "n") { if (play) restartTest(); else restartVerify(); }
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "c") { e.preventDefault(); copy(); return; }
      if (mod && k === "x") { e.preventDefault(); cut(); return; }
      if (mod && k === "v") { e.preventDefault(); paste(); return; }
      if (mod || e.altKey) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return; }
      if (e.key === "Escape") { setPendingPortal(null); if (pathEdit) setPathEdit(false); else clearSelection(); return; }
      const tools = { b: "brush", r: "rect", e: "eraser", v: "select", h: "pan" };
      if (tools[k]) { setTool(tools[k]); setPendingPortal(null); return; }
      if (k === "m") { mirror(e.shiftKey ? "v" : "h"); return; }
      if (k === "t") { testFromCursor(); return; }
      if (k === "g") { setShowGrid((v) => !v); return; }
      if (k === "f") { fitView(); return; }
      if (k === "p" && selectedEl?.path) setPathEdit((v) => !v);
    };
  });
  useEffect(() => {
    const onKey = (e) => keys.current?.(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actions = useMemo(() => ({ setSelection, setBrush, setHover, setPendingPortal, notice: flash, zoomChanged: setZoom }), [flash, setHover]);
  const ui = { tool, brush, selection, pathEdit: pathActive, pendingPortal, showGrid, showLinks, showPaths };

  const name = doc.meta.name || "Unbenanntes Level";
  const hoverInfo = hover ? `${hover.x} | ${hover.y} · ${describeCell(doc, hover.x, hover.y)}` : "";

  return (
    <div className="w-full max-w-[1700px] mx-auto px-2 md:px-4 py-4 md:py-6">
      <SEO title="Level-Editor — Seed Runners" description="Baue eigene Seed-Runners-Level im Browser." path="/seed-runners/editor" noindex />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <Link to="/seed-runners/sandbox" className="flex items-center gap-1.5 text-sm text-white/55 hover:text-white transition-colors">
          <ArrowLeft size={15} />Sandbox
        </Link>
        <h1 className="font-display text-lg md:text-xl font-bold text-white truncate min-w-0">{name}</h1>
        <span className="text-xs text-white/35 hidden sm:inline">{doc.width} × {doc.height} · {doc.elements.length} Elemente</span>
        <span className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          {published && (
            <Link to={levelPath(published.code)} className="flex items-center gap-1.5 text-xs text-violet-200 border border-violet-400/30 rounded-md px-2 py-1 whitespace-nowrap hover:bg-violet-500/10 transition-colors" title="Zur veröffentlichten Fassung">
              <Globe size={13} />Veröffentlicht · {published.code}
            </Link>
          )}
          <VerifyBadge state={verState} /><SaveStatus save={save} />
        </span>
      </div>

      {save.state === "error" && <p className="mb-3 text-sm text-amber-300">{save.error}</p>}

      <div className="bg-[#0d0d14] border border-white/10 rounded-md">
        {play && <TestPlay play={play} onRestart={restartTest} onExit={exitTest} />}
        {verifyRun && <VerifyRun key={verifyRun.round} run={verifyRun} onExit={exitVerify} onRestart={restartVerify} onVerified={onVerified} />}

        <div className={play || verifyRun ? "hidden" : ""}>
          {/* Werkzeugleiste */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-white/10">
            <ToolButton icon={Brush} label="Pinsel" shortcut="B" active={tool === "brush"} onClick={() => setTool("brush")} />
            <ToolButton icon={Square} label="Rechteck füllen" shortcut="R" active={tool === "rect"} onClick={() => setTool("rect")} />
            <ToolButton icon={Eraser} label="Radierer" shortcut="E" active={tool === "eraser"} onClick={() => setTool("eraser")} />
            <ToolButton icon={MousePointer2} label="Auswahl und Verschieben" shortcut="V" active={tool === "select"} onClick={() => setTool("select")} />
            <ToolButton icon={Hand} label="Ansicht verschieben" shortcut="H" active={tool === "pan"} onClick={() => setTool("pan")} />
            <Divider />
            <ToolButton icon={Undo2} label="Rückgängig" shortcut="Strg+Z" onClick={undo} disabled={!canUndo(state.hist)} />
            <ToolButton icon={Redo2} label="Wiederholen" shortcut="Strg+Y" onClick={redo} disabled={!canRedo(state.hist)} />
            <Divider />
            <ToolButton icon={Copy} label="Kopieren" shortcut="Strg+C" onClick={copy} disabled={!selection} />
            <ToolButton icon={Scissors} label="Ausschneiden" shortcut="Strg+X" onClick={cut} disabled={!selection} />
            <ToolButton icon={ClipboardPaste} label="Einfügen am Zeiger" shortcut="Strg+V" onClick={paste} />
            <ToolButton icon={Trash2} label="Auswahl löschen" shortcut="Entf" onClick={deleteSelection} disabled={!selection} />
            <ToolButton icon={FlipHorizontal2} label="Auswahl links/rechts spiegeln" shortcut="M" onClick={() => mirror("h")} disabled={!selection} />
            <ToolButton icon={FlipVertical2} label="Auswahl oben/unten spiegeln" shortcut="Umschalt+M" onClick={() => mirror("v")} disabled={!selection} />
            <Divider />
            <ToolButton icon={ZoomOut} label="Verkleinern" onClick={() => zoomBy(1 / 1.3)} />
            <ToolButton icon={ZoomIn} label="Vergrößern" onClick={() => zoomBy(1.3)} />
            <ToolButton icon={Maximize} label="Ganzes Level zeigen" shortcut="F" onClick={fitView} />
            <ToolButton icon={Grid3x3} label="Gitter" shortcut="G" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
            <ToolButton icon={Link2} label="Verknüpfungen zeigen" active={showLinks} onClick={() => setShowLinks((v) => !v)} />
            <ToolButton icon={Route} label="Pfade zeigen" active={showPaths} onClick={() => setShowPaths((v) => !v)} />
            <span className="flex-1" />
            <button type="button" onClick={testFromCursor} className={buttonClass} title="Testspiel ab der Kachel unter dem Zeiger (T)">
              <Crosshair size={14} />Ab Zeiger testen
            </button>
            <button type="button" onClick={() => startTest(null)} className={primaryButtonClass} title="Testspiel am Levelstart">
              <Play size={14} />Testen
            </button>
            <button
              type="button"
              onClick={startVerify}
              className={buttonClass}
              title="Level einmal komplett vom Start bis ins Ziel spielen; der Server bestätigt den Lauf. Nötig, bevor du es veröffentlichen kannst."
            >
              <ShieldCheck size={14} />Verifizieren
            </button>
            <button
              type="button"
              onClick={() => setShowPublish((v) => !v)}
              className={showPublish ? `${buttonClass} border-violet-400/60 bg-violet-500/15` : buttonClass}
              title="Level veröffentlichen: Es bekommt einen Share-Code und erscheint im Level-Browser."
              aria-expanded={showPublish}
            >
              <Upload size={14} />Veröffentlichen
            </button>
          </div>

          {showPublish && (
            <PublishPanel
              doc={doc}
              verState={verState}
              user={user}
              published={published}
              currentHash={currentHash}
              onLogin={() => auth?.login?.()}
              onPublished={onPublished}
              onClose={() => setShowPublish(false)}
            />
          )}

          {verifyGate && (
            <div className="px-4 py-3 border-b border-white/10 bg-violet-500/5" role="status">
              <p className="text-sm text-white/80 mb-2 leading-relaxed">
                Zum Verifizieren musst du mit Twitch angemeldet sein: Die bestätigte Zeit gehört deinem Konto, und dein Twitch-Name steht später als
                Ersteller am Level. Dein Entwurf bleibt in diesem Browser erhalten.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => auth?.login?.()} className={primaryButtonClass}>Mit Twitch anmelden</button>
                <button type="button" onClick={() => setVerifyGate(false)} className={buttonClass}>Schließen</button>
              </div>
            </div>
          )}

          {testErrors && (
            <div className="px-4 py-3 border-b border-white/10 bg-red-500/5">
              <p className="text-sm text-red-300 mb-1.5">Das Level lässt sich noch nicht spielen:</p>
              <ul className="text-sm text-white/70 space-y-0.5 list-disc pl-5">
                {testErrors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
              </ul>
              <button type="button" onClick={() => setTestErrors(null)} className="mt-2 text-xs text-white/45 hover:text-white underline underline-offset-2">Schließen</button>
            </div>
          )}

          <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)_19rem] divide-y lg:divide-y-0 lg:divide-x divide-white/10">
            {/* Palette */}
            <aside className="lg:h-[68vh] lg:min-h-[480px] overflow-y-auto">
              <Palette brush={brush} onPick={pickBrush} />
            </aside>

            {/* Leinwand */}
            <div className="min-w-0">
              <div className="h-[56vh] lg:h-[calc(68vh-2.25rem)] lg:min-h-[444px]">
                <EditorCanvas
                  doc={doc}
                  dispatch={dispatch}
                  ui={ui}
                  actions={actions}
                  preview={preview}
                  palette={palette}
                  markers={markers}
                  selectedEl={selectedEl}
                  viewRef={viewRef}
                  apiRef={apiRef}
                  hidden={!!(play || verifyRun)}
                />
              </div>
              <div className="flex items-center gap-x-4 gap-y-1 px-3 h-9 border-t border-white/10 text-xs text-white/45 overflow-hidden">
                <span className="tabular-nums whitespace-nowrap">{hoverInfo || "Zeiger auf das Level bewegen"}</span>
                <span className="whitespace-nowrap hidden md:inline">Pinsel: {brushLabel(brush)}</span>
                <span className="tabular-nums whitespace-nowrap hidden md:inline">{Math.round(zoom * 50)} %</span>
                {pendingPortal && <span className="text-sky-300 whitespace-nowrap">Jetzt das zweite Portal setzen (Esc bricht ab)</span>}
                {pathActive && <span className="text-amber-200 whitespace-nowrap">Pfad-Modus</span>}
                {notice && <span className="ml-auto text-amber-300 truncate">{notice}</span>}
              </div>
            </div>

            {/* Rechte Spalte */}
            <aside className="lg:h-[68vh] lg:min-h-[480px] overflow-y-auto">
              <IssuesPanel check={check} previewIssues={preview.issues} onFocus={focusTile} />
              <PropertiesPanel
                el={selectedEl}
                checkpoint={selectedCheckpoint}
                doc={doc}
                onChange={changeElement}
                onDelete={deleteSelection}
                onSetCheckpointOrder={setCheckpointOrder}
                pathEdit={pathActive}
                onTogglePath={() => setPathEdit((v) => !v)}
                onFocusTile={focusTile}
              />
              <LevelSettings
                doc={doc}
                onMeta={(patch) => commit(ops.setMeta(doc, patch))}
                onSpeedClass={(v) => commit(ops.setSpeedClass(doc, v))}
                onResize={(w, h, alignX, alignY) => { commit(ops.resizeDoc(doc, w, h, { alignX, alignY })); clearSelection(); }}
              />
            </aside>
          </div>
        </div>
      </div>

      {!play && !verifyRun && (
        <p className="mt-3 text-xs text-white/35 leading-relaxed">
          Rechte Maustaste löscht. Mausrad zoomt, Leertaste oder mittlere Taste verschiebt die Ansicht. Alt+Klick nimmt auf, was unter dem Zeiger ist.
          Klick mit dem Auswahl-Werkzeug (V) wählt ein Element; T startet das Testspiel an der Stelle des Zeigers.
        </p>
      )}
    </div>
  );
}

// ── Seite: Entwurf laden ─────────────────────────────────────────────────────

export default function SeedRunnersEditor() {
  const { draftId } = useParams();
  const store = useMemo(() => createDraftStore(browserStorage()), []);
  const initialDoc = useMemo(() => store.load(draftId), [store, draftId]);

  if (!initialDoc) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-16">
        <SEO title="Level-Editor — Seed Runners" description="Baue eigene Seed-Runners-Level im Browser." path="/seed-runners/editor" noindex />
        <h1 className="font-display text-2xl font-bold text-white mb-3">Diesen Entwurf gibt es nicht</h1>
        <p className="text-sm text-white/55 mb-6 leading-relaxed">
          Entwürfe liegen im Speicher deines Browsers. Auf einem anderen Gerät oder nach dem Löschen der Browserdaten sind sie nicht da.
        </p>
        <Link to="/seed-runners/sandbox" className={primaryButtonClass}><ArrowLeft size={14} />Zurück zur Sandbox</Link>
      </div>
    );
  }
  // key: ein anderer Entwurf bekommt einen frischen Zustand (Verlauf, Auswahl, Ansicht)
  return <EditorWorkspace key={draftId} draftId={draftId} initialDoc={initialDoc} store={store} />;
}
