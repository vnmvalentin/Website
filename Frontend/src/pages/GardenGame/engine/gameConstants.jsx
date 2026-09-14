// engine/gameConstants.jsx
// Reine Konstanten, Tabellen und Hilfsfunktionen/-komponenten des Garden-Games —
// ohne jede Abhängigkeit von GameContainer-eigenem State/Refs/Hooks. Rausgezogen
// aus GameContainer.jsx (Sept. 2026), das dadurch Babels 500-KB-Deoptimierungs-
// warnung auslöste. Nichts hier reagiert auf Props oder liest fremden Zustand —
// alles nimmt seine Eingaben explizit entgegen (Argumente/Props), genau wie vorher
// als Modul-Level-Code in GameContainer.jsx. Reihenfolge innerhalb der beiden
// Blöcke unverändert übernommen (spätere Definitionen bauen auf früheren auf).

import { memo, useState } from 'react';
import { Info } from 'lucide-react';
import {
    MAP_CONFIG, TILE_SIZE, STEIN_REIHEN, STEIN_WEG_REIHEN, istWegReihe, istSteinfeldWegRow,
} from './MapConfig';
import { SEED_CATALOGUE, getPlantVisuals, ARCHETYPE_LABELS, getPlantArchetypeKey } from './PlantSystem';
import { PET_ABILITY_TYPES } from './PetSystem';
import { partyTitelIndex } from './Tageszeit';
import { DEKO_KATALOG } from '../ui/deko';
import { ALLE_SKINS } from '../ui/wardrobe';
import { formatGold, formatDuration as formatDurationShared } from '../ui/gardenTokens';
import { ItemIcon } from '../ui/ItemIcon';
import { RarityLabel, PrimaryButton } from '../ui/gardenUi';

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
/**
 * v2-Fundament: Kachel-Sprung statt Dauerbewegung. Ein Tastendruck ist ein
 * einzelner Sprung zur Nachbarkachel — die Radien unten entscheiden, ob die
 * ZIELKACHEL eines Sprungs frei ist (vorher schob dieselbe Tabelle die
 * kontinuierliche Position nachträglich vom Ladenstand weg; siehe Game-Loop).
 * Modul-Konstante statt Objektliteral im Frame: dieselbe Tabelle 60× pro
 * Sekunde neu anzulegen war unnötiger Druck auf den Garbage Collector.
 */
const COLLISION_RADIUS_BY_AREA_TYPE = {
    seed: 130,
    tool: 130,
    egg: 130,
    deco: 130,
    market: 130,
    petMarket: 115,
    // 3×3-Kachel-Gebäude (192×192) — etwas mehr als der halbe Bildradius, damit
    // man nicht bis an die Wand heranläuft.
    shed: 110,
    // Feedback 30.08.: Missionsbrett, 2×2-Kachel-Gebäude (128×128) — dieselbe
    // Marge wie beim Schuppen oben (etwas mehr als der halbe Bildradius).
    questBoard: 75,
};
// Muss zu START_GOLD in Backend/routes/gardenGameRoutes.js passen — der Browser
// zeigt den Wert an, bevor der Server das erste Mal antwortet.
const START_GOLD = 500;
// Wirkung der Gießkanne in MINUTEN nach „Regenmacher"-Stufe (0 = ungelernt), und
// der Deckel je Pflanze. Beides muss zu GIESSKANNE_MINUTEN / GIESSKANNE_MAX_ANTEIL
// in Backend/garden/core/skills.js passen — der Server prüft dieselbe Grenze.
const GIESSKANNE_MINUTEN = [5, 10, 20, 45, 90];
// 1.0 = keine Balancing-Grenze, man darf bis zur Reife wässern. Der Wert bleibt
// bestehen, weil der Server daran prüft, dass nicht bei JEDEM Speichern erneut
// Zeit abgezogen wird — sonst liesse sich unbegrenzt ernten.
const GIESSKANNE_MAX_ANTEIL = 1.0;
const giesskanneMinuten = (stufe) =>
    GIESSKANNE_MINUTEN[Math.max(0, Math.min(GIESSKANNE_MINUTEN.length - 1, Math.floor(Number(stufe) || 0)))];

/**
 * Standorte der Marktwagen auf dem Kiesweg, als Versatz zur Weltmitte.
 *
 * WARUM ALS KONSTANTEN: Die Grundstücksschilder stehen bei ±1024 und ±3072 von der
 * Mitte (Grundstücksbreite 1792 + Abstand 256). Die Wagen werden NACH den
 * Grundstücken gezeichnet und decken deshalb alles ab, was darunter liegt — der
 * Samen-Shop stand bei −920 und damit 104 px neben dem Schild von Feld 2, das
 * dadurch unlesbar war (unten dasselbe mit dem Eier-Shop und Feld 6).
 *
 * Alle Wagen bleiben jetzt innerhalb ±800, also mindestens 220 px von jedem
 * Schild entfernt. Die Werte standen vorher doppelt im Code (Aufbau und
 * updateAreaPositions) und konnten auseinanderlaufen.
 */
const WAGEN_VERSATZ_X = {
    seedShop: -700,
    toolShop: -240,
    eggShop: -700,
    decoShop: -240,
    market: 300,
    petMarket: 760,
    // Missionsbrett (Feedback 31.08.): auf dem Kiesweg wie Markt/Tier-Verkauf
    // (siehe yWagen unten, gleiche Zeile "l.centerY"), aber links von der ganzen
    // Shop-Gruppe statt rechts daneben — deutlicher Abstand zu seedShop/eggShop
    // (-700), die selbst schon 290px breit sind.
    questBoard: -1100,
};
const INCUBATOR_UNLOCK_COSTS = [50000, 500000, 5000000, 50000000]; // slots 2–5
const INTERACT_DIST = 180;
// Frühes Abbiegen (Feedback 28.08.): ab diesem Anteil der Sprungstrecke darf
// eine frisch gedrückte, andere Richtung den laufenden Sprung ablösen — siehe
// versucheSprung im Game-Loop. 0.3 = nach knapp einem Drittel des Sprungs.
const FRUEHES_ABBIEGEN_AB = 0.3;
const SHOP_ROTATION_MS = 5 * 60 * 1000;
const TOOL_EGG_ROTATION_MS = 10 * 60 * 1000;
const TARGET_FPS = 60;
// Muss zu STEIN_REIHEN in engine/MapConfig.js passen (dort steht der Aufbau).
const MAX_PLOT_EXPANSIONS = STEIN_REIHEN;
/**
 * Marke der Rasterumstellung. Der Acker ist eine halbe Kachel nach rechts gerückt,
 * damit er im selben Raster liegt wie die Deko (siehe dirtOffsetX in MapConfig).
 * Läuft genau einmal je Spielstand — deshalb steht die Marke IM Spielstand und nicht
 * im localStorage: sie gehört zu den Daten, nicht zu diesem Browser.
 */
const ACKERRASTER_MARKE = "ackerRaster7";

/**
 * Hintergrundmusik.
 *
 * Zwei Titel zur Auswahl, weil man nach ein paar Stunden Farmen genug von einem hat.
 * Die Wahl steht im localStorage und nicht im Spielstand — sie gehört zu diesem
 * Browser, wie Lautstärke und Render-Qualität auch.
 *
 * Der Party-Titel läuft über DIESELBE Audio-Instanz wie das Thema und liegt damit
 * automatisch am Musikregler. Ein zweites Audio-Objekt daneben hätte seine eigene
 * Lautstärke gebraucht — und wäre bei jeder Reglerbewegung vergessen worden.
 */
const MUSIK_BASIS = "/garden-assets/sounds";
const THEME_TRACKS = [
    { id: "klassisch", name: "Klassisch", src: `${MUSIK_BASIS}/ThemeMusic/theme.mp3` },
    { id: "sunlight", name: "Sunlight on the Barn", src: `${MUSIK_BASIS}/ThemeMusic/Sunlight_On_The_Barn.mp3` },
];
const THEME_STANDARD = THEME_TRACKS[0].id;
/**
 * Die Titel des Party-Events. Welcher läuft, entscheidet die NACHT — nicht der
 * Browser (partyTitelIndex in engine/Tageszeit.js). Alle in derselben Welt hören
 * dadurch dasselbe Lied; ein Zufall pro Browser hätte bei acht Spielern acht
 * verschiedene Titel ergeben, und die Party ist ausdrücklich etwas Gemeinsames.
 */
