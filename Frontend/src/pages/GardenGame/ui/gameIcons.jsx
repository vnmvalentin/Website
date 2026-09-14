// ui/gameIcons.jsx
// Eigene Grafik statt lucide-react / Emoji, dort wo Feedback 30.08. ("eigene Icons
// statt emojis ... statt lucide") schon Bilder geliefert hat — siehe garden-assets/
// icons/. Jede Komponente hier ist ein Drop-in-Ersatz für die lucide-Komponente,
// die sie ablöst: dieselben Props (`size`, `className`), an derselben Stelle im Baum.
//
// Anders als ein lucide-Icon FÄRBT sich ein <img> nicht über `text-*`-Klassen ein —
// das eigene Bild bringt seine Farbe schon mit. `className` bleibt trotzdem sinnvoll
// (shrink-0, ml-auto, …), nur die Farbklasse darauf ist seitdem wirkungslos.
//
// NICHT jede lucide-Stelle im Spiel hat hier eine Entsprechung: derselbe lucide-
// Name steht an manchen Stellen für zwei verschiedene Dinge (z. B. Trophy für
// „Level" UND für die Vitrine im Schuppen) — nur die Stelle, für die tatsächlich
// ein eigenes Bild geliefert wurde, wird unten ersetzt. Der Rest bleibt lucide.
import React from 'react';
import { versionedAsset } from '../engine/assetVersion';

const BASIS = "/garden-assets/icons";

/**
 * Baut aus einem Bildpfad eine Komponente mit der lucide-Kalksignatur (size,
 * className). `size` bestimmt die HÖHE; die Breite folgt seitenverhältnistreu —
 * die geliefertern Bilder sind nicht alle quadratisch (Züchter z. B. ist breiter
 * als hoch), ein festes width+height hätte sie gestaucht.
 */
function machIcon(src, name) {
    const resolved = versionedAsset(`${BASIS}/${src}`);
    // `style` ist optional und wird HINTER die feste Größe gemischt — nur ein paar
    // Stellen brauchen mehr (z. B. einen drop-shadow für Kontrast auf wechselndem
    // Untergrund, siehe WardrobeModal Farbknopf-Häkchen).
    function Icon({ size = 16, className = "", style }) {
        return (
            <img
                src={resolved}
                alt=""
                draggable={false}
                className={className}
                style={{ height: size, width: "auto", display: "inline-block", objectFit: "contain", flexShrink: 0, ...style }}
            />
        );
    }
    Icon.displayName = name;
    return Icon;
}

// ── HUD-Chrome: Währung, Fenster-Steuerung, Navigation ─────────────────────────
export const HudIcon = {
    gold: machIcon("hud/gold.png", "IconGold"),
    goldLifetime: machIcon("hud/gold_lifetime.png", "IconGoldLifetime"),
    level: machIcon("hud/level.png", "IconLevel"),
    locked: machIcon("hud/locked.png", "IconLocked"),
    check: machIcon("hud/check.png", "IconCheck"),
    close: machIcon("hud/close.png", "IconClose"),
    palette: machIcon("hud/palette.png", "IconPalette"),
    star: machIcon("hud/star.png", "IconStar"),
    mailbox: machIcon("hud/mailbox.png", "IconMailbox"),
    send: machIcon("hud/send.png", "IconSend"),
    moveOne: machIcon("hud/move_one.png", "IconMoveOne"),
    moveAll: machIcon("hud/move_all.png", "IconMoveAll"),
    reposition: machIcon("hud/reposition.png", "IconReposition"),
    ruler: machIcon("hud/ruler.png", "IconRuler"),
    search: machIcon("hud/search.png", "IconSearch"),
    back: machIcon("hud/back.png", "IconBack"),
    invite: machIcon("hud/invite.png", "IconInvite"),
    trusted: machIcon("hud/trusted.png", "IconTrusted"),
    revoke: machIcon("hud/revoke.png", "IconRevoke"),
    remove: machIcon("hud/remove.png", "IconRemove"),
    inventory: machIcon("hud/inventory.png", "IconInventory"),
    farm: machIcon("hud/farm.png", "IconFarm"),
    sellArea: machIcon("hud/sell_area.png", "IconSellArea"),
    shopArea: machIcon("hud/shop_area.png", "IconShopArea"),
    players: machIcon("hud/players.png", "IconPlayers"),
    chat: machIcon("hud/chat.png", "IconChat"),
    settings: machIcon("hud/settings.png", "IconSettings"),
    changelog: machIcon("hud/changelog.png", "IconChangelog"),
    worldCode: machIcon("hud/world_code.png", "IconWorldCode"),
    party: machIcon("hud/party.png", "IconParty"),
    chevron: machIcon("hud/chevron.png", "IconChevron"),
    // Feedback 30.08. (Nachlieferung): fünf Icons, die beim ersten Icon-Atlas-
    // Durchgang echt fehlten — siehe die Atlas-Notiz zu jedem einzelnen.
    editor: machIcon("hud/editor.png", "IconEditor"),
    wardrobe: machIcon("hud/wardrobe.png", "IconWardrobe"),
    logbuch: machIcon("hud/logbuch.png", "IconLogbuch"),
    kiste: machIcon("hud/kiste.png", "IconKiste"),
    vitrine: machIcon("hud/vitrine.png", "IconVitrine"),
    // Nachlieferung 31.08.: Gold-Shop-Knopf (bisher lucide Gem) und die
    // Werkzeug- und Schuppen-Reiter im Gold-Shop (bisher lucide Wrench/Home) —
    // "shed" ist derselbe Schuppen wie im Gold-Shop-Vorschaubild und auf dem
    // Grundstück, nur auf HUD-Icon-Größe verkleinert.
    goldShop: machIcon("hud/gold_shop.png", "IconGoldShop"),
    tools: machIcon("hud/tools.png", "IconTools"),
    shed: machIcon("hud/shed.png", "IconShed"),
    // Nachlieferung 01.09.: Nameplate-Reiter im Gold-Shop (bisher lucide Tag).
    nameplate: machIcon("hud/nameplate.png", "IconNameplate"),
};

