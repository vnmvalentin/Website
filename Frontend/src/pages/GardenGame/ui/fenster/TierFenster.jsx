// ui/fenster/TierFenster.jsx
// Tier-Übersicht (alle platzierten Tiere) und Detailansicht eines Tiers.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { istSatt, sattBis, hungrigeTiere, besteStufe, getGaertnerStufe, getErntehelferStufe, getForscherStufe, getKaufmannStufe, getGoldfinderFund, ackerStundenErtrag, getPetTickMs, getErntehelferExtra, getGaertnerNachwuchs, getGaertnerWurzelwerk, getForscherBoost, getKaufmannBoost, PET_ABILITY_LABELS } from "../../engine/PetSystem";
import { formatGold } from "../gardenTokens";
import { StandFenster, Zettel } from "../laden/Marktstand";
import { PetIcon } from "../gameIcons";
import { PET_SLOTS, getPetSpriteImage } from "../../engine/gameConstants";
import PetDetailModal from "../PetDetailModal";
import { KaufKnopf } from "../laden/Marktstand";

/** Restzeit kurz: „2 h 10 min“ bzw. „40 min“. */
function restText(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export function TierUebersicht({
    petPlacements, mySlotIndex, skillWirkung, setPetOverlayOpen, setInspectedPet,
    fische = [], onFuettern, plotPlants = {},
}) {
    const goldStufe = besteStufe(petPlacements, "goldfinder", mySlotIndex);
    const gaertner = getGaertnerStufe(petPlacements, mySlotIndex);
    const helfer = getErntehelferStufe(petPlacements, mySlotIndex);
    const forscher = getForscherStufe(petPlacements, mySlotIndex);
    const kaufmann = getKaufmannStufe(petPlacements, mySlotIndex);
    const [goldMin, goldMax] = getGoldfinderFund(goldStufe || 1, ackerStundenErtrag(plotPlants));
    const zuechter = skillWirkung("zuechter");
    const eigenePets = petPlacements.filter((p) => p.slotIndex === mySlotIndex);
    // Hunger (06.11.): verhungerte Tiere arbeiten nicht, bis sie einen Fisch bekommen
    const hungrig = hungrigeTiere(eigenePets);
    const futter = (Array.isArray(fische) ? fische : []).filter((f) => f.fischId !== "stiefel").sort((a, b) => (Number(a.wert) || 0) - (Number(b.wert) || 0));
    const alleFuettern = async () => {
        // Jedes hungrige Tier bekommt den günstigsten Fisch aus dem Eimer
        const vorrat = [...futter];
        for (const pet of hungrig) {
            const fisch = vorrat.shift();
            if (!fisch) break;
            await onFuettern?.(pet, fisch.instanceId);
        }
    };
    const hungrigTyp = (typ) => eigenePets.some((p) => p.ability?.type === typ && !istSatt(p));
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
        <StandFenster
            titel="Tiere"
            untertitel={`${eigenePets.length}/${PET_SLOTS} Plätze im Stall belegt — je Fähigkeit zählt die höchste Stufe`}
            oben={<Stallgiebel />}
            rahmen={{ rand: "#3b2516", flaeche: "#8a3a2a" }}
            inhaltHintergrund="repeating-linear-gradient(170deg, #e0c46a 0 6px, #d4b45a 6px 9px, #e8d07a 9px 12px)"
            bild="/garden-assets/icons/hud/tiere_pixel.png"
            onClose={() => setPetOverlayOpen(false)}
        >
            <div className="mt-2 grid gap-4 md:grid-cols-[1fr_15rem]">
                <div>
                    {eigenePets.length === 0 ? (
                        <div className="border-[3px] border-dashed border-[#8a6a2a] px-3 py-10 text-center text-sm font-bold text-[#6e4426]">
                            Der Stall ist noch leer. Brüte im Inkubator ein Ei aus und stell das Tier auf dein Grundstück.
                        </div>
                    ) : (
                        <>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-[3px] border-[#3b2516] bg-[#fffaf0] px-3 py-2" style={{ boxShadow: "0 3px 0 0 #3b2516" }}>
                            <span className="text-xs font-bold text-[#3b2516]">
                                {hungrig.length > 0
                                    ? `${hungrig.length} ${hungrig.length === 1 ? "Tier hat" : "Tiere haben"} Hunger und ${hungrig.length === 1 ? "arbeitet" : "arbeiten"} nicht.`
                                    : "Alle Tiere sind satt."}
                                <span className="ml-1 font-normal text-[#6e4426]">{futter.length} Fische im Eimer</span>
                            </span>
                            <KaufKnopf klein onClick={alleFuettern} disabled={hungrig.length === 0 || futter.length === 0}>
                                Alle füttern
                            </KaufKnopf>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {eigenePets.map((pet, i) => (
                                <button
                                    key={pet.id || i}
                                    type="button"
                                    onClick={() => { setPetOverlayOpen(false); setInspectedPet(pet); }}
                                    className="flex flex-col items-center border-[3px] border-[#3b2516] bg-[#f3e3c3] text-center transition-transform duration-100 hover:-translate-y-1"
                                    style={{ boxShadow: "0 4px 0 0 #3b2516" }}
                                >
                                    <span className="flex h-24 w-full items-end justify-center border-b-[3px] border-[#3b2516]" style={{ background: "linear-gradient(#bfe6f2 0 60%, #7fb35a 60% 100%)" }}>
                                        <img src={pet.image || getPetSpriteImage(pet.name)} alt="" draggable={false}
                                            className="mb-1 h-20 w-20 object-contain" style={{ imageRendering: "pixelated" }} />
                                    </span>
                                    <span className="block w-full truncate px-2 pt-1.5 text-sm font-bold text-[#3b2516]">{pet.customName || pet.name}</span>
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-[#6e4426]">
                                        {pet.ability && tierSymbol(pet.ability.type) ? React.createElement(tierSymbol(pet.ability.type), { size: 14 }) : null}
                                        {pet.ability ? `${PET_ABILITY_LABELS[pet.ability.type] || pet.ability.type} · Lv. ${pet.ability.level}` : "ohne Fähigkeit"}
                                    </span>
                                    {istSatt(pet) ? (
                                        <span className="mb-2 mt-1 border-2 border-[#3b2516] bg-[#dcebc8] px-1.5 text-[10px] font-bold text-[#2f5a28]">
                                            {sattBis(pet) > 0 ? `satt · ${restText(sattBis(pet) - Date.now())}` : "satt"}
                                        </span>
                                    ) : (
                                        <span className="mb-2 mt-1 border-2 border-[#3b2516] bg-[#f6c8b8] px-1.5 text-[10px] font-bold text-[#a8302a]">verhungert · arbeitet nicht</span>
                                    )}
                                </button>
                            ))}
                            {Array.from({ length: Math.max(0, PET_SLOTS - eigenePets.length) }, (_, i) => (
                                <div key={`frei-${i}`} className="flex min-h-[10rem] flex-col items-center justify-center gap-1 border-[3px] border-dashed border-[#8a6a2a] text-[11px] font-bold text-[#8a6a2a]">
                                    <PetIcon.emptySlot size={28} />
                                    freier Platz
                                </div>
                            ))}
                        </div>
                        </>
                    )}
                </div>

                {/* Aktive Boni als Zettel an der Stallwand */}
                <Zettel>
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Aktive Boni</div>
                    {zeilen.map((z) => (
                        <div key={z.key} className="flex items-start gap-2 border-b-2 border-[#e3cfa8] py-1.5 last:border-b-0">
                            <span className={z.stufe ? "" : "opacity-35 grayscale"}>
                                {tierSymbol(z.key) ? React.createElement(tierSymbol(z.key), { size: 20 }) : null}
                            </span>
                            <span className="min-w-0">
                                <span className={`block text-xs font-bold ${z.stufe ? "text-[#3b2516]" : "text-[#8a7a5a]"}`}>{PET_ABILITY_LABELS[z.key]}</span>
                                <span className={`block text-[11px] tabular-nums ${z.stufe ? "text-[#2f6b2c]" : hungrigTyp(z.key) ? "font-bold text-[#a8302a]" : "text-[#a8967e]"}`}>{z.wirkung || (hungrigTyp(z.key) ? "Tier hungrig — füttern!" : "kein Tier platziert")}</span>
                            </span>
                        </div>
                    ))}
                    <p className="mt-2 text-[10px] leading-relaxed text-[#6e4426]">
                        Drei Plätze, einer je Fähigkeit. Gleiche Tiere stapeln nicht — es zählt das stärkere. Tiere wirken nur, während du im Spiel bist und solange sie satt sind — gefüttert wird mit Fischen vom Dorfteich.
                        {zuechter > 0 ? ` „Züchter" ist eingerechnet.` : ""}
                    </p>
                </Zettel>
            </div>
        </StandFenster>
    );
}

/** Symbol je Fähigkeit — die Kennungen „harvester“/„seedfinder“ sind älter als die Bildnamen. */
const tierSymbol = (typ) => PetIcon[{ harvester: "erntehelfer", seedfinder: "gaertner" }[typ] || typ];

/** Roter Scheunengiebel als Kopf des Tier-Fensters. */
function Stallgiebel() {
    return (
        <div aria-hidden="true" className="relative h-12 shrink-0 border-b-[4px]" style={{ borderColor: "#3b2516", background: "repeating-linear-gradient(90deg, #b8402a 0 18px, #a8382a 18px 20px)" }}>
            <div className="absolute left-1/2 top-1 flex h-9 w-14 -translate-x-1/2 items-center justify-center border-[3px]" style={{ borderColor: "#3b2516", background: "#fffaf0" }}>
                <span className="absolute h-[3px] w-16 rotate-[33deg]" style={{ background: "#b8402a" }} />
                <span className="absolute h-[3px] w-16 -rotate-[33deg]" style={{ background: "#b8402a" }} />
            </div>
        </div>
    );
}

export function TierDetail({
    inspectedPet, skillWirkung, setInspectedPet, handleStowInspectedPet, handleSellInspectedPet,
    handleRenamePet, fische, onFuettern, plotPlants,
}) {
    return (
        <PetDetailModal
            pet={inspectedPet}
            zuechter={skillWirkung("zuechter")}
            onClose={() => setInspectedPet(null)}
            onStow={handleStowInspectedPet}
            onSell={handleSellInspectedPet}
            onRename={handleRenamePet}
            fische={fische}
            onFuettern={onFuettern}
            plotPlants={plotPlants}
        />
    );
}