const PARTY_TRACKS = [
    { id: "solar_rush", name: "Solar Rush", src: `${MUSIK_BASIS}/Party/Solar_Rush.mp3` },
    { id: "pressure_valve", name: "Pressure Valve", src: `${MUSIK_BASIS}/Party/Pressure_Valve.mp3` },
    { id: "steel_and_sweat", name: "Steel and Sweat", src: `${MUSIK_BASIS}/Party/Steel_and_Sweat.mp3` },
    { id: "warehouse_command", name: "Warehouse Command", src: `${MUSIK_BASIS}/Party/Warehouse_Command.mp3` },
];

/** Der Titel dieser Nacht. */
function partyTrack(now) {
    return PARTY_TRACKS[partyTitelIndex(now, PARTY_TRACKS.length)] || PARTY_TRACKS[0];
}

function themeTrack(id) {
    return THEME_TRACKS.find((t) => t.id === id) || THEME_TRACKS[0];
}

/**
 * Metadaten der Seite. Beide Ansichten (Lobby und Spiel) rendern dieselbe Komponente,
 * damit der Reitertitel beim Betreten der Welt nicht wechselt.
 */
const FARM_SEO = {
    title: "Virtual Farm",
    description: "Virtual Farm: Farmspiel im Browser mit gemeinsamer Welt — pflanzen, ernten, Grundstück ausbauen, Tiere ausbrüten und den Garten einrichten. Kostenlos, ohne Download.",
    path: "/garden",
};
const WORLD_BOOT_MIN_MS = 700;
// Feedback 01.09.: "Lobby-Größe von 8 auf 6 reduzieren (3 Farmen oben, 3 unten)" —
// war vorher 8. Muss zu MAX_SLOTS in Backend/garden/world/lobby.js UND dem
// Default-Argument von generatePlotSlots (engine/MapConfig.js) passen.
const WORLD_SLOTS = 6; // dauerhafte Welt: immer 6 Grundstücke, 3 pro Reihe
// Wer den Admin-Knopf im HUD sieht. Reine Anzeige — jede Änderung prüft der Server
// noch einmal gegen STREAMER_TWITCH_ID (Backend/routes/adminRoutes.js).
const GARTEN_ADMIN_ID = "160224748";
/**
 * Dämpfer für shotgun.mp3. Die Aufnahme ist um ein Vielfaches lauter ausgesteuert
 * als alles andere im Spiel — ungedämpft reisst sie jedem mit aufgedrehtem Ton
 * den Kopf ab. Der Wert wird wie bei allen Klängen noch mit der Effektlautstärke
 * aus den Einstellungen multipliziert.
 */
const SHOTGUN_LAUTSTAERKE = 0.12;
/**
 * Was die MITSPIELER in der Hand des Admins sehen. Nur die Felder, die
 * sanitizeHeld in Backend/garden/world/lobby.js durchlässt — alles andere wirft
 * der Server ohnehin weg.
 */
const SHOTGUN_HAND_ITEM = {
    name: "Shotgun",
    image: "/garden-assets/world/shotgun-removebg-preview.png",
    _type: "tool",
};
// Näher an der Farm dran: Pflanzen erscheinen deutlich größer, ohne dass die Welt
// wächst. Zusammen mit den schmaleren Wuchsformen gibt das den ruhigeren Blick.
const WORLD_ZOOM = 1.4;
// Mausrad: rauszoomen, um die Nachbarn zu sehen, reinzoomen für Details. Der Wert
// liegt in einem Ref, nicht im State — das Rad soll nicht bei jeder Raste den
// kompletten Baum neu rendern (dieselbe Überlegung wie beim Hover-Store).
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.2;
const ZOOM_SCHRITT = 1.12;   // pro Rastung; multiplikativ, damit es sich gleichmäßig anfühlt

// Tier-Plätze auf dem eigenen Grundstück. Die ersten drei sind geschenkt, die
// restlichen kosten — bewusst im Bereich der teuersten Samen, damit sie ein Ziel
// fürs späte Spiel bleiben und nicht nebenbei abfallen.
// Fassungsvermögen der beiden Ablagen — muss zu KISTE_MAX/VITRINE_MAX in
// Backend/garden/core/economy.js passen (dort wird es durchgesetzt).
const KISTE_MAX = 100;
const VITRINE_MAX = 12;

/**
 * Drei Fähigkeiten, drei Plätze — fest, nicht mehr kaufbar.
 *
 * Bis August 2026 waren drei weitere Plätze zu haben (150 Mio / 600 Mio / 1,8 Mrd).
 * Seit je Fähigkeit nur die HÖCHSTE platzierte Stufe zählt, hatten die genau eine
 * Wirkung übrig: mehr Goldfinder nebeneinander. Ein zweiter Gärtner oder
 * Erntehelfer bringt nichts. Damit waren die oberen Plätze wieder das, was der
 * Tier-Umbau gerade abgeschafft hatte — „mehr Tiere = mehr passives Einkommen".
 *
 * Nebenbei war `petSlots` das einzige Kaufgut, das im BROWSER stand (in
 * toolInventory) und sich damit fälschen liess. Eine feste Zahl kann man nicht
 * fälschen.
 *
 * Gekauftes Gold kommt zurück und überzählige Tiere wandern in den Rucksack —
 * siehe Backend/garden/migrations/tierplaetze.js.
 */
const PET_SLOTS = 3;

/**
 * Weltkoordinaten der vier Grundstücks-Gebäude. Wird an zwei Stellen gebraucht:
 * für das eigene Grundstück (engine.areas) und für die Gebäude der anderen, die
 * jeder in seiner Welt sehen soll. Eine gemeinsame Funktion, damit beide Seiten
 * nicht auseinanderlaufen.
 *
 * Jede Stelle liefert ZWEI Y-Werte:
 *   y      Mitte der belegten 1×1-Kachel — Kollision, Näheprüfung, Kachelgrenzen.
 *   fussY  Unterkante derselben Kachel. Darauf steht das Bild (Renderer).
 * Vorher wurde das Bild auf `y` zentriert; bei einem 100 px hohen trash.png hing es
 * damit knapp 20 px UNTER seiner Kachel und ragte am unteren Grundstücksrand auf den
 * Steinweg hinaus. Mit dem Fußpunkt steht jedes Gebäude sauber auf seinem Feld.
 */
// Kachel-Fußabdruck des Schuppens — war 2×2, Feedback 30.08.: "sieht ziemlich
// klein aus für ein Gebäude", jetzt 3×3. Eigene Konstante statt einer
// verstreuten Zahl, falls er später noch einmal wächst oder schrumpft.
const SCHUPPEN_KACHELN = 3;

function berechneGebaeudePositionen(slot, versatz) {
    const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
    // "Rechts auf der Wegseite neben dem Acker" (Feedback 29.08.): derselbe Punkt,
    // an dem vorher Inkubator/Mülleimer standen — die Mitte des Grasstreifens
    // zwischen dem rechten Ackerrand und der Grundstücksgrenze.
    const rechteMitte = Math.round(
        (slot.x + MAP_CONFIG.dirtOffsetX + MAP_CONFIG.baseDirtWidth + slot.x + MAP_CONFIG.territoryWidth) / 2,
    );
    // `anchorY` liegt IMMER am Kiesweg — bei der oberen Reihe ist das die Unterkante
    // des Grundstücks, bei der unteren die Oberkante. Der Standardplatz gehört in
    // beiden Fällen an dieses Ende, denn von dort kommt man auf sein Grundstück.
    const zumWeg = slot.isTopRow ? -1 : 1;
    const standardY = slot.anchorY + zumWeg * 120;

    const schuppenPx = SCHUPPEN_KACHELN * TILE_SIZE;
    if (!versatz?.shed || !Number.isFinite(versatz.shed.tx) || !Number.isFinite(versatz.shed.ty)) {
        // Standardplatz: Mittelpunkt vorgegeben, der Fuß sitzt eine halbe
        // Schuppenhöhe darunter (derselbe Bezug wie bei einem Kachel-Versatz).
        return { shed: { x: rechteMitte, y: standardY, fussY: Math.round(standardY + schuppenPx / 2) } };
    }
    const v = versatz.shed;
    const kachelOben = drawY + v.ty * TILE_SIZE;
    return {
        shed: {
            x: Math.round(slot.x + v.tx * TILE_SIZE + schuppenPx / 2),
            y: Math.round(kachelOben + schuppenPx / 2),
            fussY: Math.round(kachelOben + schuppenPx),
        },
    };
}

