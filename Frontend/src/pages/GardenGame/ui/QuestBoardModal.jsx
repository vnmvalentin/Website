// ui/QuestBoardModal.jsx
// Das Missionsbrett: tägliche und wöchentliche Aufgaben mit Gold- und
// XP-Belohnung.
//
// Katalog UND Fortschritt kommen vom Server (GET /api/garden/quests) — wie beim
// Fähigkeitsbaum: eine Anzeige, die etwas anderes verspricht als die Route
// tatsächlich auszahlt, wäre schlimmer als gar keine Anzeige. Welche Missionen
// gerade laufen, entscheidet allein die Uhrzeit (core/quests.js) — hier wird nur
// dargestellt, nie gewürfelt.
//
// Reiter „Händler" (02.11.): Händler-Aufträge aus core/auftraege.js. Auch hier
// würfelt der Browser nichts — er zählt nur mit, wie viel Passendes gerade im
// Rucksack liegt, damit die Anzeige beim Ernten mitläuft. Liefern prüft der
// Server und nimmt dort die günstigsten passenden Stücke.
import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GardenModal, PrimaryButton, TabBar, ProgressBar, TimerTag, RarityLabel, LeerHinweis } from './gardenUi';
import WettbewerbAnsicht from './WettbewerbAnsicht';
import SaisonzieleAnsicht from './SaisonzieleAnsicht';
import { HudIcon } from './gameIcons';
import { ItemIcon } from './ItemIcon';
import { hydrateHarvestedItem } from '../engine/PlantSystem';

// Tage mit rein, sonst zeigte der Wochen-Reset bis zu "167h 59m" — kein
// Mensch überschlägt daraus schnell "fast eine Woche".
function formatCountdown(ms) {
    const rest = Math.max(0, Number(ms) || 0);
    const tage = Math.floor(rest / 86400000);
    const stunden = Math.floor((rest % 86400000) / 3600000);
    const minuten = Math.floor((rest % 3600000) / 60000);
    if (tage > 0) return `${tage}d ${stunden}h`;
    if (stunden > 0) return `${stunden}h ${minuten}m`;
    return `${minuten}m`;
}

function QuestZeile({ quest, onAbholen, busy }) {
    const anteil = quest.ziel > 0 ? quest.fortschritt / quest.ziel : 0;
    return (
        <div className={`p-3 rounded-2xl border transition-colors ${
            quest.abgeholt
                ? "border-slate-800 bg-slate-950/40 opacity-60"
                : quest.erreicht
                    ? "border-emerald-600/60 bg-emerald-950/20"
                    : "border-slate-800 bg-slate-900/50"
        }`}>
            <div className="mb-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{quest.name}</div>
                    <div className="text-[11px] text-slate-400">{quest.beschreibung}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-bold tabular-nums">
                    <span className="flex items-center gap-1 text-amber-300">
                        <HudIcon.gold size={13} /> {quest.gold.toLocaleString("de-DE")}
                    </span>
                    <span className="flex items-center gap-1 text-violet-300">
                        <HudIcon.star size={12} /> {quest.xp}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2.5">
                <div className="flex-1">
                    <ProgressBar value={anteil} className={quest.erreicht ? "bg-emerald-500" : "bg-violet-500"} />
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                    {Math.min(quest.fortschritt, quest.ziel).toLocaleString("de-DE")}/{quest.ziel.toLocaleString("de-DE")}
                </span>
            </div>
            {!quest.abgeholt && (
                <PrimaryButton
                    onClick={() => onAbholen(quest.id)}
                    disabled={!quest.erreicht || busy}
                    className="mt-2.5 w-full py-1.5 text-xs"
                >
                    {quest.erreicht ? "Belohnung abholen" : "Noch nicht geschafft"}
                </PrimaryButton>
            )}
            {quest.abgeholt && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <HudIcon.check size={12} /> Abgeholt
                </div>
            )}
        </div>
    );
}

/** Gleiche Regel wie erfuellt() in core/auftraege.js — nur für die Anzeige. */
function passtZumAuftrag(item, auftrag) {
    if (!item || item.seedId !== auftrag.seedId) return false;
    if (auftrag.merkmal === "gross") return (Number(item.size) || 0) >= 35;
    if (auftrag.merkmal === "golden") {
        const name = String(item.specialData?.name || "").toLowerCase();
        return name === "golden" || name === "rainbow";
    }
    if (auftrag.merkmal === "wetter") {
        return (Array.isArray(item.statusEffects) && item.statusEffects.length > 0) || Boolean(item.statusEffect);
    }
    return true;
}

