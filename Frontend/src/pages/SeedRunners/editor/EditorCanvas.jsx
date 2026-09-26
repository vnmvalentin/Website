// EditorCanvas.jsx — die Leinwand des Level-Editors: zeichnet (drawEditor.js) und übersetzt Maus und Tastatur in
// Operationen auf dem Dokument (ops.js). Die Leinwand hält selbst keinen Dokument-Zustand; sie meldet Änderungen
// über `dispatch` und Auswahl/Zeiger über `actions`.
//
// Bedienung
//   Pinsel      klicken/ziehen malt (Gelände) oder setzt (Element); Alt+Klick nimmt auf, was unter dem Zeiger ist
//   Rechteck    ziehen füllt ein Rechteck mit dem Gelände des Pinsels
//   Radierer    klicken/ziehen löscht
//   Auswahl     Klick wählt eine Kachel oder ein Element, ziehen wählt ein Rechteck; in die Auswahl ziehen verschiebt sie
//   rechte Maustaste löscht in jedem Werkzeug; mittlere Taste, Leertaste+Ziehen oder das Hand-Werkzeug verschiebt die Ansicht
//   Mausrad zoomt am Zeiger, Umschalt+Mausrad und Pfeiltasten verschieben
import React, { useCallback, useEffect, useRef, useState } from "react";
import { TILE } from "../sim/config.js";
import { drawEditor, pathCell } from "./drawEditor.js";
import * as ops from "./ops.js";
import { lineCells, normRect, rectContains, clamp } from "./geometry.js";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 8;
const START_ZOOM = 2;
// Elemente, die sich mit gedrückter Maustaste in einer Reihe setzen lassen (Bröckelreihen, Stachelreihen …)
const DRAG_TYPES = new Set(["crumble", "spike", "door", "colorBlock", "ring", "crystal", "spring", "key"]);

const isTyping = (target) => target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

function clampView(view, w, h, doc) {
  const vw = w / view.zoom;
  const vh = h / view.zoom;
  view.x = clamp(view.x, -vw * 0.7, doc.width * TILE - vw * 0.3);
  view.y = clamp(view.y, -vh * 0.7, doc.height * TILE - vh * 0.3);
}

function initialView(w, h, doc) {
  const view = { x: 0, y: 0, zoom: START_ZOOM };
  const row = doc.tiles.findIndex((r) => r.includes("S"));
  if (row >= 0) {
    const col = doc.tiles[row].indexOf("S");
    view.x = (col + 0.5) * TILE - (w / view.zoom) * 0.3;
    view.y = (row + 0.5) * TILE - (h / view.zoom) * 0.6;
  }
  clampView(view, w, h, doc);
  return view;
}

