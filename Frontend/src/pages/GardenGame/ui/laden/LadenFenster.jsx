// ui/laden/LadenFenster.jsx
// Die vier Laden-Fenster (Samen, Werkzeug, Eier, Deko). Reine Anzeige: Bestand, Preise
// und Kauf-Aktionen kommen aus GameContainer.jsx, gebucht wird dort bzw. auf dem Server.
// Preisrechnungen hier müssen zu handleBuyTool & Co. passen.
import React from "react";
import {
    GoldTag, TimerTag,
} from "../gardenUi";
import { formatGold } from "../gardenTokens";
import { DEKO_KATEGORIEN, dekoNachKategorie } from "../deko";
import {
    giesskanneMinuten, KISTE_MAX, VITRINE_MAX, EGG_SHOP_CATALOGUE, getToolImage, getPickaxePrice,
    STEINFELDER_GESAMT, normalizeToolInventory, BACKPACK_MAX_LEVEL, BUY_ALL_WERKZEUGE,
    getBackpackUpgradePrice, normalizePlotUnlockedCells, withVisuals, SeedFacts,
} from "../../engine/gameConstants";
import { ARCHETYPE_LABELS, getPlantArchetypeKey } from "../../engine/PlantSystem";
import { istSaisonSorte, SAISON_ERLOES } from "../../engine/Tageszeit";
import { versionedAsset } from "../../engine/assetVersion";
import { StandFenster, StandReiter, Regal, WarenKachel, WarenBild, KaufKnopf, Marke } from "./Marktstand";

// Ab welcher Seltenheit ein Samen im Laden oben im eigenen Abschnitt steht.
const SELTENE_STUFEN = new Set(["EPIC", "LEGENDARY", "MYTHIC"]);

/**
 * Samen-Shop im Marktstand-Look (06.11.). Zwei Reiter statt drei: „Lohnt sich" war
 * nur das Angebot ohne die Samen, die bei deinem Gold kaum etwas bringen — bei wenig
 * Gold zeigten beide Reiter dasselbe. Jetzt stehen diese Samen blass im eigenen Regal
 * unten im Angebot (ladenWert.js entscheidet weiter, was sich lohnt).
 */
function SamenKachel({ seed, stock, gold, rucksackVoll, xpJeSorte, onBuy, onBuyAll, blass }) {
    const visual = withVisuals(seed);
    const inactive = !seed.active && seed.active !== undefined;
    const outOfStock = (stock ?? (seed.active ? 1 : 0)) <= 0;
    const canAfford = gold >= seed.shopPrice;
    const clickable = canAfford && !outOfStock && !inactive && !rucksackVoll;
    // Warum ein Kauf gerade nicht geht — steht dort, wo sonst „Kaufen" steht (wie ShopSeedCard)
    const hinderung = inactive ? "Nicht da"
        : outOfStock ? "Leer"
            : rucksackVoll ? "Voll"
                : !canAfford ? "Zu teuer" : null;
    const archetyp = ARCHETYPE_LABELS[getPlantArchetypeKey(seed.seedId)] || "Pflanze";
    return (
        <WarenKachel
            blass={blass || inactive}
            raritaet={seed.rarity}
            name={seed.name}
            zeile={`${archetyp} · ${seed.singleUse ? "Einmalernte" : "Dauerträger"}`}
            bild={(
                <div className="relative">
                    <WarenBild src={visual.harvestImage} alt={seed.name} />
                    <img src={versionedAsset(visual.plantedSeedImage)} alt="" draggable={false}
                        className="absolute -bottom-2 -left-7 h-11 w-11 object-contain drop-shadow-[2px_2px_0_rgba(59,37,22,0.35)]" style={{ imageRendering: "pixelated" }} />
                </div>
            )}
            abzeichen={istSaisonSorte(seed.seedId) ? (
                <Marke title="Saisonsorte: in dieser Jahreszeit geerntet bringt sie mehr Gold">Saison +{Math.round((SAISON_ERLOES - 1) * 100)} %</Marke>
            ) : null}
            vorrat={seed.active && !outOfStock ? stock : null}
            preis={seed.shopPrice}
            leistbar={canAfford}
            details={<SeedFacts seed={seed} xpJeSorte={xpJeSorte} />}
            aktionen={(
                <>
                    {clickable && <KaufKnopf klein title="So viele kaufen, wie Vorrat und Gold hergeben" onClick={() => onBuyAll(seed)}>Alle</KaufKnopf>}
                    <KaufKnopf disabled={!clickable} onClick={() => onBuy(seed)}>{hinderung || "Kaufen"}</KaufKnopf>
                </>
            )}
        />
    );
}