// ── Wetter ──────────────────────────────────────────────────────────────────────
export const WeatherIcon = {
    sun: machIcon("weather/sun.png", "IconSun"),
    rain: machIcon("weather/rain.png", "IconRain"),
    snow: machIcon("weather/snow.png", "IconSnow"),
    thunder: machIcon("weather/thunder.png", "IconThunder"),
    moonlight: machIcon("weather/moonlight.png", "IconMoonlight"),
};

// ── Shop-Reiter ─────────────────────────────────────────────────────────────────
export const TabIcon = {
    seed: machIcon("tabs/seed.png", "IconTabSeed"),
    plant: machIcon("tabs/plant.png", "IconTabPlant"),
    egg: machIcon("tabs/egg.png", "IconTabEgg"),
    pet: machIcon("tabs/pet.png", "IconTabPet"),
    deco: machIcon("tabs/deco.png", "IconTabDeco"),
    tool: machIcon("tabs/tool.png", "IconTabTool"),
    all: machIcon("tabs/all.png", "IconTabAll"),
};

// ── Statuseffekte + Veredelung ──────────────────────────────────────────────────
export const StatusIcon = {
    wet: machIcon("status/wet.png", "IconWet"),
    frozen: machIcon("status/frozen.png", "IconFrozen"),
    charged: machIcon("status/charged.png", "IconCharged"),
    moonlit: machIcon("status/moonlit.png", "IconMoonlit"),
};
export const SpecialIcon = {
    golden: machIcon("special/golden.png", "IconGolden"),
    rainbow: machIcon("special/rainbow.png", "IconRainbow"),
};

// ── Fähigkeitsbaum ──────────────────────────────────────────────────────────────
// tier_gate (die gestrichelte Sperrlinie zwischen den Stufen) fehlt noch — dieser
// Übergang bleibt bis dahin bei lucide ChevronsRight, siehe SkillTreeModal.jsx.
export const SkillControlIcon = {
    learn: machIcon("skills/learn.png", "IconSkillLearn"),
    reset: machIcon("skills/reset.png", "IconSkillReset"),
};
export const SkillIcon = {
    // Schlüssel = skill.id aus core/skills.js, NICHT der Anzeigename ("Bergmann").
    // Die Fähigkeit heisst id: "bergbau" (Bergmann ist nur ihr Anzeigename) — mit
    // dem Schlüssel "bergmann" schlug SkillIcon[skill.id] deshalb immer fehl und
    // die Zeile blieb ohne Icon (gemeldet 30.08.). Bilddatei bleibt unverändert.
    bergbau: machIcon("skills/bergmann.png", "IconSkillBergmann"),
    giesskanne: machIcon("skills/regenmacher.png", "IconSkillRegenmacher"),
    gruener_daumen: machIcon("skills/gruener_daumen.png", "IconSkillGruenerDaumen"),
    haendler: machIcon("skills/haendler.png", "IconSkillHaendler"),
    lagerist: machIcon("skills/lagerist.png", "IconSkillLagerist"),
    wetterfuehlig: machIcon("skills/wetterfuehlig.png", "IconSkillWetterfuehlig"),
    ertrag: machIcon("skills/ertrag.png", "IconSkillErtrag"),
    zuechter: machIcon("skills/zuechter.png", "IconSkillZuechter"),
    seltenheit: machIcon("skills/glueckspilz.png", "IconSkillGlueckspilz"),
};

// ── Tier-Fähigkeiten ─────────────────────────────────────────────────────────────
export const PetIcon = {
    goldfinder: machIcon("pets/goldfinder.png", "IconPetGoldfinder"),
    gaertner: machIcon("pets/gaertner.png", "IconPetGaertner"),
    erntehelfer: machIcon("pets/erntehelfer.png", "IconPetErntehelfer"),
    forscher: machIcon("pets/forscher.png", "IconPetForscher"),
    kaufmann: machIcon("pets/kaufmann.png", "IconPetKaufmann"),
    emptySlot: machIcon("pets/empty_slot.png", "IconPetEmptySlot"),
};