/**
 * Standort des Schuppens als Kachel-Versatz (obere linke Ecke seines 2×2-
 * Fußabdrucks) zum eigenen Grundstück. Alles Unplausible wird zu null — dann
 * greift wieder der Standardplatz.
 */
function normalizeGebaeudeVersatz(roh) {
    const tx = Number(roh?.shed?.tx);
    const ty = Number(roh?.shed?.ty);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return { shed: null };
    // "- (SCHUPPEN_KACHELN - 1)": beide Kacheln des Fußabdrucks müssen im
    // Grundstück bleiben, nicht nur die obere linke.
    const maxX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE) - SCHUPPEN_KACHELN;
    const maxY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE) - SCHUPPEN_KACHELN;
    if (tx < 0 || tx > maxX || ty < 0 || ty > maxY) return { shed: null };
    return { shed: { tx: Math.round(tx), ty: Math.round(ty) } };
}
// Etwas kleiner als INTERACT_DIST (180), aber groß genug, dass der eigene Kasten
// direkt nach „Meine Farm" ansprechbar ist — dort steht man rund 130 Einheiten entfernt.
const MAILBOX_INTERACT_DIST = 150;

// Muss zu CHAT_MAX_LEN in Backend/garden/world/lobby.js passen: der Server kürzt
// ohnehin, das Eingabefeld soll nur nicht mehr annehmen, als ankommt.
const CHAT_MAX_LEN = 200;

// Chat-Textfarbe (Feedback 01.09.: "Farbe auswählen können") — feste Palette statt
// freier Farbwahl. MUSS zu CHAT_FARBEN in Backend/garden/world/lobby.js passen,
// sonst zeigt der Wähler eine Farbe an, die der Server wieder verwirft.
const CHAT_FARBEN = [
    { id: "rot", hex: "#f87171" },
    { id: "orange", hex: "#fb923c" },
    { id: "gelb", hex: "#facc15" },
    { id: "gruen", hex: "#4ade80" },
    { id: "blau", hex: "#60a5fa" },
    { id: "violett", hex: "#c084fc" },
    { id: "rosa", hex: "#f472b6" },
];

// Chat-Emoji-Feld (Feedback 01.09.) — eine kleine kuratierte Auswahl statt einer
// vollen Emoji-Bibliothek: reicht für ein Spiel-Weltchat, ohne eine neue
// Abhängigkeit reinzuziehen.
const CHAT_EMOJIS = [
    "😀", "😂", "😍", "😎", "🤔", "😢", "😡", "🥳",
    "👍", "👎", "❤️", "🔥", "🎉", "✨", "💀", "👀",
    "🌱", "🌻", "🍅", "🥕", "🐔", "🐷", "☀️", "🌧️",
    "💰", "🏆", "⚔️", "🎯",
];

// So viele Klicks pro Feld dürfen sich stapeln, während eine Ernte unterwegs ist.
// Genug für die größte Staude (8 Fruchtstände); alles darüber ist Gehämmer und
// würde nur Absagen erzeugen.
// Höchstens so viele Ernten dürfen für EINE Zelle angestellt sein. Muss zum
// grössten `maxFruits` im Katalog passen (Orange: 11) — sonst bleibt an einer voll
// behangenen Staude bei jedem Durchgang ein Rest hängen.
const ERNTE_WARTESCHLANGE_MAX = 12;

// ─── Sortierung für Shop und Inventar ────────────────────────────────────────
// Der Samen-Shop kam bisher fest nach Seltenheit und Preis vom Server, das Inventar
// in Einfügereihenfolge. Bei 57 Arten und 50+ Plätzen sucht man sich damit einen Wolf.
const RARITAETS_RANG = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
const nachText = (a, b) => String(a || "").localeCompare(String(b || ""), "de");

/** Katalog einmal nach seedId aufschlüsseln — sonst sucht jeder Vergleich neu. */
const KATALOG_NACH_ID = new Map(SEED_CATALOGUE.map((s) => [s.id, s]));

/**
 * Sekunden bis zur ERSTEN Ernte — die einzige Zahl, mit der sich Einmalernten und
 * Dauerträger sinnvoll vergleichen lassen.
 *
 *   Einmalernte  Mitte der Wachstumsspanne (growMin..growMax wird ausgewürfelt).
 *   Dauerträger  Aufbau der Staude PLUS ein Fruchtzyklus — vorher hängt nichts dran
 *                (siehe createFruitSlot: der erste Stand startet ab structureReadyAt).
 *
 * Unbekannte Arten landen ans Ende statt vorne.
 */
function zeitBisErsteErnte(seed) {
    const p = KATALOG_NACH_ID.get(seed?.seedId);
    if (!p) return Number.MAX_SAFE_INTEGER;
    return p.singleUse
        ? ((p.growMinSec || 0) + (p.growMaxSec || 0)) / 2
        : (p.structureGrowSec || 0) + (p.fruitCycleSec || 0);
}

const SHOP_SORTIERUNGEN = [
    { key: "standard", label: "Seltenheit", vergleich: (a, b) => (RARITAETS_RANG[a.rarity] ?? 0) - (RARITAETS_RANG[b.rarity] ?? 0) || (a.shopPrice || 0) - (b.shopPrice || 0) },
    { key: "preis_auf", label: "Preis ↑", vergleich: (a, b) => (a.shopPrice || 0) - (b.shopPrice || 0) },
    { key: "preis_ab", label: "Preis ↓", vergleich: (a, b) => (b.shopPrice || 0) - (a.shopPrice || 0) },
    { key: "dauer_auf", label: "Dauer ↑", vergleich: (a, b) => zeitBisErsteErnte(a) - zeitBisErsteErnte(b) },
    { key: "dauer_ab", label: "Dauer ↓", vergleich: (a, b) => zeitBisErsteErnte(b) - zeitBisErsteErnte(a) },
    // Dauerträger zuerst, innerhalb der Gruppe wie im Standard nach Seltenheit und Preis.
    {
        key: "art",
        label: "Art",
        vergleich: (a, b) => (a.singleUse === false ? 0 : 1) - (b.singleUse === false ? 0 : 1)
            || (RARITAETS_RANG[a.rarity] ?? 0) - (RARITAETS_RANG[b.rarity] ?? 0)
            || (a.shopPrice || 0) - (b.shopPrice || 0),
    },
    { key: "name", label: "Name", vergleich: (a, b) => nachText(a.name, b.name) },
];

const INVENTAR_SORTIERUNGEN = [
    { key: "standard", label: "Zuletzt", vergleich: () => 0 },
    { key: "wert", label: "Wert ↓", vergleich: (a, b) => (Number(b.sellValue) || 0) - (Number(a.sellValue) || 0) },
    { key: "groesse", label: "Größe ↓", vergleich: (a, b) => (Number(b.size) || 0) - (Number(a.size) || 0) },
    { key: "seltenheit", label: "Seltenheit", vergleich: (a, b) => (RARITAETS_RANG[b.rarity] ?? 0) - (RARITAETS_RANG[a.rarity] ?? 0) },
    { key: "name", label: "Name", vergleich: (a, b) => nachText(a.customName || a.name, b.customName || b.name) },
];

/** Stabil sortieren — „Zuletzt" muss die Einfügereihenfolge unangetastet lassen. */
function sortiere(liste, optionen, key) {
    const gewaehlt = optionen.find((o) => o.key === key);
    if (!gewaehlt || gewaehlt.key === "standard") return liste;
    return liste.map((eintrag, i) => ({ eintrag, i }))
        .sort((a, b) => gewaehlt.vergleich(a.eintrag, b.eintrag) || a.i - b.i)
        .map((x) => x.eintrag);
}

