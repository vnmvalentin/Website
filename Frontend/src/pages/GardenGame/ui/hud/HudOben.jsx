// ui/hud/HudOben.jsx
// Spielanzeige oben: links (Einstellungen, Online-Liste, Zoom), Mitte (Schnellreise), rechts (Profilkarte, Knöpfe, Chat, Wetter, Saison).
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import { hungrigeTiere } from "../../engine/PetSystem";
import React from "react";
import { formatGold, weatherIcon } from "../gardenTokens";
import { HudIcon } from "../gameIcons";
import { WORLD_SLOTS, WORLD_ZOOM, PET_SLOTS, CHAT_FARBEN, CHAT_MAX_LEN, KATALOG_NACH_ID } from "../../engine/gameConstants";
import { MapPin, Send } from "lucide-react";
import { CHAT_EMOJI_NAMEN, chatEmojiBild, zerlegeChatText } from "../chatEmojis";
import { PARTY_RAINBOW_FAKTOR, SAISON_ERLOES } from "../../engine/Tageszeit";
import { MUENZ_ZIEL_ATTR } from "../muenzFlug";
import { vielfaltStand, VIELFALT_JE_SELTENHEIT_MAX } from "../vielfalt";
import { ItemIcon } from "../ItemIcon";
import { hydrateHarvestedItem } from "../../engine/PlantSystem";
import { SAISON_TEXTFARBE, formatSaisonRest } from "../saison";
import { versionedAsset } from "../../engine/assetVersion";

/** Chatzeile mit Pixel-Emojis an Stelle der Kürzel (ui/chatEmojis.js). */
function ChatText({ text }) {
    return zerlegeChatText(String(text || "")).map((teil, i) => (typeof teil === "string" ? (
        <React.Fragment key={i}>{teil}</React.Fragment>
    ) : (
        <img key={i} src={chatEmojiBild(teil.emoji)} alt={`:${teil.emoji}:`} title={`:${teil.emoji}:`} width={20} height={20}
            draggable={false} className="inline-block align-[-4px]" style={{ imageRendering: "pixelated" }} />
    )));
}

// 06.11.: statt brauner Knöpfe nur noch Pixel-Symbole (tools/pixelDeko.mjs), die beim
// Draufzeigen hochrutschen. Zahlen hängen als kleines Schild daran.
const HOLZ = "#3b2516";
function SymbolKnopf({ bild, label, onClick, schild, marke, aktiv = false, groesse = "h-12 w-12", drehen = "group-hover:-rotate-6", ...rest }) {
    return (
        <button type="button" title={label} aria-label={label}
            onClick={(e) => { e.currentTarget.blur(); onClick?.(e); }}
            className={`group relative flex flex-col items-center transition-transform duration-100 hover:-translate-y-1 focus:outline-none ${aktiv ? "-translate-y-1" : ""}`}
            {...rest}>
            <img src={versionedAsset(bild)} alt="" draggable={false}
                className={`${groesse} object-contain drop-shadow-[0_3px_0_rgba(43,29,18,0.65)] transition-transform duration-150 ${drehen}`}
                style={{ imageRendering: "pixelated" }} />
            {schild !== undefined && schild !== null && (
                <span className="mt-1 whitespace-nowrap border-2 bg-[#fff3c4] px-1.5 py-px text-[11px] font-bold leading-tight tabular-nums text-[#3b2516]" style={{ borderColor: HOLZ, boxShadow: `0 2px 0 0 ${HOLZ}` }}>{schild}</span>
            )}
            {marke}
        </button>
    );
}

