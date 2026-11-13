// GardenShell.jsx — Hülle von Virtual Farm: eigenes Spiel statt Website-Seite, volle Fensterhöhe ohne Website-Kopfzeile.
// Eine eigene Leiste gibt es nicht: Das Hauptmenü (GardenMenu.jsx) trägt „Zurück zur Website" selbst, im Spiel liegt
// der Weg zurück in den Einstellungen des HUDs. Lädt Pixelify Sans (Pixel-Look, seit 04.11.) und Baloo 2 als Rückfall.
import React from "react";
import { Outlet } from "react-router-dom";
import "./theme.css";
import { useFontLink } from "../../../../components/shell/useFontLink";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=Baloo+2:wght@500;600;700;800&display=swap";

export default function GardenShell() {
  useFontLink(FONT_HREF);

  return (
    // gf-pixel: leichter Pixel-Look für alles darunter (Menü, HUD, Fenster) — siehe theme.css
    <div className="gf-game gf-pixel flex flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
