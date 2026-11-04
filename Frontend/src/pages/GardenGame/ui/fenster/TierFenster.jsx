// ui/fenster/TierFenster.jsx
// Tier-Übersicht (alle platzierten Tiere) und Detailansicht eines Tiers.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { besteStufe, getGaertnerStufe, getErntehelferStufe, getForscherStufe, getKaufmannStufe, getGoldfinderRange, getPetTickMs, getErntehelferExtra, getGaertnerNachwuchs, getGaertnerWurzelwerk, getForscherBoost, getKaufmannBoost, PET_ABILITY_LABELS } from "../../engine/PetSystem";
import { formatGold, RARITY_BORDER, RARITY_TEXT } from "../gardenTokens";
import { GardenModal, LeerHinweis } from "../gardenUi";
import { PET_SLOTS, getPetSpriteImage } from "../../engine/gameConstants";
import PetDetailModal from "../PetDetailModal";

export function TierUebersicht({
    petPlacements, mySlotIndex, skillWirkung, setPetOverlayOpen, setInspectedPet,
}) {
    const goldStufe = besteStufe(petPlacements, "goldfinder", mySlotIndex);
    const gaertner = getGaertnerStufe(petPlacements, mySlotIndex);
    const helfer = getErntehelferStufe(petPlacements, mySlotIndex);
    const forscher = getForscherStufe(petPlacements, mySlotIndex);
    const kaufmann = getKaufmannStufe(petPlacements, mySlotIndex);
    const [goldMin, goldMax] = getGoldfinderRange(goldStufe || 1);
    const zuechter = skillWirkung("zuechter");
    const eigenePets = petPlacements.filter((p) => p.slotIndex === mySlotIndex);
    const zeilen = [
        {
            key: "goldfinder",
            stufe: goldStufe,
            wirkung: goldStufe
                ? `${formatGold(goldMin)}–${formatGold(goldMax)} alle ${Math.round(getPetTickMs(goldStufe) / 1000)} s`
                : null,
        },
        {
            key: "harvester",
            stufe: helfer,
            wirkung: helfer ? `+${Math.round(getErntehelferExtra(helfer, zuechter) * 100)} % zweites Stück je Ernte` : null,
        },
        {
            key: "seedfinder",
            stufe: gaertner,
            wirkung: gaertner
                ? `${Math.round(getGaertnerNachwuchs(gaertner, zuechter) * 100)} % Nachwuchs · ${Math.round(getGaertnerWurzelwerk(gaertner, zuechter) * 100)} % schneller`
                : null,
        },
        {
            key: "forscher",
            stufe: forscher,
            wirkung: forscher ? `+${Math.round(getForscherBoost(forscher, zuechter) * 100)} % XP je Ernte` : null,
        },
        {
            key: "kaufmann",
            stufe: kaufmann,
            wirkung: kaufmann ? `+${Math.round(getKaufmannBoost(kaufmann, zuechter) * 100)} % Verkaufspreis` : null,
        },
    ];
    return (
        <GardenModal
            title="Tiere"
            subtitle={`${eigenePets.length}/${PET_SLOTS} Plätze belegt — je Fähigkeit zählt die höchste Stufe`}
            onClose={() => setPetOverlayOpen(false)}
        >
            <div className="mb-3 rounded-2xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    Aktive Boni
                </div>
                {zeilen.map((z) => (
                    <div key={z.key} className="flex items-baseline justify-between gap-2 py-0.5">
                        <span className={`text-[11px] shrink-0 ${z.stufe ? "text-slate-300" : "text-slate-600"}`}>
                            {PET_ABILITY_LABELS[z.key]}
                        </span>
                        <span className={`text-right text-[10px] tabular-nums ${z.stufe ? "text-emerald-400" : "text-slate-600"}`}>
                            {z.wirkung || "kein Tier platziert"}
                        </span>
                    </div>
                ))}
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Gleiche Tiere stapeln nicht. Tiere wirken nur, während du im Spiel bist.
                    {zuechter > 0 ? ` „Züchter" ist eingerechnet.` : ""}
                </p>
            </div>

            {eigenePets.length === 0 ? (
                <LeerHinweis>
                    Noch kein Tier platziert. Im Inkubator ausbrüten und aufs Grundstück stellen.
                </LeerHinweis>
            ) : (
                <div className="grid grid-cols-3 gap-2">
                    {eigenePets.map((pet, i) => (
                        <button
                            key={pet.id || i}
                            type="button"
                            onClick={() => { setPetOverlayOpen(false); setInspectedPet(pet); }}
                            className={`flex flex-col items-center gap-1 rounded-2xl border bg-slate-900/60 px-2 py-3 text-center transition-colors hover:bg-slate-800/70 ${RARITY_BORDER[pet.rarity] || RARITY_BORDER.COMMON}`}
                        >
                            <img
                                src={pet.image || getPetSpriteImage(pet.name)}
                                alt=""
                                draggable={false}
                                className="w-12 h-12 object-contain shrink-0"
                            />
                            <span className="block w-full text-xs text-slate-200 truncate">{pet.customName || pet.name}</span>
                            <span className={`text-[10px] ${RARITY_TEXT[pet.rarity] || RARITY_TEXT.COMMON}`}>
                                {pet.ability ? `${PET_ABILITY_LABELS[pet.ability.type] || pet.ability.type} · Lv. ${pet.ability.level}` : "ohne Fähigkeit"}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Kein Nachkauf mehr: drei Fähigkeiten, drei Plätze. Der Hinweis
                steht hier, weil man genau hier merkt, dass ein Platz fehlt —
                und weil sonst niemand erfährt, warum ein zweites gleiches Tier
                nichts bringt. */}
            <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-500">
                Drei Plätze, einer je Fähigkeit. Zwei Tiere derselben Fähigkeit stapeln nicht — es zählt das stärkere.
            </div>
        </GardenModal>
    );
}

export function TierDetail({
    inspectedPet, skillWirkung, setInspectedPet, handleStowInspectedPet, handleSellInspectedPet,
    handleRenamePet,
}) {
    return (
        <PetDetailModal
            pet={inspectedPet}
            zuechter={skillWirkung("zuechter")}
            onClose={() => setInspectedPet(null)}
            onStow={handleStowInspectedPet}
            onSell={handleSellInspectedPet}
            onRename={handleRenamePet}
        />
    );
}
