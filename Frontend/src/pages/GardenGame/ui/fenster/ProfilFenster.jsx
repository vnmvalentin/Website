// ui/fenster/ProfilFenster.jsx
// Profil, Einstellungen und Neuerungen — die Fenster rund um den eigenen Account.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { HudIcon } from "../gameIcons";
import { formatGold } from "../gardenTokens";
import { SEED_CATALOGUE } from "../../engine/PlantSystem";
import { THEME_TRACKS, RENDER_QUALITY_PRESETS } from "../../engine/gameConstants";
import { CHANGELOG_ENTRIES } from "../../data/changelogEntries";
import { sterneText, hatKosmetik, TITEL } from "../prestige";
import { versionedAsset } from "../../engine/assetVersion";
import { StandFenster } from "../laden/Marktstand";

/** Eine Logbuch-Seite ist komplett — muss zu logbuchVollstaendig (Backend core/economy.js) passen. */
function logbuchKomplett(e) {
    if (!e) return false;
    const f = new Set(e.effekte || []);
    return e.min === 1 && e.max === 50 && ["Golden", "Rainbow", "wet", "frozen", "charged", "moonlit"].every((x) => f.has(x));
}

/**
 * Profil als Steckbrief (06.11.): Holzrahmen, links das Bild der Katze auf einem kleinen
 * Stück Wiese, rechts Name, Level, Sterne und Kennzahlen als Schilder, darunter die
 * Sammlung und große Bildknöpfe zu Fähigkeiten und Logbuch. Die Umkleide steht seit
 * 06.11. als Kleiderschrank im Haus (ui/HausInnen.jsx) und ist hier raus.
 */
const HOLZ_P = "#3b2516";
function ProfilSchild({ bild, label, wert, hell = "#f3e3c3" }) {
    return (
        <div className="flex items-center gap-2 border-[3px] px-2 py-1.5" style={{ borderColor: HOLZ_P, background: hell, boxShadow: `0 3px 0 0 ${HOLZ_P}` }}>
            {bild}
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">{label}</span>
                <span className="block truncate text-sm font-bold tabular-nums text-[#3b2516]">{wert}</span>
            </span>
        </div>
    );
}
function GrosserKnopf({ bild, titel, text, onClick, marke }) {
    return (
        <button type="button" onClick={onClick}
            className="group relative flex items-center gap-3 border-[3px] p-2.5 text-left transition-transform duration-100 hover:-translate-y-1"
            style={{ borderColor: HOLZ_P, background: "#fff3c4", boxShadow: `0 4px 0 0 ${HOLZ_P}` }}>
            <img src={versionedAsset(bild)} alt="" draggable={false} className="h-14 w-14 shrink-0 object-contain transition-transform duration-150 group-hover:-rotate-6" style={{ imageRendering: "pixelated" }} />
            <span className="min-w-0">
                <span className="block text-base font-bold text-[#3b2516]">{titel}</span>
                <span className="block text-[11px] text-[#6e4426]">{text}</span>
            </span>
            {marke}
        </button>
    );
}