export function HudObenLinks({
    setSettingsOpen, setOnlineListeOffen, istOnlineListeOffen, lobbyConnected, onlinePlayers,
    localPlayerNameRef, mySlotIndex, gold, skillStand, playerAppearance, besucheSpieler,
    istGartenAdmin, setAdminPanelOffen, zoomAnzeige, zoomRef, setZoomAnzeige,
}) {
    return (
        <div className="absolute top-5 left-5 z-50 flex flex-col items-start gap-2">
            <SymbolKnopf bild="/garden-assets/icons/hud/zahnrad_pixel.png" label="Einstellungen" drehen="group-hover:rotate-45"
                onClick={() => setSettingsOpen((prev) => !prev)} />

            {/* Spielerzahl und Zoom sagen etwas über die Welt und die Ansicht, nicht
                über die eigene Farm — deshalb hier bei den Einstellungen statt
                rechts zwischen Gold, Post und Tieren.
                Die Liste klappt per KLICK auf und bleibt offen: sie ist zum Anklicken
                der Namen da, und ein Aufklappen beim Überfahren würde genau dann
                zuschnappen, wenn man den Zeiger zum gewünschten Namen bewegt. */}
            <div className="flex flex-col items-start">
                <SymbolKnopf bild="/garden-assets/icons/hud/online_pixel.png" label="Wer ist online?" groesse="h-11 w-14"
                    aktiv={istOnlineListeOffen} aria-expanded={istOnlineListeOffen}
                    onClick={() => setOnlineListeOffen((offen) => !offen)}
                    schild={lobbyConnected ? `${onlinePlayers.length + 1}/${WORLD_SLOTS} online` : "Verbinde…"} />
                {istOnlineListeOffen && (
                    // Cartoon-Überarbeitung 30.08. (zweite Runde, "Spielermenü ist noch
                    // alt"): dieselbe dicke dunkle Holz-Kontur wie überall sonst, der
                    // Innenraum bleibt dunkel (siehe GardenModal-Kommentar in gardenUi.jsx,
                    // warum: der helle Text hier drin verträgt sich nicht mit hellem Grund).
                    <div className="mt-2 flex max-h-64 w-[19rem] flex-col gap-0.5 overflow-y-auto border-[3px] p-1.5" style={{ borderColor: HOLZ, background: "#f3e3c3", boxShadow: `0 4px 0 0 ${HOLZ}` }}>
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">
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
                                className={`flex items-center gap-2.5 border-2 border-transparent px-2 py-1.5 text-left transition-colors hover:border-[#3b2516] hover:bg-[#fff3c4] ${
                                    eintrag.selbst ? "bg-[#e8d7a8]" : ""
                                }`}
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 bg-[#fffaf0]" style={{ borderColor: HOLZ }}>
                                    {eintrag.skin ? (
                                        <img src={eintrag.skin} alt="" draggable={false} className="h-6 w-6 object-contain" style={{ imageRendering: "pixelated" }} />
                                    ) : (
                                        <MapPin size={12} className="text-slate-600" />
                                    )}
                                </span>
                                <span className={`flex-1 min-w-0 truncate text-xs text-[#3b2516] ${eintrag.selbst ? "font-bold" : "font-medium"}`}>
                                    {eintrag.name}
                                </span>
                                <span className="shrink-0 flex flex-col items-end gap-0.5">
                                    {/* Feedback 01.09.: "Trophäen-Icon raus, stattdessen 'Lvl:' vor die
                                        Zahl" — HudIcon.level raus, reiner Text wie beim Namen daneben. */}
                                    <span className="text-[11px] font-bold tabular-nums text-[#5a3a8a]">
                                        Lvl: {eintrag.level}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px] font-bold tabular-nums text-[#8a5a14]">
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
                <SymbolKnopf bild="/garden-assets/icons/hud/admin_pixel.png" label="Admin: Spielstände bearbeiten" groesse="h-10 w-10"
                    onClick={() => setAdminPanelOffen(true)} />
            )}

            {/* Zoom nur zeigen, wenn er vom Standard abweicht — sonst steht dauerhaft
                eine Zeile im Weg, die man nie braucht. */}
            {Math.abs(zoomAnzeige - WORLD_ZOOM) > 0.001 && (
                // Pixel-Lupe mit Holzschild wie die Online-Anzeige (06.11.)
                <SymbolKnopf bild="/garden-assets/icons/hud/lupe_pixel.png" label="Zoom auf Standard zurücksetzen" groesse="h-10 w-10"
                    onClick={() => { zoomRef.current = WORLD_ZOOM; setZoomAnzeige(WORLD_ZOOM); }}
                    schild={`${Math.round((zoomAnzeige / WORLD_ZOOM) * 100)} %`} />
            )}
        </div>
    );
}

/**
 * Schnellreise als Wegweiser (06.11.): ein Pfosten, links zwei Holzpfeile zum Dorfplatz,
 * rechts einer zur eigenen Farm. Beim Draufzeigen rückt der Pfeil in seine Richtung.
 */
function Wegpfeil({ label, bild, richtung, onClick }) {
    const links = richtung === "links";
    const form = links
        ? "polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%)"
        : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)";
    return (
        <button type="button" title={label} onClick={(e) => { e.currentTarget.blur(); onClick(); }}
            className={`group relative transition-transform duration-100 focus:outline-none ${links ? "hover:-translate-x-1" : "hover:translate-x-1"}`}
            style={{ filter: "drop-shadow(0 3px 0 rgba(43,29,18,0.7))" }}>
            {/* Rand: dieselbe Form eine Spur größer dahinter */}
            <span className="absolute inset-0" style={{ clipPath: form, background: HOLZ }} />
            <span className={`relative m-[3px] flex h-10 items-center gap-2 text-sm font-bold text-[#3b2516] ${links ? "pl-5 pr-3" : "pl-3 pr-5"}`}
                style={{ clipPath: form, background: "repeating-linear-gradient(0deg, #c99258 0 7px, #b88148 7px 9px)" }}>
                <img src={versionedAsset(bild)} alt="" draggable={false} className="h-8 w-8 object-contain" />
                {label}
            </span>
        </button>
    );
}

