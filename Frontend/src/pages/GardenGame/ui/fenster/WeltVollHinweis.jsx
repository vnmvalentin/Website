// ui/fenster/WeltVollHinweis.jsx
// Hinweis, wenn die gewählte Welt voll ist.
// Reine Anzeige — Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { HUD_SURFACE } from "../gardenTokens";

export function WeltVollHinweis({
    flushFarmStateToServer, setShowLobbyScreen,
}) {
    return (
        <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} px-4 py-3 flex flex-col items-center gap-2 max-w-sm text-center`}>
            <span className="text-xs text-amber-300">
                Diese Welt ist voll — du kannst zusehen, aber nicht farmen.
            </span>
            <button
                type="button"
                onClick={async () => { await flushFarmStateToServer(); setShowLobbyScreen(true); }}
                className="px-3 py-1.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
            >
                Zurück zur Weltauswahl
            </button>
        </div>
    );
}
