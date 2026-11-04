// ui/laden/LadenFenster.jsx
// Die vier Laden-Fenster (Samen, Werkzeug, Eier, Deko). Reine Anzeige: Bestand, Preise
// und Kauf-Aktionen kommen aus GameContainer.jsx, gebucht wird dort bzw. auf dem Server.
// Preisrechnungen hier müssen zu handleBuyTool & Co. passen.
import React from "react";
import {
    GardenModal, GoldTag, TimerTag, TabBar, PrimaryButton, RarityLabel, Abschnitt, LeerHinweis, FensterZeile, NebenKnopf,
} from "../gardenUi";
import { formatGold } from "../gardenTokens";
import { ItemIcon } from "../ItemIcon";
import { DEKO_KATEGORIEN, dekoNachKategorie } from "../deko";
import {
    giesskanneMinuten, KISTE_MAX, VITRINE_MAX, EGG_SHOP_CATALOGUE, getToolImage, getPickaxePrice,
    STEINFELDER_GESAMT, normalizeToolInventory, BACKPACK_MAX_LEVEL, BUY_ALL_WERKZEUGE,
    getBackpackUpgradePrice, normalizePlotUnlockedCells, ShopSeedCard,
} from "../../engine/gameConstants";

// Ab welcher Seltenheit ein Samen im Laden oben im eigenen Abschnitt steht.
const SELTENE_STUFEN = new Set(["EPIC", "LEGENDARY", "MYTHIC"]);

export function SamenLaden({
    onClose, countdown, gold, shopFilter, setShopFilter, lohnendeShopSeeds, shopRotation,
    visibleShopSeeds, ladenBestand, rucksackVoll, xpJeSorte, onBuy, onBuyAll,
}) {
    return (
        <GardenModal
            title="Samen-Shop"
            onClose={onClose}
            headerRight={
                <>
                    <TimerTag title="Nächste Rotation" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            }
        >
            <TabBar
                active={shopFilter}
                onSelect={setShopFilter}
                tabs={[
                    { key: "lohnend", label: "Lohnt sich", count: lohnendeShopSeeds.length },
                    { key: "available", label: "Im Angebot", count: shopRotation?.seeds.filter(s => s.active).length ?? 0 },
                    { key: "all", label: "Gesamter Katalog", count: shopRotation?.seeds.length ?? 0 },
                ]}
            />

            <div className="space-y-1.5">
                {/* Seltene Samen (Epic und höher) stehen als eigener Abschnitt
                    oben — sie sind der Grund, den Laden zu öffnen, und gingen
                    vorher zwischen den Commons unter. Nur bei Angeboten, im
                    Gesamtkatalog bleibt die gewohnte Liste. */}
                {(() => {
                    const karte = (seed) => (
                        <ShopSeedCard
                            key={seed.seedId}
                            seed={seed}
                            stock={ladenBestand[seed.seedId] ?? (seed.active ? (seed.stock ?? 0) : 0)}
                            canAfford={gold >= seed.shopPrice}
                            rucksackVoll={rucksackVoll}
                            xpJeSorte={xpJeSorte}
                            onBuy={onBuy}
                            onBuyAll={onBuyAll}
                        />
                    );
                    if (shopFilter === "all") return visibleShopSeeds.map(karte);
                    const selten = visibleShopSeeds.filter((s) => SELTENE_STUFEN.has(s.rarity));
                    const rest = visibleShopSeeds.filter((s) => !SELTENE_STUFEN.has(s.rarity));
                    if (selten.length === 0) return rest.map(karte);
                    return (
                        <>
                            <Abschnitt ton="selten" className="px-1 pb-1">Seltene Samen in dieser Runde</Abschnitt>
                            <div className="space-y-1.5 rounded-2xl border border-amber-700/50 bg-amber-950/20 p-1.5">
                                {selten.map(karte)}
                            </div>
                            {rest.length > 0 && <Abschnitt>Weitere Samen</Abschnitt>}
                            {rest.map(karte)}
                        </>
                    );
                })()}
                {(!shopRotation?.seeds || shopRotation.seeds.length === 0) && (
                    <LeerHinweis>Shop wird geladen…</LeerHinweis>
                )}
                {shopFilter === "lohnend" && shopRotation?.seeds?.length > 0 && visibleShopSeeds.length === 0 && (
                    <LeerHinweis>
                        Diese Runde ist nichts dabei, was sich bei deinem Gold lohnt. Alles Übrige steht unter „Im Angebot“.
                    </LeerHinweis>
                )}
            </div>
        </GardenModal>
    );
}

