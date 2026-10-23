// ui/battle/table3d/Table3DLayer.jsx — hängt den 3D-Tisch in die Hintergrundebene der Hülle (.ss-table-bg).
// Steht einmal in der Hülle und rendert selbst nichts ins DOM. Sobald ein Spielbildschirm per useTableStage
// meldet, was er zeigt, wird die Szene gebaut (Einstieg mit Kamerafahrt), danach fährt sie von Ansicht zu
// Ansicht. Meldet niemand mehr etwas (Lobby, Menü), wird sie abgebaut und der CSS-Holztisch kommt zurück.
//
// Zustände auf .ss-game (Data-Attribute, weil die Klasse von React verwaltet wird):
//   data-table3d="intro" — Einstiegsfahrt läuft, das Spielfeld ist noch ausgeblendet
//   data-table3d="on"    — Tisch steht, Bildschirme blenden beim Phasenwechsel weich ein
//   data-scale3d="on"    — die Waage steht in 3D auf dem Tisch, die SVG-Waage im Kampf wird ausgeblendet
import { useEffect, useRef } from "react";
import { STALEMATE_TURN } from "../../../engine/battle.js";
import { getTableStage, subscribeTableStage, setActiveTableScene } from "./tableStage.js";

/** Längste Zeit, die das Spielfeld für den Einstieg verborgen bleibt. */
const INTRO_FALLBACK_MS = 5000;