function AuftragZeile({ auftrag, rucksack, onLiefern, onAblehnen, busy }) {
    const vorhanden = Array.isArray(rucksack)
        ? rucksack.filter((it) => passtZumAuftrag(it, auftrag)).length
        : (auftrag.vorhanden || 0);
    const bereit = vorhanden >= auftrag.anzahl;
    const bild = hydrateHarvestedItem({ seedId: auftrag.seedId, singleUse: auftrag.singleUse, name: auftrag.name, emoji: auftrag.emoji });
    return (
        <div className={`p-3 rounded-2xl border transition-colors ${
            bereit ? "border-emerald-600/60 bg-emerald-950/20" : "border-slate-800 bg-slate-900/50"
        }`}>
            <div className="mb-1.5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950/60">
                    <ItemIcon item={bild} className="w-9 h-9" emojiClassName="text-2xl" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">{auftrag.anzahl}× {auftrag.name}</span>
                        <RarityLabel rarity={auftrag.rarity} />
                    </div>
                    <div className="text-[11px] text-slate-400">
                        {auftrag.merkmalText ? `Nur ${auftrag.merkmalText} · ` : ""}läuft ab in {formatCountdown(auftrag.bis - Date.now())}
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-bold tabular-nums">
                    <span className="flex items-center gap-1 text-amber-300">
                        <HudIcon.gold size={13} /> {auftrag.gold.toLocaleString("de-DE")}
                    </span>
                    <span className="flex items-center gap-1 text-violet-300">
                        <HudIcon.star size={12} /> {auftrag.xp.toLocaleString("de-DE")}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2.5">
                <div className="flex-1">
                    <ProgressBar value={auftrag.anzahl > 0 ? vorhanden / auftrag.anzahl : 0} className={bereit ? "bg-emerald-500" : "bg-violet-500"} />
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                    {Math.min(vorhanden, auftrag.anzahl)}/{auftrag.anzahl} im Rucksack
                </span>
            </div>
            <div className="mt-2.5 flex gap-2">
                <PrimaryButton onClick={() => onLiefern(auftrag.id)} disabled={!bereit || busy} className="flex-1 py-1.5 text-xs">
                    {bereit ? "Liefern" : "Noch nicht genug"}
                </PrimaryButton>
                <button
                    type="button"
                    onClick={() => onAblehnen(auftrag.id)}
                    disabled={busy}
                    title="Neuer Auftrag in 15 Minuten"
                    className="shrink-0 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 disabled:opacity-50"
                >
                    Ablehnen
                </button>
            </div>
        </div>
    );
}

/** „Freitag 18 Uhr" in der Zeitzone des Spielers. */
function wochentagUhr(ms) {
    const d = new Date(ms);
    const tag = d.toLocaleDateString("de-DE", { weekday: "long" });
    return `${tag} ${d.getHours()} Uhr`;
}

/**
 * Erntefest (world/erntefest.js): gemeinsamer Fortschritt aller Spieler, eigene
 * Punkte und Stufen, nach dem Fest die Belohnung. Alle Zahlen vom Server.
 */
