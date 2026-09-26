// SandboxTabs.jsx — Reiter des Sandbox-Bereichs. Jeder Reiter ist eine eigene Seite (eigene Adresse), damit
// Zurück-Taste und Lesezeichen funktionieren; die Leiste steht oben auf jeder davon.
import React from "react";
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/seed-runners/sandbox", label: "Editor" },
  { to: "/seed-runners/levels", label: "Level-Bibliothek" },
  { to: "/seed-runners/test", label: "Übungsbereich" },
];

export default function SandboxTabs() {
  return (
    <nav className="sr-tabs mb-6" aria-label="Sandbox">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className="sr-tab"
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
