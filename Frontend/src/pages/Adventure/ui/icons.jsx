// ui/icons.jsx — Symbole für Items, Waffen, Talente, Fähigkeiten und Ausrüstung. Items, Waffen und Talente haben eigene
// Pixelsymbole (ui/pixelIcons.js) in einem Rahmen in der Farbe der Seltenheit; fehlt eins, springt ein Lucide-Icon ein.
// Fähigkeiten bleiben Lucide; Ausrüstung hat ebenfalls Pixelsymbole.

import React from "react";
import {
  Sword, FlaskConical, Footprints, Heart, Eye, Bandage, Shield, Coins, Magnet, Droplet, Flame, Bone, Timer, Spline, Telescope,
  Copy, ChevronsRight, Zap, Bomb, Rocket, Snowflake, Feather, Anchor, Activity, ShieldPlus, Biohazard, Orbit, Axe, Ghost, Cat,
  Bird, Hourglass, Sparkles, HeartPulse, CloudLightning, Gem, Skull, Sun, Crown, Droplets, Bug, Mountain, Wind, Hammer, Tornado,
  Crosshair, RotateCw, ArrowUpRight, CloudRain, Star, Fan, Cloud, Radar, Gauge, Satellite, Box, BrickWall, ArrowBigUp, Castle,
} from "lucide-react";
import { ITEMS, RARITY } from "../data/items.js";
import { EQUIPMENT } from "../data/equipment.js";
import { WEAPONS, TALENTS } from "../data/weapons.js";
import { PIXEL_ICONS, PALETTE } from "./pixelIcons.js";

// Ein Pfad pro Farbe statt 144 Rechtecken — einmal pro Symbol gebaut
const pathCache = new Map();
function pixelPaths(id) {
  let paths = pathCache.get(id);
  if (paths) return paths;
  const byColor = {};
  PIXEL_ICONS[id].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      byColor[ch] = (byColor[ch] || "") + `M${x} ${y}h1v1h-1z`;
    }
  });
  paths = Object.entries(byColor).map(([ch, d]) => ({ fill: PALETTE[ch], d }));
  pathCache.set(id, paths);
  return paths;
}

export function PixelIcon({ id, size }) {
  if (!PIXEL_ICONS[id]) return null;
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      {pixelPaths(id).map((p) => <path key={p.fill} fill={p.fill} d={p.d} />)}
    </svg>
  );
}

const ICONS = {
  Sword, FlaskConical, Footprints, Heart, Eye, Bandage, Shield, Coins, Magnet, Droplet, Flame, Bone, Timer, Spline, Telescope,
  Copy, ChevronsRight, Zap, Bomb, Rocket, Snowflake, Feather, Anchor, Activity, ShieldPlus, Biohazard, Orbit, Axe, Ghost, Cat,
  Bird, Hourglass, Sparkles, HeartPulse, CloudLightning, Gem, Skull, Sun, Crown, Droplets, Bug, Mountain, Wind, Hammer, Tornado,
};

const ABILITY_ICONS = {
  shot: Crosshair, grenade: Bomb, roll: RotateCw, barrage: Flame,
  arrow: ArrowUpRight, shieldBash: Shield, charge: ChevronsRight, arrowRain: CloudRain,
  shuriken: Star, fan: Fan, shadowStep: Ghost, bladeSpin: Tornado,
  fireball: Flame, frostNova: Snowflake, blink: Sparkles, meteor: Sun,
  toxin: Droplet, toxicCloud: Cloud, acidSprint: Footprints, plague: Biohazard,
  laser: Zap, turret: Radar, overdrive: Gauge, orbital: Satellite,
  block: Box, wall: BrickWall, leap: ArrowBigUp, fortress: Castle,
};

export function ItemIcon({ id, size = 34, dim = false, title }) {
  const def = ITEMS[id];
  if (!def) return null;
  const Icon = ICONS[def.icon] || Gem;
  const color = RARITY[def.rarity].color;
  return (
    <span className="av-item-icon" style={{ width: size, height: size, "--rar": color, opacity: dim ? 0.35 : 1 }} title={title}>
      {PIXEL_ICONS[id] ? <PixelIcon id={id} size={Math.round(size * 0.78)} /> : <Icon size={Math.round(size * 0.58)} strokeWidth={2.25} />}
    </span>
  );
}

// Waffen und Talente aus dem Stufenaufstieg; Rahmen in der Farbe der Waffe/des Talents
// Evolutionen zeigen das Symbol ihrer Grundwaffe in Goldrahmen mit Stern
export function UpgradeIcon({ kind, id, size = 34, dim = false }) {
  const def = kind === "talent" ? TALENTS[id] : WEAPONS[id];
  if (!def) return null;
  const evo = !!def.evolvedFrom;
  return (
    <span className="av-item-icon" style={{ width: size, height: size, "--rar": evo ? "#f5cf4a" : def.color, opacity: dim ? 0.35 : 1 }}>
      <PixelIcon id={def.evolvedFrom || id} size={Math.round(size * 0.78)} />
      {evo && (
        <svg viewBox="0 0 5 5" width={Math.round(size * 0.36)} height={Math.round(size * 0.36)} shapeRendering="crispEdges" className="absolute -top-[4px] -right-[4px]" aria-hidden="true">
          <path fill="#0a090d" d="M1 0h3v1h1v3h-1v1h-3v-1h-1v-3h1z" />
          <path fill="#f5cf4a" d="M2 0h1v1h1v1h1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h1v-1h1z" />
        </svg>
      )}
    </span>
  );
}

export function EquipmentIcon({ id, size = 34, dim = false }) {
  const def = EQUIPMENT[id];
  if (!def) return null;
  return (
    <span className="av-item-icon" style={{ width: size, height: size, "--rar": "#f0a33c", opacity: dim ? 0.35 : 1 }}>
      <PixelIcon id={id} size={Math.round(size * 0.78)} />
    </span>
  );
}

export function AbilityIcon({ id, size = 22 }) {
  const Icon = ABILITY_ICONS[id] || Crosshair;
  return <Icon size={size} strokeWidth={2.25} />;
}