function ErntefestAnsicht({ fest, onAbholen, busy }) {
    if (!fest) return <LeerHinweis>Erntefest wird geladen…</LeerHinweis>;
    const gemeinsam = fest.ziel > 0 ? Math.min(1, fest.summe / fest.ziel) : 0;
    const naechsteStufe = (fest.stufen || []).find((s) => fest.punkte < s.ab);
    const aktuelleStufe = [...(fest.stufen || [])].reverse().find((s) => fest.punkte >= s.ab);
    const b = fest.abholbar;
    return (
        <div className="space-y-3">
            <p className="text-[11px] text-slate-400">
                Jedes Wochenende ({wochentagUhr(fest.aktiv || !fest.vorbei ? fest.beginn : fest.naechsterBeginn)} bis {wochentagUhr(fest.aktiv || !fest.vorbei ? fest.ende : fest.naechsterBeginn + (fest.ende - fest.beginn))}) sammeln alle Spieler gemeinsam Punkte. Jede Ernte zählt so viel wie ihre Erfahrung, Saisonware {fest.saisonFaktor}×. Wird das gemeinsame Ziel erreicht, gibt es die volle Belohnung, sonst {fest.trostProzent} %.
            </p>

            {b && (
                <div className="p-3 rounded-2xl border border-emerald-600/60 bg-emerald-950/20">
                    <div className="text-sm font-semibold text-white">Belohnung vom letzten Fest</div>
                    {b.stufe ? (
                        <>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                                {b.punkte.toLocaleString("de-DE")} Punkte · Stufe {b.stufeName} · {b.geschafft ? "Ziel erreicht" : `Ziel verfehlt (${fest.trostProzent} %)`}
                            </div>
                            <div className="mt-2 flex items-center gap-3 text-xs font-bold tabular-nums">
                                <span className="flex items-center gap-1 text-amber-300"><HudIcon.gold size={13} /> {b.gold.toLocaleString("de-DE")}</span>
                                <span className="flex items-center gap-1 text-violet-300"><HudIcon.star size={12} /> {b.xp.toLocaleString("de-DE")}</span>
                            </div>
                            <PrimaryButton onClick={onAbholen} disabled={busy} className="mt-2.5 w-full py-1.5 text-xs">Belohnung abholen</PrimaryButton>
                        </>
                    ) : (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                            {b.punkte.toLocaleString("de-DE")} Punkte — für eine Belohnung braucht es mindestens {(fest.stufen?.[0]?.ab || 0).toLocaleString("de-DE")}.
                        </div>
                    )}
                </div>
            )}

            <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/50">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                        {fest.aktiv ? "Erntefest läuft" : "Nächstes Erntefest"}
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-400">
                        {fest.aktiv ? `endet in ${formatCountdown(fest.ende - Date.now())}` : `beginnt in ${formatCountdown(fest.naechsterBeginn - Date.now())}`}
                    </span>
                </div>
                <div className="text-[11px] text-slate-400 mb-1">Gemeinsam ({fest.teilnehmer} dabei)</div>
                <ProgressBar value={gemeinsam} className={gemeinsam >= 1 ? "bg-emerald-500" : "bg-amber-500"} height="h-2.5" />
                <div className="mt-1 text-right text-[11px] font-medium tabular-nums text-slate-400">
                    {fest.summe.toLocaleString("de-DE")} / {fest.ziel.toLocaleString("de-DE")}
                </div>
            </div>

            <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/50">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Deine Punkte</span>
                    <span className="text-sm font-bold tabular-nums text-amber-300">{fest.punkte.toLocaleString("de-DE")}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {(fest.stufen || []).map((s) => {
                        const erreicht = fest.punkte >= s.ab;
                        return (
                            <div key={s.id} className={`rounded-xl border px-2 py-1.5 text-center ${
                                erreicht ? "border-amber-600/70 bg-amber-950/30" : "border-slate-800 bg-slate-950/40"
                            }`}>
                                <div className={`text-xs font-bold ${erreicht ? "text-amber-200" : "text-slate-400"}`}>{s.name}</div>
                                <div className="text-[10px] tabular-nums text-slate-500">ab {s.ab.toLocaleString("de-DE")}</div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                    {naechsteStufe
                        ? `Noch ${(naechsteStufe.ab - fest.punkte).toLocaleString("de-DE")} Punkte bis ${naechsteStufe.name}.`
                        : `Höchste Stufe erreicht${aktuelleStufe ? ` (${aktuelleStufe.name})` : ""}.`}
                </div>
            </div>
        </div>
    );
}

function AuftragPause({ pauseBis }) {
    return (
        <div className="p-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 text-center text-[11px] text-slate-500">
            Neuer Auftrag in {formatCountdown(pauseBis - Date.now())}
        </div>
    );
}

export default function QuestBoardModal({ offen, onClose, onBack, daten, onAbholen, rucksack, onLiefern, onAblehnen, onAuftraegeNeuLaden, onErntefestAbholen, ladeWettbewerb, ladeSaisonziele }) {
    const [tab, setTab] = useState("taeglich");
    const [laufendeId, setLaufendeId] = useState(null);
    const plaetze = daten?.auftraege?.plaetze || [];

    // Eine Pause, die abläuft, während das Brett offen ist, soll ihren neuen
    // Auftrag auch zeigen — der Server würfelt ihn beim nächsten Abruf.
    const naechstePause = plaetze.filter((p) => !p.seedId).reduce((min, p) => Math.min(min, p.pauseBis || Infinity), Infinity);
    useEffect(() => {
        if (!offen || tab !== "haendler" || !Number.isFinite(naechstePause) || !onAuftraegeNeuLaden) return undefined;
        const warte = Math.max(1000, naechstePause - Date.now() + 1000);
        const t = setTimeout(() => onAuftraegeNeuLaden(), Math.min(warte, 2 ** 31 - 1));
        return () => clearTimeout(t);
    }, [offen, tab, naechstePause, onAuftraegeNeuLaden]);

    if (!offen) return null;

    const taeglich = daten?.taeglich || [];
    const woechentlich = daten?.woechentlich || [];
    const liste = tab === "taeglich" ? taeglich : woechentlich;
    // Wieder eine eigene Bubble statt Fließtext (Feedback 31.08., zweite Runde)
    // — UND nur noch die Zeit des offenen Tabs, nicht beide auf einmal.
    const naechsteAb = tab === "taeglich" ? daten?.naechsteTaeglicheAb : daten?.naechsteWoechentlicheAb;
    const auftraegeOffen = plaetze.filter((p) => p.seedId);

    const tabs = [
        { key: "taeglich", label: "Täglich", icon: HudIcon.check, count: taeglich.filter((q) => q.abgeholt).length + "/" + taeglich.length },
        { key: "woechentlich", label: "Wöchentlich", icon: CalendarDays, count: woechentlich.filter((q) => q.abgeholt).length + "/" + woechentlich.length },
        { key: "haendler", label: "Händler", icon: HudIcon.shopArea, count: auftraegeOffen.length },
        { key: "erntefest", label: "Erntefest", icon: HudIcon.farm, count: daten?.erntefest?.abholbar?.stufe ? "!" : (daten?.erntefest?.aktiv ? "läuft" : undefined) },
        // Rekord-Ernte der Woche (Backend world/wettbewerb.js) — lädt seine Daten selbst.
        ...(ladeWettbewerb ? [{ key: "wettbewerb", label: "Wettbewerb", icon: HudIcon.level }] : []),
        ...(ladeSaisonziele ? [{ key: "jahreszeit", label: "Jahreszeit", icon: HudIcon.sun }] : []),
    ];

    const mitSperre = (fn) => async (id) => {
        if (laufendeId || !fn) return;
        setLaufendeId(id);
        try { await fn(id); } finally { setLaufendeId(null); }
    };
    const abholenMitSperre = mitSperre(onAbholen);

    return (
        <GardenModal
            title="Missionsbrett"
            breite="gross"
            headerRight={tab === "haendler" || tab === "erntefest" || tab === "wettbewerb" || tab === "jahreszeit" ? null : (
                <TimerTag
                    title={tab === "taeglich" ? "Nächste tägliche Mission" : "Nächste wöchentliche Mission"}
                    label={formatCountdown((naechsteAb || 0) - Date.now())}
                />
            )}
            onClose={onClose}
            onBack={onBack}
            toolbar={<TabBar className="-mb-2" tabs={tabs} active={tab} onSelect={setTab} />}
        >
            {tab === "wettbewerb" ? (
                <WettbewerbAnsicht laden={ladeWettbewerb} />
            ) : tab === "jahreszeit" ? (
                <SaisonzieleAnsicht laden={ladeSaisonziele} />
            ) : tab === "erntefest" ? (
                <ErntefestAnsicht
                    fest={daten?.erntefest}
                    busy={laufendeId === "erntefest"}
                    onAbholen={() => mitSperre(onErntefestAbholen)("erntefest")}
                />
            ) : tab === "haendler" ? (
                <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">
                        Der Händler zahlt mehr als der Verkauf — und je höher dein Level, desto mehr. Geliefert wird aus dem Rucksack, immer die günstigsten passenden Stücke.
                    </p>
                    {plaetze.length === 0 && (
                        <LeerHinweis>Aufträge werden geladen…</LeerHinweis>
                    )}
                    {plaetze.map((p) => (p.seedId ? (
                        <AuftragZeile
                            key={p.id}
                            auftrag={p}
                            rucksack={rucksack}
                            onLiefern={mitSperre(onLiefern)}
                            onAblehnen={mitSperre(onAblehnen)}
                            busy={laufendeId === p.id}
                        />
                    ) : (
                        <AuftragPause key={`pause-${p.platz}`} pauseBis={p.pauseBis} />
                    )))}
                </div>
            ) : liste.length === 0 ? (
                <LeerHinweis>Gerade keine Missionen verfügbar.</LeerHinweis>
            ) : (
                <div className="space-y-2">
                    {liste.map((quest) => (
                        <QuestZeile key={quest.id} quest={quest} onAbholen={abholenMitSperre} busy={laufendeId === quest.id} />
                    ))}
                </div>
            )}
        </GardenModal>
    );
}
