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
    Sprout, FlaskConical, Play, Package, Info, Search,
    MapPin, SlidersHorizontal, Send, Smile,
} from "lucide-react";
import { HudIcon, TabIcon, WeatherIcon } from './ui/gameIcons';
import Renderer, { LICHT_MAX, MAILBOX_RESKIN_BILD } from './engine/Renderer';
import InputHandler from './engine/InputHandler';
import { versionedAsset } from './engine/assetVersion';
import { generatePlotSlots, TILE_SIZE, MAP_CONFIG, getHoveredCell, getHoveredRock, getMailboxHitArea, getDirtCellWorldPos, STEIN_REIHEN, STEIN_WEG_REIHEN, istSteinfeldWegRow, istWegReihe, istAndereReihe, spiegleZeile, kachelIstAcker } from './engine/MapConfig';
// harvestPlant und getGoldfinderRange stehen bewusst nicht mehr hier: diese
// Rechnungen macht ab v3.0 der Server (garden/core/economy).
import {
    generateShopRotation, createPlantInstance, isPlantReady, getPlantVisuals,
    ensurePerennialFruitingState, WEATHER_SELL_BOOST, ARCHETYPE_LABELS, getPlantArchetypeKey,
    STATUS_EFFECT_LABELS, SEED_CATALOGUE, hydrateHarvestedItems, wetterEffektSchritt,
    wetterListe, wetterBoost, wetterChanceFuer, zyklusMinuten,
} from './engine/PlantSystem';
import {
    PET_PROC_CHANCE, PET_ABILITY_TYPES, PET_ABILITY_LABELS, PET_ABILITY_KURZ, getPetTickMs,
    getGaertnerStufe, getErntehelferStufe, getErntehelferExtra,
    getGaertnerNachwuchs, getGaertnerWurzelwerk, besteStufe, getGoldfinderRange,
    getForscherStufe, getKaufmannStufe, getForscherBoost, getKaufmannBoost,
} from './engine/PetSystem';
import {
    dunkelheit as tagesDunkelheit, partyStand, partyStaerke, uhrzeit as spielUhrzeit,
    istNacht, partyTitelIndex, PARTY_RAINBOW_FAKTOR,
} from './engine/Tageszeit';
import SEO from '../../components/SEO';
import PlantHoverLayer from './ui/PlantHoverLayer';
import { createHoverStore } from './ui/hoverStore';
import PetDetailModal from './ui/PetDetailModal';
import MailboxModal from './ui/MailboxModal';
import AblageModal, { FremdeVitrineModal } from './ui/AblageModal';
import LogbuchModal from './ui/LogbuchModal';
import SkillTreeModal from './ui/SkillTreeModal';
import WardrobeModal from './ui/WardrobeModal';
import QuestBoardModal from './ui/QuestBoardModal';
import GoldShopModal from './ui/GoldShopModal';
import { SHED_RESKIN_BILD } from './ui/reskins';
import { ALLE_SKINS, STANDARD_SKIN, normalisiereSkin } from './ui/wardrobe';
import { DEKO_KATALOG, DEKO_KATEGORIEN, dekoNachKategorie, dekoLicht, istBoden, alsVorratsstueck } from './ui/deko';
import useGardenLobby, { letzteWelt, vergissWelt } from './useGardenLobby';
import {
    RARITY_TEXT, RARITY_BORDER, RARITY_DOT, HUD_SURFACE,
    weatherIcon, toolIcon, categoryIcon, formatGold, formatDuration as formatDurationShared,
} from './ui/gardenTokens';
import { GardenModal, GoldTag, TimerTag, TabBar, PrimaryButton, RarityLabel } from './ui/gardenUi';
import { ItemIcon, SpecialItemIcon } from './ui/ItemIcon';
import { itemSpecialName } from './ui/itemTints';
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { GardenAdminBrowser } from "./GardenAdminPanel";