export function SamenLaden({
    onClose, countdown, gold, shopFilter, setShopFilter, lohnendeShopSeeds, shopRotation,
    visibleShopSeeds, ladenBestand, rucksackVoll, xpJeSorte, onBuy, onBuyAll,
}) {
    const katalog = shopFilter === "all";
    const lohnend = new Set((lohnendeShopSeeds || []).map((s) => s.seedId));
    const kachel = (seed, blass = false) => (
        <SamenKachel
            key={seed.seedId}
            seed={seed}
            stock={ladenBestand[seed.seedId] ?? (seed.active ? (seed.stock ?? 0) : 0)}
            gold={gold}
            rucksackVoll={rucksackVoll}
            xpJeSorte={xpJeSorte}
            onBuy={onBuy}
            onBuyAll={onBuyAll}
            blass={blass}
        />
    );
    const selten = visibleShopSeeds.filter((s) => SELTENE_STUFEN.has(s.rarity) && (katalog || lohnend.has(s.seedId)));
    const normal = visibleShopSeeds.filter((s) => !SELTENE_STUFEN.has(s.rarity) && (katalog || lohnend.has(s.seedId)));
    const kaum = katalog ? [] : visibleShopSeeds.filter((s) => !lohnend.has(s.seedId));
    return (
        <StandFenster
            titel="Samen-Shop"
            untertitel={katalog ? "Alle Sorten, die es geben kann" : "Frische Ware — wechselt mit jeder Lieferung"}
            farbe="gruen"
            bild="/garden-assets/world/seed_shop.png"
            onClose={onClose}
            kopfRechts={(
                <>
                    <TimerTag title="Nächste Lieferung" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            )}
            reiter={(
                <StandReiter
                    aktiv={katalog ? "all" : "available"}
                    onWaehlen={setShopFilter}
                    reiter={[
                        { key: "available", label: "Angebot", anzahl: shopRotation?.seeds.filter((s) => s.active).length ?? 0 },
                        { key: "all", label: "Gesamter Katalog", anzahl: shopRotation?.seeds.length ?? 0 },
                    ]}
                />
            )}
        >
            {(!shopRotation?.seeds || shopRotation.seeds.length === 0) && (
                <div className="py-10 text-center text-sm text-[#f3e3c3]">Die Ware wird ausgepackt…</div>
            )}
            {selten.length > 0 && <Regal titel={katalog ? "Selten" : "Seltene Ware dieser Lieferung"} ton="selten">{selten.map((s) => kachel(s))}</Regal>}
            {normal.length > 0 && <Regal titel={katalog ? "Weitere Sorten" : selten.length > 0 ? "Weitere Samen" : "Im Angebot"}>{normal.map((s) => kachel(s))}</Regal>}
            {kaum.length > 0 && (
                <Regal titel="Bringt bei deinem Gold kaum etwas" ton="blass">{kaum.map((s) => kachel(s, true))}</Regal>
            )}
        </StandFenster>
    );
}


