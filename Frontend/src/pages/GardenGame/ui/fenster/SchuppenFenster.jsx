// ui/fenster/SchuppenFenster.jsx
// Schuppen und alles, was darin wohnt: Auswahl, Mülleimer, Kiste/Vitrine (Ablage), fremde Vitrine, Brutkasten.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { GardenModal, RarityLabel, PrimaryButton, Abschnitt, LeerHinweis, FensterZeile, NebenKnopf } from "../gardenUi";
import { normalizeToolInventory, KISTE_MAX, VITRINE_MAX, INCUBATOR_UNLOCK_COSTS, buildPetPreviewImage } from "../../engine/gameConstants";
import { HudIcon, TabIcon } from "../gameIcons";
import { ItemIcon } from "../ItemIcon";
import AblageModal, { FremdeVitrineModal } from "../AblageModal";
import { formatGold } from "../gardenTokens";
import { Package } from "lucide-react";

export function SchuppenAuswahl({
    setShedOpen, setAblageOffen, toolInventory, setTrashOpen, setIncubatorTargetSlot,
    setIncubatorOpen, readyEggsCount, setEditorAktiv, setVerschiebtGebaeude,
}) {
    return (
        <GardenModal
            title="Schuppen"
            subtitle="Was möchtest du öffnen?"
            onClose={() => setShedOpen(false)}
            breite="klein"
        >
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setAblageOffen("chest"); }}
                    disabled={!normalizeToolInventory(toolInventory).hasChest}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/60 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60 disabled:cursor-default disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:bg-slate-900/60"
                >
                    <HudIcon.kiste size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-white">Kiste</span>
                    {!normalizeToolInventory(toolInventory).hasChest && (
                        <span className="text-[11px] text-slate-600">nicht gekauft</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setAblageOffen("vitrine"); }}
                    disabled={!normalizeToolInventory(toolInventory).hasVitrine}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/60 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60 disabled:cursor-default disabled:opacity-40 disabled:hover:border-slate-800 disabled:hover:bg-slate-900/60"
                >
                    <HudIcon.vitrine size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-white">Vitrine</span>
                    {!normalizeToolInventory(toolInventory).hasVitrine && (
                        <span className="text-[11px] text-slate-600">nicht gekauft</span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setTrashOpen(true); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/60 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60"
                >
                    <HudIcon.remove size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-white">Mülleimer</span>
                </button>
                {/* Feedback 30.08.: "Inkubator in den Schuppen packen und aus dem
                    Tiere-Dropdown entfernen" — zieht damit als vierte Tür in dasselbe
                    Gebäude ein wie Kiste/Vitrine/Mülleimer. Das "Ei fertig"-Signal, das
                    vorher am Tiere-Knopf hing, sitzt jetzt hier UND als Marker über dem
                    Schuppen auf dem Feld (siehe _drawEierMarker in Renderer.js). */}
                <button
                    type="button"
                    onClick={() => { setShedOpen(false); setIncubatorTargetSlot(null); setIncubatorOpen(true); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-800 bg-slate-900/60 text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60"
                >
                    <TabIcon.egg size={18} className="shrink-0" />
                    <span className="flex-1 text-sm font-medium text-white">Inkubator</span>
                    {readyEggsCount > 0 && (
                        <span className="text-[11px] font-semibold text-violet-300">
                            {readyEggsCount === 1 ? "1 fertig" : `${readyEggsCount} fertig`}
                        </span>
                    )}
                </button>
            </div>
            <button
                type="button"
                onClick={() => { setShedOpen(false); setEditorAktiv(true); setVerschiebtGebaeude("shed"); }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
            >
                <HudIcon.reposition size={13} /> Schuppen umstellen
            </button>
        </GardenModal>
    );
}

export function MuellFenster({
    setTrashOpen, setShedOpen, inventory, setInventory, setSelectedSeed, notify, debouncedSave,
    decoInventory, setDecoInventory, selectedDecoToPlace, setSelectedDecoToPlace,
}) {
    return (
        <GardenModal
            title="Mülleimer"
            subtitle="Endgültig wegwerfen — das lässt sich nicht rückgängig machen"
            onClose={() => setTrashOpen(false)}
            onBack={() => { setTrashOpen(false); setShedOpen(true); }}
        >
            {/* Kein eigener "Umstellen"-Knopf hier: der Mülleimer wohnt seit dem
                Schuppen-Umbau (Feedback 29.08.) im selben Gebäude wie Kiste und
                Vitrine — verschoben wird der Schuppen als Ganzes, entweder aus
                dem Schuppen-Menü heraus oder aus der Kiste/Vitrine. */}
            {/* Samen: gleiche Sorten stehen als eine Zeile mit Anzahl da. Wer 40
                Löwenzahn loswerden will, klickt sonst 40-mal. */}
            <div className="mb-4">
                <Abschnitt className="px-1 pb-1">Samen</Abschnitt>
                {inventory.length === 0 ? (
                    <LeerHinweis className="py-4">Keine Samen im Rucksack.</LeerHinweis>
                ) : (
                    <div className="space-y-1.5">
                        {(() => {
                            const gruppen = new Map();
                            for (const s of inventory) {
                                if (!s?.instanceId) continue;
                                const key = `${s.seedId}|${s.rarity}`;
                                const g = gruppen.get(key);
                                if (g) g.ids.push(s.instanceId);
                                else gruppen.set(key, { key, seed: s, ids: [s.instanceId] });
                            }
                            const wirfWeg = (ids, label) => {
                                const weg = new Set(ids);
                                setInventory((prev) => prev.filter((s) => !weg.has(s?.instanceId)));
                                setSelectedSeed((prev) => (prev && weg.has(prev.instanceId) ? null : prev));
                                notify(label);
                                debouncedSave();
                            };
                            return [...gruppen.values()].map((g) => (
                                <FensterZeile
                                    key={g.key}
                                    bild={<ItemIcon item={g.seed} className="w-10 h-10" emojiClassName="text-2xl" />}
                                    titel={g.ids.length > 1 ? `${g.seed.name} × ${g.ids.length}` : g.seed.name}
                                    marke={<RarityLabel rarity={g.seed.rarity} />}
                                    aktionen={
                                        <>
                                            <NebenKnopf onClick={() => wirfWeg([g.ids[0]], `${g.seed.name} weggeworfen.`)}>
                                                Einen
                                            </NebenKnopf>
                                            {g.ids.length > 1 && (
                                                <NebenKnopf ton="gefahr" onClick={() => wirfWeg(g.ids, `${g.ids.length}× ${g.seed.name} weggeworfen.`)}>
                                                    <HudIcon.remove size={13} /> Alle {g.ids.length}
                                                </NebenKnopf>
                                            )}
                                        </>
                                    }
                                />
                            ));
                        })()}
                    </div>
                )}
            </div>

            <Abschnitt>Deko</Abschnitt>
            {decoInventory.length === 0 ? (
                <LeerHinweis className="py-4">Keine Deko im Inventar.</LeerHinweis>
            ) : (
                <div className="space-y-1.5">
                    {decoInventory.map((deco) => (
                        <FensterZeile
                            key={deco.instanceId || deco.id}
                            bild={<ItemIcon item={deco} className="w-10 h-10" emojiClassName="text-2xl" />}
                            titel={deco.name}
                            marke={<RarityLabel rarity={deco.rarity} />}
                            aktionen={
                                <NebenKnopf
                                    ton="gefahr"
                                    onClick={() => {
                                        const ziel = deco.instanceId || deco.id;
                                        setDecoInventory((prev) => prev.filter((d) => (d.instanceId || d.id) !== ziel));
                                        if ((selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === ziel) {
                                            setSelectedDecoToPlace(null);
                                        }
                                        notify(`${deco.name} weggeworfen.`);
                                        debouncedSave();
                                    }}
                                >
                                    <HudIcon.remove size={13} /> Wegwerfen
                                </NebenKnopf>
                            }
                        />
                    ))}
                </div>
            )}
        </GardenModal>
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
        <GardenModal
            title="Inkubator"
            subtitle="Eier einlegen, ausbrüten, Tier auf der Farm platzieren"
            onClose={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); }}
            onBack={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); setShedOpen(true); }}
            breite="gross"
            // Kein eigener "Umstellen"-Knopf: der Inkubator hat kein eigenes
            // Gebäude mehr, sondern wohnt seit Feedback 30.08. im Schuppen
            // (dessen "Schuppen umstellen"-Knopf zieht ihn automatisch mit).
            headerRight={
                <span className="text-xs text-slate-400 tabular-nums">{eggInventory.length} Eier im Inventar</span>
            }
        >
                <div className="grid grid-cols-5 gap-2">
                    {Array(5).fill(null).map((_, idx) => {
                        const unlocked = idx < incubator.unlockedSlots;
                        const slot = incubator.slots[idx];
                        const unlockCost = INCUBATOR_UNLOCK_COSTS[idx - 1];
                        return (
                            <div key={idx}
                                className={`rounded-2xl border p-3 flex flex-col min-h-[210px] ${unlocked ? "border-slate-700 bg-slate-900/60" : "border-slate-800 bg-slate-900/30"}`}
                            >
                                <div className="text-[10px] text-center mb-1.5 text-slate-500 tabular-nums">Platz {idx + 1}</div>
                                {!unlocked && (
                                    <div className="flex flex-col items-center justify-center flex-1 gap-2">
                                        <HudIcon.locked size={18} />
                                        <div className="text-[11px] text-slate-400 tabular-nums">{formatGold(unlockCost)}</div>
                                        <PrimaryButton onClick={unlockIncubatorSlot} disabled={gold < unlockCost} className="px-2 py-1">
                                            Freischalten
                                        </PrimaryButton>
                                    </div>
                                )}
                                {unlocked && !slot && (
                                    <>
                                        <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-2xl">
                                            <Package size={22} className="text-slate-700" />
                                        </div>
                                        <PrimaryButton onClick={() => setIncubatorTargetSlot(idx)} className="mt-2 w-full py-1.5">
                                            Ei einsetzen
                                        </PrimaryButton>
                                    </>
                                )}
                                {unlocked && slot && (() => {
                                    const leftMs = Math.max(0, slot.hatchAt - tickNow);
                                    const isHatching = leftMs > 0;
                                    return (
                                    <>
                                        <div className="flex items-center justify-center">
                                            {isHatching ? (
                                                <ItemIcon item={slot.egg} className="w-16 h-16 object-contain rounded-2xl border border-slate-800 bg-slate-950/60" />
                                            ) : (
                                                <img src={slot.hatchResult?.previewImage || buildPetPreviewImage(slot.hatchResult?.type)} alt="" className="w-16 h-16 object-contain rounded-2xl border border-slate-800 bg-slate-950/60" />
                                            )}
                                        </div>
                                        {/* Ohne die Absicherung reisst ein Platz ohne `egg` den ganzen
                                            Spielbildschirm mit — daneben wird `hatchResult` schon so gelesen. */}
                                        <div className="text-center text-xs font-medium text-white mt-1.5 truncate">{slot.egg?.name || "Ei"}</div>
                                        <div className="text-center text-[11px] text-slate-400 mt-0.5 truncate">
                                            {isHatching ? "Ergebnis unbekannt" : (slot.hatchResult?.type || "Tier")}
                                        </div>
                                        <div className={`text-center text-[11px] mt-1 font-medium tabular-nums ${leftMs > 0 ? "text-slate-400" : "text-emerald-400"}`}>
                                            {leftMs > 0 ? formatDuration(leftMs) : "Bereit"}
                                        </div>
                                        <PrimaryButton onClick={() => collectHatchedEgg(idx)} disabled={isHatching} className="mt-auto w-full py-1.5">
                                            Schlüpfen lassen
                                        </PrimaryButton>
                                    </>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
                {incubatorTargetSlot !== null && (
                    <div className="mt-4 border border-slate-800 rounded-2xl p-3 bg-slate-950/50">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-slate-300 font-medium">Ei für Platz {incubatorTargetSlot + 1} wählen</div>
                            <button
                                type="button"
                                onClick={() => setIncubatorTargetSlot(null)}
                                className="text-[11px] text-slate-500 hover:text-white transition-colors"
                            >
                                Abbrechen
                            </button>
                        </div>
                        {eggInventory.length === 0 ? (
                            <div className="text-[11px] text-slate-500 py-4 text-center">Keine Eier im Inventar.</div>
                        ) : (
                            <div className="grid grid-cols-6 gap-1.5 max-h-44 overflow-y-auto">
                                {eggInventory.map((egg) => (
                                    <button
                                        key={egg.instanceId}
                                        type="button"
                                        onClick={() => placeEggInIncubator(incubatorTargetSlot, egg.instanceId)}
                                        className="p-2 rounded-2xl border border-slate-800 hover:border-slate-600 bg-slate-900 transition-colors text-center flex flex-col items-center gap-1"
                                    >
                                        <ItemIcon item={egg} className="w-8 h-8" emojiClassName="text-xl" />
                                        <div className="text-[10px] text-slate-400 truncate w-full">{egg.name}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {incubator.unlockedSlots < 5 && (
                    <div className="mt-3 text-[11px] text-slate-500 text-center tabular-nums">
                        Nächster Platz kostet {formatGold(INCUBATOR_UNLOCK_COSTS[incubator.unlockedSlots - 1])} Gold
                    </div>
                )}
        </GardenModal>
    );
}
