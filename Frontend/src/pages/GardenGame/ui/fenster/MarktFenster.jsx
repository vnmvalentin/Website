// ui/fenster/MarktFenster.jsx
// Markt: Ernte verkaufen.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { GardenModal, GoldTag, PrimaryButton, LeerHinweis } from "../gardenUi";

export function MarktFenster({
    setMarketOpen, gold, handleSellAllHarvested, harvestedItems, isSubscriber, istGartenAdmin,
}) {
    return (
        <GardenModal
            title="Marktstand"
            onClose={() => setMarketOpen(false)}
            breite="klein"
            headerRight={<GoldTag gold={gold} />}
            footer={
                <PrimaryButton
                    onClick={handleSellAllHarvested}
                    disabled={harvestedItems.length === 0}
                    className="w-full py-2.5"
                >
                    Alles verkaufen
                </PrimaryButton>
            }
        >
            {harvestedItems.length === 0 ? (
                <LeerHinweis>Nichts zum Verkaufen im Lager.</LeerHinweis>
            ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                    <div className="flex items-center justify-between py-1 text-xs">
                        <span className="text-slate-400">Erntestücke im Lager</span>
                        <span className="text-white font-semibold tabular-nums">{harvestedItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-xs">
                        <span className="text-slate-400">Gesamtwert</span>
                        <span className="text-amber-400 font-semibold tabular-nums">
                            {harvestedItems.reduce((sum, item) => sum + item.sellValue, 0).toLocaleString('de-DE')} Gold
                        </span>
                    </div>
                    {isSubscriber && (
                        <div className="flex items-center justify-between py-1 text-xs border-t border-slate-800 mt-1 pt-2">
                            {/* Derselbe Bonus, aber beim Admin nicht „Sub-Bonus"
                                nennen — er ist keiner, er bekommt ihn nur. */}
                            <span className="text-slate-400">{istGartenAdmin ? "Admin-Bonus" : "Sub-Bonus"}</span>
                            <span className="text-emerald-400 font-semibold">+50 %</span>
                        </div>
                    )}
                </div>
            )}
        </GardenModal>
    );
}