export function WerkzeugLaden({
    onClose, countdown, gold, toolShopRotation, toolInventory, skillWirkung, skillStufe,
    plotUnlockedCells, toolShopStock, onBuy, onBuyAll,
}) {
    return (
        <GardenModal
            title="Werkzeug-Shop"
            onClose={onClose}
            headerRight={
                <>
                    <TimerTag title="Neue Lieferung" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            }
        >
            <div className="space-y-1.5">
                {(toolShopRotation?.items || []).map(tool => {
                    const toolInv = normalizeToolInventory(toolInventory);
                    // Muss zur Rechnung in handleBuyTool passen — sonst zeigt der
                    // Laden einen anderen Preis an, als die Kasse abbucht.
                    const hackenRabatt = 1 - Math.min(0.6, skillWirkung("bergbau"));
                    const hackenPreis = (n) => Math.max(1, Math.floor(getPickaxePrice(n) * hackenRabatt));
                    // „Lagerist" (v2, Punkt 4): derselbe Rabatt-Aufbau wie oben bei
                    // der Spitzhacke, nur auf den Rucksack — muss zu preisFuer in
                    // werkzeug.js passen.
                    const lagerRabatt = 1 - Math.min(0.6, skillWirkung("lagerist"));
                    const rucksackPreisMitRabatt = (n) => Math.max(1, Math.floor(getBackpackUpgradePrice(n) * lagerRabatt));
                    const price = tool.id === "backpack_upgrade"
                        ? rucksackPreisMitRabatt(toolInv.backpackLevel || 0)
                        : tool.id === "pickaxe"
                        ? hackenPreis(toolInv.pickaxesBought || 0)
                        : tool.price;
                    // Kiste und Vitrine stehen einmal auf dem Grundstück —
                    // danach gilt derselbe „schon vorhanden"-Zustand wie bei
                    // der Schaufel, sonst bliebe der Kauf-Knopf aktiv.
                    // Spitzhacken über den Bedarf hinaus sind rausgeworfenes
                    // Gold: mehr Nutzungen als offene Steinfelder lassen sich
                    // nie einlösen. Muss zur Prüfung in handleBuyTool passen.
                    const offeneSteine = Math.max(0,
                        STEINFELDER_GESAMT - normalizePlotUnlockedCells(plotUnlockedCells).length);
                    const hackenGedeckt = tool.id === "pickaxe"
                        && (toolInv.pickaxeUses || 0) >= offeneSteine;
                    const isPermanentOwned = (tool.id === "shovel" && toolInv.hasShovel)
                        || (tool.id === "chest" && toolInv.hasChest)
                        || (tool.id === "vitrine" && toolInv.hasVitrine)
                        // Voll ausgebauter Rucksack: der Knopf blieb aktiv und
                        // hat weiter Gold gekostet, ohne Plätze zu geben.
                        || (tool.id === "backpack_upgrade" && (toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL)
                        || hackenGedeckt;
                    // Die Spitzhacke ist bewusst NICHT mehr dabei: sie ist immer
                    // vorrätig, gebremst allein durch ihren steigenden Preis.
                    const hasRotationStock = tool.type === "single";
                    const singleStock = hasRotationStock ? (toolShopStock[tool.id] ?? 0) : null;
                    const canBuy = gold >= price && !isPermanentOwned && (!hasRotationStock || (singleStock ?? 0) > 0);
                    const description = {
                        pickaxe: offeneSteine === 0
                            ? "Dein Grundstück ist komplett freigelegt."
                            : hackenGedeckt
                                ? `Du hast ${toolInv.pickaxeUses} Nutzungen für ${offeneSteine} offene Steinfelder — das reicht.`
                                : `4 Nutzungen pro Kauf · noch ${offeneSteine} Steinfelder frei · nächster Kauf ${formatGold(hackenPreis((toolInv.pickaxesBought || 0) + 1))}`,
                        shovel: "Dauerhaft · entfernt Pflanzen restlos",
                        plant_pot: "Einmalig · versetzt eine Pflanze",
                        backpack_upgrade: (toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL
                            ? `Voll ausgebaut · ${50 + BACKPACK_MAX_LEVEL * 10} Plätze`
                            : `Stufe ${toolInv.backpackLevel || 0} von ${BACKPACK_MAX_LEVEL} · +10 Plätze pro Upgrade`,
                        watering_can: `Einmalig · verkürzt das Wachstum um ${giesskanneMinuten(skillStufe("giesskanne"))} Minuten · wirkt auf alle Fruchtstände`,
                        chest: `Dauerhaft · ${KISTE_MAX} Plätze für Ernte, ohne Rucksack zu belegen`,
                        vitrine: `Dauerhaft · ${VITRINE_MAX} Schauplätze, für alle in der Welt sichtbar`,
                    }[tool.id] || "";
                    return (
                        <FensterZeile
                            key={tool.id}
                            hoverbar={canBuy}
                            bild={<ItemIcon item={{ ...tool, image: getToolImage(tool.id) }} className="w-10 h-10" emojiClassName="text-2xl" />}
                            titel={tool.name}
                            text={description}
                            wert={formatGold(price)}
                            unterWert={hasRotationStock ? `${singleStock ?? 0} auf Lager` : null}
                            aktionen={
                                <>
                                    {/* Buy-All (v2, Punkt 12): nur bei Werkzeugen, die man
                                        sinnvoll mehrfach kauft — bei Schaufel/Kiste/Vitrine
                                        wäre "Alle" dasselbe wie "Kaufen", nur verwirrender. */}
                                    {canBuy && BUY_ALL_WERKZEUGE.has(tool.id) && (
                                        <NebenKnopf onClick={() => onBuyAll(tool)} title="So viele kaufen, wie Vorrat/Deckel und Gold hergeben">
                                            Alle
                                        </NebenKnopf>
                                    )}
                                    <PrimaryButton onClick={() => onBuy(tool)} disabled={!canBuy}>
                                        {hackenGedeckt ? "Gedeckt" : isPermanentOwned ? "Im Besitz" : "Kaufen"}
                                    </PrimaryButton>
                                </>
                            }
                        />
                    );
                })}
            </div>
        </GardenModal>
    );
}

export function EierLaden({ onClose, countdown, gold, eggShopStock, onBuy }) {
    return (
        <GardenModal
            title="Eier-Shop"
            onClose={onClose}
            headerRight={
                <>
                    <TimerTag title="Neues Angebot" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            }
        >
            <div className="space-y-1.5">
                {EGG_SHOP_CATALOGUE.map(egg => {
                    const stock = eggShopStock[egg.id] ?? 0;
                    const available = stock > 0;
                    return (
                        <FensterZeile
                            key={egg.id}
                            zustand={available ? "normal" : "gedimmt"}
                            hoverbar={available && gold >= egg.price}
                            bild={<ItemIcon item={egg} className="w-10 h-10" emojiClassName="text-2xl" />}
                            titel={egg.name}
                            marke={<RarityLabel rarity={egg.rarity} />}
                            text={egg.hatchTable.map(h => `${h.type} ${h.chance} %`).join(" · ")}
                            wert={formatGold(egg.price)}
                            unterWert={`${stock} auf Lager`}
                            aktionen={
                                <PrimaryButton onClick={() => onBuy(egg)} disabled={gold < egg.price || stock <= 0}>
                                    Kaufen
                                </PrimaryButton>
                            }
                        />
                    );
                })}
                {Object.values(eggShopStock).every(v => (v || 0) <= 0) && (
                    <LeerHinweis>Diese Rotation führt keine Eier.</LeerHinweis>
                )}
            </div>
        </GardenModal>
    );
}

export function DekoLaden({ onClose, gold, dekoKategorie, setDekoKategorie, onBuy }) {
        const kategorie = DEKO_KATEGORIEN.find((k) => k.id === dekoKategorie) || DEKO_KATEGORIEN[0];
        const sichtbar = dekoNachKategorie(kategorie.id);
        return (
        <GardenModal
            title="Deko-Shop"
            subtitle={kategorie.hinweis
                ? `${kategorie.name} — ${kategorie.hinweis}`
                : "Platzierbar auf den Grasflächen deiner Farm — beim Setzen mit R spiegelbar"}
            onClose={onClose}
            headerRight={<GoldTag gold={gold} />}
            /* Feste Höhe UND feststehende Reiter. Vorher wuchs das Fenster mit
               seinem Inhalt und sass dabei mittig — jeder Kategoriewechsel
               verschob es also auf dem Bildschirm, und die Reiter sprangen
               unter dem Mauszeiger weg. Dazu scrollten sie beim Blättern aus
               dem Bild, sodass man zum Wechseln erst wieder hochfahren musste. */
            feste
            toolbar={
                <TabBar
                    className="-mb-2"
                    active={kategorie.id}
                    onSelect={setDekoKategorie}
                    tabs={DEKO_KATEGORIEN.map((k) => ({ key: k.id, label: k.name }))}
                />
            }
        >
            {/* Eine Spalte wie in den anderen Läden — zwei Spalten ließen für Preis
                und zwei Knöpfe zu wenig Platz. */}
            <div className="space-y-1.5">
                {sichtbar.map((deco) => {
                    const canBuy = gold >= deco.price;
                    return (
                        <FensterZeile
                            key={deco.id}
                            hoverbar={canBuy}
                            bild={<ItemIcon item={deco} className="w-10 h-10" emojiClassName="text-2xl" />}
                            titel={deco.name}
                            marke={<RarityLabel rarity={deco.rarity} />}
                            text={`${deco.width}×${deco.height} Felder`}
                            wert={formatGold(deco.price)}
                            aktionen={
                                <>
                                    {/* Zehnerkauf nur bei Belägen: von einer Statue will
                                        niemand zehn, von Steinplatten fast immer. */}
                                    {deco.ebene === "boden" && (
                                        <NebenKnopf
                                            title={`10× ${deco.name} für ${formatGold(deco.price * 10)}`}
                                            onClick={(e) => { e.currentTarget.blur(); onBuy(deco, 10); }}
                                            disabled={gold < deco.price * 10}
                                        >
                                            ×10
                                        </NebenKnopf>
                                    )}
                                    <PrimaryButton onClick={() => onBuy(deco)} disabled={!canBuy}>
                                        Kaufen
                                    </PrimaryButton>
                                </>
                            }
                        />
                    );
                })}
            </div>
        </GardenModal>
        );
}