export function HudObenMitte({
    teleportToMarketArea, teleportToShopArea, teleportToMyFarm,
}) {
    return (
        <div className="absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-center">
            <div className="flex items-center gap-1">
                <Wegpfeil label="Verkauf-Areal" bild="/garden-assets/world/market.png" richtung="links" onClick={teleportToMarketArea} />
                <Wegpfeil label="Shop-Areal" bild="/garden-assets/world/seed_shop.png" richtung="links" onClick={teleportToShopArea} />
            </div>
            {/* Pfosten */}
            <span aria-hidden="true" className="relative mx-1.5 h-16 w-3 border-x-[3px]" style={{ borderColor: HOLZ, background: "#8a5a32" }}>
                <span className="absolute -top-1 left-1/2 h-2 w-5 -translate-x-1/2 border-[3px]" style={{ borderColor: HOLZ, background: "#6e4426" }} />
            </span>
            <Wegpfeil label="Meine Farm" bild="/garden-assets/world/shed.png" richtung="rechts" onClick={teleportToMyFarm} />
        </div>
    );
}

/**
 * Himmelsuhr (06.11.): ein kleines Pixelfenster, in dem Sonne bzw. Mond auf einem Bogen
 * über den Himmel wandern; die Farbe folgt der Tageszeit (Morgen- und Abendrot, Nacht
 * mit Sternen). Darunter steht die Uhrzeit auf einem Schildchen. Ersetzt die blaue
 * Uhr-Plakette — der Nutzer wollte sie am 06.11. ausdrücklich neu.
 */
const STERNE = [[6, 4], [14, 9], [22, 3], [31, 7], [40, 5], [47, 10], [10, 13], [36, 12]];
function HimmelsUhr({ uhrzeit }) {
    const [hh, mm] = String(uhrzeit || "12:00").split(":").map(Number);
    const h = (Number.isFinite(hh) ? hh : 12) + (Number.isFinite(mm) ? mm : 0) / 60;
    const tag = h >= 6 && h < 20;
    // Anteil des Bogens: Sonne 6 → 20 Uhr, Mond 20 → 6 Uhr
    const anteil = tag ? (h - 6) / 14 : ((h >= 20 ? h - 20 : h + 4) / 10);
    const x = 4 + anteil * 44;
    const y = 18 - Math.sin(anteil * Math.PI) * 13;
    const daemmerung = (h >= 5 && h < 7.5) || (h >= 18 && h < 20.5);
    const himmel = !tag && !daemmerung ? ["#141a40", "#1e2856"] : daemmerung ? ["#f2a65a", "#e8764a"] : ["#7ec8e8", "#a8dcf0"];
    const P = 2; // Bildpunkt-Größe
    return (
        <div className="flex shrink-0 flex-col items-center">
            <div className="relative overflow-hidden border-[3px]" style={{ width: 52 * P + 6, height: 22 * P + 6, borderColor: HOLZ, background: `linear-gradient(${himmel[0]} 0 55%, ${himmel[1]} 55% 100%)` }}>
                {!tag && STERNE.map(([sx, sy]) => (
                    <span key={`${sx}-${sy}`} className="absolute bg-[#fff6c4]" style={{ left: sx * P, top: sy * P, width: P, height: P }} />
                ))}
                {/* Sonne (Quadrat mit Strahlen) oder Mond (Sichel) */}
                <span className="absolute" style={{ left: (x - 4) * P, top: (y - 4) * P, width: 8 * P, height: 8 * P }}>
                    {tag ? (
                        <>
                            <span className="absolute bg-[#ffd84a]" style={{ left: P, top: P, width: 6 * P, height: 6 * P, boxShadow: `0 0 0 ${P}px #f2a03a` }} />
                            <span className="absolute bg-[#fff3a0]" style={{ left: 2 * P, top: 2 * P, width: 2 * P, height: 2 * P }} />
                        </>
                    ) : (
                        <>
                            <span className="absolute bg-[#fff6c4]" style={{ left: P, top: P, width: 6 * P, height: 6 * P }} />
                            <span className="absolute" style={{ left: 3 * P, top: 0, width: 6 * P, height: 6 * P, background: himmel[0] }} />
                        </>
                    )}
                </span>
                {/* Hügel unten */}
                <span className="absolute bottom-0 left-0 right-0" style={{ height: 3 * P, background: tag ? "#5faa45" : "#24502a" }} />
                <span className="absolute bottom-0" style={{ left: 30 * P, width: 16 * P, height: 5 * P, background: tag ? "#4f9a3c" : "#1e4424" }} />
            </div>
            <span className="-mt-1 border-2 bg-[#fff3c4] px-1.5 text-[11px] font-bold leading-tight tabular-nums text-[#3b2516]" style={{ borderColor: HOLZ }}>{uhrzeit}</span>
        </div>
    );
}

