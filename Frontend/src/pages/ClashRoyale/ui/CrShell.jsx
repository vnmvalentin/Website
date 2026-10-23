// CrShell.jsx — Hülle der Clash-Royale-Minigames: volle Fensterhöhe ohne Website-Kopfzeile, wie die anderen Spiele.
// Seit Sept. 2026 auch ohne eigene Arcade-Leiste: Hub, Lobby und Spiel füllen den ganzen Bildschirm und bilden eine
// durchgehende Fläche. Der Weg zurück zur Website sitzt als Knopf oben links im Hub (HubScreen.jsx); aus Lobby und
// Spiel geht es über deren Verlassen-Knöpfe zurück in den Hub.
//
// Außerdem Heimat der persönlichen Einstellungen (ui/crPrefs.js): gewählter Hintergrund (ersetzt das Karo auf allen
// .cr-arcade-bg-Flächen, siehe index.css) und Lautstärke der UI-Sounds (ui/sound.js). Das Einstellungsfenster wird
// hier gerendert, damit Hub, Lobby und Spiel es mit einem Aufruf (openSettings) öffnen können.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import CrSettingsModal from "./CrSettingsModal";
import { CrPrefsContext, DEFAULT_BACKGROUND, backgroundUrl, loadPrefs, savePrefs } from "./crPrefs";
import { playSound, setSoundVolume } from "./sound";
import { rememberPick } from "./flyToDeck";

// Titelschrift (siehe --font-cr in index.css) — nur hier geladen, der Rest der Website braucht sie nicht.
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Lilita+One&display=swap";

// Welche Elemente beim Drücken den Klick-Sound auslösen. Ein Listener auf document statt in
// jedem Knopf: so klingen auch die Knöpfe in den Spielmodi und in Dialogen (die per Portal an
// <body> hängen) gleich, ohne dass jede Datei etwas davon wissen muss.
const TAP_TARGETS = 'button, a[href], [role="button"], summary, [role="option"], [role="switch"]';

export default function CrShell() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  useEffect(() => { setSoundVolume(prefs.volume); }, [prefs.volume]);

  // Auf <html> statt auf der Hülle: Dialoge hängen per Portal an <body> und sollen mitschalten.
  // Beim Verlassen der Minigames wieder entfernen — der Rest der Website kennt die Einstellung nicht.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.animations) delete root.dataset.crAnim;
    else root.dataset.crAnim = "off";
    return () => { delete root.dataset.crAnim; };
  }, [prefs.animations]);

  useEffect(() => {
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const el = e.target instanceof Element ? e.target.closest(TAP_TARGETS) : null;
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      playSound("tap");
      // Kartenklick merken — die Karte fliegt nach der Server-Bestätigung ins Deck (ui/flyToDeck.js)
      rememberPick(e);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const setPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const openSettings = useCallback(() => { playSound("open"); setSettingsOpen(true); }, []);
  const ctx = useMemo(() => ({ prefs, setPref, openSettings }), [prefs, setPref, openSettings]);

  const bgUrl = prefs.background !== DEFAULT_BACKGROUND ? backgroundUrl(prefs.background) : null;

  return (
    <CrPrefsContext.Provider value={ctx}>
      <div
        className="cr-root h-[100dvh] flex flex-col overflow-hidden bg-[#0b1a30] text-white"
        data-crbg={bgUrl ? "custom" : "default"}
        style={bgUrl ? { "--cr-bg-image": `url("${bgUrl}")` } : undefined}>
        <main className="flex-1 min-h-0 flex flex-col pt-[env(safe-area-inset-top,0px)]">
          <Outlet />
        </main>
      </div>
      {settingsOpen && <CrSettingsModal onClose={() => setSettingsOpen(false)} />}
    </CrPrefsContext.Provider>
  );
}