import {
    TwitchGlyph, COLLISION_RADIUS_BY_AREA_TYPE, START_GOLD, GIESSKANNE_MINUTEN,
    GIESSKANNE_MAX_ANTEIL, giesskanneMinuten, WAGEN_VERSATZ_X, INCUBATOR_UNLOCK_COSTS,
    INTERACT_DIST, FRUEHES_ABBIEGEN_AB, SHOP_ROTATION_MS, TOOL_EGG_ROTATION_MS, TARGET_FPS,
    MAX_PLOT_EXPANSIONS, ACKERRASTER_MARKE, MUSIK_BASIS, THEME_TRACKS, THEME_STANDARD,
    PARTY_TRACKS, partyTrack, themeTrack, FARM_SEO, WORLD_BOOT_MIN_MS, WORLD_SLOTS,
    GARTEN_ADMIN_ID, SHOTGUN_LAUTSTAERKE, SHOTGUN_HAND_ITEM, WORLD_ZOOM, ZOOM_MIN, ZOOM_MAX,
    ZOOM_SCHRITT, KISTE_MAX, VITRINE_MAX, PET_SLOTS, SCHUPPEN_KACHELN,
    berechneGebaeudePositionen, normalizeGebaeudeVersatz, MAILBOX_INTERACT_DIST, CHAT_MAX_LEN,
    CHAT_FARBEN, CHAT_EMOJIS, ERNTE_WARTESCHLANGE_MAX, RARITAETS_RANG, nachText,
    KATALOG_NACH_ID, zeitBisErsteErnte, SHOP_SORTIERUNGEN, INVENTAR_SORTIERUNGEN, sortiere,
    SortierLeiste, DEFAULT_TOOL_INVENTORY, BASE_DIRT_COLS, BASE_DIRT_ROWS, AREA_IMAGES,
    GEBAEUDE_NAMEN, FREMDE_GEBAEUDE, TOOL_IMAGE_BY_KEY, TOOL_IMAGE_BY_ID, TERRAIN_ASSET_IMAGES,
    PET_IMAGE_BY_TYPE, WEATHER_BY_ROLL, DEFAULT_RENDER_PROFILE, RENDER_QUALITY_PRESETS,
    EGG_SHOP_CATALOGUE, DECO_SHOP_ITEMS, WARDROBE_SKINS, PET_EMOJI_BY_TYPE, getPetEmoji,
    getToolImage, getPetSpriteImage, hashToUnit, rollWeatherFromRotation, getPickaxePrice,
    STEINFELDER_GESAMT, buildPetPreviewImage, normalizeToolInventory, hatTooltip,
    wachstumBeschleunigen, freiesAckerfeld, TAB_ID, BACKPACK_MAX_LEVEL, BUY_ALL_WERKZEUGE,
    getBackpackUpgradePrice, normalizePlotUnlockedCells, unlockedCellsFromLegacyExpansions,
    resolvePlotUnlockedCells, rollPetSpecialType, rollHatchResult, RARITY_COLORS, RarityBadge,
    withVisuals, hydratePet, hydratePets, hydrateSeed, hydrateSeeds, collectVisualAssetPaths,
    SeedFacts, ShopSeedCard
} from './engine/gameConstants';
import { CHANGELOG_ENTRIES } from './data/changelogEntries';

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
    const [shopFilter, setShopFilter] = useState("available"); // "all" | "available"
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
    const [questDaten, setQuestDaten] = useState({ taeglich: [], woechentlich: [] });
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
    const [worldBootState, setWorldBootState] = useState({ active: false, label: "", progress: 0 });
    const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
    // Als Ref, damit flushFarmStateToServer die Sperre ohne Stale-Closure lesen kann.
    const isInitialLoadDoneRef = useRef(false);
    const [isSubscriber, setIsSubscriber] = useState(false);
    const [isBeta, setIsBeta] = useState(false);
    const [tutorialCompleted, setTutorialCompleted] = useState(false);
    const [ackerRasterMigriert, setAckerRasterMigriert] = useState(false);
    const [effectVolume, setEffectVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_effect_volume");
        if (saved !== null) return parseFloat(saved);
        const old = localStorage.getItem("garden_farms_volume");
        return old !== null ? parseFloat(old) : 0.5;
    });
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_music_volume");
        return saved !== null ? parseFloat(saved) : 0.1;
    });
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
        return { uhrzeit: spielUhrzeit(now), nacht: istNacht(now), party: p.aktiv, verbleibendMs: p.verbleibendMs, partyBeginn: p.beginn };
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
    const effectVolumeRef = useRef(effectVolume);
    useEffect(() => {
        effectVolumeRef.current = effectVolume;
        localStorage.setItem("garden_farms_effect_volume", effectVolume.toString());
    }, [effectVolume]);

    const musicVolumeRef = useRef(musicVolume);
    useEffect(() => {
        musicVolumeRef.current = musicVolume;
        localStorage.setItem("garden_farms_music_volume", musicVolume.toString());
        if (soundsRef.current?.music) soundsRef.current.music.volume = musicVolume;
    }, [musicVolume]);

    /**
     * Welcher Titel gerade laufen soll: während der Party der Party-Titel, sonst das
     * gewählte Thema. Beides läuft über DIESELBE Audio-Instanz, damit der Musikregler
     * für beides gilt — ein zweites Audio-Objekt hätte seine eigene Lautstärke.
     */
    const laufenderPartyTitel = tagesInfo.party ? partyTrack(tagesInfo.partyBeginn || Date.now()) : null;
    const aktuellerTitel = laufenderPartyTitel ? laufenderPartyTitel.src : themeTrack(themeId).src;
    const aktuellerTitelRef = useRef(aktuellerTitel);
    useEffect(() => {
        aktuellerTitelRef.current = aktuellerTitel;
        localStorage.setItem("garden_farms_theme", themeId);
        const musik = soundsRef.current?.music;
        if (!musik) return;
        // `src` ist beim Vergleich absolut, der Katalog führt relative Pfade.
        if (musik.src.endsWith(aktuellerTitel)) return;
        musik.src = aktuellerTitel;
        musik.volume = musicVolumeRef.current;
        musik.currentTime = 0;
        if (!showLobbyScreenRef.current) musik.play().catch(() => {});
    }, [aktuellerTitel, themeId]);

    const showLobbyScreenRef = useRef(showLobbyScreen);
    useEffect(() => {
        showLobbyScreenRef.current = showLobbyScreen;
        if (soundsRef.current?.music) {
            if (showLobbyScreen) soundsRef.current.music.pause();
            else soundsRef.current.music.play().catch(() => {});
        }
    }, [showLobbyScreen]);

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
    const worldBootTokenRef = useRef(0);
    const worldBootKindRef = useRef(null); // "single" | "multi" | null — source of truth for boot type
    const worldBootStatusRef = useRef({ preloadDone: false, dataDone: false, minDoneAt: 0 });
    const worldBootFinishTimerRef = useRef(null);
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

    const soundsRef = useRef(null); // lazy nach erster Nutzer-Interaktion (Autoplay-Policy)
    const audioUnlockedRef = useRef(false);
    const lastRotationSoundRef = useRef(0);

    const ensureGardenSounds = useCallback(() => {
        if (soundsRef.current || typeof window === "undefined") return;
        // Der Titel steht in einem Ref, nicht im State: dieser Aufbau läuft beim
        // allerersten Klick und darf nicht an einem Rendervorgang hängen.
        const musicObj = new Audio(aktuellerTitelRef.current);
        musicObj.loop = true;
        musicObj.volume = musicVolumeRef.current;
        soundsRef.current = {
            rotation: new Audio("/garden-assets/sounds/rotation.mp3"),
            open: new Audio("/garden-assets/sounds/menu_open.mp3"),
            close: new Audio("/garden-assets/sounds/menu_close.mp3"),
            buy: new Audio("/garden-assets/sounds/kaching.mp3"),
            cash: new Audio("/garden-assets/sounds/cash.mp3"),
            rain: new Audio("/garden-assets/sounds/rain.mp3"),
            thunder: new Audio("/garden-assets/sounds/thunder.mp3"),
            plant: new Audio("/garden-assets/sounds/plant.mp3"),
            harvest: new Audio("/garden-assets/sounds/harvest.mp3"),
            shotgun: new Audio("/garden-assets/sounds/shotgun.mp3"),
            music: musicObj,
        };
        if (!showLobbyScreenRef.current) {
            musicObj.play().catch(() => {});
        }
        audioUnlockedRef.current = true;
    }, []);

    useEffect(() => {
        const unlock = () => {
            ensureGardenSounds();
        };
        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("keydown", unlock, { passive: true });
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, [ensureGardenSounds]);

    useEffect(() => {
        return () => {
            if (soundsRef.current?.music) {
                soundsRef.current.music.pause();
                soundsRef.current.music.src = "";
            }
            soundsRef.current = null;
        };
    }, []);

    const playSound = useCallback((type, volumeScale = 1.0) => {
        if (!audioUnlockedRef.current) return;
        const audio = soundsRef.current?.[type];
        if (!audio || type === "music") return;
        audio.volume = effectVolumeRef.current * volumeScale;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }, []);


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

    const tryCompleteWorldBoot = useCallback((token) => {
        if (token !== worldBootTokenRef.current) return;
        const status = worldBootStatusRef.current;
        if (!status.preloadDone || !status.dataDone) return;
        const finish = () => {
            if (token !== worldBootTokenRef.current) return;
            worldBootKindRef.current = null;
            setWorldBootState({ active: false, label: "", progress: 100 });
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        const waitMs = Math.max(0, status.minDoneAt - Date.now());
        if (waitMs > 0) {
            worldBootFinishTimerRef.current = setTimeout(finish, waitMs);
            return;
        }
        finish();
    }, []);

    const markWorldBootDataReady = useCallback((mode) => {
        const token = worldBootTokenRef.current;
        const status = worldBootStatusRef.current;
        if (token <= 0 || worldBootKindRef.current !== mode) return;
        status.dataDone = true;
        setWorldBootState((prev) => prev.active
            ? { ...prev, label: mode === "multi" ? "Server wird synchronisiert..." : "Farm wird vorbereitet...", progress: Math.max(prev.progress, 82) }
            : prev);
        tryCompleteWorldBoot(token);
    }, [tryCompleteWorldBoot]);

    const updateAreaPositions = useCallback((l) => {
        const a = engineRef.current.areas;
        // Siehe WAGEN_VERSATZ_X: die Werte halten Abstand zu den Grundstücksschildern.
        const y = {
            seedShop: l.centerPathTopY + 92, toolShop: l.centerPathTopY + 92,
            eggShop: l.centerPathBottomY - 140, decoShop: l.centerPathBottomY - 140,
            market: l.centerY, petMarket: l.centerY, questBoard: l.centerY,
        };
        for (const [art, versatz] of Object.entries(WAGEN_VERSATZ_X)) {
            a[art].x = l.centerX + versatz;
            a[art].y = y[art];
            a[art].image = AREA_IMAGES[art];
        }
    }, []);

    const startWorldBoot = useCallback((mode) => {
        const token = worldBootTokenRef.current + 1;
        worldBootTokenRef.current = token;
        worldBootKindRef.current = mode;

        layout.current = generatePlotSlots(WORLD_SLOTS);
        updateAreaPositions(layout.current);

        worldBootStatusRef.current = {
            preloadDone: false,
            dataDone: false,
            minDoneAt: Date.now() + WORLD_BOOT_MIN_MS,
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState({
            active: true,
            label: mode === "multi" ? "Verbinde mit Server..." : "Lade Welt...",
            progress: 8,
        });

        preloadCriticalAssets((done, total) => {
            if (token !== worldBootTokenRef.current) return;
            const pct = Math.max(12, Math.min(70, Math.round((done / total) * 70)));
            setWorldBootState((prev) => prev.active
                ? { ...prev, label: "Lade Texturen...", progress: Math.max(prev.progress, pct) }
                : prev);
        }).then(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
                setWorldBootState((prev) => prev.active
                ? { ...prev, label: mode === "multi" ? "Warte auf Lobby-Sync (WebSocket)…" : "Lade Farmdaten...", progress: Math.max(prev.progress, 76) }
                : prev);
            tryCompleteWorldBoot(token);
        }).catch(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
            tryCompleteWorldBoot(token);
        });
    }, [preloadCriticalAssets, tryCompleteWorldBoot]);

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
                // Kein Offline-Bericht mehr: Tiere arbeiten nur noch, solange man
                // zusieht (siehe engine/PetSystem.js).
            } catch (err) {
                console.error("Fehler beim Laden von der DB:", err);
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

    /**
     * Ladenbestand aus der Serverantwort übernehmen.
     *
     * Der Bestand ist seit v4.0 GLOBAL und gehört dem Server: alle teilen sich
     * einen Vorrat je Sorte. Vorher hatte jeder Spieler seinen eigenen, der Browser
     * hat ihn selbst heruntergezählt und im Spielstand mitgeführt — geprüft hat ihn
     * nie jemand. Der gespeicherte Bestand aus alten Ständen (`shopStock`) wird
     * deshalb bewusst NICHT mehr wiederhergestellt; er würde den echten überschreiben.
     */
    const uebernimmBestand = useCallback((rotation, angefordertAm = Infinity) => {
        // Eine Antwort, die VOR dem letzten Kauf losgeschickt wurde, kennt diesen
        // Kauf noch nicht. Sie trägt damit den Stand von davor und würde die frisch
        // abgezogene Zahl wieder hochsetzen — genau das Zurückspringen, das man nach
        // dem Kaufen kurz sah. Der Laden fragt alle vier Sekunden nach; die Chance,
        // dass ein Klick genau in eine laufende Abfrage fällt, ist entsprechend hoch.
        if (angefordertAm < letzterKaufAtRef.current) return;
        const stock = {};
        for (const s of rotation?.seeds || []) {
            stock[s.seedId] = s.active ? Math.max(0, Number(s.stock) || 0) : 0;
        }
        setLadenBestand(stock);
    }, []);

    useEffect(() => {
        if (savedToolShopStockRef.current && toolShopRotation?.generatedAt) {
            if (savedToolShopStockRef.current.version === Number(toolShopRotation.generatedAt)) {
                setToolShopStock(savedToolShopStockRef.current.stock);
            }
            savedToolShopStockRef.current = null;
        }
    }, [toolShopRotation?.generatedAt, ladenbestandGeladen]);

    useEffect(() => {
        if (savedEggShopStockRef.current && eggShopRotation?.generatedAt) {
            if (savedEggShopStockRef.current.version === Number(eggShopRotation.generatedAt)) {
                setEggShopStock(savedEggShopStockRef.current.stock);
            }
            savedEggShopStockRef.current = null;
        }
    }, [eggShopRotation?.generatedAt, ladenbestandGeladen]);

    // ── Shop rotation (global backend source) ──────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;

        let rotationTimer = null;
        const fetchGlobalShop = async () => {
            try {
                // Vor dem Abschicken merken: nur so lässt sich hinterher erkennen,
                // ob zwischenzeitlich ein eigener Kauf durchging (siehe uebernimmBestand).
                const angefordertAm = Date.now();
                const data = await apiCall("/global-shop");
                const now = Date.now();

                setShopRotationIfChanged(data.shopRotation || null);
                const seedGen = data.shopRotation?.generatedAt;
                // Bei JEDER Antwort übernehmen, nicht nur beim Rotationswechsel:
                // der Vorrat ist global und sinkt zwischendurch, weil andere kaufen.
                uebernimmBestand(data.shopRotation, angefordertAm);
                bestandFuerRotationRef.current = Number(seedGen);
                const seedKey = String(data.shopRotation?.generatedAt || "");
                if (seedKey && seedRotationKeyRef.current && seedRotationKeyRef.current !== seedKey) {
                    announceRotation("Samen-Shop hat rotiert");
                }
                if (seedKey) seedRotationKeyRef.current = seedKey;
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);

                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    const toolKey = String(data.toolShopRotation.generatedAt || "");
                    if (toolKey && toolRotationKeyRef.current && toolRotationKeyRef.current !== toolKey) {
                        announceRotation("Tool-Shop neu aufgefüllt");
                    }
                    if (toolKey) toolRotationKeyRef.current = toolKey;
                    // Nur beim WECHSEL der Rotation auffüllen — sonst macht der Poller
                    // jeden Kauf nach spätestens 30 s wieder rückgängig.
                    const toolGen = Number(data.toolShopRotation.generatedAt);
                    if (toolGen !== toolShopSeededForGenAtRef.current) {
                        const nextStock = {};
                        for (const item of data.toolShopRotation.items || []) {
                            if (item.type === "single") nextStock[item.id] = item.stock || 0;
                        }
                        setToolShopStock(nextStock);
                        toolShopSeededForGenAtRef.current = toolGen;
                    }
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation.nextRotation || 0);
                }

                // Server-Wahrheit bei JEDER Antwort übernehmen, nicht nur beim
                // Rotationswechsel (genau wie uebernimmBestand für Samen oben) —
                // sonst korrigiert sich ein einmal verdrehter Bestand (siehe
                // handleBuyTool) erst wieder nach zehn Minuten von selbst. Nur die
                // Sorten mit echtem Kontingent (plant_pot, watering_can): Spitzhacke
                // und Rucksack sind absichtlich unbegrenzt, ihr `stock` aus
                // werkzeugladen ist dafür nicht gedacht.
                if (Array.isArray(data.werkzeugladen) && angefordertAm >= letzterToolKaufAtRef.current) {
                    const mitKontingent = new Set(
                        (data.toolShopRotation?.items || [])
                            .filter((item) => item.type === "single")
                            .map((item) => item.id),
                    );
                    if (mitKontingent.size > 0) {
                        const naechsterBestand = {};
                        for (const eintrag of data.werkzeugladen) {
                            if (mitKontingent.has(eintrag.id) && Number.isFinite(eintrag.stock)) {
                                naechsterBestand[eintrag.id] = Math.max(0, eintrag.stock);
                            }
                        }
                        if (Object.keys(naechsterBestand).length > 0) {
                            setToolShopStock((prev) => ({ ...prev, ...naechsterBestand }));
                        }
                    }
                }

                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    const eggKey = String(data.eggShopRotation.generatedAt || "");
                    if (eggKey && eggRotationKeyRef.current && eggRotationKeyRef.current !== eggKey) {
                        announceRotation("Eier-Shop hat rotiert");
                    }
                    if (eggKey) eggRotationKeyRef.current = eggKey;
                    const eggGen = Number(data.eggShopRotation.generatedAt);
                    if (eggGen !== eggShopSeededForGenAtRef.current) {
                        const nextEggStock = {};
                        for (const item of data.eggShopRotation.items || []) {
                            nextEggStock[item.id] = item.stock || 0;
                        }
                        setEggShopStock(nextEggStock);
                        eggShopSeededForGenAtRef.current = eggGen;
                    }
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation.nextRotation || 0);
                }

                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));

                // Steht der Samenladen offen, häufiger nachfragen: der Vorrat ist
                // global, andere kaufen währenddessen, und ein Regal, das erst nach
                // 30 Sekunden leer wird, schickt einen bloss in „ausverkauft".
                const takt = ladenOffenRef.current === "seed" ? 4_000 : 30_000;
                const nextTimerMs = Math.max(1500, Math.min(
                    ...[
                        seedNextRotationAtRef.current,
                        toolNextRotationAtRef.current,
                        eggNextRotationAtRef.current,
                    ].filter(Boolean).map(ts => Math.max(0, ts - now)),
                    takt
                ));
                rotationTimer = setTimeout(fetchGlobalShop, nextTimerMs + 200);
            } catch {
                // Keep current rotation/timer on transient API failures to avoid
                // premature weather/shop jumps and visible UI flashing.
                if (!shopRotation?.generatedAt) {
                    const fallback = generateShopRotation(8);
                    setShopRotationIfChanged(fallback);
                    uebernimmBestand(fallback);
                    bestandFuerRotationRef.current = Number(fallback.generatedAt);
                    seedNextRotationAtRef.current = Date.now() + SHOP_ROTATION_MS;
                    setShopCountdown(SHOP_ROTATION_MS);
                }
                rotationTimer = setTimeout(fetchGlobalShop, 5000);
            }
        };
        fetchGlobalShop();
        return () => clearTimeout(rotationTimer);
    }, [showLobbyScreen, apiCall, uebernimmBestand, announceRotation, setShopRotationIfChanged]);

    // Einmaliger Nachlade-Versuch, falls beim Betreten noch keine Rotation da ist.
    //
    // Vorher hing dieser Effekt am GESAMTEN `shopRotation`-Objekt und setzte es selbst neu:
    // liefert der Server eine Rotation ohne Samen (`seeds: []`), greift die Abbruchprüfung
    // `shopRotation?.seeds?.length` nicht, der Effekt läuft erneut, holt, setzt ein neues
    // Objekt — und dreht sich mit voller Netzgeschwindigkeit im Kreis. In der Messung waren
    // das ~490 Zustandsänderungen pro Sekunde und damit praktisch alle React-Commits im
    // Leerlauf. Ein Ref begrenzt das jetzt auf einen Versuch; die laufende Aktualisierung
    // macht ohnehin der reguläre Rotations-Poller.
    useEffect(() => {
        if (showLobbyScreen) {
            shopBootstrapTriedRef.current = false;
            return;
        }
        if (shopRotation?.seeds?.length) return;
        if (shopBootstrapTriedRef.current) return;
        shopBootstrapTriedRef.current = true;
        apiCall("/global-shop")
            .then((data) => {
                if (!data?.shopRotation) return;
                setShopRotationIfChanged(data.shopRotation);
                const now = Date.now();
                // Wie im regulären Poller: der Vorrat ist global und gehört dem
                // Server, also wird er bei jeder Antwort übernommen statt nur beim
                // Rotationswechsel.
                uebernimmBestand(data.shopRotation);
                bestandFuerRotationRef.current = Number(data.shopRotation?.generatedAt);
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);
                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation?.nextRotation || 0);
                }
                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation?.nextRotation || 0);
                }
                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
            })
            .catch(() => { shopBootstrapTriedRef.current = false; });
    }, [showLobbyScreen, shopRotation?.seeds?.length, apiCall, uebernimmBestand, setShopRotationIfChanged]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (!shopRotation?.generatedAt) return;
        const rotationKey = String(shopRotation.generatedAt);
        // Von Hand gesetztes Wetter schlägt die Rotation, solange es läuft. Der
        // Rotationsschlüssel bleibt trotzdem der Anker für `startedAt`, damit die
        // Intensitätsrampe nicht bei jedem Poll neu anfängt.
        const uebersteuert = weltUebersteuerung.wetterTyp
            && (Number(weltUebersteuerung.wetterBis) || 0) > Date.now()
            ? WEATHER_BY_ROLL.find((w) => w.type === weltUebersteuerung.wetterTyp)
            : null;
        const nextWeather = uebersteuert || rollWeatherFromRotation(rotationKey);
        setWeatherState((prev) => {
            if (prev.type === nextWeather.type && prev.label === nextWeather.label && prev.startedAt === Number(rotationKey)) return prev;
            if (nextWeather.type === "rain") playSound("rain", 0.4);
            else if (nextWeather.type === "thunder") playSound("thunder", 0.5);
            return {
                ...nextWeather,
                intensity: 0.05,
                startedAt: Number(rotationKey) || Date.now(),
            };
        });
    }, [showLobbyScreen, shopRotation?.generatedAt, weltUebersteuerung.wetterTyp, weltUebersteuerung.wetterBis, notify, playSound]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        if (!weatherState || weatherState.type === "sun" || weatherState.intensity >= 1) return undefined;
        const timer = setInterval(() => {
            setWeatherState((prev) => {
                if (!prev || prev.type === "sun" || prev.intensity >= 1) return prev;
                return { ...prev, intensity: Math.min(1, (Number(prev.intensity) || 0) + 0.16) };
            });
        }, 120);
        return () => clearInterval(timer);
    }, [showLobbyScreen, weatherState?.type]);

    /**
     * Uhrzeit und Party-Countdown fürs HUD — einmal je Sekunde.
     *
     * Der Renderer holt sich Dunkelheit und Party-Stärke jedes Bild direkt aus der Uhr
     * (siehe drawState). Hier geht es nur um die Anzeige; ein Update je Bild würde die
     * ganze Komponente sechzigmal pro Sekunde neu rendern.
     */
    useEffect(() => {
        if (showLobbyScreen) return undefined;
        let warParty = tagesInfoRef.current.party;
        const lauf = () => {
            const now = Date.now();
            const p = partyStand(now);
            const vonHand = Number(weltRef.current?.partyBis) || 0;
            const naechste = {
                uhrzeit: spielUhrzeit(now),
                nacht: istNacht(now),
                party: p.aktiv || vonHand > now,
                verbleibendMs: Math.max(p.aktiv ? p.verbleibendMs : 0, vonHand > now ? vonHand - now : 0),
                // Der Beginn bleibt über die ganze Party derselbe und ist damit der
                // stabile Anker für die Titelwahl — `now` wäre es nicht.
                partyBeginn: p.beginn,
            };
            setTagesInfo((alt) => (
                alt.uhrzeit === naechste.uhrzeit && alt.nacht === naechste.nacht
                    && alt.party === naechste.party && alt.partyBeginn === naechste.partyBeginn
                    && Math.round(alt.verbleibendMs / 1000) === Math.round(naechste.verbleibendMs / 1000)
                    ? alt : naechste
            ));
            if (naechste.party !== warParty) {
                warParty = naechste.party;
                notify(naechste.party
                    ? `Partyzeit! „${partyTrack(naechste.partyBeginn).name}" läuft — Rainbow ist ${PARTY_RAINBOW_FAKTOR}× so wahrscheinlich.`
                    : "Die Party ist vorbei. Rainbow ist wieder so selten wie sonst.");
            }
        };
        lauf();
        const timer = setInterval(lauf, 1000);
        return () => clearInterval(timer);
    }, [showLobbyScreen, notify]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const effectType =
            weatherState?.type === "rain" ? "wet"
                : weatherState?.type === "snow" ? "frozen"
                    : weatherState?.type === "thunder" ? "charged"
                        : weatherState?.type === "moonlight" ? "moonlit"
                            : null;
        const interval = setInterval(() => {
            const now = Date.now();
            // Wetterfühlig: das Wetter greift häufiger zu.
            const skillFaktor = 1 + skillWirkung("wetterfuehlig");
                setPlotPlants((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [key, plant] of Object.entries(prev)) {
                    if (!plant) continue;
                    // Die Chance hängt jetzt am ZYKLUS der Pflanze, nicht mehr an
                    // einer festen Rate pro Minute. Vorher bekam eine Sorte mit
                    // Tagen an Wachstum garantiert alle vier Effekte (×11,25), eine
                    // mit Minuten praktisch keinen (×1,02) — der Aufschlag hing
                    // allein an der Wachstumsdauer und liess sich nicht einpreisen.
                    const wetterChance = wetterChanceFuer(zyklusMinuten(plant), skillFaktor);

                    // ── Dauerträger: Effekt hängt an der einzelnen Frucht ──────────
                    // Jede reife Frucht würfelt für sich. Dadurch können an einem Strauch
                    // zwei Früchte gefroren sein, ohne dass das Ernten der einen die
                    // andere zurücksetzt.
                    if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
                        let slotsChanged = false;
                        const nextSlots = plant.fruitSlots.map((slot) => {
                            if (!slot) return slot;
                            const aenderung = wetterEffektSchritt(slot, effectType, (slot.readyAt || 0) <= now, now, wetterChance);
                            if (!aenderung) return slot;
                            slotsChanged = true;
                            return { ...slot, ...aenderung };
                        });
                        if (slotsChanged) {
                            changed = true;
                            next[key] = { ...plant, fruitSlots: nextSlots };
                        }
                        continue;
                    }

                    // ── Einmalernte: Effekt gehört zur ganzen Pflanze ──────────────
                    const aenderung = wetterEffektSchritt(plant, effectType, isPlantReady(plant), now, wetterChance);
                    if (!aenderung) continue;
                    changed = true;
                    next[key] = { ...plant, ...aenderung };
                }
                return changed ? next : prev;
            });
        }, 60 * 1000);
        return () => clearInterval(interval);
        // Nur der Wetter-TYP ist relevant — mit dem vollen Objekt wurde das Intervall
        // während der Intensitäts-Rampe alle 120ms neu aufgesetzt. `skillWirkung` ist
        // ein Ref-Leser und ändert sich nie, hält das Intervall also auch nicht auf.
    }, [showLobbyScreen, weatherState?.type, skillWirkung]);

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

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const onKeyDown = (e) => {
            const target = e.target;
            const tag = (target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

            // Tab schaltet um, statt nur zu oeffnen — sonst kommt man mit derselben
            // Taste nicht wieder raus. Beim Schliessen auch den Hinweis wegnehmen,
            // der sonst ueber dem Spiel haengen bleibt.
            if (e.key === "Tab") {
                e.preventDefault();
                setBackpackOpen((offen) => {
                    if (offen) setItemHoverTooltip(null);
                    return !offen;
                });
                return;
            }

            // Deko in der Hand spiegeln — oder, bei einem Bodenbelag, drehen. Der
            // Fußabdruck bleibt so oder so gleich (Beläge sind immer 1×1): nur so
            // landet ein Objekt immer dort, wo man hinklickt (siehe DECO-Kommentar
            // oben). Dieselbe Taste macht bei Belägen bewusst etwas anderes, weil
            // Spiegeln dort optisch fast nie sichtbar ist (Texturen sind meist
            // links-rechts symmetrisch) — Drehen dagegen ist genau das, was einen
            // Weg auch hochkant verlegbar macht.
            if (e.code === "KeyR" && !e.repeat && selectedDecoToPlaceRef.current) {
                e.preventDefault();
                if (istBoden(selectedDecoToPlaceRef.current)) setDecoRotiert((prev) => !prev);
                else setDecoGespiegelt((prev) => !prev);
                return;
            }
            
            // Escape beendet das Einrichten — die naheliegendste Taste dafür.
            if (e.key === "Escape" && !e.repeat && editorAktivRef.current) {
                setEditorAktiv(false);
                setSelectedDecoToPlace(null);
                setVerschiebtGebaeude(null);
                return;
            }

            // 3. ANPASSUNG: Tool-Auswahl mit den Tasten 1, 2, 3, 4 (Ohne Shift)
            if (!e.shiftKey && !e.repeat) {
                const inv = toolInventoryRef.current || {};
                const equip = (key) => {
                    setSelectedSeed(null);
                    setSelectedPetToPlace(null);
                    setSelectedDecoToPlace(null);
                    setSelectedCarryItem(null);
                    setSelectedTool(prev => (prev === key ? null : key));
                    if (key !== "pot") setMovingPlantSource(null);
                };

                if (e.code === "Digit1" && inv.hasShovel) equip("shovel");
                if (e.code === "Digit2" && (inv.plantPots || 0) > 0) equip("pot");
                if (e.code === "Digit3" && (inv.pickaxeUses || 0) > 0) equip("pickaxe");
                if (e.code === "Digit4" && (inv.wateringCans || 0) > 0) equip("watering");
                if (e.code === "Digit5" && istGartenAdminRef.current) equip("shotgun");
            }

            if (!e.shiftKey || e.repeat) return;
            if (e.code === "Digit1") {
                e.preventDefault();
                teleportToMarketArea();
            } else if (e.code === "Digit2") {
                e.preventDefault();
                teleportToShopArea();
            } else if (e.code === "Digit3") {
                e.preventDefault();
                teleportToMyFarm();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [showLobbyScreen, teleportToMyFarm, teleportToShopArea, teleportToMarketArea]);


    // ── Main game loop ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener("resize", onResize);

        const engine = engineRef.current;
        if (engine.input && typeof engine.input.destroy === "function") {
            engine.input.destroy();
        }
        engine.input = new InputHandler();
        engine.renderer = new Renderer(canvas);
        

        let animFrame;
        let lastFrameTs = performance.now();
        const frameDuration = 1000 / TARGET_FPS;

        // Wiederverwendete Hüllen für den Render-Aufruf. Sie werden pro Frame nur neu
        // BEFÜLLT, nie neu erzeugt — vorher entstanden hier bei 60 FPS vier frische
        // Objekte pro Frame (Pflanzen-Klon, Slot, Layout, Payload), was den Garbage
        // Collector regelmäßig zu Sammelläufen zwang: genau die Mikro-Ruckler.
        // Unbedenklich, weil der Renderer nichts davon über den Frame hinaus festhält
        // (sein Slot-Cache vergleicht über einen wertbasierten cacheKey, nicht über
        // Objektidentität) und `layout.current` dabei unangetastet bleibt.
        const drawState = {};
        const layoutBuf = {};
        const slotsBuf = [];
        const mySlotBuf = {};
        const foreignSlotBufs = {}; // slotIndex -> wiederverwendete Hülle für fremde Äcker
        const remoteBuf = [];       // wiederverwendete Liste der Mitspieler
        const fremdeTiere = [];     // Tiere von fremden Grundstücken (aus den Snapshots)
        const fremdeDeko = [];      // Deko von fremden Grundstücken
        // Gebäude der anderen — alle sichtbar, aber nur die Vitrine ist anlaufbar
        // (siehe FREMDE_GEBAEUDE). Der Puffer verhindert eine Neuanlage pro Bild.
        const fremdeGebaeude = [];
        const fremdeGebaeudeBufs = {}; // `${slotIndex}_${art}` -> wiederverwendeter Eintrag
        const alleTiere = [];       // eigene + fremde, so bekommt der Renderer sie
        const alleDeko = [];

        const gameLoop = () => {
            const l = layout.current;
            const now = performance.now();
            if (now - lastFrameTs < frameDuration) {
                animFrame = requestAnimationFrame(gameLoop);
                return;
            }
            const frameMs = Math.max(1, now - lastFrameTs);
            const deltaFactor = Math.min(2.5, frameMs / (1000 / 60));
            lastFrameTs = now;

            const { input, renderer, player } = engine;
            input.update(); // flush key events

            // ── TILE-SPRUNG-BEWEGUNG ─────────────────────────────────────────
            // Ersetzt die vorherige kontinuierliche vx/vy-Bewegung: ein Tastendruck
            // ist jetzt EIN Sprung zur Nachbarkachel (TILE_SIZE), kein Dauerlauf.
            // `player.tileX/tileY` ist die logische, SOFORTIGE Kachel (Kollision
            // prüft dagegen); `player.x/y` bleibt die gerenderte Position und
            // tweent weich zur neuen Kachelmitte — Kamera, Nähe-Prüfung
            // (INTERACT_DIST weiter unten) und sendMove lesen unverändert nur x/y
            // und merken vom Sprung selbst nichts.
            // Prüft + startet (falls möglich) einen Sprung in Richtung dx/dy ab der
            // AKTUELLEN gerenderten Position. Eigene Funktion, weil sie jetzt an
            // zwei Stellen gebraucht wird: normaler Sprungstart UND frühes Abbiegen
            // (siehe unten) — beide teilen dieselbe Grenz-/Kollisionsprüfung.
            const versucheSprung = (dx, dy) => {
                const targetTileX = (player.tileX ?? 0) + dx;
                const targetTileY = (player.tileY ?? 0) + dy;
                const targetX = targetTileX * TILE_SIZE + TILE_SIZE / 2;
                const targetY = targetTileY * TILE_SIZE + TILE_SIZE / 2;

                const margin = 20;
                const inBounds = targetX >= margin && targetX <= l.worldWidth - margin
                    && targetY >= margin && targetY <= l.worldHeight - margin;
                if (!inBounds) return;

                // Dieselben Ausschlussradien wie vorher beim weichen Wegdrücken —
                // nur wird jetzt der SPRUNG verweigert, statt die Position im
                // Nachhinein zurückzuschieben: auf der Zielkachel darf kein
                // Ladenstand/Gebäude "im Weg stehen".
                for (const area of Object.values(engine.areas || {})) {
                    if (area?.aktiv === false) continue;
                    const minDist = COLLISION_RADIUS_BY_AREA_TYPE[area?.type];
                    if (!minDist) continue;
                    if (Math.hypot(targetX - area.x, targetY - area.y) < minDist) return;
                }

                if (dx > 0) player.facingRight = true;
                else if (dx < 0) player.facingRight = false;

                player.tileX = targetTileX;
                player.tileY = targetTileY;
                player.hopFromX = player.x;
                player.hopFromY = player.y;
                player.hopToX = targetX;
                player.hopToY = targetY;
                player.hopStart = now;
                player.hopping = true;
                player.hopDx = dx;
                player.hopDy = dy;
            };

            if (!player.hopping) {
                const hop = input.consumeHop(MAP_CONFIG.hopRepeatMs);
                if (hop) versucheSprung(hop.dx, hop.dy);
            } else if (now - player.hopStart >= MAP_CONFIG.hopMs * FRUEHES_ABBIEGEN_AB) {
                // Frühes Abbiegen (Feedback 28.08.: Richtungswechsel sollen sich
                // "flüssiger" anfühlen) — ab einem Teil der Sprungstrecke darf eine
                // FRISCH gedrückte, ANDERE Richtung den laufenden Sprung sofort
                // ablösen, statt bis zur Kachelmitte zu warten. peekFreshDirection
                // fasst dabei bewusst nicht dieselbe Wiederhol-Uhr an wie consumeHop
                // (siehe dort) — ein bloß gehaltener Zweitschlüssel bleibt also ruhig.
                const richtung = input.peekFreshDirection();
                if (richtung && (richtung.dx !== player.hopDx || richtung.dy !== player.hopDy)) {
                    versucheSprung(richtung.dx, richtung.dy);
                }
            }

            let isMoving = false;
            if (player.hopping) {
                const t = Math.min(1, (now - player.hopStart) / MAP_CONFIG.hopMs);
                const eased = 1 - (1 - t) * (1 - t); // ease-out: schneller Start, sanftes Einbremsen
                player.x = player.hopFromX + (player.hopToX - player.hopFromX) * eased;
                player.y = player.hopFromY + (player.hopToY - player.hopFromY) * eased;
                // Kleiner Hüpfer nach oben während des Sprungs, rein optisch (Renderer
                // liest player.hopBob als zusätzlichen Y-Versatz beim Zeichnen).
                player.hopBob = Math.sin(t * Math.PI) * MAP_CONFIG.hopBobPx;
                isMoving = true;
                if (t >= 1) {
                    player.hopping = false;
                    player.x = player.hopToX;
                    player.y = player.hopToY;
                    player.hopBob = 0;
                }
            }
            player.isMoving = isMoving;

            // ── INTERACTION PROXIMITY + E/SPACE ─────────────────────────────
            // Kein Objekt-Spread pro Frame mehr: nur die Referenz auf das nächste Areal
            // merken. setState läuft ausschließlich, wenn sich der Typ tatsächlich ändert —
            // vorher wurde bei 60+ FPS jeden Frame ein Updater in React geschoben.
            let nearestArea = null;
            let nearestDist = Infinity;
            for (const area of Object.values(engine.areas)) {
                if (area?.aktiv === false) continue;
                const dist = Math.hypot(player.x - area.x, player.y - area.y);
                if (dist < INTERACT_DIST && dist < nearestDist) {
                    nearestArea = area;
                    nearestDist = dist;
                }
            }

            // Schuppen der anderen: einmal pro Bild aus den Momentaufnahmen aufbauen.
            // Anlaufbar ist nur, wenn er eine Vitrine enthält — was in Mülleimer und
            // Kiste liegt, geht niemanden außer dem Besitzer etwas an.
            fremdeGebaeude.length = 0;
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current || !snapshot) continue;
                const fremdSlot = l.slots[slotIndex];
                if (!fremdSlot) continue;
                const stellen = berechneGebaeudePositionen(fremdSlot, snapshot.gebaeudeVersatz);
                const besitzer = snapshot.owner || "unbekannt";
                for (const art of FREMDE_GEBAEUDE) {
                    // Der Schuppen erscheint nur, wenn wenigstens die Vitrine gekauft ist —
                    // sonst stünde bei jedem Neuling ein Gebäude ohne jeden Inhalt herum.
                    if (art.key === "vitrine" && !snapshot.vitrine) continue;
                    const stelle = stellen.shed;
                    const bufKey = `${slotIndex}_${art.key}`;
                    const eintrag = fremdeGebaeudeBufs[bufKey] || (fremdeGebaeudeBufs[bufKey] = {
                        // `type` steuert die Bedienung, `art` das Aussehen — siehe bauart() im Renderer.
                        type: art.type, art: "shed",
                        label: "", image: AREA_IMAGES.shed, owner: null, items: [],
                    });
                    eintrag.x = stelle.x;
                    eintrag.y = stelle.y;
                    eintrag.fussY = stelle.fussY;
                    eintrag.owner = snapshot.owner || null;
                    eintrag.label = `${art.name} von ${besitzer}`;
                    // Reskin des Besitzers (core/reskins.js) — kommt mit der
                    // Momentaufnahme, dieselbe Quelle wie snapshot.reskins.mailbox
                    // beim eigenen Briefkasten-Zweig weiter unten.
                    eintrag.image = SHED_RESKIN_BILD[snapshot.reskins?.shed] || AREA_IMAGES.shed;
                    fremdeGebaeude.push(eintrag);
                    if (!art.anlaufbar) continue;
                    eintrag.items = snapshot.vitrine.items || [];
                    const dist = Math.hypot(player.x - eintrag.x, player.y - eintrag.y);
                    if (dist < INTERACT_DIST && dist < nearestDist) {
                        nearestArea = eintrag;
                        nearestDist = dist;
                    }
                }
            }

            // Briefkästen sind keine "areas" — sie hängen an den Grundstücken.
            // Sie konkurrieren um dieselbe "Öffnen"-Anzeige wie die Gebäude.
            let nearestMailboxSlot = null;
            let nearestMailboxOwner = null;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                // Der Besitzer steht bei FREMDEN Grundstücken nur in der Server-Momentaufnahme,
                // nicht auf l.slots — dort wird nur das eigene Schild beschriftet.
                const owner = i === mySlotRef.current
                    ? (slot.owner || localPlayerNameRef.current)
                    : (plotsRef.current.get(i)?.owner || null);
                if (!owner) continue; // freies Grundstück = kein Kasten in Betrieb
                const box = getMailboxHitArea(slot);
                const dist = Math.hypot(player.x - box.x, player.y - box.y);
                if (dist >= MAILBOX_INTERACT_DIST || dist >= nearestDist) continue;
                nearestMailboxSlot = slot;
                nearestMailboxOwner = owner;
                nearestDist = dist;
                nearestArea = null;
            }

            // Schlüssel statt Typ, damit auch der Wechsel zwischen zwei Briefkästen greift.
            const nearestKey = nearestMailboxSlot
                ? `mb${nearestMailboxSlot.id}`
                : (nearestArea?.type || null);
            if (nearestKey !== lastInteractableTypeRef.current) {
                lastInteractableTypeRef.current = nearestKey;
                if (nearestMailboxSlot) {
                    const isOwn = nearestMailboxSlot.id - 1 === mySlotRef.current;
                    activeTargetRef.current = {
                        type: "mailbox",
                        isOwn,
                        owner: nearestMailboxOwner,
                        label: isOwn ? "Deinen Briefkasten" : `Briefkasten von ${nearestMailboxOwner}`,
                    };
                } else {
                    activeTargetRef.current = nearestArea;
                }
                setCurrentInteractable(activeTargetRef.current);
            }
            if (activeTargetRef.current && (input.wasJustPressed("e") || input.wasJustPressed(" "))) {
                activateInteractable(activeTargetRef.current);
            }

            // Ein Tier wandert auf SEINEM Grundstück — egal, wem das gehört.
            // Auch fremde Tiere laufen dadurch herum statt wie angeklebt dazustehen.
            // Jeder Client würfelt das für sich; abgeglichen wird nichts, das würde
            // nur Datenverkehr kosten und sieht niemand.
            const bewegeTiere = (liste, slotIndex) => {
                const slot = l.slots[slotIndex];
                if (!slot || !Array.isArray(liste) || liste.length === 0) return;
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const minX = slot.x + 30;
                const maxX = slot.x + MAP_CONFIG.territoryWidth - 30;
                const minY = drawY + 30;
                const maxY = drawY + MAP_CONFIG.territoryHeight - 30;
                for (const pet of liste) {
                    if (!pet || pet.slotIndex !== slotIndex) continue;
                    if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) {
                        pet.x = (minX + maxX) / 2;
                        pet.y = (minY + maxY) / 2;
                    }
                    if (!Number.isFinite(pet.vx) || !Number.isFinite(pet.vy) || now >= (pet.changeDirAt || 0)) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 0.55 + Math.random() * 0.9;
                        pet.vx = Math.cos(angle) * speed;
                        pet.vy = Math.sin(angle) * speed;
                        pet.changeDirAt = now + 1400 + Math.random() * 2200;
                        if (pet.vx > 0) pet.facingRight = true;
                        else if (pet.vx < 0) pet.facingRight = false;
                    }
                    pet.x += pet.vx * deltaFactor;
                    pet.y += pet.vy * deltaFactor;
                    if (pet.x < minX || pet.x > maxX) {
                        pet.vx *= -1;
                        pet.x = Math.max(minX, Math.min(maxX, pet.x));
                        pet.facingRight = pet.vx > 0;
                    }
                    if (pet.y < minY || pet.y > maxY) {
                        pet.vy *= -1;
                        pet.y = Math.max(minY, Math.min(maxY, pet.y));
                    }
                }
            };

            bewegeTiere(engine.petPlacements, mySlotRef.current);
            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === mySlotRef.current) continue;
                bewegeTiere(snapshot?.petPlacements, slotIndex);
            }

            // Stauden: Struktur→Wachstum nur hier (nicht im Renderer) mutieren
            const wallNow = Date.now();
            if (engine.plotPlants) {
                for (const p of Object.values(engine.plotPlants)) {
                    if (p && !p.singleUse) ensurePerennialFruitingState(p, wallNow);
                }
            }

            // ── RENDER ───────────────────────────────────────────────────────
            // Inject live plant data into slots
            const myPlotSlotIndex = mySlotRef.current;

            // 1. ANPASSUNG: Pflanze während dem Umtopfen vom Feld ausblenden.
            // Der Klon ist NUR dafür nötig — und nur, solange wirklich umgetopft wird.
            // Im Normalfall (kein Umtopfen) reicht die Referenz auf engine.plotPlants,
            // und es fällt keine einzige Kopie an.
            const hiddenPlantKey = selectedToolRef.current === "pot" ? movingPlantSourceRef.current : null;
            let visiblePlants = engine.plotPlants;
            if (hiddenPlantKey && visiblePlants && hiddenPlantKey in visiblePlants) {
                visiblePlants = { ...engine.plotPlants };
                delete visiblePlants[hiddenPlantKey];
            }

            // Fremde Slots gehen unverändert per Referenz durch, nur der eigene bekommt
            // die Live-Daten übergestülpt — in eine wiederverwendete Hülle statt in ein
            // neues Objekt. `l.slots` selbst wird dabei nicht verändert.
            slotsBuf.length = l.slots.length;
            // Wiederverwendete Puffer: pro Bild wird nur die Laenge zurueckgesetzt,
            // damit im Spielbetrieb keine neuen Arrays anfallen.
            fremdeTiere.length = 0;
            fremdeDeko.length = 0;
            for (let i = 0; i < l.slots.length; i++) {
                const slot = l.slots[i];
                if (i !== myPlotSlotIndex) {
                    // Fremdes Grundstück: Momentaufnahme vom Server überstülpen, falls
                    // dort gerade jemand farmt. Ohne Snapshot bleibt der Slot leer/„zu verkaufen".
                    const snapshot = plotsRef.current.get(i);
                    if (snapshot) {
                        const buf = foreignSlotBufs[i] || (foreignSlotBufs[i] = {});
                        Object.assign(buf, slot);
                        buf.plants = snapshot.plants;
                        buf.unlockedCells = snapshot.plotUnlockedCells;
                        buf.owner = snapshot.owner;
                        buf.hasMail = snapshot.hasMail;
                        buf.mailboxReskin = snapshot.reskins?.mailbox || null;
                        // Farm-Schild bekommt denselben Skin wie die Nametag über dem
                        // Kopf (Feedback 01.09.) — siehe _drawSign in Renderer.js.
                        buf.nameplateReskin = snapshot.reskins?.nameplate || null;
                        slotsBuf[i] = buf;
                        // Tiere und Deko der anderen einsammeln — der Renderer bekommt
                        // sie als eine Liste und sortiert sie ueber `slotIndex` selbst
                        // auf die Grundstuecke.
                        if (Array.isArray(snapshot.petPlacements)) {
                            for (const pet of snapshot.petPlacements) if (pet) fremdeTiere.push(pet);
                        }
                        if (Array.isArray(snapshot.decoPlacements)) {
                            for (const deko of snapshot.decoPlacements) if (deko) fremdeDeko.push(deko);
                        }
                    } else {
                        slotsBuf[i] = slot;
                    }
                    continue;
                }
                Object.assign(mySlotBuf, slot);
                mySlotBuf.plants = visiblePlants;
                mySlotBuf.currentExpansions = plotExpansionsRef.current;
                mySlotBuf.unlockedCells = plotUnlockedCellsRef.current;
                // Eigener Briefkasten-Reskin — Nachbarn lesen ihren aus der
                // Momentaufnahme (siehe foreign-Zweig oben), hier ist es der
                // eigene, lokal ausgerüstete Stand.
                mySlotBuf.mailboxReskin = meineReskinsRef.current.mailbox;
                // Eigenes Farm-Schild — derselbe ausgerüstete Nameplate-Reskin wie
                // die Nametag über dem Kopf (Feedback 01.09.: "synchronisieren").
                mySlotBuf.nameplateReskin = meineReskinsRef.current.nameplate;
                slotsBuf[i] = mySlotBuf;
                // Eigener Schuppen-Reskin — JEDEN Frame statt einmalig in
                // ladeGoldShop, sonst überschreiben die Positions-Effekte
                // (a.shed.image = AREA_IMAGES.shed) die Zuweisung wieder.
                if (engine.areas?.shed) {
                    engine.areas.shed.image = SHED_RESKIN_BILD[meineReskinsRef.current.shed] || AREA_IMAGES.shed;
                }
            }

            // ── MITSPIELER ───────────────────────────────────────────────────
            // Der Server tickt mit 15 Hz; ohne Nachziehen würden fremde Avatare springen.
            const remotes = remoteBuf;
            remotes.length = 0;
            for (const remote of remotePlayersRef.current.values()) {
                remote.x += (remote.tx - remote.x) * Math.min(1, 0.22 * deltaFactor);
                remote.y += (remote.ty - remote.y) * Math.min(1, 0.22 * deltaFactor);
                remotes.push(remote);
            }
            sendMove(player.x, player.y, player.facingRight !== false, isMoving);

            Object.assign(layoutBuf, l);
            layoutBuf.slots = slotsBuf;

            // 1. & 2. ANPASSUNG: Welches Item wird gerade in der Hand gehalten?
            let activeHeldItem = heldItemRef.current;
            if (selectedToolRef.current === "pot" && movingPlantSourceRef.current) {
                // Wenn wir umtopfen, lege die echte Pflanze vom Acker als aktives Item in die Hand
                const p = engine.plotPlants[movingPlantSourceRef.current];
                if (p) activeHeldItem = p;
            }

            // Felder überschreiben statt ein neues Payload-Objekt zu bauen.
            drawState.areas = engine.areas;
            drawState.fremdeGebaeude = fremdeGebaeude;
            drawState.readyEggsCount = readyEggsCountRef.current;
            drawState.layout = layoutBuf;
            drawState.zoom = zoomRef.current;
            drawState.selectedTool = selectedToolRef.current;
            drawState.heldItem = activeHeldItem; // Hier übergeben wir das frisch berechnete Item
            drawState.weather = weatherStateRef.current;
            // Tageszeit und Party kommen aus der Uhr, nicht aus React-State: sie
            // ändern sich stetig, und ein State-Update je Bild würde die ganze
            // 8000-Zeilen-Komponente sechzigmal pro Sekunde neu rendern.
            drawState.nacht = tagesDunkelheit(Date.now());
            drawState.party = partyStaerkeJetzt(Date.now());
            drawState.renderProfile = renderProfileRef.current;
            // Eigene und fremde Tiere/Deko in einer Liste: der Renderer sortiert sie
            // ueber `slotIndex` auf die Grundstuecke und in die Tiefensortierung ein.
            alleTiere.length = 0;
            if (Array.isArray(engine.petPlacements)) {
                for (const pet of engine.petPlacements) if (pet) alleTiere.push(pet);
            }
            for (const pet of fremdeTiere) alleTiere.push(pet);
            alleDeko.length = 0;
            if (Array.isArray(engine.decoPlacements)) {
                for (const deko of engine.decoPlacements) if (deko) alleDeko.push(deko);
            }
            for (const deko of fremdeDeko) alleDeko.push(deko);
            drawState.petPlacements = alleTiere;
            drawState.decoPlacements = alleDeko;
            drawState.localPlayerName = localPlayerNameRef.current;
            drawState.playerAppearance = appearanceRef.current;
            drawState.playerBadge = playerBadgeRef.current;
            drawState.playerNameplate = meineReskinsRef.current.nameplate;
            drawState.remotePlayers = remotes;
            // Raster nur über dem EIGENEN Grundstück; slot.id ist der Index + 1.
            drawState.editorSlotId = editorAktivRef.current ? mySlotRef.current + 1 : null;

            renderer.draw(drawState, player);

            animFrame = requestAnimationFrame(gameLoop);
        };

        gameLoop();
        return () => {
            cancelAnimationFrame(animFrame);
            window.removeEventListener("resize", onResize);
            try {
                engineRef.current?.input?.destroy?.();
                // Der Renderer wurde bisher NICHT abgeräumt: seine Bild- und
                // Canvas-Caches (je Grundstück bis zu 400 Offscreen-Flächen) blieben
                // liegen, bis der Browser irgendwann aufräumt — bei mehrfachem
                // Betreten der Welt stapelten sich komplette Instanzen.
                engineRef.current?.renderer?.destroy?.();
            } catch { /* */ }
            engineRef.current.renderer = null;
            engineRef.current.input = null;
        };
    }, [showLobbyScreen, activateInteractable]);

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

    const debouncedSave = useCallback(() => {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            flushFarmStateToServerRef.current?.();
        }, 500);
    }, []);

    /**
     * Beim Verlassen NICHT abbrechen, sondern rausschicken.
     *
     * Hier stand `useEffect(() => () => clearTimeout(saveTimeoutRef.current), [])`:
     * der Aufräumer hat den ausstehenden Speichervorgang VERWORFEN. Da
     * `debouncedSave` (500 ms) der einzige Weg ist, auf dem Pflanzen, Steinabbau,
     * Gießen, Umtopfen, Deko, Tiere und Käufe zum Server kommen — und der
     * Autosave erst nach 5 Sekunden Ruhe greift —, war alles seit dem letzten PUT
     * weg, sobald man die Seite wechselte oder neu lud. Bei Käufen besonders
     * bitter: `payServer` hatte das Gold schon abgebucht, die Ware lag nur lokal.
     *
     * `keepalive` ist entscheidend: ein gewöhnliches fetch() wird beim Entladen
     * der Seite abgebrochen.
     */
    useEffect(() => {
        const raus = () => {
            if (!isInitialLoadDoneRef.current || nurZuschauenRef.current) return;
            clearTimeout(saveTimeoutRef.current);
            const stand = farmStateRef.current || {};
            // gold und harvestedItems gehören dem Server und stehen bewusst nicht
            // im Payload (siehe compactFarmState).
            const { gold: _g, harvestedItems: _h, ...rest } = stand;
            const payload = { ...rest, tabId: TAB_ID, stateVersion: stateVersionRef.current };
            try {
                fetch("/api/garden/farm-state", {
                    method: "PUT",
                    credentials: "include",
                    keepalive: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ state: payload }),
                }).catch(() => { /* Seite ist schon weg */ });
            } catch { /* egal */ }
        };
        const beiSichtwechsel = () => { if (document.visibilityState === "hidden") raus(); };
        window.addEventListener("pagehide", raus);
        document.addEventListener("visibilitychange", beiSichtwechsel);
        return () => {
            window.removeEventListener("pagehide", raus);
            document.removeEventListener("visibilitychange", beiSichtwechsel);
            raus();   // auch beim Seitenwechsel innerhalb der App
        };
    }, []);

    /**
     * Grundstück gewechselt? Alles mitnehmen, was am alten Platz klebt.
     *
     * Die Welten liegen nur im Arbeitsspeicher — nach einem Serverneustart vergibt die
     * Lobby die Plätze neu. Wer vorher unten stand und danach oben landet, wechselt
     * damit die REIHE, und daran hängen zwei verschiedene Altlasten:
     *
     *  1. Deko und Tiere speichern absolute Weltkoordinaten plus den Index ihres
     *     Grundstücks. Ohne Umrechnung lagen sie weiter an der alten Stelle — quer
     *     über der Karte auf fremdem Grund, während das eigene Grundstück leer war.
     *
     *  2. Freigelegte Steinfelder und die Pflanzen darauf zählen je nach Reihe ANDERS:
     *     oben wachsen die Erweiterungen nach oben (Reihe -1 bis -15), unten nach unten
     *     (Reihe 15 bis 29). Eine von unten mitgebrachte Reihe 16 landete oben rechnerisch
     *     unterhalb des Grundstücks — die Pflanzen standen auf dem Kiesweg.
     *
     * Das Grundstück ist zwischen den Reihen gespiegelt (der Acker liegt immer am Weg),
     * deshalb wird beim Reihenwechsel gespiegelt statt nur verschoben.
     */
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone) return;
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const ziel = layout.current.slots[mySlotIndex];
        if (!ziel) return;
        const obenkante = (slot) => (slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY);

        // ── Deko und Tiere: umrechnen, was auf einem anderen Grundstück verbucht ist ──
        const umziehen = (liste) => {
            if (!Array.isArray(liste) || liste.length === 0) return null;
            let geaendert = false;
            const neu = liste.map((eintrag) => {
                const alt = layout.current.slots[eintrag?.slotIndex];
                if (!alt || eintrag.slotIndex === mySlotIndex) return eintrag;
                geaendert = true;
                const x = Number.isFinite(eintrag.x) ? eintrag.x + (ziel.x - alt.x) : eintrag.x;
                let y = eintrag.y;
                if (Number.isFinite(y)) {
                    const relativ = y - obenkante(alt);
                    // Gleiche Reihe: schlicht verschieben. Andere Reihe: spiegeln, sonst
                    // landet Deko vom unteren Wiesenstreifen oben mitten im Acker.
                    y = alt.isTopRow === ziel.isTopRow
                        ? obenkante(ziel) + relativ
                        : obenkante(ziel) + MAP_CONFIG.territoryHeight - relativ;
                }
                return { ...eintrag, slotIndex: mySlotIndex, x, y };
            });
            return geaendert ? neu : null;
        };

        // ── Erweiterungsfelder: Zählweise der Reihe angleichen ───────────────────
        // Gültig sind oben -15..14, unten 0..29. Alles außerhalb stammt aus der
        // anderen Reihe und wird umgerechnet: Erweiterung n ist oben -n und unten 14+n.
        const andereReihe = (y) => istAndereReihe(y, ziel.isTopRow);
        const umrechnenY = (y) => spiegleZeile(y, ziel.isTopRow);

        const neueZellen = (() => {
            if (!Array.isArray(plotUnlockedCells) || plotUnlockedCells.length === 0) return null;
            let geaendert = false;
            const raus = plotUnlockedCells.map((key) => {
                const [xs, ys] = String(key).split("_");
                const y = Number(ys);
                if (!Number.isInteger(y) || !andereReihe(y)) return key;
                geaendert = true;
                return `${xs}_${umrechnenY(y)}`;
            });
            return geaendert ? normalizePlotUnlockedCells(raus) : null;
        })();

        const neuePflanzen = (() => {
            const keys = Object.keys(plotPlants || {});
            if (keys.length === 0) return null;
            let geaendert = false;
            const raus = {};
            // Erst alles übernehmen, was schon in der Zählweise dieser Reihe steht —
            // sonst könnte eine umgerechnete Pflanze eine bestehende überschreiben.
            const umzuziehen = [];
            for (const key of keys) {
                const y = Number(key.split("_")[1]);
                if (!Number.isInteger(y) || !andereReihe(y)) { raus[key] = plotPlants[key]; continue; }
                geaendert = true;
                umzuziehen.push(key);
            }
            for (const key of umzuziehen) {
                const [xs, ys] = key.split("_");
                const ziel = `${xs}_${umrechnenY(Number(ys))}`;
                // Ein gemischter Stand (beide Zählweisen gleichzeitig) sollte nicht
                // vorkommen, ein verspäteter PUT kann ihn aber erzeugen. Dann lieber
                // ein freies Nachbarfeld suchen als eine Pflanze verschwinden lassen.
                raus[raus[ziel] ? freiesAckerfeld(raus) || ziel : ziel] = plotPlants[key];
            }
            return geaendert ? raus : null;
        })();

        const neueDeko = umziehen(decoPlacements);
        const neueTiere = umziehen(petPlacements);
        if (!neueDeko && !neueTiere && !neueZellen && !neuePflanzen) return;
        if (neueDeko) setDecoPlacements(neueDeko);
        if (neueTiere) setPetPlacements(neueTiere);
        if (neueZellen) setPlotUnlockedCells(neueZellen);
        if (neuePflanzen) setPlotPlants(neuePflanzen);
        notify("Dein Grundstück liegt jetzt woanders — Acker, Deko und Tiere sind mitgezogen.");
        debouncedSave();
    }, [showLobbyScreen, isInitialLoadDone, mySlotIndex, decoPlacements, petPlacements,
        plotUnlockedCells, plotPlants, notify, debouncedSave]);

    /**
     * Rasterumstellung: Deko, die nach der Verschiebung auf dem Acker steht.
     *
     * Der Acker ist um eine halbe Kachel nach rechts gerückt, damit Acker- und
     * Dekoraster zusammenfallen (siehe dirtOffsetX in engine/MapConfig.js). Rechnerisch
     * kann dabei nichts ungültig werden — die gesperrten Spalten wurden WENIGER, nicht
     * mehr. Trotzdem läuft dieser Durchgang einmal je Spielstand: Gärten, die vor der
     * Ackerprüfung eingerichtet wurden, haben teils Stücke mitten im Feld stehen, und
     * ein zweites Mal sortiert er sie nicht (Marke im Spielstand).
     *
     * Bodenbeläge bleiben, wo sie sind: sie liegen UNTER allem und dürfen den Acker
     * überziehen — das ist beim Aufstellen ausdrücklich erlaubt.
     */
    useEffect(() => {
        if (showLobbyScreen || !isInitialLoadDone || ackerRasterMigriert) return;
        if (!Number.isInteger(mySlotIndex) || mySlotIndex < 0) return;
        const slot = layout.current.slots[mySlotIndex];
        if (!slot) return;
        const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
        const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
        const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
        const eigene = decoPlacements.filter((d) => d && d.slotIndex === mySlotIndex);
        const ankerKachel = (d) => ({
            tx: Math.floor((d.x - slot.x) / TILE_SIZE),
            ty: Math.floor((d.y - drawY) / TILE_SIZE),
        });
        const belegt = new Set();
        for (const d of eigene) {
            if (istBoden(d)) continue;
            for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.add(k);
        }
        const passt = (tx, ty, w, h) => {
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < h; dy++) {
                    const cx = tx + dx;
                    const cy = ty - dy;
                    if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) return false;
                    if (belegt.has(`${cx}_${cy}`)) return false;
                    if (dy === 0 && kachelIstAcker(slot, cx, cy)) return false;
                }
            }
            return true;
        };
        // Ringweise nach außen suchen, damit ein verschobenes Stück möglichst nah an
        // seinem alten Platz stehen bleibt.
        const freierPlatz = (tx, ty, w, h) => {
            for (let r = 1; r <= maxTilesY; r++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                        if (passt(tx + dx, ty + dy, w, h)) return { tx: tx + dx, ty: ty + dy };
                    }
                }
            }
            return null;
        };

        let verschoben = 0;
        const naechste = decoPlacements.map((d) => {
            if (!d || d.slotIndex !== mySlotIndex || istBoden(d)) return d;
            const { tx, ty } = ankerKachel(d);
            if (!kachelIstAcker(slot, tx, ty)) return d;
            const w = d.width || 1;
            const h = d.height || 1;
            for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.delete(k);
            const ziel = freierPlatz(tx, ty, w, h);
            if (!ziel) { for (const k of d.occupiedKeys || [d.gridKey]) if (k) belegt.add(k); return d; }
            const occupiedKeys = [];
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < h; dy++) occupiedKeys.push(`${ziel.tx + dx}_${ziel.ty - dy}`);
            }
            for (const k of occupiedKeys) belegt.add(k);
            verschoben++;
            return {
                ...d,
                x: slot.x + ziel.tx * TILE_SIZE + TILE_SIZE / 2,
                y: drawY + ziel.ty * TILE_SIZE + TILE_SIZE / 2,
                occupiedKeys,
            };
        });

        setAckerRasterMigriert(true);
        if (verschoben > 0) {
            setDecoPlacements(naechste);
            notify(`Der Acker liegt jetzt im selben Raster wie die Deko — ${verschoben} Stück wurden von der Erde geräumt.`);
        }
        debouncedSave();
    }, [showLobbyScreen, isInitialLoadDone, ackerRasterMigriert, mySlotIndex,
        decoPlacements, notify, debouncedSave]);

    /** Sofort speichern statt in 500 ms — noetig, bevor der Server ueber etwas
     *  entscheiden soll, das bisher nur im Browser steht (z. B. ein Tier). */
    const flushSave = useCallback(async (ueberschreibung) => {
        clearTimeout(saveTimeoutRef.current);
        await flushFarmStateToServerRef.current?.(ueberschreibung);
    }, []);

    /** Kasse: erst der Server bucht ab, dann bekommt der Spieler die Ware.
     *  Gold gehoert ab v3.0 dem Server — eine nur lokale Abbuchung waere beim
     *  naechsten Laden wieder da (und die Ware trotzdem im Rucksack). */
    const payServer = useCallback(async (betrag) => {
        const data = await apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "spend", amount: Math.round(Number(betrag) || 0) }),
        });
        if (typeof data?.gold === "number") {
            // SOFORT ins Ref, nicht erst beim nächsten Rendern. Die Warteschlange
            // startet den nächsten Kauf über setTimeout(0) — der läuft mitunter
            // schon, bevor React den neuen Goldstand übernommen hat. Prüfte der
            // nächste Kauf gegen den React-Wert, sähe er das Gold von VOR dieser
            // Zahlung, liesse einen Kauf durch, den man sich nicht mehr leisten
            // kann, und der Server müsste ihn ablehnen. Für den Spieler sah das so
            // aus, als spränge der Ladenbestand grundlos zurück.
            goldRef.current = data.gold;
            setGold(data.gold);
        }
        return data;
    }, [apiCall]);

    /**
     * Antwort der Wirtschafts-Route uebernehmen — der Server ist die Wahrheit.
     *
     * `zellen` nennt die tatsaechlich veraenderten Felder. Ohne diese Angabe wurde
     * bei JEDER Ernte die komplette Pflanzenkarte ersetzt: 35 neue Objekte, alle
     * Pflanzen-Caches im Renderer entwertet, ein grosser React-Commit mitten in der
     * Bewegung. Genau das machte das Einsammeln zaeh. Ein leeres Array heisst
     * "Pflanzen nicht anfassen" (z. B. beim Verkaufen).
     */
    /**
     * Übernimmt den Logbuch-Eintrag, den der SERVER bei „harvest" mitschickt.
     *
     * UMGEBAUT (v2, Punkt 11): stand vorher komplett im Browser — „reines
     * Nachschlagewerk ohne Spielwert". Seit „Seite komplett" Gold auszahlt
     * (logbuchAktualisieren in core/economy.js), stimmt dieser Satz nicht mehr:
     * ein selbst eingetragenes fertiges Logbuch hätte sich sonst bei der
     * nächsten Ernte irgendeiner Art ausgezahlt. Der Browser übernimmt jetzt nur
     * noch, was hier ankommt, statt es aus dem geernteten Stück nachzurechnen.
     */
    const logbuchUebernehmen = useCallback((serverLogbuch) => {
        if (!serverLogbuch || typeof serverLogbuch !== "object") return;
        setLogbuch((prev) => ({ ...prev, ...serverLogbuch }));
    }, []);

    /** „Seite komplett": Meldung samt Gold-Betrag, evtl. plus Logbuch-Gesamtbonus. */
    const logbuchBelohnungMelden = useCallback((belohnungen) => {
        if (!Array.isArray(belohnungen)) return;
        for (const b of belohnungen) {
            if (!b?.seedId) continue;
            const art = SEED_CATALOGUE.find((s) => s.id === b.seedId);
            notify(
                b.komplett
                    ? `Logbuch komplett! ${art?.name || b.seedId} fertig — +${formatGold(b.belohnung)} Gold (inklusive Gesamtbonus).`
                    : `${art?.name || b.seedId} im Logbuch komplett — +${formatGold(b.belohnung)} Gold.`,
            );
            playSound("cash", 0.6);
        }
    }, [notify, playSound]);

    const applyEconomy = useCallback((data, zellen) => {
        if (typeof data?.gold === "number") setGold(data.gold);
        if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
        // Bug (Feedback 29.08.: "bei Schnellernten kommt kein XP"): der Server
        // schickt skillStand bei JEDER Aktion mit (siehe gardenGameRoutes.js,
        // Kommentar dort), applyEconomy hat ihn nur nie gelesen. Level/XP-Leiste
        // im HUD blieben deshalb nach JEDER Ernte stehen, wo sie vor der Ernte
        // waren — bei einzelnen Klicks fiel das kaum auf, beim Shift-Ziehen über
        // ein volles Feld (viele Ernten ohne Zwischenstopp) wirkte es wie "gar
        // kein XP". Die schwebende "+X XP"-Rückmeldung war die ganze Zeit korrekt.
        if (data?.skillStand) setSkillStand(data.skillStand);
        if (data?.logbuch) logbuchUebernehmen(data.logbuch);
        if (data?.logbuchBelohnungen?.length) logbuchBelohnungMelden(data.logbuchBelohnungen);
        if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
        if (!data?.plotPlants || typeof data.plotPlants !== "object") return;
        if (!zellen) {
            setPlotPlants(normalizePlotPlantsMap(data.plotPlants));
            return;
        }
        if (zellen.length === 0) return;
        setPlotPlants((prev) => {
            const next = { ...prev };
            for (const key of zellen) {
                const vomServer = data.plotPlants[key];
                if (vomServer) next[key] = hydratePlantVisuals(vomServer);
                else delete next[key];
            }
            return next;
        });
    }, [normalizePlotPlantsMap, hydratePlantVisuals, logbuchUebernehmen, logbuchBelohnungMelden]);

    /**
     * Missionsbelohnung abholen — steht erst hier (statt direkt bei ladeQuests
     * weiter oben), weil sie applyEconomy aus dem Dependency-Array braucht und
     * die erst ab dieser Zeile im Render existiert (siehe Kommentar dort).
     */
    const questAbholen = useCallback(async (questId) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "questAbholen", questId }),
            });
            applyEconomy(data, []);
            playSound("cash", 0.6);
            notify(`${data?.name || "Mission"} abgeschlossen: +${formatGold(data?.belohnungGold || 0)} Gold, +${data?.belohnungXp || 0} XP`);
            ladeQuests();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound, ladeQuests]);

    /**
     * Gold-Shop: kaufen und ausrüsten — aus demselben Grund wie questAbholen
     * erst hier (applyEconomy im Dependency-Array).
     */
    const reskinKaufen = useCallback(async (kategorie, id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "reskinKaufen", kategorie, id }),
            });
            applyEconomy(data, []);
            playSound("cash", 0.6);
            notify("Gekauft und ausgerüstet.");
            await ladeGoldShop();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, playSound, ladeGoldShop]);

    const reskinAusruesten = useCallback(async (kategorie, id) => {
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "reskinAusruesten", kategorie, id }),
            });
            applyEconomy(data, []);
            await ladeGoldShop();
        } catch (err) {
            notify(err?.message || "Ging nicht.", "error");
        }
    }, [apiCall, applyEconomy, notify, ladeGoldShop]);

    /**
     * Ernte zwischen Rucksack und Ablage (Kiste/Vitrine) schieben. Beide Seiten
     * gehören dem Server — hier wird nur seine Antwort übernommen.
     */
    /**
     * Ein- und Auslagern, einzeln oder alles auf einmal.
     *
     * Seit die Kiste auch Samen, Eier, Deko und Tiere nimmt, verschiebt der Server
     * Listen, die dem BROWSER gehören. Deshalb wird vorher ausstehender Speicherstand
     * rausgeschickt: ein noch wartender PUT mit dem alten Rucksack würde sonst
     * gerade Eingelagertes wieder danebenlegen — das Stück läge dann doppelt da.
     */
    const handleAblage = useCallback(async (art, itemId, richtung) => {
        setAblageBusy(true);
        try {
            await flushSave();
            const alles = itemId === null || itemId === undefined;
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({
                    action: richtung === "ein"
                        ? (alles ? "ablageAllesEin" : "ablageEin")
                        : (alles ? "ablageAllesAus" : "ablageAus"),
                    ablage: art,
                    ...(alles ? {} : { itemId }),
                }),
            });
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.chestItems)) setChestItems(hydrateHarvestedItems(data.chestItems));
            if (Array.isArray(data?.vitrineItems)) setVitrineItems(hydrateHarvestedItems(data.vitrineItems));
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.eggInventory)) setEggInventory(data.eggInventory);
            if (Array.isArray(data?.decoInventory)) setDecoInventory(data.decoInventory);
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            if (alles && Number.isFinite(data?.bewegt)) {
                const rest = data.liegengeblieben
                    ? ` ${data.liegengeblieben} blieben liegen (Rucksack voll).`
                    : data.rest ? " Der Rest passte nicht mehr hinein." : "";
                notify(`${data.bewegt} ${data.bewegt === 1 ? "Sache" : "Sachen"} ${richtung === "ein" ? "eingelagert" : "herausgeholt"}.${rest}`);
            }
        } catch (err) {
            notify(err?.message || "Hat nicht geklappt.", "error");
        } finally {
            setAblageBusy(false);
        }
    }, [apiCall, notify, flushSave]);

    // ── Buy seed from shop ────────────────────────────────────────────────────
    /**
     * Einen Bestand SOFORT um eins verringern — synchron, noch bevor der Server
     * gefragt wird. Gibt zurück, ob überhaupt etwas da war.
     */
    const reserviere = useCallback((ref, setzer, schluessel) => {
        const frei = ref.current?.[schluessel] ?? 0;
        if (frei <= 0) return false;
        ref.current = { ...ref.current, [schluessel]: frei - 1 };
        setzer(ref.current);
        return true;
    }, []);

    /** Reservierung zurücknehmen, wenn der Kauf doch nicht zustande kam. */
    const gibZurueck = useCallback((ref, setzer, schluessel) => {
        ref.current = { ...ref.current, [schluessel]: (ref.current?.[schluessel] ?? 0) + 1 };
        setzer(ref.current);
    }, []);

    /**
     * Gekaufte Ware SOFORT sichern, nicht über den 500-ms-Sammelspeicher.
     *
     * `payServer` bucht das Gold serverseitig ab; die Ware liegt danach bis zum
     * nächsten Speichervorgang NUR im Browser. Alles, was in diesem Fenster den
     * Zustand vom Server neu lädt — ein Ernte-Rücksprung nach Netzfehler, der
     * Versionsabgleich beim Verbinden, ein Admin-Eingriff — verwirft sie, während
     * das Gold weg bleibt. Genau so ist ein bezahltes legendäres Ei verschwunden.
     *
     * Die Überschreibung ist nötig, weil `setState` erst beim nächsten Rendern
     * wirkt: ohne sie schickte der Speichervorgang den Stand VOR dem Kauf.
     */
    const kaufSichern = useCallback(async (feld, naechsterWert) => {
        try {
            await flushSave({ [feld]: naechsterWert });
        } catch {
            // Auch wenn es hier klemmt, ist der Kauf im Browser-Zustand — der
            // reguläre Speicherweg holt ihn beim nächsten Versuch nach.
        }
    }, [flushSave]);

    const handleBuySeed = useCallback(async (seed) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuySeedRef.current?.(seed)); return; }
        if (goldRef.current < seed.shopPrice) { notify(`Dafür fehlen dir ${formatGold(seed.shopPrice - goldRef.current)} Gold.`, "error"); return; }
        // Belegung aus dem Ref, ABER mit den Käufen, die in dieser Klickfolge schon
        // durch sind. Der Ref wird erst beim nächsten Rendern nachgezogen; ohne den
        // Zuschlag rutschte genau ein Samen über die Rucksackgrenze.
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        const belegt = (inv0?.length || 0) + (hi0?.length || 0) + offeneSamenkaeufeRef.current;
        if (belegt >= (maxSlots || 50)) {
            notify("Rucksack voll — kauf ein Upgrade im Tool-Shop.", "error");
            return;
        }
        // Vorbelegen, damit schnelle Klickfolgen nicht über den Vorrat hinauslaufen.
        // Die Wahrheit steht danach trotzdem in der Serverantwort — dieser Zähler
        // ist nur die Anzeige zwischen Klick und Antwort.
        if (!reserviere(ladenBestandRef, setLadenBestand, seed.seedId)) return;
        // Ab hier ist jede Poll-Antwort, die schon unterwegs war, veraltet.
        letzterKaufAtRef.current = Date.now();
        offeneSamenkaeufeRef.current += 1;
        kaufLaeuftRef.current = true;
        let antwort;
        try {
            /**
             * Bestand, Preis und Gold rechnet der SERVER (Aktion `buySeed`).
             *
             * Vorher lief hier `payServer(seed.shopPrice)` — eine reine Abbuchung
             * über den vom Browser genannten Betrag, während der Vorrat nur ein
             * lokaler Zähler war. Beides war damit vom Client bestimmbar.
             */
            antwort = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buySeed", seedId: seed.seedId }),
            });
        } catch (err) {
            gibZurueck(ladenBestandRef, setLadenBestand, seed.seedId);
            offeneSamenkaeufeRef.current = Math.max(0, offeneSamenkaeufeRef.current - 1);
            // Bei „ausverkauft" schickt der Server den echten Reststand mit — sonst
            // stünde die Anzeige weiter auf einem Stück, das es nicht mehr gibt.
            if (typeof err?.data?.stock === "number") {
                setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, err.data.stock) }));
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        if (typeof antwort?.gold === "number") setGold(antwort.gold);
        if (typeof antwort?.stock === "number") {
            // Der Server hat gerade gerechnet — diese Zahl gilt. Der Zeitstempel
            // wandert mit, damit auch eine Antwort, die WÄHREND des Kaufs unterwegs
            // war, nicht mehr dazwischenfunkt.
            letzterKaufAtRef.current = Date.now();
            setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, antwort.stock) }));
        }
        const boughtSeed = { ...seed, ...(antwort?.samen || {}) };
        const naechstesInventar = [...(farmStateRef.current.inventory || []), boughtSeed];
        setInventory(naechstesInventar);
        setSelectedSeed(prev => prev || boughtSeed);
        await kaufSichern("inventory", naechstesInventar);
    }, [notify, apiCall, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    /**
     * Buy-All (v2, Punkt 12): EIN Request statt denselben Samen im Sekundentakt
     * einzeln wegzuklicken — siehe kaufeSamenAlle in gardenGameRoutes.js. Prüft
     * Rucksackplatz vorab genauso wie handleBuySeed, kappt die gewünschte Menge
     * aber serverseitig ohnehin auf Gold und Vorrat, ein zu hoher Wunsch hier ist
     * also nie mehr als eine verschwendete Anfrage, nie ein falscher Kauf.
     */
    const handleBuySeedAll = useCallback(async (seed) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuySeedAllRef.current?.(seed)); return; }
        const { inventory: inv0, harvestedItems: hi0, inventoryMaxSlots: maxSlots } = farmStateRef.current;
        const freiePlaetze = (maxSlots || 50) - (inv0?.length || 0) - (hi0?.length || 0) - offeneSamenkaeufeRef.current;
        if (freiePlaetze <= 0) {
            notify("Rucksack voll — kauf ein Upgrade im Tool-Shop.", "error");
            return;
        }
        letzterKaufAtRef.current = Date.now();
        kaufLaeuftRef.current = true;
        let antwort;
        try {
            antwort = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buySeedAll", seedId: seed.seedId }),
            });
        } catch (err) {
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        if (typeof antwort?.gold === "number") setGold(antwort.gold);
        if (typeof antwort?.stock === "number") {
            letzterKaufAtRef.current = Date.now();
            setLadenBestand((prev) => ({ ...prev, [seed.seedId]: Math.max(0, antwort.stock) }));
        }
        const gekauft = Array.isArray(antwort?.samenListe) ? antwort.samenListe : [];
        if (!gekauft.length) return;
        // Wie beim Rucksackplatz-Vorabcheck: mehr als frei ist, käme vom Server nie
        // zurück (der prüft dasselbe Limit selbst), das slice() ist nur eine zweite
        // Absicherung, kein erwarteter Fall.
        const passendGekauft = gekauft.slice(0, Math.max(0, freiePlaetze));
        const naechstesInventar = [
            ...(farmStateRef.current.inventory || []),
            ...passendGekauft.map((s) => ({ ...seed, ...s })),
        ];
        setInventory(naechstesInventar);
        setSelectedSeed(prev => prev || naechstesInventar[naechstesInventar.length - passendGekauft.length]);
        notify(`${passendGekauft.length}× ${seed.name} gekauft.`);
        await kaufSichern("inventory", naechstesInventar);
    }, [notify, apiCall, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    useEffect(() => { handleBuySeedAllRef.current = handleBuySeedAll; }, [handleBuySeedAll]);

    // Ueber ein Ref, damit ein eingereihter Klick sich selbst nachreichen kann.
    useEffect(() => { handleBuySeedRef.current = handleBuySeed; }, [handleBuySeed]);

    // ── Plant seed in cell ────────────────────────────────────────────────────
    const handleCellClick = useCallback(async (cellX, cellY) => {
        const seedToPlant = selectedSeed || inventory[0];
        if (!seedToPlant) return;
        const key = `${cellX}_${cellY}`;
        // Bewusst ohne Hinweis: beim schnellen Pflanzen trifft man oft zweimal
        // dieselbe Zelle, und eine Fehlermeldung dafuer stoert mehr als sie hilft.
        if (plotPlants[key]) return;

        // „Grüner Daumen" plus „Wurzelwerk" des Gärtners — dieselbe Rechnung wie
        // serverseitig in wachstumsBonus() (garden/core/economy.js), damit eine von
        // Hand gesetzte Pflanze nicht anders wächst als eine nachgewachsene.
        const wurzelwerk = getGaertnerWurzelwerk(
            getGaertnerStufe(petPlacements, mySlotRef.current), skillWirkung("zuechter"));
        const plant = wachstumBeschleunigen(
            createPlantInstance(seedToPlant, cellX, cellY, partyLaeuftJetzt()),
            Math.min(0.8, skillWirkung("gruener_daumen") + wurzelwerk),
            Date.now(),
        );
        setPlotPlants(prev => ({ ...prev, [key]: plant }));
        playSound("plant", 0.5);
        // v2 (Feedback 28.08.): Pflanz-Wurf — das Tütchen fällt sichtbar auf die
        // Zelle, statt dass die Pflanze kommentarlos erscheint (siehe spawnSaatWurf).
        const pflanzMySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const pflanzWeltPos = pflanzMySlot ? getDirtCellWorldPos(pflanzMySlot, cellX, cellY) : null;
        if (pflanzWeltPos) {
            engineRef.current?.renderer?.spawnSaatWurf(
                pflanzWeltPos.x + TILE_SIZE / 2, pflanzWeltPos.y + TILE_SIZE / 2,
                seedToPlant.seedImage || seedToPlant.image, seedToPlant.emoji,
            );
        }
        setInventory(inv => {
            const nextInv = inv.filter(s => s.instanceId !== seedToPlant.instanceId);
            const nextSelected = nextInv.find(s => s.seedId === seedToPlant.seedId) || nextInv[0] || null;
            setSelectedSeed(nextSelected);
            return nextInv;
        });
        debouncedSave();
    }, [selectedSeed, inventory, plotPlants, notify, debouncedSave, skillWirkung, petPlacements]);

    // ── Harvest plant ─────────────────────────────────────────────────────────
    // Wert, Groesse, Sonderform und Wetterbonus rechnet weiterhin ausschliesslich
    // der Server. Die OPTIK laeuft aber voraus: die Zelle wird sofort geleert,
    // statt erst nach der Antwort. Vorher lag zwischen Klick und Reaktion eine
    // ganze Netzrunde — das war der Grund, warum sich das Einsammeln zaeh anfuehlte.
    // Lehnt der Server ab, steht die Pflanze wieder da.
    const handleHarvest = useCallback(async (key, plant) => {
        if (!isPlantReady(plant)) return;
        // Eine Zelle darf nur EINE Ernte gleichzeitig unterwegs haben — sonst schickt
        // ein zweiter Klick eine Anfrage los, die der Server ablehnt.
        //
        // Klicks während dieser Zeit wurden aber bisher WEGGEWORFEN. Eine Ernte
        // kostet eine Netzrunde; auf einer Verbindung mit 250 ms kam so nur jeder
        // zweite Klick an, bei schlechterer Leitung noch weniger. An einer Staude mit
        // acht reifen Früchten fühlte sich das an, als wäre die Maus gedrosselt.
        // Jetzt werden sie angestellt und der Reihe nach abgearbeitet.
        if (ernteLaeuftRef.current.has(key)) {
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen < ERNTE_WARTESCHLANGE_MAX) ernteWarteschlangeRef.current.set(key, offen + 1);
            return;
        }
        ernteLaeuftRef.current.add(key);
        playSound("harvest", 0.5);
        const vorherigerStand = plant;
        setPlotPlants((prev) => {
            const p = prev[key];
            if (!p) return prev;
            const next = { ...prev };
            if (p.singleUse !== false) {
                delete next[key];
                return next;
            }
            // Dauertraeger: die am laengsten reife Frucht optisch zuruecksetzen —
            // dieselbe Auswahl wie auf dem Server, damit nichts springt.
            const slots = Array.isArray(p.fruitSlots) ? p.fruitSlots : [];
            const jetzt = Date.now();
            let idx = -1; let aeltester = Infinity;
            for (let i = 0; i < slots.length; i++) {
                const ra = Number(slots[i]?.readyAt ?? Infinity);
                if (ra <= jetzt && ra < aeltester) { aeltester = ra; idx = i; }
            }
            if (idx === -1) return prev;
            const neueSlots = slots.slice();
            neueSlots[idx] = {
                ...neueSlots[idx],
                // ×1,2 statt ×1 (Bug gefunden 01.09.: "beim Anklicken auf Multipflanzen,
                // die bereits standen, 400 Bad Request"). Der Server würfelt den
                // nachgewachsenen Fruchtstand bewusst OHNE Seed (neuerFruchtstand in
                // core/economy.js, ×0,8 bis ×1,2 vom Zyklus — absichtlich nicht
                // vorhersagbar, siehe Kommentar dort). Diese Vorschau hier riet bisher
                // glatt ×1 — lag der Server-Wurf darüber (rund die Hälfte der Fälle),
                // zeigte die Staude sich hier schon reif, während der Server beim
                // Klick noch "Noch nicht reif."/"Keine reife Frucht." ablehnte. Bei
                // einem 3-Stunden-Strauch (Blaubeere, Erdbeere) blieb das bis zu 36
                // Minuten lang so UND wurde bei jedem Klick sofort zurückgerollt (siehe
                // "veraltet" unten) — die Staude wirkte dauerhaft blockiert. ×1,2 ist die
                // obere Grenze des Server-Wurfs: die Vorschau darf jetzt spät liegen,
                // nie mehr zu früh.
                readyAt: jetzt + Math.round((Number(p.fruitCycleMs) || 60000) * 1.2),
                statusEffects: [], statusEffect: null, statusEffectUntil: null, specialType: null,
            };
            next[key] = { ...p, fruitSlots: neueSlots };
            return next;
        });
        const ernte = () => apiCall("/action", {
            method: "POST",
            body: JSON.stringify({ action: "harvest", key }),
        });
        // Weltposition der Zelle für die Rückmeldungsschicht (siehe unten) — einmal
        // pro Ernte reicht, die Zelle bewegt sich während der Anfrage nicht.
        const [ernteZellX, ernteZellY] = key.split("_").map(Number);
        const ernteMySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
        const ernteWeltPos = ernteMySlot ? getDirtCellWorldPos(ernteMySlot, ernteZellX, ernteZellY) : null;

        /**
         * Gold-Text, Doppelernte-Hinweis und Nachwuchs-Meldung an der Zelle — die
         * gemeinsame Rückmeldungsschicht aus engine/Renderer.js (spawnFeedback).
         */
        const zeigeErnteFeedback = (data, nachwuchs) => {
            const renderer = engineRef.current?.renderer;
            if (!renderer || !ernteWeltPos) return;
            const x = ernteWeltPos.x + TILE_SIZE / 2;
            const y = ernteWeltPos.y + TILE_SIZE / 2;
            // Beim Shift-Klick-Ziehen über ein volles Feld (viele Dauerträger mit
            // vielen Fruchtständen) läuft diese Funktion dutzendfach in Sekunden —
            // Feedback: "dann kommt ja alles voller Zahlen". Die Flug-Animation
            // (ein eigenes Bild pro Ernte, das aufsteigt) fällt während des Ziehens
            // weiterhin weg — reiner Text ist billig zu zeichnen, ein Dutzend
            // fliegender Bilder gleichzeitig nicht.
            //
            // Die XP-Zahl blieb dabei erst versehentlich mit weg (Feedback 30.08.:
            // "XP zeigen sich nicht beim Schnellernten") — das war nie Absicht, nur
            // dieselbe Bedingung wie beim Flug-Bild wiederverwendet. Text kostet
            // beim Zeichnen so gut wie nichts, die Gold-Zahl blieb ja auch die
            // ganze Zeit sichtbar — jetzt läuft die XP-Zahl genauso mit.
            const kompakt = isDragHarvestingRef.current;
            if (data?.item) {
                const special = data.item.specialData?.name;
                const farbe = special === "Rainbow" ? "#f472b6" : special === "Golden" ? "#fde047" : "#fef08a";
                // Keine Emoji-Icons mehr (siehe Feedback: "sieht billig/nach KI aus") —
                // Farbe und Text unterscheiden Gold/Golden/Rainbow schon eindeutig.
                renderer.spawnFeedback(x, y, `+${formatGold(data.item.sellValue)}`, { color: farbe });
                // XP direkt darunter, in derselben Ernte-Rückmeldung — vorher stand die
                // Erfahrung nirgends am Ort des Geschehens, nur im Fähigkeitsbaum-Fenster.
                const xp = Number(data?.erfahrung?.xp) || 0;
                if (xp > 0) {
                    renderer.spawnFeedback(x, y + 16, `+${xp} XP`, { color: "#a78bfa", durationMs: 950 });
                }
                if (kompakt) return;
                // v2 (Punkt 13, "Erntesamen-Flug"): das Stück fliegt sichtbar weg,
                // statt kommentarlos im Rucksack aufzutauchen — siehe spawnItemFlug.
                // Bild/Emoji kommen von der LOKALEN Pflanze, nicht aus `data.item`:
                // der Server liefert nur Werte (siehe baueItem in economy.js), keine
                // Bildpfade — die stehen ausschliesslich im Katalog, den nur der
                // Client kennt.
                renderer.spawnItemFlug(x, y, plant.harvestImage || plant.fruitImage || plant.image || plant.growthImage, plant.emoji);
            }
            if (data?.zweites) {
                // Eigene Farbe und leicht versetzt, damit klar ist: DAS ist der Bonus aus
                // „Reiche Ernte"/Erntehelfer, nicht dieselbe Ernte doppelt angezeigt.
                renderer.spawnFeedback(x, y - 18, `2× +${formatGold(data.zweites.sellValue)}`, { color: "#c4b5fd" });
            }
            if (nachwuchs) {
                renderer.spawnFeedback(x, y - 32, "Nachwuchs!", { color: "#86efac", durationMs: 1300 });
            }
        };

        /**
         * Antwort übernehmen, OHNE den eigenen Acker zu verwerfen.
         *
         * Vorher ersetzte die Antwort die ganze Pflanze durch die Server-Fassung. Der
         * Acker gehört aber dem Browser und erreicht den Server nur alle fünf Sekunden:
         * jeder Fruchtstand, der seit dem letzten Speichern reif geworden war, ging
         * dabei verloren. An einer Staude mit acht reifen Früchten kam deshalb genau
         * EINE durch — danach hielt der Browser die Pflanze für leer und man wartete
         * auf das Nachwachsen. Genau das fühlte sich wie eine gedrosselte Maus an.
         *
         * Jetzt wird nur der eine nachgewachsene Fruchtstand übernommen (den würfelt
         * weiterhin der Server), der Rest bleibt beim Browser.
         */
        // Gibt die Pflanze zurück, wie sie danach dasteht — die angestellte nächste
        // Ernte rechnet damit weiter, statt auf das nächste Rendern zu warten.
        const uebernehmen = (data) => {
            applyEconomy(data, []);          // Gold und Lager ja, Pflanzen nein
            zeigeErnteFeedback(data, plant.singleUse !== false && !!data?.singleUseNachwuchs);
            const nach = data?.nachgewachsen;
            if (!Number.isInteger(nach?.index) || !nach?.slot) {
                if (plant.singleUse !== false) {
                    // Gärtner-Nachwuchs bei einer Einmalernte: der Server hat die Zelle
                    // NEU bepflanzt, statt sie leer zu lassen — die optimistische Leerung
                    // von eben war also zu früh. Ohne das hier stünde die Zelle im Browser
                    // für immer leer, obwohl der Server längst eine wachsende Pflanze führt
                    // (nächster Klick auf die vermeintlich reife Zelle: "Noch nicht reif",
                    // siehe singleUseNachwuchs in garden/core/economy.js).
                    if (data?.singleUseNachwuchs) {
                        const hydriert = hydratePlantVisuals(data.singleUseNachwuchs);
                        setPlotPlants((prev) => ({ ...prev, [key]: hydriert }));
                        return hydriert;
                    }
                    return null;
                }
                // Kein Fruchtstand gemeldet (alter Server) — dann wie früher.
                const vomServer = data?.plotPlants?.[key];
                if (!vomServer) return null;
                const hydriert = hydratePlantVisuals(vomServer);
                setPlotPlants((prev) => ({ ...prev, [key]: hydriert }));
                return hydriert;
            }
            // Vom Stand VOR dem Klick ausgehen: die optimistische Vorschau hat
            // vielleicht einen anderen Stand vorgezogen als der Server genommen hat.
            const basisSlots = Array.isArray(vorherigerStand?.fruitSlots) ? vorherigerStand.fruitSlots : null;
            if (!basisSlots || nach.index >= basisSlots.length) return null;
            const neueSlots = basisSlots.slice();
            neueSlots[nach.index] = nach.slot;
            const danach = { ...vorherigerStand, fruitSlots: neueSlots };
            setPlotPlants((prev) => (prev[key] ? { ...prev, [key]: danach } : prev));
            return danach;
        };
        /** Wie die Pflanze nach dieser Ernte dasteht — Grundlage für den nächsten Klick. */
        let danach = null;
        try {
            danach = uebernehmen(await ernte());
            letzteErnteRef.current.set(key, Date.now());
        } catch (err) {
            const m = err?.message || "Ernte fehlgeschlagen.";
            // ── Antwort nie angekommen ────────────────────────────────────────
            // Ohne HTTP-Status ist die Anfrage nicht beantwortet worden (Netz weg,
            // Proxy-Timeout). Ob der Server geerntet hat, wissen wir NICHT — und
            // ein Rollback wäre hier fatal: die Pflanze stünde wieder auf dem
            // Acker, das Gold dafür wäre schon gutgeschrieben, und der nächste
            // Speichervorgang würde sie über den 409-Nachreichweg beim Server
            // festschreiben. Genau daraus liess sich Gold aus dem Nichts machen.
            // Also nichts zurückrollen, sondern den echten Stand holen.
            if (err?.status === undefined) {
                ernteWarteschlangeRef.current.delete(key);
                await uebernimmVomServer(null);
                return;   // finally räumt ernteLaeuftRef auf
            }
            // Zu schnell geklickt: bei einem Dauerträger mit acht Fruchtständen
            // gehen leicht mehr Klicks raus, als reife Früchte da sind. Der Server
            // sagt dann zu Recht nein — das ist kein Fehler, den man melden muss.
            const geradeGeerntet = Date.now() - (letzteErnteRef.current.get(key) || 0) < 5000;
            // Der Acker gehoert weiterhin dem Browser und wandert nur mit dem
            // Speichervorgang zum Server. Wer giesst und sofort erntet — oder eine
            // Staude abpflueckt, die gerade erst Fruechte angesetzt hat — fragt
            // gegen einen aelteren Stand. Also: Zelle zurueck, Stand hochschieben,
            // ein zweiter Versuch. Bleibt es dabei, war es ein echtes Nein.
            // WICHTIG: nach einer gerade gelungenen Ernte NICHT wiederholen. Der
            // Rücksprung würde den alten Fruchtstand zurückschreiben und der zweite
            // Versuch dieselbe Frucht ein zweites Mal auszahlen.
            const veraltet = !geradeGeerntet && (
                m.includes("Noch nicht reif")
                || m.includes("Keine reife Frucht")
                || m.includes("wächst nichts"));
            if (veraltet) {
                const wiederhergestellt = { ...(farmStateRef.current.plotPlants || {}), [key]: vorherigerStand };
                setPlotPlants(wiederhergestellt);
                try {
                    // Die Pflanze ausdruecklich mitgeben: setPlotPlants wirkt erst
                    // beim naechsten Rendern, der Payload wuerde sie sonst vermissen.
                    await flushSave({ plotPlants: wiederhergestellt });
                    // Hier ist der Server frisch beliefert — trotzdem derselbe Weg,
                    // damit nur der nachgewachsene Fruchtstand übernommen wird.
                    danach = uebernehmen(await ernte());
                    letzteErnteRef.current.set(key, Date.now());
                    return;   // finally raeumt ernteLaeuftRef auf
                } catch {
                    // Zweiter Versuch auch nein: kein bloßes Überklicken (das ist
                    // oben schon durch geradeGeerntet abgefangen), sondern ein
                    // ECHTER, anhaltender Unterschied zwischen dem, was der Browser
                    // zeigt, und dem, was der Server hat (Feedback 01.09.: "Bohne
                    // bleibt voll angezeigt, Klick sagt trotzdem Keine reife
                    // Frucht" — bisher nur durch Neuladen behebbar). Bisher stand
                    // hier nur ein Kommentar und der Code lief unten in den
                    // Rückfall, der GENAU DIESE veraltete Ansicht (vorherigerStand)
                    // wieder hinschrieb — die Pflanze blieb also absichtlich falsch
                    // reif stehen. Jetzt: ganzen Spielstand vom Server nachziehen,
                    // dasselbe, was bisher nur ein manuelles Neuladen behoben hat.
                    ernteWarteschlangeRef.current.delete(key);
                    await uebernimmVomServer(null);
                    return;   // finally raeumt ernteLaeuftRef auf
                }
            }
            // Nur zurückstellen, wenn die Pflanze wirklich noch da ist. Bei
            // "geradeGeerntet" stammt das Nein von einem KONKURRIERENDEN Vorgang, der
            // dieselbe Zelle eben erst erfolgreich geerntet hat — Schnellzug
            // (handleHarvestMany) und der nachlaufende Browser-Klick nach mouseup
            // treffen leicht dieselbe Zelle doppelt (der Shift-Zustand im click-Event
            // kann schon "false" sein, wenn Shift knapp vor/mit der Maustaste
            // losgelassen wird — die Sperre in onCanvasClick greift dann nicht). Die
            // Pflanze ist auf dem Server in diesem Fall bereits weg; stellte man sie
            // hier trotzdem zurück, schickte der nächste Speichervorgang sie als "neu
            // gepflanzt" an den Server (verplausibilisierePflanzen kennt den Schlüssel
            // nicht mehr, findet auch die instanceId nicht mehr und würfelt frische
            // Zeiten) — ein kostenloser Nachschub, ohne Samen zu bezahlen und ohne
            // Rucksackplatz. GEFUNDEN 14.09. ("gieße, dann kann ich ganz oft
            // einsammeln, Saat kommt wieder, bekomme random Frucht").
            if (!geradeGeerntet) {
                setPlotPlants((prev) => ({ ...prev, [key]: vorherigerStand }));
            }
            // Ein Nein gilt für die ganze Warteschlange: sonst hämmert jeder
            // angestellte Klick auf dieselbe Absage.
            ernteWarteschlangeRef.current.delete(key);
            if (m.includes("Rucksack")) notify("Rucksack voll — verkauf erst Ernte oder kauf ein Upgrade.", "error");
            else if (geradeGeerntet) { /* Überklick nach erfolgreicher Ernte — still bleiben */ }
            else if (!m.includes("wächst nichts")) notify(m, "error");
        } finally {
            ernteLaeuftRef.current.delete(key);
            // Angestellte Klicks abarbeiten, solange wirklich noch etwas reif ist.
            const offen = ernteWarteschlangeRef.current.get(key) || 0;
            if (offen > 0) {
                if (danach && isPlantReady(danach)) {
                    ernteWarteschlangeRef.current.set(key, offen - 1);
                    handleHarvestRef.current?.(key, danach);
                } else {
                    ernteWarteschlangeRef.current.delete(key);
                }
            }
        }
    }, [apiCall, applyEconomy, notify, playSound, flushSave, uebernimmVomServer]);

    // Ueber ein Ref, damit die Warteschlange sich selbst aufrufen kann.
    useEffect(() => { handleHarvestRef.current = handleHarvest; }, [handleHarvest]);

    /**
     * Sammel-Ernte für das Schnellziehen (Shift + Maustaste über den Acker) —
     * EIN Aufruf für den GANZEN Zug, egal wie viele Zellen dabei berührt wurden.
     *
     * Feedback 30.08. (erste Runde: "Shift-Ziehen erntet mit viel Lag") gab
     * zunächst harvestAll — ein Aufruf je ZELLE statt je Frucht. Das reichte für
     * eine einzelne vollbehangene Staude, aber ein Zug über ein volles FELD
     * berührt viele Zellen: jede Antwort löste weiterhin ihren eigenen
     * Rendervorgang aus, und trafen dabei auch noch Tier-/Skill-Ereignisse ein
     * (Feedback 30.08., zweite Runde), summierte sich das spürbar zu Ruckeln.
     * `ernteBeiZug` sammelt die berührten Zellen jetzt nur noch (siehe
     * dragErnteSammlungRef) und diese Funktion schickt sie GESAMMELT — genau
     * EIN Request, EINE Antwort, EIN Rendervorgang, unabhängig von der Anzahl
     * Zellen (harvestMany, siehe harvestManyCells in core/economy.js).
     *
     * Bewusst ein eigener, einfacherer Weg statt eine Erweiterung von
     * handleHarvest: dessen Warteschlange (ernteLaeuftRef) dient dem
     * EINZELKLICK — rasch mehrfach dieselbe Zelle antippen.
     *
     * @param {Array<[string, object]>} eintraege [key, Pflanzen-Schnappschuss][]
     */
    const handleHarvestMany = useCallback(async (eintraege) => {
        if (!eintraege || eintraege.length === 0) return;
        playSound("harvest", 0.5);
        const vorherKarte = new Map(eintraege);
        const keys = eintraege.map(([key]) => key);

        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "harvestMany", keys }),
            });
            applyEconomy(data, []);          // Gold und Lager ja, Pflanzen nein (siehe unten)

            const ernten = data?.ernten && typeof data.ernten === "object" ? data.ernten : {};
            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const renderer = engineRef.current?.renderer;
            let irgendRucksackVoll = false;
            // Jede Zelle in `ernten` kam aus `eintraege`, weil ernteBeiZug sie schon
            // LOKAL für reif hielt (isPlantReady dort, vor dem Sammeln). Lehnt der
            // Server so eine Zelle trotzdem ab, ist das kein normales "zu schnell
            // gezogen" — das filtert der Zug selbst schon raus, bevor überhaupt
            // etwas losgeschickt wird — sondern ein echter Unterschied zwischen dem,
            // was der Browser zeigt, und dem, was der Server hat (Feedback 01.09.:
            // dieselbe Meldung wie bei handleHarvest, siehe dort für den vollen
            // Kommentar — "Bohne bleibt voll, obwohl geerntet").
            let echterMismatch = false;
            for (const ergebnis of Object.values(ernten)) {
                if (!ergebnis?.ok && ergebnis?.error && !ergebnis.error.includes("Rucksack")) echterMismatch = true;
            }

            setPlotPlants((prev) => {
                let next = prev;
                let kopiert = false;
                for (const [key, ergebnis] of Object.entries(ernten)) {
                    if (!ergebnis?.ok) continue;   // diese eine Zelle war zu schnell dran — die anderen zaehlen trotzdem
                    const vorherigerStand = vorherKarte.get(key);
                    if (!vorherigerStand) continue;
                    letzteErnteRef.current.set(key, Date.now());
                    if (ergebnis.rucksackVoll) irgendRucksackVoll = true;

                    // Rückmeldung an GENAU DIESER Zelle, nicht eine Sammel-Zahl
                    // irgendwo auf dem Bildschirm — bei einem vollen Zug soll man
                    // trotz des gebündelten Requests sehen, WAS wo passiert ist.
                    if (renderer && mySlot) {
                        const [cellX, cellY] = key.split("_").map(Number);
                        const weltPos = getDirtCellWorldPos(mySlot, cellX, cellY);
                        const x = weltPos.x + TILE_SIZE / 2;
                        const y = weltPos.y + TILE_SIZE / 2;
                        const items = Array.isArray(ergebnis.items) ? ergebnis.items : [];
                        if (items.length > 0) {
                            const goldSumme = items.reduce((summe, it) => summe + (Number(it?.sellValue) || 0), 0);
                            renderer.spawnFeedback(x, y, `+${formatGold(goldSumme)}`, { color: "#fef08a" });
                            const xp = Number(ergebnis.erfahrung?.xp) || 0;
                            if (xp > 0) renderer.spawnFeedback(x, y + 16, `+${xp} XP`, { color: "#a78bfa", durationMs: 950 });
                            const besonders = items.find((it) => it?.specialData?.name);
                            if (besonders) {
                                const special = besonders.specialData.name;
                                const farbe = special === "Rainbow" ? "#f472b6" : "#fde047";
                                renderer.spawnFeedback(x, y - 18, special === "Rainbow" ? "🌈 Rainbow!" : "✨ Golden!",
                                    { color: farbe, durationMs: 1300 });
                            }
                            const bonusAnzahl = Number(ergebnis.bonusAnzahl) || 0;
                            if (bonusAnzahl > 0) {
                                renderer.spawnFeedback(x, y - 34, bonusAnzahl > 1 ? `${bonusAnzahl}× Bonus!` : "Bonus!",
                                    { color: "#c4b5fd", durationMs: 1300 });
                            }
                            if (ergebnis.singleUseNachwuchs) {
                                renderer.spawnFeedback(x, y - 50, "Nachwuchs!", { color: "#86efac", durationMs: 1300 });
                            }
                        }
                    }

                    // Nur die tatsächlich abgeernteten Fruchtstände übernehmen —
                    // derselbe Grund wie bei handleHarvest (uebernehmen): der Acker
                    // gehört dem Browser, der Server erreicht ihn nur alle paar
                    // Sekunden. Vom Stand VOR dem Zug ausgehen, nicht vom aktuellen
                    // React-State: der kann durch andere, seither abgeschlossene
                    // Ernten schon weiter sein.
                    const aenderungen = Array.isArray(ergebnis.aenderungen) ? ergebnis.aenderungen : [];
                    if (!kopiert) { next = { ...next }; kopiert = true; }
                    if (aenderungen.length > 0) {
                        const basisSlots = Array.isArray(vorherigerStand?.fruitSlots) ? vorherigerStand.fruitSlots.slice() : null;
                        if (basisSlots && next[key]) {
                            for (const { index, slot } of aenderungen) {
                                if (Number.isInteger(index) && index < basisSlots.length) basisSlots[index] = slot;
                            }
                            next[key] = { ...vorherigerStand, fruitSlots: basisSlots };
                        }
                    } else if (ergebnis.singleUseNachwuchs) {
                        // Gärtner-Nachwuchs bei einer Einmalernte: die Zelle bleibt bepflanzt.
                        next[key] = hydratePlantVisuals(ergebnis.singleUseNachwuchs);
                    } else if (vorherigerStand?.singleUse !== false) {
                        // Einmalernte ohne Nachwuchs: leer, wie der Zug es schon zeigte.
                        delete next[key];
                    }
                }
                return next;
            });

            if (irgendRucksackVoll) notify("Rucksack voll — der Rest hängt noch an der Pflanze.", "error");
            // Statt die falsch reif aussehende(n) Zelle(n) einfach so stehen zu
            // lassen (das war bisher der Fall — nur ein manuelles Neuladen half),
            // den ganzen Spielstand vom Server nachziehen.
            if (echterMismatch) await uebernimmVomServer(null);
        } catch (err) {
            const m = err?.message || "Ernte fehlgeschlagen.";
            // Dieselbe Grosszügigkeit wie bei handleHarvest: "zu schnell gezogen"
            // (nichts mehr reif, Zelle inzwischen leer) ist beim Schnellziehen der
            // Normalfall, kein Fehler, den man melden muss. Lehnt der Server aber
            // den GANZEN Zug ab (kein einziger Treffer, siehe harvestManyCells),
            // obwohl ernteBeiZug jede gesammelte Zelle vorher für reif hielt, ist
            // das derselbe echte Mismatch wie oben — auch hier nachziehen.
            if (m.includes("Rucksack")) notify("Rucksack voll — verkauf erst Ernte oder kauf ein Upgrade.", "error");
            else if (!m.includes("Noch nicht reif") && !m.includes("Keine reife Frucht") && !m.includes("wächst nichts")) {
                notify(m, "error");
            } else {
                await uebernimmVomServer(null);
            }
        }
    }, [apiCall, applyEconomy, notify, playSound, hydratePlantVisuals, uebernimmVomServer]);

    /**
     * Sammlung leeren und abschicken — der einzige Ort, der `handleHarvestMany`
     * tatsächlich aufruft. Sowohl vom Debounce-Timer (siehe planeDragErnteFlush)
     * als auch direkt beim Loslassen der Maustaste (siehe stopShovelHold/
     * onCanvasMove) aufgerufen, deshalb hier gebündelt statt an jeder Stelle
     * dasselbe Leeren+Aufrufen zu wiederholen.
     */
    const flushDragErnte = useCallback(() => {
        if (dragErnteFlushTimerRef.current) {
            clearTimeout(dragErnteFlushTimerRef.current);
            dragErnteFlushTimerRef.current = null;
        }
        const sammlung = dragErnteSammlungRef.current;
        if (sammlung.size === 0) return;
        const eintraege = Array.from(sammlung.entries());
        sammlung.clear();
        handleHarvestMany(eintraege);
    }, [handleHarvestMany]);

    /**
     * Nach jeder neu gesammelten Zelle aufgerufen (siehe ernteBeiZug): stößt
     * einen kurzen Debounce an, statt bei JEDER Zelle sofort abzuschicken —
     * genau das war ja das ursprüngliche Problem (ein Request je Zelle). Ein
     * zügiger Zug über viele Zellen sammelt sich so zu wenigen, teils sogar
     * einem einzigen Request; bleibt die Maus kurz stehen oder endet der Zug,
     * geht die Sammlung trotzdem zeitnah raus (120ms), fühlt sich also nicht
     * verzögert an.
     */
    const DRAG_ERNTE_FLUSH_MS = 120;
    const planeDragErnteFlush = useCallback(() => {
        if (dragErnteFlushTimerRef.current) clearTimeout(dragErnteFlushTimerRef.current);
        dragErnteFlushTimerRef.current = setTimeout(flushDragErnte, DRAG_ERNTE_FLUSH_MS);
    }, [flushDragErnte]);

    /**
     * Werkzeug kaufen — Preis, Vorrat und Gutschrift liegen ALLE beim Server
     * (garden/core/werkzeug.js).
     *
     * Vorher lief das in zwei Schritten: erst Gold abbuchen (`payServer`), dann den
     * Werkzeugkasten im Browser fortschreiben und speichern. Zwischen beiden lag eine
     * Lücke, und jeder Weg, der den Browserstand verwirft — Nachladen nach Konflikt,
     * Migration beim Deploy, zweiter Tab — liess das Gold verschwinden, ohne dass das
     * Werkzeug ankam. Genau das war „zehn Gießkannen gekauft, sechs bekommen".
     *
     * Jetzt ist es EIN Aufruf: der Server bucht ab und trägt ein, oder er tut beides
     * nicht. Der Ladenbestand hier ist nur noch Anzeige; verbindlich zählt der Server.
     */
    const handleBuyTool = useCallback(async (tool) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyToolRef.current?.(tool)); return; }
        const hatBestand = tool.type === "single";
        if (hatBestand && !reserviere(toolShopStockRef, setToolShopStock, tool.id)) return;
        // Ab hier ist jede Poll-Antwort, die schon unterwegs war, veraltet — siehe
        // den werkzeugladen-Abgleich im /global-shop-Poll oben.
        if (hatBestand) letzterToolKaufAtRef.current = Date.now();

        kaufLaeuftRef.current = true;
        try {
            const daten = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buyTool", toolId: tool.id }),
            });
            if (typeof daten?.gold === "number") { goldRef.current = daten.gold; setGold(daten.gold); }
            if (daten?.toolInventory) setzeWerkzeug(daten.toolInventory);
            if (hatBestand && typeof daten?.stock === "number") {
                // Der Server hat gerade gerechnet — diese Zahl gilt, nicht die
                // optimistische Reservierung von oben.
                letzterToolKaufAtRef.current = Date.now();
                setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, daten.stock) }));
            }
            // v2, Punkt 12: Kassen-Sound beim Werkzeugkauf raus — mit Buy-All (kauft
            // oft mehrere auf einen Klick) wären das sonst mehrere Sounds übereinander.
        } catch (err) {
            if (hatBestand) {
                gibZurueck(toolShopStockRef, setToolShopStock, tool.id);
                // Bei „ausverkauft" (oder wenn der Kauf trotz einer Verbindungs-
                // störung beim Server durchging und nur die Antwort verlorenging)
                // den echten Reststand übernehmen, statt blind die Reservierung
                // zurückzugeben — sonst zeigt der Laden mehr an, als noch da ist.
                // Dieselbe Absicherung wie beim Samenkauf (handleBuySeed).
                if (typeof err?.data?.stock === "number") {
                    letzterToolKaufAtRef.current = Date.now();
                    setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, err.data.stock) }));
                }
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        // Kein `kaufSichern` mehr: der Server hat den Kauf bereits festgeschrieben.
        // Ein Speichervorgang von hier könnte ihn nur noch überschreiben.
    }, [apiCall, notify, playSound, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, setzeWerkzeug]);

    /**
     * Buy-All (v2, Punkt 12) fürs Werkzeug — siehe kaufeWerkzeugAlle in
     * werkzeug.js. Läuft dieselbe Reservierung/Rückgabe wie handleBuyTool,
     * nur für einen einzigen Request statt einer Klickserie.
     */
    const handleBuyToolAll = useCallback(async (tool) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyToolAllRef.current?.(tool)); return; }
        const hatBestand = tool.type === "single";
        if (hatBestand && !reserviere(toolShopStockRef, setToolShopStock, tool.id)) return;
        if (hatBestand) letzterToolKaufAtRef.current = Date.now();

        kaufLaeuftRef.current = true;
        try {
            const daten = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "buyToolAll", toolId: tool.id }),
            });
            if (typeof daten?.gold === "number") { goldRef.current = daten.gold; setGold(daten.gold); }
            if (daten?.toolInventory) setzeWerkzeug(daten.toolInventory);
            if (hatBestand && typeof daten?.stock === "number") {
                letzterToolKaufAtRef.current = Date.now();
                setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, daten.stock) }));
            }
            const anzahl = Number(daten?.anzahl) || 0;
            if (anzahl > 0) notify(`${anzahl}× ${tool.name} gekauft.`);
        } catch (err) {
            if (hatBestand) {
                gibZurueck(toolShopStockRef, setToolShopStock, tool.id);
                if (typeof err?.data?.stock === "number") {
                    letzterToolKaufAtRef.current = Date.now();
                    setToolShopStock((prev) => ({ ...prev, [tool.id]: Math.max(0, err.data.stock) }));
                }
            }
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
    }, [apiCall, notify, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, setzeWerkzeug]);

    useEffect(() => { handleBuyToolRef.current = handleBuyTool; }, [handleBuyTool]);
    useEffect(() => { handleBuyToolAllRef.current = handleBuyToolAll; }, [handleBuyToolAll]);
    useEffect(() => { apiCallRef.current = apiCall; }, [apiCall]);
    useEffect(() => { notifyRef.current = notify; }, [notify]);
    useEffect(() => { setzeWerkzeugRef.current = setzeWerkzeug; }, [setzeWerkzeug]);

    const handleMineRock = useCallback(async (rockCell) => {
        if (!rockCell || !Number.isInteger(rockCell.cellX) || !Number.isInteger(rockCell.cellY)) return;
        const key = `${rockCell.cellX}_${rockCell.cellY}`;
        if ((toolInventory.pickaxeUses || 0) <= 0) {
            notify("Du brauchst eine Spitzhacke.", "error");
            return;
        }
        if (plotUnlockedCells.includes(key)) {
            notify("Dieses Feld ist bereits freigelegt.", "error");
            return;
        }
        // „Bergmann" war früher eine Save-Chance und wurde HIER gewürfelt. Auf einer
        // Exponentialkurve (Spitzhackenpreis) hat das nicht 30 % der Kosten
        // gestrichen, sondern 90 %: weniger Käufe heisst auch ein kleinerer
        // Exponent. Der Skill gibt jetzt feste Zusatzladungen beim KAUF
        // (siehe handleBuyTool), der Abbau verbraucht wieder schlicht eine.
        // Erst die Ladung abbuchen — beim SERVER. Klappt das nicht, wird auch kein
        // Stein freigelegt: sonst hätte man ein Feld gewonnen, ohne dafür zu zahlen.
        if (!(await verbraucheWerkzeug("pickaxeUses"))) return;
        // v2 (Punkt 13): Spitzhacken-Schwung — siehe spawnToolSchwung in
        // engine/Renderer.js. Rein optisch, deshalb hier und nicht vor der
        // Server-Prüfung: ein abgelehnter Abbau soll nicht so aussehen, als hätte
        // er geklappt.
        engineRef.current?.renderer?.spawnToolSchwung("pickaxe");
        setPlotUnlockedCells(prev => {
            const next = normalizePlotUnlockedCells([...prev, key]);
            setPlotExpansions(Math.min(MAX_PLOT_EXPANSIONS, Math.ceil(next.length / BASE_DIRT_COLS)));
            return next;
        });
        const uebrig = Math.max(0, (toolInventory.pickaxeUses || 0) - 1);
        notify(`Stein abgebaut. Noch ${uebrig} Spitzhacken-Nutzungen übrig.`);
        debouncedSave();
    }, [notify, plotUnlockedCells, toolInventory.pickaxeUses, debouncedSave, verbraucheWerkzeug]);

    const handleWaterPlant = useCallback(async (cellX, cellY) => {
        const key = `${cellX}_${cellY}`;
        const plant = plotPlants[key];
        if (!plant) return;
        // ACHTUNG: hier stand `isPlantReady(plant)`. Für einen Dauerträger heisst
        // das „mindestens EINE Frucht ist reif" — ein Baum mit einer reifen und
        // sechs wachsenden Früchten liess sich damit nicht mehr giessen, obwohl
        // genau dafür die Kanne da ist. Gesperrt wird jetzt erst, wenn die Rechnung
        // unten ergibt, dass es nichts zu verkürzen gibt.
        if ((toolInventory.wateringCans || 0) <= 0) {
            notify("Keine Gießkanne mehr verfügbar.", "error");
            return;
        }
        const now = Date.now();
        /**
         * FESTE Minuten, wie bei Magic Garden (dort 5 min für 5.000 Gold).
         *
         * Ein Prozentsatz der Restzeit war der Fehlversuch dazwischen: Prozente
         * stapeln sich MULTIPLIKATIV. Bei 50 % je Guss lassen zehn Kannen aus einer
         * Lieferung noch 0,1 % übrig — für 50.000 Gold wäre damit eine 20-Tage-
         * Mondblume sofort fertig gewesen.
         *
         * Feste Minuten regulieren sich dagegen selbst: sie lohnen sich nur, wenn
         * die Pflanze mehr als 1.000 Gold je Minute abwirft (Kannenpreis geteilt
         * durch gesparte Minuten). Auf einem Löwenzahn ist die Kanne Verschwendung,
         * auf einem Kürbis lohnt sie sich, und eine Mondblume bräuchte tausende.
         */
        const minuten = giesskanneMinuten(skillStufe("giesskanne"));
        const gespartMs = minuten * 60000;

        /**
         * Die neue Pflanze AUSSERHALB des State-Updaters bauen.
         *
         * Vorher wurde `wirklichGespart` im Updater gesetzt und direkt danach für
         * die Meldung gelesen. React ruft den Updater aber erst beim nächsten
         * Rendern auf — die Meldung sah also immer 0 und behauptete deshalb JEDES
         * Mal „ist jetzt fertig", auch bei einer Ananas mit fünf Tagen Restzeit.
         */
        const berechne = (p) => {
            const np = { ...p };
            let gespart = 0;
            if (np.singleUse) {
                // Untergrenze ist die volle Wachstumszeit, also faktisch keine —
                // man darf bis zur Reife wässern. Sie steht nur da, damit ein
                // manipulierter Browser nicht bei jedem Speichern erneut abzieht.
                const basis = Number(np.growthMsBasis) || Number(np.growthMs) || 0;
                const untergrenze = Math.round(basis * (1 - GIESSKANNE_MAX_ANTEIL));
                const neu = Math.max(untergrenze, (Number(np.growthMs) || 0) - gespartMs);
                gespart = (Number(np.growthMs) || 0) - neu;
                np.growthMs = neu;
            } else if (np.stage === "structure") {
                const rest = Math.max(0, (Number(np.structureReadyAt) || now) - now);
                gespart = Math.min(gespartMs, rest);
                np.structureReadyAt = Math.max(now, (Number(np.structureReadyAt) || now) - gespart);
            } else {
                // Wie bei Magic Garden: ein Guss wirkt auf ALLE Fruchtstände.
                // `gegossenMs` zählt mit, wie viel dieser Stand schon bekommen hat —
                // der Server deckelt daran (siehe gegosseneReifezeit). Ohne den
                // Zähler liesse sich mit jedem Speichern erneut abziehen.
                const zyklus = Number(np.fruitCycleMs) || 60000;
                const maxAbzug = Math.round(zyklus * GIESSKANNE_MAX_ANTEIL);
                np.fruitSlots = (np.fruitSlots || []).map((s) => {
                    const ra = Number(s?.readyAt ?? 0);
                    if (ra <= now) return s;
                    const bisher = Math.max(0, Math.min(maxAbzug, Number(s?.gegossenMs) || 0));
                    const neu = Math.min(maxAbzug, bisher + gespartMs);
                    const abzug = neu - bisher;
                    if (abzug > gespart) gespart = abzug;
                    return { ...s, readyAt: Math.max(now, ra - abzug), gegossenMs: neu };
                });
            }
            return { np, gespart };
        };

        const { np, gespart } = berechne(plant);

        /**
         * ERST rechnen, DANN bezahlen.
         *
         * Der Verbrauch stand vorher ganz oben, noch vor dieser Rechnung. Ergab sie
         * dann null gesparte Zeit, war die Kanne trotzdem weg — die Meldung „da war
         * nichts mehr zu gießen" kostete also 5.000 Gold.
         */
        if (gespart <= 0) {
            notify(isPlantReady(plant, now)
                ? "Pflanze ist bereits ausgewachsen."
                : "Hier ist gerade nichts zu gießen.", "error");
            return;
        }
        // Kanne serverseitig abbuchen. Erst wenn das durch ist, wirkt der Guss —
        // andernfalls liesse sich mit einem zurückgedrehten Browserstand endlos gießen.
        if (!(await verbraucheWerkzeug("wateringCans"))) return;
        // v2 (Punkt 13): Gießkannen-Schwung — siehe spawnToolSchwung in
        // engine/Renderer.js.
        engineRef.current?.renderer?.spawnToolSchwung("watering");
        setPlotPlants((prev) => (prev[key] ? { ...prev, [key]: np } : prev));

        // Wirklich fertig ist sie nur, wenn danach nichts mehr aussteht.
        const fertig = np.singleUse
            ? (Number(np.plantedAt) || now) + (Number(np.growthMs) || 0) <= now
            : isPlantReady(np);
        if (fertig) {
            notify("Pflanze gewässert — sie ist jetzt fertig.");
        } else {
            // Restzeit für JEDE Bauart nennen, nicht nur für Einzelpflanzen.
            // Bei Dauerträgern zählt der nächste Fruchtstand, der noch aussteht.
            let rest = 0;
            if (np.singleUse) {
                rest = Math.max(0, (Number(np.plantedAt) || now) + (Number(np.growthMs) || 0) - now);
            } else if (np.stage === "structure") {
                rest = Math.max(0, (Number(np.structureReadyAt) || now) - now);
            } else {
                const offen = (np.fruitSlots || [])
                    .map((s) => Math.max(0, (Number(s?.readyAt) || 0) - now))
                    .filter((ms) => ms > 0);
                rest = offen.length > 0 ? Math.min(...offen) : 0;
            }
            notify(`Pflanze gewässert: -${Math.max(1, Math.round(gespart / 60000))} Minuten`
                + (rest > 0 ? ` · noch ${formatDurationShared(rest)}` : ""));
        }
        // SOFORT statt debouncedSave (Bug gefunden 01.09.: "2 ripe angezeigt,
        // Ernte trotzdem 400 Keine reife Frucht"). Die Verkürzung wirkt erst,
        // wenn der Server sie über den PUT gesehen hat (core/economy.js kappt und
        // übernimmt die gegossene Zeit nur dort, siehe gegosseneReifezeit in
        // gardenGameRoutes.js) — debouncedSave wartet 500 ms auf Ruhe, und "gießen,
        // dann sofort pflücken" ist genau die Reihenfolge, die diese 500 ms
        // regelmäßig unterbietet: die Ernte kam beim Server an, bevor er vom Guss
        // wusste, und lehnte die (dort noch nicht reife) Frucht ab.
        //
        // BUG gefunden 14.09. ("gegossen und geerntet — Saat kam wieder"): genau
        // dieses "SOFORT" schickte trotzdem den ALTEN, ungegossenen Stand. Ohne
        // explizite Übergabe liest flushSave() die Nutzlast über
        // flushFarmStateToServerRef — der zeigt erst NACH dem naechsten Rendern
        // auf eine Fassung mit dem `np` von eben (setPlotPlants wirkt asynchron,
        // siehe Kommentar bei der Ernte-Wiederherstellung weiter oben). Zwischen
        // dem setPlotPlants oben und diesem await liegt kein einziges await —
        // der PUT ging also praktisch IMMER mit der Zeit von VOR dem Guss raus.
        // Der Server sah die Verkürzung nie, lehnte die folgende Ernte mit „Noch
        // nicht reif." ab, und deren Fehlerpfad stellt die Pflanze sichtbar
        // zurück auf den Acker — genau das sah aus wie „Saat kam wieder". Fix:
        // denselben expliziten Übergabe-Weg wie bei der Ernte-Wiederherstellung
        // nehmen, statt auf den naechsten Render zu warten.
        await flushSave({ plotPlants: { ...plotPlants, [key]: np } });
    }, [plotPlants, toolInventory.wateringCans, notify, flushSave, skillStufe, verbraucheWerkzeug]);

    const handleMovePlantWithPot = useCallback(async (targetX, targetY) => {
        if ((toolInventory.plantPots || 0) <= 0) {
            notify("Kein Plant Pot verfügbar.", "error");
            return;
        }
        const targetKey = `${targetX}_${targetY}`;
        if (!movingPlantSource) {
            const sourcePlant = plotPlants[targetKey];
            if (!sourcePlant) {
                notify("Wähle zuerst eine Pflanze als Quelle.", "error");
                return;
            }
            setMovingPlantSource(targetKey);
            notify("Quelle gewählt. Jetzt auf Zielfeld klicken.");
            return;
        }
        if (movingPlantSource === targetKey) return;
        if (plotPlants[targetKey]) {
            notify("Zielfeld ist bereits belegt.", "error");
            return;
        }
        setPlotPlants(prev => {
            const src = prev[movingPlantSource];
            if (!src) return prev;
            const next = { ...prev };
            delete next[movingPlantSource];
            next[targetKey] = { ...src, cellX: targetX, cellY: targetY };
            return next;
        });
        // Topf serverseitig abbuchen, bevor die Pflanze umzieht.
        if (!(await verbraucheWerkzeug("plantPots"))) return;
        setMovingPlantSource(null);
        notify("Pflanze erfolgreich umgesetzt.");
        // Ohne das lief die Aenderung erst mit dem 5-Sekunden-Autosave zum Server —
        // und erst DANN sahen die anderen den umgesetzten Acker. Alle uebrigen
        // Acker-Aktionen speichern seit jeher sofort; hier fehlte es schlicht.
        debouncedSave();
    }, [toolInventory.plantPots, movingPlantSource, plotPlants, notify, debouncedSave, verbraucheWerkzeug]);

    const handleBuyEgg = useCallback(async (egg) => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyEggRef.current?.(egg)); return; }
        if (goldRef.current < egg.price) { notify(`Dafür fehlen dir ${formatGold(egg.price - goldRef.current)} Gold.`, "error"); return; }
        if (!reserviere(eggShopStockRef, setEggShopStock, egg.id)) return;
        kaufLaeuftRef.current = true;
        try {
            await payServer(egg.price);
        } catch (err) {
            gibZurueck(eggShopStockRef, setEggShopStock, egg.id);
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        const neuesEi = { ...egg, instanceId: Math.random().toString(36).slice(2) };
        const naechste = [...(farmStateRef.current.eggInventory || []), neuesEi];
        setEggInventory(naechste);
        await kaufSichern("eggInventory", naechste);
    }, [notify, payServer, reserviere, gibZurueck, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    useEffect(() => { handleBuyEggRef.current = handleBuyEgg; }, [handleBuyEgg]);

    /**
     * `anzahl` gibt es wegen der Bodenbeläge: einen Hof pflastert man mit zwanzig
     * Kacheln, und zwanzig Einzelkäufe wären zwanzig Netzrunden. Bezahlt wird in
     * EINEM Betrag, damit auch nur eine Prüfung über den Server geht.
     */
    const handleBuyDeco = useCallback(async (deco, anzahl = 1) => {
        if (!deco) return;
        const stueck = Math.max(1, Math.min(50, Math.floor(Number(anzahl) || 1)));
        const preis = deco.price * stueck;
        if (kaufLaeuftRef.current) { kaufEinreihen(() => handleBuyDecoRef.current?.(deco, stueck)); return; }
        if (goldRef.current < preis) {
            notify("Nicht genug Gold.", "error");
            return;
        }
        const vorlage = alsVorratsstueck(deco);
        const instanzen = Array.from({ length: stueck }, () => ({
            ...vorlage,
            instanceId: `deco_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "deco",
        }));
        kaufLaeuftRef.current = true;
        try {
            await payServer(preis);
        } catch (err) {
            notify(err?.message || "Kauf fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        const naechsteDeko = [...(farmStateRef.current.decoInventory || []), ...instanzen];
        setDecoInventory(naechsteDeko);
        if (!selectedDecoToPlace) setSelectedDecoToPlace(instanzen[0]);
        setSelectedSeed(null);
        setSelectedTool(null);
        setSelectedCarryItem(null);
        setSelectedPetToPlace(null);
        if (stueck > 1) notify(`${stueck}× ${deco.name} gekauft.`);
        await kaufSichern("decoInventory", naechsteDeko);
    }, [notify, selectedDecoToPlace, payServer, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    useEffect(() => { handleBuyDecoRef.current = handleBuyDeco; }, [handleBuyDeco]);

    const unlockIncubatorSlot = useCallback(async () => {
        if (kaufLaeuftRef.current) { kaufEinreihen(() => unlockIncubatorSlotRef.current?.()); return; }
        const nextSlot = incubator.unlockedSlots; // 0-indexed: current = unlockedSlots-1, next = unlockedSlots
        if (nextSlot >= 5) return;
        const cost = INCUBATOR_UNLOCK_COSTS[nextSlot - 1];
        // goldRef statt gold: der React-Wert hinkt einem gerade abgeschlossenen
        // Kauf hinterher. Die Prüfung lief damit gegen den Stand von DAVOR — mal
        // ging ein Kauf durch, den der Server ablehnen musste (für den Spieler
        // passierte scheinbar nichts), mal wurde einer blockiert, den man sich
        // längst leisten konnte.
        if (goldRef.current < cost) { notify(`Dafür brauchst du ${cost.toLocaleString('de-DE')} Gold.`, "error"); return; }
        kaufLaeuftRef.current = true;
        try {
            await payServer(cost);
        } catch (err) {
            notify(err?.message || "Freischalten fehlgeschlagen.", "error");
            return;
        } finally {
            kaufLaeuftRef.current = false;
            naechstenKaufStarten();
        }
        const naechsterInkubator = { ...incubator, unlockedSlots: incubator.unlockedSlots + 1 };
        setIncubator(naechsterInkubator);
        notify(`Inkubator-Slot ${nextSlot + 1} freigeschaltet!`);
        await kaufSichern("incubator", naechsterInkubator);
    }, [incubator, notify, payServer, kaufEinreihen, naechstenKaufStarten, kaufSichern]);

    useEffect(() => { unlockIncubatorSlotRef.current = unlockIncubatorSlot; }, [unlockIncubatorSlot]);

    const placeEggInIncubator = useCallback((slotIndex, eggInstanceId) => {
        if (!eggInventory.length || slotIndex >= incubator.unlockedSlots) return;
        if (incubator.slots[slotIndex]) return;
        const chosen = eggInventory.find(e => e.instanceId === eggInstanceId) || eggInventory[0];
        if (!chosen) return;
        const hatchResult = rollHatchResult(chosen);
        // Balancing: Brutzeit skaliert mit Rarity (vorher pauschal 5min für alles).
        // Feedback 01.09.: "way higher" — von Minuten auf Stunden/Tage angehoben,
        // damit eine Legendary auch wirklich etwas kostet, worauf man wartet.
        const hatchTimeByRarity = {
            COMMON: 1 * 60 * 60 * 1000,       // 1h
            UNCOMMON: 4 * 60 * 60 * 1000,      // 4h
            RARE: 12 * 60 * 60 * 1000,         // 12h
            EPIC: 24 * 60 * 60 * 1000,         // 1d
            LEGENDARY: 3 * 24 * 60 * 60 * 1000, // 3d
        };
        const hatchMs = hatchTimeByRarity[chosen.rarity] || 4 * 60 * 60 * 1000;
        setEggInventory(prev => prev.filter(e => e.instanceId !== chosen.instanceId));
        setIncubator(prev => {
            const slots = [...prev.slots];
            slots[slotIndex] = {
                egg: chosen,
                startedAt: Date.now(),
                hatchAt: Date.now() + hatchMs,
                hatchResult,
            };
            return { ...prev, slots };
        });
        setIncubatorTargetSlot(null);
    }, [eggInventory, incubator]);

    const collectHatchedEgg = useCallback((slotIndex) => {
        const slot = incubator.slots[slotIndex];
        if (!slot || Date.now() < slot.hatchAt) return;

        const hatchedPet = {
            id: `pet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: slot.hatchResult.type,
            customName: null,
            emoji: slot.hatchResult.emoji,
            image: slot.hatchResult.image,
            previewImage: slot.hatchResult.previewImage,
            rarity: slot.egg.rarity,
            specialType: slot.hatchResult.specialType || null,
            ability: slot.hatchResult.ability,
        };

        // Clear slot first, then add pet — both as sibling calls, never nested
        setIncubator(prev => {
            const s = prev.slots[slotIndex];
            if (!s || Date.now() < s.hatchAt) return prev;
            const newSlots = [...prev.slots];
            newSlots[slotIndex] = null;
            return { ...prev, slots: newSlots };
        });
        setPetInventory(current => [...current, hatchedPet]);

        debouncedSave();
    }, [incubator, debouncedSave]);

    // Planting click handler on canvas
    useEffect(() => {
        if (showLobbyScreen) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onMouseLeave = () => {
            hoverStore.clear();
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
            // Sonst malt der Zug weiter, sobald die Maus zurückkommt — auch wenn die
            // Taste längst los ist.
            bodenMalenRef.current = null;
        };
        // Muss die Umkehrung der Kamera im Renderer sein:
        //   translate(mitte) · scale(zoom) · translate(-spieler)
        // Ohne das /zoom greift bei Zoom ≠ 1 jeder Klick und jedes Hover daneben.
        const toWorld = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;
            const player = engineRef.current.player;
            return {
                worldX: player.x + (screenX - canvas.width / 2) / zoomRef.current,
                worldY: player.y + (screenY - canvas.height / 2) / zoomRef.current,
            };
        };

        /**
         * Ein Stück Deko auf die Kachel unter (worldX, worldY) setzen.
         *
         * Ausgelagert, weil es zwei Wege hierher gibt: den einzelnen Klick und das
         * Ziehen bei Bodenbelägen (ein Hof sind schnell zwanzig Kacheln, und jede
         * einzeln anzuklicken wäre Fleißarbeit).
         *
         * Gelesen wird BEWUSST aus Refs statt aus dem React-State: beim Ziehen
         * folgen die Aufrufe schneller aufeinander, als React neu rendert — mit dem
         * State aus der Schließung sähe jede Kachel den Stand von vor dem Zug und
         * pflasterte immer wieder über dieselbe Stelle.
         *
         * `still` unterdrückt die Meldung — beim Ziehen wäre sie Dauerfeuer.
         */
        const platziereDeko = (worldX, worldY, { still = false } = {}) => {
            const gewaehlt = selectedDecoToPlaceRef.current;
            if (!gewaehlt) return false;
            if (!editorAktivRef.current) {
                if (!still) notify("Deko stellst du im Editor auf.", "error");
                return false;
            }
            const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
            // Spiegeln lässt den Fußabdruck unangetastet — die Maße kommen also
            // immer unverändert aus dem Katalog. Beide Flags sind auf ihre jeweilige
            // Deko-Art beschränkt (siehe [R]-Handler oben) — sonst könnte ein Belag,
            // der nach einem gespiegelten Nicht-Belag ausgewählt wird, dessen alten
            // Spiegel-Zustand erben, obwohl [R] für ihn nur noch dreht.
            const gespiegelt = !istBoden(gewaehlt) && Boolean(decoGespiegeltRef.current);
            // Drehen gilt nur für Bodenbeläge — die sind immer 1×1, eine 90°-Drehung
            // ändert also nie den Fußabdruck.
            const gedreht = istBoden(gewaehlt) && Boolean(decoRotiertRef.current);
            const dw = gewaehlt.width || 1;
            const dh = gewaehlt.height || 1;

            // Die angeklickte Kachel ist IMMER die Ankerkachel unten links; von dort
            // wächst das Objekt nach rechts und nach oben. Vorher gab es einen
            // Rückfall auf „nach unten wachsen", wenn es nach oben nicht passte —
            // damit landete derselbe Klick mal so und mal so.
            const tileX = Math.floor((worldX - slot.x) / TILE_SIZE);
            const tileY = Math.floor((worldY - drawY) / TILE_SIZE);

            const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
            const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
            // Geprüft wird in KACHELN, nicht mehr in Pixeln — seit dirtOffsetX ganzzahlig
            // ist, fallen Acker- und Dekoraster zusammen. Der alte Pixelvergleich lief mit
            // <= gegen die Ackerkante und sperrte dadurch links wie rechts je eine
            // Grasspalte zu viel. Die Holzwege IM Acker gelten jetzt als Wiese: pflanzen
            // kann man dort ohnehin nicht, schmücken soll man dürfen.
            const liegtAufAcker = (cx, cy) => kachelIstAcker(slot, cx, cy);

            // Ein Belag liegt UNTER allem: er darf über den Acker gehen und stört
            // keine Bank, die schon dort steht. Geprüft wird bei ihm nur, ob die
            // Kachel überhaupt zum Grundstück gehört.
            const istBelag = istBoden(gewaehlt);

            const occupiedKeys = [];
            let ausserhalb = false;
            let ankerAufAcker = false;
            for (let dx = 0; dx < dw; dx++) {
                for (let dy = 0; dy < dh; dy++) {
                    const cx = tileX + dx;
                    const cy = tileY - dy;
                    if (cx < 0 || cx >= maxTilesX || cy < 0 || cy >= maxTilesY) ausserhalb = true;
                    occupiedKeys.push(`${cx}_${cy}`);
                    // Nur die ANKERREIHE muss freie Wiese sein — darauf steht das
                    // Objekt. Was darüber liegt, darf über den Acker ragen; sonst
                    // bekäme man auf dem einreihigen Wiesenstreifen unter dem Acker
                    // überhaupt keine Laterne unter, weil sie zwangsläufig in ihn
                    // hineinreicht.
                    if (!istBelag && dy === 0 && liegtAufAcker(cx, cy)) ankerAufAcker = true;
                }
            }

            if (ausserhalb || ankerAufAcker) {
                if (!still) {
                    notify(ausserhalb
                        ? "Kein Platz — das Objekt ragt über dein Grundstück hinaus."
                        : "Kein Platz — die untere Kachel liegt auf dem Acker.", "error");
                }
                return false;
            }

            // Belag verdrängt Belag, Deko verdrängt nichts. Die beiden Ebenen prüfen
            // also nur gegen ihresgleichen: sonst könnte man weder eine Bank auf den
            // Steinweg stellen noch den Weg unter der Bank weiterziehen.
            //
            // Verglichen wird nur die ANKERREIHE (dy === 0) — genau wie bei der
            // Acker-Prüfung oben. Sonst blockiert der nach oben überstehende Teil
            // hoher Deko (z. B. eine Laterne) das Setzen, sobald irgendetwas anderes
            // über der Ankerkachel steht, obwohl die Ankerkachel selbst frei ist. In
            // `occupiedKeys` liegt dx außen/dy innen (siehe Schleife oben), die
            // Ankerreihe sitzt also bei jedem Index, der glatt durch die Höhe teilbar
            // ist — das gilt genauso für schon vorhandene Platzierungen.
            const ankerreihe = (keys, hoehe) => keys.filter((_, i) => i % hoehe === 0);
            const eigeneAnkerreihe = ankerreihe(occupiedKeys, dh);
            const vorhanden = decoPlacementsRef.current;
            const kollision = vorhanden.filter((d) => {
                if (d.slotIndex !== mySlotRef.current || istBoden(d) !== istBelag) return false;
                const dKeys = d.occupiedKeys || [d.gridKey];
                const dAnkerreihe = ankerreihe(dKeys, d.height || 1);
                return dAnkerreihe.some((k) => eigeneAnkerreihe.includes(k));
            });

            if (kollision.length > 0 && !istBelag) {
                if (!still) notify("Hier steht bereits etwas.", "error");
                return false;
            }
            // Derselbe Belag liegt schon genau dort: nichts tun, statt ein Stück aus
            // dem Vorrat zu verbrauchen. Beim Ziehen über eine bereits gepflasterte
            // Fläche passiert das ständig.
            if (istBelag && kollision.length === 1
                && kollision[0].decoId === gewaehlt.id
                && (kollision[0].occupiedKeys || []).length === occupiedKeys.length) {
                return false;
            }
            // Ein anderer Belag lag dort: er wird überpflastert und wandert zurück
            // in den Rucksack — weggeworfen wird nichts.
            const verdraengt = istBelag ? kollision : [];

            // Mitte der Ankerkachel unten links — der Renderer zeichnet ab hier
            // nach rechts und nach oben.
            const gx = slot.x + tileX * TILE_SIZE + TILE_SIZE / 2;
            const gy = drawY + tileY * TILE_SIZE + TILE_SIZE / 2;

            const placed = {
                id: `placed_${gewaehlt.instanceId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                decoId: gewaehlt.id,
                name: gewaehlt.name,
                emoji: gewaehlt.emoji,
                image: gewaehlt.image,
                rarity: gewaehlt.rarity || "COMMON",
                width: dw,
                height: dh,
                mirrored: gespiegelt,
                rotation: gedreht ? 90 : 0,
                slotIndex: mySlotRef.current,
                x: gx,
                y: gy,
                occupiedKeys,
            };

            const verdraengteIds = new Set(verdraengt.map((d) => d.id));
            const naechstePlatzierungen = [...vorhanden.filter((d) => !verdraengteIds.has(d.id)), placed];

            const zielInstanz = gewaehlt.instanceId || gewaehlt.id;
            const naechsterVorrat = decoInventoryRef.current.filter(
                (d) => (d.instanceId || d.id) !== zielInstanz);
            // Überpflasterte Beläge kommen zurück in den Rucksack, damit Umgestalten
            // nichts kostet.
            for (const alt of verdraengt) {
                naechsterVorrat.push({
                    ...alt,
                    id: alt.decoId || alt.id,
                    instanceId: `deco_ersetzt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    _type: "deco",
                });
            }
            // Noch ein Stück DERSELBEN Sorte? Dann in der Hand behalten, damit man
            // mehrere hintereinander setzen kann.
            //
            // Vorher stand hier `d.decoId === selectedDecoToPlace.decoId` als zweite
            // Bedingung. Bei Vorratsstücken ist `decoId` auf BEIDEN Seiten undefined —
            // der Vergleich war damit immer wahr und griff das erstbeste Stück
            // irgendeiner Sorte. Wer eine Laterne setzte, hatte danach unbemerkt einen
            // Gartenzwerg in der Hand und stellte ihn mit dem nächsten Klick ab.
            const sorte = gewaehlt.id || gewaehlt.decoId;
            const naechsteWahl = sorte
                ? naechsterVorrat.find((d) => (d.id || d.decoId) === sorte) || null
                : null;

            // Refs SOFORT nachziehen, State danach: die nächste gemalte Kachel liest
            // wieder aus den Refs und muss diese hier schon kennen.
            decoPlacementsRef.current = naechstePlatzierungen;
            decoInventoryRef.current = naechsterVorrat;
            selectedDecoToPlaceRef.current = naechsteWahl;
            setDecoPlacements(naechstePlatzierungen);
            setDecoInventory(naechsterVorrat);
            setSelectedDecoToPlace(naechsteWahl);
            if (!still) notify(`${gewaehlt.name} platziert.`);
            return true;
        };

        const onCanvasClick = (e) => {
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Mit Shift gehört der Klick zur Schnellernte — die hat beim Drücken
            // schon zugegriffen. Ohne diese Sperre ginge für die letzte Kachel eine
            // zweite Anfrage raus, die der Server nur noch ablehnen kann.
            //
            // OHNE e.shiftKey hier zu verlangen (Bug gefunden 14.09., derselbe Fund
            // wie "gieße, dann kann ich ganz oft einsammeln, Saat kommt wieder"):
            // wer Shift knapp vor oder gleichzeitig mit der Maustaste loslässt, dessen
            // click-Event traegt shiftKey schon als false — genau der Fall, fuer den
            // diese Sperre gedacht ist, griff dann NIE. `isDragHarvestingRef` allein
            // reicht als Signal: es wird nur waehrend eines echten Schnellzugs gesetzt
            // (onCanvasMouseDown, mit Shift geprueft) und erst nach dem Klick wieder
            // zurückgesetzt (stopShovelHold, siehe Kommentar dort) — ob DIESES eine
            // click-Event selbst noch Shift meldet, ist dafuer irrelevant.
            if (isDragHarvestingRef.current) return;

            // Bodenbelag wurde schon bei mousedown gelegt (siehe dort) — dieser
            // Klick ist nur der automatische Nachlauf des Browsers und wird hier
            // konsumiert, BEVOR irgendeine Prüfung `selectedDecoToPlace` (State,
            // kann zu diesem Zeitpunkt noch den Stand von VOR dem mousedown tragen)
            // anfasst. Ohne das fiel der Nachlaufklick, sobald genau diese Kachel
            // den Vorrat auf 0 brachte, weiter unten in den "Deko aufheben"-Zweig
            // durch und hob die gerade gelegte Kachel sofort wieder auf.
            if (klickGehoertZuBodenMalenRef.current) {
                klickGehoertZuBodenMalenRef.current = false;
                return;
            }

            // ── Shotgun ──────────────────────────────────────────────────────
            // Ganz vorne, noch vor der Grundstücksprüfung: geschossen wird auf
            // Mitspieler, nicht auf Kacheln — auch von einem Fleck aus, auf dem
            // sonst nichts zu tun wäre. Getroffen wird der NÄCHSTE Geist im
            // Trefferfeld; ob der Schuss zählt, entscheidet der Server.
            if (selectedTool === "shotgun") {
                if (!istGartenAdminRef.current) return;
                let ziel = null;
                let besteEntfernung = Infinity;
                for (const remote of remotePlayersRef.current.values()) {
                    const dx = worldX - remote.x;
                    // Der Geist wird 80 px hoch über seinem Fusspunkt gezeichnet
                    // (siehe drawPlayer im Renderer) — das Trefferfeld sitzt also
                    // deutlich ÜBER remote.y, nicht darum herum.
                    const dy = worldY - (remote.y - 22);
                    if (Math.abs(dx) > 34 || Math.abs(dy) > 42) continue;
                    const entfernung = dx * dx + dy * dy;
                    if (entfernung < besteEntfernung) {
                        besteEntfernung = entfernung;
                        ziel = remote;
                    }
                }
                if (!ziel) {
                    notify("Daneben — klick direkt auf einen Mitspieler.", "error");
                    return;
                }
                sendShotgun(ziel.twitchId);
                return;
            }

            // Ohne eigenes Grundstück (Welt war voll) ist man nur Zuschauer: nichts
            // pflanzen, ernten oder platzieren — sonst würde die eigene Farm auf dem
            // Acker eines anderen erscheinen.
            if (mySlotRef.current < 0) {
                notify("Du hast in dieser Welt kein Grundstück.", "error");
                return;
            }

            // Schuppen umstellen: derselbe Ablauf wie bei Deko — Modus an, einmal
            // auf die Wiese klicken, fertig. Der Klick setzt die OBERE LINKE Ecke
            // des Fußabdrucks (SCHUPPEN_KACHELN Kacheln im Quadrat) — ALLE Kacheln müssen frei
            // vom Acker und von Deko sein, nicht nur die angeklickte.
            if (verschiebtGebaeude) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const tx = Math.floor((worldX - slot.x) / TILE_SIZE);
                const ty = Math.floor((worldY - drawY) / TILE_SIZE);
                const maxTilesX = Math.round(MAP_CONFIG.territoryWidth / TILE_SIZE);
                const maxTilesY = Math.round(MAP_CONFIG.territoryHeight / TILE_SIZE);
                if (tx < 0 || ty < 0 || tx + SCHUPPEN_KACHELN > maxTilesX || ty + SCHUPPEN_KACHELN > maxTilesY) {
                    notify("Der Schuppen passt dort nicht mehr aufs Grundstück.", "error");
                    return;
                }
                const footprint = [];
                for (let dx = 0; dx < SCHUPPEN_KACHELN; dx++) {
                    for (let dy = 0; dy < SCHUPPEN_KACHELN; dy++) {
                        footprint.push([tx + dx, ty + dy]);
                    }
                }
                if (footprint.some(([fx, fy]) => kachelIstAcker(slot, fx, fy))) {
                    notify("Nicht auf dem Acker abstellen.", "error");
                    return;
                }
                const footprintKeys = new Set(footprint.map(([fx, fy]) => `${fx}_${fy}`));
                const belegt = decoPlacements.some((d) =>
                    d.slotIndex === mySlotRef.current &&
                    (d.occupiedKeys || [d.gridKey]).some((k) => footprintKeys.has(k)));
                if (belegt) {
                    notify("Dort steht schon Deko.", "error");
                    return;
                }
                const was = verschiebtGebaeude;
                setGebaeudeVersatz((prev) => ({ ...prev, [was]: { tx, ty } }));
                setVerschiebtGebaeude(null);
                notify(`${GEBAEUDE_NAMEN[was] || "Gebäude"} umgestellt.`);
                debouncedSave();
                return;
            }

            // Briefkasten anklicken: der eigene öffnet den Posteingang, ein fremder
            // direkt das Sendeformular mit vorbelegtem Empfänger.
            if (!selectedTool && !selectedSeed && !selectedDecoToPlace && !selectedPetToPlace) {
                for (const slot of layout.current.slots) {
                    const box = getMailboxHitArea(slot);
                    if (Math.hypot(worldX - box.x, worldY - box.y) > box.radius) continue;
                    const isOwn = slot.id - 1 === mySlotRef.current;
                    if (isOwn) {
                        setMailboxMode("inbox");
                        setMailboxRecipient("");
                    } else {
                        // Der Besitzer eines FREMDEN Grundstücks steht nur in der
                        // Momentaufnahme des Servers — auf `l.slots` wird ausschliesslich
                        // das eigene Schild beschriftet. Hier wurde `slot.owner` gelesen,
                        // das für Nachbarn immer null ist: ein Klick auf deren Briefkasten
                        // meldete deshalb IMMER „Grundstück ist frei". Über die E-Taste
                        // ging es, weil die Spielschleife schon aus plotsRef liest.
                        const besitzer = plotsRef.current.get(slot.id - 1)?.owner || null;
                        if (!besitzer) {
                            notify("Dieses Grundstück ist frei — kein Briefkasten in Betrieb.", "error");
                            return;
                        }
                        setMailboxMode("send");
                        setMailboxRecipient(besitzer);
                    }
                    setMailboxOpen(true);
                    return;
                }
            }

            if (selectedDecoToPlace) {
                platziereDeko(worldX, worldY);
                return;
            }
            if (selectedPetToPlace) {
                const slot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const drawY = slot.isTopRow ? slot.anchorY - MAP_CONFIG.territoryHeight : slot.anchorY;
                const insideOwnPlot = worldX >= slot.x && worldX <= slot.x + MAP_CONFIG.territoryWidth
                    && worldY >= drawY && worldY <= drawY + MAP_CONFIG.territoryHeight;
                if (!insideOwnPlot) {
                    notify("Tier bitte innerhalb deiner Grundstücksgrenzen platzieren.", "error");
                    return;
                }

                // Drei Plätze, einer je Fähigkeit.
                const myPetsCount = petPlacements.filter(p => p.slotIndex === mySlotRef.current).length;
                if (myPetsCount >= PET_SLOTS) {
                    notify(`Alle ${PET_SLOTS} Tier-Plätze sind belegt — pack erst eins ein.`, "error");
                    return;
                }

                const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId || `${selectedPetToPlace.name}_${Date.now()}`;
                setPetInventory((prev) => prev.filter((pet) => (pet.id || pet.instanceId) !== (selectedPetToPlace.id || selectedPetToPlace.instanceId)));
                setPetPlacements((prev) => ([
                    ...prev,
                    {
                        id: `${petId}_${Date.now()}`,
                        slotIndex: mySlotRef.current,
                        name: selectedPetToPlace.name,
                        customName: selectedPetToPlace.customName || null,
                        specialType: selectedPetToPlace.specialType || null,
                        rarity: selectedPetToPlace.rarity || "COMMON",
                        emoji: selectedPetToPlace.emoji || getPetEmoji(selectedPetToPlace.name),
                        image: selectedPetToPlace.image || buildPetPreviewImage(selectedPetToPlace.name),
                        ability: selectedPetToPlace.ability, // 3. ANPASSUNG: Ability übernehmen
                        x: worldX,
                        y: worldY,
                        vx: 0,
                        vy: 0,
                        changeDirAt: 0,
                    },
                ]));
                setSelectedPetToPlace(null);
                notify(`${selectedPetToPlace.name} platziert.`);
                return;
            }
            if (!selectedTool || selectedTool === "shovel") {

                // Tiere werden hier BEWUSST nicht mehr angeklickt.
                // Die Game-Loop bewegt `engine.petPlacements` (eine Kopie); der React-State
                // behält die Startkoordinaten. Ein Klicktest dagegen traf deshalb dauerhaft
                // die Stelle, an der das Tier ursprünglich abgesetzt wurde — quer über die
                // Farm verteilt, und z. B. beim Klick auf den Pool. Das Detailfenster geht
                // jetzt ausschließlich über die Tierliste oben rechts auf.

                // Deko einpacken — NUR im Einrichtungs-Modus.
                //
                // Vorher genügte irgendein Linksklick in die Nähe: beim Laufen, beim
                // Ernten, beim Anklicken des Briefkastens. Wer sein Grundstück
                // eingerichtet hatte, räumte es beim Spielen versehentlich wieder ab.
                //
                // Was OBEN liegt, kommt zuerst: seit es Bodenbeläge gibt, steht auf
                // derselben Kachel oft beides. Ohne diese Reihenfolge hätte ein Klick
                // auf die Bank je nach Reihenfolge in der Liste die Steinplatte
                // darunter aufgehoben und die Bank stehen lassen.
                const trifft = (d) => {
                    if (d.slotIndex !== mySlotRef.current) return false;
                    const radius = 60 * Math.max(d.width || 1, d.height || 1) * 0.7;
                    return Math.hypot(worldX - d.x, worldY - d.y) < radius;
                };
                let decoIdx = -1;
                if (editorAktivRef.current) {
                    decoIdx = decoPlacements.findIndex((d) => !istBoden(d) && trifft(d));
                    if (decoIdx === -1) decoIdx = decoPlacements.findIndex((d) => istBoden(d) && trifft(d));
                }

                if (decoIdx !== -1) {
                    const deco = decoPlacements[decoIdx];
                    setDecoPlacements(prev => prev.filter((_, i) => i !== decoIdx));
                    setDecoInventory(prev => [...prev, {
                        ...deco,
                        id: deco.decoId || deco.id,
                        instanceId: `deco_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        _type: "deco",
                    }]);
                    notify(`${deco.name || "Deko"} aufgehoben.`);
                    return;
                }
            }

            // Schuppen direkt anklicken (Feedback 30.08.: "im Editor den Schuppen
            // anklickbar machen") — bisher ging das nur über die E-Taste in der
            // Nähe, ein Klick direkt auf das Gebäude tat nichts. Gilt in UND
            // außerhalb des Editors, konsistent damit, dass Deko sich im Editor
            // ebenfalls per Klick greifen lässt statt nur über die E-Taste.
            const eigenerSchuppen = engineRef.current?.areas?.shed;
            if (eigenerSchuppen && eigenerSchuppen.aktiv !== false) {
                const distSchuppen = Math.hypot(worldX - eigenerSchuppen.x, worldY - eigenerSchuppen.y);
                if (distSchuppen < COLLISION_RADIUS_BY_AREA_TYPE.shed) {
                    setShedOpen(true);
                    return;
                }
            }

            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const hoveredRock = getHoveredRock(mySlot, worldX, worldY, MAX_PLOT_EXPANSIONS);
            const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (selectedTool === "pickaxe") {
                if (hoveredRock) {
                    handleMineRock(hoveredRock);
                } else {
                    notify("Mit Spitzhacke nur auf Stein-Felder klicken.", "error");
                }
                return;
            }
            if (!hovered) {
                hoverStore.clear();
                return;
            }
            if (selectedTool === "watering") {
                handleWaterPlant(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "pot") {
                handleMovePlantWithPot(hovered.cellX, hovered.cellY);
                return;
            }
            if (selectedTool === "shovel") {
                    notify("Klicke direkt auf ein Tier oder Deko zum Aufheben.");
                    return;
            }

            const key = `${hovered.cellX}_${hovered.cellY}`;
            const hoveredPlant = plotPlants[key];
            if (hoveredPlant && isPlantReady(hoveredPlant)) {
                handleHarvest(key, hoveredPlant);
                return;
            }
            handleCellClick(hovered.cellX, hovered.cellY);
        };

        /**
         * Eine Zelle im Schnellzug abernten ODER bepflanzen — je nachdem, was dort
         * steht und was in der Hand ist. Dieselbe Regel wie beim Einzelklick (siehe
         * onCanvasClick weiter unten: reif → ernten, sonst → mit ausgewähltem
         * Samen pflanzen), nur übers ganze Feld gezogen statt Kachel für Kachel
         * angeklickt (Feedback 30.08.: "Shift+Halten soll auch pflanzen, wenn man
         * Samen hält").
         *
         * Der Acker kommt aus `engineRef` statt aus dem React-State: `handleHarvest`
         * und `handleCellClick` sind asynchron bzw. laufen über setState, und bei
         * einem zügigen Zug liegen mehrere Aktionen zwischen zwei Bildaufbauten. Die
         * Schließung hier zeigte dann noch den Stand von vor dem Zug.
         * `dragHarvestedCellsRef` verhindert zusätzlich, dass dieselbe Kachel
         * zweimal losgeschickt wird — ob geerntet oder bepflanzt, EINE Aktion je
         * Kachel und Zug reicht.
         */
        const ernteBeiZug = (worldX, worldY) => {
            const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
            const acker = engineRef.current.plotPlants || plotPlants;
            const treffer = getHoveredCell(mySlot, worldX, worldY, acker);
            if (!treffer) return;
            const key = `${treffer.cellX}_${treffer.cellY}`;
            if (dragHarvestedCellsRef.current.has(key)) return;
            const pflanze = acker[key];
            if (pflanze && isPlantReady(pflanze)) {
                dragHarvestedCellsRef.current.add(key);
                // Nur SAMMELN, nicht sofort abschicken (siehe handleHarvestMany):
                // ein Zug über ein volles Feld berührt oft dutzende Zellen, ein
                // Request je Zelle bedeutete ebenso viele Rendervorgänge kurz
                // hintereinander — spürbar als Lag, besonders wenn dabei auch noch
                // ein Tier- oder Skill-Ereignis eintraf (Feedback 30.08., zweite
                // Runde). planeDragErnteFlush sammelt kurz (120ms) und schickt dann
                // ALLE seither berührten Zellen in einem einzigen Aufruf.
                dragErnteSammlungRef.current.set(key, pflanze);
                planeDragErnteFlush();
                return;
            }
            // Leere Zelle plus ein Samen in der Hand: pflanzen statt ernten.
            if (!pflanze && selectedSeedRef.current) {
                dragHarvestedCellsRef.current.add(key);
                handleCellClick(treffer.cellX, treffer.cellY);
            }
        };

        const onCanvasMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientXLocal = e.clientX - rect.left;
            const clientYLocal = e.clientY - rect.top;
            const { worldX, worldY } = toWorld(e.clientX, e.clientY);

            // Boden malen, solange die Taste hängt. Still, sonst käme pro Kachel eine
            // Meldung. Ist der Vorrat leer, setzt platziereDeko die Auswahl auf null
            // und der Zug läuft von selbst aus.
            if (bodenMalenRef.current) {
                if (!selectedDecoToPlaceRef.current) bodenMalenRef.current = null;
                else platziereDeko(worldX, worldY, { still: true });
                return;
            }

            // Schnellernte, solange die linke Taste hängt. `e.buttons` fragt den
            // TATSÄCHLICHEN Zustand ab: wird die Taste ausserhalb der Leinwand oder
            // über einem Fenster losgelassen, kommt kein mouseup an, und der Zug
            // lief sonst weiter, sobald die Maus zurückkam.
            if (isDragHarvestingRef.current) {
                if (!(e.buttons & 1)) {
                    isDragHarvestingRef.current = false;
                    dragHarvestedCellsRef.current = new Set();
                    flushDragErnte();
                } else {
                    ernteBeiZug(worldX, worldY);
                }
            }

            // Erst der eigene Acker (der häufige Fall), dann die fremden. Fremde
            // Pflanzen sind nur zum Ansehen — geerntet wird nichts, aber Größe,
            // Wert und Restzeit stehen genauso in der Karte.
            const meinIndex = mySlotRef.current;
            const mySlot = layout.current.slots[meinIndex] || layout.current.slots[0];
            const eigene = getHoveredCell(mySlot, worldX, worldY, plotPlants);
            if (eigene) {
                const zelle = `${eigene.cellX}_${eigene.cellY}`;
                // Schreibt in den externen Store; meldet nur bei Zellwechsel.
                if (plotPlants[zelle]) hoverStore.set({ key: `${meinIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                else hoverStore.clear();
                return;
            }

            for (const [slotIndex, snapshot] of plotsRef.current) {
                if (slotIndex === meinIndex) continue;
                const slot = layout.current.slots[slotIndex];
                if (!slot || !snapshot?.plants) continue;
                // Die Freischaltungen des ANDEREN, sonst treffen dessen Erweiterungs-
                // reihen ins Leere. `slot` selbst wird dabei nicht verändert.
                fremdHoverSlot.x = slot.x;
                fremdHoverSlot.anchorY = slot.anchorY;
                fremdHoverSlot.isTopRow = slot.isTopRow;
                fremdHoverSlot.unlockedCells = snapshot.plotUnlockedCells || [];
                const treffer = getHoveredCell(fremdHoverSlot, worldX, worldY, snapshot.plants);
                if (!treffer) continue;
                const zelle = `${treffer.cellX}_${treffer.cellY}`;
                if (snapshot.plants[zelle]) {
                    hoverStore.set({ key: `${slotIndex}:${zelle}`, x: clientXLocal, y: clientYLocal });
                    return;
                }
            }
            hoverStore.clear();
        };

        const onCanvasMouseDown = (e) => {
            // Bodenbeläge malt man: Taste halten und ziehen. Der erste Klick liegt
            // schon hier, damit auch ein kurzer Klick ohne Bewegung eine Kachel legt
            // — `click` kommt danach und findet die Kachel bereits belegt.
            if (istBoden(selectedDecoToPlaceRef.current) && editorAktivRef.current) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                bodenMalenRef.current = true;
                klickGehoertZuBodenMalenRef.current = true;
                platziereDeko(worldX, worldY);
                return;
            }
            if (selectedTool === "shovel") {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                const mySlot = layout.current.slots[mySlotRef.current] || layout.current.slots[0];
                const hovered = getHoveredCell(mySlot, worldX, worldY, plotPlants);
                if (!hovered) return;
                const key = `${hovered.cellX}_${hovered.cellY}`;
                if (!plotPlants[key]) return;
                if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
                if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                shovelHoldStartedAtRef.current = Date.now();
                setShovelHoldState({ active: true, progress: 0 });
                shovelHoldProgressRef.current = setInterval(() => {
                    const progress = Math.min(1, (Date.now() - shovelHoldStartedAtRef.current) / 900);
                    setShovelHoldState({ active: true, progress });
                }, 33);
                shovelHoldTimerRef.current = setTimeout(async () => {
                    setPlotPlants(prev => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                    });
                    notify("Pflanze entfernt.");
                    if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
                    setShovelHoldState({ active: false, progress: 0 });
                }, 900);
                return;
            }
            // ── Schnellzug: Shift halten und ziehen — erntet ODER pflanzt ────
            //
            // Vorher lief das ohne Shift und startete NUR, wenn schon die erste
            // Zelle unter dem Zeiger reif war. Beides war falsch: wer auf eine leere
            // Kachel oder eine unreife Pflanze drückte und dann über ein volles Feld
            // zog, erntete gar nichts — und wer nur die Ansicht verschieben wollte,
            // erntete versehentlich eine halbe Reihe ab.
            //
            // Jetzt ist Shift der Schalter: gedrückt wird geerntet ODER bepflanzt,
            // was der Zeiger berührt (siehe ernteBeiZug), egal womit der Zug
            // angefangen hat. Ein ausgewählter Samen blockiert den Zug nicht mehr
            // (Feedback 30.08.) — er ist jetzt der Grund, WARUM leere Zellen
            // bepflanzt statt übersprungen werden. Ohne Shift bleibt es beim
            // einzelnen Klick.
            if (e.shiftKey && !selectedTool && !selectedPetToPlace && !selectedDecoToPlace) {
                const { worldX, worldY } = toWorld(e.clientX, e.clientY);
                isDragHarvestingRef.current = true;
                dragHarvestedCellsRef.current = new Set();
                ernteBeiZug(worldX, worldY);
            }
        };

        const stopShovelHold = () => {
            if (shovelHoldTimerRef.current) clearTimeout(shovelHoldTimerRef.current);
            if (shovelHoldProgressRef.current) clearInterval(shovelHoldProgressRef.current);
            setShovelHoldState({ active: false, progress: 0 });
            // GEFUNDEN (Feedback 01.09.: "shift + leftclick... Ton, aber nichts
            // geerntet, weil beim ersten Shift+Klick schon alles weg war"):
            // Der Browser feuert nach JEDEM mouseup auf der Leinwand automatisch
            // ein click — auch nach einem reinen Shift-Klick ohne Zug. Die Sperre
            // in onCanvasClick ("Mit Shift gehört der Klick zur Schnellernte")
            // prüft isDragHarvestingRef, aber die Zeile hier setzte das Flag schon
            // VOR diesem click zurück, die Sperre griff also nie. Ergebnis: der
            // click las die noch nicht aktualisierten plotPlants (harvestMany
            // läuft ja noch), hielt die Staude für reif und schickte per
            // handleHarvest eine ZWEITE, unabhängige Ernte-Anfrage für dieselbe
            // Zelle los — mit ihrem EIGENEN, ebenso veralteten Vorher-Stand. Kam
            // deren Antwort NACH der von handleHarvestMany zurück, überschrieb sie
            // einen bereits geleerten Fruchtstand wieder mit dem alten (scheinbar
            // reifen) Stand — sichtbar reife Frucht, die der Server längst nicht
            // mehr hat. Der Ton kam vom zweiten, überflüssigen handleHarvest-Aufruf
            // (der spielt ihn optimistisch VOR der Server-Antwort).
            //
            // Fix: das Flag bleibt bis nach dem click-Event stehen (setTimeout 0
            // schiebt den Reset einen Tick weiter) — dieselbe Reihenfolge wie
            // mousedown → mouseup → click, nur dass die Sperre jetzt tatsächlich
            // noch etwas zum Sperren vorfindet.
            setTimeout(() => { isDragHarvestingRef.current = false; }, 0);
            dragHarvestedCellsRef.current = new Set();
            flushDragErnte();
            // Ein Malzug endet mit der Maustaste — auch wenn sie ausserhalb der
            // Leinwand losgelassen wird (mouseleave ruft dasselbe auf).
            bodenMalenRef.current = null;
        };

        // Mausrad zoomt. passive:false, sonst scrollt die Seite darunter mit.
        const onWheel = (e) => {
            e.preventDefault();
            const richtung = e.deltaY > 0 ? 1 / ZOOM_SCHRITT : ZOOM_SCHRITT;
            const neu = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * richtung));
            if (neu === zoomRef.current) return;
            zoomRef.current = neu;
            setZoomAnzeige(neu);
            // Die Hover-Karte hing sonst an der alten Zelle: der Weltpunkt unter der
            // Maus ist nach dem Zoomen ein anderer.
            hoverStore.clear();
        };

        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("mousemove", onCanvasMove);
        canvas.addEventListener("mouseleave", onMouseLeave);
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mouseup", stopShovelHold);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            canvas.removeEventListener("click", onCanvasClick);
            canvas.removeEventListener("mousemove", onCanvasMove);
            canvas.removeEventListener("mouseleave", onMouseLeave);
            canvas.removeEventListener("mousedown", onCanvasMouseDown);
            canvas.removeEventListener("mouseup", stopShovelHold);
            canvas.removeEventListener("wheel", onWheel);
            // KEIN stopShovelHold() mehr.
            //
            // Dieser Effekt hängt an `plotPlants` — die erste geerntete Pflanze
            // setzt ihn also selbst neu auf, und der Aufräumer beendete dabei das
            // Ziehen, das gerade lief. Ergebnis: Drag-Harvest erwischte genau EINE
            // Pflanze, danach musste man wieder einzeln klicken. Dasselbe brach
            // das Schaufel-Halten ab, sobald irgendwo eine Frucht nachwuchs.
            // Losgelassen wird über mouseup/mouseleave (beide werden hier gleich
            // wieder registriert), beim echten Unmount über den Effekt weiter oben.
        };
        // petPlacements und toolInventory fehlten hier: die Platzgrenze rechnete mit
        // dem Stand vom letzten Rendern dieses Effekts.
    }, [showLobbyScreen, handleCellClick, handleHarvest, planeDragErnteFlush, flushDragErnte, handleMineRock, handleMovePlantWithPot, handleWaterPlant, notify, plotPlants, selectedTool, selectedPetToPlace, selectedDecoToPlace, decoPlacements, petPlacements, toolInventory, hoverStore, verschiebtGebaeude, debouncedSave, plotsRef, remotePlayersRef, sendShotgun]);

    useEffect(() => {
        mySlotRef.current = mySlotIndex;
    }, [mySlotIndex]);


    useEffect(() => {
        if (!showLobbyScreen) return;
        setIsInitialLoadDone(false);
        worldBootTokenRef.current += 1;
        worldBootKindRef.current = null;
        worldBootStatusRef.current = { preloadDone: false, dataDone: false, minDoneAt: 0 };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState((prev) => (prev.active ? { active: false, label: "", progress: 0 } : prev));
    }, [showLobbyScreen]);

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
        // Der Tick würfelt nur das AUSLÖSEN (PET_PROC_CHANCE) und meldet die Absicht —
        // die Höhe eines Fundes entscheidet der Server.
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
                // „Züchter" aus dem Fähigkeitsbaum — gedeckelt wie serverseitig.
                const procChance = Math.min(0.5, PET_PROC_CHANCE * (1 + skillWirkung("zuechter")));

                for (const pet of tiere) {
                    if (Math.random() >= procChance) continue;
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
    const visibleShopSeeds = useMemo(() => {
        const seeds = shopRotation?.seeds || [];
        const gefiltert = seeds.filter((s) => shopFilter === "all" || s.active);
        return sortiere(gefiltert, SHOP_SORTIERUNGEN, shopSortierung);
    }, [shopRotation?.seeds, shopFilter, shopSortierung]);
    // Samen und Ernte teilen sich die Rucksackplätze. Ist kein Platz mehr, sperrt
    // der Laden die Zeilen — sonst klickt man weiter ins Leere.
    const rucksackVoll = (inventory.length + harvestedItems.length) >= inventoryMaxSlots;
    // Verkauf ebenfalls serverseitig: die Summe entsteht aus den beim Server
    // gespeicherten Ernte-Eigenschaften, nicht aus einem vom Client gemeldeten Wert.
    const handleSellAllHarvested = useCallback(async () => {
        if (harvestedItems.length === 0) return;
        try {
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellAll" }),
            });
            // Verkaufen ruehrt keine Pflanze an — leeres Array heisst "nicht anfassen".
            applyEconomy(data, []);
            playSound("cash", 0.6);
            const verdient = Number(data?.verdient || 0);
            // Feedback 30.08.: "nicht oben die kleine graue Bubble, sondern eine
            // animierte Cartoon-Blase auf dem Markt mit dem gemachten Geld" — der
            // Spieler steht beim Verkaufen immer am Markt (sellAllRef läuft nur aus
            // activateInteractable/der Marktstand-Ansicht, beide setzen Nähe voraus),
            // die Sprechblase kann also direkt über dem Marktstand erscheinen statt
            // als Kopfzeilen-Meldung.
            const marktBereich = engineRef.current?.areas?.market;
            const renderer = engineRef.current?.renderer;
            if (renderer && marktBereich) {
                renderer.spawnVerkaufsBlase(marktBereich.x, marktBereich.y - 80, `+${formatGold(verdient)}`);
            } else {
                notify("Alles verkauft: +" + verdient.toLocaleString("de-DE") + " Gold");
            }
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [harvestedItems.length, apiCall, applyEconomy, notify, playSound]);

    useEffect(() => {
        sellAllRef.current = handleSellAllHarvested;
    }, [handleSellAllHarvested]);

    // Verkaufspreis zahlt der Server aus seiner eigenen Tabelle — vorher muss der
    // Spielstand raus, sonst kennt er ein frisch geschluepftes Tier noch nicht.
    const handleSellSelectedPet = useCallback(async () => {
        if (!selectedPetToPlace) {
            notify("Kein Tier in der Hand. Wähle zuerst ein Tier aus dem Rucksack.", "error");
            return;
        }
        const name = selectedPetToPlace.name || "Tier";
        const petId = selectedPetToPlace.id || selectedPetToPlace.instanceId;
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetInventory(prev => prev.filter(p => (p.id || p.instanceId) !== petId));
            setSelectedPetToPlace(null);
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [selectedPetToPlace, notify, playSound, apiCall, flushSave, debouncedSave]);

    useEffect(() => {
        sellPetRef.current = handleSellSelectedPet;
    }, [handleSellSelectedPet]);

    // ── Tier-Detailfenster (Klick auf ein platziertes Tier) ───────────────────
    const handleStowInspectedPet = useCallback(() => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        setPetPlacements(prev => prev.filter(p => p.id !== petId));
        setPetInventory(prev => [...prev, {
            ...inspectedPet,
            instanceId: `pet_pickup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            _type: "pet",
        }]);
        notify(`${inspectedPet.name || "Tier"} eingepackt.`);
        setInspectedPet(null);
        debouncedSave();
    }, [inspectedPet, notify, debouncedSave]);

    const handleRenamePet = useCallback((pet, newName) => {
        if (!pet) return;
        const clean = String(newName || "").replace(/\s+/g, " ").trim().slice(0, 24);
        const customName = clean || null; // leeres Feld = zurück zum Artnamen
        setPetPlacements(prev => prev.map(p => (p.id === pet.id ? { ...p, customName } : p)));
        setInspectedPet(prev => (prev && prev.id === pet.id ? { ...prev, customName } : prev));
        notify(customName ? `Heißt jetzt „${customName}".` : "Name zurückgesetzt.");
        debouncedSave();
    }, [notify, debouncedSave]);

    const handleSellInspectedPet = useCallback(async () => {
        if (!inspectedPet) return;
        const petId = inspectedPet.id;
        const name = inspectedPet.name || "Tier";
        try {
            await flushSave();
            const data = await apiCall("/action", {
                method: "POST",
                body: JSON.stringify({ action: "sellPet", petId }),
            });
            setPetPlacements(prev => prev.filter(p => p.id !== petId));
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            playSound("cash", 0.6);
            notify(`${name} verkauft: +${Number(data?.verdient || 0).toLocaleString('de-DE')} Gold`);
            setInspectedPet(null);
            debouncedSave();
        } catch (err) {
            notify(err?.message || "Verkauf fehlgeschlagen.", "error");
        }
    }, [inspectedPet, notify, playSound, debouncedSave, apiCall, flushSave]);

    /**
     * @param {object} [ueberschreibung] Felder, die NICHT aus dem React-State kommen
     *   sollen. Noetig, wenn direkt vor dem Speichern etwas gesetzt wurde: `setState`
     *   wirkt erst beim naechsten Rendern, der Payload hier liest aber die Werte des
     *   letzten. Ohne diesen Weg speichert der Ruecksprung in handleHarvest den Acker
     *   OHNE die gerade wiederhergestellte Pflanze.
     */
    const flushFarmStateToServer = useCallback(async (ueberschreibung, versuch = 0) => {
        // Vor dem ersten Laden stehen in den States nur die Startwerte — leere
        // Listen. Ein PUT damit loescht auf dem Server Deko, Tiere und Eier.
        // Der Autosave-Effekt prueft das laengst; debouncedSave() lief bisher
        // ungeprueft durch und war damit das Schlupfloch.
        if (!isInitialLoadDoneRef.current) return;
        // Ein zurückgetretener Tab schreibt nicht mehr. Sonst überschriebe er beim
        // nächsten Autosave genau den Stand, vor dem er gerade zurückgetreten ist.
        if (nurZuschauenRef.current) return;
        const payload = {
            tabId: TAB_ID,
            inventory, plotPlants, plotExpansions, plotUnlockedCells,
            eggInventory, petInventory, petPlacements, decoInventory, decoPlacements,
            toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch,
            shopStock: ladenBestand,
            shopStockVersion: shopRotation?.generatedAt,
            toolShopStock: toolShopStock,
            toolShopStockVersion: toolShopRotation?.generatedAt,
            eggShopStock: eggShopStock,
            eggShopStockVersion: eggShopRotation?.generatedAt,
            // Fehlte hier, stand aber im 5-Sekunden-Autosave: ohne das Feld setzt
            // compactFarmState das Aussehen auf den Standard-Farmer zurück, und jedes
            // debouncedSave (Pflanzen, Kaufen, …) zog die Kleidung mit.
            appearance: playerAppearance,
            tutorialCompleted,
            [ACKERRASTER_MARKE]: ackerRasterMigriert,
            // Gegen verspätete Speicherstände: der Server verwirft diesen PUT, wenn
            // seit dem Laden eine Aktion dazwischenkam (siehe erhoeheVersion).
            stateVersion: stateVersionRef.current,
            ...(ueberschreibung || {}),
        };
        try {
            await apiCall("/farm-state", { method: "PUT", body: JSON.stringify({ state: payload }) });
        } catch (err) {
            // Kein Status heisst: keine Antwort erhalten. Der Server hat diesen
            // Stand vielleicht trotzdem übernommen — blind nachreichen würde dann
            // mit einem veralteten Zähler gegen einen bereits gespeicherten Stand
            // laufen. Der nächste reguläre Speichervorgang klärt das von selbst.
            if (err?.status === undefined) return;
            if (err?.status !== 409) return; // nicht angemeldet / offline — der Socket versucht es weiter

            // 409 heisst: der Server ist weiter als diese Nutzlast. In aller Regel,
            // weil eine EIGENE Aktion fertig wurde, während der PUT unterwegs war —
            // beim Kauf von zehn Töpfen passiert das fast bei jedem einzelnen.
            //
            // NICHT nachladen. Der React-Stand ist in diesem Fall die vollständigere
            // Fassung: er kennt die eben gekauften Sachen, der Server nicht (Rucksack
            // und Werkzeug gehören dem Browser). Ein Nachladen warf genau die Käufe
            // weg, die gerade dazugekommen waren, und der nächste Speicherversuch lief
            // in denselben Konflikt — daher die Schleife aus 409 und „Lade Spielstand".
            //
            // Richtig ist: Zähler übernehmen und mit FRISCH gebauter Nutzlast erneut
            // schicken. Der kurze Aufschub gibt React Zeit, den letzten Kauf zu
            // übernehmen, damit die neue Nutzlast ihn auch enthält.
            // Hat der SERVER selbst etwas geändert (Umstellung beim Neustart,
            // Admin-Eingriff)? Dann ist sein Stand der bessere und dieser hier muss
            // weichen — nachreichen würde die Änderung überschreiben. Das ist der
            // einzige Fall, in dem Nachladen richtig ist.
            const meinStand = stateVersionRef.current;
            const serverAenderung = Number(err.data?.serverAenderungAb) || 0;
            if (typeof err.data?.stateVersion === "number") {
                stateVersionRef.current = err.data.stateVersion;
            }
            if (serverAenderung > meinStand) {
                console.log(`[Garden] Server hat den Stand selbst geändert (ab ${serverAenderung}) — wird geholt.`);
                await uebernimmVomServer(null);
                return;
            }
            // Ein ANDERER Tab hat zuletzt geschrieben. Nachreichen hiesse: dessen
            // Rucksack durch den eigenen, älteren ersetzen — genau der Weg, auf dem
            // Samen verschwinden. Dieser Tab tritt deshalb zurück, holt den echten
            // Stand und schaut nur noch zu, bis der Spieler ihn übernimmt.
            const andererTab = err.data?.letzterTab;
            if (andererTab && andererTab !== TAB_ID) {
                console.warn(`[Garden] Anderer Tab hat zuletzt gespeichert (${andererTab}) — dieser tritt zurück.`);
                nurZuschauenRef.current = true;
                setNurZuschauen(true);
                await uebernimmVomServer(null);
                return;
            }
            if (versuch < 3) {
                await new Promise((r) => setTimeout(r, 120));
                await flushFarmStateToServerRef.current?.(ueberschreibung, versuch + 1);
                return;
            }
            // Auch danach wird NICHT nachgeladen. Ein Nachladen ersetzt alles, was dem
            // Browser gehört, durch den letzten gespeicherten Stand — bei zwölf frisch
            // gekauften Pfirsichen also: neun weg, Gold trotzdem abgebucht, und der
            // Ladenbestand wieder aufgefüllt (der wird ebenfalls mitgespeichert).
            // Der nächste Speicherversuch läuft ohnehin gleich wieder los und hat dann
            // den richtigen Zähler; damit klärt sich das von selbst, ohne Verlust.
            // Der einzige Fall, in dem der Serverstand wirklich der bessere ist, ist
            // ein Eingriff von aussen — und der schickt sein eigenes Signal
            // (garden:admin_update), das weiterhin nachlädt.
            console.warn("[Garden] Speichern kollidiert wiederholt — nächster Versuch folgt.");
        }
    }, [apiCall, uebernimmVomServer, gold, inventory, plotPlants, plotExpansions, plotUnlockedCells, harvestedItems, eggInventory, petInventory, petPlacements, decoInventory, decoPlacements, toolInventory, inventoryMaxSlots, incubator, gebaeudeVersatz, logbuch, ladenBestand, shopRotation?.generatedAt, toolShopStock, toolShopRotation?.generatedAt, eggShopStock, eggShopRotation?.generatedAt, playerAppearance, tutorialCompleted, ackerRasterMigriert]);

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

    const handleClaimMail = useCallback(async (mailId) => {
        setMailBusy(true);
        try {
            const data = await apiCall("/mail/claim", { method: "POST", body: JSON.stringify({ id: mailId }) });
            setMailboxState(Array.isArray(data?.mailbox) ? data.mailbox : []);
            if (typeof data?.gold === "number") setGold(data.gold);
            if (typeof data?.goldGesamt === "number") setGoldGesamt(data.goldGesamt);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            // Eine Sendung kann mehrere Anhänge tragen — gleiche Namen werden für
            // die Meldung zu „Karotte × 3" zusammengefasst.
            const parts = [];
            if (data?.credited?.gold) parts.push(`${data.credited.gold.toLocaleString("de-DE")} Gold`);
            const namen = [
                ...(data?.credited?.seeds ?? []).map((s) => s?.name),
                ...(data?.credited?.items ?? []).map((i) => i?.name),
                ...(data?.credited?.pets ?? []).map((p) => p?.customName || p?.name),
            ].filter(Boolean);
            const gezaehlt = new Map();
            for (const name of namen) gezaehlt.set(name, (gezaehlt.get(name) || 0) + 1);
            for (const [name, anzahl] of gezaehlt) parts.push(anzahl > 1 ? `${name} × ${anzahl}` : name);
            notify(parts.length ? `Abgeholt: ${parts.join(", ")}.` : "Sendung abgeholt.");
            playSound("cash", 0.5);
        } catch (err) {
            notify(err?.message || "Abholen fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, playSound]);

    const handleSendMail = useCallback(async (payload, onDone) => {
        setMailBusy(true);
        const gesendeteSamen = new Set(payload.seedInstanceIds || []);
        const gesendeteTiere = new Set(payload.petIds || []);
        const gesendeteErnte = new Set(payload.itemIds || []);
        // Fuer den Ruecksprung, falls der Server ablehnt
        const { inventory: vorherSamen, petInventory: vorherTiere, harvestedItems: vorherErnte } = farmStateRef.current;
        try {
            // Erst den eigenen Stand hochschieben: der Server entscheidet gleich
            // anhand SEINER Kopie, ob der Samen ueberhaupt existiert. Ein Tier, das
            // gerade erst geschluepft ist, steht dort sonst noch gar nicht.
            await flushSave();

            // Jetzt sofort aus dem Rucksack nehmen. Vorher lag zwischen Klick und
            // Verschwinden eine ganze Netzrunde, und ein verschenkter Samen blieb
            // solange auswaehlbar — man konnte ihn in der Zwischenzeit einpflanzen.
            if (gesendeteSamen.size) {
                setInventory((prev) => prev.filter((s) => !gesendeteSamen.has(String(s?.instanceId))));
                setSelectedSeed((prev) => (prev && gesendeteSamen.has(String(prev.instanceId)) ? null : prev));
            }
            if (gesendeteTiere.size) {
                setPetInventory((prev) => prev.filter((p) => !gesendeteTiere.has(String(p?.id || p?.instanceId))));
                setSelectedPetToPlace((prev) => (prev && gesendeteTiere.has(String(prev.id || prev.instanceId)) ? null : prev));
            }
            if (gesendeteErnte.size) {
                setHarvestedItems((prev) => prev.filter((i) => !gesendeteErnte.has(String(i?.id))));
            }

            const data = await apiCall("/mail/send", { method: "POST", body: JSON.stringify(payload) });
            // Server hat abgebucht — lokalen Stand übernehmen, sonst schreibt der
            // nächste Auto-Save das alte Gold zurück.
            if (typeof data?.gold === "number") setGold(data.gold);
            if (Array.isArray(data?.inventory)) setInventory(hydrateSeeds(data.inventory));
            // Ernte und Tiere ebenfalls uebernehmen — sonst traegt der naechste
            // Speichervorgang das Verschenkte wieder ein.
            if (Array.isArray(data?.harvestedItems)) setHarvestedItems(hydrateHarvestedItems(data.harvestedItems));
            if (Array.isArray(data?.petInventory)) setPetInventory(hydratePets(data.petInventory));
            const anhaenge = gesendeteSamen.size + gesendeteErnte.size + gesendeteTiere.size;
            notify(anhaenge > 1
                ? `Sendung mit ${anhaenge} Gegenständen an ${payload.toLogin} unterwegs.`
                : `Sendung an ${payload.toLogin} unterwegs.`);
            onDone?.();
        } catch (err) {
            // Nichts ist rausgegangen (der Server prueft alles, bevor er abbucht) —
            // also den Rucksack wieder herstellen.
            setInventory(vorherSamen);
            setPetInventory(vorherTiere);
            setHarvestedItems(vorherErnte);
            notify(err?.message || "Senden fehlgeschlagen.", "error");
        } finally {
            setMailBusy(false);
        }
    }, [apiCall, notify, flushSave]);

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
        apiCall("/leaderboard")
            .then((data) => setLeaderboard(Array.isArray(data) ? data : []))
            .catch(() => setLeaderboard([]));
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

    if (showLobbyScreen) {
        return (
            <div className="page-fade w-full flex-1 min-h-0 h-full relative overflow-y-auto custom-scrollbar flex items-center justify-center p-6 md:p-10">
                {/* Ohne eigene Metadaten behielt der Reiter den Titel der Seite, von der
                    man gekommen ist — auf der Farm stand dann „Home - vnmvalentin". */}
                <SEO {...FARM_SEO} />
                <div className="w-full max-w-2xl flex flex-col items-center gap-7 py-6">

                    <div className="flex items-center gap-3 self-start">
                        <span className="flex items-center justify-center w-10 h-10 rounded-2xl border border-slate-700 bg-slate-900 text-violet-400 shrink-0">
                            <Sprout size={20} />
                        </span>
                        <div>
                            <h1 className="text-2xl font-semibold text-white tracking-tight">Virtual Farm</h1>
                            <p className="text-xs text-slate-400 mt-0.5">Eine gemeinsame Welt mit acht Grundstücken</p>
                        </div>
                    </div>

                    <div className="w-full rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800">
                            <HudIcon.level size={14} className="text-amber-400" />
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Bestenliste</h2>
                        </div>
                        {leaderboard.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-slate-500">Noch keine Farmer unterwegs.</p>
                        ) : (
                            <div>
                                {leaderboard.slice(0, 5).map((e, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0">
                                        <span className={`text-xs tabular-nums w-6 shrink-0 ${i === 0 ? "text-amber-400" : "text-slate-500"}`}>
                                            {i + 1}
                                        </span>
                                        <span className="flex-1 min-w-0 text-sm text-white truncate" title={e.name}>{e.name}</span>
                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 tabular-nums shrink-0">
                                            <HudIcon.gold size={13} /> {formatGold(e.gold)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Twitch-Konto</div>
                            {authUser?.twitchLogin || authUser?.login ? (
                                <div className="text-sm text-white font-medium flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    {(authUser?.twitchLogin || authUser?.login)}
                                </div>
                            ) : (
                                <div className="text-sm text-amber-300">Nicht angemeldet — die Farm braucht einen Twitch-Login</div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Der Admin trägt sein eigenes Schild statt „Subscriber" —
                                den Verkaufsbonus bekommt er trotzdem, deshalb steht er
                                weiterhin daneben. */}
                            {authUser && istGartenAdmin && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-red-500/40 text-red-300 text-[11px] font-medium">
                                    <HudIcon.trusted size={12} /> Admin{isSubscriber ? " · +50 % Verkauf" : ""}
                                </span>
                            )}
                            {authUser && !istGartenAdmin && isSubscriber && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-amber-500/40 text-amber-300 text-[11px] font-medium">
                                    <HudIcon.star size={12} /> Subscriber · +50 % Verkauf
                                </span>
                            )}
                            {authUser && isBeta && (
                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-sky-500/40 text-sky-300 text-[11px] font-medium">
                                    <FlaskConical size={12} /> Beta
                                </span>
                            )}
                            {!authUser && (
                                <button
                                    type="button"
                                    onClick={() => twitchLogin?.()}
                                    className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-3 py-2 rounded-2xl text-xs font-semibold transition-colors"
                                >
                                    <TwitchGlyph className="w-3.5 h-3.5" /> Mit Twitch anmelden
                                </button>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => enterWorld("public")}
                        disabled={!authUser}
                        className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-2xl text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <Play size={16} />
                        Öffentliche Welt betreten
                    </button>

                    <div className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 flex flex-col gap-3">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Private Welt</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={joinCodeInput}
                                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                                onKeyDown={(e) => { if (e.key === "Enter" && authUser) enterWorld("code"); }}
                                placeholder="Weltcode"
                                disabled={!authUser}
                                className="flex-1 px-3 py-2 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-slate-600 focus:border-violet-500 focus:outline-none disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={() => enterWorld("code")}
                                disabled={!authUser || joinCodeInput.trim().length < 4}
                                className="px-4 py-2 rounded-2xl border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:hover:border-slate-700 text-xs font-semibold transition-colors"
                            >
                                Beitreten
                            </button>
                            <button
                                type="button"
                                onClick={() => enterWorld("create")}
                                disabled={!authUser}
                                className="px-4 py-2 rounded-2xl border border-slate-700 text-slate-200 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:hover:border-slate-700 text-xs font-semibold transition-colors"
                            >
                                Neue Welt
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Eine neue Welt bekommt einen fünfstelligen Code, den du weitergeben kannst.
                            Deine Farm bleibt dabei dieselbe — sie zieht mit dir in jede Welt um.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        // Nunito statt 'Courier New': die Schreibmaschinenschrift mit ihren harten
        // Kanten passte nicht zu einem Farmspiel. Zahlen bleiben über `tabular-nums`
        // an ihren Stellen stehen, dafür ist die Schrift nicht mehr dicktengleich.
        <div className="relative w-full h-full min-h-0 flex-1 bg-slate-950 overflow-hidden" style={{ fontFamily: "'Baloo 2', 'Nunito', 'Segoe UI', system-ui, sans-serif" }}>
            <SEO {...FARM_SEO} />
            <canvas ref={canvasRef} className="absolute inset-0" />
            {/* Feedback 01.09.: "besserer Ladebildschirm, richtig erst fertig wenn
                alles geladen hat" — der Balken bleibt unter 100 %, bis preloadCriticalAssets
                (der GANZE Samenkatalog + alle Reskins, nicht nur der eigene Bestand) UND
                die Serverdaten tatsächlich da sind (tryCompleteWorldBoot oben — kein
                Balken, der einfach eine feste Zeit lang lief).
                Das Bild (loading_screen.webp) trägt Titel + Untertitel schon eingebrannt;
                der Balken sitzt als eigene Ebene in FESTEM Abstand zum Bild (`top: 41%`
                seiner eigenen Box, nicht des Viewports) exakt unter dem Schriftzug —
                das Bild läuft dafür immer mit object-contain in einer Box im selben
                668:373-Seitenverhältnis mit, egal wie breit der Bildschirm ist. */}
            {worldBootState.active && (
                <div className="absolute inset-0 z-[120] bg-slate-950 flex items-center justify-center p-6">
                    <div className="relative w-[min(760px,94vw)]" style={{ aspectRatio: "668 / 373" }}>
                        <img
                            src="/garden-assets/world/loading_screen.webp"
                            alt="Virtual Farm"
                            className="absolute inset-0 h-full w-full object-contain"
                            draggable={false}
                        />
                        <div className="absolute left-1/2 w-[46%] -translate-x-1/2" style={{ top: "41%" }}>
                            <div className="h-2.5 w-full rounded-xl bg-slate-950/70 border border-white/10 overflow-hidden">
                                <div
                                    className="h-full rounded-xl bg-violet-500 transition-[width] duration-200"
                                    style={{ width: `${Math.max(4, Math.min(100, worldBootState.progress || 0))}%` }}
                                />
                            </div>
                            <div
                                className="mt-1.5 text-center text-[11px] text-white/80 tabular-nums"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                            >
                                {Math.round(worldBootState.progress || 0)} % — {worldBootState.label || "Bitte warten..."}
                            </div>
                        </div>
                    </div>
                </div>
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
            <div className="absolute top-5 left-5 z-50 flex flex-col items-start gap-2">
                <button
                    type="button"
                    aria-label="Einstellungen"
                    onClick={(e) => {
                        e.currentTarget.blur();
                        setSettingsOpen((prev) => !prev);
                    }}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center ${HUD_SURFACE} text-slate-300 transition-colors hover:text-white`}
                >
                    <HudIcon.settings size={17} />
                </button>

                {/* Spielerzahl und Zoom sagen etwas über die Welt und die Ansicht, nicht
                    über die eigene Farm — deshalb hier bei den Einstellungen statt
                    rechts zwischen Gold, Post und Tieren.
                    Die Liste klappt per KLICK auf und bleibt offen: sie ist zum Anklicken
                    der Namen da, und ein Aufklappen beim Überfahren würde genau dann
                    zuschnappen, wenn man den Zeiger zum gewünschten Namen bewegt. */}
                <div className="flex flex-col items-start">
                    <button
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); setOnlineListeOffen((offen) => !offen); }}
                        aria-expanded={istOnlineListeOffen}
                        className={`flex h-10 w-[11rem] items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                            <HudIcon.players size={17} />
                        </span>
                        <span className="truncate tabular-nums">
                            {lobbyConnected ? `${onlinePlayers.length + 1}/${WORLD_SLOTS} online` : "Verbinde…"}
                        </span>
                        <HudIcon.chevron
                            size={13}
                            className={`ml-auto shrink-0 transition-transform ${istOnlineListeOffen ? "rotate-180" : ""}`}
                        />
                    </button>
                    {istOnlineListeOffen && (
                        // Cartoon-Überarbeitung 30.08. (zweite Runde, "Spielermenü ist noch
                        // alt"): dieselbe dicke dunkle Holz-Kontur wie überall sonst, der
                        // Innenraum bleibt dunkel (siehe GardenModal-Kommentar in gardenUi.jsx,
                        // warum: der helle Text hier drin verträgt sich nicht mit hellem Grund).
                        <div className="mt-2 w-[19rem] max-h-64 overflow-y-auto bg-slate-900/95 border-[3px] border-amber-950 rounded-2xl shadow-lg p-1.5 backdrop-blur-sm flex flex-col gap-0.5">
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
                                Klick bringt dich zum Grundstück
                            </div>
                            {/* v2 (Feedback 30.08.: "Profil-Hover soll nicht mehr jedermanns
                                Gold zeigen, stattdessen in die Online-Liste links") — dieselben
                                Zahlen wie vorher in der Profil-Bubble beim Draufhalten, jetzt
                                hier: eigener Stand aus `gold`/`skillStand` (Server hat sie
                                bestätigt), die anderen aus dem Lobby-Tick (p.gold/p.level).
                                Feedback 01.09. ("Dropdown hübscher, Katze als Bild, Level +
                                Gold mit Icons"): eigenes Bild statt Stecknadel-Icon, beide
                                Werte jetzt mit HudIcon statt nacktem Text. */}
                            {[
                                { id: "ich", name: localPlayerNameRef.current || "Du", slotIndex: mySlotIndex, gold, level: skillStand?.level || 1, skin: playerAppearance.skin, selbst: true },
                                ...onlinePlayers.map((p) => ({
                                    id: p.twitchId, name: p.name || "Farmer", slotIndex: p.slotIndex, gold: p.gold || 0, level: p.level || 1, skin: p.skin, selbst: false,
                                })),
                            ].map((eintrag) => (
                                <button
                                    key={eintrag.id}
                                    type="button"
                                    onClick={() => besucheSpieler(eintrag)}
                                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl border border-transparent text-left transition-colors hover:border-slate-700 hover:bg-slate-800/70 ${
                                        eintrag.selbst ? "bg-slate-800/60" : ""
                                    }`}
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950">
                                        {eintrag.skin ? (
                                            <img src={eintrag.skin} alt="" draggable={false} className="h-6 w-6 object-contain" />
                                        ) : (
                                            <MapPin size={12} className="text-slate-600" />
                                        )}
                                    </span>
                                    <span className={`flex-1 min-w-0 truncate text-xs ${
                                        eintrag.selbst ? "text-white font-medium" : "text-slate-300"
                                    }`}>
                                        {eintrag.name}
                                    </span>
                                    <span className="shrink-0 flex flex-col items-end gap-0.5">
                                        {/* Feedback 01.09.: "Trophäen-Icon raus, stattdessen 'Lvl:' vor die
                                            Zahl" — HudIcon.level raus, reiner Text wie beim Namen daneben. */}
                                        <span className="text-[11px] font-bold tabular-nums text-violet-300">
                                            Lvl: {eintrag.level}
                                        </span>
                                        <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-400/90">
                                            <HudIcon.gold size={11} className="shrink-0" /> {formatGold(eintrag.gold)}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Nur für den Streamer: Spielstände von hier aus bearbeiten, ohne den
                    Umweg über das Dashboard in einem zweiten Tab. */}
                {istGartenAdmin && (
                    <button
                        type="button"
                        onClick={() => setAdminPanelOffen(true)}
                        className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-violet-300 transition-colors hover:text-white`}
                    >
                        <SlidersHorizontal size={15} className="shrink-0" />
                        <span className="hidden sm:inline">Admin</span>
                    </button>
                )}

                {/* Zoom nur zeigen, wenn er vom Standard abweicht — sonst steht dauerhaft
                    eine Zeile im Weg, die man nie braucht. */}
                {Math.abs(zoomAnzeige - WORLD_ZOOM) > 0.001 && (
                    <button
                        type="button"
                        onClick={() => { zoomRef.current = WORLD_ZOOM; setZoomAnzeige(WORLD_ZOOM); }}
                        title="Auf Standard zurücksetzen"
                        className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <Search size={15} className="shrink-0" />
                        <span className="tabular-nums">{Math.round((zoomAnzeige / WORLD_ZOOM) * 100)}%</span>
                    </button>
                )}
            </div>

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
                // Cartoon-Überarbeitung 30.08. (zweite Runde, "Einstellungsmenü ist noch
                // alt"): dieselbe Holz-Kontur wie die anderen Klapp-Fenster.
                <div className="absolute top-[68px] left-5 z-50 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto bg-slate-900/95 border-[3px] border-amber-950 rounded-2xl shadow-lg p-2 backdrop-blur-sm flex flex-col gap-1">

                    {/* --- AUDIO --- */}
                    <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Audio
                    </div>
                    <div className="px-3 pb-2 space-y-2 mt-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-300 w-12">Effekte</span>
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={effectVolume}
                                onChange={(e) => setEffectVolume(parseFloat(e.target.value))}
                                onMouseUp={(e) => e.currentTarget.blur()}
                                onTouchEnd={(e) => e.currentTarget.blur()}
                                className="flex-1 h-1.5 bg-slate-700 rounded-2xl appearance-none cursor-pointer accent-cyan-500"
                            />
                            <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(effectVolume * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-300 w-12">Musik</span>
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={musicVolume}
                                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                onMouseUp={(e) => e.currentTarget.blur()}
                                onTouchEnd={(e) => e.currentTarget.blur()}
                                className="flex-1 h-1.5 bg-slate-700 rounded-2xl appearance-none cursor-pointer accent-fuchsia-500"
                            />
                            <span className="text-xs font-mono text-slate-400 w-8 text-right">{Math.round(musicVolume * 100)}%</span>
                        </div>
                        {/* Titelwahl. Während der Party läuft der Party-Titel über
                            dieselbe Spur — deshalb der Hinweis statt einer gesperrten
                            Auswahl: umstellen darf man weiterhin, es wirkt nur später. */}
                        <div className="pt-1">
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs text-slate-300">Titel</span>
                                {tagesInfo.party && (
                                    <span className="text-[10px] text-fuchsia-300">Party läuft — {laufenderPartyTitel?.name}</span>
                                )}
                            </div>
                            <div className="flex gap-1">
                                {THEME_TRACKS.map((track) => (
                                    <button
                                        key={track.id}
                                        type="button"
                                        onClick={(e) => { e.currentTarget.blur(); setThemeId(track.id); }}
                                        className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                            themeId === track.id
                                                ? "bg-violet-600 text-white"
                                                : "bg-slate-800 text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {track.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* --- TRENNLINIE --- */}
                    <div className="h-px bg-slate-700/50 mx-2 my-1" />

                    {/* --- RENDER QUALITÄT --- */}
                    <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Render-Qualität
                    </div>
                    <div className="px-2 pb-2 flex gap-1 mt-1">
                        {["low", "medium", "high"].map((level) => (
                            <button
                                key={level}
                                type="button"
                                onClick={() => {
                                    const preset = RENDER_QUALITY_PRESETS[level];
                                    setRenderProfile(preset);
                                    renderProfileRef.current = preset;
                                }}
                                className={`flex-1 px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                                    renderProfile.level === level
                                        ? "bg-violet-600 text-white"
                                        : "bg-slate-800 text-slate-400 hover:text-white"
                                }`}
                            >
                                {level === "low" ? "Niedrig" : level === "medium" ? "Mittel" : "Hoch"}
                            </button>
                        ))}
                    </div>

                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1 border-t border-slate-800">
                        Tastenkürzel
                    </div>
                    <div className="px-3 pb-3 text-xs text-slate-400 space-y-1.5">
                        {[
                            ["Markt", "Shift + 1"],
                            ["Shop-Areal", "Shift + 2"],
                            ["Eigene Farm", "Shift + 3"],
                            ["Interagieren", "E / Leertaste"],
                            ["Werkzeuge", "1 – 4"],
                            ["Deko-Ansicht", "R"],
                            ["Inventar", "Tab"],
                        ].map(([label, key]) => (
                            <div key={label} className="flex justify-between items-center gap-2">
                                <span>{label}</span>
                                <kbd className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 rounded-xl text-[10px]">{key}</kbd>
                            </div>
                        ))}
                    </div>

                    {/* v2 (Feedback 29.08.: "Changelog in Settings rein") — stand vorher
                        als eigener Knopf oben links, gebraucht aber nur, wer aktiv
                        nachsehen will, was sich geändert hat — genau die Sorte "hin und
                        wieder", für die die Einstellungen ohnehin schon da sind. */}
                    <button
                        type="button"
                        onClick={() => { setSettingsOpen(false); setChangelogOpen(true); }}
                        className="flex w-full items-center gap-2 text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors mt-1 border-t border-slate-800"
                    >
                        <HudIcon.changelog size={13} className="shrink-0" />
                        Changelog
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            await flushFarmStateToServer();
                            setSettingsOpen(false);
                            setShowLobbyScreen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                        Zurück zum Hauptbildschirm
                    </button>
                    <button
                        type="button"
                        onClick={() => { window.location.href = "https://vnmvalentin.de"; }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                        Zur Website
                    </button>
                </div>
            )}

            {/* ── Rechts: Profil, Post, Tiere, Chat, darunter Weltzustand ─────── */}
            {/* items-end statt fester Spaltenbreite: die Profil-Karte darf breiter sein
                als der Rest, ohne dass alles andere mitwächst. */}
            <div className="absolute top-5 right-5 z-40 flex flex-col items-end gap-2">
                {/* Partyzeit. Steht GANZ oben, weil es das seltenere und wichtigere
                    Ereignis ist — und nur dann, wenn es auch läuft. */}
                {tagesInfo.party && (
                    <div className="flex h-10 items-center gap-2 rounded-2xl border border-fuchsia-500 bg-fuchsia-950/80 px-3 text-xs font-semibold text-fuchsia-100 backdrop-blur-sm">
                        <HudIcon.party size={15} className="shrink-0" />
                        <span>Partyzeit · Rainbow {PARTY_RAINBOW_FAKTOR}×</span>
                        <span className="tabular-nums text-fuchsia-300">
                            {Math.floor(tagesInfo.verbleibendMs / 60000)}:{String(Math.floor((tagesInfo.verbleibendMs % 60000) / 1000)).padStart(2, "0")}
                        </span>
                    </div>
                )}

                {/* v2 (Feedback 29.08.: "Menü dropdown auflösen, Profil Bubble") —
                    Gold + XP-Leiste an EINER Stelle statt einer reinen Zahl; Klick
                    öffnet Umkleide/Logbuch (dasselbe Grüppchen wie vorher im "Menü",
                    jetzt aber nach Thema getrennt statt in einer langen Liste).
                    Die Bestenliste, die vorher hier beim Draufhalten erschien, zeigt
                    jetzt niemandes Gold mehr auf einen bloßen Mauskontakt — siehe
                    stattdessen die Online-Liste oben links (Feedback 30.08.). Das
                    Klapp-Panel selbst ist seit Feedback 30.08. ("Profil-Fenster soll
                    mittig und größer sein") kein Dropdown mehr, sondern ein echtes
                    GardenModal — siehe isProfilOffen weiter unten bei den anderen
                    Fenstern. */}
                <div className="relative z-50 w-64">
                    {/* Feedback 30.08.: "Profil soll oben rechts und größer sein" — zeigt
                        jetzt schon zugeklappt das Geist-Bild und den Namen statt nur
                        Level+Gold in einer schmalen Zeile, damit sie als DIE Anlaufstelle
                        oben rechts erkennbar ist. */}
                    <button
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); setProfilOffen((offen) => !offen); }}
                        aria-expanded={isProfilOffen}
                        className={`flex w-full items-center gap-3 ${HUD_SURFACE} px-3 py-2.5 text-left transition-colors hover:text-white`}
                    >
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950">
                            <img
                                src={playerAppearance.skin}
                                alt=""
                                draggable={false}
                                className="h-8 w-8 object-contain"
                            />
                            {/* Offener Fähigkeitspunkt — sichtbar, ohne erst aufklappen zu
                                müssen (übernimmt den Hinweis vom entfernten "Level N"-Knopf).
                                Feedback 30.08. (zweite Runde): eine reine Farbmarkierung
                                ging zu leicht unter — jetzt dieselbe Zahl-Plakette wie am
                                "Fähigkeiten"-Knopf im aufgeklappten Profil, dazu ein
                                dezentes Pulsieren, damit sie wirklich auffällt. */}
                            {(skillStand?.punkteOffen || 0) > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex min-w-[18px] animate-pulse items-center justify-center rounded-xl border-2 border-slate-900 bg-violet-600 px-1 text-[10px] font-bold tabular-nums text-white">
                                    {skillStand.punkteOffen}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white truncate">
                                    {localPlayerNameRef.current || "Du"}
                                </span>
                                <span className="ml-auto flex items-center gap-1 text-xs font-semibold tabular-nums text-amber-400">
                                    <HudIcon.gold size={13} className="shrink-0" />
                                    {gold.toLocaleString("de-DE")}
                                </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-amber-100 shrink-0">Lv {skillStand?.level || 1}</span>
                                <div className="h-1.5 flex-1 overflow-hidden rounded-xl bg-slate-800">
                                    <div
                                        className="h-full bg-violet-500"
                                        style={{
                                            width: `${Math.min(100, Math.max(0,
                                                (skillStand?.xpFuersNaechste || 0) > 0
                                                    ? ((skillStand.xpDiesesLevel || 0) / skillStand.xpFuersNaechste) * 100
                                                    : 100)) }%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => { setMailboxMode("inbox"); setMailboxRecipient(""); setMailboxOpen(true); }}
                    className={`relative flex h-10 w-[8.5rem] items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                        <HudIcon.mailbox size={17} />
                    </span>
                    <span>Briefkasten</span>
                    {mailbox.length > 0 && (
                        <span className="ml-auto min-w-[18px] px-1 text-[10px] font-semibold text-white bg-violet-600 rounded-xl text-center tabular-nums">
                            {mailbox.length}
                        </span>
                    )}
                </button>

                {/* Gold-Shop (Feedback 01.09.): rein kosmetische Reskins. */}
                <button
                    type="button"
                    onClick={() => { setGoldShopOpen(true); ladeGoldShop(); }}
                    className={`flex h-10 w-[8.5rem] items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                        <HudIcon.goldShop size={17} />
                    </span>
                    <span>Gold-Shop</span>
                </button>

                {/* Tiere — bis Feedback 30.08. ein Klapp-Menü mit dem Inkubator als
                    zweitem Punkt darunter. Der Inkubator wohnt jetzt im Schuppen
                    (Feedback 30.08.: "Inkubator in den Schuppen packen und aus dem
                    Tiere-Dropdown entfernen"), damit bleibt hier nur noch EIN Ziel
                    übrig — ein Klapp-Menü für einen einzigen Eintrag wäre unnötiger
                    Umweg, also direkt ein einfacher Knopf wie beim Briefkasten. Die
                    violette "Ei fertig"-Hervorhebung gehörte zum Inkubator, nicht zu
                    den Tieren, und zieht mit ihm in den Schuppen (dort am Knopf UND
                    als Marker über dem Gebäude auf dem Feld). */}
                <button
                    type="button"
                    onClick={() => setPetOverlayOpen(true)}
                    className={`flex h-10 w-[8.5rem] items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                        <TabIcon.pet size={17} />
                    </span>
                    <span className="truncate tabular-nums">
                        Tiere {petPlacements.filter((p) => p.slotIndex === mySlotIndex).length}/{PET_SLOTS}
                    </span>
                </button>

                {/* Weltchat. Anders als Gold und Tiere klappt er per KLICK auf und
                    bleibt offen — beim Tippen darf er nicht zuschnappen, sobald der
                    Zeiger die Leiste verlässt. Der Verlauf gehört der Welt und wird
                    nicht gespeichert; wer später dazukommt, sieht ihn nicht. */}
                <div className="relative w-[8.5rem]">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.currentTarget.blur();
                            setChatOffen((offen) => !offen);
                            // Sonst steht die Farb-/Emojiwahl beim nächsten Öffnen noch offen,
                            // obwohl das Fenster selbst gerade erst wieder aufklappt.
                            setFarbwahlOffen(false);
                            setEmojiWahlOffen(false);
                        }}
                        aria-expanded={istChatOffen}
                        className={`flex h-10 w-full items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                            <HudIcon.chat size={17} />
                        </span>
                        <span>Chat</span>
                        {chatUngelesen > 0 && !istChatOffen && (
                            <span className="min-w-[18px] px-1 text-[10px] font-semibold text-white bg-violet-600 rounded-xl text-center tabular-nums">
                                {chatUngelesen > 99 ? "99+" : chatUngelesen}
                            </span>
                        )}
                        <HudIcon.chevron
                            size={13}
                            className={`ml-auto shrink-0 transition-transform ${istChatOffen ? "rotate-180" : ""}`}
                        />
                    </button>

                    {istChatOffen && (
                        // Cartoon-Überarbeitung 30.08. (zweite Runde, "Chat Fenster ist noch
                        // alt"): dieselbe Holz-Kontur wie die anderen Klapp-Fenster.
                        //
                        // Feedback 01.09.: "Chat-Fenster ragt aus dem Bildschirm" — die feste
                        // -ml-[6.5rem] hat den Knopf mittig unter ein 19rem breites Fenster
                        // gelegt, aber der Knopf steht ganz rechts im HUD, direkt am
                        // Bildschirmrand. Rechtsbündig (absolute right-0) statt zentriert:
                        // die rechte Kante bleibt IMMER an der Knopf-Kante, egal wie breit
                        // das Fenster ist — nach links ist reichlich Platz, nach rechts nicht.
                        <div className="absolute right-0 top-full mt-2 w-[19rem] flex flex-col bg-slate-900/95 border-[3px] border-amber-950 rounded-2xl shadow-lg backdrop-blur-sm">
                            <div
                                ref={chatListeRef}
                                // 24 px Spielraum: exakt am Pixel unten zu stehen schafft
                                // niemand, und ohne Spielraum gälte der Chat schon nach
                                // einer Mausradrastung als „liest gerade nach".
                                onScroll={(e) => {
                                    const el = e.currentTarget;
                                    chatAmEndeRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                                }}
                                className="h-56 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5"
                                style={{ overscrollBehavior: "contain" }}
                            >
                                {chatVerlauf.length === 0 ? (
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        Noch nichts geschrieben. Was du hier schickst, lesen alle in dieser Welt.
                                    </p>
                                ) : (
                                    chatVerlauf.map((n) => {
                                        const eigen = String(n.twitchId) === String(authUser?.twitchId ?? "");
                                        return (
                                            // Feedback 01.09.: "Nachrichten größer anzeigen" — von text-[11px] auf
                                            // text-sm (14px), das war für ein Weltchat kaum lesbar klein.
                                            <div key={n.id} className="text-sm leading-snug break-words">
                                                <button
                                                    type="button"
                                                    onClick={() => besucheSpieler({
                                                        name: n.from, slotIndex: n.slotIndex, selbst: eigen,
                                                    })}
                                                    title={`Zum Grundstück von ${n.from}`}
                                                    className={`font-semibold transition-colors hover:underline ${
                                                        eigen ? "text-violet-300" : "text-slate-200 hover:text-white"
                                                    }`}
                                                >
                                                    {n.from}
                                                </button>
                                                <span className="text-slate-600">: </span>
                                                {/* Eigene Textfarbe (Feedback 01.09.) — kommt vom Server, geprüft
                                                    gegen CHAT_FARBEN dort. Ohne Farbe (Standard oder eine vom Server
                                                    verworfene) bleibt die bisherige feste Klasse. */}
                                                <span
                                                    className={n.color ? "" : "text-slate-300"}
                                                    style={n.color ? { color: n.color } : undefined}
                                                >
                                                    {n.text}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="relative border-t border-slate-800">
                                {/* Farbwahl (Feedback 01.09.) — feste Palette, siehe CHAT_FARBEN oben.
                                    Öffnet nach oben: die Leiste steht am unteren Rand des Fensters. */}
                                {istFarbwahlOffen && (
                                    <div className="absolute bottom-full left-1.5 z-10 mb-2 flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-lg">
                                        <button
                                            type="button"
                                            title="Standard"
                                            onClick={() => { setChatFarbe(null); setFarbwahlOffen(false); }}
                                            className={`h-5 w-5 shrink-0 rounded-md border-2 bg-slate-700 transition-colors ${
                                                !chatFarbe ? "border-white" : "border-transparent hover:border-slate-500"
                                            }`}
                                        />
                                        {CHAT_FARBEN.map((f) => (
                                            <button
                                                key={f.id}
                                                type="button"
                                                title={f.id}
                                                onClick={() => { setChatFarbe(f.id); setFarbwahlOffen(false); }}
                                                className={`h-5 w-5 shrink-0 rounded-md border-2 transition-colors ${
                                                    chatFarbe === f.id ? "border-white" : "border-transparent hover:border-slate-500"
                                                }`}
                                                style={{ background: f.hex }}
                                            />
                                        ))}
                                    </div>
                                )}
                                {/* Emoji-Feld (Feedback 01.09.) — kuratierte Auswahl, siehe CHAT_EMOJIS
                                    oben. Bleibt nach einer Auswahl offen, falls mehrere folgen sollen. */}
                                {istEmojiWahlOffen && (
                                    <div className="absolute bottom-full left-1.5 z-10 mb-2 grid w-[15.5rem] grid-cols-7 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-lg">
                                        {CHAT_EMOJIS.map((e) => (
                                            <button
                                                key={e}
                                                type="button"
                                                onClick={() => setChatEingabe((prev) => `${prev}${e}`.slice(0, CHAT_MAX_LEN))}
                                                className="flex h-7 w-7 items-center justify-center rounded-md text-base hover:bg-slate-800"
                                            >
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <form
                                    onSubmit={(e) => { e.preventDefault(); chatAbschicken(); }}
                                    className="flex items-center gap-1.5 p-1.5"
                                >
                                    <button
                                        type="button"
                                        title="Textfarbe"
                                        onClick={() => { setFarbwahlOffen((o) => !o); setEmojiWahlOffen(false); }}
                                        className="shrink-0 flex h-[26px] w-[26px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 transition-colors hover:border-slate-500"
                                    >
                                        <span
                                            className="h-3.5 w-3.5 rounded-sm"
                                            style={{ background: CHAT_FARBEN.find((f) => f.id === chatFarbe)?.hex || "#64748b" }}
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        title="Emoji"
                                        onClick={() => { setEmojiWahlOffen((o) => !o); setFarbwahlOffen(false); }}
                                        className="shrink-0 flex h-[26px] w-[26px] items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                                    >
                                        <Smile size={14} />
                                    </button>
                                    <input
                                        value={chatEingabe}
                                        onChange={(e) => setChatEingabe(e.target.value)}
                                        maxLength={CHAT_MAX_LEN}
                                        placeholder={lobbyConnected ? "Nachricht" : "Nicht verbunden"}
                                        disabled={!lobbyConnected}
                                        className="flex-1 min-w-0 px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-[13px] text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none disabled:text-slate-600"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!lobbyConnected || !chatEingabe.trim()}
                                        aria-label="Nachricht schicken"
                                        className="shrink-0 flex h-[26px] w-[26px] items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600"
                                    >
                                        <Send size={13} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>

                {/* Weltzustand — unten in der Spalte (Feedback 30.08.: "Zeit unter den
                    Chat"). Weniger dringend als Post/Tiere/Chat, war vorher aber ganz
                    oben und damit das ERSTE, was ins Auge fiel. */}
                <div className="flex items-stretch gap-2">
                    {/* Uhrzeit der Welt — immer sichtbar, unabhängig vom Wetter. Ein
                        Spieltag dauert 24 echte Minuten, eine Minute ist also eine
                        Stunde — daran lässt sich ablesen, wie lange es noch hell bleibt
                        (siehe engine/Tageszeit.js).
                        Cartoon-Überarbeitung 30.08. ("Timer soll auch einen coolen
                        Cartoon-Look bekommen"): eigene Himmelsfarbe statt des
                        generischen Holz-Knopfes — Blau am Tag, Indigo bei Nacht — mit
                        einem kleinen runden Sonne-/Mond-Medaillon, damit die Uhr als
                        EIGENES Element auffällt statt zwischen den Navigations-Knöpfen
                        unterzugehen. */}
                    <div className={`flex h-10 items-center gap-2 pl-1 pr-3 rounded-2xl border-[3px] transition-colors ${
                        tagesInfo.nacht
                            ? "bg-gradient-to-b from-indigo-800 to-indigo-900 border-indigo-950 shadow-[0_4px_0_0_#1e1b4b]"
                            : "bg-gradient-to-b from-sky-500 to-sky-600 border-sky-950 shadow-[0_4px_0_0_#0c4a6e]"
                    } text-xs font-bold tabular-nums text-white`}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            tagesInfo.nacht ? "bg-indigo-200 text-indigo-900" : "bg-yellow-300 text-amber-800"
                        }`}>
                            {tagesInfo.nacht ? <WeatherIcon.moonlight size={15} /> : <WeatherIcon.sun size={15} />}
                        </span>
                        {tagesInfo.uhrzeit}
                    </div>

                    {/* Wetter — eigene Kachel, getrennt von der Uhrzeit, und nur wenn
                        wirklich eins aktiv ist. „Sonne" ist der neutrale Grundzustand
                        ohne Effekt; seit es Tag und Nacht gibt, wäre sie dort auch
                        nachts zu sehen und suggerierte ein Wetter, das keins ist. */}
                    {weatherState?.type && weatherState.type !== "sun" && (
                        <div className={`flex h-10 items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300`}>
                            {React.createElement(weatherIcon(weatherState.type), { size: 15, className: "shrink-0 text-sky-400" })}
                            <span className="truncate">{weatherState.label}</span>
                        </div>
                    )}
                </div>

                {/* Weltcode zum Weitergeben — nur bei privaten Welten sinnvoll */}
                {lobbyConnected && !isPublicWorld && activeCode && (
                    <button
                        type="button"
                        title="Code kopieren"
                        onClick={() => {
                            navigator.clipboard?.writeText(activeCode)
                                .then(() => notify("Weltcode kopiert."))
                                .catch(() => notify(`Weltcode: ${activeCode}`));
                        }}
                        className={`flex h-10 w-[12.5rem] items-center gap-2 ${HUD_SURFACE} px-3 text-xs font-medium text-slate-300 transition-colors hover:text-white`}
                    >
                        <HudIcon.worldCode size={15} className="shrink-0" />
                        <span className="tracking-[0.2em] font-semibold">{activeCode}</span>
                    </button>
                )}
            </div>

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
                <div
                    // 1. ANPASSUNG: 'fixed' zentriert das Modal immer perfekt am Mauszeiger, egal was der Container macht!
                    className="fixed z-[100] pointer-events-none bg-slate-900/95 border border-slate-700 rounded-2xl px-3 py-2 text-xs text-slate-200 shadow-xl min-w-[150px]"
                    style={getItemTooltipStyle(itemHoverTooltip.x, itemHoverTooltip.y)}
                >
                    <div className="font-medium text-white">{itemHoverTooltip.item.name || "Gegenstand"}</div>
                    <RarityLabel rarity={itemHoverTooltip.item.rarity} />
                    {itemHoverTooltip.item._type === "seed" && (
                        <>
                            <div className="text-slate-400 text-[10px] mt-1">Auf ein freies Ackerfeld klicken zum Pflanzen</div>
                            {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice) && (
                                <div className="text-amber-400 font-semibold mt-0.5 tabular-nums">
                                    {(itemHoverTooltip.item.shopPrice || itemHoverTooltip.item.sellPrice || 0).toLocaleString("de-DE")} Gold
                                </div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "plant" && (
                        <>
                            <div className="text-amber-400 font-semibold mt-1 tabular-nums">
                                {(itemHoverTooltip.item.sellValue || 0).toLocaleString("de-DE")} Gold
                            </div>
                            {itemHoverTooltip.item.size !== undefined && (
                                <div className="text-slate-400 text-[11px]">Größe {itemHoverTooltip.item.size} / 50</div>
                            )}
                            {getSpecialLabel(itemHoverTooltip.item.specialData) && (
                                <div className="text-fuchsia-400 text-[11px]">{getSpecialLabel(itemHoverTooltip.item.specialData)}</div>
                            )}
                            {/* Alle Wetter des Stücks; der Aufschlag ist ihr Produkt. */}
                            {wetterListe(itemHoverTooltip.item).length > 0 && (
                                <div className="text-sky-400 text-[11px]">
                                    {wetterListe(itemHoverTooltip.item)
                                        .map((e) => getStatusEffectLabel(e) || e).join(" · ")}
                                    {" · +"}
                                    {Math.round((wetterBoost(itemHoverTooltip.item) - 1) * 100)}
                                    {" % Verkauf"}
                                </div>
                            )}
                        </>
                    )}
                    {itemHoverTooltip.item._type === "pet" && itemHoverTooltip.item.ability && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800">
                            <div className="text-slate-200 text-[11px] font-medium">
                                {/* Alle drei Fähigkeiten aus der gemeinsamen Tabelle — der
                                    Zweig kannte den Erntehelfer gar nicht und hat ihn als
                                    „Samenfinder" beschriftet. */}
                                {PET_ABILITY_LABELS[itemHoverTooltip.item.ability.type] || "Fähigkeit"}
                                {" · Stufe "}{itemHoverTooltip.item.ability.level}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                                Platzieren und anklicken für Details.
                            </div>
                        </div>
                    )}
                </div>
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
                <GardenModal
                    title="Profil"
                    onClose={() => setProfilOffen(false)}
                    width="max-w-md"
                >
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950">
                                <img
                                    src={playerAppearance.skin}
                                    alt=""
                                    draggable={false}
                                    className="h-16 w-16 object-contain"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-lg font-semibold text-white truncate">
                                    {localPlayerNameRef.current || "Du"}
                                </div>
                                <div className="text-sm text-slate-400">Level {skillStand?.level || 1}</div>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                                <span>XP</span>
                                <span className="tabular-nums">
                                    {(skillStand?.xpFuersNaechste || 0) > 0
                                        ? `${(skillStand?.xpDiesesLevel || 0).toLocaleString("de-DE")} / ${skillStand.xpFuersNaechste.toLocaleString("de-DE")}`
                                        : "Höchstlevel"}
                                </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-xl bg-slate-800">
                                <div
                                    className="h-full bg-violet-500"
                                    style={{
                                        width: `${Math.min(100, Math.max(0,
                                            (skillStand?.xpFuersNaechste || 0) > 0
                                                ? ((skillStand.xpDiesesLevel || 0) / skillStand.xpFuersNaechste) * 100
                                                : 100)) }%`,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <HudIcon.gold size={13} className="shrink-0" /> Gold
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-amber-400">{formatGold(gold)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <HudIcon.goldLifetime size={13} className="shrink-0" /> Gesamt gesammelt
                                </span>
                                <span className="text-sm font-medium tabular-nums text-amber-400/70">{formatGold(goldGesamt)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => { setProfilOffen(false); setSkillsOffen(true); }}
                                className="relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-slate-800 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/70 hover:text-white"
                            >
                                <HudIcon.level size={18} className="shrink-0" />
                                <span className="text-xs font-medium">Fähigkeiten</span>
                                {/* Übernimmt den Hinweis vom entfernten "Level N"-Knopf unten
                                    rechts — ein offener Punkt soll nicht wochenlang unbemerkt
                                    herumliegen. */}
                                {(skillStand?.punkteOffen || 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] rounded-xl bg-violet-600 px-1 text-[9px] font-semibold tabular-nums text-white">
                                        {skillStand.punkteOffen}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setProfilOffen(false); setWardrobeOpen(true); }}
                                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-slate-800 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/70 hover:text-white"
                            >
                                <HudIcon.wardrobe size={18} className="shrink-0" />
                                <span className="text-xs font-medium">Umkleide</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setProfilOffen(false); setLogbuchOpen(true); }}
                                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-slate-800 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/70 hover:text-white"
                            >
                                <HudIcon.logbuch size={18} className="shrink-0" />
                                <span className="text-xs font-medium tabular-nums">
                                    Logbuch {Object.keys(logbuch).length}/{SEED_CATALOGUE.length}
                                </span>
                            </button>
                        </div>
                    </div>
                </GardenModal>
            )}

            {/* v2 (Feedback 29.08.): Schuppen-Auswahl — Kiste, Vitrine und Mülleimer
                stehen jetzt in EINEM Gebäude auf dem Feld; die E-Taste öffnet hier
                erst die Auswahl, statt direkt eins der drei Fenster. */}
            {isShedOpen && (
                <GardenModal
                    title="Schuppen"
                    subtitle="Was möchtest du öffnen?"
                    onClose={() => setShedOpen(false)}
                    width="max-w-sm"
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
            )}

            {isTrashOpen && (
                <GardenModal
                    title="Mülleimer"
                    subtitle="Endgültig wegwerfen — das lässt sich nicht rückgängig machen"
                    onClose={() => setTrashOpen(false)}
                    onBack={() => { setTrashOpen(false); setShedOpen(true); }}
                    width="max-w-lg"
                >
                    {/* Kein eigener "Umstellen"-Knopf hier: der Mülleimer wohnt seit dem
                        Schuppen-Umbau (Feedback 29.08.) im selben Gebäude wie Kiste und
                        Vitrine — verschoben wird der Schuppen als Ganzes, entweder aus
                        dem Schuppen-Menü heraus oder aus der Kiste/Vitrine. */}
                    {/* Samen: gleiche Sorten stehen als eine Zeile mit Anzahl da. Wer 40
                        Löwenzahn loswerden will, klickt sonst 40-mal. */}
                    <div className="mb-4">
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Samen</div>
                        {inventory.length === 0 ? (
                            <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-2xl border border-slate-800 bg-slate-950">
                                Keine Samen im Rucksack.
                            </p>
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
                                        <div
                                            key={g.key}
                                            className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 flex items-center gap-3"
                                        >
                                            <ItemIcon item={g.seed} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-white truncate">
                                                    {g.seed.name}
                                                    {g.ids.length > 1 && (
                                                        <span className="text-slate-500 tabular-nums font-normal"> × {g.ids.length}</span>
                                                    )}
                                                </div>
                                                <RarityLabel rarity={g.seed.rarity} />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => wirfWeg([g.ids[0]], `${g.seed.name} weggeworfen.`)}
                                                className="shrink-0 px-2.5 py-2 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                                            >
                                                Einen
                                            </button>
                                            {g.ids.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => wirfWeg(g.ids, `${g.ids.length}× ${g.seed.name} weggeworfen.`)}
                                                    className="shrink-0 px-3 py-2 rounded-2xl border border-rose-800 text-rose-300 hover:text-white hover:bg-rose-900/40 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                                                >
                                                    <HudIcon.remove size={13} /> Alle {g.ids.length}
                                                </button>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>

                    <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Deko</div>
                    {decoInventory.length === 0 ? (
                        <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-2xl border border-slate-800 bg-slate-950">
                            Keine Deko im Inventar.
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {decoInventory.map((deco) => (
                                <div
                                    key={deco.instanceId || deco.id}
                                    className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 flex items-center gap-3"
                                >
                                    <ItemIcon item={deco} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{deco.name}</div>
                                        <RarityLabel rarity={deco.rarity} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const ziel = deco.instanceId || deco.id;
                                            setDecoInventory((prev) => prev.filter((d) => (d.instanceId || d.id) !== ziel));
                                            if ((selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === ziel) {
                                                setSelectedDecoToPlace(null);
                                            }
                                            notify(`${deco.name} weggeworfen.`);
                                            debouncedSave();
                                        }}
                                        className="shrink-0 px-3 py-2 rounded-2xl border border-rose-800 text-rose-300 hover:text-white hover:bg-rose-900/40 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                                    >
                                        <HudIcon.remove size={13} /> Wegwerfen
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </GardenModal>
            )}

            {ablageOffen && (
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
            )}

            {fremdeVitrine && (
                <FremdeVitrineModal
                    owner={fremdeVitrine.owner}
                    items={fremdeVitrine.items}
                    onClose={() => setFremdeVitrine(null)}
                />
            )}

            {isLogbuchOpen && (
                <LogbuchModal
                    logbuch={logbuch}
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
                <div className={`absolute top-16 left-1/2 -translate-x-1/2 z-40 ${HUD_SURFACE} px-4 py-3 flex flex-col items-center gap-2 max-w-sm text-center`}>
                    <span className="text-xs text-amber-300">
                        Diese Welt ist voll — du kannst zusehen, aber nicht farmen.
                    </span>
                    <button
                        type="button"
                        onClick={async () => { await flushFarmStateToServer(); setShowLobbyScreen(true); }}
                        className="px-3 py-1.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                    >
                        Zurück zur Weltauswahl
                    </button>
                </div>
            )}

            {/* v2, "Look & Overlays": vorher eine Hover-Dropdown-Karte unter dem
                HUD-Knopf — jedes andere Fenster im Spiel öffnet über einen Klick,
                das hier tat es nicht. Jetzt ein eigenes Overlay, per Klick auf
                "Tiere". Inhaltlich unverändert (Aktive-Boni-Zusammenfassung +
                platzierte Tiere), nur als Karten statt als schmale Textliste —
                das Rarität-Farbband je Karte macht die Übersicht auf einen Blick
                bunter, ohne dass irgendwo eine neue Farbe erfunden werden musste. */}
            {isPetOverlayOpen && (() => {
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
                        width="max-w-lg"
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
                            <div className="text-slate-500 text-sm text-center py-8">
                                Noch kein Tier platziert. Im Inkubator ausbrüten und aufs Grundstück stellen.
                            </div>
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
            })()}

            {inspectedPet && (
                <PetDetailModal
                    pet={inspectedPet}
                    zuechter={skillWirkung("zuechter")}
                    onClose={() => setInspectedPet(null)}
                    onStow={handleStowInspectedPet}
                    onSell={handleSellInspectedPet}
                    onRename={handleRenamePet}
                />
            )}

            {/* ── Deko-Leiste des Editors ─────────────────────────────────────
                Der ganze Deko-Bestand auf einen Blick, direkt über der Schnellleiste.
                Vorher führte der Weg zu jedem Stück durch das Inventar-Fenster —
                beim Einrichten öffnet und schliesst man das sonst dutzendfach. */}
            {editorAktiv && (
                <div className={`absolute bottom-24 left-1/2 -translate-x-1/2 max-w-[min(56rem,92vw)] ${HUD_SURFACE} p-2`}>
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                        <HudIcon.editor size={12} className="shrink-0" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-100">
                            Einrichten — Klick wählt, Klick aufs Grundstück setzt ab,
                            {" "}<kbd className="bg-slate-800 border border-slate-700 px-1 rounded-xl text-slate-200">R</kbd> spiegelt,
                            {" "}Klick auf gesetzte Deko packt sie ein
                        </span>
                        <span className="ml-auto flex items-center gap-2 text-[10px] font-semibold text-amber-100/90 tabular-nums">
                            {decoInventory.length} vorrätig · {decoPlacements.filter((d) => d.slotIndex === mySlotIndex).length} aufgestellt
                            {(() => {
                                // Feedback 30.08.: "Lichter-Limit im Editor anzeigen" — LICHT_MAX
                                // (Renderer.js) begrenzt, wie viele Laternen gleichzeitig LEUCHTEN
                                // (die dem Spieler nächsten gewinnen, siehe _sichtbareLichter);
                                // zusätzliche bleiben stehen, bleiben aber dunkel. Ohne diese Zahl
                                // wirkte eine ausgegangene Laterne wie ein Fehler, nicht wie ein
                                // erwartetes Limit.
                                const eigeneLichter = decoPlacements
                                    .filter((d) => d.slotIndex === mySlotIndex && dekoLicht(d.decoId)).length;
                                if (eigeneLichter === 0) return null;
                                const amLimit = eigeneLichter >= LICHT_MAX;
                                return (
                                    <span
                                        title={amLimit
                                            ? "Nur die dir nächsten Laternen leuchten gleichzeitig — weiter entfernte bleiben dunkel."
                                            : "So viele deiner Laternen können gleichzeitig leuchten."}
                                        className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                                            amLimit ? "border-amber-400/60 text-amber-300" : "border-amber-100/20 text-amber-100/70"
                                        }`}
                                    >
                                        <WeatherIcon.moonlight size={11} />
                                        {eigeneLichter}/{LICHT_MAX} Lichter
                                    </span>
                                );
                            })()}
                        </span>
                    </div>
                    {decoInventory.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-amber-100/80">
                            Keine Deko im Vorrat — im Deko-Shop gibt es Nachschub.
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                            {decoInventory.map((deko) => {
                                const key = deko.instanceId || deko.id;
                                const gewaehlt = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id) === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        title={deko.name}
                                        onClick={() => {
                                            setSelectedDecoToPlace(gewaehlt ? null : { ...deko, _type: "deco" });
                                            setSelectedTool(null);
                                            setSelectedSeed(null);
                                            setSelectedCarryItem(null);
                                            setSelectedPetToPlace(null);
                                        }}
                                        className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors ${
                                            gewaehlt
                                                ? "border-violet-500 bg-violet-600/20"
                                                : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                                        }`}
                                    >
                                        <ItemIcon item={deko} className="w-9 h-9" emojiClassName="text-2xl" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Hotbar ──────────────────────────────────────────────────── */}
            <div className={`absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 p-2 ${HUD_SURFACE}`}>
                {Array(9).fill(null).map((_, i) => {
                    const item = hotbarItems[i];
                    
                    // instanceId always takes priority over generic id to avoid false multi-matches
                    const selectedSeedKey = selectedSeed?.instanceId ? `seed:${selectedSeed.instanceId}` : null;
                    const selectedCarryKey = (selectedCarryItem?.instanceId || selectedCarryItem?.id)
                        ? `carry:${selectedCarryItem.instanceId || selectedCarryItem.id}`
                        : null;
                    const selectedPetKey = (selectedPetToPlace?.instanceId || selectedPetToPlace?.id)
                        ? `pet:${selectedPetToPlace.instanceId || selectedPetToPlace.id}`
                        : null;
                    const selectedDecoKey = (selectedDecoToPlace?.instanceId || selectedDecoToPlace?.id)
                        ? `deco:${selectedDecoToPlace.instanceId || selectedDecoToPlace.id}`
                        : null;

                    const itemSeedKey = item?._type === "seed" && item?.instanceId ? `seed:${item.instanceId}` : null;
                    const itemCarryKey = item?._type === "plant" && (item?.instanceId || item?.id)
                        ? `carry:${item.instanceId || item.id}`
                        : null;
                    const itemPetKey = item?._type === "pet" && (item?.instanceId || item?.id)
                        ? `pet:${item.instanceId || item.id}`
                        : null;
                    const itemDecoKey = item?._type === "deco" && (item?.instanceId || item?.id)
                        ? `deco:${item.instanceId || item.id}`
                        : null;

                    const isHeldItem = Boolean(
                        (selectedSeedKey && itemSeedKey && selectedSeedKey === itemSeedKey)
                        || (selectedCarryKey && itemCarryKey && selectedCarryKey === itemCarryKey)
                        || (selectedPetKey && itemPetKey && selectedPetKey === itemPetKey)
                        || (selectedDecoKey && itemDecoKey && selectedDecoKey === itemDecoKey)
                    );

                    const itemSpecial = itemSpecialName(item);
                    const specialRingClass = itemSpecial === "Golden"
                        ? "border-amber-500"
                        : itemSpecial === "Rainbow"
                        ? "border-fuchsia-500"
                        : "";

                    return (
                        <div key={i}
                            onClick={(e) => {
                                e.stopPropagation();

                                // Eindeutige ID des angeklickten Items herausfinden
                                const clickedId = item?.instanceId || item?.id;

                                // 1. Prüfen, ob genau DIESE ID gerade in der Hand ist
                                const isAlreadySelected = 
                                    (selectedSeed && (selectedSeed.instanceId === clickedId || selectedSeed.id === clickedId)) || 
                                    (selectedCarryItem && (selectedCarryItem.instanceId === clickedId || selectedCarryItem.id === clickedId)) || 
                                    (selectedPetToPlace && (selectedPetToPlace.instanceId === clickedId || selectedPetToPlace.id === clickedId)) || 
                                    (selectedDecoToPlace && (selectedDecoToPlace.instanceId === clickedId || selectedDecoToPlace.id === clickedId));

                                if (isAlreadySelected) {
                                    // 2. Wenn es schon in der Hand ist -> Abwählen (Einstecken)
                                    setSelectedSeed(null);
                                    setSelectedCarryItem(null);
                                    setSelectedPetToPlace(null);
                                    setSelectedDecoToPlace(null);
                                } else {
                                    // 3. Wenn nicht -> Erstmal die Hände komplett frei machen
                                    setSelectedSeed(null); 
                                    setSelectedCarryItem(null); 
                                    setSelectedPetToPlace(null); 
                                    setSelectedDecoToPlace(null);
                                    setSelectedTool(null); 
                                    setMovingPlantSource(null);

                                    // 4. Das richtige Item in die Hand nehmen
                                    if (item?._type === "seed") {
                                        setSelectedSeed(item);
                                    } else if (item?._type === "pet") {
                                        setSelectedPetToPlace(item);
                                    } else if (item?._type === "deco") {
                                        setSelectedDecoToPlace(item);
                                    } else {
                                        // Fallback für alles andere (Pflanzen, Früchte, etc.)
                                        setSelectedCarryItem(item);
                                    }
                                }
                            }}
                            
                            onMouseEnter={(e) => {
                                if (!hatTooltip(item)) return;
                                // 1. ANPASSUNG: Direkt e.clientX nutzen (ohne Abzug), passend zum 'fixed' Tooltip
                                setItemHoverTooltip({ item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={(e) => {
                                if (!hatTooltip(item)) return;
                                setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setItemHoverTooltip(null)}
                            className={`relative w-[50px] h-[50px] bg-slate-800/70 rounded-2xl border flex items-center justify-center transition-colors cursor-pointer group
                            ${item ? "border-slate-700 hover:border-slate-500" : "border-slate-800"}
                            ${isHeldItem ? "border-violet-500 bg-slate-800" : specialRingClass}`}>
                            <span className="absolute top-0.5 left-1 text-[9px] font-medium text-slate-600 tabular-nums">{i + 1}</span>
                            {item && (
                                <SpecialItemIcon item={item} special={itemSpecial} className="w-8 h-8" emojiClassName="text-2xl" />
                            )}
                            {isHeldItem && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-500" />
                            )}
                        </div>
                    );
                })}
            </div>
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
            <div className="absolute top-5 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2">
                {[
                    { label: "Verkauf-Areal", icon: HudIcon.sellArea, action: teleportToMarketArea },
                    { label: "Shop-Areal", icon: HudIcon.shopArea, action: teleportToShopArea },
                    { label: "Meine Farm", icon: HudIcon.farm, action: teleportToMyFarm },
                ].map(({ label, icon: Icon, action }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={(e) => { e.currentTarget.blur(); action(); }}
                        className={`pl-1.5 pr-4 py-1.5 ${HUD_SURFACE} text-slate-200 hover:text-white transition-colors flex items-center gap-2.5 text-sm font-medium`}
                    >
                        {/* Feedback 30.08.: "man sieht die Icons kaum" — die Bilder sind
                            kleine, bunte Szenen (Marktstand, Hoftor), auf dem unruhigen
                            Holzton bei 18px kaum zu erkennen. Ein cremefarbenes Schild
                            dahinter UND ein größeres Bild lösen beides zugleich. */}
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                            <Icon size={26} />
                        </span>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Bottom-Left: Editor (Feedback 29.08.) ───────────────────────── */}
            <div className="absolute bottom-5 left-5 flex flex-col gap-2">
                {/* Einrichten: Raster einblenden, Deko setzen und einpacken, Gebäude
                    umstellen. Ausserhalb passiert davon nichts — im normalen Spiel
                    hat ein Klick daneben sonst dauernd Deko eingesammelt. */}
                <button
                    type="button"
                    onClick={() => {
                        if (editorAktiv) {
                            setSelectedDecoToPlace(null);
                            setVerschiebtGebaeude(null);
                            // Bisher hing das Sichern von Deko-Änderungen komplett am
                            // allgemeinen 5-Sekunden-Autosave — der Timer läuft bei
                            // JEDER Aktion neu an, eine ganze Dekorier-Session konnte
                            // also lange ungesichert bleiben. Ein Besucher sah in der
                            // Zwischenzeit den alten Stand (fehlende/verschobene Deko).
                            // Jetzt wird beim Verlassen des Editors sofort gesichert,
                            // zusätzlich zum weiterlaufenden Autosave. (Kein Aufruf
                            // innerhalb von setEditorAktiv selbst — React darf Updater-
                            // Funktionen mehrfach ausführen, ein PUT gehört da nicht rein.)
                            flushFarmStateToServerRef.current?.();
                        }
                        setEditorAktiv((an) => !an);
                    }}
                    className={`flex h-10 items-center gap-2 ${HUD_SURFACE} pl-1.5 pr-3 text-xs font-medium transition-colors ${
                        editorAktiv ? "text-violet-300" : "text-slate-300 hover:text-white"
                    }`}
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50">
                        <HudIcon.editor size={17} />
                    </span>
                    <span className="hidden sm:inline">{editorAktiv ? "Editor beenden" : "Editor"}</span>
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: SHOP
            ═══════════════════════════════════════════════════════════════ */}
            {activeShop === "seed" && (
                <GardenModal
                    title="Samen-Shop"
                    onClose={() => setActiveShop(null)}
                    headerRight={
                        <>
                            <TimerTag title="Nächste Rotation" label={formatCountdown(shopMins, shopSecs)} />
                            <GoldTag gold={gold} />
                        </>
                    }
                >
                    <TabBar
                        active={shopFilter}
                        onSelect={setShopFilter}
                        tabs={[
                            { key: "available", label: "Im Angebot", count: shopRotation?.seeds.filter(s => s.active).length ?? 0 },
                            { key: "all", label: "Gesamter Katalog", count: shopRotation?.seeds.length ?? 0 },
                        ]}
                    />

                    <div className="space-y-1.5">
                        {visibleShopSeeds.map(seed => (
                            <ShopSeedCard
                                key={seed.seedId}
                                seed={seed}
                                stock={ladenBestand[seed.seedId] ?? (seed.active ? (seed.stock ?? 0) : 0)}
                                canAfford={gold >= seed.shopPrice}
                                rucksackVoll={rucksackVoll}
                                xpJeSorte={xpJeSorte}
                                onBuy={handleBuySeed}
                                onBuyAll={handleBuySeedAll}
                            />
                        ))}
                        {(!shopRotation?.seeds || shopRotation.seeds.length === 0) && (
                            <div className="text-slate-500 text-sm text-center py-8">Shop wird geladen…</div>
                        )}
                    </div>
                </GardenModal>
            )}
            {activeShop === "tool" && (
                <GardenModal
                    title="Werkzeug-Shop"
                    onClose={() => setActiveShop(null)}
                    headerRight={
                        <>
                            <TimerTag title="Neue Lieferung" label={formatCountdown(toolMins, toolSecs)} />
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
                                <div
                                    key={tool.id}
                                    className={`p-3 rounded-2xl border bg-slate-900/50 flex items-center gap-3 transition-colors ${
                                        canBuy ? "border-slate-800 hover:border-violet-500" : "border-slate-800"
                                    }`}
                                >
                                    <ItemIcon item={{ ...tool, image: getToolImage(tool.id) }} className="w-9 h-9 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white">{tool.name}</div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">{description}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums">{formatGold(price)}</div>
                                        {hasRotationStock && (
                                            <div className="text-[11px] text-slate-500">{singleStock ?? 0} auf Lager</div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {/* Buy-All (v2, Punkt 12): nur bei Werkzeugen, die man
                                            sinnvoll mehrfach kauft — bei Schaufel/Kiste/Vitrine
                                            wäre "Alle" dasselbe wie "Kaufen", nur verwirrender. */}
                                        {canBuy && BUY_ALL_WERKZEUGE.has(tool.id) && (
                                            <button
                                                type="button"
                                                onClick={() => handleBuyToolAll(tool)}
                                                title="So viele kaufen, wie Vorrat/Deckel und Gold hergeben"
                                                className="px-2.5 py-2 rounded-2xl text-xs font-semibold border border-slate-700 text-slate-300 hover:border-violet-500 hover:text-violet-200 transition-colors"
                                            >
                                                Alle
                                            </button>
                                        )}
                                        <PrimaryButton onClick={() => handleBuyTool(tool)} disabled={!canBuy}>
                                            {hackenGedeckt ? "Gedeckt" : isPermanentOwned ? "Im Besitz" : "Kaufen"}
                                        </PrimaryButton>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GardenModal>
            )}
            {activeShop === "egg" && (
                <GardenModal
                    title="Eier-Shop"
                    onClose={() => setActiveShop(null)}
                    headerRight={
                        <>
                            <TimerTag title="Neues Angebot" label={formatCountdown(eggMins, eggSecs)} />
                            <GoldTag gold={gold} />
                        </>
                    }
                >
                    <div className="space-y-1.5">
                        {EGG_SHOP_CATALOGUE.map(egg => {
                            const stock = eggShopStock[egg.id] ?? 0;
                            const available = stock > 0;
                            return (
                                <div
                                    key={egg.id}
                                    className={`p-3 rounded-2xl border flex items-center gap-3 ${
                                        available
                                            ? `border-slate-700 bg-slate-900/60 ${gold >= egg.price && stock > 0 ? "hover:border-violet-500" : ""}`
                                            : "border-slate-800 bg-slate-900/40 opacity-50"
                                    }`}
                                >
                                    <ItemIcon item={egg} className="w-10 h-10 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">{egg.name}</span>
                                            <RarityLabel rarity={egg.rarity} />
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                            {egg.hatchTable.map(h => `${h.type} ${h.chance} %`).join(" · ")}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums">{formatGold(egg.price)}</div>
                                        <div className="text-[11px] text-slate-500">{stock} auf Lager</div>
                                    </div>
                                    <PrimaryButton
                                        onClick={() => handleBuyEgg(egg)}
                                        disabled={gold < egg.price || stock <= 0}
                                        className="shrink-0"
                                    >
                                        Kaufen
                                    </PrimaryButton>
                                </div>
                            );
                        })}
                        {Object.values(eggShopStock).every(v => (v || 0) <= 0) && (
                            <div className="text-slate-500 text-sm text-center py-8">Diese Rotation führt keine Eier.</div>
                        )}
                    </div>
                </GardenModal>
            )}
            {activeShop === "deco" && (() => {
                const kategorie = DEKO_KATEGORIEN.find((k) => k.id === dekoKategorie) || DEKO_KATEGORIEN[0];
                const sichtbar = dekoNachKategorie(kategorie.id);
                return (
                <GardenModal
                    title="Deko-Shop"
                    subtitle={kategorie.hinweis
                        ? `${kategorie.name} — ${kategorie.hinweis}`
                        : "Platzierbar auf den Grasflächen deiner Farm — beim Setzen mit R spiegelbar"}
                    onClose={() => setActiveShop(null)}
                    headerRight={<GoldTag gold={gold} />}
                    /* Feste Höhe UND feststehende Reiter. Vorher wuchs das Fenster mit
                       seinem Inhalt und sass dabei mittig — jeder Kategoriewechsel
                       verschob es also auf dem Bildschirm, und die Reiter sprangen
                       unter dem Mauszeiger weg. Dazu scrollten sie beim Blättern aus
                       dem Bild, sodass man zum Wechseln erst wieder hochfahren musste. */
                    feste
                    toolbar={
                        <div className="flex flex-wrap gap-1">
                            {DEKO_KATEGORIEN.map((k) => (
                                <button
                                    key={k.id}
                                    type="button"
                                    onClick={(e) => { e.currentTarget.blur(); setDekoKategorie(k.id); }}
                                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        k.id === kategorie.id
                                            ? "bg-slate-800 text-white"
                                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                    }`}
                                >
                                    {k.name}
                                </button>
                            ))}
                        </div>
                    }
                >
                    <div className="grid grid-cols-2 gap-1.5">
                        {sichtbar.map((deco) => {
                            const canBuy = gold >= deco.price;
                            return (
                                <div
                                    key={deco.id}
                                    className={`p-3 rounded-2xl border bg-slate-900/50 flex items-center gap-3 transition-colors ${
                                        canBuy ? "border-slate-800 hover:border-violet-500" : "border-slate-800"
                                    }`}
                                >
                                    <ItemIcon item={deco} className="w-10 h-10 shrink-0" emojiClassName="text-2xl" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{deco.name}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <RarityLabel rarity={deco.rarity} />
                                            <span className="text-[11px] text-slate-500">{deco.width}×{deco.height}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-amber-400 tabular-nums mb-1">{formatGold(deco.price)}</div>
                                        <div className="flex items-center gap-1 justify-end">
                                            <PrimaryButton onClick={() => handleBuyDeco(deco)} disabled={!canBuy}>
                                                Kaufen
                                            </PrimaryButton>
                                            {/* Zehnerkauf nur bei Belägen: von einer Statue will
                                                niemand zehn, von Steinplatten fast immer. */}
                                            {deco.ebene === "boden" && (
                                                <button
                                                    type="button"
                                                    title={`10× ${deco.name} für ${formatGold(deco.price * 10)}`}
                                                    onClick={(e) => { e.currentTarget.blur(); handleBuyDeco(deco, 10); }}
                                                    disabled={gold < deco.price * 10}
                                                    className="rounded-xl border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:border-slate-800 disabled:text-slate-600"
                                                >
                                                    ×10
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GardenModal>
                );
            })()}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL: UNIFIED INVENTORY
            ═══════════════════════════════════════════════════════════════ */}
            {isBackpackOpen && (() => {
                const toolItems = [
                    ...(toolInventory.pickaxeUses > 0 ? [{ id: "tool_pickaxe", name: "Spitzhacke", emoji: "⛏️", image: getToolImage("pickaxe"), rarity: "UNCOMMON", amount: toolInventory.pickaxeUses, _type: "tool" }] : []),
                    ...(toolInventory.hasShovel ? [{ id: "tool_shovel", name: "Schaufel", emoji: "🪓", image: getToolImage("shovel"), rarity: "COMMON", amount: "∞", _type: "tool" }] : []),
                    ...(toolInventory.plantPots > 0 ? [{ id: "tool_pots", name: "Plant Pot", emoji: "🪴", image: getToolImage("pot"), rarity: "COMMON", amount: toolInventory.plantPots, _type: "tool" }] : []),
                    ...(toolInventory.wateringCans > 0 ? [{ id: "tool_watering", name: "Gießkanne", emoji: "🪣", image: getToolImage("watering"), rarity: "COMMON", amount: toolInventory.wateringCans, _type: "tool" }] : []),
                ];
                const allItems = [
                    ...inventory.map(s => ({ ...withVisuals(s), _type: "seed" })),
                    ...harvestedItems.map(p => ({ ...withVisuals(p), _type: "plant" })),
                    ...eggInventory.map(e => ({ ...e, _type: "egg" })),
                    ...petInventory.map(p => ({ ...p, _type: "pet" })),
                    ...decoInventory.map(d => ({ ...d, _type: "deco" })),
                    ...toolItems,
                ];
                // Slot cap applies only to seeds + harvested plants (the expandable main inventory)
                const slottedItems = inventory.length + harvestedItems.length;
                const backpackFilters = ["all", "seed", "plant", "egg", "pet", "deco", "tool"];
                const filterLabels = { all: "Alle", seed: "Samen", plant: "Ernte", egg: "Eier", pet: "Tiere", deco: "Deko", tool: "Werkzeug" };
                const activeFilter = inventoryFilter || "all";
                const gefiltert = activeFilter === "all" ? allItems : allItems.filter(i => i._type === activeFilter);
                const displayed = sortiere(gefiltert, INVENTAR_SORTIERUNGEN, inventarSortierung);
                const fillRatio = inventoryMaxSlots > 0 ? slottedItems / inventoryMaxSlots : 0;
                // Was die Ernte im Rucksack einbringt — dieselbe Angabe wie in der
                // Kiste, damit man nicht erst zum Markt laufen muss, um es zu sehen.
                const lagerwert = harvestedItems.reduce((s, i) => s + (Number(i?.sellValue) || 0), 0);
                return (
                <GardenModal
                    title="Rucksack"
                    subtitle="Deko, Tiere und Werkzeug belegen keine Slots"
                    onClose={() => { setItemHoverTooltip(null); setBackpackOpen(false); }}
                    width="max-w-4xl"
                    headerRight={
                        <div className="flex items-center gap-3">
                            {lagerwert > 0 && (
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 tabular-nums whitespace-nowrap">
                                    <HudIcon.gold size={13} />
                                    {formatGold(lagerwert)}
                                </span>
                            )}
                            <div className="flex items-center gap-2 w-40">
                                <div className="flex-1 h-1.5 rounded-xl bg-slate-800 overflow-hidden">
                                    <div
                                        className={`h-full transition-[width] duration-300 ${
                                            fillRatio >= 1 ? "bg-rose-500" : fillRatio >= 0.75 ? "bg-amber-500" : "bg-emerald-500"
                                        }`}
                                        style={{ width: `${Math.min(100, fillRatio * 100)}%` }}
                                    />
                                </div>
                                <span className={`text-[11px] tabular-nums whitespace-nowrap ${fillRatio >= 1 ? "text-rose-400" : "text-slate-400"}`}>
                                    {slottedItems}/{inventoryMaxSlots}
                                </span>
                            </div>
                        </div>
                    }
                >
                        <TabBar
                            active={activeFilter}
                            onSelect={setInventoryFilter}
                            accent="amber"
                            tabs={backpackFilters.map((f) => ({
                                key: f,
                                label: filterLabels[f],
                                icon: categoryIcon(f),
                                count: f === "all" ? allItems.length : allItems.filter(i => i._type === f).length,
                            }))}
                        />
                        <SortierLeiste
                            wert={inventarSortierung}
                            setzen={setInventarSortierung}
                            optionen={INVENTAR_SORTIERUNGEN}
                        />

                        {/* Grid */}
                        <div>
                            {displayed.length === 0 ? (
                                <div className="text-slate-600 text-sm text-center py-12">Nichts in dieser Kategorie</div>
                            ) : (
                                <div className="grid grid-cols-8 gap-1.5">
                                    {displayed.map((item, idx) => {
                                        const isSeed = item._type === "seed";
                                        const isPlant = item._type === "plant";
                                        const isTool = item._type === "tool";
                                        const isPet = item._type === "pet";
                                        const isDeco = item._type === "deco";
                                        const sp = itemSpecialName(item);
                                        const spClass = sp === "Golden"
                                            ? "border-amber-500"
                                            : sp === "Rainbow"
                                            ? "border-fuchsia-500"
                                            : (RARITY_BORDER[item.rarity] || RARITY_BORDER.COMMON);
                                        return (
                                            <div key={item.id || item.instanceId || idx}
                                                onClick={() => {
                                                    if (isSeed) {
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedSeed(item);
                                                        setBackpackOpen(false);
                                                    } else if (isPlant) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedCarryItem(item);
                                                        setBackpackOpen(false);
                                                    } else if (isPet) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedDecoToPlace(null);
                                                        setSelectedPetToPlace(item);
                                                        setBackpackOpen(false);
                                                    } else if (isDeco) {
                                                        setSelectedSeed(null);
                                                        setSelectedTool(null);
                                                        setMovingPlantSource(null);
                                                        setSelectedCarryItem(null);
                                                        setSelectedPetToPlace(null);
                                                        setSelectedDecoToPlace(item);
                                                        setBackpackOpen(false);
                                                    }
                                                }}
                                                onMouseEnter={(e) => setItemHoverTooltip({ item, x: e.clientX, y: e.clientY })}
                                                onMouseMove={(e) => setItemHoverTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : { item, x: e.clientX, y: e.clientY })}
                                                onMouseLeave={() => setItemHoverTooltip(null)}
                                                className={`group relative aspect-square rounded-2xl border flex items-center justify-center transition-colors bg-amber-950/20 ${spClass} ${(isSeed || isPlant || isPet || isDeco) ? "cursor-pointer hover:bg-amber-900/30" : "cursor-default"}`}>
                                                <SpecialItemIcon item={item} special={sp} className="w-9 h-9" emojiClassName="text-2xl" />
                                                {/* Tiere tragen Namen — bei mehreren Hühnern war sonst nur am
                                                    Hovern zu erkennen, welches Chicky und welches Berta ist.
                                                    Der Seltenheitspunkt rückt dafür nach oben. */}
                                                {isPet && (
                                                    <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8px] leading-tight text-center text-slate-200 truncate bg-slate-950/85 rounded-b-xl">
                                                        {item.customName || item.name}
                                                    </span>
                                                )}
                                                <span className={`absolute ${isPet ? "top-0.5" : "bottom-0.5"} right-0.5 w-1.5 h-1.5 rounded-full ${RARITY_DOT[item.rarity] || RARITY_DOT.COMMON}`} />
                                                {isTool && item.amount !== undefined && (
                                                    <span className="absolute bottom-0.5 left-1 text-[9px] text-slate-300 tabular-nums">{item.amount}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                </GardenModal>
                );
            })()}
            {isMarketOpen && (
                <GardenModal
                    title="Marktstand"
                    onClose={() => setMarketOpen(false)}
                    width="max-w-md"
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
                        <div className="text-slate-500 text-sm py-8 text-center">Nichts zum Verkaufen im Lager.</div>
                    ) : (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                            <div className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-400">Erntestücke im Lager</span>
                                <span className="text-white font-semibold tabular-nums">{harvestedItems.length}</span>
                            </div>
                            <div className="flex items-center justify-between py-1 text-xs">
                                <span className="text-slate-400">Gesamtwert</span>
                                <span className="text-amber-400 font-semibold tabular-nums">
                                    {harvestedItems.reduce((sum, item) => sum + item.sellValue, 0).toLocaleString('de-DE')} Gold
                                </span>
                            </div>
                            {isSubscriber && (
                                <div className="flex items-center justify-between py-1 text-xs border-t border-slate-800 mt-1 pt-2">
                                    {/* Derselbe Bonus, aber beim Admin nicht „Sub-Bonus"
                                        nennen — er ist keiner, er bekommt ihn nur. */}
                                    <span className="text-slate-400">{istGartenAdmin ? "Admin-Bonus" : "Sub-Bonus"}</span>
                                    <span className="text-emerald-400 font-semibold">+50 %</span>
                                </div>
                            )}
                        </div>
                    )}
                </GardenModal>
            )}
            {isIncubatorOpen && (
                <GardenModal
                    title="Inkubator"
                    subtitle="Eier einlegen, ausbrüten, Tier auf der Farm platzieren"
                    onClose={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); }}
                    onBack={() => { setIncubatorTargetSlot(null); setIncubatorOpen(false); setShedOpen(true); }}
                    width="max-w-4xl"
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
            )}
            <div className={`absolute bottom-5 left-1/2 translate-x-[286px] flex gap-1.5 p-2 ${HUD_SURFACE}`}>
                {[
                    { key: "shovel", label: "Schaufel", hotkey: "1" },
                    { key: "pot", label: "Topf", hotkey: "2" },
                    { key: "pickaxe", label: "Hacke", hotkey: "3" },
                    { key: "watering", label: "Kanne", hotkey: "4" },
                    // Nur beim Admin, und nur dort auch sichtbar: bei allen anderen
                    // fehlt der Platz ganz, statt leer und grau danebenzustehen.
                    ...(istGartenAdmin
                        ? [{ key: "shotgun", label: "Shotgun — auf einen Mitspieler klicken", hotkey: "5" }]
                        : []),
                ].map((slot) => {
                    const owned = Boolean(equippedTools[slot.key]);
                    const isActive = selectedTool === slot.key;
                    // Für Werkzeuge gibt es gezeichnete Bilder — die gehören hierhin,
                    // nicht ein generisches Icon.
                    const toolImage = getToolImage(slot.key);
                    return (
                        <button
                            type="button"
                            key={slot.key}
                            title={`${slot.label} — Taste ${slot.hotkey}`}
                            onClick={(e) => {
                                e.currentTarget.blur();
                                if (!owned) return;
                                setSelectedSeed(null);
                                setSelectedPetToPlace(null);
                                setSelectedDecoToPlace(null);
                                setSelectedCarryItem(null);
                                setSelectedTool(prev => (prev === slot.key ? null : slot.key));
                                if (slot.key !== "pot") setMovingPlantSource(null);
                            }}
                            className={`relative w-[50px] h-[50px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none ${
                                isActive
                                    ? "border-violet-500 bg-slate-800"
                                    : owned
                                        ? "border-slate-700 bg-slate-800/60 hover:border-slate-500 cursor-pointer"
                                        : "border-slate-800 bg-slate-900/40 cursor-default"
                            }`}
                        >
                            <span className="absolute top-0.5 left-1 text-[9px] text-slate-600 tabular-nums">{slot.hotkey}</span>
                            <img
                                src={toolImage}
                                alt=""
                                draggable={false}
                                className={`w-6 h-6 object-contain ${owned ? "" : "opacity-25 grayscale"}`}
                            />
                            <span className={`text-[10px] tabular-nums ${owned ? "text-slate-200" : "text-slate-700"}`}>
                                {owned ? equippedTools[slot.key].name : "0"}
                            </span>
                        </button>
                    );
                })}
            </div>
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
                <GardenModal
                    title="Changelog"
                    subtitle={`Neu in Version ${(CHANGELOG_ENTRIES[0]?.version || "").replace(/^v/, "")}`}
                    onClose={() => setChangelogOpen(false)}
                    width="max-w-2xl"
                >
                    {/* Die neueste Fassung steht offen und trägt eine Marke, alle älteren
                        sind zugeklappt. Vorher lagen alle Versionen gleichrangig
                        untereinander — nach vier Fassungen musste man erst suchen, was
                        eigentlich neu ist. */}
                    <div className="space-y-2">
                        {CHANGELOG_ENTRIES.map((release, index) => {
                            const neueste = index === 0;
                            const offen = neueste || offeneChangelogs.includes(release.version);
                            return (
                                <section key={release.version} className={neueste ? "" : "border-t border-slate-800 pt-2"}>
                                    <button
                                        type="button"
                                        // Die neueste Fassung lässt sich nicht zuklappen: sie ist
                                        // der Grund, warum das Fenster überhaupt aufgeht.
                                        onClick={() => {
                                            if (neueste) return;
                                            setOffeneChangelogs((alt) => (alt.includes(release.version)
                                                ? alt.filter((v) => v !== release.version)
                                                : [...alt, release.version]));
                                        }}
                                        className={`flex w-full items-baseline gap-2 text-left ${neueste ? "cursor-default pb-2 mb-2 border-b border-slate-800" : "py-1"}`}
                                    >
                                        {!neueste ? (
                                            <HudIcon.chevron size={13} className={`shrink-0 self-center transition-transform ${offen ? "" : "-rotate-90"}`} />
                                        ) : null}
                                        <h3 className={`text-sm font-semibold ${neueste ? "text-white" : "text-slate-400"}`}>{release.version}</h3>
                                        {neueste ? (
                                            <span className="rounded-md border border-violet-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                                                Neu
                                            </span>
                                        ) : null}
                                        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{release.title}</span>
                                    </button>
                                    {offen ? release.groups.map((group) => (
                                        <div key={group.heading} className="mb-3">
                                            <h4 className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                                                {group.heading}
                                            </h4>
                                            <ul className="space-y-1">
                                                {group.items.map((item, i) => (
                                                    <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                                                        <span className="text-slate-600 select-none">–</span>
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )) : null}
                                </section>
                            );
                        })}
                    </div>
                </GardenModal>
            )}

        </div>
    );
}