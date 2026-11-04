// ui/hud/HudOben.jsx
// Spielanzeige oben: links (Einstellungen, Online-Liste, Zoom), Mitte (Schnellreise), rechts (Profilkarte, Knöpfe, Chat, Wetter, Saison).
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { HUD_SURFACE, formatGold, weatherIcon } from "../gardenTokens";
import { HudIcon, TabIcon, WeatherIcon } from "../gameIcons";
import { WORLD_SLOTS, WORLD_ZOOM, PET_SLOTS, CHAT_FARBEN, CHAT_EMOJIS, CHAT_MAX_LEN, KATALOG_NACH_ID } from "../../engine/gameConstants";
import { MapPin, SlidersHorizontal, Search, Smile, Send } from "lucide-react";
import { PARTY_RAINBOW_FAKTOR, SAISON_ERLOES } from "../../engine/Tageszeit";
import { MUENZ_ZIEL_ATTR } from "../muenzFlug";
import { vielfaltStand, VIELFALT_JE_SELTENHEIT_MAX } from "../vielfalt";
import { rauschJetzt, RAUSCH_SCHONZEIT_S } from "../rausch";
import { ItemIcon } from "../ItemIcon";
import { hydrateHarvestedItem } from "../../engine/PlantSystem";
import { SAISON_TEXTFARBE, formatSaisonRest } from "../saison";

export function HudObenLinks({
    setSettingsOpen, setOnlineListeOffen, istOnlineListeOffen, lobbyConnected, onlinePlayers,
    localPlayerNameRef, mySlotIndex, gold, skillStand, playerAppearance, besucheSpieler,
    istGartenAdmin, setAdminPanelOffen, zoomAnzeige, zoomRef, setZoomAnzeige,
}) {
    return (
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
    );
}

export function HudObenMitte({
    teleportToMarketArea, teleportToShopArea, teleportToMyFarm,
}) {
    return (
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
    );
}

export function HudObenRechts({
    tagesInfo, setProfilOffen, isProfilOffen, playerAppearance, skillStand, localPlayerNameRef,
    gold, setMailboxMode, setMailboxRecipient, setMailboxOpen, mailbox, setGoldShopOpen,
    ladeGoldShop, plotPlants, skillWirkung, setVielfaltOffen, vielfaltOffen, setPetOverlayOpen,
    petPlacements, mySlotIndex, setChatOffen, setFarbwahlOffen, setEmojiWahlOffen, istChatOffen,
    chatUngelesen, chatListeRef, chatAmEndeRef, chatVerlauf, authUser, besucheSpieler,
    istFarbwahlOffen, setChatFarbe, chatFarbe, istEmojiWahlOffen, setChatEingabe, chatAbschicken,
    chatEingabe, lobbyConnected, weatherState, isPublicWorld, activeCode, notify, ernteRausch, nachfrage,
}) {
    return (
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
                            <span {...{ [MUENZ_ZIEL_ATTR]: "" }} className="ml-auto flex items-center gap-1 text-xs font-semibold tabular-nums text-amber-400">
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
                oben und damit das ERSTE, was ins Auge fiel.
                Seit 04.11. EINE Info-Tafel statt loser Kacheln: oben in der Spalte die
                Knöpfe, unten alles, was nur anzeigt (Uhr, Jahreszeit, Wetter, Vielfalt).
                Holzrahmen ohne Drück-Effekt, weil die Tafel selbst kein Knopf ist; so
                breit wie die Profilkarte oben. */}
            <div className="flex w-64 flex-col gap-1.5 rounded-2xl border-[3px] border-amber-950 bg-gradient-to-b from-amber-800 to-amber-900 p-1.5 shadow-[0_4px_0_0_#2c1606]">
            <div className="flex items-center gap-2">
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

                {/* Jahreszeit — eine Woche je Saison (engine/Tageszeit.js). Der
                    Tooltip nennt die Saisonsorten, die gerade mehr bringen. */}
                <div
                    className="flex h-10 min-w-0 flex-1 items-center gap-1.5 px-1 text-xs font-bold"
                    title={`Saisonsorten (+${Math.round((SAISON_ERLOES - 1) * 100)} % beim Ernten, öfter im Laden): ${
                        (tagesInfo.saisonSorten || []).map((id) => KATALOG_NACH_ID.get(id)?.name || id).join(", ")
                    }\nDanach: ${tagesInfo.naechsteSaison}`}
                >
                    <span className={SAISON_TEXTFARBE[tagesInfo.saison] || "text-slate-200"}>{tagesInfo.saisonName}</span>
                    <span className="font-medium tabular-nums text-slate-400">noch {formatSaisonRest(tagesInfo.saisonEnde - Date.now())}</span>
                    {tagesInfo.erntefest && (
                        <span className="ml-1 rounded-md bg-amber-900/60 px-1.5 py-px text-[10px] font-bold text-amber-200">Erntefest</span>
                    )}
                </div>

            </div>

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

            {/* Ernte-Rausch (04.11., Backend garden/core/rausch.js): wer regelmäßig
                erntet, baut ihn über zehn Minuten bis +15 % auf; nach einer Pause sinkt
                er wieder. Der Balken wird bis „jetzt" fortgeschrieben (ui/rausch.js),
                die Uhr oben rendert die Spalte ohnehin jede Sekunde neu. */}
            {(() => {
                const r = rauschJetzt(ernteRausch);
                return (
                    <div
                        className="rounded-xl bg-black/15 px-2.5 py-1.5 text-xs font-medium text-slate-300"
                        title={`Ernte regelmäßig (spätestens alle ${RAUSCH_SCHONZEIT_S} Sekunden): nach zehn Minuten bringt jede Ernte +15 %. Machst du länger Pause, sinkt der Rausch wieder.`}
                    >
                        <div className="flex items-center gap-2">
                            <span>Ernte-Rausch</span>
                            <span className={`ml-auto font-semibold tabular-nums ${r.prozent > 0 ? (r.sinkt ? "text-amber-300" : "text-emerald-300") : "text-slate-500"}`}>
                                +{r.prozent} %
                            </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-xl bg-black/30">
                            <div
                                className={`h-full transition-[width] duration-700 ${r.sinkt ? "bg-amber-400" : "bg-emerald-400"}`}
                                style={{ width: `${Math.round(r.fuellung * 100)}%` }}
                            />
                        </div>
                    </div>
                );
            })()}

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
    );
}
