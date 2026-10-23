// ui/path/PathMap3D.jsx — Bedienebene der 3D-Pfadkarte (die Karte selbst liegt auf dem 3D-Tisch, pathMap3d.js).
//
// Die Fläche ist durchsichtig und so groß wie früher die Pergamentkarte; der Tisch legt die Karte hinein.
// Zeiger und Tippen fragen die Szene, welche Holzmarke darunter liegt: Maus = Vorschau beim Überfahren,
// Klick wählt; Touch = erstes Tippen zeigt die Vorschau mit „Hierhin gehen“. Für die Tastatur liegen
// unsichtbare Knöpfe für die wählbaren Orte bereit.
import React, { useEffect, useRef, useState } from "react";
import { NodePreview } from "./PathMap.jsx";
import { reachable } from "../../engine/path.js";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

const PREVIEW_W = 380;

/**
 * @param {{ scene: any, map: any, pp: any|null, onChoose: (strand: number) => void, biome: any, cycle?: number,
 *   subtitle?: string, reduced?: boolean, disabled?: boolean }} props
 */
export default function PathMap3D({ scene, map, pp, onChoose, biome, cycle = 0, subtitle, reduced = false, disabled = false }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [hover, setHover] = useState(/** @type {{ lv: number, st: number } | null} */ (null));
  const [touchPick, setTouchPick] = useState(/** @type {number|null} */ (null));
  const [pos, setPos] = useState(/** @type {{ x: number, y: number } | null} */ (null));
  const options = pp && !pp.scene && !pp.done && !disabled ? reachable(pp.strand) : [];
  const visibleUpTo = pp ? pp.level + 1 : map.levels;

  // Kartendaten an den Tisch geben (weggeräumt wird sie erst, wenn der Pfad-Bildschirm geht — PathScreen)
  useEffect(() => {
    scene.setPathMap({ map, pp, biome, cycle, subtitle, disabled });
  }, [scene, map, pp, biome, cycle, subtitle, disabled]);

  // Schritte, während die Figur zum gewählten Ort läuft (wie bei der Papierkarte)
  const routeLen = pp?.route?.length || 0;
  const prevLen = useRef(routeLen);
  useEffect(() => {
    if (routeLen === prevLen.current) return undefined;
    prevLen.current = routeLen;
    if (reduced) return undefined;
    const timers = [0, 1, 2, 3].map((i) => setTimeout(() => sound.play("step"), i * 225));
    return () => timers.forEach(clearTimeout);
  }, [routeLen, reduced]);

  const isOption = (n) => !!n && !!pp && n.lv === pp.level && options.includes(n.st);
  const visible = (n) => !!n && n.lv <= visibleUpTo;

  const showPreview = (n) => {
    setHover(n);
    scene.setMapHover(n);
    const el = ref.current;
    if (!n || !el) { setPos(null); return; }
    const p = scene.mapNodeScreen(n.lv, n.st);
    const box = el.getBoundingClientRect();
    if (!p) { setPos(null); return; }
    const half = Math.min(PREVIEW_W, box.width - 16) / 2;
    setPos({ x: Math.min(box.width - half - 8, Math.max(half + 8, p.x - box.left)), y: Math.max(160, p.y - box.top) });
  };

  const pickAt = (e) => {
    const n = scene.pickMapNode(e.clientX, e.clientY);
    return n && visible(n) ? n : null;
  };

  const choose = (st) => {
    if (!options.includes(st)) return;
    setTouchPick(null);
    showPreview(null);
    onChoose(st);
  };

  const shown = hover && visible(hover) ? map.nodes[hover.lv]?.[hover.st] : null;

  return (
    <div
      ref={ref}
      className={`ss-map3d ${isOption(hover) ? "ss-map3d-pick" : ""}`}
      role="group"
      aria-label={`Karte: ${biome?.name || "Moor"}${cycle ? `, Stufe ${cycle + 1}` : ""}${subtitle ? `, ${subtitle}` : ""}`}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const n = pickAt(e);
        if ((n?.lv ?? -1) !== (hover?.lv ?? -1) || (n?.st ?? -1) !== (hover?.st ?? -1)) showPreview(n);
      }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") showPreview(null); }}
      onClick={(e) => {
        const n = pickAt(e);
        if (!n) { setTouchPick(null); showPreview(null); return; }
        const touch = /** @type {any} */ (e.nativeEvent).pointerType === "touch";
        if (!isOption(n)) { showPreview(n); return; }
        if (touch && touchPick !== n.st) { setTouchPick(n.st); showPreview(n); return; }
        choose(n.st);
      }}
    >
      {/* Tastatur: wählbare Orte als Knöpfe (unsichtbar), Fokus zeigt die Vorschau */}
      <div className="sr-only">
        {options.map((st) => (
          <button key={st} type="button" onFocus={() => showPreview({ lv: pp.level, st })} onBlur={() => showPreview(null)} onClick={() => choose(st)}>
            {de.nodes[map.nodes[pp.level]?.[st]?.type]?.name || "Ort"} – wählbar
          </button>
        ))}
      </div>
      {shown && pos && (
        <div className="ss-map-preview" style={{ left: pos.x, top: pos.y, width: Math.min(PREVIEW_W, (ref.current?.clientWidth || PREVIEW_W) - 16) }}>
          <NodePreview node={shown} />
          {touchPick !== null && hover && options.includes(hover.st) && hover.lv === pp?.level && (
            <button type="button" className="ss-seal mt-2" onClick={(e) => { e.stopPropagation(); choose(hover.st); }}>Hierhin gehen</button>
          )}
        </div>
      )}
    </div>
  );
}
