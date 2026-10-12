// components/GameStage.jsx — Spielbildschirm wie bei einem Handyspiel: füllt genau den Bildschirm (kein Scrollen),
// die Kopfleiste der Hülle ist währenddessen weg (theme.css). Oben eine schmale Spielleiste mit Verlassen, Spielstand
// und dem Zahnrad (Ton, Vollbild, Regeln, Profil); darunter bekommt das Feld allen Platz, der übrig bleibt.
import React, { useEffect, useRef, useState } from "react";
import { BookOpen, LogOut, Maximize, Minimize, Settings, UserRound, Volume2, VolumeX } from "lucide-react";
import { useFlickShell } from "../ui/shellContext.js";

const CONFIRM_MS = 3000;

// Aufgeben braucht einen zweiten Klick — der Knopf sitzt in der Ecke, wo man leicht danebentippt
function LeaveButton({ label, confirm, onLeave }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return undefined;
    const id = setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [asking]);
  useEffect(() => {
    if (!confirm) setAsking(false);
  }, [confirm]);

  const click = () => {
    if (confirm && !asking) {
      setAsking(true);
      return;
    }
    onLeave();
  };
  return (
    <button type="button" className={`fk-hud-btn${asking ? " warn" : ""}`} onClick={click} title={label} aria-label={asking ? `${label} bestätigen` : label}>
      <LogOut size={16} />
      <span className="fk-hud-btn-text">{asking ? "Sicher?" : label}</span>
    </button>
  );
}

function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      // Vollbild gehört zum Spielbildschirm — Menü und Lobby sind wieder normale Seiten
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
    };
  }, []);
  const toggle = () => {
    // Der Browser darf ablehnen (z. B. ohne Nutzergeste) — dann bleibt es einfach beim Fenster
    if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
    else document.documentElement.requestFullscreen?.()?.catch(() => {});
  };
  return { on, toggle, supported: !!document.fullscreenEnabled };
}

function GameMenu({ info }) {
  const { openRules, openProfile, muted, toggleMute } = useFlickShell();
  const fullscreen = useFullscreen();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref}>
      <button
        type="button"
        className="fk-hud-btn icon"
        onClick={() => setOpen((o) => !o)}
        title="Einstellungen"
        aria-label="Einstellungen"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Settings size={17} />
      </button>
      {open && (
        <div className="fk-hud-menu fk-rows">
          {info && <p className="fk-hud-menu-info">{info}</p>}
          <button type="button" onClick={toggleMute} aria-pressed={!muted}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            Ton
            <span className="state">{muted ? "Aus" : "An"}</span>
          </button>
          {fullscreen.supported && (
            <button type="button" onClick={fullscreen.toggle} aria-pressed={fullscreen.on}>
              {fullscreen.on ? <Minimize size={16} /> : <Maximize size={16} />}
              Vollbild
              <span className="state">{fullscreen.on ? "An" : "Aus"}</span>
            </button>
          )}
          <button type="button" onClick={pick(openRules)}><BookOpen size={16} />Regeln</button>
          <button type="button" onClick={pick(openProfile)}><UserRound size={16} />Profil</button>
        </div>
      )}
    </div>
  );
}

/**
 * board: Spielstand (Scoreboard) · power: Power-up-Leiste des Chaos-Modus oder null · foot: Hinweiszeile, Emotes
 * leaveLabel/confirmLeave/onLeave: Knopf oben links · info: eine Zeile zu den Regeln der Partie fürs Zahnrad-Menü
 * children: das Feld (Pitch mit fill)
 */
export default function GameStage({ board, power = null, foot = null, leaveLabel, confirmLeave = false, onLeave, info = "", children }) {
  return (
    <div className="fk-stage">
      <header className="fk-hud">
        <div className="fk-hud-side">
          <LeaveButton label={leaveLabel} confirm={confirmLeave} onLeave={onLeave} />
        </div>
        <div className="min-w-0">{board}</div>
        <div className="fk-hud-side end">
          <GameMenu info={info} />
        </div>
      </header>
      {power && <div className="fk-stage-power">{power}</div>}
      <div className="fk-stage-field">{children}</div>
      {foot && <div className="fk-stage-foot">{foot}</div>}
    </div>
  );
}
