// components/UntertitelLeiste.jsx — zeigt Geräusche als Untertitel, wenn sie in den Einstellungen für Barrierefreiheit
// eingeschaltet sind (utils/barrierefrei.js: meldeGeraeusch). Für Spiel-Hüllen: einmal einsetzen, dann reicht
// meldeGeraeusch({ de: "Schritte links", en: "Footsteps left" }, { richtung: "links" }) an der Stelle, die den Ton spielt.
//
// Steht über allem, fängt keine Klicks ab und nimmt keinen Platz im Layout. Höchstens drei Zeilen gleichzeitig; ein
// Geräusch mit gleichem `schluessel` ersetzt seine alte Zeile, statt sich zu stapeln.
import React, { useEffect, useState } from "react";
import { abonniereGeraeusche, useBarrierefrei } from "../utils/barrierefrei.js";
import { useLanguage } from "../i18n/language.js";

const PFEIL = { links: "←", rechts: "→", vorne: "↑", hinten: "↓" };
const MAX_ZEILEN = 3;

/**
 * @param {object} props
 * @param {string} [props.className]  Lage, Standard: unten in der Mitte, über einer Spielleiste
 */
export default function UntertitelLeiste({ className = "bottom-24 left-1/2 -translate-x-1/2" }) {
  const { untertitel } = useBarrierefrei();
  const { lang } = useLanguage();
  const [zeilen, setZeilen] = useState([]);

  useEffect(() => {
    if (!untertitel) { setZeilen([]); return undefined; }
    const uhren = new Map();
    const weg = (id) => { setZeilen((z) => z.filter((x) => x.id !== id)); uhren.delete(id); };
    const ab = abonniereGeraeusche((e) => {
      setZeilen((z) => {
        const ohne = e.schluessel ? z.filter((x) => x.schluessel !== e.schluessel) : z;
        return [...ohne, e].slice(-MAX_ZEILEN);
      });
      uhren.set(e.id, setTimeout(() => weg(e.id), e.dauerMs));
    });
    return () => { ab(); uhren.forEach((u) => clearTimeout(u)); };
  }, [untertitel]);

  if (!untertitel || zeilen.length === 0) return null;
  return (
    <div className={`pointer-events-none fixed z-[200] flex flex-col items-center gap-1.5 max-w-[min(90vw,40rem)] ${className}`}>
      {zeilen.map((z) => {
        const text = typeof z.text === "string" ? z.text : (z.text[lang] || z.text.de || "");
        const pfeil = PFEIL[z.richtung];
        return (
          <p key={z.id} lang={typeof z.text === "string" ? undefined : (z.text[lang] ? lang : "de")}
            className="rounded-md bg-black/85 px-3 py-1.5 text-center text-base font-semibold leading-snug text-white">
            {pfeil && z.richtung !== "rechts" && <span aria-hidden="true" className="mr-2">{pfeil}</span>}
            [{text}]
            {pfeil && z.richtung === "rechts" && <span aria-hidden="true" className="ml-2">{pfeil}</span>}
          </p>
        );
      })}
    </div>
  );
}
