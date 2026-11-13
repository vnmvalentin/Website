// ui/fenster/MarktFenster.jsx
// Markt: Ernte verkaufen.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { StandFenster } from "../laden/Marktstand";
import { GoldTag, PrimaryButton, LeerHinweis } from "../gardenUi";

export function MarktFenster({
    setMarketOpen, gold, handleSellAllHarvested, harvestedItems, isSubscriber, istGartenAdmin,
}) {
    return (
        <StandFenster markise={false} inhaltHintergrund="#f3e3c3"
            titel="Marktstand"
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
                <div className="rounded-2xl border border-[#3b2516] bg-[#fffaf0] px-3 py-2">
                    <div className="flex items-center justify-between py-1 text-xs">
                        <span className="text-[#6e4426]">Erntestücke im Lager</span>
                        <span className="text-[#3b2516] font-semibold tabular-nums">{harvestedItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 text-xs">
                        <span className="text-[#6e4426]">Gesamtwert</span>
                        <span className="text-[#a87414] font-semibold tabular-nums">
                            {harvestedItems.reduce((sum, item) => sum + item.sellValue, 0).toLocaleString('de-DE')} Gold
                        </span>
                    </div>
                    {isSubscriber && (
                        <div className="flex items-center justify-between py-1 text-xs border-t border-[#3b2516] mt-1 pt-2">
                            {/* Derselbe Bonus, aber beim Admin nicht „Sub-Bonus"
                                nennen — er ist keiner, er bekommt ihn nur. */}
                            <span className="text-[#6e4426]">{istGartenAdmin ? "Admin-Bonus" : "Sub-Bonus"}</span>
                            <span className="text-[#2f6b2c] font-semibold">+50 %</span>
                        </div>
                    )}
                </div>
            )}
        </StandFenster>
    );
}