export default function EditorCanvas({ doc, dispatch, ui, actions, preview, palette, markers, selectedEl, viewRef, apiRef, hidden }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const dirty = useRef(true);
  const live = useRef({});
  const st = useRef({ mode: null, working: null, drag: null, last: null, space: false, hover: null });
  const [cursor, setCursor] = useState(null);

  // Aktuelle Werte für Ereignisse und Zeichenschleife, ohne sie bei jeder Änderung neu aufzusetzen
  useEffect(() => {
    live.current = { doc, dispatch, ui, actions, preview, palette, markers, selectedEl, hidden };
    dirty.current = true;
  });

  const size = () => ({ w: canvasRef.current?.clientWidth || 0, h: canvasRef.current?.clientHeight || 0 });

  // ── Programmierschnittstelle für die Seite (Zoomknöpfe, Sprung zu Warnungen) ─────────────────
  useEffect(() => {
    apiRef.current = {
      focusOn(tx, ty) {
        const { w, h } = size();
        const view = viewRef.current;
        if (!view || !w) return;
        view.x = (tx + 0.5) * TILE - w / view.zoom / 2;
        view.y = (ty + 0.5) * TILE - h / view.zoom / 2;
        clampView(view, w, h, live.current.doc);
        dirty.current = true;
      },
      zoomBy(factor) {
        const { w, h } = size();
        const view = viewRef.current;
        if (!view || !w) return;
        const cx = view.x + w / view.zoom / 2;
        const cy = view.y + h / view.zoom / 2;
        view.zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        view.x = cx - w / view.zoom / 2;
        view.y = cy - h / view.zoom / 2;
        clampView(view, w, h, live.current.doc);
        dirty.current = true;
      },
      fit() {
        const { w, h } = size();
        const view = viewRef.current;
        const d = live.current.doc;
        if (!view || !w) return;
        view.zoom = clamp(Math.min(w / (d.width * TILE), h / (d.height * TILE)) * 0.95, MIN_ZOOM, MAX_ZOOM);
        view.x = (d.width * TILE) / 2 - w / view.zoom / 2;
        view.y = (d.height * TILE) / 2 - h / view.zoom / 2;
        clampView(view, w, h, d);
        dirty.current = true;
      },
      zoom: () => viewRef.current?.zoom ?? START_ZOOM,
    };
    return () => { apiRef.current = null; };
  }, [apiRef, viewRef]);

  // ── Zeichenschleife: nur bei Änderung ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      const { w, h } = size();
      const cur = live.current;
      if (!w || !h || cur.hidden || !cur.preview) return;
      dirty.current = false;
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      if (!viewRef.current) viewRef.current = initialView(w, h, cur.doc);
      drawEditor(ctx, {
        cssW: w, cssH: h, dpr, view: viewRef.current,
        doc: cur.doc, preview: cur.preview, palette: cur.palette,
        tool: cur.ui.tool, brush: cur.ui.brush,
        hover: st.current.hover, drag: st.current.drag,
        selection: cur.ui.selection, selectedEl: cur.selectedEl, pathEdit: cur.ui.pathEdit,
        markers: cur.markers, showGrid: cur.ui.showGrid, showLinks: cur.ui.showLinks, showPaths: cur.ui.showPaths,
      });
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { dirty.current = true; });
    ro.observe(wrapRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [viewRef]);

  // ── Zeiger ────────────────────────────────────────────────────────────────
  // Stabile Referenzen (liest Ansicht/Größe bei jedem Aufruf frisch aus den Refs, schließt nichts Reaktives
  // ein) — Mausrad- und Pfeiltasten-Effekt brauchen sie, um sie in ihrer Abhängigkeitsliste zu führen.
  const cellAtScreen = useCallback((clientX, clientY) => {
    const r = canvasRef.current.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: Math.floor((view.x + (clientX - r.left) / view.zoom) / TILE),
      y: Math.floor((view.y + (clientY - r.top) / view.zoom) / TILE),
    };
  }, [viewRef]);
  const cellOf = useCallback((e) => cellAtScreen(e.clientX, e.clientY), [cellAtScreen]);

  // Zielkachel unter dem zuletzt bekannten Bildschirm-Zeiger neu berechnen und melden — für Ereignisse, die
  // selbst keine Zeigerposition mitliefern (Pfeiltasten), aber die Ansicht verschieben.
  const refreshHover = useCallback(() => {
    const mouse = st.current.mouseScreen;
    if (!mouse) return;
    const cell = cellAtScreen(mouse.x, mouse.y);
    const hover = ops.inBounds(live.current.doc, cell.x, cell.y) ? cell : null;
    st.current.hover = hover;
    live.current.actions.setHover(hover);
  }, [cellAtScreen]);

  // ── Mausrad: zoomen am Zeiger; Umschalt = seitlich verschieben (nativer Listener, damit preventDefault geht) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const view = viewRef.current;
      const { w, h } = size();
      if (!view || !w) return;
      if (e.shiftKey) {
        view.x += (e.deltaY || e.deltaX) / view.zoom;
      } else {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const wx = view.x + mx / view.zoom;
        const wy = view.y + my / view.zoom;
        // Proportional zum Scroll-Betrag: Ein Mausrad-Rastschritt (±100) zoomt um rund 16 %, ein Trackpad mit vielen
        // kleinen Ereignissen zoomt weich statt in festen Sprüngen. Zeilenmodus (Firefox) auf Pixel umrechnen.
        const dy = clamp(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY, -300, 300);
        view.zoom = clamp(view.zoom * Math.exp(-dy * 0.0015), MIN_ZOOM, MAX_ZOOM);
        view.x = wx - mx / view.zoom;
        view.y = wy - my / view.zoom;
      }
      clampView(view, w, h, live.current.doc);
      dirty.current = true;
      live.current.actions.zoomChanged?.(view.zoom);
      // Zoomen/Verschieben (per Mausrad oder Pfeiltasten) bewegt den Zeiger nicht — ohne refreshHover() blieb
      // die zuletzt per echter Mausbewegung ermittelte Zielkachel (Einfügen fügt dort ein) stehen, auch
      // nachdem sich unter dem unbewegten Zeiger längst eine andere Kachel befand. Bei großen Bereichen, wo
      // man zum Einfügen öfter über weite Strecken navigiert statt zu ziehen, fiel das am stärksten auf
      // ("Einfügen trifft nicht zuverlässig den Zeiger").
      st.current.mouseScreen = { x: e.clientX, y: e.clientY };
      refreshHover();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [viewRef, refreshHover]);

  // ── Leertaste (Ansicht schieben) und Pfeiltasten ────────────────────────────
  useEffect(() => {
    const down = (e) => {
      if (isTyping(e.target) || live.current.hidden) return;
      if (e.code === "Space") { st.current.space = true; e.preventDefault(); setCursor("grab"); }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (step && viewRef.current && !e.ctrlKey && !e.metaKey) {
        const view = viewRef.current;
        const { w, h } = size();
        view.x += step[0] * 4 * TILE;
        view.y += step[1] * 4 * TILE;
        clampView(view, w, h, live.current.doc);
        dirty.current = true;
        refreshHover();
        e.preventDefault();
      }
    };
    const up = (e) => {
      if (e.code === "Space") { st.current.space = false; setCursor(null); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [viewRef, refreshHover]);

  const beginStroke = () => {
    live.current.dispatch({ type: "stroke-begin" });
    st.current.working = live.current.doc;
  };
  const applyStroke = (next) => {
    if (next === st.current.working) return;
    st.current.working = next;
    live.current.dispatch({ type: "stroke-update", doc: next });
  };
  const endStroke = () => {
    live.current.dispatch({ type: "stroke-end" });
    st.current.mode = null;
    st.current.working = null;
    st.current.last = null;
  };

  /** Malt oder setzt entlang der Zellen; liefert das neue Dokument */
  const strokeCells = (cells, erase) => {
    const { ui: u, actions: a } = live.current;
    const work = st.current.working;
    if (erase || u.tool === "eraser") return ops.eraseCells(work, cells);
    const { brush } = u;
    if (brush.kind === "tile") return ops.paintCells(work, cells, brush.ch);
    if (brush.kind === "marker") {
      const [x, y] = cells[cells.length - 1];
      return ops.setTile(work, x, y, brush.ch);
    }
    // Element
    let out = work;
    const list = DRAG_TYPES.has(brush.type) ? cells : [cells[cells.length - 1]];
    for (const [x, y] of list) {
      const given = brush.type === "portal" && u.pendingPortal ? { id: u.pendingPortal.id, pair: u.pendingPortal.pair } : {};
      const res = ops.placeElement(out, brush.type, x, y, given);
      if (res.error) { a.notice(res.error); continue; }
      out = res.doc;
      if (brush.type === "portal") a.setPendingPortal(u.pendingPortal ? null : { id: res.element.pair, pair: res.element.id });
      a.setSelection({ x0: x, y0: y, x1: x, y1: y });
    }
    return out;
  };

  const onPointerDown = (e) => {
    const cur = live.current;
    if (!viewRef.current) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    const s = st.current;
    const view = viewRef.current;
    const cell = cellOf(e);
    s.last = cell;

    // Ansicht schieben
    if (e.button === 1 || (e.button === 0 && (s.space || cur.ui.tool === "pan"))) {
      s.mode = "pan";
      s.pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      setCursor("grabbing");
      e.preventDefault();
      return;
    }
    if (!ops.inBounds(cur.doc, cell.x, cell.y)) return;

    // Rechte Taste: löschen (Rechteck-Werkzeug: Rechteck leeren)
    if (e.button === 2) {
      if (cur.ui.tool === "rect") { s.mode = "rect"; s.rectA = cell; s.erase = true; s.drag = { rect: normRect(cell, cell), erase: true }; }
      else { s.mode = "paint"; s.erase = true; beginStroke(); applyStroke(ops.eraseCells(s.working, [[cell.x, cell.y]])); }
      dirty.current = true;
      return;
    }
    if (e.button !== 0) return;

    // Pipette
    if (e.altKey) {
      const hit = ops.hitElement(cur.doc, cell.x, cell.y);
      if (hit) cur.actions.setBrush({ kind: "element", type: hit.type });
      else {
        const ch = ops.tileAt(cur.doc, cell.x, cell.y);
        if (ch && ch !== ".") cur.actions.setBrush({ kind: "SCGE".includes(ch) ? "marker" : "tile", ch });
      }
      return;
    }

    // Pfad des gewählten Elements bearbeiten
    const sel = cur.selectedEl;
    if (cur.ui.pathEdit && sel && sel.path) {
      const idx = sel.path.findIndex((pt) => { const [cx, cy] = pathCell(sel, pt); return cx === cell.x && cy === cell.y; });
      s.mode = "path";
      beginStroke();
      if (idx >= 0 && e.shiftKey) {
        applyStroke(ops.removePathPoint(s.working, sel.tx, sel.ty, idx));
        s.pathIndex = -1;
      } else if (idx >= 0) {
        s.pathIndex = idx;
      } else {
        const next = ops.addPathPoint(s.working, sel.tx, sel.ty, cell.x, cell.y);
        if (next === s.working) cur.actions.notice("Der Pfad ist voll (höchstens 16 Punkte) oder der Punkt liegt zu weit weg.");
        applyStroke(next);
        s.pathIndex = ops.elementAt(next, sel.tx, sel.ty)?.path.findIndex((pt) => { const [cx, cy] = pathCell(sel, pt); return cx === cell.x && cy === cell.y; }) ?? -1;
      }
      dirty.current = true;
      return;
    }

    switch (cur.ui.tool) {
      case "brush": {
        if (cur.ui.brush.kind !== "element") cur.actions.setSelection(null);
        s.mode = "paint";
        s.erase = false;
        beginStroke();
        applyStroke(strokeCells([[cell.x, cell.y]], false));
        break;
      }
      case "eraser":
        s.mode = "paint";
        s.erase = true;
        beginStroke();
        applyStroke(ops.eraseCells(s.working, [[cell.x, cell.y]]));
        break;
      case "rect":
        s.mode = "rect";
        s.rectA = cell;
        s.erase = false;
        s.drag = { rect: normRect(cell, cell), erase: false };
        break;
      case "select": {
        const inside = cur.ui.selection && rectContains(cur.ui.selection, cell.x, cell.y);
        const hit = inside ? null : ops.hitElement(cur.doc, cell.x, cell.y);
        if (inside || hit) {
          const rect = inside ? cur.ui.selection : { x0: hit.tx, y0: hit.ty, x1: hit.tx, y1: hit.ty };
          if (!inside) cur.actions.setSelection(rect);
          s.mode = "move";
          s.moveFrom = cell;
          s.moveRect = rect;
          s.moved = false;
          beginStroke();
          s.moveBase = s.working;
        } else {
          s.mode = "select";
          s.rectA = cell;
          s.drag = { rect: normRect(cell, cell), erase: false };
          cur.actions.setSelection(null);
        }
        break;
      }
      default:
        break;
    }
    dirty.current = true;
  };

  const onPointerMove = (e) => {
    const cur = live.current;
    const view = viewRef.current;
    if (!view) return;
    const s = st.current;
    s.mouseScreen = { x: e.clientX, y: e.clientY };
    const cell = cellOf(e);

    if (!s.hover || s.hover.x !== cell.x || s.hover.y !== cell.y) {
      s.hover = ops.inBounds(cur.doc, cell.x, cell.y) ? cell : null;
      cur.actions.setHover(s.hover);
      dirty.current = true;
    }
    if (!s.mode) return;

    if (s.mode === "pan") {
      view.x = s.pan.vx - (e.clientX - s.pan.sx) / view.zoom;
      view.y = s.pan.vy - (e.clientY - s.pan.sy) / view.zoom;
      const { w, h } = size();
      clampView(view, w, h, cur.doc);
      dirty.current = true;
      return;
    }

    if (s.mode === "paint") {
      if (!s.last || (s.last.x === cell.x && s.last.y === cell.y)) return;
      const cells = lineCells(s.last.x, s.last.y, cell.x, cell.y).slice(1);
      s.last = cell;
      // Marker und die meisten Elemente werden nicht "gemalt": ein Klick, ein Ding
      const { brush } = cur.ui;
      if (!s.erase && cur.ui.tool !== "eraser" && (brush.kind === "marker" || (brush.kind === "element" && !DRAG_TYPES.has(brush.type)))) return;
      applyStroke(strokeCells(cells, s.erase));
      dirty.current = true;
      return;
    }

    if (s.mode === "rect" || s.mode === "select") {
      s.drag = { rect: normRect(s.rectA, { x: clamp(cell.x, 0, cur.doc.width - 1), y: clamp(cell.y, 0, cur.doc.height - 1) }), erase: s.erase };
      dirty.current = true;
      return;
    }

    if (s.mode === "move") {
      const r0 = s.moveRect;
      const dx = clamp(cell.x - s.moveFrom.x, -r0.x0, cur.doc.width - 1 - r0.x1);
      const dy = clamp(cell.y - s.moveFrom.y, -r0.y0, cur.doc.height - 1 - r0.y1);
      if (dx === 0 && dy === 0 && !s.moved) return;
      s.moved = true;
      // Immer vom Stand VOR dem Verschieben aus rechnen, sonst summieren sich die Schritte
      applyStroke(ops.moveRegion(s.moveBase, r0, dx, dy));
      cur.actions.setSelection({ x0: r0.x0 + dx, y0: r0.y0 + dy, x1: r0.x1 + dx, y1: r0.y1 + dy });
      dirty.current = true;
      return;
    }

    if (s.mode === "path" && s.pathIndex > 0 && cur.selectedEl) {
      const el = cur.selectedEl;
      applyStroke(ops.movePathPoint(s.working, el.tx, el.ty, s.pathIndex, cell.x, cell.y));
      dirty.current = true;
    }
  };

  const finish = (e, cancelled) => {
    const cur = live.current;
    const s = st.current;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) canvasRef.current.releasePointerCapture(e.pointerId);
    const mode = s.mode;
    if (!mode) return;

    if (mode === "pan") {
      s.mode = null;
      setCursor(s.space ? "grab" : null);
      return;
    }
    if (mode === "rect" && !cancelled) {
      const rect = s.drag.rect;
      const { brush } = cur.ui;
      let next = cur.doc;
      if (s.erase) next = ops.clearRegion(cur.doc, rect);
      else if (brush.kind === "element") cur.actions.notice("Das Rechteck füllt nur Gelände. Elemente setzt du mit dem Pinsel.");
      else next = ops.fillRect(cur.doc, rect, brush.ch);
      if (next !== cur.doc) cur.dispatch({ type: "commit", doc: next });
      s.mode = null;
      s.drag = null;
      s.erase = false;
      dirty.current = true;
      return;
    }
    if (mode === "select") {
      if (!cancelled) cur.actions.setSelection(s.drag.rect);
      s.mode = null;
      s.drag = null;
      dirty.current = true;
      return;
    }
    if (mode === "rect") {
      s.mode = null;
      s.drag = null;
      s.erase = false;
      dirty.current = true;
      return;
    }
    // paint, move, path: der Strich endet
    s.moveBase = null;
    s.drag = null;
    endStroke();
    dirty.current = true;
  };

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[320px] bg-[#07070c] overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        data-editor-canvas
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor: cursor || (ui.tool === "select" ? "default" : ui.tool === "pan" ? "grab" : "crosshair") }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={() => { st.current.hover = null; st.current.mouseScreen = null; live.current.actions.setHover(null); dirty.current = true; }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
