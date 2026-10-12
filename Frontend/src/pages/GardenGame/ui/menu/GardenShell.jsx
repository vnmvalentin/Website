// GardenShell.jsx — Hülle von Virtual Farm: eigenes Spiel statt Website-Seite, volle Fensterhöhe ohne Website-Kopfzeile.
// Eine eigene Leiste gibt es nicht: Das Hauptmenü (GardenMenu.jsx) trägt „Zurück zur Website" selbst, im Spiel liegt
// der Weg zurück in den Einstellungen des HUDs. Lädt Baloo 2, die Schrift von HUD und Menü.
import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap";

export default function GardenShell() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  return (
    <div className="gf-game flex flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
