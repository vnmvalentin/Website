// Reiterleiste im CR-Look (.cr-tabs, wie auf der Turnierseite) — Lobby | Turnier und
// Decks | Turnier im Ende-Bildschirm, sobald ein Lobby-Turnier läuft.
import React from 'react';

/** @param {Array<{id: string, icon: React.ElementType, label: string}>} tabs */
export default function ViewTabs({ tabs, active, onSelect }) {
  return (
    <div className="cr-tabs" role="tablist">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button key={id} type="button" role="tab" aria-selected={active === id} aria-label={label}
          onClick={() => onSelect(id)}>
          <Icon size={24} />
          <span className="cr-tab-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