export function WerkzeugLaden({
    onClose, countdown, gold, toolShopRotation, toolInventory, skillWirkung, skillStufe,
    plotUnlockedCells, toolShopStock, onBuy, onBuyAll,
}) {
    return (
        <StandFenster
            titel="Werkzeug-Shop"
            untertitel="Alles, was eine Farm braucht"
            farbe="blau"
            bild="/garden-assets/world/tool_shop.png"
            onClose={onClose}
            kopfRechts={
                <>
                    <TimerTag title="Neue Lieferung" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            }
        >
            <Regal titel="Werkzeuge">
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
                        || (tool.id === "angel" && toolInv.hasAngel)
                        || (tool.id === "profiangel" && toolInv.hasProfiAngel)
                        // Voll ausgebauter Rucksack: der Knopf blieb aktiv und
                        // hat weiter Gold gekostet, ohne Plätze zu geben.
                        || (tool.id === "backpack_upgrade" && (toolInv.backpackLevel || 0) >= BACKPACK_MAX_LEVEL)
                        || hackenGedeckt;
                    // Die Spitzhacke ist bewusst NICHT mehr dabei: sie ist immer
                    // vorrätig, gebremst allein durch ihren steigenden Preis.
                    const hasRotationStock = tool.type === "single";
                    const singleStock = hasRotationStock ? (toolShopStock[tool.id] ?? 0) : null;
                    // Profi-Angel nur mit einfacher Angel (wie werkzeug.js „braucht“)
                    const fehltAngel = tool.id === "profiangel" && !toolInv.hasAngel;
                    const canBuy = gold >= price && !isPermanentOwned && !fehltAngel && (!hasRotationStock || (singleStock ?? 0) > 0);
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
                        angel: "Dauerhaft · damit angelst du am Steg des Dorfteichs",
                        profiangel: toolInv.hasAngel ? "Dauerhaft · mehr Zeit, um die Ringe zu treffen" : "Braucht zuerst eine einfache Angel",
                        koeder_wurm: `10 Stück · einfacher Köder, ohne Köder beißt nichts · du hast ${toolInv.koederWurm || 0}`,
                        koeder_teig: `10 Stück · seltene Fische öfter, beißt schneller · du hast ${toolInv.koederTeig || 0}`,
                        koeder_leucht: `5 Stück · epische und legendäre Fische öfter, beißt am schnellsten · du hast ${toolInv.koederLeucht || 0}`,
                    }[tool.id] || "";
                    return (
                        <WarenKachel
                            key={tool.id}
                            blass={isPermanentOwned && !hackenGedeckt}
                            band={{ text: "", farbe: "transparent", hell: "#dde8f2" }}
                            bild={<WarenBild src={getToolImage(tool.id)} alt={tool.name} />}
                            name={tool.name}
                            text={description}
                            preis={isPermanentOwned ? undefined : price}
                            leistbar={gold >= price}
                            vorrat={hasRotationStock ? (singleStock ?? 0) : null}
                            aktionen={
                                <>
                                    {/* Buy-All (v2, Punkt 12): nur bei Werkzeugen, die man
                                        sinnvoll mehrfach kauft — bei Schaufel/Kiste/Vitrine
                                        wäre "Alle" dasselbe wie "Kaufen", nur verwirrender. */}
                                    {canBuy && BUY_ALL_WERKZEUGE.has(tool.id) && (
                                        <KaufKnopf klein onClick={() => onBuyAll(tool)} title="So viele kaufen, wie Vorrat/Deckel und Gold hergeben">
                                            Alle
                                        </KaufKnopf>
                                    )}
                                    <KaufKnopf onClick={() => onBuy(tool)} disabled={!canBuy}>
                                        {hackenGedeckt ? "Gedeckt" : isPermanentOwned ? "Im Besitz" : fehltAngel ? "Erst Angel" : gold < price ? "Zu teuer" : "Kaufen"}
                                    </KaufKnopf>
                                </>
                            }
                        />
                    );
                })}
            </Regal>
        </StandFenster>
    );
}