export function ProfilFenster({
    setProfilOffen, playerAppearance, localPlayerNameRef, skillStand, gold, goldGesamt,
    setSkillsOffen, setLogbuchOpen, logbuch, wettbewerbSiege = [],
    prestigeStand = null, setNeueSaatOffen, zuchtbuch = {}, goldShopDaten = null,
}) {
    const sterne = prestigeStand?.sterne || 0;
    // Sammlung: dieselben Regeln wie im Backend (logbuchVollstaendig in core/economy.js).
    const ladensorten = SEED_CATALOGUE.filter((s) => !s.kreuzung);
    const kreuzungen = SEED_CATALOGUE.filter((s) => s.kreuzung);
    const seitenKomplett = ladensorten.filter((s) => logbuchKomplett(logbuch[s.id])).length;
    const kreuzungenGefunden = kreuzungen.filter((s) => zuchtbuch?.[s.id]).length;
    const saisonSchilder = (goldShopDaten?.katalog?.nameplate || []).filter((e) => e.saison);
    const sammlung = [
        { label: "Logbuch-Seiten komplett", wert: seitenKomplett, max: ladensorten.length },
        { label: "Kreuzungen entdeckt", wert: kreuzungenGefunden, max: kreuzungen.length },
        ...(saisonSchilder.length ? [{ label: "Jahreszeiten-Namensschilder", wert: saisonSchilder.filter((e) => e.gekauft).length, max: saisonSchilder.length }] : []),
    ];
    const xpAnteil = (skillStand?.xpFuersNaechste || 0) > 0
        ? Math.min(1, Math.max(0, (skillStand.xpDiesesLevel || 0) / skillStand.xpFuersNaechste)) : 1;
    const MEDAILLE = { 1: "#ffd84a", 2: "#c8ccd4", 3: "#c8864a" };
    return (
        <StandFenster
            titel="Profil"
            untertitel="Dein Steckbrief"
            markise={false}
            breite="max-w-3xl"
            bild={playerAppearance.skin}
            onClose={() => setProfilOffen(false)}
        >
            <div className="mt-2 grid gap-4 md:grid-cols-[13rem_1fr]">
                {/* Bild der Katze auf einem Stück Wiese */}
                <div className="flex flex-col items-stretch">
                    <div className="relative flex h-52 items-end justify-center border-[4px]" style={{ borderColor: HOLZ_P, background: "linear-gradient(#9fd3e6 0 70%, #7fb35a 70% 100%)", boxShadow: `0 4px 0 0 ${HOLZ_P}` }}>
                        <img src={playerAppearance.skin} alt="" draggable={false} className="mb-3 h-40 w-40 object-contain" style={{ imageRendering: "pixelated" }} />
                        {sterne > 0 && (
                            <span className="absolute left-1 top-1 border-2 bg-[#fff3c4] px-1 text-sm font-bold tracking-widest text-[#c88a14]" style={{ borderColor: HOLZ_P }}>{"★".repeat(sterne)}</span>
                        )}
                    </div>
                    <div className="-mt-1 border-[3px] px-2 py-1.5 text-center" style={{ borderColor: HOLZ_P, background: "#f3e3c3" }}>
                        <div className="truncate text-lg font-bold text-[#3b2516]">{localPlayerNameRef.current || "Du"}</div>
                        {hatKosmetik(sterne, "titel") && <div className="text-[11px] font-bold text-[#c88a14]">{TITEL}</div>}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    {/* Level mit Erfahrungsbalken */}
                    <div className="border-[3px] p-2.5" style={{ borderColor: HOLZ_P, background: "#f3e3c3", boxShadow: `0 3px 0 0 ${HOLZ_P}` }}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="border-2 bg-[#8a5ac8] px-2 py-0.5 text-sm font-bold text-white" style={{ borderColor: HOLZ_P }}>Level {skillStand?.level || 1}</span>
                            <span className="text-[11px] font-bold tabular-nums text-[#6e4426]">
                                {(skillStand?.xpFuersNaechste || 0) > 0
                                    ? `${(skillStand?.xpDiesesLevel || 0).toLocaleString("de-DE")} / ${skillStand.xpFuersNaechste.toLocaleString("de-DE")} XP`
                                    : "Höchstlevel"}
                            </span>
                        </div>
                        <div className="h-3.5 w-full border-2" style={{ borderColor: HOLZ_P, background: "#c9b48a" }}>
                            <div className="h-full" style={{ width: `${xpAnteil * 100}%`, background: "#9a68d8", boxShadow: "inset 0 2px 0 0 rgba(255,255,255,0.35)" }} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <ProfilSchild bild={<HudIcon.gold size={22} />} label="Gold" wert={formatGold(gold)} hell="#ffe066" />
                        <ProfilSchild bild={<HudIcon.goldLifetime size={22} />} label="Gesamt gesammelt" wert={formatGold(goldGesamt)} />
                    </div>

                    {/* Abzeichen aus dem Wochenwettbewerb (Backend world/wettbewerb.js) */}
                    {wettbewerbSiege.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#e8d7a8]">Wochenwettbewerb</span>
                            {[1, 2, 3].map((p) => {
                                const n = wettbewerbSiege.filter((sg) => sg.platz === p).length;
                                return n ? (
                                    <span key={p} className="flex items-center gap-1 border-2 px-1.5 py-0.5 text-[11px] font-bold text-[#3b2516]" style={{ borderColor: HOLZ_P, background: MEDAILLE[p] }}>
                                        {n}× Platz {p}
                                    </span>
                                ) : null;
                            })}
                        </div>
                    )}

                    {/* Sammelziele */}
                    <div className="border-[3px] p-2.5" style={{ borderColor: HOLZ_P, background: "#f3e3c3", boxShadow: `0 3px 0 0 ${HOLZ_P}` }}>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Sammlung</div>
                        <div className="flex flex-col gap-2">
                            {sammlung.map((z) => (
                                <div key={z.label}>
                                    <div className="mb-0.5 flex justify-between text-xs">
                                        <span className="font-bold text-[#3b2516]">{z.label}</span>
                                        <span className="font-bold tabular-nums text-[#6e4426]">{z.wert} / {z.max}</span>
                                    </div>
                                    <div className="h-2.5 w-full border-2" style={{ borderColor: HOLZ_P, background: "#c9b48a" }}>
                                        <div className="h-full" style={{ width: `${Math.min(100, (z.wert / Math.max(1, z.max)) * 100)}%`, background: z.wert >= z.max ? "#5faa45" : "#e0a82a" }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <GrosserKnopf
                    bild="/garden-assets/icons/hud/faehigkeiten_pixel.png"
                    titel="Fähigkeiten"
                    text={(skillStand?.punkteOffen || 0) > 0 ? `${skillStand.punkteOffen} Punkt${skillStand.punkteOffen === 1 ? "" : "e"} zu vergeben!` : "Dein Fähigkeitsbaum"}
                    onClick={() => { setProfilOffen(false); setSkillsOffen(true); }}
                    marke={(skillStand?.punkteOffen || 0) > 0 ? (
                        <span className="absolute -right-2 -top-2 min-w-[22px] animate-pulse border-2 bg-[#8a5ac8] px-1 text-center text-xs font-bold text-white" style={{ borderColor: HOLZ_P }}>{skillStand.punkteOffen}</span>
                    ) : null}
                />
                <GrosserKnopf
                    bild="/garden-assets/icons/hud/logbuch_pixel.png"
                    titel="Logbuch"
                    text={`${Object.keys(logbuch).length} von ${SEED_CATALOGUE.length} Arten geerntet`}
                    onClick={() => { setProfilOffen(false); setLogbuchOpen(true); }}
                />
            </div>

            {/* „Neue Saat" (Backend core/prestige.js) — eigenes Fenster */}
            {setNeueSaatOffen && (
                <button
                    type="button"
                    onClick={() => { setProfilOffen(false); setNeueSaatOffen(true); }}
                    className="mt-3 flex w-full items-center justify-between gap-3 border-[3px] px-3 py-2 text-left transition-transform duration-100 hover:-translate-y-0.5"
                    style={{ borderColor: HOLZ_P, background: prestigeStand?.bereit ? "#ffe066" : "#e8d7a8", boxShadow: `0 3px 0 0 ${HOLZ_P}` }}
                >
                    <span>
                        <span className="block text-sm font-bold text-[#3b2516]">Neue Saat</span>
                        <span className="block text-[11px] text-[#6e4426]">
                            {prestigeStand?.voll ? "Alle Sterne gesammelt" : prestigeStand?.bereit ? "Bereit — für immer einen Stern holen" : "Neu anfangen ab Level 100"}
                        </span>
                    </span>
                    <span className="shrink-0 text-lg tracking-widest text-[#c88a14]">{sterneText(sterne)}</span>
                </button>
            )}
        </StandFenster>
    );
}

/**
 * Einstellungen (06.11., Wunsch „Einstellungsmenü verbessern statt nur heller Kasten“):
 * Holzbrett unter dem Zahnrad, jede Gruppe auf einer Pergamentkarte, Pixel-Regler
 * (Klasse gf-regler in ui/menu/theme.css), Wahlknöpfe wie die Reiter der Läden und
 * Tastenkappen für die Kürzel.
 */
const E_HOLZ = "#3b2516";

function EKarte({ titel, children }) {
    return (
        <section className="relative border-[3px] bg-[#f3e3c3] px-3 pb-3 pt-4" style={{ borderColor: E_HOLZ, boxShadow: `0 3px 0 0 ${E_HOLZ}` }}>
            <span className="absolute -top-3 left-2 border-2 bg-[#fff3c4] px-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6e4426]" style={{ borderColor: E_HOLZ }}>
                {titel}
            </span>
            {children}
        </section>
    );
}

function ERegler({ label, wert, onWert }) {
    const prozent = Math.round(wert * 100);
    return (
        <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs font-bold text-[#3b2516]">{label}</span>
            <input
                type="range" min="0" max="1" step="0.05" value={wert}
                onChange={(e) => onWert(parseFloat(e.target.value))}
                onMouseUp={(e) => e.currentTarget.blur()}
                onTouchEnd={(e) => e.currentTarget.blur()}
                className="gf-regler min-w-0 flex-1"
                style={{ "--wert": `${prozent}%` }}
                aria-label={label}
            />
            <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-[#6e4426]">{prozent}%</span>
        </label>
    );
}

function EWahl({ optionen, aktiv, onWahl }) {
    return (
        <div className="flex gap-1.5">
            {optionen.map(([wert, label]) => {
                const an = aktiv === wert;
                return (
                    <button key={String(wert)} type="button"
                        onClick={(e) => { e.currentTarget.blur(); onWahl(wert); }}
                        className={`flex-1 border-[3px] px-2 py-1 text-[11px] font-bold ${an ? "translate-y-0.5 bg-[#ffd84a] text-[#3b2516]" : "bg-[#8a5a32] text-[#f3e3c3] hover:bg-[#9c6a3c]"}`}
                        style={{ borderColor: E_HOLZ, boxShadow: an ? `0 1px 0 0 ${E_HOLZ}` : `0 3px 0 0 ${E_HOLZ}` }}>
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

function EKnopf({ children, onClick, symbol }) {
    return (
        <button type="button" onClick={onClick}
            className="flex w-full items-center gap-2 border-[3px] bg-[#f3e3c3] px-3 py-1.5 text-left text-xs font-bold text-[#3b2516] hover:bg-[#fff3c4] active:translate-y-0.5"
            style={{ borderColor: E_HOLZ, boxShadow: `0 3px 0 0 ${E_HOLZ}` }}>
            {symbol}
            {children}
        </button>
    );
}

export function EinstellungenFenster({
    effectVolume, setEffectVolume, musicVolume, setMusicVolume, tagesInfo, laufenderPartyTitel,
    setThemeId, themeId, setRenderProfile, renderProfileRef, renderProfile, setSettingsOpen,
    setChangelogOpen, flushFarmStateToServer, setShowLobbyScreen,
    darf3d = false, sparGrafik = false, ansicht3d = false, setAnsicht3d,
}) {
    return (
        <div
            className="absolute top-[72px] left-5 z-50 flex w-80 max-h-[calc(100vh-6rem)] flex-col border-[3px]"
            style={{
                borderColor: "#2b1d12",
                boxShadow: "0 5px 0 0 #2b1d12",
                // Holzbretter wie bei den Ständen
                background: "repeating-linear-gradient(0deg, #8a5a32 0 22px, #7a4e2a 22px 24px)",
            }}
        >
            <div className="flex items-center justify-between gap-2 border-b-[3px] px-3 py-2" style={{ borderColor: "#2b1d12", background: "#6e4426" }}>
                <span className="border-2 bg-[#f3e3c3] px-2 py-0.5 text-sm font-bold text-[#3b2516]" style={{ borderColor: E_HOLZ }}>Einstellungen</span>
                <button type="button" aria-label="Schließen" onClick={() => setSettingsOpen(false)}
                    className="flex h-7 w-7 items-center justify-center border-2 bg-[#f3e3c3] text-sm font-bold text-[#a83a2a] hover:bg-[#fff3c4]"
                    style={{ borderColor: E_HOLZ, boxShadow: `0 2px 0 0 ${E_HOLZ}` }}>
                    <HudIcon.close size={14} />
                </button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-3 pb-3 pt-5">
                <EKarte titel="Klang">
                    <div className="space-y-2.5">
                        <ERegler label="Effekte" wert={effectVolume} onWert={setEffectVolume} />
                        <ERegler label="Musik" wert={musicVolume} onWert={setMusicVolume} />
                    </div>
                    {/* Während der Party läuft der Party-Titel über dieselbe Spur — umstellen
                        darf man trotzdem, es wirkt nur danach. */}
                    <div className="mt-3 mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#3b2516]">Musiktitel</span>
                        {tagesInfo.party && <span className="text-[10px] font-bold text-[#a83a6a]">Party: {laufenderPartyTitel?.name}</span>}
                    </div>
                    <EWahl optionen={THEME_TRACKS.map((t) => [t.id, t.name])} aktiv={themeId} onWahl={setThemeId} />
                </EKarte>

                <EKarte titel="Grafik">
                    <span className="mb-1.5 block text-xs font-bold text-[#3b2516]">Qualität</span>
                    <EWahl
                        optionen={[["low", "Niedrig"], ["medium", "Mittel"], ["high", "Hoch"]]}
                        aktiv={renderProfile.level}
                        onWahl={(level) => {
                            const preset = RENDER_QUALITY_PRESETS[level];
                            setRenderProfile(preset);
                            renderProfileRef.current = preset;
                        }}
                    />
                    {darf3d && (
                        <>
                            <span className="mb-1.5 mt-3 block text-xs font-bold text-[#3b2516]">Ansicht</span>
                            <EWahl optionen={[[false, "Draufsicht"], [true, "2,5D"]]} aktiv={ansicht3d} onWahl={(w) => setAnsicht3d?.(w)} />
                            {sparGrafik && (
                                <span className="mt-1.5 block text-[10px] leading-snug text-[#8a5a14]">
                                    Dein Browser meldet keine Grafikbeschleunigung — 2,5D kann ruckeln.
                                </span>
                            )}
                        </>
                    )}
                </EKarte>

                <EKarte titel="Tasten">
                    <div className="space-y-1.5">
                        {[
                            ["Markt", ["Shift", "1"]],
                            ["Shop-Areal", ["Shift", "2"]],
                            ["Eigene Farm", ["Shift", "3"]],
                            ["Benutzen", ["E"]],
                            ["Werkzeuge", ["1 – 4"]],
                            ["Deko-Ansicht", ["R"]],
                            ["Rucksack", ["Tab"]],
                            ["Mehrere ernten", ["Shift", "Ziehen"]],
                        ].map(([label, tasten]) => (
                            <div key={label} className="flex items-center justify-between gap-2 text-xs text-[#3b2516]">
                                <span>{label}</span>
                                <span className="flex items-center gap-1">
                                    {tasten.map((t, i) => (
                                        <React.Fragment key={t}>
                                            {i > 0 && <span className="text-[10px] font-bold text-[#8a7a5a]">+</span>}
                                            <kbd className="min-w-[1.6rem] border-2 bg-[#fffaf0] px-1.5 text-center text-[10px] font-bold text-[#3b2516]"
                                                style={{ borderColor: E_HOLZ, boxShadow: `0 2px 0 0 ${E_HOLZ}` }}>{t}</kbd>
                                        </React.Fragment>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                </EKarte>

                <div className="flex flex-col gap-2.5">
                    <EKnopf symbol={<HudIcon.changelog size={14} className="shrink-0" />}
                        onClick={() => { setSettingsOpen(false); setChangelogOpen(true); }}>
                        Changelog
                    </EKnopf>
                    <EKnopf onClick={async () => {
                        await flushFarmStateToServer();
                        setSettingsOpen(false);
                        setShowLobbyScreen(true);
                    }}>
                        Zurück zum Hauptmenü
                    </EKnopf>
                    <EKnopf onClick={() => { window.location.href = "https://vnmvalentin.de"; }}>
                        Zur Website
                    </EKnopf>
                </div>
            </div>
        </div>
    );
}

export function NeuerungenFenster({
    setChangelogOpen, offeneChangelogs, setOffeneChangelogs,
}) {
    return (
        <StandFenster markise={false} inhaltHintergrund="#f3e3c3"
            titel="Changelog"
            untertitel={`Neu in Version ${(CHANGELOG_ENTRIES[0]?.version || "").replace(/^v/, "")}`}
            onClose={() => setChangelogOpen(false)}
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
                        <section key={release.version} className={neueste ? "" : "border-t border-[#3b2516] pt-2"}>
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
                                className={`flex w-full items-baseline gap-2 text-left ${neueste ? "cursor-default pb-2 mb-2 border-b border-[#3b2516]" : "py-1"}`}
                            >
                                {!neueste ? (
                                    <HudIcon.chevron size={13} className={`shrink-0 self-center transition-transform ${offen ? "" : "-rotate-90"}`} />
                                ) : null}
                                <h3 className={`text-sm font-semibold ${neueste ? "text-[#3b2516]" : "text-[#6e4426]"}`}>{release.version}</h3>
                                {neueste ? (
                                    <span className="rounded-md border border-[#6a40a8] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6a40a8]">
                                        Neu
                                    </span>
                                ) : null}
                                <span className="min-w-0 flex-1 truncate text-xs text-[#6e4426]">{release.title}</span>
                            </button>
                            {offen ? release.groups.map((group) => (
                                <div key={group.heading} className="mb-3">
                                    <h4 className="text-[11px] uppercase tracking-wider text-[#6e4426] mb-1.5">
                                        {group.heading}
                                    </h4>
                                    <ul className="space-y-1">
                                        {group.items.map((item, i) => (
                                            <li key={i} className="text-xs text-[#3b2516] leading-relaxed flex gap-2">
                                                <span className="text-[#8a7a5a] select-none">–</span>
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
        </StandFenster>
    );
}
