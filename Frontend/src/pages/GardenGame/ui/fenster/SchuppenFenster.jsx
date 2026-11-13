// ui/fenster/SchuppenFenster.jsx
// Schuppen und alles, was darin wohnt: Auswahl, Mülleimer, Kiste/Vitrine (Ablage), fremde Vitrine, Brutkasten.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { normalizeToolInventory, KISTE_MAX, VITRINE_MAX, INCUBATOR_UNLOCK_COSTS, buildPetPreviewImage } from "../../engine/gameConstants";
import { HudIcon, TabIcon } from "../gameIcons";
import { ItemIcon } from "../ItemIcon";
import AblageModal, { FremdeVitrineModal } from "../AblageModal";
import { formatGold } from "../gardenTokens";
import { StandFenster, Regal, WarenKachel, KaufKnopf, NebenKnopfHolz } from "../laden/Marktstand";

export function SchuppenAuswahl({
    setShedOpen, setAblageOffen, toolInventory, setTrashOpen, setIncubatorTargetSlot,
    setIncubatorOpen, readyEggsCount, setEditorAktiv, setVerschiebtGebaeude,
}) {
    return (
        <StandFenster markise={false} inhaltHintergrund="#f3e3c3"
            titel="Schuppen"
            untertitel="Was möchtest du öffnen?"
            onClose={() => setShedOpen(false)}
            breite="klein"
        >
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setAblageOffen("chest"); }}
                    disabled={!normalizeToolInventory(toolInventory).hasChest}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#3b2516] bg-[#fffaf0] text-left transition-colors hover:border-[#8a5a32] hover:bg-[#fff3c4] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#8a5a32] disabled:hover:bg-[#fff3c4]"
                >
                    <HudIcon.kiste size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-[#3b2516]">Kiste</span>
                    {!normalizeToolInventory(toolInventory).hasChest && (
                        <span className="text-[11px] text-[#8a7a5a]">nicht gekauft</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setAblageOffen("vitrine"); }}
                    disabled={!normalizeToolInventory(toolInventory).hasVitrine}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#3b2516] bg-[#fffaf0] text-left transition-colors hover:border-[#8a5a32] hover:bg-[#fff3c4] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#8a5a32] disabled:hover:bg-[#fff3c4]"
                >
                    <HudIcon.vitrine size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-[#3b2516]">Vitrine</span>
                    {!normalizeToolInventory(toolInventory).hasVitrine && (
                        <span className="text-[11px] text-[#8a7a5a]">nicht gekauft</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setTrashOpen(true); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#3b2516] bg-[#fffaf0] text-left transition-colors hover:border-[#8a5a32] hover:bg-[#fff3c4]"
                >
                    <HudIcon.remove size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-[#3b2516]">Mülleimer</span>
                </button>
                {/* Feedback 30.08.: "Inkubator in den Schuppen packen und aus dem
                    Tiere-Dropdown entfernen" — zieht damit als vierte Tür in dasselbe
                    Gebäude ein wie Kiste/Vitrine/Mülleimer. Das "Ei fertig"-Signal, das
                    vorher am Tiere-Knopf hing, sitzt jetzt hier UND als Marker über dem
                    Schuppen auf dem Feld (siehe _drawEierMarker in Renderer.js). */}
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setIncubatorTargetSlot(null); setIncubatorOpen(true); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#3b2516] bg-[#fffaf0] text-left transition-colors hover:border-[#8a5a32] hover:bg-[#fff3c4]"
                >
                    <TabIcon.egg size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-[#3b2516]">Inkubator</span>
                    {readyEggsCount > 0 && (
                        <span className="text-[11px] font-semibold text-[#6a40a8]">
                            {readyEggsCount === 1 ? "1 fertig" : `${readyEggsCount} fertig`}
                        </span>
                    )}
                </button>
            </div>
            <button
                type="button"
                onClick={() => { setShedOpen(false); setEditorAktiv(true); setVerschiebtGebaeude("shed"); }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#3b2516] bg-[#fffaf0] px-3 py-2 text-xs font-medium text-[#6e4426] transition-colors hover:border-[#8a5a32] hover:text-black"
            >
                <HudIcon.reposition size={13} /> Schuppen umstellen
            </button>
        </StandFenster>
    );
}

// 06.11.: statt Markise ein eigener Kopf — der Mülleimer sieht aus wie eine Blechtonne,
// der Inkubator wie eine Brutmaschine mit Wärmelampen.
const TONNE = { rand: "#2e3338", flaeche: "#6b737c" };
const TONNE_KOERPER = "repeating-linear-gradient(90deg, #8a939c 0 14px, #7d858d 14px 18px, #a0a8b0 18px 20px)";
function TonnenDeckel() {
    return (
        <div aria-hidden="true" className="relative h-10 shrink-0">
            <div className="absolute inset-x-[-4px] bottom-0 h-6 border-[3px]" style={{ borderColor: TONNE.rand, background: "#5d636a", boxShadow: "inset 0 3px 0 0 #8a939c" }} />
            <div className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 border-[3px] border-b-0" style={{ borderColor: TONNE.rand, background: "#4b5259" }}>
                <div className="mx-auto mt-1 h-1.5 w-14" style={{ background: "#2e3338" }} />
            </div>
        </div>
    );
}
const BRUT = { rand: "#3b2516", flaeche: "#8a5a32" };
function BrutKopf() {
    return (
        <div aria-hidden="true" className="relative flex h-12 shrink-0 items-end justify-around border-b-[4px] px-10" style={{ borderColor: "#3b2516", background: "#6e4426", boxShadow: "inset 0 3px 0 0 #a8743f" }}>
            {[0, 1, 2, 3].map((i) => (
                <span key={i} className="relative mb-1 flex flex-col items-center">
                    <span className="h-3 w-1.5" style={{ background: "#2b1d12" }} />
                    <span className="h-4 w-8 border-[3px]" style={{ borderColor: "#2b1d12", background: "#f2c14e", boxShadow: "inset 0 -4px 0 0 #e0902a" }} />
                </span>
            ))}
        </div>
    );
}

export function MuellFenster({
    setTrashOpen, setShedOpen, inventory, setInventory, setSelectedSeed, notify, debouncedSave,
    decoInventory, setDecoInventory, selectedDecoToPlace, setSelectedDecoToPlace,
}) {
    // Samen: gleiche Sorten liegen als eine Kachel mit Anzahl da. Wer 40 Löwenzahn
    // loswerden will, klickt sonst 40-mal.
    const gruppen = new Map();
    for (const sd of inventory) {
        if (!sd?.instanceId) continue;
        const key = `${sd.seedId}|${sd.rarity}`;
        const g = gruppen.get(key);
        if (g) g.ids.push(sd.instanceId);
        else gruppen.set(key, { key, seed: sd, ids: [sd.instanceId] });
    }
    const wirfWeg = (ids, label) => {
        const weg = new Set(ids);
        setInventory((prev) => prev.filter((sd) => !weg.has(sd?.instanceId)));
        setSelectedSeed((prev) => (prev && weg.has(prev.instanceId) ? null : prev));
        notify(label);
        debouncedSave();
    };
    const blech = { text: "", farbe: "transparent", hell: "#c9ced2" };
    return (
        <StandFenster
            titel="Mülleimer"
            untertitel="Endgültig wegwerfen — das lässt sich nicht rückgängig machen"
            oben={<TonnenDeckel />}
            rahmen={TONNE}
            inhaltHintergrund={TONNE_KOERPER}
            bild="/garden-assets/icons/hud/muell_pixel.png"
            onClose={() => setTrashOpen(false)}
            onBack={() => { setTrashOpen(false); setShedOpen(true); }}
        >
            {/* Kein eigener „Umstellen"-Knopf: der Mülleimer steht im Haus, verschoben
                wird das Haus als Ganzes (Kiste/Vitrine oder Haus-Ansicht). */}
            {gruppen.size === 0 && decoInventory.length === 0 && (
                <div className="py-8 text-center text-sm font-bold text-[#2e3338]">Leer — nichts zum Wegwerfen dabei.</div>
            )}
            {gruppen.size > 0 && (
                <Regal titel="Samen">
                    {[...gruppen.values()].map((g) => (
                        <WarenKachel
                            key={g.key}
                            band={blech}
                            bild={<ItemIcon item={g.seed} className="h-16 w-16" emojiClassName="text-4xl" />}
                            name={g.seed.name}
                            vorrat={g.ids.length}
                            aktionen={(
                                <>
                                    <KaufKnopf klein gefahr onClick={() => wirfWeg([g.ids[0]], `${g.seed.name} weggeworfen.`)}>1×</KaufKnopf>
                                    {g.ids.length > 1 && (
                                        <KaufKnopf gefahr onClick={() => wirfWeg(g.ids, `${g.ids.length}× ${g.seed.name} weggeworfen.`)}>Alle {g.ids.length}</KaufKnopf>
                                    )}
                                </>
                            )}
                        />
                    ))}
                </Regal>
            )}
            {decoInventory.length > 0 && (
                <Regal titel="Deko">
                    {decoInventory.map((deco) => (
                        <WarenKachel
                            key={deco.instanceId || deco.id}
                            band={blech}
                            bild={<ItemIcon item={deco} className="h-16 w-16" emojiClassName="text-4xl" />}
                            name={deco.name}
                            aktionen={(
                                <KaufKnopf gefahr onClick={() => {
                                    const ziel = deco.instanceId || deco.id;
                                    setDecoInventory((prev) => prev.filter((d) => (d.instanceId || d.id) !== ziel));
                                    if ((selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === ziel) {
                                        setSelectedDecoToPlace(null);
                                    }
                                    notify(`${deco.name} weggeworfen.`);
                                    debouncedSave();
                                }}>Wegwerfen</KaufKnopf>
                            )}
                        />
                    ))}
                </Regal>
            )}
        </StandFenster>
    );
}

export function AblageFenster({
    ablageOffen, chestItems, vitrineItems, harvestedItems, inventory, eggInventory, decoInventory,
    petInventory, ablageBusy, setAblageOffen, setShedOpen, handleAblage, setEditorAktiv,
    setVerschiebtGebaeude,
}) {
    return (
        <AblageModal
            art={ablageOffen}
            inhalt={ablageOffen === "chest" ? chestItems : vitrineItems}
            // Die Vitrine bleibt bei der Ernte — ihr Inhalt geht als
            // Momentaufnahme an alle und ist auf Frucht-Felder zugeschnitten.
            rucksack={ablageOffen === "chest"
                ? { ernte: harvestedItems, samen: inventory, eier: eggInventory, deko: decoInventory, tiere: petInventory }
                : { ernte: harvestedItems }}
            max={ablageOffen === "chest" ? KISTE_MAX : VITRINE_MAX}
            busy={ablageBusy}
            onClose={() => setAblageOffen(null)}
            onBack={() => { setAblageOffen(null); setShedOpen(true); }}
            onEinlagern={(id) => handleAblage(ablageOffen, id, "ein")}
            onAuslagern={(id) => handleAblage(ablageOffen, id, "aus")}
            onAllesEin={() => handleAblage(ablageOffen, null, "ein")}
            onAllesAus={() => handleAblage(ablageOffen, null, "aus")}
            // Umstellen bewegt seit dem Schuppen-Umbau IMMER das ganze Gebäude
            // (Kiste, Vitrine UND Mülleimer stecken darin), nicht nur die
            // gerade offene Ablage.
            onUmstellen={() => { setAblageOffen(null); setEditorAktiv(true); setVerschiebtGebaeude("shed"); }}
        />
    );
}

export function FremdeVitrineFenster({
    fremdeVitrine, setFremdeVitrine,
}) {
    return (
        <FremdeVitrineModal
            owner={fremdeVitrine.owner}
            items={fremdeVitrine.items}
            onClose={() => setFremdeVitrine(null)}
        />
    );
}

export function BrutkastenFenster({
    setIncubatorTargetSlot, setIncubatorOpen, setShedOpen, eggInventory, incubator,
    unlockIncubatorSlot, gold, tickNow, formatDuration, collectHatchedEgg, incubatorTargetSlot,
    placeEggInIncubator,
}) {
    return (
        <StandFenster
            titel="Inkubator"
            untertitel="Eier einlegen, warm halten, Tier auf der Farm platzieren"
            oben={<BrutKopf />}
            rahmen={BRUT}
            inhaltHintergrund="repeating-linear-gradient(0deg, #a8743f 0 22px, #9c6a3c 22px 24px)"
            bild="/garden-assets/eggs/common_egg.png"
            onClose={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); }}
            onBack={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); setShedOpen(true); }}
            kopfRechts={(
                <span className="border-2 bg-[#fff3c4] px-1.5 py-0.5 text-xs font-bold tabular-nums text-[#3b2516]" style={{ borderColor: "#3b2516" }}>
                    {eggInventory.length} Eier im Rucksack
                </span>
            )}
        >
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {Array(5).fill(null).map((_, idx) => {
                        const unlocked = idx < incubator.unlockedSlots;
                        const slot = incubator.slots[idx];
                        const unlockCost = INCUBATOR_UNLOCK_COSTS[idx - 1];
                        const leftMs = slot ? Math.max(0, slot.hatchAt - tickNow) : 0;
                        const isHatching = Boolean(slot) && leftMs > 0;
                        const fertig = Boolean(slot) && !isHatching;
                        return (
                            <div key={idx} className={`flex flex-col ${unlocked ? "" : "opacity-80"}`}>
                                {/* Glaskuppel: stufig gezeichnet, warm beleuchtet, solange etwas brütet */}
                                <div className="relative mx-2 flex h-28 items-end justify-center border-[3px] border-b-0"
                                    style={{
                                        borderColor: "#5d636a",
                                        background: !unlocked ? "#8a7a6a" : slot ? (fertig ? "#dcebc8" : "#fff0c8") : "#dff0f4",
                                        clipPath: "polygon(18% 0, 82% 0, 100% 22%, 100% 100%, 0 100%, 0 22%)",
                                    }}>
                                    <span className="absolute left-[22%] top-3 h-6 w-1.5 bg-white/70" />
                                    {!unlocked && <HudIcon.locked size={26} className="mb-8" />}
                                    {unlocked && !slot && <span className="mb-6 text-[11px] font-bold text-[#6e8a90]">leer</span>}
                                    {unlocked && slot && (isHatching ? (
                                        <ItemIcon item={slot.egg} className="mb-2 h-16 w-16 object-contain" />
                                    ) : (
                                        <img src={slot.hatchResult?.previewImage || buildPetPreviewImage(slot.hatchResult?.type)} alt="" className="mb-2 h-16 w-16 object-contain" style={{ imageRendering: "pixelated" }} />
                                    ))}
                                </div>
                                {/* Holzsockel mit Wärmelampe */}
                                <div className="relative border-[3px] px-2 pb-2 pt-1.5" style={{ borderColor: "#3b2516", background: "#8a5a32", boxShadow: "0 4px 0 0 #3b2516, inset 0 3px 0 0 #a8743f" }}>
                                    <span className="absolute right-2 top-1.5 h-2.5 w-2.5 border-2" style={{ borderColor: "#3b2516", background: isHatching ? "#ffd84a" : fertig ? "#7fc25a" : "#6e4426" }} />
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#f3e3c3]">Platz {idx + 1}</div>
                                    <div className="mt-0.5 min-h-[2.4rem] text-[11px] leading-tight text-[#f3e3c3]">
                                        {!unlocked ? (
                                            <span className="inline-flex items-center gap-1 font-bold"><HudIcon.gold size={11} /> {formatGold(unlockCost)}</span>
                                        ) : !slot ? "Bereit für ein Ei" : (
                                            <>
                                                <div className="truncate font-bold">{slot.egg?.name || "Ei"}</div>
                                                <div className="tabular-nums">{isHatching ? formatDuration(leftMs) : (slot.hatchResult?.type || "Tier") + " ist da!"}</div>
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex justify-center">
                                        {!unlocked ? (
                                            <KaufKnopf onClick={unlockIncubatorSlot} disabled={gold < unlockCost}>{gold < unlockCost ? "Zu teuer" : "Freischalten"}</KaufKnopf>
                                        ) : !slot ? (
                                            <KaufKnopf onClick={() => setIncubatorTargetSlot(idx)}>Ei einlegen</KaufKnopf>
                                        ) : (
                                            <KaufKnopf onClick={() => collectHatchedEgg(idx)} disabled={isHatching}>{isHatching ? "Brütet …" : "Schlüpfen lassen"}</KaufKnopf>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {incubatorTargetSlot !== null && (
                    <div className="mt-5 border-[3px] p-3" style={{ borderColor: "#3b2516", background: "#f3e3c3", boxShadow: "0 4px 0 0 #3b2516" }}>
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-bold text-[#3b2516]">Welches Ei kommt in Platz {incubatorTargetSlot + 1}?</div>
                            <NebenKnopfHolz onClick={() => setIncubatorTargetSlot(null)}>Abbrechen</NebenKnopfHolz>
                        </div>
                        {eggInventory.length === 0 ? (
                            <div className="py-4 text-center text-xs text-[#6e4426]">Keine Eier im Rucksack — im Eier-Shop gibt es welche.</div>
                        ) : (
                            <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-8">
                                {eggInventory.map((egg) => (
                                    <button
                                        key={egg.instanceId}
                                        type="button"
                                        title={egg.name}
                                        onClick={() => placeEggInIncubator(incubatorTargetSlot, egg.instanceId)}
                                        className="flex flex-col items-center gap-1 border-[3px] bg-[#fffaf0] p-1.5 transition-transform duration-75 hover:-translate-y-0.5"
                                        style={{ borderColor: "#3b2516" }}
                                    >
                                        <ItemIcon item={egg} className="h-10 w-10" emojiClassName="text-2xl" />
                                        <div className="w-full truncate text-[10px] font-bold text-[#6e4426]">{egg.name}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {incubator.unlockedSlots < 5 && (
                    <div className="mt-4 text-center text-[11px] tabular-nums text-[#e8d7a8]">
                        Nächster Platz kostet {formatGold(INCUBATOR_UNLOCK_COSTS[incubator.unlockedSlots - 1])} Gold
                    </div>
                )}
        </StandFenster>
    );
}