/** @param {{ reduced: boolean }} props */
export default function Table3DLayer({ reduced }) {
  const sceneRef = useRef(/** @type {any} */ (null));
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const bg = /** @type {HTMLElement | null} */ (document.querySelector(".ss-table-bg"));
    const game = /** @type {HTMLElement | null} */ (document.querySelector(".ss-game"));
    if (!bg || !game) return undefined;
    let alive = true;
    let loading = false;
    let zirkel = "";
    /** @type {import("./tableStage.js").TableStage | null} */
    let stage = null;
    let dropTimer = 0;
    let introTimer = 0;
    let observed = /** @type {HTMLElement | null} */ (null);
    const setAttr = (/** @type {string} */ k, /** @type {string | null} */ v) => {
      if (v === null) delete game.dataset[k];
      else game.dataset[k] = v;
    };

    const relayout = () => requestAnimationFrame(layout);
    const ro = new ResizeObserver(relayout);
    const mo = new MutationObserver(() => sceneRef.current?.setTense(game.classList.contains("ss-tense")));
    mo.observe(game, { attributes: true, attributeFilter: ["class"] });

    /**
     * Gegenstände an Bildschirmpunkte: im Kampf Waage links neben dem Feld, Totems rechts (Gegner oben, du unten),
     * Kerzen weit außen in den oberen Ecken; sonst Kerzen neben den Inhalt, in der Totem-Phase ein Totem dazu.
     */
    function layout() {
      const s = sceneRef.current;
      if (!s || !stage) return;
      const anchor = stage.anchor?.current || null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const P = (x, y) => ({ x, y });
      if (stage.stage === "battle" && anchor?.querySelector(".ss-table")) {
        const t = anchor.querySelector(".ss-table").getBoundingClientRect();
        const l = anchor.querySelector(".ss-col-left")?.getBoundingClientRect();
        const r = anchor.querySelector(".ss-col-right")?.getBoundingClientRect();
        const L = l ? { x0: l.right + 8, w: t.left - 18 - l.right } : null;
        const R = r ? { x0: t.right + 18, w: r.left - 8 - t.right } : null;
        const okL = !!L && L.w > 120;
        const okR = !!R && R.w > 120;
        const y = (f) => t.top + t.height * f;
        // Größe: die Waage (gut 34 Tischeinheiten breit) soll etwa drei Viertel der freien Breite füllen
        const pxPerUnit = vh / 98;
        const free = Math.min(okL ? L.w : Infinity, okR ? R.w : Infinity);
        const size = Math.min(1.2, Math.max(0.5, (0.75 * free) / (34 * pxPerUnit)));
        s.setLayout({
          candles: [okL ? P(L.x0 + L.w * 0.22, y(0.04)) : null, okR ? P(R.x0 + R.w * 0.78, y(0.04)) : null],
          candleFallback: { top: t.top, height: t.height },
          scale: okL ? P(L.x0 + L.w * 0.5, y(0.6)) : null,
          totems: [okR ? P(R.x0 + R.w * 0.45, y(0.86)) : null, okR ? P(R.x0 + R.w * 0.5, y(0.4)) : null],
          size,
        });
        setAttr("scale3d", okL ? "on" : null);
        return;
      }
      setAttr("scale3d", null);
      // Hülle mit genau einem Kind (Phasen-Rahmen) → das Kind ist der eigentliche Inhalt
      const el = anchor ? (anchor.children.length === 1 ? anchor.firstElementChild : anchor) : game.querySelector("main") || game;
      const box = el.getBoundingClientRect();
      const top = Math.max(box.top, 70);
      const height = Math.max(220, Math.min(box.bottom, vh) - top);
      const isMap = stage.stage === "map" || stage.stage === "scene";
      // Kerzen in den Rand neben dem Inhalt; ist dort kaum Platz, dicht am Bildrand (nicht über der Karte)
      const freeL = box.left - 16 > 40 ? P((8 + box.left - 8) / 2, top + height * 0.42) : null;
      const freeR = vw - 16 - box.right > 40 ? P((box.right + 8 + vw - 8) / 2, top + height * 0.6) : null;
      const edge = (x, f) => (isMap ? null : P(x, top + height * f));
      const edgeX = Math.min(70, vw * 0.05);
      s.setLayout({
        candles: [freeL || edge(edgeX, 0.42), freeR || edge(vw - edgeX, 0.6)],
        candleFallback: { top, height },
        totems: [stage.stage === "totem" && freeR ? P(freeR.x, top + height * 0.8) : null, null],
        size: 0.7,
      });
      const mapEl = stage.stage === "map" ? anchor?.querySelector(".ss-map3d") : null;
      if (mapEl) {
        const m = mapEl.getBoundingClientRect();
        if (m.width > 50 && m.height > 50) s.setMapRect({ left: m.left, top: m.top, width: m.width, height: m.height });
      }
    }

    function apply() {
      const s = sceneRef.current;
      if (!s || !stage) return;
      s.setStage(stage.stage);
      if (stage.stage === "battle") {
        s.setBurn(stage.turn / STALEMATE_TURN, stage.turn >= STALEMATE_TURN);
        s.setBattle({ scale: stage.scale || 0, totems: stage.totems || [null, null] });
      } else s.setBurn(0, false);
      // Auf Größenänderungen des Inhalts (und der Karte) achten
      const anchor = stage.anchor?.current || null;
      if (anchor !== observed) {
        if (observed) ro.disconnect();
        observed = anchor;
        if (anchor) {
          ro.observe(anchor);
          const mapEl = anchor.querySelector(".ss-map3d");
          if (mapEl) ro.observe(mapEl);
        }
      }
      layout();
      relayout();      // nach dem nächsten Bild noch einmal (Schriften, Bilder, späte Größen)
    }

    function teardown() {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setActiveTableScene(null);
      bg.classList.remove("ss-bg-3d");
      ro.disconnect();
      observed = null;
      clearTimeout(introTimer);
      setAttr("table3d", null);
      setAttr("scale3d", null);
    }

    function build() {
      loading = true;
      zirkel = stage.zirkel;
      // sofort (vor dem ersten Bild) ausblenden, damit der Einstieg nicht über ein sichtbares Spielfeld fährt
      setAttr("table3d", reducedRef.current ? "on" : "intro");
      introTimer = window.setTimeout(() => { if (game.dataset.table3d === "intro") setAttr("table3d", "on"); }, INTRO_FALLBACK_MS);
      import("./tableScene.js").then((m) => {
        loading = false;
        if (!alive || !stage) { if (alive) teardown(); return; }
        const s = m.createTableScene(bg, {
          zirkel,
          reduced: reducedRef.current,
          intro: true,
          onIntroDone: () => { clearTimeout(introTimer); setAttr("table3d", "on"); },
        });
        if (!s) { teardown(); return; }
        sceneRef.current = s;
        bg.classList.add("ss-bg-3d");
        setActiveTableScene(s);
        s.setTense(game.classList.contains("ss-tense"));
        if (reducedRef.current) { clearTimeout(introTimer); setAttr("table3d", "on"); }
        if (stage.zirkel !== zirkel) { teardown(); build(); return; }
        apply();
      }).catch(() => { loading = false; teardown(); /* Chunk nicht ladbar: CSS-Tisch bleibt */ });
    }

    function onStage(st) {
      if (!st) {
        // Zwischen zwei Bildschirmen ist kurz niemand angemeldet — erst abbauen, wenn es so bleibt
        clearTimeout(dropTimer);
        dropTimer = window.setTimeout(() => { if (!getTableStage()) { stage = null; teardown(); } }, 700);
        return;
      }
      clearTimeout(dropTimer);
      stage = st;
      if (sceneRef.current && st.zirkel !== zirkel) teardown();
      if (!sceneRef.current && !loading) build();
      else apply();
    }

    const unsub = subscribeTableStage(onStage);
    window.addEventListener("resize", relayout);
    window.addEventListener("scroll", relayout, { passive: true });
    if (getTableStage()) onStage(getTableStage());
    return () => {
      alive = false;
      unsub();
      clearTimeout(dropTimer);
      window.removeEventListener("resize", relayout);
      window.removeEventListener("scroll", relayout);
      mo.disconnect();
      teardown();
    };
  }, []);

  useEffect(() => { sceneRef.current?.setReduced(reduced); }, [reduced]);

  return null;
}