export function EierLaden({ onClose, countdown, gold, eggShopStock, onBuy }) {
    return (
        <StandFenster
            titel="Eier-Shop"
            untertitel="Was schlüpft wohl daraus?"
            farbe="orange"
            bild="/garden-assets/world/egg_shop.png"
            onClose={onClose}
            kopfRechts={
                <>
                    <TimerTag title="Neues Angebot" label={countdown} />
                    <GoldTag gold={gold} />
                </>
            }
        >
            <Regal titel="Eier dieser Lieferung">
                {EGG_SHOP_CATALOGUE.map(egg => {
                    const stock = eggShopStock[egg.id] ?? 0;
                    const available = stock > 0;
                    return (
                        <WarenKachel
                            key={egg.id}
                            blass={!available}
                            raritaet={egg.rarity}
                            bild={<WarenBild src={egg.image} alt={egg.name} />}
                            name={egg.name}
                            text={egg.hatchTable.map(h => `${h.type} ${h.chance} %`).join(" · ")}
                            preis={egg.price}
                            leistbar={gold >= egg.price}
                            vorrat={stock}
                            aktionen={
                                <KaufKnopf onClick={() => onBuy(egg)} disabled={gold < egg.price || stock <= 0}>
                                    {stock <= 0 ? "Leer" : gold < egg.price ? "Zu teuer" : "Kaufen"}
                                </KaufKnopf>
                            }
                        />
                    );
                })}
            </Regal>
            {Object.values(eggShopStock).every(v => (v || 0) <= 0) && (
                <div className="py-4 text-center text-sm text-[#f3e3c3]">Diese Lieferung bringt keine Eier.</div>
            )}
        </StandFenster>
    );
}

export function DekoLaden({ onClose, gold, dekoKategorie, setDekoKategorie, onBuy }) {
        const kategorie = DEKO_KATEGORIEN.find((k) => k.id === dekoKategorie) || DEKO_KATEGORIEN[0];
        const sichtbar = dekoNachKategorie(kategorie.id);
        return (
        <StandFenster
            titel="Deko-Shop"
            untertitel={kategorie.hinweis
                ? `${kategorie.name} — ${kategorie.hinweis}`
                : "Für die Wiese deiner Farm — beim Setzen mit R spiegelbar"}
            farbe="rot"
            bild="/garden-assets/world/deco_shop.png"
            onClose={onClose}
            kopfRechts={<GoldTag gold={gold} />}
            reiter={
                <StandReiter
                    aktiv={kategorie.id}
                    onWaehlen={setDekoKategorie}
                    reiter={DEKO_KATEGORIEN.map((k) => ({ key: k.id, label: k.name }))}
                />
            }
        >
            <Regal titel={kategorie.name}>
                {sichtbar.map((deco) => {
                    const canBuy = gold >= deco.price;
                    return (
                        <WarenKachel
                            key={deco.id}
                            raritaet={deco.rarity}
                            bild={<WarenBild src={deco.image} alt={deco.name} />}
                            name={deco.name}
                            zeile={`${deco.width}×${deco.height} Felder${deco.licht ? " · leuchtet nachts" : ""}`}
                            preis={deco.price}
                            leistbar={canBuy}
                            aktionen={
                                <>
                                    {/* Zehnerkauf nur bei Belägen: von einer Statue will
                                        niemand zehn, von Steinplatten fast immer. */}
                                    {deco.ebene === "boden" && (
                                        <KaufKnopf
                                            klein
                                            title={`10× ${deco.name} für ${formatGold(deco.price * 10)}`}
                                            onClick={(e) => { e.currentTarget.blur(); onBuy(deco, 10); }}
                                            disabled={gold < deco.price * 10}
                                        >
                                            ×10
                                        </KaufKnopf>
                                    )}
                                    <KaufKnopf onClick={(e) => { e.currentTarget.blur(); onBuy(deco); }} disabled={!canBuy}>
                                        {canBuy ? "Kaufen" : "Zu teuer"}
                                    </KaufKnopf>
                                </>
                            }
                        />
                    );
                })}
            </Regal>
        </StandFenster>
        );
}