/** Schmale Reiterleiste über der Liste. */
function SortierLeiste({ wert, setzen, optionen }) {
    return (
        <div className="flex flex-wrap items-center gap-1 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-600 mr-1">Sortierung</span>
            {optionen.map((o) => (
                <button
                    key={o.key}
                    type="button"
                    onClick={() => setzen(o.key)}
                    className={`px-2 py-1 rounded-xl border text-[10px] font-medium transition-colors ${
                        wert === o.key
                            ? "border-violet-600 bg-violet-600/20 text-violet-200"
                            : "border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}


// [R] SPIEGELT die Deko, es dreht sie nicht.
//
// Vorher gab es zwei Wege nebeneinander: Objekte mit `spin` drehten sich in 90°-Schritten,
// alle anderen schalteten durch vier Ansichten. Beides ändert bei 90°/270° bzw. bei den
// Seitenansichten den Fußabdruck — aus einer 1×2-Laterne wurde eine 2×1. Derselbe Klick
// setzte das Objekt damit je nach Ausrichtung woandershin, was beim Platzieren wie Zufall
// aussah. Spiegeln lässt den Fußabdruck unangetastet: der Klick bedeutet immer dasselbe.

const DEFAULT_TOOL_INVENTORY = {
    pickaxeUses: 0,
    pickaxesBought: 0, // 7. ANPASSUNG
    hasShovel: false,
    backpackUpgraded: false,
    backpackLevel: 0,
    plantPots: 0,
    wateringCans: 0,

    hasChest: false,
    hasVitrine: false,
};
const BASE_DIRT_COLS = Math.round(MAP_CONFIG.baseDirtWidth / TILE_SIZE);
const BASE_DIRT_ROWS = Math.round(MAP_CONFIG.baseDirtHeight / TILE_SIZE);
const AREA_IMAGES = {
    seedShop: "/garden-assets/world/seed_shop.png",
    toolShop: "/garden-assets/world/tool_shop.png",
    eggShop: "/garden-assets/world/egg_shop.png",
    decoShop: "/garden-assets/world/deco_shop.png",
    market: "/garden-assets/world/market.png",
    petMarket: "/garden-assets/world/pet_market.png",
    // Feedback 30.08.: Missionsbrett — Bild kommt noch (Holzschild). Bis dahin
    // greift derselbe Notbild-Weg wie beim Schuppen vor seinem echten Bild
    // (_drawAreaBuilding zeichnet ohne Bild einen Farbfleck mit Emoji, siehe
    // Renderer.js).
    questBoard: "/garden-assets/world/quest_board.png",
    // v2 (Feedback 29.08.): Kiste, Vitrine und Mülleimer standen als DREI eigene
    // Gebäude auf dem Grundstück (Inkubator kam schon vorher weg, siehe HUD-
    // Aufräumung) — jetzt EIN Schuppen (2×2 Kacheln), der Auswahl per E-Taste
    // anbietet. Kein eigenes Bild mehr für Kiste/Vitrine/Mülleimer nötig.
    shed: "/garden-assets/world/shed.png",
};
/** Beschriftung des umstellbaren Schuppens — Meldungen und Hinweisbanner. */
const GEBAEUDE_NAMEN = {
    shed: "Schuppen",
};
/**
 * Was von einem FREMDEN Grundstück gezeichnet wird. Nur die Vitrine ist anlaufbar —
 * sie ist zum Herzeigen da — und erscheint deshalb (als Schuppen) nur, wenn der
 * Nachbar überhaupt eine Vitrine besitzt. Kiste und Mülleimer gehen niemanden
 * außer dem Besitzer etwas an und bekommen deshalb keinen eigenen Eintrag.
 */
const FREMDE_GEBAEUDE = [
    { key: "vitrine", type: "fremdeVitrine", name: "Vitrine", anlaufbar: true },
];
const TOOL_IMAGE_BY_KEY = {
    pickaxe: "/garden-assets/tools/spitzhacke.png",
    shovel: "/garden-assets/tools/schaufel.png",
    pot: "/garden-assets/tools/topf.png",
    watering: "/garden-assets/tools/gieskanne.png",
    backpack: "/garden-assets/tools/rucksack.png",
    // Spiegel von TOOL_IMAGE_BY_KEY in engine/Renderer.js.
    shotgun: "/garden-assets/world/shotgun-removebg-preview.png",
};
const TOOL_IMAGE_BY_ID = {
    pickaxe: TOOL_IMAGE_BY_KEY.pickaxe,
    shovel: TOOL_IMAGE_BY_KEY.shovel,
    plant_pot: TOOL_IMAGE_BY_KEY.pot,
    watering_can: TOOL_IMAGE_BY_KEY.watering,
    backpack_upgrade: TOOL_IMAGE_BY_KEY.backpack,
    // Im Shop dasselbe Bild wie später auf dem Grundstück — man kauft sichtbar
    // das, was danach dort steht, statt eines Ersatz-Emojis. Kiste und Vitrine
    // stehen seit dem Schuppen-Umbau nicht mehr einzeln auf dem Feld, zeigen im
    // Shop aber weiterhin den Schuppen, der sie dann beherbergt.
    chest: AREA_IMAGES.shed,
    vitrine: AREA_IMAGES.shed,
};
const TERRAIN_ASSET_IMAGES = [
    "/garden-assets/structure/gras1.png",
    "/garden-assets/structure/gras2.png",
    "/garden-assets/structure/hohes_gras1.png",
    "/garden-assets/structure/hohes_gras2.png",
    "/garden-assets/structure/kiesweg1.png",
    "/garden-assets/structure/kiesweg2.png",
    "/garden-assets/structure/acker.png",
    "/garden-assets/structure/stein.png",
    "/garden-assets/structure/wood.png",
];
const PET_IMAGE_BY_TYPE = {
    Huhn: "/garden-assets/animals/huhn.png",
    Ente: "/garden-assets/animals/ente.png",
    Schwein: "/garden-assets/animals/schwein.png",
    Katze: "/garden-assets/animals/katze.png",
    "Waschbär": "/garden-assets/animals/waschbaer.png",
    Kuh: "/garden-assets/animals/kuh.png",
    Schaf: "/garden-assets/animals/schaf.png",
    Ziege: "/garden-assets/animals/ziege.png",
    Pferd: "/garden-assets/animals/pferd.png",
    Esel: "/garden-assets/animals/esel.png",
    Hund: "/garden-assets/animals/hund.png",
    Einhorn: "/garden-assets/animals/einhorn.png",
    // Umlaute MÜSSEN hier stehen: die automatische Ableitung zerlegt "ö" zu "o"
    // und käme auf phonix.png / gotterwesen.png — die Dateien heißen aber
    // phoenix.png / goetterwesen.png. Ohne Eintrag wären beide Tiere unsichtbar.
    "Phönix": "/garden-assets/animals/phoenix.png",
    "Götterwesen": "/garden-assets/animals/goetterwesen.png",
    Tiger: "/garden-assets/animals/tiger.png",
    Drache: "/garden-assets/animals/drache.png",
};
const WEATHER_BY_ROLL = [
    { max: 0.7, type: "sun", label: "Sonne" },
    { max: 0.775, type: "rain", label: "Regen" },
    { max: 0.85, type: "snow", label: "Schnee" },
    { max: 0.925, type: "thunder", label: "Donner" },
    { max: 1, type: "moonlight", label: "Mondschein" },
];
const DEFAULT_RENDER_PROFILE = {
    level: "medium",
    particleScale: 0.75,
    simplifyPlantUi: false,
};
const RENDER_QUALITY_PRESETS = {
    low: { level: "low", particleScale: 0.45, simplifyPlantUi: true },
    medium: { level: "medium", particleScale: 0.75, simplifyPlantUi: false },
    high: { level: "high", particleScale: 1, simplifyPlantUi: false },
};

/**
 * Spiegel von EGG_SHOP_CATALOGUE in Backend/routes/gardenGameRoutes.js.
 *
 * `level` je Eintrag ist neu: vorher hing die Fähigkeitsstufe allein an der
 * Seltenheit des EIS, die hatchTable bestimmte nur das Bild. Ein Götterwesen mit
 * 1 % Chance war damit exakt so viel wert wie ein Einhorn mit 40 % — die ganze
 * Spannung des Gacha war Attrappe.
 */
const EGG_SHOP_CATALOGUE = [
    { id: "common_egg", name: "Common Egg", emoji: "🥚", image: "/garden-assets/eggs/common_egg.png", rarity: "COMMON", price: 100000,
      hatchTable: [{ type: "Huhn", chance: 70, level: 1 }, { type: "Ente", chance: 25, level: 1 }, { type: "Schwein", chance: 5, level: 2 }] },
    { id: "uncommon_egg", name: "Uncommon Egg", emoji: "🥚", image: "/garden-assets/eggs/uncommon_egg.png", rarity: "UNCOMMON", price: 2000000,
      hatchTable: [{ type: "Ente", chance: 60, level: 2 }, { type: "Katze", chance: 30, level: 2 }, { type: "Waschbär", chance: 10, level: 3 }] },
    { id: "rare_egg", name: "Rare Egg", emoji: "🥚", image: "/garden-assets/eggs/rare_egg.png", rarity: "RARE", price: 20000000,
      hatchTable: [{ type: "Kuh", chance: 60, level: 3 }, { type: "Schaf", chance: 30, level: 3 }, { type: "Pferd", chance: 10, level: 4 }] },
    { id: "epic_egg", name: "Epic Egg", emoji: "🥚", image: "/garden-assets/eggs/epic_egg.png", rarity: "EPIC", price: 150000000,
      hatchTable: [{ type: "Esel", chance: 55, level: 4 }, { type: "Hund", chance: 30, level: 4 }, { type: "Einhorn", chance: 10, level: 5 }, { type: "Tiger", chance: 5, level: 5 }] },
    // BALANCING Aug 2026: war 800 Mio — muss zu EGG_SHOP_CATALOGUE in
    // Backend/routes/gardenGameRoutes.js passen, dort steht die Begründung.
    // Kein Spiegel-Skript für diese Liste (anders als Samen/Tageszeit) — beide
    // Kopien von Hand gleich halten.
    { id: "legendary_egg", name: "Legendary Egg", emoji: "🥚", image: "/garden-assets/eggs/legendary_egg.png", rarity: "LEGENDARY", price: 15000000000,
      hatchTable: [{ type: "Einhorn", chance: 40, level: 4 }, { type: "Tiger", chance: 30, level: 5 }, { type: "Phönix", chance: 20, level: 5 }, { type: "Drache", chance: 9, level: 5 }, { type: "Götterwesen", chance: 1, level: 5 }] },
];

// Der Deko-Katalog steht in ui/deko.js (und gespiegelt in Backend/garden/core/deko.js):
// er wird auch vom Renderer gebraucht — für die Lichtquellen und dafür, was ein
// Bodenbelag ist. Hier nur noch der vertraute Name.
const DECO_SHOP_ITEMS = DEKO_KATALOG;



// Der Skin-Katalog liegt in ui/wardrobe.js (und gespiegelt im Backend, weil der
// Server die Levelfreischaltung prüft). Hier nur noch die Pfadliste fürs Vorladen.
// Alle Fellfarben und Kostüme der Umkleide, zum Vorladen (siehe unten). Es gibt
// seit Feedback 30.08. keine personengebundenen Skins mehr (siehe wardrobe.js) —
// vorher blieben die hier bewusst aussen vor, das entfällt damit.
const WARDROBE_SKINS = ALLE_SKINS;

const PET_EMOJI_BY_TYPE = {
    Huhn: "🐔",
    Ente: "🦆",
    Schwein: "🐷",
    Katze: "🐈",
    Waschbär: "🦝",
    Kuh: "🐮",
    Schaf: "🐑",
    Phönix: "🐦‍🔥",
    Tiger: "🐯",
    Drache: "🐉",
    Einhorn: "🦄",
    Götterwesen: "👼",
    Tier: "🐾",
};

function getPetEmoji(type) {
    return PET_EMOJI_BY_TYPE[type] || "🐾";
}

function getToolImage(toolIdOrKey) {
    return TOOL_IMAGE_BY_ID[toolIdOrKey] || TOOL_IMAGE_BY_KEY[toolIdOrKey] || null;
}

function getPetSpriteImage(type) {
    if (PET_IMAGE_BY_TYPE[type]) return PET_IMAGE_BY_TYPE[type];
    const slug = String(type || "tier")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
    return slug ? `/garden-assets/animals/${slug}.png` : "/garden-assets/animals/tier.png";
}

function hashToUnit(seed) {
    const s = String(seed || "0");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

function rollWeatherFromRotation(rotationKey) {
    const unit = hashToUnit(`weather:${rotationKey}`);
    return WEATHER_BY_ROLL.find((entry) => unit <= entry.max) || WEATHER_BY_ROLL[0];
}

/**
 * Preis der nächsten Spitzhacke.
 *
 * BALANCING, zweite Korrektur: 100.000 · 1,3^n summierte sich über die 196
 * Steinfelder auf 128 MILLIARDEN — unerreichbar. Meine Gegenmassnahme
 * (40.000 · 1,16^n) landete bei 360 Millionen und war damit das andere Extrem:
 * bei rund 10 Mrd Tageseinkommen im Endspiel ist das ganze Steinfeld in unter
 * einer Minute bezahlt, und die Grundstückserweiterung — eigentlich das grösste
 * dauerhafte Upgrade des Spiels — war geschenkt.
 *
 * 50.000 · 1,26^n trifft die Mitte: rund 15,8 Mrd für alle 49 Hacken, die letzte
 * bei 3,3 Mrd. Das sind etwa anderthalb Tage Endspiel-Einkommen für eine
 * Felderweiterung um 87 % — und die ersten Reihen bleiben mit 50.000 früh
 * erreichbar.
 *
 * BALANCING v2: 1,26 war für ein Steinfeld gedacht, das um zwei weitere Bänder
 * wachsen sollte (dann hätte dieselbe Kurve die letzte Ladung von selbst auf
 * ~1,3 Billionen gezogen). Das Steinfeld bleibt jetzt aber bei 196 Feldern
 * (siehe MapConfig.js) — der Acker wurde stattdessen um eine Bande gekürzt.
 * Damit die letzte Ladung trotzdem in Richtung 1 Billion geht, übernimmt jetzt
 * die Kurve selbst die Arbeit: 1,42^n über dieselben 49 Käufe landet bei
 * n=48 (letzter Kauf) bei ≈ 1,02 Billionen. Muss zu pickaxePreis in
 * garden/core/werkzeug.js passen.
 */
function getPickaxePrice(boughtCount = 0) {
    return Math.floor(50000 * Math.pow(1.42, Math.max(0, boughtCount)));
}

/**
 * Wie viele Steinfelder es überhaupt gibt: STEIN_REIHEN Erweiterungsreihen minus
 * die Holzwege (jede achte, siehe STEIN_WEG_REIHEN in MapConfig.js), mal 15
 * Spalten minus die Wegspalte. Muss zu getHoveredRock und
 * normalizePlotUnlockedCells passen. Mirror von STEINFELDER_GESAMT in
 * garden/core/werkzeug.js (Backend) — dort von Hand nachgezogen.
 */
const STEINFELDER_GESAMT = (STEIN_REIHEN - STEIN_WEG_REIHEN) * (BASE_DIRT_COLS - 1);

/**
 * Vorschaubild eines Tieres. Nutzt das echte Sprite aus /garden-assets/animals/ —
 * vorher wurde hier eine SVG-Grafik mit Emoji gebaut, weshalb im Brutkasten
 * Emojis statt der gezeichneten Tiere standen.
 */
function buildPetPreviewImage(petType) {
    return getPetSpriteImage(petType);
}

function normalizeToolInventory(inv) {
    const merged = {
        ...DEFAULT_TOOL_INVENTORY,
        ...(inv && typeof inv === "object" ? inv : {}),
    };
    const backpackLevel = Number(merged.backpackLevel || (merged.backpackUpgraded ? 1 : 0)) || 0;
    merged.backpackLevel = Math.max(0, backpackLevel);
    merged.backpackUpgraded = merged.backpackLevel > 0;
    // Alte Spielstände kennen das Feld nicht — die bekommen die drei Grundplätze.
    // `petSlots` gibt es nicht mehr (siehe PET_SLOTS). Aus alten Spielständen wird
    // es hier entfernt, damit kein toter Wert mitreist — die Migration erstattet das
    // dafür gezahlte Gold.
    delete merged.petSlots;
    return merged;
}

/**
 * Welche Gegenstände in der Leiste zeigen beim Hovern ihre Karte?
 *
 * Samen standen bisher nicht drin, obwohl der Tooltip längst einen eigenen Zweig
 * für sie hat (Name, Seltenheit, Preis) — er wurde nur nie ausgelöst. Deko kommt
 * mit dazu: dieselbe Karte, dieselbe Frage („was ist das?").
 */
function hatTooltip(item) {
    const art = item?._type;
    return art === "plant" || art === "pet" || art === "seed" || art === "deco";
}

/**
 * Grüner Daumen: eine frisch gesetzte Pflanze wächst schneller.
 *
 * Wirkt nur beim PFLANZEN, nicht rückwirkend auf schon stehende — sonst würde ein
 * später gelernter Punkt reihenweise Beete auf einen Schlag reif machen. Die
 * Fruchtstände legt `ensurePerennialFruitingState` erst nach dem Aufbau an; sie
 * erben den verkürzten Zyklus dann von selbst.
 */
function wachstumBeschleunigen(plant, anteil, now) {
    const faktor = 1 - Math.max(0, Math.min(0.5, anteil));
    if (faktor >= 1 || !plant) return plant;
    if (Number.isFinite(plant.growthMs)) {
        plant.growthMs = Math.max(3000, Math.round(plant.growthMs * faktor));
    }
    if (Number.isFinite(plant.structureReadyAt)) {
        plant.structureReadyAt = now + Math.max(2000, Math.round((plant.structureReadyAt - now) * faktor));
    }
    if (Number.isFinite(plant.structureGrowthMs)) {
        plant.structureGrowthMs = Math.max(2000, Math.round(plant.structureGrowthMs * faktor));
    }
    if (Number.isFinite(plant.fruitCycleMs)) {
        plant.fruitCycleMs = Math.max(2000, Math.round(plant.fruitCycleMs * faktor));
    }
    return plant;
}

/** Erstes freies Ackerfeld — Notnagel, wenn zwei Pflanzen auf dieselbe Kachel fallen. */
function freiesAckerfeld(belegt) {
    for (let y = 0; y < BASE_DIRT_ROWS; y++) {
        for (let x = 0; x < BASE_DIRT_COLS; x++) {
            if (x === 7) continue;                   // senkrechter Weg
            const k = `${x}_${y}`;
            if (!belegt[k]) return k;
        }
    }
    return null;
}

/**
 * Kennung dieses Browser-Tabs. Bewusst ein Modul-Konstante und NICHT im
 * sessionStorage: sie soll je Seitenaufruf neu sein, damit zwei Tabs sich
 * unterscheiden — auch zwei Tabs desselben Fensters.
 *
 * Der Server merkt sich, wer zuletzt gespeichert hat. Damit lässt sich der eigene
 * verspätete Speicherstand (nachreichen ist richtig) von einem zweiten Tab
 * unterscheiden (nachreichen würde dessen Rucksack überschreiben).
 */
const TAB_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Rucksack-Upgrade: +10 Plätze je Stufe.
 *
 * BALANCING: war 25.000 · 1,85^n und mit 15 Stufen (200 Plätze) nach 299 Mio
 * durch — ein Rundungsfehler im Lategame. Schlimmer: der Deckel von 200 Plätzen
 * stand nur serverseitig, `backpackLevel` lief unbegrenzt weiter. Ab Stufe 15
 * kostete jedes Upgrade Millionen UND GAB NICHTS. Danach 25 Stufen bis 300 Plätze
 * mit flacherer Kurve (Vollausbau ~2,1 Mrd) und hartem Deckel im Kaufweg.
 *
 * BALANCING Aug 2026: 25 Stufen waren bei zweistelligem Milliarden-Einkommen
 * (Legendäre + Rainbow + Party + Skillbaum + Tiere) nach wenigen Tagen erledigt —
 * und blieben danach die letzte Stelle im Spiel, an der noch Gold hinging. Jetzt
 * 50 Stufen bis 550 Plätze, dieselbe Formel weitergezogen: Stufe 40 ≈ 821 Mrd,
 * Stufe 49 (letzter Kauf) ≈ 42,4 Billionen. Muss zu BACKPACK_MAX_LEVEL in
 * garden/core/werkzeug.js passen — dort steht dieselbe Rechnung.
 */
const BACKPACK_MAX_LEVEL = 50;
// Buy-All (v2, Punkt 12): Werkzeuge, bei denen "Alle" mehr ist als "Kaufen" —
// Schaufel/Kiste/Vitrine sind Einmalkäufe, dort wäre ein zweiter Knopf nur
// verwirrend.
const BUY_ALL_WERKZEUGE = new Set(["pickaxe", "plant_pot", "watering_can", "backpack_upgrade"]);
function getBackpackUpgradePrice(level = 0) {
    return Math.max(1, Math.floor(20000 * Math.pow(1.55, Math.max(0, level))));
}

function normalizePlotUnlockedCells(cells) {
    if (!Array.isArray(cells)) return [];
    const set = new Set();
    const topMin = -MAX_PLOT_EXPANSIONS;
    const topMax = -1;
    const bottomMin = BASE_DIRT_ROWS;
    const bottomMax = BASE_DIRT_ROWS + MAX_PLOT_EXPANSIONS - 1;
    for (const raw of cells) {
        if (typeof raw !== "string") continue;
        const [xs, ys] = raw.split("_");
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        if (x < 0 || x >= BASE_DIRT_COLS) continue;
        const validY = (y >= topMin && y <= topMax) || (y >= bottomMin && y <= bottomMax);
        if (!validY) continue;
        // Wege gehören nie in die Freigabeliste. Diese Funktion läuft auf JEDEM Weg
        // in den Spielstand — Serverantwort, Reihenwechsel, Spitzhacke —, deshalb
        // sitzt die Klemme hier und nicht an den einzelnen Aufrufern.
        if (x === 7 || istWegReihe(y)) continue;
        set.add(`${x}_${y}`);
    }
    return [...set];
}

/**
 * Rückfall für alte Spielstände, die nur eine ANZAHL Erweiterungsreihen kannten und
 * noch keine Liste einzelner Felder.
 *
 * Die beiden Holzwege und die Wegspalte werden ausgelassen. Vorher waren sie mit
 * dabei: der Rückfall gab die komplette Reihe frei, `getHoveredCell` hielt die
 * Wegkacheln damit für nutzbaren Acker, und man konnte mitten auf den Steg pflanzen —
 * auf Feldern, die sich mit der Spitzhacke nie freilegen lassen.
 */
function unlockedCellsFromLegacyExpansions(expansions, isTopRow = true) {
    const level = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, Number(expansions) || 0));
    const out = [];
    for (let row = 1; row <= level; row++) {
        if (istSteinfeldWegRow(row)) continue;   // Holzwege (jede achte Reihe)
        const y = isTopRow ? -row : (BASE_DIRT_ROWS + row - 1);
        for (let x = 0; x < BASE_DIRT_COLS; x++) {
            if (x === 7) continue;                            // senkrechter Holzweg
            out.push(`${x}_${y}`);
        }
    }
    return normalizePlotUnlockedCells(out);
}

/**
 * Freigelegte Steinfelder aus dem Spielstand.
 *
 * BEWUSST OHNE Prüfung auf die Reihe. Vorher wurde hier fest gegen die obere Reihe
 * gefiltert: wer aus der unteren Reihe kam, verlor damit beim Laden jedes einzeln
 * freigelegte Feld, und aus der bloßen ANZAHL wurden vollständige Reihen neu
 * erfunden — aus drei mühsam freigehackten Feldern wurden drei komplette Reihen.
 * Die Zählweise der Reihe rückt stattdessen der Umzugs-Effekt gerade, sobald der
 * eigene Platz feststeht.
 *
 * Die Ableitung aus `plotExpansions` bleibt als Rückfall für sehr alte Spielstände,
 * die noch gar keine Feldliste hatten.
 */
function resolvePlotUnlockedCells(stateLike) {
    const explicit = normalizePlotUnlockedCells(stateLike?.plotUnlockedCells);
    if (explicit.length > 0) return explicit;
    return unlockedCellsFromLegacyExpansions(stateLike?.plotExpansions, true);
}

/** Tiere können wie Pflanzen golden oder regenbogenfarben schlüpfen. */
function rollPetSpecialType() {
    const roll = Math.random();
    if (roll < 0.01) return "Rainbow";
    if (roll < 0.05) return "Golden";
    return null;
}

function rollHatchResult(egg) {
    const table = Array.isArray(egg?.hatchTable) ? egg.hatchTable : [];

    // Fähigkeit auswürfeln
    const chosenAbility = PET_ABILITY_TYPES[Math.floor(Math.random() * PET_ABILITY_TYPES.length)];
    const rarityMap = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };
    const level = rarityMap[egg?.rarity || "COMMON"] || 1;
    const specialType = rollPetSpecialType();

    if (!table.length) {
        const fallbackType = "Tier";
        const fallbackEmoji = getPetEmoji(fallbackType);
        return {
            type: fallbackType,
            emoji: fallbackEmoji,
            image: getPetSpriteImage(fallbackType),
            previewImage: buildPetPreviewImage(fallbackType, fallbackEmoji),
            ability: { type: chosenAbility, level }
        };
    }
    const roll = Math.random() * 100;
    let acc = 0;
    let treffer = table[0] || { type: "Tier" };
    for (const entry of table) {
        acc += Number(entry?.chance || 0);
        if (roll <= acc) {
            treffer = entry;
            break;
        }
    }
    const chosen = treffer.type || "Tier";
    // Die Stufe kommt jetzt vom geschlüpften TIER, nicht mehr von der Seltenheit
    // des Eies. Der seltene Treffer ist damit auch der stärkere; vorher war die
    // Wahrscheinlichkeit reine Optik. Ohne Angabe gilt weiterhin die Ei-Stufe,
    // damit ältere Sendungen und gespeicherte Eier nichts verlieren.
    const echtesLevel = Math.max(1, Math.min(5, Math.floor(Number(treffer.level) || level)));
    const emoji = getPetEmoji(chosen);
    return {
        type: chosen,
        emoji,
        image: getPetSpriteImage(chosen),
        previewImage: buildPetPreviewImage(chosen),
        specialType,
        ability: { type: chosenAbility, level: echtesLevel },
    };
}

const RARITY_COLORS = {
    COMMON:    { bg: "bg-slate-500",   text: "text-slate-100",   border: "border-slate-400"   },
    UNCOMMON:  { bg: "bg-green-600",   text: "text-green-50",    border: "border-green-400"   },
    RARE:      { bg: "bg-blue-600",    text: "text-blue-50",     border: "border-blue-400"    },
    EPIC:      { bg: "bg-purple-600",  text: "text-purple-50",   border: "border-purple-400"  },
    LEGENDARY: { bg: "bg-amber-500",   text: "text-amber-50",    border: "border-amber-300"   },
    MYTHIC:    { bg: "bg-pink-500",    text: "text-pink-50",     border: "border-pink-300"    },
};

function RarityBadge({ rarity }) {
    const c = RARITY_COLORS[rarity] || RARITY_COLORS.COMMON;
    return (
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
            {rarity}
        </span>
    );
}

function withVisuals(item) {
    if (!item?.seedId) return item;
    const visuals = getPlantVisuals(item.seedId, item.singleUse !== false);
    return {
        ...visuals,
        ...item,
        image: item.image || item.seedImage || item.seedShopImage || item.harvestImage || visuals.seedImage,
        seedImage: item.seedImage || item.seedShopImage || visuals.seedImage,
        seedShopImage: item.seedShopImage || visuals.seedShopImage,
        plantedSeedImage: item.plantedSeedImage || visuals.plantedSeedImage,
        plantedSeedFallbackImage: item.plantedSeedFallbackImage || visuals.plantedSeedFallbackImage,
        growthImage: item.growthImage || visuals.growthImage,
        structureImage: item.structureImage || visuals.structureImage,
        fruitImage: item.fruitImage || visuals.fruitImage,
        harvestImage: item.harvestImage || visuals.harvestImage,
    };
}

/**
 * Dasselbe fuer Samen und Tiere. Beide koennen ohne Bildpfad vom Server kommen —
 * am deutlichsten nach dem Abholen aus dem Briefkasten: die Sendung traegt nur
 * Werte (Art, Seltenheit, Faehigkeit), keine Assets. Ohne diese Ableitung stand
 * im Rucksack des Empfaengers das Ersatz-Emoji statt des Tieres, und auf dem Acker
 * zeichnete der Renderer ebenfalls nur das Emoji.
 *
 * Bewusst wird NICHT der Bildpfad des Absenders uebernommen: der kaeme aus einem
 * fremden Browser und landete ungeprueft in einem <img src>. Die Art reicht — die
 * Pfade stehen ohnehin lokal im Katalog.
 */
function hydratePet(pet) {
    if (!pet?.name) return pet;
    const sprite = getPetSpriteImage(pet.name);
    return {
        ...pet,
        emoji: pet.emoji || getPetEmoji(pet.name),
        image: pet.image || sprite,
        previewImage: pet.previewImage || sprite,
    };
}

function hydratePets(liste) {
    return Array.isArray(liste) ? liste.map(hydratePet) : [];
}

function hydrateSeed(seed) {
    if (!seed?.seedId) return seed;
    const visuals = getPlantVisuals(seed.seedId, seed.singleUse !== false);
    const bild = visuals.seedImage || visuals.seedShopImage || visuals.growthImage;
    return { ...seed, image: seed.image || bild, seedImage: seed.seedImage || bild };
}

function hydrateSeeds(liste) {
    return Array.isArray(liste) ? liste.map(hydrateSeed) : [];
}

function collectVisualAssetPaths(item) {
    if (!item || typeof item !== "object") return [];
    const candidatePaths = [
        item.image,
        item.seedImage,
        item.seedShopImage,
        item.plantedSeedImage,
        item.plantedSeedFallbackImage,
        item.growthImage,
        item.structureImage,
        item.fruitImage,
        item.harvestImage,
    ];
    return candidatePaths.filter((p) => typeof p === "string" && p.length > 0);
}

/** Kennzahlen einer Art fürs Info-Fach im Shop. */
function SeedFacts({ seed, xpJeSorte = null }) {
    const profile = SEED_CATALOGUE.find((s) => s.id === seed.seedId);
    if (!profile) return null;
    const xp = xpJeSorte?.[profile.id] || 0;
    const zeile = (label, wert) => (
        <div className="flex items-center justify-between gap-3 py-0.5">
            <span className="text-slate-400">{label}</span>
            <span className="text-slate-200 font-medium tabular-nums text-right">{wert}</span>
        </div>
    );
    return (
        <div className="mt-2 pt-2 border-t border-slate-800 text-[11px]">
            {profile.singleUse ? (
                <>
                    {zeile("Wachstum", `${formatDurationShared(profile.growMinSec * 1000)} – ${formatDurationShared(profile.growMaxSec * 1000)}`)}
                    {zeile("Ertrag je Ernte", `${formatGold(profile.sellMin)} – ${formatGold(profile.sellMax)}`)}
                    {xp ? zeile("Erfahrung je Ernte", `+${xp} XP`) : null}
                    {zeile("Erntet", "einmal, danach ist das Feld frei")}
                </>
            ) : (
                <>
                    {zeile("Aufbau bis zur ersten Frucht", formatDurationShared(profile.structureGrowSec * 1000))}
                    {zeile("Nachreifen je Frucht", formatDurationShared(profile.fruitCycleSec * 1000))}
                    {zeile("Fruchtstände", `${profile.maxFruits}`)}
                    {zeile("Ertrag je Frucht", `${formatGold(profile.fruitSellMin)} – ${formatGold(profile.fruitSellMax)}`)}
                    {xp ? zeile("Erfahrung je Frucht", `+${xp} XP`) : null}
                    {zeile("Erntet", "dauerhaft, die Pflanze bleibt stehen")}
                </>
            )}
            <p className="text-slate-500 mt-1.5 leading-relaxed">
                Größe und Sonderformen werden beim Wachsen ausgewürfelt; Wetter-Effekte erhöhen
                den Verkaufswert zusätzlich.
            </p>
        </div>
    );
}

const ShopSeedCard = memo(function ShopSeedCard({ seed, onBuy, onBuyAll, canAfford, stock, rucksackVoll, xpJeSorte }) {
    const visualSeed = withVisuals(seed);
    const inactive = !seed.active && seed.active !== undefined;
    const outOfStock = (stock ?? (seed.active ? 1 : 0)) <= 0;
    const clickable = canAfford && !outOfStock && !inactive && !rucksackVoll;
    const archetype = ARCHETYPE_LABELS[getPlantArchetypeKey(seed.seedId)] || "Pflanze";
    const [showFacts, setShowFacts] = useState(false);
    // Warum ein Kauf gerade nicht geht — steht dort, wo sonst „Kaufen" steht.
    // „Rucksack voll" gehört dazu: vorher blieb die Zeile klickbar und jeder Klick
    // lief in eine Meldung, die nach 2,5 s wieder weg war. Wer fünfzehn Kürbisse
    // kaufen wollte und nur acht Plätze frei hatte, sah acht Käufe und danach
    // scheinbar nichts mehr passieren.
    // „Ausverkauft" wäre irreführend: der Vorrat gilt je Spieler, niemand hat einem
    // etwas weggekauft. Aufgebraucht ist das eigene Kontingent dieser Rotation.
    const hinderung = inactive ? "Nicht im Angebot"
        : outOfStock ? "Ausverkauft"
            : rucksackVoll ? "Rucksack voll"
                : !canAfford ? "Zu teuer" : null;
    return (
        <div
            // Cartoon-Überarbeitung 30.08. ("Shop soll aussehen wie die anderen Shops
            // mit dem Kaufen-Knopf"): dieselbe Zeilen-Form wie Werkzeug-/Ei-/Deko-Shop
            // — eine schlichte Zeile mit einem eigenen PrimaryButton rechts, statt die
            // ganze Zeile selbst als Knopf zu verkleiden. Vorher war der Samen-Shop der
            // einzige mit einem eigenen violetten Umriss-Knopf statt des gemeinsamen
            // grünen Kaufen-Knopfs.
            className={`w-full p-3 rounded-2xl border bg-slate-900/50 transition-colors ${
                inactive
                    ? "border-slate-800 opacity-50"
                    : clickable
                        ? "border-slate-800 hover:border-violet-500"
                        : "border-slate-800"
            }`}
        >
        <div className="flex gap-3 items-center">
            <ItemIcon item={visualSeed} className="w-11 h-11 shrink-0" emojiClassName="text-3xl" />
            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{seed.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                    <RarityLabel rarity={seed.rarity} />
                    <span className="text-xs text-slate-300 truncate">
                        {archetype} · {seed.singleUse ? "Einmalernte" : "Dauerträger"}
                    </span>
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className={`text-sm font-bold tabular-nums ${inactive ? "text-slate-500" : canAfford ? "text-amber-300" : "text-slate-400"}`}>
                    {formatGold(seed.shopPrice)}
                </div>
                {/* „Ausverkauft" und „Nicht im Angebot" stehen jetzt im Kaufknopf —
                    hier bleibt nur der Bestand, damit nichts doppelt dasteht. */}
                {seed.active && !outOfStock && (
                    <div className="text-xs mt-0.5 text-slate-300">noch {stock} für dich</div>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {/* Buy-All (v2, Punkt 12): ein Request statt Kaufen im Sekundentakt
                    wegklicken. Nur da, wo überhaupt gekauft werden kann — sonst stünde
                    ein zweiter gesperrter Knopf neben dem ersten, ohne etwas zu
                    erklären, das der Haupt-Knopf nicht schon sagt. */}
                {clickable && (
                    <button
                        type="button"
                        onClick={() => onBuyAll(seed)}
                        title="So viele kaufen, wie Vorrat und Gold hergeben"
                        className="shrink-0 px-2.5 py-2 rounded-2xl text-xs font-semibold border border-slate-700 text-slate-300 hover:border-violet-500 hover:text-violet-200 transition-colors"
                    >
                        Alle
                    </button>
                )}
                <PrimaryButton onClick={() => onBuy(seed)} disabled={!clickable}>
                    {hinderung || "Kaufen"}
                </PrimaryButton>
                {/* Eigener Knopf neben der Kaufaktion — nicht darin verschachtelt,
                    damit ein Klick auf die Details nicht sofort kauft. */}
                <button
                    type="button"
                    aria-label="Details anzeigen"
                    aria-expanded={showFacts}
                    onClick={() => setShowFacts((v) => !v)}
                    className={`shrink-0 w-8 h-8 rounded-2xl border flex items-center justify-center transition-colors ${
                        showFacts
                            ? "border-violet-500 text-violet-300"
                            : "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                    }`}
                >
                    <Info size={15} />
                </button>
            </div>
        </div>
        {showFacts && <SeedFacts seed={seed} xpJeSorte={xpJeSorte} />}
        </div>
    );
});


export {
    TwitchGlyph, COLLISION_RADIUS_BY_AREA_TYPE, START_GOLD, GIESSKANNE_MINUTEN, GIESSKANNE_MAX_ANTEIL, giesskanneMinuten, WAGEN_VERSATZ_X, INCUBATOR_UNLOCK_COSTS, INTERACT_DIST, FRUEHES_ABBIEGEN_AB, SHOP_ROTATION_MS, TOOL_EGG_ROTATION_MS, TARGET_FPS, MAX_PLOT_EXPANSIONS, ACKERRASTER_MARKE, MUSIK_BASIS, THEME_TRACKS, THEME_STANDARD, PARTY_TRACKS, partyTrack, themeTrack, FARM_SEO, WORLD_BOOT_MIN_MS, WORLD_SLOTS, GARTEN_ADMIN_ID, SHOTGUN_LAUTSTAERKE, SHOTGUN_HAND_ITEM, WORLD_ZOOM, ZOOM_MIN, ZOOM_MAX, ZOOM_SCHRITT, KISTE_MAX, VITRINE_MAX, PET_SLOTS, SCHUPPEN_KACHELN, berechneGebaeudePositionen, normalizeGebaeudeVersatz, MAILBOX_INTERACT_DIST, CHAT_MAX_LEN, CHAT_FARBEN, CHAT_EMOJIS, ERNTE_WARTESCHLANGE_MAX, RARITAETS_RANG, nachText, KATALOG_NACH_ID, zeitBisErsteErnte, SHOP_SORTIERUNGEN, INVENTAR_SORTIERUNGEN, sortiere, SortierLeiste, DEFAULT_TOOL_INVENTORY, BASE_DIRT_COLS, BASE_DIRT_ROWS, AREA_IMAGES, GEBAEUDE_NAMEN, FREMDE_GEBAEUDE, TOOL_IMAGE_BY_KEY, TOOL_IMAGE_BY_ID, TERRAIN_ASSET_IMAGES, PET_IMAGE_BY_TYPE, WEATHER_BY_ROLL, DEFAULT_RENDER_PROFILE, RENDER_QUALITY_PRESETS, EGG_SHOP_CATALOGUE, DECO_SHOP_ITEMS, WARDROBE_SKINS, PET_EMOJI_BY_TYPE, getPetEmoji, getToolImage, getPetSpriteImage, hashToUnit, rollWeatherFromRotation, getPickaxePrice, STEINFELDER_GESAMT, buildPetPreviewImage, normalizeToolInventory, hatTooltip, wachstumBeschleunigen, freiesAckerfeld, TAB_ID, BACKPACK_MAX_LEVEL, BUY_ALL_WERKZEUGE, getBackpackUpgradePrice, normalizePlotUnlockedCells, unlockedCellsFromLegacyExpansions, resolvePlotUnlockedCells, rollPetSpecialType, rollHatchResult, RARITY_COLORS, RarityBadge, withVisuals, hydratePet, hydratePets, hydrateSeed, hydrateSeeds, collectVisualAssetPaths, SeedFacts, ShopSeedCard
};
