// components/EventFlash.jsx — Chaos-Modus: Einblendung über dem Feld, wenn ein Ereignis beginnt (gelbe schräge Tafel
// mit Name und Erklärung). Bei jedem neuen Ereignis per `key` neu einhängen; nach gut zwei Sekunden ist sie weg.
import React, { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { CHAOS_EVENTS } from "../engine/index.js";

const EVENT_FLASH_MS = 2300;

export default function EventFlash({ event }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGone(true), EVENT_FLASH_MS);
    return () => clearTimeout(id);
  }, []);
  if (gone || !CHAOS_EVENTS[event]) return null;
  return (
    <div className="fk-cardflash fk-eventflash" role="status">
      <div className="fk-cardflash-plate">
        <span className="fk-cardflash-inner">
          <TriangleAlert size={28} />
          <span>
            <span className="fk-cardflash-who">Ereignis</span>
            <span className="fk-cardflash-name">{CHAOS_EVENTS[event].name}</span>
            <span className="fk-eventflash-hint">{CHAOS_EVENTS[event].hint}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
