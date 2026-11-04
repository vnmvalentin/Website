// ui/fenster/ProfilFenster.jsx
// Profil, Einstellungen und Neuerungen — die Fenster rund um den eigenen Account.
// Reine Anzeige — Zustand und Aktionen kommen aus GameContainer.jsx.
import React from "react";
import { GardenModal } from "../gardenUi";
import { HudIcon } from "../gameIcons";
import { formatGold } from "../gardenTokens";
import { SEED_CATALOGUE } from "../../engine/PlantSystem";
import { THEME_TRACKS, RENDER_QUALITY_PRESETS } from "../../engine/gameConstants";
import { CHANGELOG_ENTRIES } from "../../data/changelogEntries";
import { sterneText, hatKosmetik, TITEL } from "../prestige";

/** Eine Logbuch-Seite ist komplett — muss zu logbuchVollstaendig (Backend core/economy.js) passen. */
function logbuchKomplett(e) {
    if (!e) return false;
    const f = new Set(e.effekte || []);
    return e.min === 1 && e.max === 50 && ["Golden", "Rainbow", "wet", "frozen", "charged", "moonlit"].every((x) => f.has(x));
}

export function ProfilFenster({
    setProfilOffen, playerAppearance, localPlayerNameRef, skillStand, gold, goldGesamt,
    setSkillsOffen, setWardrobeOpen, setLogbuchOpen, logbuch, wettbewerbSiege = [],
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
    return (
        <GardenModal
            title="Profil"
            onClose={() => setProfilOffen(false)}
            breite="klein"
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
                        <div className="text-sm text-slate-400">
                            Level {skillStand?.level || 1}
                            {sterne > 0 && <span className="ml-2 text-amber-300">{"★".repeat(sterne)}</span>}
                        </div>
                        {hatKosmetik(sterne, "titel") && <div className="text-xs font-semibold text-amber-300">{TITEL}</div>}
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
                    {/* Abzeichen aus dem Wochenwettbewerb (Backend world/wettbewerb.js). */}
                    {wettbewerbSiege.length > 0 && (
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                <HudIcon.level size={13} className="shrink-0" /> Wochenwettbewerb
                            </span>
                            <span className="flex flex-wrap justify-end gap-1">
                                {[1, 2, 3].map((p) => {
                                    const n = wettbewerbSiege.filter((s) => s.platz === p).length;
                                    return n ? (
                                        <span key={p} className="rounded-md border border-amber-700/60 px-1.5 py-px text-[11px] font-semibold text-amber-200">
                                            {n}× Platz {p}
                                        </span>
                                    ) : null;
                                })}
                            </span>
                        </div>
                    )}
                </div>

                {/* Sammelziele — Fortschritt quer durch alle Sammlungen. */}
                <div className="flex flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sammlung</div>
                    {sammlung.map((z) => (
                        <div key={z.label}>
                            <div className="mb-0.5 flex justify-between text-xs">
                                <span className={z.wert >= z.max ? "text-emerald-300" : "text-slate-300"}>{z.label}</span>
                                <span className="tabular-nums text-slate-400">{z.wert} / {z.max}</span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded bg-slate-800">
                                <div className={z.wert >= z.max ? "h-full bg-emerald-500" : "h-full bg-amber-500"} style={{ width: `${Math.min(100, (z.wert / Math.max(1, z.max)) * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* „Neue Saat" (Backend core/prestige.js) — eigenes Fenster. */}
                {setNeueSaatOffen && (
                    <button
                        type="button"
                        onClick={() => { setProfilOffen(false); setNeueSaatOffen(true); }}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-slate-800/70 ${prestigeStand?.bereit ? "border-amber-600 text-amber-200" : "border-slate-800 text-slate-300 hover:border-slate-600"}`}
                    >
                        <span>
                            <span className="block text-xs font-semibold">Neue Saat</span>
                            <span className="block text-[11px] text-slate-400">
                                {prestigeStand?.voll ? "Alle Sterne gesammelt" : prestigeStand?.bereit ? "Bereit — für immer einen Stern holen" : "Neu anfangen ab Level 100"}
                            </span>
                        </span>
                        <span className="shrink-0 tracking-widest text-amber-300">{sterneText(sterne)}</span>
                    </button>
                )}

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
    );
}

export function EinstellungenFenster({
    effectVolume, setEffectVolume, musicVolume, setMusicVolume, tagesInfo, laufenderPartyTitel,
    setThemeId, themeId, setRenderProfile, renderProfileRef, renderProfile, setSettingsOpen,
    setChangelogOpen, flushFarmStateToServer, setShowLobbyScreen,
}) {
    return (
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
    );
}

export function NeuerungenFenster({
    setChangelogOpen, offeneChangelogs, setOffeneChangelogs,
}) {
    return (
        <GardenModal
            title="Changelog"
            subtitle={`Neu in Version ${(CHANGELOG_ENTRIES[0]?.version || "").replace(/^v/, "")}`}
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
    );
}
