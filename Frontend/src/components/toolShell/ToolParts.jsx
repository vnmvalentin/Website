// ToolParts.jsx — was Seiten in der Tool-Hülle benutzen.
//
// <ToolHeader>: hängt seitenspezifische Knöpfe (Serverwahl, OBS-Link, Testen …) in die Kopfleiste der
//   Hülle, statt eine zweite Leiste darunter zu bauen. Steht zwischen Werkzeugname und Menü.
// <ToolScroll>: für Seiten, die ganz normal scrollen (Bingo, Anmelde-Fassungen). Werkzeuge mit eigener
//   Arbeitsfläche über die ganze Höhe (Twitch-Overlays, Discord, Win Challenge) nehmen stattdessen h-full.
import React from "react";
import { createPortal } from "react-dom";
import LegalFooter from "../LegalFooter";
import { useToolShell } from "./toolShellContext";

export function ToolHeader({ children }) {
  const { headerSlot } = useToolShell();
  // Außerhalb der Hülle (oder im ersten Zeichnen, bevor der Platz existiert) einfach nichts zeigen
  if (!headerSlot) return null;
  return createPortal(children, headerSlot);
}

export function ToolScroll({ className = "", children }) {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className={`p-4 md:p-8 ${className}`}>
        {children}
        <LegalFooter />
      </div>
    </div>
  );
}