export function HudObenRechts({
    tagesInfo, setProfilOffen, isProfilOffen, playerAppearance, skillStand, localPlayerNameRef,
    gold, plotPlants, skillWirkung, setVielfaltOffen, vielfaltOffen, setPetOverlayOpen,
    petPlacements, mySlotIndex, setChatOffen, setFarbwahlOffen, setEmojiWahlOffen, istChatOffen,
    chatUngelesen, chatListeRef, chatAmEndeRef, chatVerlauf, authUser, besucheSpieler,
    istFarbwahlOffen, setChatFarbe, chatFarbe, istEmojiWahlOffen, setChatEingabe, chatAbschicken,
    chatEingabe, lobbyConnected, weatherState, isPublicWorld, activeCode, notify, nachfrage,
}) {
    // Info-Tafel (Uhr, Jahreszeit, Wetter, Markt, Vielfalt) seit 04.11. zugeklappt:
    // sichtbar bleibt nur die Kopfzeile, der Rest fährt beim Drüberfahren aus.
    // Klick klappt ebenfalls (Touch), Tastatur über Fokus.
    const [tafelOffen, setTafelOffen] = React.useState(false);
    const zuklappen = () => { setTafelOffen(false); setVielfaltOffen(false); };
    return (
        <div className="absolute top-5 right-5 z-40 flex flex-col items-end gap-2">
            {/* Partyzeit. Steht GANZ oben, weil es das seltenere und wichtigere
                Ereignis ist — und nur dann, wenn es auch läuft. */}
            {tagesInfo.party && (
                // Holzschild mit Regenbogen-Streifen (06.11.)
                <div className="flex h-10 items-center gap-2 border-[3px] pl-0 pr-3 text-xs font-bold text-[#3b2516]"
                    style={{ borderColor: HOLZ, background: "#f3e3c3", boxShadow: `0 3px 0 0 ${HOLZ}` }}>
                    <span aria-hidden="true" className="h-full w-2.5 shrink-0" style={{ background: "linear-gradient(#e8403a 0 17%, #f2a83a 17% 34%, #ffd84a 34% 50%, #5faa45 50% 67%, #3a82d8 67% 84%, #9a5ad8 84%)" }} />
                    <HudIcon.party size={15} className="shrink-0" />
                    <span>Partyzeit · Rainbow {PARTY_RAINBOW_FAKTOR}×</span>
                    <span className="border-2 bg-[#fffaf0] px-1 tabular-nums text-[#a8307a]" style={{ borderColor: HOLZ }}>
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
            <div className="relative z-50 w-80">
                {/* Feedback 30.08.: "Profil soll oben rechts und größer sein" — zeigt
                    jetzt schon zugeklappt das Geist-Bild und den Namen statt nur
                    Level+Gold in einer schmalen Zeile, damit sie als DIE Anlaufstelle
                    oben rechts erkennbar ist. */}
                <button
                    type="button"
                    onClick={(e) => { e.currentTarget.blur(); setProfilOffen((offen) => !offen); }}
                    aria-expanded={isProfilOffen}
                    className="flex w-full items-center gap-3 border-[3px] p-1.5 text-left transition-transform duration-100 hover:-translate-y-0.5"
                    style={{ borderColor: HOLZ, background: "#6e4426", boxShadow: `0 4px 0 0 ${HOLZ}, inset 0 3px 0 0 #8a5a32` }}
                >
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center border-[3px]" style={{ borderColor: HOLZ, background: "#9fd3e6", boxShadow: "inset 0 -10px 0 0 #7fb35a" }}>
                        <img
                            src={playerAppearance.skin}
                            alt=""
                            draggable={false}
                            className="h-12 w-12 object-contain"
                            style={{ imageRendering: "pixelated" }}
                        />
                        {/* Offener Fähigkeitspunkt — sichtbar, ohne erst aufklappen zu
                            müssen (übernimmt den Hinweis vom entfernten "Level N"-Knopf).
                            Feedback 30.08. (zweite Runde): eine reine Farbmarkierung
                            ging zu leicht unter — jetzt dieselbe Zahl-Plakette wie am
                            "Fähigkeiten"-Knopf im aufgeklappten Profil, dazu ein
                            dezentes Pulsieren, damit sie wirklich auffällt. */}
                        {(skillStand?.punkteOffen || 0) > 0 && (
                            <span className="absolute -top-2 -right-2 flex min-w-[18px] animate-pulse items-center justify-center border-2 border-[#3b2516] bg-[#8a5ac8] px-1 text-[10px] font-bold tabular-nums text-white">
                                {skillStand.punkteOffen}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 border-[3px] px-2 py-1" style={{ borderColor: HOLZ, background: "#f3e3c3" }}>
                        <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[#3b2516]">
                                {localPlayerNameRef.current || "Du"}
                            </span>
                            <span className="ml-auto shrink-0 border-2 border-[#3b2516] bg-[#8a5ac8] px-1 text-[10px] font-bold leading-tight text-white">Lv {skillStand?.level || 1}</span>
                        </div>
                        {/* 07.11.: Gold ist die Hauptsache im Spiel — eigene, große Zeile statt
                            kleiner Marke neben dem Namen. Ziel der Münzflug-Animation. */}
                        <div {...{ [MUENZ_ZIEL_ATTR]: "" }} className="mt-1 flex items-center gap-1.5 border-2 border-[#3b2516] bg-[#ffe066] px-1.5 py-0.5" style={{ boxShadow: "inset 0 -3px 0 0 #e8b830" }}>
                            <HudIcon.gold size={20} className="shrink-0" />
                            <span className="truncate text-lg font-bold leading-none tabular-nums text-[#3b2516]">{gold.toLocaleString("de-DE")}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                            <div className="h-2.5 flex-1 overflow-hidden border-2 border-[#3b2516] bg-[#c9b48a]">
                                <div
                                    className="h-full bg-[#9a68d8]"
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

            {/* Briefkasten und Gold-Shop sind seit 04.11. nur noch Gebäude in der Welt:
                der Briefkasten am eigenen Grundstück (mit Zeichen bei neuer Post),
                der Gold-Shop als Stand auf dem Dorfplatz. */}

            {/* Tiere — bis Feedback 30.08. ein Klapp-Menü mit dem Inkubator als
                zweitem Punkt darunter. Der Inkubator wohnt jetzt im Schuppen
                (Feedback 30.08.: "Inkubator in den Schuppen packen und aus dem
                Tiere-Dropdown entfernen"), damit bleibt hier nur noch EIN Ziel
                übrig — ein Klapp-Menü für einen einzigen Eintrag wäre unnötiger
                Umweg, also direkt ein einfacher Knopf wie beim Briefkasten. Die
                violette "Ei fertig"-Hervorhebung gehörte zum Inkubator, nicht zu
                den Tieren, und zieht mit ihm in den Schuppen (dort am Knopf UND
                als Marker über dem Gebäude auf dem Feld). */}
            <div className="flex items-start gap-5">
            <SymbolKnopf bild="/garden-assets/icons/hud/tiere_pixel.png" label="Deine Tiere"
                onClick={() => setPetOverlayOpen(true)}
                schild={`${petPlacements.filter((p) => p.slotIndex === mySlotIndex).length}/${PET_SLOTS}`}
                marke={hungrigeTiere(petPlacements.filter((p) => p.slotIndex === mySlotIndex)).length > 0 ? (
                    // Hunger (06.11.): verhungerte Tiere arbeiten nicht — rotes Zeichen am Stall
                    <span title="Ein Tier hat Hunger" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center border-2 border-[#2b1d12] bg-[#e8403a] text-[12px] font-bold leading-none text-white" style={{ boxShadow: "0 2px 0 0 #2b1d12" }}>!</span>
                ) : null} />

            {/* Weltchat. Anders als Gold und Tiere klappt er per KLICK auf und
                bleibt offen — beim Tippen darf er nicht zuschnappen, sobald der
                Zeiger die Leiste verlässt. Der Verlauf gehört der Welt und wird
                nicht gespeichert; wer später dazukommt, sieht ihn nicht. */}
            <div className="relative z-[60]">
                <SymbolKnopf bild="/garden-assets/icons/hud/chat_pixel.png" label="Weltchat"
                    aktiv={istChatOffen} aria-expanded={istChatOffen}
                    onClick={() => {
                        setChatOffen((offen) => !offen);
                        // Sonst steht die Farb-/Emojiwahl beim nächsten Öffnen noch offen,
                        // obwohl das Fenster selbst gerade erst wieder aufklappt.
                        setFarbwahlOffen(false);
                        setEmojiWahlOffen(false);
                    }}
                    schild="Chat"
                    marke={chatUngelesen > 0 && !istChatOffen ? (
                        <span className="absolute -right-2 -top-1 min-w-[18px] border-2 border-[#3b2516] bg-[#c8403a] px-1 text-center text-[10px] font-bold tabular-nums text-white">
                            {chatUngelesen > 99 ? "99+" : chatUngelesen}
                        </span>
                    ) : null} />

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
                    // 06.11.: links NEBEN der rechten Spalte (20rem breit) statt darunter — dort verdeckte
                    // der Chat Uhr, Jahreszeit und Wetter.
                    <div className="absolute top-0 flex w-[19rem] flex-col border-[4px] border-[#3b2516] bg-[#f3e3c3]" style={{ right: "calc(20rem + 14px)", boxShadow: "0 4px 0 0 #3b2516, inset 0 0 0 3px #c99258" }}>
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
                                <p className="text-xs text-[#8a7a5a] leading-relaxed">
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
                                                    eigen ? "text-[#6a40a8]" : "text-[#3b2516] hover:text-black"
                                                }`}
                                            >
                                                {n.from}
                                            </button>
                                            <span className="text-[#8a7a5a]">: </span>
                                            {/* Eigene Textfarbe (Feedback 01.09.) — kommt vom Server, geprüft
                                                gegen CHAT_FARBEN dort. Ohne Farbe (Standard oder eine vom Server
                                                verworfene) bleibt die bisherige feste Klasse. */}
                                            <span
                                                className={n.color ? "" : "text-[#3b2516]"}
                                                style={n.color ? { color: n.color } : undefined}
                                            >
                                                <ChatText text={n.text} />
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="relative border-t-[3px] border-[#3b2516]">
                            {/* Farbwahl (Feedback 01.09.) — feste Palette, siehe CHAT_FARBEN oben.
                                Öffnet nach oben: die Leiste steht am unteren Rand des Fensters.
                                07.11.: Holzrahmen + Stufenschatten wie die übrigen Klapp-Fenster. */}
                            {istFarbwahlOffen && (
                                <div className="absolute bottom-full left-1.5 z-10 mb-2 flex items-center gap-1.5 border-[3px] border-[#3b2516] bg-[#f3e3c3] p-1.5" style={{ boxShadow: "0 4px 0 0 #3b2516" }}>
                                    {[{ id: null, hex: "#3b2516", name: "Standard" }, ...CHAT_FARBEN].map((f) => {
                                        const gewaehlt = (chatFarbe || null) === f.id;
                                        return (
                                            <button
                                                key={f.id || "standard"}
                                                type="button"
                                                title={f.name || f.id}
                                                aria-pressed={gewaehlt}
                                                onClick={() => { setChatFarbe(f.id); setFarbwahlOffen(false); }}
                                                className={`h-6 w-6 shrink-0 border-[3px] border-[#3b2516] transition-transform duration-75 ${gewaehlt ? "-translate-y-0.5" : "hover:-translate-y-0.5"}`}
                                                style={{ background: f.hex, boxShadow: gewaehlt ? "0 0 0 2px #fff3c4, 0 3px 0 2px #3b2516" : "0 2px 0 0 #3b2516" }}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                            {/* Emoji-Feld — seit 07.11. eigene Pixel-Emojis (ui/chatEmojis.js), die als
                                Kürzel („:herz:“) im Text stehen. Bleibt nach einer Auswahl offen,
                                falls mehrere folgen sollen. */}
                            {istEmojiWahlOffen && (
                                <div className="absolute bottom-full left-1.5 z-10 mb-2 grid grid-cols-7 gap-1 border-[3px] border-[#3b2516] bg-[#f3e3c3] p-1.5" style={{ boxShadow: "0 4px 0 0 #3b2516" }}>
                                    {CHAT_EMOJI_NAMEN.map((name) => (
                                        <button
                                            key={name}
                                            type="button"
                                            title={`:${name}:`}
                                            onClick={() => setChatEingabe((prev) => {
                                                const kuerzel = `${prev && !prev.endsWith(" ") ? " " : ""}:${name}: `;
                                                return (prev + kuerzel).length > CHAT_MAX_LEN ? prev : prev + kuerzel;
                                            })}
                                            className="flex h-8 w-8 items-center justify-center border-2 border-transparent hover:border-[#3b2516] hover:bg-[#fff3c4]"
                                        >
                                            <img src={chatEmojiBild(name)} alt={name} width={24} height={24} draggable={false} style={{ imageRendering: "pixelated" }} />
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
                                    aria-label="Textfarbe"
                                    onClick={() => { setFarbwahlOffen((o) => !o); setEmojiWahlOffen(false); }}
                                    className={`shrink-0 flex h-[30px] w-[30px] items-center justify-center border-[3px] border-[#3b2516] ${istFarbwahlOffen ? "bg-[#fff3c4]" : "bg-[#fffaf0] hover:bg-[#fff3c4]"}`}
                                    style={{ boxShadow: "0 2px 0 0 #3b2516" }}
                                >
                                    <span
                                        className="h-3.5 w-3.5 border-2 border-[#3b2516]"
                                        style={{ background: CHAT_FARBEN.find((f) => f.id === chatFarbe)?.hex || "#3b2516" }}
                                    />
                                </button>
                                <button
                                    type="button"
                                    title="Emoji"
                                    aria-label="Emoji"
                                    onClick={() => { setEmojiWahlOffen((o) => !o); setFarbwahlOffen(false); }}
                                    className={`shrink-0 flex h-[30px] w-[30px] items-center justify-center border-[3px] border-[#3b2516] ${istEmojiWahlOffen ? "bg-[#fff3c4]" : "bg-[#fffaf0] hover:bg-[#fff3c4]"}`}
                                    style={{ boxShadow: "0 2px 0 0 #3b2516" }}
                                >
                                    <img src={chatEmojiBild("grinsen")} alt="" width={18} height={18} draggable={false} style={{ imageRendering: "pixelated" }} />
                                </button>
                                <input
                                    value={chatEingabe}
                                    onChange={(e) => setChatEingabe(e.target.value)}
                                    maxLength={CHAT_MAX_LEN}
                                    placeholder={lobbyConnected ? "Nachricht" : "Nicht verbunden"}
                                    disabled={!lobbyConnected}
                                    className="h-[30px] flex-1 min-w-0 px-2 bg-white border-[3px] border-[#3b2516] text-[13px] text-[#3b2516] placeholder:text-[#a8967e] focus:outline-none disabled:bg-[#fffaf0] disabled:text-[#8a7a5a]"
                                />
                                <button
                                    type="submit"
                                    disabled={!lobbyConnected || !chatEingabe.trim()}
                                    aria-label="Nachricht schicken"
                                    style={{ boxShadow: "0 2px 0 0 #3b2516" }}
                                    className="shrink-0 flex h-[30px] w-[30px] items-center justify-center border-[3px] border-[#3b2516] bg-[#5faa45] text-white hover:bg-[#6fbc52] disabled:bg-[#d8cfb8] disabled:text-[#7a6a50]"
                                >
                                    <Send size={13} />
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            </div>

            {/* Weltzustand — unten in der Spalte (Feedback 30.08.: "Zeit unter den
                Chat"). Weniger dringend als Post/Tiere/Chat, war vorher aber ganz
                oben und damit das ERSTE, was ins Auge fiel.
                Seit 04.11. EINE Info-Tafel statt loser Kacheln: oben in der Spalte die
                Knöpfe, unten alles, was nur anzeigt (Uhr, Jahreszeit, Wetter, Vielfalt).
                Holzrahmen ohne Drück-Effekt, weil die Tafel selbst kein Knopf ist; so
                breit wie die Profilkarte oben. */}
            <div
                className="flex w-80 flex-col border-[3px] p-1.5"
                style={{ borderColor: HOLZ, background: "#6e4426", boxShadow: `0 4px 0 0 ${HOLZ}, inset 0 3px 0 0 #8a5a32` }}
                onMouseEnter={() => setTafelOffen(true)}
                onMouseLeave={zuklappen}
                onFocus={() => setTafelOffen(true)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) zuklappen(); }}
            >
            <div
                className="flex cursor-default items-center gap-2"
                onClick={() => setTafelOffen((o) => !o)}
                aria-expanded={tafelOffen}
            >
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
                <HimmelsUhr uhrzeit={tagesInfo.uhrzeit} />

                {/* Jahreszeit — eine Woche je Saison (engine/Tageszeit.js). Der
                    Tooltip nennt die Saisonsorten, die gerade mehr bringen. */}
                <div
                    className="flex h-10 min-w-0 flex-1 items-center gap-1.5 px-1 text-xs font-bold"
                    title={`Saisonsorten (+${Math.round((SAISON_ERLOES - 1) * 100)} % beim Ernten, öfter im Laden): ${
                        (tagesInfo.saisonSorten || []).map((id) => KATALOG_NACH_ID.get(id)?.name || id).join(", ")
                    }\nDanach: ${tagesInfo.naechsteSaison}`}
                >
                    <img src={versionedAsset(`/garden-assets/icons/hud/saison_${tagesInfo.saison}.png`)} alt="" draggable={false}
                        className="h-7 w-7 shrink-0 object-contain" style={{ imageRendering: "pixelated" }} />
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className={SAISON_TEXTFARBE[tagesInfo.saison] || "text-slate-200"}>{tagesInfo.saisonName}</span>
                        <span className="text-[10px] font-medium tabular-nums text-[#e8d7a8]">noch {formatSaisonRest(tagesInfo.saisonEnde - Date.now())}</span>
                    </span>
                    {tagesInfo.erntefest && (
                        <span className="ml-1 rounded-md bg-amber-900/60 px-1.5 py-px text-[10px] font-bold text-amber-200">Erntefest</span>
                    )}
                    {weatherState?.type && weatherState.type !== "sun" && (
                        <span className="ml-auto shrink-0" title={weatherState.label}>
                            {React.createElement(weatherIcon(weatherState.type), { size: 15, className: "text-sky-300" })}
                        </span>
                    )}
                    <span className={`shrink-0 text-[10px] text-amber-200/70 transition-transform ${tafelOffen ? "rotate-180" : ""} ${weatherState?.type && weatherState.type !== "sun" ? "" : "ml-auto"}`}>▼</span>
                </div>

            </div>

            {/* Ausfahrender Teil: Grid-Zeile von 0fr auf 1fr, damit die Höhe weich
                mitwächst. Zugeklappt muss der Inhalt abgeschnitten werden, offen
                nicht — sonst schnitte er das Vielfalt-Fenster ab. */}
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${tafelOffen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className={`flex min-h-0 flex-col gap-1.5 ${tafelOffen ? "overflow-visible pt-1.5" : "overflow-hidden"}`}>

            {/* Wetter — eigene Zeile, getrennt von der Uhrzeit, und nur wenn
                wirklich eins aktiv ist. „Sonne" ist der neutrale Grundzustand
                ohne Effekt; seit es Tag und Nacht gibt, wäre sie dort auch
                nachts zu sehen und suggerierte ein Wetter, das keins ist. */}
            {weatherState?.type && weatherState.type !== "sun" && (
                <div className="flex h-8 items-center gap-2 rounded-xl bg-black/15 px-2.5 text-xs font-medium text-slate-300">
                    {React.createElement(weatherIcon(weatherState.type), { size: 15, className: "shrink-0 text-sky-400" })}
                    <span className="truncate">{weatherState.label}</span>
                </div>
            )}

            {/* Gefragte Sorten am Markt (04.11., Backend garden/core/nachfrage.js):
                bringen beim Verkaufen mehr. Hier statt im Marktfenster, weil man am
                Stand per E sofort verkauft — so sieht man sie schon beim Planen. */}
            {Array.isArray(nachfrage?.sorten) && nachfrage.sorten.length > 0 && (() => {
                const bis = new Date(Number(nachfrage.bis) || Date.now()).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
                return (
                    <div
                        className="rounded-xl bg-black/15 px-2.5 py-1.5 text-xs font-medium text-slate-300"
                        title={`Am Markt gerade gefragt: ${nachfrage.sorten.map((s) => `${KATALOG_NACH_ID.get(s.seedId)?.name || s.seedId} +${Math.round(s.bonus * 100)} %`).join(", ")}. Wechselt um ${bis} Uhr.`}
                    >
                        <div className="flex items-center gap-2">
                            <span>Markt gefragt</span>
                            <span className="ml-auto text-[11px] font-normal text-slate-500">bis {bis}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {nachfrage.sorten.map((s) => (
                                <span key={s.seedId} className="flex items-center gap-1">
                                    <ItemIcon item={hydrateHarvestedItem({ seedId: s.seedId, name: KATALOG_NACH_ID.get(s.seedId)?.name })} className="h-5 w-5" emojiClassName="text-sm" />
                                    <span className="font-semibold tabular-nums text-emerald-300">+{Math.round(s.bonus * 100)} %</span>
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* Vielfalt-Bonus (Nov. 2026, Backend garden/core/vielfalt.js): je mehr
                verschiedene Sorten auf dem Acker, desto mehr bringt jede Ernte.
                Klick klappt die Aufschlüsselung je Seltenheit auf. */}
            {(() => {
                const v = vielfaltStand(plotPlants, skillWirkung("sortenkenner"));
                const prozent = Math.round((v.faktor - 1) * 100);
                return (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={(e) => { e.currentTarget.blur(); setVielfaltOffen((o) => !o); }}
                            aria-expanded={vielfaltOffen}
                            className="flex h-8 w-full items-center gap-2 rounded-xl bg-black/15 px-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-black/25 hover:text-white"
                        >
                            <span>Vielfalt</span>
                            <span className={`ml-auto font-semibold tabular-nums ${prozent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                {prozent >= 0 ? "+" : ""}{prozent} %
                            </span>
                        </button>
                        {vielfaltOffen && (
                            <div className="absolute right-0 top-10 z-50 w-72 rounded-md border border-white/10 bg-[#0d0d14] p-3 text-xs text-slate-300">
                                <p className="mb-2 text-white/70">
                                    Jede Ernte bringt {prozent >= 0 ? "+" : ""}{prozent} %. Es zählen je Seltenheit bis zu {VIELFALT_JE_SELTENHEIT_MAX} verschiedene Sorten auf deinem Acker.
                                </p>
                                <div className="divide-y divide-white/10">
                                    {v.zeilen.map((z) => (
                                        <div key={z.rarity} className="flex items-center justify-between py-1">
                                            <span>{z.rarity.charAt(0) + z.rarity.slice(1).toLowerCase()}</span>
                                            <span className={`tabular-nums ${z.zaehlt >= z.max ? "text-emerald-300" : "text-white/60"}`}>
                                                {z.zaehlt} / {z.max}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-white/50">Tipp: Dauerträger halten die Sorte dauerhaft auf dem Acker.</p>
                            </div>
                        )}
                    </div>
                );
            })()}
            </div>
            </div>
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
                    className="flex h-9 w-[12.5rem] items-center gap-2 border-2 bg-[#fff3c4] px-3 text-xs font-bold text-[#3b2516] transition-transform hover:-translate-y-0.5"
                    style={{ borderColor: HOLZ, boxShadow: `0 3px 0 0 ${HOLZ}` }}
                >
                    <HudIcon.worldCode size={15} className="shrink-0" />
                    <span className="tracking-[0.2em]">{activeCode}</span>
                </button>
            )}
        </div>
    );
}
