// GameContainer.jsx
// Smooth WASD movement, diagonal support, plant system, shop UI, lobby awareness

import React, { memo, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
// Feedback 30.08.: "eigene Icons statt emojis ... statt lucide" — wo unten ein
// eigenes Bild existiert (HudIcon/TabIcon aus gameIcons.jsx), ersetzt es die
// frühere lucide-Komponente an GENAU der Stelle, die im Icon Atlas dafür vorgesehen
// war. Nachlieferung 30.08.: Editor (LayoutGrid), Umkleide (Shirt), Logbuch-Knopf
// (ScrollText) und die Vitrine im Schuppen (Trophy) haben jetzt ebenfalls eigene
// Bilder — alle vier lucide-Importe dafür sind komplett raus. Nachlieferung 31.08.:
// der Gold-Shop-Knopf (Gem) hat jetzt ebenfalls ein eigenes Bild (HudIcon.goldShop) —
// auch dieser Import ist raus. Was hier bleibt, hat (noch) kein eigenes Bild: Sprout
// (Logo/Erste-Schritte), FlaskConical (Beta-Marke), Play, Package (nur noch der leere
// Ei-Platz — "Kiste" im Schuppen ist jetzt HudIcon.kiste), Info, Search (Zoom-Anzeige
// — das gelieferte Bild ist erkennbar fürs Logbuch gezeichnet), MapPin (Standort-
// Marker in der Online-Liste), SlidersHorizontal (Admin), Send (Chat — das gelieferte
// Bild ist erkennbar fürs Postfach gezeichnet), Smile (neuer Emoji-Knopf im Chat,
// Feedback 01.09. — kein eigenes Bild dafür geliefert).
import {
    Sprout, FlaskConical, Play, Info, 
    
} from "lucide-react";
import { HudIcon, TabIcon } from './ui/gameIcons';
import { MAILBOX_RESKIN_BILD } from './engine/Renderer';
import { versionedAsset } from './engine/assetVersion';
import { generatePlotSlots, TILE_SIZE, MAP_CONFIG, getDirtCellWorldPos, STEIN_REIHEN, STEIN_WEG_REIHEN, istSteinfeldWegRow, istWegReihe } from './engine/MapConfig';
// harvestPlant und getGoldfinderRange stehen bewusst nicht mehr hier: diese
// Rechnungen macht ab v3.0 der Server (garden/core/economy).
import {
    getPlantVisuals,
    WEATHER_SELL_BOOST, ARCHETYPE_LABELS, getPlantArchetypeKey,
    STATUS_EFFECT_LABELS, SEED_CATALOGUE, hydrateHarvestedItems, 
    setzeVielfaltFaktor,
} from './engine/PlantSystem';
import {
    PET_ABILITY_TYPES, PET_ABILITY_KURZ, getPetTickMs,
    
} from './engine/PetSystem';
import {
    partyStand, partyStaerke, uhrzeit as spielUhrzeit,
    istNacht, partyTitelIndex, saisonStand, erntefestZeitraum,
} from './engine/Tageszeit';
import SEO from '../../components/SEO';
import GardenMenu from './ui/menu/GardenMenu';
import Ladebildschirm from './ui/menu/Ladebildschirm';
import PlantHoverLayer from './ui/PlantHoverLayer';
import { createHoverStore } from './ui/hoverStore';
import MailboxModal from './ui/MailboxModal';
import LogbuchModal from './ui/LogbuchModal';
import SkillTreeModal from './ui/SkillTreeModal';
import WardrobeModal from './ui/WardrobeModal';
import QuestBoardModal from './ui/QuestBoardModal';
import GoldShopModal from './ui/GoldShopModal';
import { SHED_RESKIN_BILD } from './ui/reskins';
import { ALLE_SKINS, STANDARD_SKIN, normalisiereSkin } from './ui/wardrobe';
import { DEKO_KATALOG, DEKO_KATEGORIEN, istBoden } from './ui/deko';
import useGardenLobby, { letzteWelt, vergissWelt } from './useGardenLobby';
import useFarmSound from './hooks/useFarmSound';
import useWorldBoot from './hooks/useWorldBoot';
import useNachfrage from './hooks/useNachfrage';
import useLadenRotation from './hooks/useLadenRotation';
import useWetterUndUhr from './hooks/useWetterUndUhr';
import useTastatur from './hooks/useTastatur';
import useSpeichern from './hooks/useSpeichern';
import useAckerUmzug from './hooks/useAckerUmzug';
import useServerAktionen from './hooks/useServerAktionen';
import useAblage from './hooks/useAblage';
import useSamenKauf from './hooks/useSamenKauf';
import useErnte from './hooks/useErnte';
import useWerkzeuge from './hooks/useWerkzeuge';
import useEierDekoBrutkasten from './hooks/useEierDekoBrutkasten';
import useVerkauf from './hooks/useVerkauf';
import usePost from './hooks/usePost';
import useSpielschleife from './hooks/useSpielschleife';
import useSpielflaecheMaus from './hooks/useSpielflaecheMaus';
import {
    HUD_SURFACE,
    toolIcon, formatGold, 
} from './ui/gardenTokens';
import { lohntSich } from './ui/ladenWert';
import { vielfaltStand } from './ui/vielfalt';

import { SamenLaden, WerkzeugLaden, EierLaden, DekoLaden } from './ui/laden/LadenFenster';
import { Schnellleiste, Ausruestung, HudUntenLinks } from './ui/hud/HudUnten';
import { HudObenLinks, HudObenMitte, HudObenRechts } from './ui/hud/HudOben';
import { EditorLeiste } from './ui/hud/EditorLeiste';
import { WeltVollHinweis } from './ui/fenster/WeltVollHinweis';
import { ProfilFenster, EinstellungenFenster, NeuerungenFenster } from './ui/fenster/ProfilFenster';
import NeueSaatFenster from './ui/fenster/NeueSaatFenster';
import { MarktFenster } from './ui/fenster/MarktFenster';
import { RucksackFenster, GegenstandTooltip } from './ui/fenster/RucksackFenster';
import { TierUebersicht, TierDetail } from './ui/fenster/TierFenster';
import { SchuppenAuswahl, MuellFenster, AblageFenster, FremdeVitrineFenster, BrutkastenFenster } from './ui/fenster/SchuppenFenster';
import { ItemIcon } from './ui/ItemIcon';
import { formatGroesse } from './ui/groesse';
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { GardenAdminBrowser } from "./GardenAdminPanel";

import {
    TwitchGlyph, START_GOLD, GIESSKANNE_MINUTEN,
    WAGEN_VERSATZ_X, 
    SHOP_ROTATION_MS, TOOL_EGG_ROTATION_MS, 
    MAX_PLOT_EXPANSIONS, ACKERRASTER_MARKE, MUSIK_BASIS, THEME_TRACKS, THEME_STANDARD,
    PARTY_TRACKS, FARM_SEO, WORLD_SLOTS,
    GARTEN_ADMIN_ID, SHOTGUN_LAUTSTAERKE, SHOTGUN_HAND_ITEM, WORLD_ZOOM, 
    
    berechneGebaeudePositionen, normalizeGebaeudeVersatz, 
    CHAT_FARBEN, RARITAETS_RANG, nachText,
    zeitBisErsteErnte, SHOP_SORTIERUNGEN, sortiere, KATALOG_NACH_ID,
    DEFAULT_TOOL_INVENTORY, BASE_DIRT_COLS, BASE_DIRT_ROWS, AREA_IMAGES,
    GEBAEUDE_NAMEN, TOOL_IMAGE_BY_KEY, TOOL_IMAGE_BY_ID, TERRAIN_ASSET_IMAGES,
    PET_IMAGE_BY_TYPE, DEFAULT_RENDER_PROFILE, 
    EGG_SHOP_CATALOGUE, DECO_SHOP_ITEMS, WARDROBE_SKINS, PET_EMOJI_BY_TYPE, getPetEmoji,
    hashToUnit, 
    buildPetPreviewImage, normalizeToolInventory, 
    TAB_ID, GERAET_ID, BACKPACK_MAX_LEVEL, 
    normalizePlotUnlockedCells, unlockedCellsFromLegacyExpansions,
    resolvePlotUnlockedCells, rollPetSpecialType, RARITY_COLORS, RarityBadge,
    withVisuals, hydratePet, hydratePets, hydrateSeed, hydrateSeeds, collectVisualAssetPaths,
    SeedFacts
} from './engine/gameConstants';

export default function GameContainer() {
    const { user: twitchUser, login: twitchLogin } = useContext(TwitchAuthContext);
    const canvasRef = useRef(null);
    // Externer Store für die Pflanzen-Hover-Karte — hält Mausbewegungen komplett
    // aus dem React-Renderpfad dieser Komponente heraus.
    const hoverStoreRef = useRef(null);
    if (!hoverStoreRef.current) hoverStoreRef.current = createHoverStore();
    const hoverStore = hoverStoreRef.current;
    // Aktueller Kamerazoom (Mausrad). Ref statt State: siehe ZOOM_MIN oben.
    const zoomRef = useRef(WORLD_ZOOM);
    const [zoomAnzeige, setZoomAnzeige] = useState(WORLD_ZOOM);
    // Wiederverwendete Hülle für die Treffprüfung auf fremden Grundstücken —
    // onCanvasMove läuft bei jeder Mausbewegung, da soll kein Objekt anfallen.
    const fremdHoverSlot = useRef({ x: 0, anchorY: 0, isTopRow: true, unlockedCells: [] }).current;

    // ── UI State ──────────────────────────────────────────────────────────────
    const [activeShop, setActiveShop] = useState(null); // "seed" | "tool" | "egg" | "deco"
    const [isBackpackOpen, setBackpackOpen] = useState(false);
    const [inventoryFilter, setInventoryFilter] = useState("all");
    const [inventoryMaxSlots, setInventoryMaxSlots] = useState(50);
    const [currentInteractable, setCurrentInteractable] = useState(null);
    const [gold, setGold] = useState(START_GOLD);
    // Lebenszeit-Gold (v2, Feedback 29.08.: "Gesamt gesammeltes Gold" in der
    // Profil-Bubble) — reiner Anzeigewert, gehört dem Server (siehe
    // gutschreiben() in economy.js). Nur an den Stellen nachgezogen, die
    // tatsächlich Gold GUTSCHREIBEN (Ernte-Verkauf, Tierfund, Post); reine
    // Käufe ändern ihn nie, die lassen ihn einfach stehen.
    const [goldGesamt, setGoldGesamt] = useState(0);
    /**
     * Der Goldstand, sofort lesbar.
     *
     * Die Kaufprüfungen dürfen NICHT gegen den React-Wert laufen: die Warteschlange
     * startet den nächsten Kauf, bevor React den neuen Stand übernommen hat. Der
     * zweite Klick sähe dann das Gold von vor der ersten Zahlung.
     */
    const goldRef = useRef(START_GOLD);
    const [inventory, setInventory] = useState([]); // array of seed instances
    const [shopRotation, setShopRotation] = useState(null);
    const [shopCountdown, setShopCountdown] = useState(SHOP_ROTATION_MS);
    const [toolShopRotation, setToolShopRotation] = useState(null);
    const [eggShopRotation, setEggShopRotation] = useState(null);
    const [toolShopCountdown, setToolShopCountdown] = useState(TOOL_EGG_ROTATION_MS);
    const [eggShopCountdown, setEggShopCountdown] = useState(TOOL_EGG_ROTATION_MS);
    const [toolShopStock, setToolShopStock] = useState({});
    const [eggShopStock, setEggShopStock] = useState({});
    const [ladenBestand, setLadenBestand] = useState({}); // { seedId: count }
    const [shopFilter, setShopFilter] = useState("lohnend"); // "lohnend" | "available" | "all"
    const [plotPlants, setPlotPlants] = useState({}); // "cx_cy" → plant
    const [plotExpansions, setPlotExpansions] = useState(0);
    const [plotUnlockedCells, setPlotUnlockedCells] = useState([]);
    const [selectedSeed, setSelectedSeed] = useState(null); // seed in hand for planting
    const [selectedCarryItem, setSelectedCarryItem] = useState(null); // harvested/other item in hand for visual carry
    const [selectedTool, setSelectedTool] = useState(null); // "pickaxe" | "pot" | "watering" | "shovel"
    const [movingPlantSource, setMovingPlantSource] = useState(null); // key string
    const [rotationBanners, setRotationBanners] = useState([]);
    const [harvestedItems, setHarvestedItems] = useState([]);
    const [isMarketOpen, setMarketOpen] = useState(false);
    const [notification, setNotification] = useState(null);
    const [itemHoverTooltip, setItemHoverTooltip] = useState(null); // { item, x, y }
    const [toolInventory, setToolInventory] = useState(DEFAULT_TOOL_INVENTORY);
    const [eggInventory, setEggInventory] = useState([]);
    const [petInventory, setPetInventory] = useState([]);
    const [petPlacements, setPetPlacements] = useState([]);
    const [decoInventory, setDecoInventory] = useState([]);
    const [decoPlacements, setDecoPlacements] = useState([]);
    const [selectedPetToPlace, setSelectedPetToPlace] = useState(null);
    const [selectedDecoToPlace, setSelectedDecoToPlace] = useState(null);
    /** Wird die Deko in der Hand gespiegelt platziert? Umschalten mit [R]. */
    const [decoGespiegelt, setDecoGespiegelt] = useState(false);
    /**
     * Wird ein Bodenbelag in der Hand quer (90°) platziert? Ebenfalls [R] —
     * bei Belägen macht Spiegeln optisch praktisch nie einen Unterschied
     * (die meisten Texturen sind links-rechts symmetrisch), Drehen dagegen
     * schon: der Trampelpfad etc. lässt sich damit auch hochkant verlegen.
     */
    const [decoRotiert, setDecoRotiert] = useState(false);
    const [shovelHoldState, setShovelHoldState] = useState({ active: false, progress: 0 });
    const [isIncubatorOpen, setIncubatorOpen] = useState(false);
    const [isTrashOpen, setTrashOpen] = useState(false);
    /** Schuppen-Auswahl (Kiste/Vitrine/Mülleimer) — siehe activateInteractable "shed". */
    const [isShedOpen, setShedOpen] = useState(false);
    // ── Missionsbrett (Feedback 30.08.) ────────────────────────────────────────
    // Katalog UND Fortschritt kommen vom Server (GET /rechte-Nachfolger GET
    // /quests), wie beim Fähigkeitsbaum: die Route entscheidet, was gilt.
    const [isQuestBoardOpen, setQuestBoardOpen] = useState(false);
    const [questDaten, setQuestDaten] = useState({ taeglich: [], woechentlich: [], auftraege: null, erntefest: null });
    // ── Gold-Shop (Feedback 01.09.) ─────────────────────────────────────────────
    // Rein kosmetische Reskins für Schuppen/Briefkasten/Werkzeug/Nameplate —
    // Katalog UND "schon gekauft"/"ausgerüstet" kommen vom Server, siehe oben.
    const [isGoldShopOpen, setGoldShopOpen] = useState(false);
    const [goldShopDaten, setGoldShopDaten] = useState({ katalog: {}, ausgeruestet: {} });
    // Der Schuppen steht dort, wo der Spieler ihn hinstellt. Gespeichert wird ein
    // Kachel-VERSATZ zum eigenen Grundstück, keine Weltkoordinate: der Slot
    // wechselt zwischen Sitzungen, absolute Werte lägen dann beim Nachbarn.
    // null = noch nie verschoben, also der Standardplatz.
    const [gebaeudeVersatz, setGebaeudeVersatz] = useState({ shed: null });
    /** "shed" | null — solange gesetzt, platziert der nächste Klick. */
    const [verschiebtGebaeude, setVerschiebtGebaeude] = useState(null);
    /**
     * Einrichtungs-Modus.
     *
     * NUR hier lässt sich Deko setzen und wieder einpacken und lassen sich Gebäude
     * umstellen. Vorher genügte im normalen Spiel ein Linksklick in die Nähe einer
     * Deko, um sie einzusammeln — beim Laufen, Ernten oder Anklicken von irgendetwas
     * passierte das dauernd aus Versehen. Solange der Modus läuft, blinkt das
     * Kachelraster des eigenen Grundstücks.
     */
    const [editorAktiv, setEditorAktiv] = useState(false);
    const editorAktivRef = useRef(false);
    useEffect(() => { editorAktivRef.current = editorAktiv; }, [editorAktiv]);
    /** "chest" | "vitrine" | null — offene eigene Ablage. */
    const [ablageOffen, setAblageOffen] = useState(null);
    /** Vitrine eines anderen: { owner, items } — nur ansehen. */
    const [fremdeVitrine, setFremdeVitrine] = useState(null);
    const [chestItems, setChestItems] = useState([]);
    const [vitrineItems, setVitrineItems] = useState([]);
    const [ablageBusy, setAblageBusy] = useState(false);
    /** Nachschlagewerk: seedId → { min, max, effekte: string[], anzahl } */
    const [logbuch, setLogbuch] = useState({});
    const [isLogbuchOpen, setLogbuchOpen] = useState(false);
    const [incubatorTargetSlot, setIncubatorTargetSlot] = useState(null);
    const [incubator, setIncubator] = useState({
        unlockedSlots: 1,
        slots: [null, null, null, null, null],
    });
    const [tickNow, setTickNow] = useState(Date.now());
    const [weatherState, setWeatherState] = useState({ type: "sun", label: "Sonne", intensity: 1, startedAt: Date.now() });
    const [renderProfile, setRenderProfile] = useState(DEFAULT_RENDER_PROFILE);
    const [playerAppearance, setPlayerAppearance] = useState({
        skin: STANDARD_SKIN,
    });
    const appearanceRef = useRef(playerAppearance);
    const [isWardrobeOpen, setWardrobeOpen] = useState(false);
    const [isChangelogOpen, setChangelogOpen] = useState(false);
    /** Welche ÄLTEREN Fassungen aufgeklappt sind — die neueste steht immer offen. */
    const [offeneChangelogs, setOffeneChangelogs] = useState([]);
    const [inspectedPet, setInspectedPet] = useState(null); // angeklicktes Tier → Detailfenster
    // v2, Punkt "Look & Overlays": vorher eine Hover-Dropdown-Karte unter dem
    // HUD-Knopf. Ein Overlay, das per Klick aufgeht (statt bei jeder zufälligen
    // Mausbewegung über den Knopf), passt besser zu allem anderen hier — jedes
    // andere Fenster im Spiel öffnet über einen Klick, nicht über Hover.
    const [isPetOverlayOpen, setPetOverlayOpen] = useState(false);

    const [showLobbyScreen, setShowLobbyScreen] = useState(true);
    const [leaderboard, setLeaderboard] = useState([]);
    // Weitere Bestenlisten (Backend world/ranglisten.js) — Logbuch, Wettbewerb, Jahreszeiten.
    const [ranglisten, setRanglisten] = useState(null);
    const [mailbox, setMailboxState] = useState([]);
    const [isMailboxOpen, setMailboxOpen] = useState(false);
    const [mailBusy, setMailBusy] = useState(false);
    // War man zuletzt in einer privaten Welt, steht ihr Code schon im Feld —
    // sonst muesste man ihn sich nach jedem Neuladen selbst merken.
    const [joinCodeInput, setJoinCodeInput] = useState(() => {
        const gemerkt = letzteWelt();
        return gemerkt && !gemerkt.startsWith("OEFFENTLICH") ? gemerkt : "";
    });
    const [pendingWorldCode, setPendingWorldCode] = useState("");
    const [pendingCreateWorld, setPendingCreateWorld] = useState(false);
    const [mailboxMode, setMailboxMode] = useState("inbox"); // "inbox" | "send"
    const [mailboxRecipient, setMailboxRecipient] = useState("");
    const [authUser, setAuthUser] = useState(null);
    const [isSettingsOpen, setSettingsOpen] = useState(false);
    /** Admin-Menü im Spiel. Der Knopf ist reine Optik — geprüft wird auf dem Server. */
    const [adminPanelOffen, setAdminPanelOffen] = useState(false);
    const istGartenAdmin = Boolean(authUser?.id) && String(authUser.id) === GARTEN_ADMIN_ID;
    // Für Tastendruck und Klickauswertung, die beide ohne React-State auskommen.
    const istGartenAdminRef = useRef(false);
    istGartenAdminRef.current = istGartenAdmin;
    /** Offener Reiter im Deko-Shop — der Katalog ist zu lang für eine Liste. */
    const [dekoKategorie, setDekoKategorie] = useState(DEKO_KATEGORIEN[0].id);
    // Samen-Shop sortiert seit Feedback 31.08. ("Sortierung raus, entrümpeln")
    // wieder fest nach Seltenheit+Preis, ohne eigene Leiste — kein State mehr nötig.
    const shopSortierung = "standard";
    /** Sortierung des Inventars — siehe INVENTAR_SORTIERUNGEN. */
    const [inventarSortierung, setInventarSortierung] = useState("standard");
    /**
     * Anwesenheitsliste und Chat bleiben per Klick offen — beide sind zum Lesen und
     * Tippen da, ein Aufklappen beim Überfahren (wie bei Gold und Tieren) würde
     * mitten im Satz wieder zuklappen, sobald die Maus danebengerät.
     */
    const [istOnlineListeOffen, setOnlineListeOffen] = useState(false);
    const [istChatOffen, setChatOffen] = useState(false);
    // v2 (Feedback 29.08., "Menü dropdown auflösen"): der bisherige Sammelknopf
    // (Umkleide/Logbuch/Tiere/Inkubator/Lager) ist aufgeteilt in eine Profil-
    // Bubble (Umkleide + Logbuch, direkt neben Gold/XP) und einen Tiere-Knopf.
    // Kiste/Vitrine/Mülleimer UND (seit Feedback 30.08.) der Inkubator wohnen
    // gemeinsam im Schuppen auf dem Feld, nicht mehr im HUD.
    const [isProfilOffen, setProfilOffen] = useState(false);
    const [vielfaltOffen, setVielfaltOffen] = useState(false);
    const [chatEingabe, setChatEingabe] = useState("");
    // Eigene Chat-Textfarbe (Feedback 01.09.) — bleibt über Sitzungen hinweg
    // erhalten wie die Musikauswahl (garden_farms_theme), gehört zu diesem
    // Browser statt zum Spielstand.
    const [chatFarbe, setChatFarbe] = useState(() => {
        const saved = localStorage.getItem("garden_chat_farbe");
        return CHAT_FARBEN.some((f) => f.id === saved) ? saved : null;
    });
    const [istFarbwahlOffen, setFarbwahlOffen] = useState(false);
    const [istEmojiWahlOffen, setEmojiWahlOffen] = useState(false);
    useEffect(() => {
        if (chatFarbe) localStorage.setItem("garden_chat_farbe", chatFarbe);
        else localStorage.removeItem("garden_chat_farbe");
    }, [chatFarbe]);
    /** Zählt ungelesene Zeilen, solange das Chatfenster zu ist. */
    const [chatUngelesen, setChatUngelesen] = useState(0);
    /** Die scrollbare Fläche selbst — nicht mehr ein Anker am Ende, siehe unten. */
    const chatListeRef = useRef(null);
    /** Klebt die Ansicht gerade am unteren Rand? Nur dann wird nachgescrollt. */
    const chatAmEndeRef = useRef(true);
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    // Zweit-Account auf diesem Gerät (Backend garden/world/zweitkonto.js): Hinweis statt Farm.
    const [zweitkontoText, setZweitkontoText] = useState(null);
    // Als Ref, damit flushFarmStateToServer die Sperre ohne Stale-Closure lesen kann.
    const isInitialLoadDoneRef = useRef(false);
    const [isSubscriber, setIsSubscriber] = useState(false);
    const [isBeta, setIsBeta] = useState(false);
    const [tutorialCompleted, setTutorialCompleted] = useState(false);
    const [ackerRasterMigriert, setAckerRasterMigriert] = useState(false);
    const [themeId, setThemeId] = useState(() => {
        const saved = localStorage.getItem("garden_farms_theme");
        return THEME_TRACKS.some((t) => t.id === saved) ? saved : THEME_STANDARD;
    });
    /**
     * Tageszeit und Party fürs HUD. Einmal je Sekunde — der Renderer liest beides
     * direkt aus der Uhr (siehe drawState), hier geht es nur um Uhrzeit und Countdown.
     */
    /**
     * Wetter und Party, die von Hand gesetzt wurden (Admin-Menü).
     *
     * Liegt NEBEN der Uhr, nicht in ihr: Tageszeit und Party rechnet
     * engine/Tageszeit.js aus `Date.now()` und ist damit bei allen gleich, ohne dass
     * jemand etwas verteilen müsste. „Jetzt Party" lässt sich daraus nicht ablesen —
     * also kommt die Ausnahme über den Socket und wird hier oben draufgelegt.
     */
    const [weltUebersteuerung, setWeltUebersteuerung] = useState({ wetterTyp: null, wetterBis: null, partyBis: null });
    const weltRef = useRef(weltUebersteuerung);
    useEffect(() => { weltRef.current = weltUebersteuerung; }, [weltUebersteuerung]);
    /**
     * Läuft gerade eine Party — aus der Uhr ODER von Hand gestartet?
     * Spiegel von istPartyAktiv() in Backend/garden/world/ereignisse.js.
     */
    const partyLaeuftJetzt = useCallback((now = Date.now()) => {
        const bis = Number(weltRef.current?.partyBis) || 0;
        return (bis > now) || partyStaerke(now) > 0;
    }, []);

    /** Party-Stärke fürs Zeichnen — die stärkere von Uhr und Übersteuerung. */
    const partyStaerkeJetzt = useCallback((now = Date.now()) => {
        const bis = Number(weltRef.current?.partyBis) || 0;
        const ausUhr = partyStaerke(now);
        if (!(bis > now)) return ausUhr;
        // Dieselbe Ausblende wie in der Uhr-Variante (PARTY_BLENDE_MS = 6000).
        return Math.max(ausUhr, Math.max(0, Math.min(1, (bis - now) / 6000)));
    }, []);

    const handleWelt = useCallback((welt) => {
        setWeltUebersteuerung({
            wetterTyp: welt?.wetterTyp || null,
            wetterBis: Number(welt?.wetterBis) || null,
            partyBis: Number(welt?.partyBis) || null,
        });
    }, []);

    const [tagesInfo, setTagesInfo] = useState(() => {
        const now = Date.now();
        const p = partyStand(now);
        const s = saisonStand(now);
        return {
            uhrzeit: spielUhrzeit(now), nacht: istNacht(now), party: p.aktiv, verbleibendMs: p.verbleibendMs, partyBeginn: p.beginn,
            saison: s.id, saisonName: s.name, saisonEnde: s.ende, saisonSorten: s.sorten, naechsteSaison: s.naechste.name,
            erntefest: erntefestZeitraum(now).aktiv,
        };
    });
    const tagesInfoRef = useRef(tagesInfo);
    useEffect(() => { tagesInfoRef.current = tagesInfo; }, [tagesInfo]);
    const mySlotRef = useRef(0);
    const plotExpansionsRef = useRef(0);
    const plotUnlockedCellsRef = useRef([]);
    const sellAllRef = useRef(() => {});
    const sellPetRef = useRef(() => {});
    const ladeQuestsRef = useRef(() => {});
    const rotationBannerTimeoutsRef = useRef(new Set());
    const shovelHoldTimerRef = useRef(null);
    const shovelHoldProgressRef = useRef(null);
    const shovelHoldStartedAtRef = useRef(0);
    const isDragHarvestingRef = useRef(false);
    const dragHarvestedCellsRef = useRef(new Set());
    /**
     * Waehrend EINES Zuges gesammelte Zellen, noch nicht abgeschickt — Schluessel
     * -> Pflanzen-Schnappschuss zum Zeitpunkt des Beruehrens (siehe ernteBeiZug).
     * Ref statt State: sie wird bei jeder Mausbewegung befuellt, ein Rendervorgang
     * dafuer waere Verschwendung — und genau das soll dieser Sammel-Umweg ja
     * vermeiden (siehe handleHarvestMany).
     */
    const dragErnteSammlungRef = useRef(new Map());
    const dragErnteFlushTimerRef = useRef(null);
    const toolRotationKeyRef = useRef(null);
    const eggRotationKeyRef = useRef(null);
    const seedRotationKeyRef = useRef(null);
    const selectedToolRef = useRef(null);
    const lastInteractableTypeRef = useRef(null);
    /** Aktuelles Interaktionsziel — auch fuer den Tastendruck, ohne React-State zu lesen. */
    const activeTargetRef = useRef(null);
    const decoGespiegeltRef = useRef(false);
    const decoRotiertRef = useRef(false);
    const selectedDecoToPlaceRef = useRef(null);
    const selectedSeedRef = useRef(null);
    const selectedPetToPlaceRef = useRef(null);
    /**
     * Aufgestellte Deko und Deko-Vorrat als Ref.
     *
     * Bodenbeläge malt man mit gedrückter Maustaste über mehrere Kacheln. Die
     * Aufrufe kommen dabei schneller, als React neu rendert — aus dem State gelesen
     * sähe jede Kachel den Stand von vor dem Zug, und derselbe Belag würde immer
     * wieder auf dieselbe Stelle gelegt, bis der Vorrat leer ist.
     */
    const decoPlacementsRef = useRef([]);
    const decoInventoryRef = useRef([]);
    /** Läuft gerade ein Malzug? Enthält die Kachel, die zuletzt bearbeitet wurde. */
    const bodenMalenRef = useRef(null);
    // Bodenbeläge werden schon bei mousedown gesetzt — der Browser schickt danach
    // trotzdem noch einen "click" hinterher. Dieses Flag markiert genau diesen
    // einen Klick als bereits erledigt, damit onCanvasClick ihn überspringt statt
    // ihn (mit ggf. veraltetem State) nochmal zu verarbeiten. Siehe onCanvasClick.
    const klickGehoertZuBodenMalenRef = useRef(false);
    const heldItemRef = useRef(null);
    const movingPlantSourceRef = useRef(null);
    const renderProfileRef = useRef(DEFAULT_RENDER_PROFILE);
    const weatherStateRef = useRef(weatherState);
    const toolInventoryRef = useRef(toolInventory);
    /**
     * Kaufsperre und Bestände als Ref — gegen Doppel- und Spamklicks.
     *
     * Jeder Kauf prüfte den Bestand aus dem React-State und zog ihn ERST NACH der
     * Antwort des Servers ab. Wer schnell klickte, kam mit jedem Klick durch dieselbe
     * Prüfung: fünf Gießkannen ließen sich acht Mal kaufen, ebenso Eier, Spitzhacken
     * und die eigentlich einmaligen Sachen (Schaufel, Kiste, Vitrine). Refs werden
     * SOFORT beim Klick fortgeschrieben, noch vor dem await — die zweite Prüfung
     * sieht damit schon den verringerten Bestand.
     */
    const kaufLaeuftRef = useRef(false);
    /**
     * Klicks, die während eines laufenden Kaufs eintreffen, WARTEN statt verloren
     * zu gehen.
     *
     * Vorher stand hier nur `if (kaufLaeuftRef.current) return;` — ohne Meldung, ohne
     * Spur. Ein Kauf kostet eine Netzrunde; gemessen auf einer Leitung mit 180 ms
     * kamen von zehn schnellen Klicks auf „Kaufen" nur FÜNF an. Wer zehnmal klickt,
     * bekommt fünf Töpfe und hält das für einen Fehler in der Abrechnung — dabei
     * wurden die anderen fünf nie abgeschickt.
     *
     * Dieselbe Lösung wie beim Ernten: einreihen und der Reihe nach abarbeiten. Die
     * Obergrenze fängt Dauerfeuer ab; wer zwanzigmal hämmert, will keine zwanzig
     * Gießkannen.
     */
    const KAUF_WARTESCHLANGE_MAX = 12;
    const kaufWarteschlangeRef = useRef([]);
    // Über Refs, damit ein eingereihter Klick denselben Handler noch einmal aufrufen
    // kann, ohne dass die Callbacks sich gegenseitig als Abhängigkeit brauchen.
    // Ohne diese Refs bräuchte `verbraucheWerkzeug` apiCall, notify und setzeWerkzeug
    // als Abhängigkeiten — und stünde damit im Quelltext hinter ihnen. Die Refs halten
    // die Reihenfolge frei.
    const apiCallRef = useRef(null);
    const notifyRef = useRef(null);
    const setzeWerkzeugRef = useRef(null);
    const handleBuySeedRef = useRef(null);
    const handleBuySeedAllRef = useRef(null);
    const handleBuyToolRef = useRef(null);
    const handleBuyToolAllRef = useRef(null);
    const handleBuyEggRef = useRef(null);
    const handleBuyDecoRef = useRef(null);
    const unlockIncubatorSlotRef = useRef(null);
    /**
     * Der EINZIGE Weg, den Werkzeugkasten zu ändern.
     *
     * WARUM ES DEN GEBEN MUSS
     * `toolInventory` ist React-State und damit erst beim nächsten Rendern zu sehen.
     * Käufe laufen aber in einer Warteschlange, die sich über `setTimeout(0)` selbst
     * weiterreicht — der zweite Kauf startet also, bevor React den ersten übernommen
     * hat. Wer in dieser Lücke den alten Stand liest und daraus den neuen rechnet,
     * überschreibt den ersten Kauf. Genau das war der Fehler „zehn Gießkannen gekauft,
     * sechs bekommen": jeder verlorene Kauf war trotzdem bezahlt.
     *
     * Schlimmer noch las `handleBuyTool` aus `farmStateRef`, das mit
     * DEFAULT_TOOL_INVENTORY (alles auf null) startet und ebenfalls erst per Effekt
     * nachgezogen wird. Ein Kauf in diesem Fenster ersetzte den ganzen Kasten durch
     * die Nullwerte — so verschwinden Pflanztöpfe und Gießkannen auf einen Schlag.
     *
     * Ab jetzt ist `toolInventoryRef` die Wahrheit: sie wird SYNCHRON geschrieben,
     * der State folgt nur fürs Zeichnen. Jede Änderung geht durch diese Funktion.
     */
    const setzeWerkzeug = useCallback((aenderung) => {
        const vorher = normalizeToolInventory(toolInventoryRef.current);
        const roh = typeof aenderung === "function" ? aenderung(vorher) : aenderung;
        const naechster = normalizeToolInventory(roh);
        toolInventoryRef.current = naechster;
        setToolInventory(naechster);
        return naechster;
    }, []);

    /**
     * Ein Verbrauchsgut aufbrauchen — über den SERVER.
     *
     * Der Werkzeugkasten gehört seit August 2026 dem Server (garden/core/werkzeug.js).
     * Der Browser darf ihn nicht mehr selbst herunterzählen: sonst könnte ein
     * zurückgedrehter Browserstand dieselbe Gießkanne beliebig oft benutzen — und
     * umgekehrt ginge ein Verbrauch verloren, wenn der Stand verworfen wird.
     *
     * Gibt true zurück, wenn wirklich etwas verbraucht wurde. Nur dann darf der
     * Aufrufer seine Wirkung anwenden.
     */
    const verbraucheWerkzeug = useCallback(async (feld, anzahl = 1) => {
        try {
            const daten = await apiCallRef.current?.("/action", {
                method: "POST",
                body: JSON.stringify({ action: "useTool", feld, anzahl }),
            });
            if (daten?.toolInventory) setzeWerkzeugRef.current?.(daten.toolInventory);
            return true;
        } catch (err) {
            notifyRef.current?.(err?.message || "Das Werkzeug ist aufgebraucht.", "error");
            return false;
        }
    }, []);

    const kaufEinreihen = useCallback((auftrag) => {
        if (kaufWarteschlangeRef.current.length >= KAUF_WARTESCHLANGE_MAX) return;
        kaufWarteschlangeRef.current.push(auftrag);
    }, []);
    /**
     * Den nächsten Auftrag starten — bewusst über den Ereignis-Zyklus. Direkt
     * aufgerufen liefe er noch vor `setToolInventory` und `debouncedSave` des
     * gerade fertigen Kaufs und sähe damit einen veralteten Stand.
     */
    const naechstenKaufStarten = useCallback(() => {
        setTimeout(() => {
            if (kaufLaeuftRef.current) return;
            kaufWarteschlangeRef.current.shift()?.();
        }, 0);
    }, []);
    const ladenBestandRef = useRef({});
    const toolShopStockRef = useRef({});
    const eggShopStockRef = useRef({});
    const seedNextRotationAtRef = useRef(0);
    const toolNextRotationAtRef = useRef(0);
    const eggNextRotationAtRef = useRef(0);
    /** Samen-Shop: pro Rotation nur einmal auffüllen / aus Save übernehmen (nicht bei jedem /global-shop-Poll resetten) */
    const bestandFuerRotationRef = useRef(null);
    /**
     * Wann zuletzt ein Kauf den Bestand verändert hat. Damit verwirft
     * `uebernimmBestand` Poll-Antworten, die älter sind als dieser Kauf.
     */
    const letzterKaufAtRef = useRef(0);
    /**
     * Dasselbe für den Werkzeug-Bestand (plant_pot, watering_can) — analog zu
     * letzterKaufAtRef, aber ein EIGENER Zeitstempel: ein Samenkauf darf einen
     * gerade erst frisch gesetzten Werkzeug-Bestand nicht wieder freigeben und
     * umgekehrt. Siehe handleBuyTool und den werkzeugladen-Abgleich im Poll unten.
     */
    const letzterToolKaufAtRef = useRef(0);
    /**
     * Dasselbe für Tool- und Eier-Shop. Ohne diese Sperre setzte jeder /global-shop-Poll
     * (spätestens alle 30 s) den Bestand zurück auf den Rotationswert: gekaufte Gießkannen,
     * Töpfe und Spitzhacken standen nach kurzem Warten wieder im Regal, ohne dass die
     * Rotation abgelaufen war. Der Samen-Shop hatte die Sperre schon.
     */
    const toolShopSeededForGenAtRef = useRef(null);
    const eggShopSeededForGenAtRef = useRef(null);
    /** Verhindert die Nachlade-Schleife, wenn eine Rotation ohne Samen zurückkommt. */
    const shopBootstrapTriedRef = useRef(false);
    /** Welcher Laden gerade offen ist — für den Abfragetakt des globalen Bestands. */
    const ladenOffenRef = useRef(null);
    const savedToolShopStockRef = useRef(null);
    const savedEggShopStockRef = useRef(null);
    /** Zählt hoch, sobald ein geladener Spielstand seinen Ladenbestand hinterlegt hat. */
    const [ladenbestandGeladen, setLadenbestandGeladen] = useState(0);
    /**
     * Samenkäufe, die im Rucksack noch nicht sichtbar sind.
     *
     * `farmStateRef` wird erst beim nächsten Rendern nachgezogen, die Warteschlange
     * startet den nächsten Kauf aber schon vorher — ohne diesen Zuschlag rutschte
     * genau ein Samen über die Rucksackgrenze. Abgebaut wird er NICHT durch ein
     * pauschales Zurücksetzen (das kam zu früh und half deshalb nicht), sondern um
     * genau die Stückzahl, die im Rucksack tatsächlich aufgetaucht ist.
     */
    const offeneSamenkaeufeRef = useRef(0);
    const zuletztInventarRef = useRef(0);

    const saveTimeoutRef = useRef(null);
    const flushFarmStateToServerRef = useRef(null);
    /** Stand des Serverzählers, den dieser Browser zuletzt gesehen hat. */
    const stateVersionRef = useRef(0);
    /**
     * Level, XP und gelernte Fähigkeiten. Kommt AUSSCHLIESSLICH vom Server und wird
     * nie mitgespeichert — der Baum steuert Gold und Ertrag (siehe garden/core/skills.js).
     * Der Bauplan (`skillKatalog`) kommt aus derselben Quelle, damit die angezeigte
     * Prozentzahl nicht von der abweicht, mit der die Kasse rechnet.
     */
    const [skillStand, setSkillStand] = useState(null);
    /** Ernte-Rausch (Backend core/rausch.js) — nur Anzeige, kommt mit jeder Aktion. */
    const [ernteRausch, setErnteRausch] = useState(null);
    /** Käfer und Unkraut auf dem eigenen Acker (Backend core/stoerer.js), gespiegelt in engineRef. */
    const [stoerer, setStoerer] = useState([]);
    /** Entdeckte Kreuzungen (Backend harvestCell → state.zuchtbuch), für das Logbuch. */
    const [zuchtbuch, setZuchtbuch] = useState({});
    /** Platzierungen im Wochenwettbewerb (Backend world/wettbewerb.js), fürs Profil. */
    const [wettbewerbSiege, setWettbewerbSiege] = useState([]);
    // „Neue Saat" (Backend core/prestige.js): Stand vom Server, Sterne auch für den Renderer.
    const [prestigeStand, setPrestigeStand] = useState(null);
    const eigeneSterneRef = useRef(0);
    const [neueSaatOffen, setNeueSaatOffen] = useState(false);
    useEffect(() => { eigeneSterneRef.current = prestigeStand?.sterne || 0; }, [prestigeStand]);
    const [skillKatalog, setSkillKatalog] = useState([]);
    /**
     * Erfahrung je SORTE — kommt mit dem Fähigkeitsbaum vom Server.
     *
     * Je Sorte und nicht je Seltenheit, seit die Erfahrung auch an der Zykluslänge
     * hängt (xpFuerErnte in Backend/garden/core/skills.js). Bewusst nicht hier
     * gespiegelt: vergeben wird XP allein serverseitig, und eine Anzeige, die etwas
     * anderes verspricht als die Kasse zahlt, ist schlimmer als gar keine Anzeige.
     */
    const [xpJeSorte, setXpJeSorte] = useState(null);
    const skillWirkungRef = useRef({});
    const skillStufenRef = useRef({});
    const [skillsOffen, setSkillsOffen] = useState(false);
    /** Dieser Tab hat gegen einen anderen verloren und speichert nicht mehr. */
    const [nurZuschauen, setNurZuschauen] = useState(false);
    const nurZuschauenRef = useRef(false);
    /** Tier-ID → Zeitpunkt der letzten angenommenen Auszahlung (spiegelt die Serversperre). */
    const petFundZeitenRef = useRef(new Map());
    /** Zellen, deren Ernte gerade beim Server liegt — verhindert Doppelanfragen. */
    const ernteLaeuftRef = useRef(new Set());
    /** Zelle → Klicks, die während einer laufenden Ernte kamen und noch drankommen. */
    const ernteWarteschlangeRef = useRef(new Map());
    /** handleHarvest über ein Ref, damit die Warteschlange sich selbst aufrufen kann. */
    const handleHarvestRef = useRef(null);
    /** Zelle → Zeitpunkt der letzten GELUNGENEN Ernte. Trennt „zu schnell geklickt"
     *  von „Server hat einen veralteten Acker" — siehe handleHarvest. */
    const letzteErnteRef = useRef(new Map());
    const preloadedAssetsRef = useRef(new Set());
    const playerBadgeRef = useRef(null);
    // Ausgerüstete Gold-Shop-Reskins (core/reskins.js) — EIN Ref für alle vier
    // Kategorien, aus demselben Grund wie playerBadgeRef: der Renderer braucht
    // sie jedes Bild, ohne dafür einen Re-Render auszulösen.
    const meineReskinsRef = useRef({ shed: null, mailbox: null, werkzeug: null, nameplate: null });
    const localPlayerNameRef = useRef("Spieler");
    const readyEggsCount = incubator.slots.filter(s => s && Date.now() >= s.hatchAt).length;
    /**
     * Dieselbe Zahl für die Renderschleife. Die Schleife wird einmal aufgesetzt und
     * hielte den Wert aus DIESEM Bild für immer fest — sie startet, bevor der
     * Spielstand geladen ist, und sah deshalb dauerhaft „null fertige Eier".
     */
    const readyEggsCountRef = useRef(0);
    readyEggsCountRef.current = readyEggsCount;
    // Refs for latest state values – readable in socket cleanup without stale closures
    const farmStateRef = useRef({
        gold: START_GOLD,
        inventory: [],
        plotPlants: {},
        plotExpansions: 0,
        plotUnlockedCells: [],
        harvestedItems: [],
        eggInventory: [],
        petInventory: [],
        petPlacements: [],
        decoInventory: [],
        decoPlacements: [],
        toolInventory: DEFAULT_TOOL_INVENTORY,
        inventoryMaxSlots: 50,
        incubator: { unlockedSlots: 1, slots: [null] },
        appearance: { skin: STANDARD_SKIN },
    });
    // Früh definiert, weil die Lobby-Verbindung darüber meldet und mySlotIndex daraus kommt.
    const notify = useCallback((msg, type = "success") => {
        setNotification({ msg, type, id: Date.now() });
        setTimeout(() => setNotification(null), 2500);
    }, []);

    const handleIncomingMail = useCallback((mail) => {
        setMailboxState((prev) => [mail, ...prev.filter((m) => m.id !== mail.id)]);
        notify(`Neue Post von ${mail?.from || "einem Farmer"}.`);
    }, [notify]);

    // Umweg über ein Ref, weil die Lobby-Verbindung hier oben aufgebaut wird, das
    // Übernehmen des Serverstands aber erst weiter unten entsteht (applyServerState).
    const adminUpdateRef = useRef(null);
    const handleAdminUpdate = useCallback((info, art) => adminUpdateRef.current?.(info, art), []);
    /**
     * Der Server nennt beim Betreten seinen Zählerstand. Liegt er VOR unserem, hat
     * er den Spielstand selbst verändert, während wir nicht hingesehen haben — eine
     * Umstellung beim Neustart etwa. Dann muss dieser Browser nachladen, statt
     * seinen älteren Stand hochzudrücken.
     */
    const serverVersionRef = useRef(null);
    const handleServerVersion = useCallback((version) => serverVersionRef.current?.(version), []);

    /**
     * Shotgun-Treffer in der Welt. Wieder über ein Ref, aus demselben Grund wie
     * oben: Renderer und Klangausgabe entstehen erst weiter unten in dieser Datei,
     * die Lobby-Verbindung wird aber hier aufgebaut.
     */
    const splatterRef = useRef(null);
    const handleSplatter = useCallback((info) => splatterRef.current?.(info), []);
    /** Selbst getroffen worden → zurück in die Lobby. */
    const kickedRef = useRef(null);
    const handleKicked = useCallback((grund) => kickedRef.current?.(grund), []);
    /**
     * Party-Veredelung vom Server übernehmen.
     *
     * Kommt als { "3_4": "Rainbow", "5_2": [0, 2] } — bei Einmalernten die Sorte, bei
     * Dauerträgern die Nummern der veredelten Fruchtstände. Bewusst nur diese Zellen:
     * ein Nachladen des ganzen Standes alle dreissig Sekunden mitten in einer Party
     * würde den Acker jedes Mal durch die Serverfassung ersetzen und dabei alles
     * verwerfen, was seit dem letzten Speichern gewachsen ist.
     */
    const handleVeredelt = useCallback((zellen) => {
        let anzahl = 0;
        const getroffeneKeys = [];
        setPlotPlants((prev) => {
            let geaendert = false;
            const next = { ...prev };
            for (const [key, wert] of Object.entries(zellen)) {
                const pflanze = prev[key];
                if (!pflanze) continue;
                if (Array.isArray(wert)) {
                    const slots = Array.isArray(pflanze.fruitSlots) ? pflanze.fruitSlots.slice() : [];
                    let trefferHier = 0;
                    for (const i of wert) {
                        if (!slots[i] || slots[i].specialType) continue;
                        slots[i] = { ...slots[i], specialType: "Rainbow" };
                        trefferHier++;
                    }
                    if (!trefferHier) continue;
                    next[key] = { ...pflanze, fruitSlots: slots };
                    anzahl += trefferHier;
                } else {
                    if (pflanze.specialType) continue;
                    next[key] = { ...pflanze, specialType: String(wert) };
                    anzahl++;
                }
                getroffeneKeys.push(key);
                geaendert = true;
            }
            return geaendert ? next : prev;
        });
        if (anzahl > 0) {
            notifyRef.current?.(anzahl === 1
                ? "Die Party hat eine Pflanze veredelt — Rainbow!"
                : `Die Party hat ${anzahl} Stellen veredelt — Rainbow!`);
            // Zusätzlich direkt an der betroffenen Zelle — der Toast sagt "was",
            // das Funkeln auf dem Acker sagt "wo".
            const renderer = engineRef.current?.renderer;
            const meinSlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            if (renderer && meinSlot) {
                for (const key of getroffeneKeys) {
                    const [cx, cy] = key.split("_").map(Number);
                    const pos = getDirtCellWorldPos(meinSlot, cx, cy);
                    if (pos) renderer.spawnFeedback(pos.x + TILE_SIZE / 2, pos.y + TILE_SIZE / 2, "Rainbow!", { color: "#f472b6", durationMs: 1400 });
                }
            }
        }
    }, []);

    /**
     * Das eigene Abzeichen — EINE Quelle für beide Wege.
     *
     * Es wird an zwei völlig verschiedenen Stellen gebraucht: über dem eigenen Kopf
     * zeichnet der Renderer aus `playerBadgeRef`, an die Mitspieler geht es über die
     * Lobby-Verbindung. Standen dort zwei Ausdrücke, sah man bei sich selbst etwas
     * anderes als alle anderen.
     *
     * „admin" verdrängt „subscriber": der Streamer IST für die Wirtschaft ein
     * Abonnent (siehe ensureSubStatus im Backend, er bekommt die 50 %), tragen soll
     * er aber das Admin-Abzeichen. Der Server setzt es ohnehin selbst noch einmal
     * anhand der Twitch-ID — hier steht es, damit der eigene Kopf sofort stimmt.
     */
    const eigenesAbzeichen = istGartenAdmin
        ? "admin"
        : isSubscriber ? "subscriber" : isBeta ? "beta" : null;
    useEffect(() => { playerBadgeRef.current = eigenesAbzeichen; }, [eigenesAbzeichen]);

    // ── Dauerhafte 6-Plot-Welt ────────────────────────────────────────────────
    // Es gibt keinen Singleplayer-Modus mehr: die Karte hat immer 6 Grundstücke
    // (Feedback 01.09.: war 8), der Server vergibt den Slot. Alleine bekommt man
    // Slot 0 (oben links).
    const {
        slotIndex: mySlotIndex,
        connected: lobbyConnected,
        worldFull,
        onlinePlayers,
        remotePlayersRef,
        plotsRef,
        sendMove,
        sendHeld,
        activeCode,
        isPublicWorld,
        chatVerlauf,
        sendChat,
        sendShotgun,
    } = useGardenLobby({
        enabled: !showLobbyScreen,
        worldCode: pendingWorldCode,
        createWorld: pendingCreateWorld,
        appearance: playerAppearance,
        badge: eigenesAbzeichen,
        onMail: handleIncomingMail,
        onNotify: notify,
        onAdminUpdate: handleAdminUpdate,
        onServerVersion: handleServerVersion,
        onSplatter: handleSplatter,
        onKicked: handleKicked,
        onVeredelt: handleVeredelt,
        onWelt: handleWelt,
    });

    const lastRotationSoundRef = useRef(0);
    const {
        effectVolume, setEffectVolume, musicVolume, setMusicVolume, laufenderPartyTitel, playSound, spieleErnteTon,
    } = useFarmSound({ showLobbyScreen, tagesInfo, themeId });


    // ── Engine ref (canvas state, no re-renders) ──────────────────────────────
    const layout = useRef(generatePlotSlots(WORLD_SLOTS));
    const engineRef = useRef({
        renderer: null,
        input: null, // wird im Game-Loop erstellt + bei Unmount zerstört (kein globaler Leak)
        player: {
            x: 0, y: 0,
            tileX: 0, tileY: 0,
            hopping: false, hopBob: 0,
            isMoving: false,
        },
        areas: {
            seedShop: { x: 0, y: 0, label: "Samen-Shop", type: "seed" },
            toolShop: { x: 0, y: 0, label: "Tool-Shop", type: "tool" },
            eggShop: { x: 0, y: 0, label: "Eier-Shop", type: "egg" },
            decoShop: { x: 0, y: 0, label: "Deko-Shop", type: "deco" },
            market: { x: 0, y: 0, label: "Markt", type: "market" },
            petMarket: { x: 0, y: 0, label: "Tier-Verkauf", type: "petMarket" },
            // Kiste, Vitrine und Mülleimer wohnen seit v2 (Feedback 29.08.) alle
            // im selben Schuppen — ein E-Tastendruck öffnet eine Auswahl statt
            // dass jedes einzeln auf dem Grundstück steht.
            shed: { x: 0, y: 0, label: "Schuppen", type: "shed" },
            questBoard: { x: 0, y: 0, label: "Missionen", type: "questBoard" },
        },
        plotPlants: {}, // mirror for canvas reads without stale closure
        petPlacements: [],
        decoPlacements: [],
    });
    useEffect(() => { engineRef.current.stoerer = stoerer; }, [stoerer]);

    // ── Shotgun-Treffer ───────────────────────────────────────────────────────
    // Nachgereicht, weil die Lobby-Verbindung weiter oben aufgebaut wird, der
    // Renderer und die Klangausgabe aber erst hier stehen (siehe splatterRef).
    useEffect(() => {
        splatterRef.current = ({ name, x, y }) => {
            engineRef.current?.renderer?.spawnSplatter?.(x, y);
            playSound("shotgun", SHOTGUN_LAUTSTAERKE);
            if (name) notify(`${name} wurde aus der Welt geschossen.`);
        };
        kickedRef.current = (grund) => {
            // AFK-Kick (v2, Punkt 8): kein Schuss-Sound/-Text — das wäre schlicht
            // falsch für "zu lange nichts getan". Siehe garden:kicked in
            // Backend/garden/world/lobby.js.
            if (grund === "afk") {
                notify("Du warst zu lange inaktiv und wurdest aus der Welt entfernt.", "error");
            } else {
                playSound("shotgun", SHOTGUN_LAUTSTAERKE);
                notify("Du wurdest aus der Welt geschossen.", "error");
            }
            // Erst den Stand rausschreiben, dann zurück in die Lobby — sonst kostet
            // ein Schuss die letzten Sekunden Fortschritt. Der Server nimmt einen
            // ohnehin erst nach dem Effekt aus der Welt, die Zeit ist da.
            Promise.resolve(flushFarmStateToServerRef.current?.())
                .catch(() => {})
                .finally(() => setShowLobbyScreen(true));
        };
    }, [playSound, notify]);

    // Initialize positions after layout
    useEffect(() => {
        const l = layout.current;
        // Auf die Kachelmitte einrasten — sonst stünde der Geist beim ersten
        // Sprung nicht mittig, weil der Startpunkt (Weltmitte) selten exakt auf
        // dem TILE_SIZE-Raster liegt.
        const spawnTileX = Math.round(l.centerX / TILE_SIZE);
        const spawnTileY = Math.round(l.centerY / TILE_SIZE);
        engineRef.current.player.tileX = spawnTileX;
        engineRef.current.player.tileY = spawnTileY;
        engineRef.current.player.x = spawnTileX * TILE_SIZE + TILE_SIZE / 2;
        engineRef.current.player.y = spawnTileY * TILE_SIZE + TILE_SIZE / 2;
        engineRef.current.player.hopping = false;
        const a = engineRef.current.areas;

        // Dieselbe Rechnung wie in updateAreaPositions — die Werte standen hier
        // doppelt und konnten auseinanderlaufen.
        const yWagen = {
            seedShop: l.centerPathTopY + 92, toolShop: l.centerPathTopY + 92,
            eggShop: l.centerPathBottomY - 140, decoShop: l.centerPathBottomY - 140,
            market: l.centerY, petMarket: l.centerY, questBoard: l.centerY,
        };
        for (const [art, versatz] of Object.entries(WAGEN_VERSATZ_X)) {
            a[art].x = l.centerX + versatz;
            a[art].y = yWagen[art];
            a[art].image = AREA_IMAGES[art];
        }

        // Startplatz des Schuppens. Bewusst über dieselbe Funktion wie später der
        // Effekt mit dem gespeicherten Versatz — als das hier eine eigene Rechnung
        // hatte, liefen die beiden auseinander.
        const pos = berechneGebaeudePositionen(l.slots[0], null);
        a.shed.x = pos.shed.x;
        a.shed.y = pos.shed.y;
        a.shed.fussY = pos.shed.fussY;
        a.shed.image = AREA_IMAGES.shed;
    }, []);

    useEffect(() => {
        appearanceRef.current = playerAppearance;
    }, [playerAppearance]);

    // Schuppen relativ zum eigenen Plot (Multiplayer: Slot wechselt). Ohne
    // gespeicherten Versatz gilt der Standardplatz am rechten Ackerrand.
    useEffect(() => {
        const l = layout.current;
        const ownSlot = l.slots[mySlotIndex] || l.slots[0];
        const a = engineRef.current.areas;
        const pos = berechneGebaeudePositionen(ownSlot, gebaeudeVersatz);
        a.shed.x = pos.shed.x;
        a.shed.y = pos.shed.y;
        a.shed.fussY = pos.shed.fussY;
        a.shed.image = AREA_IMAGES.shed;
        // Der Schuppen selbst steht immer da (Mülleimer braucht keinen Kauf) —
        // ob Kiste/Vitrine DARIN nutzbar sind, entscheidet die Auswahl beim
        // Öffnen, nicht die Sichtbarkeit des Gebäudes.
        a.shed.aktiv = true;
    }, [mySlotIndex, gebaeudeVersatz]);

    // ── Helpers (defined before any useEffect that references them) ───────────
    const preloadImage = useCallback((src) => {
        if (!src || preloadedAssetsRef.current.has(src)) return;
        preloadedAssetsRef.current.add(src);
        const img = new Image();
        img.decoding = "async";
        // Gleiche URL wie im Renderer, sonst laedt der Vorlader die alte Fassung
        // und der Cache-Buster brächte nichts.
        img.src = versionedAsset(src);
    }, []);

    const hydratePlantVisuals = useCallback((plant) => {
        if (!plant || typeof plant !== "object") return null;
        const singleUse = plant.singleUse !== false;
        if (!plant.seedId) return { ...plant, singleUse };
        // Reihenfolge ist entscheidend: die abgeleiteten Bildpfade stehen NACH dem
        // gespeicherten Objekt. Alte Spielstaende tragen noch Pfade wie
        // plants/gurke/structure.png mit sich — die wuerden sonst die neue,
        // gemeinsame Struktur je Wuchsform ueberschreiben.
        return {
            ...plant,
            ...getPlantVisuals(plant.seedId, singleUse),
            singleUse,
        };
    }, []);

    const normalizePlotPlantsMap = useCallback((plantsLike) => {
        if (!plantsLike || typeof plantsLike !== "object") return {};
        const out = {};
        for (const [key, plant] of Object.entries(plantsLike)) {
            const hydrated = hydratePlantVisuals(plant);
            if (!hydrated) continue;
            out[key] = hydrated;
        }
        return out;
    }, [hydratePlantVisuals]);

    const preloadCriticalAssets = useCallback(async (onProgress) => {
        const assetSet = new Set([
            "/garden-assets/common/planted_seed.png",
            "/garden-assets/atlas/garden_atlas.png",
            "/garden-assets/world/mailbox.png",
            ...Object.values(AREA_IMAGES),
            ...Object.values(TOOL_IMAGE_BY_KEY),
            ...TERRAIN_ASSET_IMAGES,
            ...Object.values(PET_IMAGE_BY_TYPE),
            ...DECO_SHOP_ITEMS.map((item) => item.image),
            ...EGG_SHOP_CATALOGUE.map((item) => item.image), // HINZUGEFÜGT
            ...WARDROBE_SKINS.map((item) => item.skin).filter(Boolean),
            // Feedback 01.09.: "richtig erst wenn alles geladen hat" — vorher liefen
            // nur die eigenen Samen/Ernte/Deko/Eier/Tiere ein (unten, `enqueueItem`
            // über den eigenen Bestand), der Rest des Katalogs (alles, was man noch
            // NICHT besitzt — ein fremdes Grundstück, der Laden, eine frische Ernte)
            // kam erst beim ersten Anblick nach, sichtbar als kurzes Nachpoppen.
            // Der GANZE Samenkatalog deckt jede Sorte mit allen ihren Bildern ab
            // (Same/Setzling/Wachstum/Struktur/Frucht/Ernte je einmal), unabhängig
            // vom eigenen Rucksack — dieselbe Ableitung wie beim Hydrieren einer
            // Pflanze (withVisuals), nur ohne echtes Item, nur mit Sorte + Bauart.
            ...SEED_CATALOGUE.flatMap((s) => collectVisualAssetPaths(withVisuals({ seedId: s.id, singleUse: s.singleUse }))),
            // Gold-Shop-Reskins: gehören niemandem hier auf dem eigenen Grundstück,
            // können aber jederzeit bei einem Nachbarn auftauchen.
            ...Object.values(SHED_RESKIN_BILD),
            ...Object.values(MAILBOX_RESKIN_BILD),
        ]);
        const enqueueItem = (item) => {
            for (const path of collectVisualAssetPaths(withVisuals(item))) {
                assetSet.add(path);
            }
        };
        for (const item of inventory.slice(0, 120)) enqueueItem(item);
        for (const item of harvestedItems.slice(0, 120)) enqueueItem(item);
        for (const plant of Object.values(plotPlants).slice(0, 180)) enqueueItem(plant);
        for (const deco of decoInventory.slice(0, 120)) enqueueItem(deco);
        for (const deco of decoPlacements.slice(0, 200)) enqueueItem(deco);

        // HINZUGEFÜGT:
        for (const egg of eggInventory.slice(0, 120)) enqueueItem(egg);
        for (const pet of petInventory.slice(0, 120)) enqueueItem(pet);
        for (const pet of petPlacements.slice(0, 120)) enqueueItem(pet);

        const sources = [...assetSet];
        const total = Math.max(1, sources.length);
        let done = 0;
        onProgress?.(done, total);

        await Promise.all(sources.map((src) => new Promise((resolve) => {
            const img = new Image();
            img.decoding = "async";
            const finish = () => {
                preloadedAssetsRef.current.add(src);
                done += 1;
                onProgress?.(done, total);
                resolve();
            };
            img.onload = finish;
            img.onerror = finish;
            img.src = versionedAsset(src);
        })));
    }, [inventory, harvestedItems, plotPlants, decoInventory, decoPlacements]);

    const { worldBootState, startWorldBoot, markWorldBootDataReady } = useWorldBoot({
        engineRef, layout, preloadCriticalAssets, showLobbyScreen, setIsInitialLoadDone,
    });

    const playRotationSound = useCallback(() => {
        const now = Date.now();
        if (now - lastRotationSoundRef.current < 500) return;
        lastRotationSoundRef.current = now;
        playSound("rotation", 0.05);
    }, [playSound]);

    const announceRotation = useCallback((msg) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setRotationBanners((prev) => [...prev.slice(-4), { id, msg }]);
        playRotationSound();
        const tid = setTimeout(() => {
            rotationBannerTimeoutsRef.current.delete(tid);
            setRotationBanners((prev) => prev.filter((b) => b.id !== id));
        }, 3200);
        rotationBannerTimeoutsRef.current.add(tid);
    }, [playRotationSound]);

    const activateInteractable = useCallback((target) => {
        if (!target) return;
        playSound("open", 0.4);
        if (target.type === "market") {
            sellAllRef.current();
        } else if (target.type === "seed") {
            setActiveShop("seed");
        } else if (target.type === "tool") {
            setActiveShop("tool");
        } else if (target.type === "egg") {
            setActiveShop("egg");
        } else if (target.type === "deco") {
            setActiveShop("deco");
        } else if (target.type === "petMarket") {
            sellPetRef.current();
        } else if (target.type === "shed") {
            // v2 (Feedback 29.08.): EIN Gebäude für Kiste, Vitrine und Mülleimer —
            // die Auswahl dazwischen übernimmt das Schuppen-Modal, siehe dort.
            setShedOpen(true);
        } else if (target.type === "questBoard") {
            setQuestBoardOpen(true);
            ladeQuestsRef.current?.();
        } else if (target.type === "fremdeVitrine") {
            // Die Momentaufnahme trägt nur Werte, keine Bildpfade (der Server kennt
            // keine Assets) — ohne Nachziehen bliebe die fremde Vitrine bildlos.
            setFremdeVitrine({ owner: target.owner, items: hydrateHarvestedItems(target.items) });
        } else if (target.type === "mailbox") {
            // Eigener Kasten → Posteingang, fremder → Sendeformular mit Empfänger.
            if (target.isOwn) {
                setMailboxMode("inbox");
                setMailboxRecipient("");
            } else {
                setMailboxMode("send");
                setMailboxRecipient(target.owner || "");
            }
            setMailboxOpen(true);
        }
    }, []);

    /**
     * Vor ein beliebiges Grundstück springen — an dieselbe Stelle, an der man auch
     * bei der eigenen Farm landet: mittig am Kiesweg, also mit Blick auf den Acker.
     * Bei einem Grundstück der oberen Reihe steht man knapp darunter, bei einem der
     * unteren knapp darüber; sonst käme man auf der falschen Seite heraus.
     */
    /**
     * Spielfigur an eine Weltposition setzen — für JEDE Schnellreise, nicht nur
     * ein Objekt-Update.
     *
     * BUGFIX: Die Kachel-Sprung-Bewegung (v2-Fundament) rechnet den nächsten Sprung
     * NICHT von `player.x/y`, sondern von der separat geführten Logikkachel
     * `player.tileX/tileY` aus (siehe Game-Loop weiter unten, "TILE-SPRUNG-
     * BEWEGUNG"). Die Teleport-Funktionen setzten bisher nur x/y — tileX/tileY
     * blieben auf der ALTEN Kachel stehen. Der nächste WASD-Druck sprang deshalb
     * von dieser alten Kachel aus einen Schritt weiter, was nach einer großen
     * Teleport-Distanz aussah wie "zurückgeteleportiert". Diese Funktion hält
     * beide Zustände zusammen und räumt einen laufenden Sprung ab, damit auch
     * kein alter hopFrom/hopTo mehr nachwirkt.
     */
    const setzePlayerPosition = useCallback((x, y) => {
        const p = engineRef.current.player;
        p.x = x;
        p.y = y;
        p.vx = 0;
        p.vy = 0;
        p.tileX = Math.round((x - TILE_SIZE / 2) / TILE_SIZE);
        p.tileY = Math.round((y - TILE_SIZE / 2) / TILE_SIZE);
        p.hopping = false;
        p.hopBob = 0;
    }, []);

    const teleportToSlot = useCallback((slotIndex) => {
        const slot = layout.current.slots[slotIndex];
        if (!slot) return;
        setzePlayerPosition(
            slot.x + MAP_CONFIG.territoryWidth / 2,
            slot.isTopRow ? slot.anchorY - 22 : slot.anchorY + 22,
        );
    }, [setzePlayerPosition]);

    const teleportToMyFarm = useCallback(() => {
        teleportToSlot(layout.current.slots[mySlotRef.current] ? mySlotRef.current : 0);
    }, [teleportToSlot]);

    /** Aus der Anwesenheitsliste: zum Grundstück eines Mitspielers springen. */
    const besucheSpieler = useCallback((eintrag) => {
        if (!Number.isInteger(eintrag?.slotIndex) || eintrag.slotIndex < 0) {
            notify("Diese Person hat gerade kein Grundstück.", "error");
            return;
        }
        teleportToSlot(eintrag.slotIndex);
        notify(eintrag.selbst ? "Zurück auf deiner Farm." : `Bei ${eintrag.name} angekommen.`);
    }, [teleportToSlot, notify]);

    const chatAbschicken = useCallback(() => {
        const text = chatEingabe.trim();
        if (!text) return;
        const farbHex = CHAT_FARBEN.find((f) => f.id === chatFarbe)?.hex || null;
        if (!sendChat(text, farbHex)) {
            notify("Keine Verbindung zur Welt.", "error");
            return;
        }
        setChatEingabe("");
    }, [chatEingabe, chatFarbe, sendChat, notify]);

    const teleportToShopArea = useCallback(() => {
        const area = engineRef.current.areas.seedShop;
        // Muss INNERHALB von INTERACT_DIST (180) landen, sonst erscheint der
        // Öffnen-Knopf nicht und die Schnellreise bringt einen nur in die Nähe.
        // Der alte Versatz (+120/+180) lag mit 216 px genau darüber.
        setzePlayerPosition(area.x, area.y + 130);
    }, [setzePlayerPosition]);

    const teleportToMarketArea = useCallback(() => {
        const area = engineRef.current.areas.market;
        // Bug (Feedback 29.08.: "Shift+1 spawnt im Markt drin"): der Versatz lag
        // mit 90 px UNTER dem Kollisionsradius des Markts (130, siehe
        // COLLISION_RADIUS_BY_AREA_TYPE) — die Schnellreise setzte einen also
        // mitten in die gesperrte Zone. teleportToShopArea nutzt zum Vergleich
        // exakt den Kollisionsradius seines Ziels (130) als Versatz.
        setzePlayerPosition(area.x, area.y + 150);
    }, [setzePlayerPosition]);

    const setShopRotationIfChanged = useCallback((nextRotation) => {
        setShopRotation((prev) => {
            const prevGen = Number(prev?.generatedAt || 0);
            const nextGen = Number(nextRotation?.generatedAt || 0);
            if (prevGen && nextGen && prevGen === nextGen) return prev;
            return nextRotation || null;
        });
    }, []);

    const apiCall = useCallback(async (path, options = {}) => {
        // Ein zurückgetretener Tab (siehe nurZuschauen) darf den Serverstand nicht
        // mehr verändern. Vorher galt die Sperre NUR fürs Speichern: Ernten,
        // Kaufen und der Tier-Tick liefen weiter. Zwei Folgen — was hier gekauft
        // wurde, war für immer verloren (Gold serverseitig weg, Ware nur lokal),
        // und jede Ernte liess den führenden Tab beim nächsten Speichern in einen
        // Konflikt laufen, den dieser zu SEINEN Gunsten auflöst: die Pflanze kam
        // zurück, das Gold dafür blieb.
        const veraendernd = String(options.method || "GET").toUpperCase() !== "GET";
        if (veraendernd && nurZuschauenRef.current) {
            const fehler = new Error("Dieser Tab spielt nur zu — hol erst den aktuellen Stand.");
            fehler.status = 423;
            throw fehler;
        }
        // Herkunft an JEDE Wirtschafts-Aktion hängen — an einer Stelle, damit es
        // kein Aufrufer vergessen kann. Der Server weist damit Aktionen aus einem
        // zweiten, zurückgetretenen Tab ab (siehe POST /action).
        let optionen = options;
        if (veraendernd && path === "/action" && typeof options.body === "string") {
            try {
                const roh = JSON.parse(options.body);
                optionen = {
                    ...options,
                    body: JSON.stringify({ ...roh, tabId: TAB_ID, stateVersion: stateVersionRef.current }),
                };
            } catch { /* kein JSON — dann eben unverändert */ }
        }
        const res = await fetch(`/api/garden${path}`, {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-VF-Geraet": GERAET_ID,
                ...(optionen.headers || {}),
            },
            ...optionen,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            // Status und Nutzlast mitgeben: der Speicherweg muss den 409 („Spielstand
            // veraltet") von einem gewöhnlichen Fehler unterscheiden können.
            const fehler = new Error(data.error || "API Fehler");
            fehler.status = res.status;
            fehler.data = data;
            throw fehler;
        }
        // Der Zähler gegen verspätete Speicherstände. Jede Aktion zählt ihn auf dem
        // Server hoch; hier landet er an EINER Stelle, damit kein Aufrufer ihn
        // vergessen kann (siehe erhoeheVersion in Backend/routes/gardenGameRoutes.js).
        if (typeof data?.stateVersion === "number") stateVersionRef.current = data.stateVersion;
        // Jede Aktion bringt den Fähigkeitsstand mit. An EINER Stelle übernommen,
        // damit kein Aufrufer ihn vergessen kann — wie beim Zähler darüber.
        if (data?.skillStand) setSkillStand(data.skillStand);
        return data;
    }, []);

    // Gefragte Sorten am Markt (Backend core/nachfrage.js) — Anzeige in der Info-Tafel.
    const nachfrage = useNachfrage({ apiCall, showLobbyScreen });
    // Wochenwettbewerb (Backend world/wettbewerb.js) — vom Missionsbrett-Reiter abgerufen.
    const ladeWettbewerb = useCallback(() => apiCall("/wettbewerb"), [apiCall]);
    const ladeSaisonziele = useCallback(() => apiCall("/saisonziele"), [apiCall]);

    /**
     * Wirkung einer Fähigkeit (0 = nicht gelernt). Rechnet aus Bauplan und Stufe
     * dasselbe wie `wirkung()` im Backend. Als Ref, weil die Rechnung in Handlern
     * und im Wetter-Intervall gebraucht wird, wo ein State veraltet wäre.
     */
    const skillWirkung = useCallback((id) => skillWirkungRef.current[id] || 0, []);
    /** Rohe Stufe einer Fähigkeit — für Staffeln, die nicht linear rechnen. */
    const skillStufe = useCallback((id) => skillStufenRef.current[id] || 0, []);
    useEffect(() => {
        const raus = {};
        const stufen = {};
        for (const skill of skillKatalog) {
            const stufe = Math.max(0, Math.min(skill.stufen, Number(skillStand?.skills?.[skill.id]) || 0));
            stufen[skill.id] = stufe;
            // Fähigkeiten mit `werte` sind eine feste Staffel statt eines Zuwachses
            // je Stufe (siehe Regenmacher) — dieselbe Fallunterscheidung wie in
            // wirkung() im Backend.
            raus[skill.id] = Array.isArray(skill.werte)
                ? (stufe === 0 ? 0 : (skill.werte[stufe - 1] ?? 0))
                : stufe * skill.proStufe;
        }
        skillWirkungRef.current = raus;
        skillStufenRef.current = stufen;
    }, [skillKatalog, skillStand]);

    // Wert-Vorschau an Pflanzen (getExpectedSellValue) rechnet den Vielfalt-Bonus mit.
    useEffect(() => {
        setzeVielfaltFaktor(vielfaltStand(plotPlants, skillWirkung("sortenkenner")).faktor);
    }, [plotPlants, skillKatalog, skillStand, skillWirkung]);

    useEffect(() => {
        if (showLobbyScreen) return;

        const assetSet = new Set([
            "/garden-assets/common/planted_seed.png",
            "/garden-assets/atlas/garden_atlas.png",
            "/garden-assets/world/mailbox.png",
            ...Object.values(AREA_IMAGES),
            ...Object.values(TOOL_IMAGE_BY_KEY),
            ...TERRAIN_ASSET_IMAGES,
            ...Object.values(PET_IMAGE_BY_TYPE),
            ...DECO_SHOP_ITEMS.map((item) => item.image),
            ...EGG_SHOP_CATALOGUE.map((item) => item.image), // HINZUGEFÜGT
            ...WARDROBE_SKINS.map((item) => item.skin).filter(Boolean),
        ]);
        const enqueueItem = (item) => {
            for (const path of collectVisualAssetPaths(withVisuals(item))) {
                assetSet.add(path);
            }
        };

        for (const item of inventory.slice(0, 120)) enqueueItem(item);
        for (const item of harvestedItems.slice(0, 120)) enqueueItem(item);
        for (const plant of Object.values(plotPlants).slice(0, 180)) enqueueItem(plant);
        for (const deco of decoInventory.slice(0, 120)) enqueueItem(deco);
        for (const deco of decoPlacements.slice(0, 200)) enqueueItem(deco);
        
        // HINZUGEFÜGT:
        for (const egg of eggInventory.slice(0, 120)) enqueueItem(egg);
        for (const pet of petInventory.slice(0, 120)) enqueueItem(pet);
        for (const pet of petPlacements.slice(0, 120)) enqueueItem(pet);

        const pending = [...assetSet].filter((src) => !preloadedAssetsRef.current.has(src));
        if (!pending.length) return;

        const hasRIC = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
        const hasCancelRIC = typeof window !== "undefined" && typeof window.cancelIdleCallback === "function";
        let cancelled = false;
        let idleId = null;
        let timeoutId = null;

        const step = (deadline) => {
            if (cancelled) return;
            let loaded = 0;
            const canContinue = () => {
                if (!deadline) return loaded < 14;
                if (typeof deadline.timeRemaining === "function") return deadline.timeRemaining() > 3 && loaded < 20;
                return loaded < 16;
            };
            while (pending.length && canContinue()) {
                preloadImage(pending.shift());
                loaded += 1;
            }
            if (!pending.length || cancelled) return;
            if (hasRIC) idleId = window.requestIdleCallback(step, { timeout: 120 });
            else timeoutId = window.setTimeout(() => step(null), 20);
        };

        if (hasRIC) idleId = window.requestIdleCallback(step, { timeout: 120 });
        else timeoutId = window.setTimeout(() => step(null), 0);

        return () => {
            cancelled = true;
            if (idleId !== null && hasCancelRIC) window.cancelIdleCallback(idleId);
            if (timeoutId !== null) clearTimeout(timeoutId);
        };
    }, [showLobbyScreen, inventory, harvestedItems, plotPlants, decoInventory, decoPlacements, preloadImage]);

    // Shop-Rotation: nur fehlende Samen-Icons einzeln warm laden (kein Abbruch des übrigen Idle-Preloads)
    useEffect(() => {
        if (showLobbyScreen) return;
        if (!shopRotation?.seeds?.length) return;
        const t = requestAnimationFrame(() => {
            for (const seed of shopRotation.seeds) {
                for (const path of collectVisualAssetPaths(withVisuals(seed))) {
                    if (path && !preloadedAssetsRef.current.has(path)) preloadImage(path);
                }
            }
        });
        return () => cancelAnimationFrame(t);
    }, [showLobbyScreen, shopRotation?.generatedAt, shopRotation, preloadImage]);

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (twitchUser) {
            setAuthUser(twitchUser);
            return;
        }
        const loadAuth = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "include" });
                if (!res.ok) return;
                const me = await res.json();
                setAuthUser(me);
            } catch {
                // ignore
            }
        };
        loadAuth();
    }, [twitchUser]);

    /**
     * Serverstand in die React-States übernehmen.
     *
     * Steht bewusst ausserhalb des Ladeeffekts: zwei Wege brauchen ihn — das Laden
     * beim Betreten der Welt und das Nachladen, wenn ein Admin den Spielstand von
     * aussen geändert hat (garden:admin_update).
     */
    const applyServerState = useCallback((saved) => {
        if (!saved || typeof saved !== "object" || (saved.gold === undefined && !saved.inventory)) return false;
        console.log("Lade Spielstand von Datenbank...");
        // Ab hier speichert dieser Browser gegen genau diesen Stand.
        stateVersionRef.current = Number(saved.stateVersion) || 0;
        if (typeof saved.gold === "number") setGold(saved.gold);
        if (typeof saved.goldGesamt === "number") setGoldGesamt(saved.goldGesamt);
        if (Array.isArray(saved.inventory)) setInventory(hydrateSeeds(saved.inventory));
        if (saved.plotPlants) setPlotPlants(normalizePlotPlantsMap(saved.plotPlants));
        const unlocked = resolvePlotUnlockedCells(saved);
        setPlotUnlockedCells(unlocked);
        setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(unlocked.length / BASE_DIRT_COLS)));
        if (Array.isArray(saved.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(saved.harvestedItems));
        if (Array.isArray(saved.chestItems)) setChestItems(hydrateHarvestedItems(saved.chestItems));
        if (Array.isArray(saved.vitrineItems)) setVitrineItems(hydrateHarvestedItems(saved.vitrineItems));
        if (saved.logbuch && typeof saved.logbuch === "object") setLogbuch(saved.logbuch);
        if (Array.isArray(saved.eggInventory)) setEggInventory(saved.eggInventory);
        if (Array.isArray(saved.petInventory)) setPetInventory(hydratePets(saved.petInventory));
        if (Array.isArray(saved.petPlacements)) setPetPlacements(hydratePets(saved.petPlacements));
        if (Array.isArray(saved.decoInventory)) setDecoInventory(saved.decoInventory);
        if (Array.isArray(saved.decoPlacements)) setDecoPlacements(saved.decoPlacements);
        // Ein Serverstand ERSETZT den Kasten, er wird nicht verrechnet: was dort
        // steht, ist die Wahrheit. `setzeWerkzeug` schreibt Ref und State in einem
        // Zug, damit ein Kauf unmittelbar danach nicht mehr den alten Stand sieht.
        if (saved.toolInventory) setzeWerkzeug(normalizeToolInventory(saved.toolInventory));
        setGebaeudeVersatz(normalizeGebaeudeVersatz(saved.gebaeudeVersatz));
        if (typeof saved.inventoryMaxSlots === "number") setInventoryMaxSlots(Math.max(50, saved.inventoryMaxSlots));
        // `saved.shopStock` wird BEWUSST nicht mehr übernommen: der Samenvorrat gilt
        // zwar wieder je Spieler, gezählt wird er aber seit v4.0 beim SERVER. Ein
        // Wert aus dem eigenen Spielstand würde den echten Reststand überschreiben —
        // und wäre wieder der Weg, über den man sich unbegrenzt Samen kaufen konnte.
        // Das Feld bleibt im Spielstand stehen, damit ältere Server damit klarkommen.
        if (saved.toolShopStock && typeof saved.toolShopStock === "object" && Object.keys(saved.toolShopStock).length > 0) {
            savedToolShopStockRef.current = {
                stock: saved.toolShopStock,
                version: typeof saved.toolShopStockVersion === "number" ? saved.toolShopStockVersion : 0,
            };
        }
        if (saved.eggShopStock && typeof saved.eggShopStock === "object" && Object.keys(saved.eggShopStock).length > 0) {
            savedEggShopStockRef.current = {
                stock: saved.eggShopStock,
                version: typeof saved.eggShopStockVersion === "number" ? saved.eggShopStockVersion : 0,
            };
        }
        // Meldung an die drei Wiederherstellungs-Effekte, dass jetzt etwas da ist.
        // OHNE das hing alles daran, dass die Ladenrotation SPÄTER eintrifft als der
        // Spielstand: kam sie früher (reines Wettrennen zweier Anfragen), lief der
        // Effekt einmal ins Leere und danach bis zur nächsten Rotation nie wieder —
        // der Laden stand nach dem Neubetreten wieder voll da. Wer oft genug neu
        // betrat, konnte Samen, Gießkannen, Töpfe und Eier beliebig oft kaufen.
        setLadenbestandGeladen((n) => n + 1);
        if (saved.incubator) setIncubator(saved.incubator);
        // normalisiereSkin fängt den alten Pfad ab: der Hauptskin lag bis v3.6 unter
        // wardrobe/farmer.png und ist jetzt eine von zwölf Farben im Unterordner.
        // Ohne das wäre die Figur bei allen Bestandsspielern unsichtbar.
        if (saved.appearance) setPlayerAppearance({ skin: normalisiereSkin(saved.appearance.skin) });
        if (typeof saved.tutorialCompleted === "boolean") setTutorialCompleted(saved.tutorialCompleted);
        if (saved[ACKERRASTER_MARKE] === true) setAckerRasterMigriert(true);
        if (Array.isArray(saved.mailbox)) setMailboxState(saved.mailbox);
        return true;
    }, [normalizePlotPlantsMap, setzeWerkzeug]);

    /**
     * Serverstand holen und übernehmen — der gemeinsame Weg für alles, was diesen
     * Browser hinter die Wirklichkeit zurückfallen lässt:
     *
     *   * ein Admin hat von aussen etwas geändert (garden:admin_update)
     *   * ein eigener Speicherstand kam zu spät (409, siehe flushFarmStateToServer)
     *
     * Der laufende Speicher-Timer muss vorher weg: sonst schickt genau er in den
     * Sekunden zwischen Anlass und Antwort noch den ALTEN Rucksack hoch und macht
     * die Änderung wieder zunichte. Gold und Ernte wären davon nicht betroffen (die
     * gehören dem Server), Samen, Tiere, Eier und Deko schon.
     */
    const uebernimmVomServer = useCallback(async (hinweis, typ = "success") => {
        clearTimeout(saveTimeoutRef.current);
        try {
            const data = await apiCall("/farm-state");
            applyServerState(data.state);
            if (data.ernteRausch) setErnteRausch(data.ernteRausch);
            if (Array.isArray(data.stoerer)) setStoerer(data.stoerer);
            setZuchtbuch(data.state?.zuchtbuch || {});
            setWettbewerbSiege(Array.isArray(data.state?.wettbewerbSiege) ? data.state.wettbewerbSiege : []);
            if (data.prestige) setPrestigeStand(data.prestige);
            if (hinweis) notify(hinweis, typ);
            return true;
        } catch {
            notify("Abgleich mit dem Server fehlgeschlagen — bitte die Seite neu laden.", "error");
            return false;
        }
    }, [apiCall, applyServerState, notify]);


    // Bauplan des Fähigkeitsbaums — einmal je Sitzung, er ändert sich nicht.
    useEffect(() => {
        if (showLobbyScreen) return;
        let abgebrochen = false;
        apiCall("/skills")
            .then((data) => {
                if (abgebrochen) return;
                if (Array.isArray(data?.katalog)) setSkillKatalog(data.katalog);
                if (data?.stand) setSkillStand(data.stand);
                if (data?.xpJeSorte) setXpJeSorte(data.xpJeSorte);
            })
            .catch(() => { /* ohne Baum spielt es sich weiter, nur ohne Boni-Anzeige */ });
        return () => { abgebrochen = true; };
    }, [showLobbyScreen, apiCall]);

    /**
     * Missionsbrett neu laden — beim Öffnen des Brettes (activateInteractable)
     * UND nach jedem Abholen, damit der neue Stand (z. B. eine jetzt erreichte
     * nächste Mission) sofort sichtbar ist.
     */
    const ladeQuests = useCallback(async () => {
        try {
            const data = await apiCall("/quests");
            // Bug gefunden (Feedback 31.08.: "reset zeit sichtbar machen"): die beiden
            // Reset-Zeitpunkte kommen vom Server mit, fielen hier aber unter den Tisch —
            // die Countdown-Anzeige im Missionsbrett stand deshalb seit Einführung immer
            // auf undefined und zeigte gar nichts.
            setQuestDaten({
                taeglich: Array.isArray(data?.taeglich) ? data.taeglich : [],
                woechentlich: Array.isArray(data?.woechentlich) ? data.woechentlich : [],
                naechsteTaeglicheAb: Number(data?.naechsteTaeglicheAb) || 0,
                naechsteWoechentlicheAb: Number(data?.naechsteWoechentlicheAb) || 0,
                // Händler-Aufträge stehen im selben Brett (core/auftraege.js).
                auftraege: data?.auftraege && Array.isArray(data.auftraege.plaetze) ? data.auftraege : null,
                // Erntefest aller Spieler (world/erntefest.js).
                erntefest: data?.erntefest && typeof data.erntefest === "object" ? data.erntefest : null,
            });
        } catch { /* Brett bleibt beim letzten bekannten Stand */ }
    }, [apiCall]);

    useEffect(() => {
        ladeQuestsRef.current = ladeQuests;
    }, [ladeQuests]);

    /**
     * Gold-Shop neu laden — beim Öffnen UND nach jedem Kauf/Ausrüsten, damit
     * "schon gekauft"/"ausgerüstet" sofort stimmt. `meineReskinsRef` zieht
     * gleich mit: der Renderer liest von dort (Schuppenbild, Briefkasten,
     * Nameplate-Farbe), nicht aus dem React-State selbst.
     */
    const ladeGoldShop = useCallback(async () => {
        try {
            const data = await apiCall("/reskins");
            setGoldShopDaten({
                katalog: data?.katalog && typeof data.katalog === "object" ? data.katalog : {},
                ausgeruestet: data?.ausgeruestet && typeof data.ausgeruestet === "object" ? data.ausgeruestet : {},
            });
            meineReskinsRef.current = {
                shed: data?.ausgeruestet?.shed || null,
                mailbox: data?.ausgeruestet?.mailbox || null,
                werkzeug: data?.ausgeruestet?.werkzeug || null,
                nameplate: data?.ausgeruestet?.nameplate || null,
            };
            // KEIN einmaliges area.shed.image = ... hier — die Positions-Effekte
            // (a.shed.image = AREA_IMAGES.shed, siehe useEffect oben) laufen
            // unabhängig davon noch einmal und hätten die Zuweisung wieder
            // überschrieben. Der Schuppen bekommt sein Reskin deshalb wie
            // Briefkasten/Nameplate JEDEN Frame in der Spielschleife (siehe dort).
        } catch { /* Laden bleibt beim letzten bekannten Stand */ }
    }, [apiCall]);

    // Einmal beim Betreten laden — sonst zeigt der eigene Schuppen/Briefkasten
    // erst nach dem ersten Öffnen des Gold-Shops das ausgerüstete Reskin.
    useEffect(() => {
        if (showLobbyScreen) return;
        ladeGoldShop();
    }, [showLobbyScreen, ladeGoldShop]);

    // questAbholen selbst steht erst nach applyEconomy weiter unten — sie hängt
    // per Dependency-Array direkt davon ab, und applyEconomy ist an dieser Stelle
    // noch nicht deklariert (TDZ: "Cannot access 'applyEconomy' before
    // initialization", gefunden beim ersten echten Laden im Browser).

    // Aufstieg melden. Der erste Stand nach dem Laden zählt nicht als Aufstieg —
    // sonst begrüßt einen das Spiel bei jedem Betreten mit „Level 14 erreicht".
    const letztesLevelRef = useRef(null);
    useEffect(() => {
        const level = skillStand?.level;
        if (!level) return;
        const vorher = letztesLevelRef.current;
        letztesLevelRef.current = level;
        if (vorher === null || level <= vorher) return;
        notify(`Level ${level} erreicht — ein Fähigkeitspunkt wartet.`);
    }, [skillStand?.level, notify]);

    const lerneSkill = useCallback(async (id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST", body: JSON.stringify({ action: "skillLernen", skill: id }),
            });
            if (data?.skillStand) setSkillStand(data.skillStand);
            const skill = skillKatalog.find((s) => s.id === id);
            notify(`${skill?.name || "Fähigkeit"} verbessert.`);
        } catch (err) {
            notify(err?.data?.error || "Das hat nicht geklappt.", "error");
        }
    }, [apiCall, notify, skillKatalog]);

    const setzeSkillsZurueck = useCallback(async () => {
        try {
            const data = await apiCall("/action", {
                method: "POST", body: JSON.stringify({ action: "skillsZuruecksetzen" }),
            });
            if (data?.skillStand) setSkillStand(data.skillStand);
            // Zurücksetzen kostet seit v3.5 Gold — der Server bucht ab, hier wird
            // sein Stand übernommen, damit der nächste Autosave ihn nicht überschreibt.
            if (typeof data?.gold === "number") { goldRef.current = data.gold; setGold(data.gold); }
            notify(data?.bezahlt
                ? `Alle Punkte zurückgeholt — ${Number(data.bezahlt).toLocaleString("de-DE")} Gold bezahlt.`
                : "Alle Fähigkeitspunkte sind wieder frei.");
        } catch (err) {
            notify(err?.data?.error || err?.message || "Das hat nicht geklappt.", "error");
        }
    }, [apiCall, notify]);

    useEffect(() => {
        adminUpdateRef.current = (info, art) => uebernimmVomServer(
            art === "helfer" ? (info || "Jemand hat auf deinem Feld gearbeitet.")
                : info ? `Admin: ${info}` : "Deine Farm wurde angepasst.",
        );
        serverVersionRef.current = (version) => {
            // Erst ab dem zweiten Betreten prüfen: beim ersten holt der Ladeweg den
            // Stand ohnehin frisch, und der Zähler steht dann noch auf 0.
            if (!isInitialLoadDoneRef.current) return;
            if (!(Number(version) > stateVersionRef.current)) return;
            console.log(`[Garden] Server ist weiter (${stateVersionRef.current} → ${version}) — Stand wird geholt.`);
            uebernimmVomServer(null);
        };
    }, [uebernimmVomServer]);

    useEffect(() => {
        if (showLobbyScreen) return;
        const loadFarm = async () => {
            try {
                const data = await apiCall("/farm-state");
                applyServerState(data.state);
                if (data.ernteRausch) setErnteRausch(data.ernteRausch);
                if (Array.isArray(data.stoerer)) setStoerer(data.stoerer);
                setZuchtbuch(data.state?.zuchtbuch || {});
                setWettbewerbSiege(Array.isArray(data.state?.wettbewerbSiege) ? data.state.wettbewerbSiege : []);
            if (data.prestige) setPrestigeStand(data.prestige);
                // Gewinne aus dem Wochenwettbewerb, beim Laden abgerechnet.
                for (const g of Array.isArray(data.wettbewerbGewinne) ? data.wettbewerbGewinne : []) {
                    notify(`Wochenwettbewerb: ${g.platz}. Platz mit ${KATALOG_NACH_ID.get(g.sorte)?.name || g.sorte} (Größe ${formatGroesse(g.groesse)}) — +${Number(g.gold).toLocaleString("de-DE")} Gold!`);
                }
                // Kein Offline-Bericht mehr: Tiere arbeiten nur noch, solange man
                // zusieht (siehe engine/PetSystem.js).
            } catch (err) {
                console.error("Fehler beim Laden von der DB:", err);
                if (err?.data?.zweitkonto) setZweitkontoText(err.message);
                const m = err?.message || "";
                if (m.includes("Nicht eingeloggt") || m.includes("Session") || m.includes("ungültig") || m.includes("abgelaufen")) {
                    notify("Garden: Bitte mit Twitch anmelden (gültige Session erforderlich).", "error");
                }
            }
            setIsInitialLoadDone(true);
            markWorldBootDataReady("multi");
        };
        loadFarm();
    }, [showLobbyScreen, apiCall, markWorldBootDataReady, applyServerState, notify]);

    // BEWUSST KEIN automatisches Nachladen nach einem Verbindungsabriss:
    // Waehrend der Unterbrechung kann der Browser nicht speichern. Ein Nachladen
    // wuerde alles verwerfen, was in der Zwischenzeit gepflanzt oder platziert
    // wurde. Der Server ist ohnehin nur fuer Gold und Ernte massgeblich; alles
    // andere gehoert dem Browser, bis er es das naechste Mal schickt.

    useEffect(() => {
        const savedApp = localStorage.getItem("garden_appearance");
        if (savedApp) {
            // Auch hier über normalisiereSkin: im localStorage steht bei allen
            // Bestandsspielern noch der alte Pfad wardrobe/farmer.png.
            try {
                const gelesen = JSON.parse(savedApp);
                setPlayerAppearance({ skin: normalisiereSkin(gelesen?.skin) });
            } catch { /* ignore */ }
        }
    }, []);

    useEffect(() => {
        if (layout.current && layout.current.slots[mySlotRef.current]) {
            layout.current.slots[mySlotRef.current].hasMail = mailbox.length > 0;

        }
    }, [mailbox]);

    useEffect(() => {
        localStorage.setItem("garden_appearance", JSON.stringify(playerAppearance));
    }, [playerAppearance]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (!isInitialLoadDone) return;
        // Server-Persist via API (5s debounce, Twitch-Session nötig).
        //
        // Die Nutzlast wird BEWUSST nicht mehr hier gebaut, sondern in
        // flushFarmStateToServer — es gab sie zweimal, und sie waren auseinander:
        // dieser Weg schickte `appearance` mit, der andere nicht, weshalb jedes
        // debouncedSave die Kleidung auf den Standard zurücksetzte, bis fünf Sekunden
        // später dieser Effekt sie wieder richtigstellte.
        const timer = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 5000);
        return () => clearTimeout(timer);
    }, [showLobbyScreen, isInitialLoadDone, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation?.generatedAt,playerAppearance, tutorialCompleted, apiCall]);

    useEffect(() => {
        if (!isIncubatorOpen) return;
        setTickNow(Date.now());
        const t = setInterval(() => setTickNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [isIncubatorOpen]);

    // Beim ECHTEN Unmount aufräumen. Der Canvas-Listener-Effekt darf das nicht mehr
    // tun: er wird von jeder Ernte neu aufgesetzt und hat dabei das laufende Ziehen
    // und das Schaufel-Halten abgebrochen.
    useEffect(() => () => {
        rotationBannerTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
        rotationBannerTimeoutsRef.current.clear();
        if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
        if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
        isDragHarvestingRef.current = false;
        dragHarvestedCellsRef.current.clear();
        // Bewusst NICHT mehr abschicken (kein flushDragErnte hier) — die Seite
        // wird gerade verlassen, eine Antwort träfe auf eine schon abgebaute
        // Komponente. Nur den Timer stoppen, der sonst ins Leere liefe.
        if (dragErnteFlushTimerRef.current) clearTimeout(dragErnteFlushTimerRef.current);
        dragErnteSammlungRef.current.clear();
    }, []);

    useEffect(() => {
        // Rucksackplätze = 50 Grund + 10 je Rucksackstufe. „Lagerist" gibt seit v2
        // (Punkt 4) keine eigenen Plätze mehr dazu — er verbilligt nur noch den Kauf
        // hier oben (siehe skillWirkung("lagerist") im Shop-Preis weiter unten), sonst
        // wäre er derselbe Effekt wie diese Kaufkurve über einen zweiten Hebel.
        const level = Math.min(BACKPACK_MAX_LEVEL, normalizeToolInventory(toolInventory).backpackLevel || 0);
        const ziel = 50 + level * 10;
        if (ziel > 50) setInventoryMaxSlots(prev => Math.max(prev, ziel));
        // Das Ref wird hier BEWUSST nicht mehr geschrieben.
        //
        // Früher stand hier ein Rückschreiben aus dem State, abgesichert mit Math.max
        // für die Zähler, die nur wachsen. Das war ein Pflaster auf dem falschen
        // Bein: der Commit des VORIGEN Kaufs traf ein, nachdem der nächste schon
        // hochgezählt hatte, und drehte alles zurück, was nicht unter dem Math.max
        // stand — Gießkannen, Pflanztöpfe, Hackenladungen. Seit alle Änderungen durch
        // `setzeWerkzeug` laufen, ist das Ref die Wahrheit und der State ihr Abbild;
        // die Gegenrichtung darf es gar nicht mehr geben.
    }, [toolInventory]);

    /**
     * Bescheid geben, wenn im Inkubator etwas fertig geworden ist.
     *
     * Vorher gab es dafür überhaupt kein Zeichen: die Brutzeit läuft bis zu drei
     * Tage (Feedback 01.09.: Rarity-Brutzeiten deutlich angehoben, siehe
     * hatchTimeByRarity in placeEggInIncubator), und ob ein Ei durch ist, sah man
     * nur, wenn man zufällig hinlief und das Fenster öffnete. Der Zähler wird
     * mitgeführt, damit dieselbe fertige Brut nicht alle paar Sekunden erneut
     * gemeldet wird.
     */
    const gemeldeteEierRef = useRef(0);
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return undefined;
        const pruefe = () => {
            const jetzt = Date.now();
            const fertig = (incubator.slots || []).filter((s) => s && jetzt >= s.hatchAt).length;
            if (fertig > gemeldeteEierRef.current) {
                notify(fertig === 1
                    ? "Im Inkubator ist ein Ei fertig."
                    : `Im Inkubator sind ${fertig} Eier fertig.`);
                playSound("open", 0.35);
            }
            gemeldeteEierRef.current = fertig;
        };
        pruefe();
        const t = setInterval(pruefe, 5000);
        return () => clearInterval(t);
    }, [showLobbyScreen, isInitialLoadDone, incubator, notify, playSound]);

    /**
     * Hover-Karte wegnehmen, sobald der Rucksack zugeht.
     *
     * Ein Klick auf einen Gegenstand nimmt ihn in die Hand UND schließt das Fenster.
     * Damit verschwindet die Kachel unter dem Zeiger, ohne dass je ein mouseleave
     * kommt — die Karte blieb dann über dem Spiel stehen, bis man zufällig wieder
     * über eine andere Kachel fuhr. Gleiches gilt für Schließen mit Tab oder [X].
     */
    useEffect(() => {
        if (!isBackpackOpen) setItemHoverTooltip(null);
    }, [isBackpackOpen]);

    // Bestände in die Refs spiegeln — die Kaufprüfungen lesen ausschließlich dort.
    useEffect(() => { ladenBestandRef.current = ladenBestand; }, [ladenBestand]);
    useEffect(() => { toolShopStockRef.current = toolShopStock; }, [toolShopStock]);
    useEffect(() => { eggShopStockRef.current = eggShopStock; }, [eggShopStock]);

    useEffect(() => {
        selectedToolRef.current = selectedTool;
    }, [selectedTool]);

    // Samen und Tier in der Hand ebenfalls als Ref: der Klick-Handler laeuft
    // aus einer Closure heraus und wuerde sonst den Stand von vor dem letzten
    // Rendern sehen — beim schnellen Setzen mehrerer Samen genau den falschen.
    useEffect(() => { selectedSeedRef.current = selectedSeed; }, [selectedSeed]);
    useEffect(() => { selectedPetToPlaceRef.current = selectedPetToPlace; }, [selectedPetToPlace]);

    useEffect(() => {
        movingPlantSourceRef.current = movingPlantSource;
    }, [movingPlantSource]);

    useEffect(() => {
        decoGespiegeltRef.current = decoGespiegelt;
    }, [decoGespiegelt]);

    useEffect(() => {
        decoRotiertRef.current = decoRotiert;
    }, [decoRotiert]);

    // Spiegelung über mehrere Platzierungen hinweg behalten (man stellt selten nur eine
    // Laterne), aber zurücksetzen, sobald man die Deko ganz aus der Hand legt.
    useEffect(() => {
        selectedDecoToPlaceRef.current = selectedDecoToPlace;
        if (!selectedDecoToPlace) setDecoGespiegelt(false);
    }, [selectedDecoToPlace]);

    // Spiegel für das Malen von Bodenbelägen. Fängt alles ab, was NICHT aus dem
    // Setzen selbst kommt — Laden des Spielstands, Aufheben mit der Schaufel,
    // Admin-Eingriff. Das Setzen schreibt die Refs schon vorher selbst.
    useEffect(() => { decoPlacementsRef.current = decoPlacements; }, [decoPlacements]);
    useEffect(() => { decoInventoryRef.current = decoInventory; }, [decoInventory]);

    useEffect(() => {
        if (selectedTool) {
            // Werkzeuge zeichnet jeder Client für sich aus `selectedTool`; an die
            // anderen geht nichts, sonst sähe man die Gießkanne aller Nachbarn.
            // Die Shotgun ist die Ausnahme — dass die anderen sie sehen, IST der
            // Witz an ihr. Sie geht deshalb als Hand-Item mit raus.
            heldItemRef.current = selectedTool === "shotgun" ? SHOTGUN_HAND_ITEM : null;
            return;
        }
        if (selectedSeed) {
            heldItemRef.current = withVisuals(selectedSeed);
            return;
        }
        // NEU: Deko und Tiere/Eier an den Renderer übergeben!
        if (selectedDecoToPlace) {
            heldItemRef.current = selectedDecoToPlace;
            return;
        }
        if (selectedPetToPlace) {
            heldItemRef.current = selectedPetToPlace;
            return;
        }
        heldItemRef.current = selectedCarryItem ? withVisuals(selectedCarryItem) : null;
    }, [selectedTool, selectedSeed, selectedCarryItem, selectedDecoToPlace, selectedPetToPlace]);

    // Die anderen sollen sehen, was man trägt — samt Größe und Sonderform.
    useEffect(() => {
        if (showLobbyScreen) return;
        sendHeld(heldItemRef.current);
    }, [showLobbyScreen, sendHeld, selectedTool, selectedSeed, selectedCarryItem,
        selectedDecoToPlace, selectedPetToPlace]);

    useEffect(() => {
        if (!selectedCarryItem) return;
        const selectedId = selectedCarryItem.id || selectedCarryItem.instanceId;
        if (!selectedId) return;
        // NEU: Auch im Eier-Inventar suchen, damit sie nicht aus der Hand verschwinden!
        const inHarvested = harvestedItems.some((item) => (item.id || item.instanceId) === selectedId);
        const inEggs = eggInventory.some((item) => (item.id || item.instanceId) === selectedId);
        if (!inHarvested && !inEggs) setSelectedCarryItem(null);
    }, [harvestedItems, eggInventory, selectedCarryItem]);

    useEffect(() => {
        if (!selectedDecoToPlace?.instanceId) return;
        const stillExists = decoInventory.some((item) => item.instanceId === selectedDecoToPlace.instanceId);
        if (!stillExists) setSelectedDecoToPlace(null);
    }, [decoInventory, selectedDecoToPlace]);

    useEffect(() => {
        renderProfileRef.current = renderProfile;
    }, [renderProfile]);

    useEffect(() => {
        weatherStateRef.current = weatherState;
    }, [weatherState]);

    useEffect(() => {
        if (selectedTool === "watering" && (toolInventory.wateringCans || 0) <= 0) {
            setSelectedTool(null);
        }
    }, [selectedTool, toolInventory.wateringCans]);

    useEffect(() => {
        if (selectedTool === "pickaxe" && (toolInventory.pickaxeUses || 0) <= 0) {
            setSelectedTool(null);
        }
    }, [selectedTool, toolInventory.pickaxeUses]);

    useEffect(() => {
        if (selectedTool === "pot" && (toolInventory.plantPots || 0) <= 0) {
            setSelectedTool(null);
            setMovingPlantSource(null);
        }
    }, [selectedTool, toolInventory.plantPots]);

    useLadenRotation({
        letzterKaufAtRef, setLadenBestand, savedToolShopStockRef, toolShopRotation,
        setToolShopStock, ladenbestandGeladen, savedEggShopStockRef, eggShopRotation,
        setEggShopStock, showLobbyScreen, apiCall, setShopRotationIfChanged,
        bestandFuerRotationRef, seedRotationKeyRef, announceRotation, seedNextRotationAtRef,
        setToolShopRotation, toolRotationKeyRef, toolShopSeededForGenAtRef, toolNextRotationAtRef,
        letzterToolKaufAtRef, setEggShopRotation, eggRotationKeyRef, eggShopSeededForGenAtRef,
        eggNextRotationAtRef, setShopCountdown, setToolShopCountdown, setEggShopCountdown,
        ladenOffenRef, shopRotation, shopBootstrapTriedRef, weltUebersteuerung, setWeatherState,
        playSound, notify,
    });

    useWetterUndUhr({
        showLobbyScreen, weatherState, setWeatherState, tagesInfoRef, weltRef, setTagesInfo,
        notify, skillWirkung, setPlotPlants,
    });

    // Ungelesene Chatzeilen zählen, solange das Fenster zu ist. Beim Öffnen wieder
    // auf null — sonst müsste man die Nachrichten einzeln „wegklicken".
    const chatGesehenRef = useRef(0);
    useEffect(() => {
        if (istChatOffen) {
            chatGesehenRef.current = chatVerlauf.length;
            setChatUngelesen(0);
            return;
        }
        setChatUngelesen(Math.max(0, chatVerlauf.length - chatGesehenRef.current));
    }, [chatVerlauf.length, istChatOffen]);

    /**
     * Immer die neueste Zeile zeigen.
     *
     * Vorher hing das an einem leeren Anker-`div` am Listenende und an
     * `scrollIntoView`. Zwei Dinge gingen dabei schief:
     *
     *   1. Der Effekt lief nur, wenn sich die ANZAHL der Zeilen ändert. Ab 80
     *      Nachrichten fällt vorne eine heraus, sobald hinten eine dazukommt
     *      (CHAT_VERLAUF_MAX in useGardenLobby.js) — die Länge bleibt gleich, der
     *      Effekt schweigt, und der Chat scrollt nicht mehr mit.
     *   2. `scrollIntoView` scrollt JEDEN scrollbaren Vorfahren mit und riss dabei
     *      auch die Seite darunter mit.
     *
     * Jetzt wird die Fläche selbst gescrollt, und zwar an der ID der letzten
     * Nachricht statt an der Anzahl. Wer hochgescrollt hat, um etwas nachzulesen,
     * wird dabei nicht weggerissen: nachgezogen wird nur, wenn die Ansicht ohnehin
     * schon unten klebt.
     */
    const letzteChatId = chatVerlauf[chatVerlauf.length - 1]?.id || null;
    useEffect(() => {
        if (!istChatOffen) return;
        const liste = chatListeRef.current;
        if (!liste) return;
        if (!chatAmEndeRef.current) return;
        liste.scrollTop = liste.scrollHeight;
    }, [istChatOffen, letzteChatId, chatVerlauf.length]);

    // Beim Öffnen immer ganz nach unten — egal, wo man beim letzten Mal stand.
    useEffect(() => {
        if (istChatOffen) chatAmEndeRef.current = true;
    }, [istChatOffen]);

    // Universal countdown from absolute next-rotation timestamps
    //
    // NUR solange ein Laden offen ist. Die drei Werte stehen ausschliesslich in den
    // Ladenfenstern (Fortschrittsbalken und „Nächste Rotation in …"); vorher lief das
    // Intervall dauerhaft und hat GameContainer — eine der grössten Komponenten im
    // Projekt — jede Sekunde komplett neu aufbauen lassen, auch wenn niemand einen
    // Laden offen hatte. Beim Öffnen wird sofort gesetzt, damit nicht erst eine
    // Sekunde lang der alte Stand steht.
    useEffect(() => { ladenOffenRef.current = activeShop; }, [activeShop]);

    useEffect(() => {
        if (showLobbyScreen || !activeShop) return undefined;
        const aktualisiere = () => {
            const now = Date.now();
            setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
            setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
            setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
        };
        aktualisiere();
        const interval = setInterval(aktualisiere, 1000);
        return () => clearInterval(interval);
    }, [showLobbyScreen, activeShop]);

    useTastatur({
        showLobbyScreen, setBackpackOpen, setItemHoverTooltip, selectedDecoToPlaceRef,
        setDecoRotiert, setDecoGespiegelt, editorAktivRef, setEditorAktiv, setSelectedDecoToPlace,
        setVerschiebtGebaeude, toolInventoryRef, setSelectedSeed, setSelectedPetToPlace,
        setSelectedCarryItem, setSelectedTool, setMovingPlantSource, istGartenAdminRef,
        teleportToMarketArea, teleportToShopArea, teleportToMyFarm,
    });


    useSpielschleife({
        showLobbyScreen, canvasRef, engineRef, layout, plotsRef, mySlotRef, localPlayerNameRef,
        lastInteractableTypeRef, activeTargetRef, setCurrentInteractable, activateInteractable,
        selectedToolRef, movingPlantSourceRef, plotExpansionsRef, plotUnlockedCellsRef,
        meineReskinsRef, remotePlayersRef, sendMove, heldItemRef, readyEggsCountRef, zoomRef,
        weatherStateRef, partyStaerkeJetzt, renderProfileRef, appearanceRef, playerBadgeRef,
        editorAktivRef, eigeneSterneRef,
    });

    // Sync plotPlants into engine ref (avoids stale closure in game loop)
    useEffect(() => {
        engineRef.current.plotPlants = plotPlants;
    }, [plotPlants]);


    useEffect(() => {
        engineRef.current.petPlacements = Array.isArray(petPlacements)
            ? petPlacements.map((pet, idx) => ({
                id: pet.id || `pet_${idx}`,
                ...pet,
                emoji: pet.emoji || getPetEmoji(pet.name),
                image: pet.image || buildPetPreviewImage(pet.name),
                slotIndex: Number.isInteger(pet.slotIndex) ? pet.slotIndex : mySlotIndex,
            }))
            : [];
    }, [petPlacements, mySlotIndex]);

    useEffect(() => {
        engineRef.current.decoPlacements = Array.isArray(decoPlacements)
            ? decoPlacements.map((deco, idx) => ({
                id: deco.id || `deco_${idx}`,
                ...deco,
                slotIndex: Number.isInteger(deco.slotIndex) ? deco.slotIndex : mySlotIndex,
            }))
            : [];
    }, [decoPlacements, mySlotIndex]);

    useEffect(() => {
        const idx = mySlotIndex;
        if (layout.current.slots[idx]) {
            layout.current.slots[idx].currentExpansions = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, plotExpansions));
            layout.current.slots[idx].unlockedCells = normalizePlotUnlockedCells(plotUnlockedCells);
        }
        plotExpansionsRef.current = Math.max(0, Math.min(MAX_PLOT_EXPANSIONS, plotExpansions));
        plotUnlockedCellsRef.current = normalizePlotUnlockedCells(plotUnlockedCells);
    }, [plotExpansions, plotUnlockedCells, mySlotIndex]);

    // Keep farmStateRef up-to-date for socket cleanup
    useEffect(() => {
        // Jeder Samen, der neu im Rucksack liegt, streicht einen offenen Kauf.
        // Pflanzen verkleinert das Inventar — dann bleibt der Zähler stehen.
        const dazu = Math.max(0, inventory.length - zuletztInventarRef.current);
        offeneSamenkaeufeRef.current = Math.max(0, offeneSamenkaeufeRef.current - dazu);
        zuletztInventarRef.current = inventory.length;
        farmStateRef.current = {
            // gold und harvestedItems standen in den Abhaengigkeiten, wurden hier
            // aber nie mitgeschrieben. handleBuySeed liest harvestedItems fuer die
            // Rucksackgrenze und bekam deshalb immer `undefined` — der volle
            // Ernte-Teil des Rucksacks zaehlte beim Kauf schlicht nicht mit.
            gold, harvestedItems,
            inventory, plotPlants, plotExpansions, plotUnlockedCells,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch,
            shopStock: ladenBestand,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            appearance: playerAppearance,
            tutorialCompleted,
            [ACKERRASTER_MARKE]: ackerRasterMigriert,
        };
    }, [gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted, ackerRasterMigriert]);

    const { debouncedSave, flushFarmStateToServer } = useSpeichern({
        saveTimeoutRef, flushFarmStateToServerRef, isInitialLoadDoneRef, nurZuschauenRef,
        farmStateRef, stateVersionRef, inventory, plotPlants, plotExpansions, plotUnlockedCells,
        eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory,
        inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation,
        toolShopStock, toolShopRotation, eggShopStock, eggShopRotation, playerAppearance,
        tutorialCompleted, ackerRasterMigriert, apiCall, uebernimmVomServer, setNurZuschauen, gold,
        harvestedItems,
    });

    useAckerUmzug({
        showLobbyScreen, isInitialLoadDone, mySlotIndex, layout, plotUnlockedCells, plotPlants,
        decoPlacements, petPlacements, setDecoPlacements, setPetPlacements, setPlotUnlockedCells,
        setPlotPlants, notify, debouncedSave, ackerRasterMigriert, setAckerRasterMigriert,
    });

    const { flushSave, payServer, applyEconomy, questAbholen, auftragLiefern, erntefestAbholen, auftragAblehnen, reskinKaufen, reskinAusruesten } = useServerAktionen({
        saveTimeoutRef, flushFarmStateToServerRef, apiCall, goldRef, setGold, setLogbuch, notify,
        playSound, setGoldGesamt, setSkillStand, setHarvestedItems, setPlotPlants,
        normalizePlotPlantsMap, hydratePlantVisuals, ladeQuests, setQuestDaten, ladeGoldShop,
        setErnteRausch, setStoerer, setZuchtbuch,
    });

    const { handleAblage } = useAblage({
        setAblageBusy, flushSave, apiCall, setHarvestedItems, setChestItems, setVitrineItems,
        setInventory, setEggInventory, setDecoInventory, setPetInventory, notify,
    });

    const { reserviere, gibZurueck, kaufSichern, kreuzungenAufnehmen, handleBuySeed, handleBuySeedAll } = useSamenKauf({
        flushSave, farmStateRef, setInventory, playSound, engineRef, notify, kaufLaeuftRef,
        kaufEinreihen, handleBuySeedRef, goldRef, offeneSamenkaeufeRef, ladenBestandRef,
        setLadenBestand, letzterKaufAtRef, apiCall, naechstenKaufStarten, setGold, setSelectedSeed,
        handleBuySeedAllRef,
    });

    const { handleCellClick, handleHarvest, flushDragErnte, planeDragErnteFlush, fangeStoerer } = useErnte({
        handleBuySeedAllRef, handleBuySeedAll, handleBuySeedRef, handleBuySeed, selectedSeed,
        inventory, plotPlants, petPlacements, mySlotRef, skillWirkung, partyLaeuftJetzt,
        setPlotPlants, playSound, layout, engineRef, setInventory, setSelectedSeed, debouncedSave,
        notify, ernteLaeuftRef, ernteWarteschlangeRef, apiCall, kreuzungenAufnehmen,
        isDragHarvestingRef, applyEconomy, hydratePlantVisuals, letzteErnteRef, uebernimmVomServer,
        farmStateRef, flushSave, handleHarvestRef, dragErnteFlushTimerRef, dragErnteSammlungRef,
        spieleErnteTon,
    });

    const { handleBuyTool, handleBuyToolAll, handleMineRock, handleWaterPlant, handleMovePlantWithPot } = useWerkzeuge({
        kaufLaeuftRef, kaufEinreihen, handleBuyToolRef, reserviere, toolShopStockRef,
        setToolShopStock, letzterToolKaufAtRef, apiCall, goldRef, setGold, setzeWerkzeug,
        gibZurueck, notify, naechstenKaufStarten, playSound, handleBuyToolAllRef, apiCallRef,
        notifyRef, setzeWerkzeugRef, toolInventory, plotUnlockedCells, verbraucheWerkzeug,
        engineRef, setPlotUnlockedCells, setPlotExpansions, debouncedSave, plotPlants, skillStufe,
        setPlotPlants, flushSave, movingPlantSource, setMovingPlantSource,
    });

    const { handleBuyEgg, handleBuyDeco, unlockIncubatorSlot, placeEggInIncubator, collectHatchedEgg } = useEierDekoBrutkasten({
        goldRef, setGold, setGoldGesamt, setEggInventory, setPetInventory, setIncubator,
        kaufLaeuftRef, kaufEinreihen, handleBuyEggRef, notify, reserviere, eggShopStockRef,
        setEggShopStock, apiCall, gibZurueck, naechstenKaufStarten, handleBuyDecoRef, payServer,
        farmStateRef, setDecoInventory, selectedDecoToPlace, setSelectedDecoToPlace,
        setSelectedSeed, setSelectedTool, setSelectedCarryItem, setSelectedPetToPlace, kaufSichern,
        unlockIncubatorSlotRef, incubator, eggInventory, setIncubatorTargetSlot,
    });

    useSpielflaecheMaus({
        showLobbyScreen, canvasRef, hoverStore, shovelHoldTimerRef, shovelHoldProgressRef,
        setShovelHoldState, bodenMalenRef, engineRef, zoomRef, selectedDecoToPlaceRef,
        editorAktivRef, notify, layout, mySlotRef, decoGespiegeltRef, decoRotiertRef,
        decoPlacementsRef, decoInventoryRef, setDecoPlacements, setDecoInventory,
        setSelectedDecoToPlace, isDragHarvestingRef, klickGehoertZuBodenMalenRef, selectedTool,
        istGartenAdminRef, remotePlayersRef, sendShotgun, verschiebtGebaeude, decoPlacements,
        setGebaeudeVersatz, setVerschiebtGebaeude, debouncedSave, selectedSeed,
        selectedDecoToPlace, selectedPetToPlace, setMailboxMode, setMailboxRecipient, plotsRef,
        setMailboxOpen, petPlacements, setPetInventory, setPetPlacements, setSelectedPetToPlace,
        setShedOpen, plotPlants, handleMineRock, handleWaterPlant, handleMovePlantWithPot,
        handleHarvest, handleCellClick, dragHarvestedCellsRef, dragErnteSammlungRef,
        planeDragErnteFlush, selectedSeedRef, flushDragErnte, fremdHoverSlot,
        shovelHoldStartedAtRef, setPlotPlants, setZoomAnzeige, toolInventory,
        spieleErnteTon, fangeStoerer,
    });

    useEffect(() => {
        mySlotRef.current = mySlotIndex;
    }, [mySlotIndex]);



    /**
     * Goldfinder-Takt.
     *
     * Seit dem Tier-Umbau (August 2026) tickt nur noch DIESE eine Fähigkeit. Der
     * Gärtner wirkt dauerhaft (Nachwuchs und Wachstum rechnet der Server beim Ernten
     * bzw. beim Pflanzen), der Erntehelfer beim eigenen Ernten — beide brauchen keine
     * Schleife mehr. Der frühere Erntehelfer-Zweig hat über `harvestMany` selbst
     * abgeerntet und verkauft; genau das ist entfallen, weil es den Spieler ersetzt
     * statt ihn zu verstärken.
     */
    useEffect(() => {
        if (showLobbyScreen) return;

        const meineGoldfinder = () => farmStateRef.current.petPlacements
            .filter((p) => p.slotIndex === mySlotRef.current && p.ability?.type === "goldfinder");

        // Takt richtet sich nach dem höchsten Goldfinder-Level. Werte liegen in
        // engine/PetSystem, damit das Tier-Modal dasselbe anzeigt.
        const getIntervalMs = () => {
            const maxLevel = meineGoldfinder().reduce((m, p) => Math.max(m, p.ability?.level || 0), 0);
            return getPetTickMs(maxLevel);
        };

        /**
         * Darf DIESES Tier schon wieder auszahlen?
         *
         * Der Takt oben richtet sich nach dem SCHNELLSTEN Tier, die Sperre auf dem
         * Server aber nach dem Level des jeweiligen Tieres (garden/core/economy.js → petFind).
         * Wer ein Stufe-5- neben einem Stufe-1-Tier stehen hat, fragte für das
         * langsame dreimal so oft an, wie es darf — jede dieser Anfragen kam als
         * 429 „Zu früh" zurück und stand als Fehler in der Browser-Konsole.
         */
        const darfAuszahlen = (petId, level) => {
            const zuletzt = petFundZeitenRef.current.get(petId) || 0;
            return Date.now() - zuletzt >= getPetTickMs(level) * 0.9;
        };
        const merkeAuszahlung = (petId) => petFundZeitenRef.current.set(petId, Date.now());

        let timerId;
        // Der Tick fragt je Goldfinder an; ob er etwas findet und wie viel, entscheidet
        // der Server (garden/core/economy.js → petFind).
        const tick = async () => {
            // Ein zurückgetretener Tab lässt seine Tiere ruhen: er kann das
            // Ergebnis nie speichern, und jede Server-Aktion von ihm bringt den
            // führenden Tab in einen Konflikt (siehe apiCall).
            if (nurZuschauenRef.current) {
                timerId = setTimeout(tick, getIntervalMs());
                return;
            }
            const tiere = meineGoldfinder();
            if (tiere.length) {
                const msgs = [];
                // Ob ein Takt etwas findet, würfelt seit Nov. 2026 der SERVER
                // (garden/core/economy.js → petFind). Hier wird nur angefragt.
                for (const pet of tiere) {
                    const petId = pet.id || pet.instanceId;
                    if (!darfAuszahlen(petId, pet.ability.level)) continue;
                    try {
                        const data = await apiCall("/action", {
                            method: "POST",
                            body: JSON.stringify({ action: "petFind", petId, kind: "gold" }),
                        });
                        merkeAuszahlung(petId);
                        if (typeof data?.gold === "number") setGold(data.gold);
                        if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
                        const verdient = Number(data?.verdient || 0);
                        if (verdient <= 0) continue; // dieser Takt hat nichts gefunden
                        msgs.push(`${pet.customName || pet.name}: +${verdient.toLocaleString("de-DE")} Gold`);
                        // Direkt am Spieler statt am Tier: dessen aktuelle Position kennt hier
                        // nur die Render-Schleife (petPlacements führt keine live x/y), und
                        // "wer" hat schon der Toast-Text oben — hier geht es nur ums "jetzt".
                        const renderer = engineRef.current?.renderer;
                        const spieler = engineRef.current?.player;
                        if (renderer && spieler) {
                            renderer.spawnFeedback(spieler.x, spieler.y - 40, `+${formatGold(verdient)}`, { color: "#fde047" });
                        }
                    } catch { /* Server hat abgelehnt (z. B. zu früh) — stillhalten */ }
                }

                if (msgs.length) notify(msgs.join(" | "), "info");
            }
            timerId = setTimeout(tick, getIntervalMs());
        };

        timerId = setTimeout(tick, getIntervalMs());
        return () => clearTimeout(timerId);
    }, [showLobbyScreen, notify, apiCall, skillWirkung])

    useEffect(() => {
        localPlayerNameRef.current = authUser?.twitchLogin || authUser?.login || "Spieler";
    }, [authUser]);

    // Eigenes Schild beschriften — der Slot kommt vom Server, nicht immer 0.
    // showLobbyScreen MUSS in den Abhängigkeiten stehen: startWorldBoot baut layout.current
    // beim Betreten neu auf, und dabei geht ein vorher gesetzter owner verloren
    // (das eigene Schild zeigte sonst „Zu verkaufen").
    // Vergibt der Server einen anderen Slot (Neustart, Reconnect, volle Welt), muss
    // das alte Schild WEG. Vorher wurde nur das neue gesetzt — das eigene Feld stand
    // danach doppelt auf der Karte: oben links das alte, leere, mit dem eigenen Namen,
    // daneben das neue mit den Pflanzen.
    const gestempelterSlotRef = useRef(-1);
    useEffect(() => {
        if (showLobbyScreen) return;
        const slots = layout.current?.slots;
        if (!slots) return;
        const vorher = gestempelterSlotRef.current;
        if (vorher >= 0 && vorher !== mySlotIndex && slots[vorher]) {
            // Gehört jetzt wieder niemandem — es sei denn, ein anderer Spieler
            // sitzt dort; dessen Schild setzt die Plot-Übernahme ohnehin neu.
            slots[vorher].owner = null;
        }
        const slot = slots[mySlotIndex];
        if (!slot) { gestempelterSlotRef.current = -1; return; }
        slot.owner = authUser?.twitchLogin || authUser?.login || "Spieler";
        gestempelterSlotRef.current = mySlotIndex;
    }, [authUser, mySlotIndex, showLobbyScreen]);

    // Eigene Tiere und Deko wandern mit, wenn der Server einen anderen Slot vergibt —
    // sonst stünden sie auf dem Grundstück des Vorbesitzers.
    //
    // Die Abhängigkeit auf die Listen ist wichtig: vorher lief das NUR beim Wechsel
    // von mySlotIndex. Kam der Spielstand erst danach an (Socket schneller als die
    // Farm-Abfrage), behielten die Tiere für immer den alten Slot. Folge: die
    // Bewegungsschleife übersprang sie (`pet.slotIndex !== mySlotIndex`), der Zähler
    // zeigte 0/3, und gezeichnet wurden sie auf dem alten Grundstück — zusammen-
    // gedrängt am Rand, weil ihre Koordinaten nicht mehr in die Fläche passten.
    // Der Wächter `some(...)` gibt `prev` unverändert zurück, sobald alles stimmt;
    // dadurch läuft der Effekt trotz der Listen-Abhängigkeit nicht endlos.
    useEffect(() => {
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const slots = layout.current?.slots;
        const ziel = slots?.[mySlotIndex];
        const obenY = (s) => (s.isTopRow ? s.anchorY - MAP_CONFIG.territoryHeight : s.anchorY);

        const umziehen = (eintrag) => {
            if (eintrag.slotIndex === mySlotIndex) return eintrag;
            const quelle = slots?.[eintrag.slotIndex];
            // Ohne bekanntes Ausgangsgrundstück die Koordinaten verwerfen — die
            // Spielschleife setzt Tiere ohne gültige Position in die Mitte.
            if (!ziel || !quelle || !Number.isFinite(eintrag.x) || !Number.isFinite(eintrag.y)) {
                return { ...eintrag, slotIndex: mySlotIndex, x: undefined, y: undefined };
            }
            return {
                ...eintrag,
                slotIndex: mySlotIndex,
                x: eintrag.x + (ziel.x - quelle.x),
                y: eintrag.y + (obenY(ziel) - obenY(quelle)),
            };
        };

        setPetPlacements((prev) => (
            prev.some((p) => p.slotIndex !== mySlotIndex) ? prev.map(umziehen) : prev
        ));
        setDecoPlacements((prev) => (
            prev.some((d) => d.slotIndex !== mySlotIndex) ? prev.map(umziehen) : prev
        ));
    }, [mySlotIndex, petPlacements, decoPlacements]);

    // Check subscriber / beta-tester status after auth
    useEffect(() => {
        if (!authUser) return;
        apiCall("/is-subscriber")
            .then((data) => {
                setIsSubscriber(Boolean(data.isSubscriber));
                setIsBeta(Boolean(data.isBeta));
                // Das Abzeichen selbst wird NICHT hier gesetzt, sondern in einem
                // eigenen Effekt aus `eigenesAbzeichen` — sonst hätte es zwei
                // Quellen: diese hier für den eigenen Kopf und die Lobby-Verbindung
                // für alle anderen. Genau daran lag es, dass über dem eigenen Kopf
                // noch „Sub" stand, während die Mitspieler längst „Admin" sahen.
            })
            .catch(() => {});
    }, [authUser, apiCall]);

    // ── Shop countdown display ─────────────────────────────────────────────────
    const shopMins = Math.floor(shopCountdown / 60000);
    const shopSecs = Math.floor((shopCountdown % 60000) / 1000);
    const toolMins = Math.floor(toolShopCountdown / 60000);
    const toolSecs = Math.floor((toolShopCountdown % 60000) / 1000);
    const eggMins = Math.floor(eggShopCountdown / 60000);
    const eggSecs = Math.floor((eggShopCountdown % 60000) / 1000);
    const formatCountdown = (mins, secs) => `${mins}:${String(secs).padStart(2, "0")} min`;
    const formatDuration = (ms) => {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };
    const getSpecialLabel = (specialData) => specialData?.name || null;
    const getStatusEffectLabel = (statusEffect) => STATUS_EFFECT_LABELS[statusEffect] || null;
    const getItemTooltipStyle = (x, y) => {
        const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
        const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
        const tooltipW = 230;
        const tooltipH = 132;
        let left = x + 12;
        let top = y + 12;
        if (left + tooltipW > viewportW - 8) left = viewportW - tooltipW - 8;
        if (top + tooltipH > viewportH - 8) top = y - tooltipH - 12;
        if (left < 8) left = 8;
        if (top < 8) top = 8;
        return { left, top };
    };
    const equippedTools = {
        shovel: toolInventory.hasShovel ? { name: "Dauerhaft" } : null,
        pot: (toolInventory.plantPots || 0) > 0 ? { name: String(toolInventory.plantPots || 0) } : null,
        pickaxe: (toolInventory.pickaxeUses || 0) > 0 ? { name: String(toolInventory.pickaxeUses || 0) } : null,
        watering: (toolInventory.wateringCans || 0) > 0 ? { name: String(toolInventory.wateringCans || 0) } : null,
        // Hängt an der Person, nicht am Spielstand: die Shotgun steht in keinem
        // Laden und lässt sich nicht kaufen.
        shotgun: istGartenAdmin ? { name: "∞" } : null,
    };
    const hotbarItems = [
        ...inventory.map(s => ({ ...withVisuals(s), _type: "seed" })),
        ...harvestedItems.map(p => ({ ...withVisuals(p), _type: "plant" })),
        ...eggInventory.map(e => ({ ...e, _type: "egg" })),
        ...petInventory.map(p => ({ ...p, _type: "pet" })),
        ...decoInventory.map(d => ({ ...d, _type: "deco" })), // 3. ANPASSUNG: Deko ergänzt
    ];
    const lohnendeShopSeeds = useMemo(() => (shopRotation?.seeds || []).filter(
        (s) => s.active && lohntSich(s.seedId, s.stockStart ?? s.stock, gold),
    ), [shopRotation?.seeds, gold]);
    const visibleShopSeeds = useMemo(() => {
        const seeds = shopRotation?.seeds || [];
        const gefiltert = shopFilter === "lohnend"
            ? lohnendeShopSeeds
            : seeds.filter((s) => shopFilter === "all" || s.active);
        return sortiere(gefiltert, SHOP_SORTIERUNGEN, shopSortierung);
    }, [shopRotation?.seeds, shopFilter, shopSortierung, lohnendeShopSeeds]);
    // Samen und Ernte teilen sich die Rucksackplätze. Ist kein Platz mehr, sperrt
    // der Laden die Zeilen — sonst klickt man weiter ins Leere.
    const rucksackVoll = (inventory.length + harvestedItems.length) >= inventoryMaxSlots;
    const { handleSellAllHarvested, handleStowInspectedPet, handleRenamePet, handleSellInspectedPet } = useVerkauf({
        harvestedItems, apiCall, applyEconomy, playSound, engineRef, notify, sellAllRef,
        selectedPetToPlace, flushSave, setPetInventory, setSelectedPetToPlace, setGold,
        setGoldGesamt, debouncedSave, sellPetRef, inspectedPet, setPetPlacements, setInspectedPet,
    });


    useEffect(() => { flushFarmStateToServerRef.current = flushFarmStateToServer; }, [flushFarmStateToServer]);
    useEffect(() => { isInitialLoadDoneRef.current = isInitialLoadDone; }, [isInitialLoadDone]);
    // Gold kommt aus vielen Richtungen (Ernte, Verkauf, Tierfunde, Post, Admin).
    // Das Ref zieht hier allgemein nach; `payServer` schreibt es zusätzlich sofort,
    // weil die Kauf-Warteschlange nicht bis zum nächsten Rendern warten kann.
    useEffect(() => { goldRef.current = gold; }, [gold]);

    // ── Briefkasten ───────────────────────────────────────────────────────────
    // Alles Wertrelevante rechnet der Server (Backend/garden/world/mail.js). Hier wird
    // nur die Antwort übernommen — insbesondere Gold und Inventar, damit der nächste
    // Farm-State-PUT die serverseitige Abbuchung nicht wieder überschreibt.
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return;
        apiCall("/mail")
            .then((data) => setMailboxState(Array.isArray(data?.mailbox) ? data.mailbox : []))
            .catch(() => {});
    }, [showLobbyScreen, isInitialLoadDone, apiCall]);

    const { handleClaimMail, handleSendMail } = usePost({
        setMailBusy, apiCall, setMailboxState, setGold, setGoldGesamt, setInventory,
        setHarvestedItems, setPetInventory, notify, playSound, farmStateRef, flushSave,
        setSelectedSeed, setSelectedPetToPlace,
    });

    const ensureTwitchSessionForGarden = useCallback(async () => {
        try {
            const r = await fetch("/api/auth/me", { credentials: "include" });
            if (!r.ok) {
                notify("Bitte mit Twitch anmelden, um den Garten zu spielen.", "error");
                return false;
            }
            return true;
        } catch {
            notify("Anmeldung konnte nicht geprüft werden.", "error");
            return false;
        }
    }, [notify]);

    useEffect(() => {
        if (!showLobbyScreen) return;
        apiCall("/ranglisten")
            .then((data) => {
                setRanglisten(data && typeof data === "object" ? data : null);
                setLeaderboard(Array.isArray(data?.gold) ? data.gold : []);
            })
            .catch(() => {
                // Älterer Server ohne /ranglisten: wenigstens die Goldliste.
                apiCall("/leaderboard")
                    .then((data) => setLeaderboard(Array.isArray(data) ? data : []))
                    .catch(() => setLeaderboard([]));
            });
    }, [showLobbyScreen, apiCall]);

    /**
     * @param {"public"|"create"|"code"} mode
     * Die Weltwahl steht fest, BEVOR der Socket verbindet — der Hook liest
     * pendingWorldCode/pendingCreateWorld beim Verbindungsaufbau.
     */
    const enterWorld = async (mode = "public") => {
        if (!(await ensureTwitchSessionForGarden())) return;
        if (mode === "code") {
            const code = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (code.length < 4) {
                notify("Bitte einen gültigen Weltcode eingeben.", "error");
                return;
            }
            setPendingWorldCode(code);
            setPendingCreateWorld(false);
        } else if (mode === "create") {
            vergissWelt();
            setPendingWorldCode("");
            setPendingCreateWorld(true);
        } else {
            // Zurueck in die zuletzt betretene Welt, sofern es eine oeffentliche war.
            // Ohne das landet man nach jedem Neuladen in irgendeiner freien Welt —
            // und damit neben fremden Leuten statt neben denen von vorhin.
            const gemerkt = letzteWelt();
            setPendingWorldCode(gemerkt.startsWith("OEFFENTLICH") ? gemerkt : "");
            setPendingCreateWorld(false);
        }
        startWorldBoot("multi");
        setShowLobbyScreen(false);
    };

    // Nur im Entwicklungsmodus (fällt im Build weg): der UI-Prüfstand öffnet hierüber
    // jedes Fenster direkt, ohne die Figur erst vor den passenden Stand zu laufen.
    useEffect(() => {
        if (!import.meta.env.DEV) return undefined;
        window.__farmTest = {
            oeffne: (typ) => activateInteractable({ type: typ, isOwn: true }),
            acker: () => JSON.parse(JSON.stringify(engineRef.current.plotPlants || {})),
            spieler: () => { const p = engineRef.current.player; return { x: p.x, y: p.y, tileX: p.tileX, tileY: p.tileY, zoom: zoomRef.current }; },
            // Bildschirmposition der Mitte eines eigenen Ackerfelds (Umkehrung von toWorld).
            zelle: (cx, cy) => {
                const slot = layout.current.slots[mySlotRef.current];
                const w = getDirtCellWorldPos(slot, cx, cy);
                const c = canvasRef.current; const r = c.getBoundingClientRect(); const p = engineRef.current.player;
                return { x: r.left + c.width / 2 + (w.x + TILE_SIZE / 2 - p.x) * zoomRef.current, y: r.top + c.height / 2 + (w.y + TILE_SIZE / 2 - p.y) * zoomRef.current };
            },
            setzer: {
                rucksack: setBackpackOpen, markt: setMarketOpen, brutkasten: setIncubatorOpen,
                muell: setTrashOpen, schuppen: setShedOpen, goldshop: setGoldShopOpen,
                ablage: setAblageOffen, logbuch: setLogbuchOpen, umkleide: setWardrobeOpen,
                neuerungen: setChangelogOpen, tiere: setPetOverlayOpen, einstellungen: setSettingsOpen,
                profil: setProfilOffen, vielfalt: setVielfaltOffen, faehigkeiten: setSkillsOffen,
                laden: setActiveShop, editor: setEditorAktiv,
            },
        };
        return () => { delete window.__farmTest; };
    }, [activateInteractable]);

    if (showLobbyScreen) {
        return (
            <GardenMenu
                authUser={authUser}
                twitchLogin={twitchLogin}
                istGartenAdmin={istGartenAdmin}
                isSubscriber={isSubscriber}
                isBeta={isBeta}
                leaderboard={leaderboard}
                ranglisten={ranglisten}
                joinCodeInput={joinCodeInput}
                setJoinCodeInput={setJoinCodeInput}
                enterWorld={enterWorld}
            />
        );
    }

    return (
        // Nunito statt 'Courier New': die Schreibmaschinenschrift mit ihren harten
        // Kanten passte nicht zu einem Farmspiel. Zahlen bleiben über `tabular-nums`
        // an ihren Stellen stehen, dafür ist die Schrift nicht mehr dicktengleich.
        <div className="relative w-full h-full min-h-0 flex-1 bg-slate-950 overflow-hidden" style={{ fontFamily: "'Baloo 2', 'Nunito', 'Segoe UI', system-ui, sans-serif" }}>
            <SEO {...FARM_SEO} />
            <canvas ref={canvasRef} className="absolute inset-0" />
            {zweitkontoText && (
                <div className="absolute inset-0 z-[200] bg-slate-950 flex items-center justify-center p-6">
                    <div className="max-w-md rounded-md border border-white/10 bg-[#0d0d14] p-6 text-center">
                        <h2 className="text-xl font-bold text-white mb-2">Nur eine Farm pro Gerät</h2>
                        <p className="text-sm text-white/70">{zweitkontoText}</p>
                        <p className="text-sm text-white/50 mt-3">Melde dich mit dem Account an, mit dem du hier zuerst gespielt hast.</p>
                    </div>
                </div>
            )}
            {/* Feedback 01.09.: "besserer Ladebildschirm, richtig erst fertig wenn alles geladen hat" —
                der Balken bleibt unter 100 %, bis Bilder UND Serverdaten da sind (hooks/useWorldBoot.js).
                Seit 04.11. im Stil des Hauptmenüs statt eines Bildes mit eingebranntem Titel. */}
            {worldBootState.active && (
                <Ladebildschirm label={worldBootState.label} progress={worldBootState.progress} />
            )}
            

            {/* ── Tutorial Overlay ──────────────────────────────────────── */}
            {!tutorialCompleted && !showLobbyScreen && (
                <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} p-4 max-w-sm pointer-events-auto`}>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300 mb-2">
                        <Sprout size={14} /> Erste Schritte
                    </h3>
                    <div className="text-sm text-slate-300 leading-relaxed">
                        {inventory.length === 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && gold <= START_GOLD && (
                            <p>Willkommen. Geh zum <span className="text-white font-medium">Samen-Shop</span> und kauf deinen ersten Samen.</p>
                        )}
                        {inventory.length > 0 && Object.keys(plotPlants).length === 0 && harvestedItems.length === 0 && (
                            <p>Wähl den Samen in deinem <span className="text-white font-medium">Inventar</span> aus und klick auf ein freies Ackerfeld, um ihn zu pflanzen.</p>
                        )}
                        {Object.keys(plotPlants).length > 0 && harvestedItems.length === 0 && (
                            <p>Die Pflanze wächst. Fahr mit der Maus darüber, um Restzeit und Wert zu sehen — klick sie an, sobald sie reif ist.</p>
                        )}
                        {harvestedItems.length > 0 && (
                            <p>Geh zum <span className="text-white font-medium">Marktstand</span> und verkauf deine Ernte.</p>
                        )}
                        {gold > START_GOLD && harvestedItems.length === 0 && Object.keys(plotPlants).length === 0 && inventory.length === 0 && (
                            <p>Geschafft — das war der Einstieg.</p>
                        )}
                    </div>
                    <button
                        type="button"
                        className="mt-3 w-full py-1.5 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded-2xl text-xs font-medium transition-colors"
                        onClick={() => setTutorialCompleted(true)}
                    >
                        Nicht mehr anzeigen
                    </button>
                </div>
            )}

            {/* ── Notification toast ──────────────────────────────────────── */}
            {notification && (
                <div
                    key={notification.id}
                    className={`absolute top-24 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-2xl text-sm font-medium border backdrop-blur-sm ${
                        notification.type === "error"
                            ? "bg-rose-950/95 border-rose-800 text-rose-200"
                            : "bg-slate-900/95 border-slate-700 text-slate-100"
                    }`}
                >
                    {notification.msg}
                </div>
            )}
            {/* ── Zweiter Tab: dieser hier speichert nicht mehr ────────────────── */}
            {nurZuschauen && (
                <div className="absolute bottom-5 left-1/2 z-[290] w-[min(94vw,520px)] -translate-x-1/2 rounded-2xl border border-amber-800 bg-amber-950/95 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div className="flex-1 text-sm text-amber-100">
                            <p className="font-medium">Die Farm ist in einem anderen Tab offen.</p>
                            <p className="mt-1 text-xs text-amber-200/80">
                                Dieser Tab speichert nicht mehr — sonst würde er den anderen überschreiben.
                                Was du hier noch machst, wird nicht gespeichert. Zum Weiterspielen
                                erst den aktuellen Stand holen.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                if (await uebernimmVomServer("Dieser Tab spielt jetzt weiter.")) {
                                    nurZuschauenRef.current = false;
                                    setNurZuschauen(false);
                                }
                            }}
                            className="shrink-0 rounded-xl border border-amber-700 bg-amber-900/60 px-3 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-900"
                        >
                            Hier weiterspielen
                        </button>
                    </div>
                </div>
            )}
            {/* Shop-Rotationen: gestapelt (gleiche Minute → nicht übereinander) */}
            {rotationBanners.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[38] flex max-w-[min(94vw,460px)] -translate-x-1/2 flex-col items-stretch gap-2">
                    {rotationBanners.map((b) => (
                        <div
                            key={b.id}
                            className="rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-2 text-center text-sm font-medium text-slate-100 backdrop-blur-sm"
                        >
                            {b.msg}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Links oben: Einstellungen, darunter Weltzustand ─────────────── */}
            <HudObenLinks
                setSettingsOpen={setSettingsOpen}
                setOnlineListeOffen={setOnlineListeOffen}
                istOnlineListeOffen={istOnlineListeOffen}
                lobbyConnected={lobbyConnected}
                onlinePlayers={onlinePlayers}
                localPlayerNameRef={localPlayerNameRef}
                mySlotIndex={mySlotIndex}
                gold={gold}
                skillStand={skillStand}
                playerAppearance={playerAppearance}
                besucheSpieler={besucheSpieler}
                istGartenAdmin={istGartenAdmin}
                setAdminPanelOffen={setAdminPanelOffen}
                zoomAnzeige={zoomAnzeige}
                zoomRef={zoomRef}
                setZoomAnzeige={setZoomAnzeige}
            />

            {/* Admin-Menü. Breiter als die übrigen Fenster, weil links die Spielerliste
                steht und rechts die Einträge mit ihren Werten. */}
            {adminPanelOffen && istGartenAdmin && (
                <div className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-6xl h-[86vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl p-4">
                        <GardenAdminBrowser
                            eigeneId={authUser?.id}
                            onClose={() => setAdminPanelOffen(false)}
                        />
                    </div>
                </div>
            )}

            {isSettingsOpen && (
                <EinstellungenFenster
                    effectVolume={effectVolume}
                    setEffectVolume={setEffectVolume}
                    musicVolume={musicVolume}
                    setMusicVolume={setMusicVolume}
                    tagesInfo={tagesInfo}
                    laufenderPartyTitel={laufenderPartyTitel}
                    setThemeId={setThemeId}
                    themeId={themeId}
                    setRenderProfile={setRenderProfile}
                    renderProfileRef={renderProfileRef}
                    renderProfile={renderProfile}
                    setSettingsOpen={setSettingsOpen}
                    setChangelogOpen={setChangelogOpen}
                    flushFarmStateToServer={flushFarmStateToServer}
                    setShowLobbyScreen={setShowLobbyScreen}
                />
            )}

            {/* ── Rechts: Profil, Post, Tiere, Chat, darunter Weltzustand ─────── */}
            {/* items-end statt fester Spaltenbreite: die Profil-Karte darf breiter sein
                als der Rest, ohne dass alles andere mitwächst. */}
            <HudObenRechts
                tagesInfo={tagesInfo}
                ernteRausch={ernteRausch}
                nachfrage={nachfrage}
                setProfilOffen={setProfilOffen}
                isProfilOffen={isProfilOffen}
                playerAppearance={playerAppearance}
                skillStand={skillStand}
                localPlayerNameRef={localPlayerNameRef}
                gold={gold}
                setMailboxMode={setMailboxMode}
                setMailboxRecipient={setMailboxRecipient}
                setMailboxOpen={setMailboxOpen}
                mailbox={mailbox}
                setGoldShopOpen={setGoldShopOpen}
                ladeGoldShop={ladeGoldShop}
                plotPlants={plotPlants}
                skillWirkung={skillWirkung}
                setVielfaltOffen={setVielfaltOffen}
                vielfaltOffen={vielfaltOffen}
                setPetOverlayOpen={setPetOverlayOpen}
                petPlacements={petPlacements}
                mySlotIndex={mySlotIndex}
                setChatOffen={setChatOffen}
                setFarbwahlOffen={setFarbwahlOffen}
                setEmojiWahlOffen={setEmojiWahlOffen}
                istChatOffen={istChatOffen}
                chatUngelesen={chatUngelesen}
                chatListeRef={chatListeRef}
                chatAmEndeRef={chatAmEndeRef}
                chatVerlauf={chatVerlauf}
                authUser={authUser}
                besucheSpieler={besucheSpieler}
                istFarbwahlOffen={istFarbwahlOffen}
                setChatFarbe={setChatFarbe}
                chatFarbe={chatFarbe}
                istEmojiWahlOffen={istEmojiWahlOffen}
                setChatEingabe={setChatEingabe}
                chatAbschicken={chatAbschicken}
                chatEingabe={chatEingabe}
                lobbyConnected={lobbyConnected}
                weatherState={weatherState}
                isPublicWorld={isPublicWorld}
                activeCode={activeCode}
                notify={notify}
            />

            {/* Umstell-Modus: ohne Hinweis wüsste niemand, dass der nächste Klick zählt. */}
            {verschiebtGebaeude && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} px-4 py-2.5 flex items-center gap-3 text-xs`}>
                    <HudIcon.reposition size={14} className="shrink-0" />
                    <span className="text-slate-200">
                        {GEBAEUDE_NAMEN[verschiebtGebaeude] || "Gebäude"} umstellen — auf eine Wiesenfläche
                        deines Grundstücks klicken
                    </span>
                    <button
                        type="button"
                        onClick={() => setVerschiebtGebaeude(null)}
                        className="text-amber-100 hover:text-white transition-colors font-semibold underline"
                    >
                        Abbrechen
                    </button>
                </div>
            )}

            {/* ── Selected seed indicator ──────────────────────────────────── */}
            {selectedTool && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    {React.createElement(toolIcon(selectedTool), { size: 14, className: "text-violet-400 shrink-0" })}
                    <span className="font-medium">
                        {selectedTool === "pickaxe" ? "Spitzhacke" : selectedTool === "pot" ? "Pflanztopf" : selectedTool === "watering" ? "Gießkanne" : "Schaufel"}
                    </span>
                    {selectedTool === "pot" && movingPlantSource && <span className="text-slate-400">· Quelle gewählt</span>}
                    {selectedTool === "shovel" && <span className="text-slate-400">· gedrückt halten zum Entfernen</span>}
                    <button
                        type="button"
                        aria-label="Werkzeug weglegen"
                        onClick={() => { setSelectedTool(null); setMovingPlantSource(null); setShovelHoldState({ active: false, progress: 0 }); setSelectedDecoToPlace(null); }}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <HudIcon.close size={14} />
                    </button>
                </div>
            )}
            {selectedDecoToPlace && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    <ItemIcon item={selectedDecoToPlace} className="w-4 h-4" emojiClassName="text-sm" />
                    <span className="font-medium">{selectedDecoToPlace.name}</span>
                    <span className="text-slate-400">· Klick setzt die untere linke Ecke</span>
                    <span className="text-slate-400 flex items-center gap-1">
                        ·
                        <kbd className="bg-slate-800 border border-slate-700 px-1 rounded-xl text-[10px]">R</kbd>
                        <span>
                            {istBoden(selectedDecoToPlace)
                                ? (decoRotiert ? "hochkant" : "drehen")
                                : (decoGespiegelt ? "gespiegelt" : "spiegeln")}
                        </span>
                    </span>
                    <button
                        type="button"
                        aria-label="Deko weglegen"
                        onClick={() => setSelectedDecoToPlace(null)}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <HudIcon.close size={14} />
                    </button>
                </div>
            )}
            {selectedPetToPlace && (
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 ${HUD_SURFACE} px-3 py-2 text-xs text-slate-200 flex items-center gap-2`}>
                    <TabIcon.pet size={14} className="shrink-0" />
                    <span className="font-medium">{selectedPetToPlace.name}</span>
                    <span className="text-slate-400">· auf dein Grundstück klicken</span>
                    <button
                        type="button"
                        aria-label="Tier weglegen"
                        onClick={() => setSelectedPetToPlace(null)}
                        className="ml-1 text-slate-500 hover:text-white transition-colors"
                    >
                        <HudIcon.close size={14} />
                    </button>
                </div>
            )}
            {selectedTool === "shovel" && shovelHoldState.active && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-44">
                    <div className="h-1.5 w-full rounded-xl bg-slate-800 overflow-hidden">
                        <div className="h-full bg-rose-500 transition-[width] duration-75" style={{ width: `${Math.round(shovelHoldState.progress * 100)}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400 text-center mt-1">Pflanze entfernen…</div>
                </div>
            )}
            <SkillTreeModal
                offen={skillsOffen}
                onClose={() => setSkillsOffen(false)}
                onBack={() => { setSkillsOffen(false); setProfilOffen(true); }}
                katalog={skillKatalog}
                stand={skillStand}
                onLernen={lerneSkill}
                onZuruecksetzen={setzeSkillsZurueck}
            />
            <QuestBoardModal
                offen={isQuestBoardOpen}
                onClose={() => setQuestBoardOpen(false)}
                daten={questDaten}
                onAbholen={questAbholen}
                rucksack={harvestedItems}
                onLiefern={auftragLiefern}
                onAblehnen={auftragAblehnen}
                onAuftraegeNeuLaden={ladeQuests}
                onErntefestAbholen={erntefestAbholen}
                ladeWettbewerb={ladeWettbewerb}
                ladeSaisonziele={ladeSaisonziele}
            />
            <GoldShopModal
                offen={isGoldShopOpen}
                onClose={() => setGoldShopOpen(false)}
                daten={goldShopDaten}
                gold={gold}
                onKaufen={reskinKaufen}
                onAusruesten={reskinAusruesten}
            />
            {/* Der Schlüssel trägt den Grundstücks-Index vorne: "3:2_5". Ohne ihn
                landete der Hover über einem fremden Acker im eigenen Bestand. */}
            <PlantHoverLayer
                store={hoverStore}
                xpJeSorte={xpJeSorte}
                getPlant={(k) => {
                    const trenner = String(k).indexOf(":");
                    if (trenner === -1) return engineRef.current.plotPlants?.[k] || null;
                    const slotIndex = Number(k.slice(0, trenner));
                    const zelle = k.slice(trenner + 1);
                    if (slotIndex === mySlotRef.current) return engineRef.current.plotPlants?.[zelle] || null;
                    const roh = plotsRef.current.get(slotIndex)?.plants?.[zelle];
                    // Die Momentaufnahme trägt keine Bildpfade (der Server kennt nur
                    // Werte) — dieselbe Ableitung wie für den eigenen Acker.
                    return roh ? hydratePlantVisuals(roh) : null;
                }}
                getOwner={(k) => {
                    const trenner = String(k).indexOf(":");
                    if (trenner === -1) return null;
                    const slotIndex = Number(k.slice(0, trenner));
                    if (slotIndex === mySlotRef.current) return null;
                    return plotsRef.current.get(slotIndex)?.owner || null;
                }}
            />
            {itemHoverTooltip?.item && (
                <GegenstandTooltip
                    getItemTooltipStyle={getItemTooltipStyle}
                    itemHoverTooltip={itemHoverTooltip}
                    getSpecialLabel={getSpecialLabel}
                    getStatusEffectLabel={getStatusEffectLabel}
                />
            )}

            {/* v2 (Feedback 29.08.: "Klick auf Profil-Bubble zeigt Name, Geist-Bild,
                Fähigkeitsbaum-/Umkleide-Knopf, aktuelles Gold, Gesamt gesammeltes
                Gold, XP, Logbuch-Knopf") — war erst ein rechtsbündiges Klapp-Panel
                unter der Bubble, per Feedback 30.08. ("Profil-Fenster soll mittig
                und größer sein") jetzt ein echtes GardenModal wie Schuppen/Skillbaum/
                Umkleide: Kopf (Geist + Name + Level), XP-Leiste mit Zahlen, Gold-
                Block (Kontostand UND Lebenszeit-Summe, siehe goldGesamt/gutschreiben()
                in economy.js), dann die drei Knöpfe. */}
            {isProfilOffen && (
                <ProfilFenster
                    setProfilOffen={setProfilOffen}
                    playerAppearance={playerAppearance}
                    localPlayerNameRef={localPlayerNameRef}
                    skillStand={skillStand}
                    gold={gold}
                    goldGesamt={goldGesamt}
                    setSkillsOffen={setSkillsOffen}
                    setWardrobeOpen={setWardrobeOpen}
                    setLogbuchOpen={setLogbuchOpen}
                    logbuch={logbuch}
                    wettbewerbSiege={wettbewerbSiege}
                    prestigeStand={prestigeStand}
                    setNeueSaatOffen={setNeueSaatOffen}
                    zuchtbuch={zuchtbuch}
                    goldShopDaten={goldShopDaten}
                />
            )}
            {neueSaatOffen && (
                <NeueSaatFenster
                    apiCall={apiCall}
                    notify={notify}
                    stand={prestigeStand}
                    onClose={() => setNeueSaatOffen(false)}
                />
            )}

            {/* v2 (Feedback 29.08.): Schuppen-Auswahl — Kiste, Vitrine und Mülleimer
                stehen jetzt in EINEM Gebäude auf dem Feld; die E-Taste öffnet hier
                erst die Auswahl, statt direkt eins der drei Fenster. */}
            {isShedOpen && (
                <SchuppenAuswahl
                    setShedOpen={setShedOpen}
                    setAblageOffen={setAblageOffen}
                    toolInventory={toolInventory}
                    setTrashOpen={setTrashOpen}
                    setIncubatorTargetSlot={setIncubatorTargetSlot}
                    setIncubatorOpen={setIncubatorOpen}
                    readyEggsCount={readyEggsCount}
                    setEditorAktiv={setEditorAktiv}
                    setVerschiebtGebaeude={setVerschiebtGebaeude}
                />
            )}

            {isTrashOpen && (
                <MuellFenster
                    setTrashOpen={setTrashOpen}
                    setShedOpen={setShedOpen}
                    inventory={inventory}
                    setInventory={setInventory}
                    setSelectedSeed={setSelectedSeed}
                    notify={notify}
                    debouncedSave={debouncedSave}
                    decoInventory={decoInventory}
                    setDecoInventory={setDecoInventory}
                    selectedDecoToPlace={selectedDecoToPlace}
                    setSelectedDecoToPlace={setSelectedDecoToPlace}
                />
            )}

            {ablageOffen && (
                <AblageFenster
                    ablageOffen={ablageOffen}
                    chestItems={chestItems}
                    vitrineItems={vitrineItems}
                    harvestedItems={harvestedItems}
                    inventory={inventory}
                    eggInventory={eggInventory}
                    decoInventory={decoInventory}
                    petInventory={petInventory}
                    ablageBusy={ablageBusy}
                    setAblageOffen={setAblageOffen}
                    setShedOpen={setShedOpen}
                    handleAblage={handleAblage}
                    setEditorAktiv={setEditorAktiv}
                    setVerschiebtGebaeude={setVerschiebtGebaeude}
                />
            )}

            {fremdeVitrine && (
                <FremdeVitrineFenster
                    fremdeVitrine={fremdeVitrine}
                    setFremdeVitrine={setFremdeVitrine}
                />
            )}

            {isLogbuchOpen && (
                <LogbuchModal
                    logbuch={logbuch}
                    zuchtbuch={zuchtbuch}
                    inventory={inventory}
                    onClose={() => setLogbuchOpen(false)}
                    onBack={() => { setLogbuchOpen(false); setProfilOffen(true); }}
                />
            )}

            {isMailboxOpen && (
                <MailboxModal
                    mailbox={mailbox}
                    onClose={() => setMailboxOpen(false)}
                    onClaim={handleClaimMail}
                    onSend={handleSendMail}
                    seedInventory={inventory}
                    harvestInventory={harvestedItems}
                    petInventory={petInventory}
                    busy={mailBusy}
                    mode={mailboxMode}
                    recipient={mailboxRecipient}
                />
            )}

            {worldFull && (
                <WeltVollHinweis
                    flushFarmStateToServer={flushFarmStateToServer}
                    setShowLobbyScreen={setShowLobbyScreen}
                />
            )}

            {/* v2, "Look & Overlays": vorher eine Hover-Dropdown-Karte unter dem
                HUD-Knopf — jedes andere Fenster im Spiel öffnet über einen Klick,
                das hier tat es nicht. Jetzt ein eigenes Overlay, per Klick auf
                "Tiere". Inhaltlich unverändert (Aktive-Boni-Zusammenfassung +
                platzierte Tiere), nur als Karten statt als schmale Textliste —
                das Rarität-Farbband je Karte macht die Übersicht auf einen Blick
                bunter, ohne dass irgendwo eine neue Farbe erfunden werden musste. */}
            {isPetOverlayOpen && (
                <TierUebersicht
                    petPlacements={petPlacements}
                    mySlotIndex={mySlotIndex}
                    skillWirkung={skillWirkung}
                    setPetOverlayOpen={setPetOverlayOpen}
                    setInspectedPet={setInspectedPet}
                />
            )}

            {inspectedPet && (
                <TierDetail
                    inspectedPet={inspectedPet}
                    skillWirkung={skillWirkung}
                    setInspectedPet={setInspectedPet}
                    handleStowInspectedPet={handleStowInspectedPet}
                    handleSellInspectedPet={handleSellInspectedPet}
                    handleRenamePet={handleRenamePet}
                />
            )}

            {/* ── Deko-Leiste des Editors ─────────────────────────────────────
                Der ganze Deko-Bestand auf einen Blick, direkt über der Schnellleiste.
                Vorher führte der Weg zu jedem Stück durch das Inventar-Fenster —
                beim Einrichten öffnet und schliesst man das sonst dutzendfach. */}
            {editorAktiv && (
                <EditorLeiste
                    decoInventory={decoInventory}
                    decoPlacements={decoPlacements}
                    mySlotIndex={mySlotIndex}
                    selectedDecoToPlace={selectedDecoToPlace}
                    setSelectedDecoToPlace={setSelectedDecoToPlace}
                    setSelectedTool={setSelectedTool}
                    setSelectedSeed={setSelectedSeed}
                    setSelectedCarryItem={setSelectedCarryItem}
                    setSelectedPetToPlace={setSelectedPetToPlace}
                />
            )}

            {/* ── Hotbar ──────────────────────────────────────────────────── */}
            <Schnellleiste
                hotbarItems={hotbarItems}
                selectedSeed={selectedSeed}
                selectedCarryItem={selectedCarryItem}
                selectedPetToPlace={selectedPetToPlace}
                selectedDecoToPlace={selectedDecoToPlace}
                setSelectedSeed={setSelectedSeed}
                setSelectedCarryItem={setSelectedCarryItem}
                setSelectedPetToPlace={setSelectedPetToPlace}
                setSelectedDecoToPlace={setSelectedDecoToPlace}
                setSelectedTool={setSelectedTool}
                setMovingPlantSource={setMovingPlantSource}
                setItemHoverTooltip={setItemHoverTooltip}
            />
            {currentInteractable && !activeShop && !isBackpackOpen && !isMarketOpen && !isIncubatorOpen && !isMailboxOpen && !isTrashOpen && !isShedOpen && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.currentTarget.blur();
                        activateInteractable(currentInteractable);
                    }}
                    // Feedback 30.08.: "Interaktions-Knöpfe (Briefkasten, Shops, …)
                    // überlappen im Editor mit der Deko-Leiste" — die wächst bei vollem
                    // Deko-Vorrat bis zu ihrem Deckel (max-h-32 im Icon-Raster) auf gut
                    // 170 px, und lag damit über dem festen "bottom-32" hier drüber.
                    // Rutscht im Editor einfach höher, statt die Deko-Leiste bei jeder
                    // Vorratsgröße neu vermessen zu müssen.
                    // Cartoon-Überarbeitung 30.08.: derselbe Stufen-Schatten wie HUD_SURFACE/
                    // BTN_PRIMARY (gardenTokens.js), nur in Violett — das ist der Knopf, den
                    // man während des Spielens am häufigsten sieht, verdient also denselben
                    // drückbaren Auftritt wie alles andere.
                    className={`absolute left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl border-[3px] border-violet-950 bg-gradient-to-b from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 text-white text-sm font-bold shadow-[0_4px_0_0_#2e1065] active:translate-y-1 active:shadow-[0_1px_0_0_#2e1065] transition-[transform,box-shadow] duration-100 flex items-center gap-2 ${
                        editorAktiv ? "bottom-72" : "bottom-32"
                    }`}
                >
                    {currentInteractable.label} öffnen
                    {/* Am eigenen Kasten direkt sehen, ob etwas drin liegt */}
                    {currentInteractable.type === "mailbox" && currentInteractable.isOwn && mailbox.length > 0 && (
                        <span className="px-1.5 rounded-xl bg-white/20 text-[10px] font-semibold tabular-nums">
                            {mailbox.length}
                        </span>
                    )}
                    <kbd className="bg-violet-900 border-2 border-violet-400/50 px-1.5 rounded-xl text-[10px] font-medium">E</kbd>
                </button>
            )}

            {/* ── Bottom-Right: Inventory ──────────────────────────────────── */}
            {/* Inventar und Schnellreise sind die Knöpfe, die man am häufigsten
                trifft — eine Stufe größer als der Rest des HUD. */}
            <button
                type="button"
                onClick={() => setBackpackOpen(true)}
                className={`absolute bottom-5 right-5 pl-1.5 pr-4 py-1.5 ${HUD_SURFACE} text-slate-200 hover:text-white transition-colors flex items-center gap-2.5 text-sm font-medium`}
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                    <HudIcon.inventory size={24} />
                </span>
                Inventar
            </button>

            {/* Der eigene "Level N"-Knopf unten rechts ist raus (Feedback 30.08.:
                "seit der Skilltree in der Profil-Bubble ist, braucht es ihn nicht
                mehr doppelt") — Fähigkeiten öffnet jetzt nur noch über die
                Profil-Bubble oben rechts, die auch den Punkte-frei-Hinweis trägt. */}

            {/* ── Oben Mitte: Schnellreise (Feedback 29.08.: "Verkauf, Shop und Farm
                oben mittig nebeneinander") ─────────────────────────────────── */}
            <HudObenMitte
                teleportToMarketArea={teleportToMarketArea}
                teleportToShopArea={teleportToShopArea}
                teleportToMyFarm={teleportToMyFarm}
            />

            {/* ── Bottom-Left: Editor (Feedback 29.08.) ───────────────────────── */}
            <HudUntenLinks
                editorAktiv={editorAktiv}
                setSelectedDecoToPlace={setSelectedDecoToPlace}
                setVerschiebtGebaeude={setVerschiebtGebaeude}
                flushFarmStateToServerRef={flushFarmStateToServerRef}
                setEditorAktiv={setEditorAktiv}
            />

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: SHOP
            ═══════════════════════════════════════════════════════════════ */}
            {activeShop === "seed" && (
                <SamenLaden
                    onClose={() => setActiveShop(null)}
                    countdown={formatCountdown(shopMins, shopSecs)}
                    gold={gold}
                    shopFilter={shopFilter}
                    setShopFilter={setShopFilter}
                    lohnendeShopSeeds={lohnendeShopSeeds}
                    shopRotation={shopRotation}
                    visibleShopSeeds={visibleShopSeeds}
                    ladenBestand={ladenBestand}
                    rucksackVoll={rucksackVoll}
                    xpJeSorte={xpJeSorte}
                    onBuy={handleBuySeed}
                    onBuyAll={handleBuySeedAll}
                />
            )}
            {activeShop === "tool" && (
                <WerkzeugLaden
                    onClose={() => setActiveShop(null)}
                    countdown={formatCountdown(toolMins, toolSecs)}
                    gold={gold}
                    toolShopRotation={toolShopRotation}
                    toolInventory={toolInventory}
                    skillWirkung={skillWirkung}
                    skillStufe={skillStufe}
                    plotUnlockedCells={plotUnlockedCells}
                    toolShopStock={toolShopStock}
                    onBuy={handleBuyTool}
                    onBuyAll={handleBuyToolAll}
                />
            )}
            {activeShop === "egg" && (
                <EierLaden
                    onClose={() => setActiveShop(null)}
                    countdown={formatCountdown(eggMins, eggSecs)}
                    gold={gold}
                    eggShopStock={eggShopStock}
                    onBuy={handleBuyEgg}
                />
            )}
            {activeShop === "deco" && (
                <DekoLaden
                    onClose={() => setActiveShop(null)}
                    gold={gold}
                    dekoKategorie={dekoKategorie}
                    setDekoKategorie={setDekoKategorie}
                    onBuy={handleBuyDeco}
                />
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: UNIFIED INVENTORY
            ═══════════════════════════════════════════════════════════════ */}
            {isBackpackOpen && (
                <RucksackFenster
                    toolInventory={toolInventory}
                    inventory={inventory}
                    harvestedItems={harvestedItems}
                    eggInventory={eggInventory}
                    petInventory={petInventory}
                    decoInventory={decoInventory}
                    inventoryFilter={inventoryFilter}
                    inventarSortierung={inventarSortierung}
                    inventoryMaxSlots={inventoryMaxSlots}
                    setItemHoverTooltip={setItemHoverTooltip}
                    setBackpackOpen={setBackpackOpen}
                    setInventoryFilter={setInventoryFilter}
                    setInventarSortierung={setInventarSortierung}
                    setSelectedTool={setSelectedTool}
                    setMovingPlantSource={setMovingPlantSource}
                    setSelectedPetToPlace={setSelectedPetToPlace}
                    setSelectedDecoToPlace={setSelectedDecoToPlace}
                    setSelectedCarryItem={setSelectedCarryItem}
                    setSelectedSeed={setSelectedSeed}
                />
            )}
            {isMarketOpen && (
                <MarktFenster
                    setMarketOpen={setMarketOpen}
                    gold={gold}
                    handleSellAllHarvested={handleSellAllHarvested}
                    harvestedItems={harvestedItems}
                    isSubscriber={isSubscriber}
                    istGartenAdmin={istGartenAdmin}
                />
            )}
            {isIncubatorOpen && (
                <BrutkastenFenster
                    setIncubatorTargetSlot={setIncubatorTargetSlot}
                    setIncubatorOpen={setIncubatorOpen}
                    setShedOpen={setShedOpen}
                    eggInventory={eggInventory}
                    incubator={incubator}
                    unlockIncubatorSlot={unlockIncubatorSlot}
                    gold={gold}
                    tickNow={tickNow}
                    formatDuration={formatDuration}
                    collectHatchedEgg={collectHatchedEgg}
                    incubatorTargetSlot={incubatorTargetSlot}
                    placeEggInIncubator={placeEggInIncubator}
                />
            )}
            <Ausruestung
                istGartenAdmin={istGartenAdmin}
                equippedTools={equippedTools}
                selectedTool={selectedTool}
                setSelectedSeed={setSelectedSeed}
                setSelectedPetToPlace={setSelectedPetToPlace}
                setSelectedDecoToPlace={setSelectedDecoToPlace}
                setSelectedCarryItem={setSelectedCarryItem}
                setSelectedTool={setSelectedTool}
                setMovingPlantSource={setMovingPlantSource}
            />
            {/* 5. ANPASSUNG: Wardrobe Modal - Jetzt mit Preset-Buttons */}
            <WardrobeModal
                offen={isWardrobeOpen}
                onClose={() => setWardrobeOpen(false)}
                onBack={() => { setWardrobeOpen(false); setProfilOffen(true); }}
                aktuellerSkin={playerAppearance.skin}
                level={skillStand?.level || 1}
                onWaehlen={(skin) => setPlayerAppearance({ skin })}
            />
            {/* Changelog Modal. Die Versionsnummer im Untertitel kommt aus den Daten
                statt fest verdrahtet — sonst steht dort nach jeder Fassung wieder eine
                veraltete Nummer (stand zuletzt auf 3.0, während 3.1 schon draußen war). */}
            {isChangelogOpen && (
                <NeuerungenFenster
                    setChangelogOpen={setChangelogOpen}
                    offeneChangelogs={offeneChangelogs}
                    setOffeneChangelogs={setOffeneChangelogs}
                />
            )}

        </div>
    );
}