// HomeDoors.jsx — die drei Türen der Startseite (Streamer / Clash Royale / Spiele): je bis zu 4 Einträge mit kleinem
// Symbolbild (navigation.js → thumb), die meistbesuchten zuerst (utils/visitMemory.js, nur im Browser gespeichert).
// 3D: die ganze Tür neigt sich unter dem Zeiger (utils/useTilt.js), Kopf und Liste liegen in verschiedener Tiefe,
// das Bild einer Zeile hüpft beim Überfahren (.door3d in index.css).
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getCategory } from "../config/navigation";
import { visitCounts } from "../utils/visitMemory";
import { useTilt } from "../utils/useTilt";

const DOOR_MAX = 4;
const DOOR_PARALLAX = [6, 5];

function doorsFromNav(counts) {
  const live = (links) => links.filter((l) => l && !l.soon && !l.locked && l.to);
  const clash = getCategory("clash-royale");
  const tools = getCategory("tools");
  const fun = getCategory("fun");
  // Meistbesuchte zuerst; ohne Besuche bleibt die Reihenfolge aus der Navigation
  const sorted = (links) => links
    .map((l, i) => ({ l, i, n: counts.get(l.id)?.n || 0, last: counts.get(l.id)?.last || 0 }))
    .sort((a, b) => b.n - a.n || b.last - a.last || a.i - b.i)
    .map((x) => x.l);
  return [
    { id: "tools", kicker: "Ich streame", title: "Overlays & Tools", thumb: tools.thumb, to: "/tools", links: sorted(live(tools.links)) },
    { id: "clash-royale", kicker: "Ich spiele Clash Royale", title: "Minigames & Turniere", thumb: clash.thumb, to: "/clash", links: sorted(live(clash.links)) },
    { id: "fun", kicker: "Ich will was spielen", title: "Browserspiele", thumb: fun.thumb, to: "/fun", links: sorted(live(fun.links)) },
  ];
}

function Door({ door, index }) {
  const tilt = useTilt(7, DOOR_PARALLAX);
  const shown = door.links.slice(0, DOOR_MAX);
  return (
    <section ref={tilt.ref} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}
      className="door3d door3d-in" style={{ animationDelay: `${index * 90}ms` }} aria-label={door.title}>
      <div className="door3d-head">
        <span className="door3d-head-thumb"><img src={door.thumb} alt="" draggable={false} /></span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-violet-300/80 truncate">{door.kicker}</span>
          <span className="block font-display font-bold text-xl text-white leading-tight">{door.title}</span>
        </span>
      </div>
      <ul className="door3d-list">
        {shown.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="door3d-row">
              <span className="door3d-thumb">
                {l.thumb ? <img src={l.thumb} alt="" draggable={false} className={String(l.thumb).includes("/media/cards/") ? "cover" : ""} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-white truncate">{l.label}</span>
                <span className="block text-xs text-white/45 truncate">{l.description}</span>
              </span>
              <ArrowRight size={16} className="door3d-arrow" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to={door.to} className="door3d-foot">
        <span>{door.links.length > DOOR_MAX ? `Alle ${door.links.length} ansehen` : "Zur Übersicht"}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

export default function HomeDoors() {
  // Einmal beim Öffnen sortieren — die Reihenfolge springt nicht, während man auf der Seite ist
  const doors = useMemo(() => doorsFromNav(visitCounts()), []);
  const community = useMemo(() => getCategory("community").links.filter((l) => !l.soon && !l.locked && l.to), []);
  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-7 items-stretch">
        {doors.map((d, i) => <Door key={d.id} door={d} index={i} />)}
      </div>
      {community.length > 0 && (
        <p className="text-sm text-white/45 mt-6">
          Community:{" "}
          {community.map((l, i) => (
            <React.Fragment key={l.to}>{i > 0 && " · "}<Link to={l.to} className="text-white/70 hover:text-white">{l.label}</Link></React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
