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
import { passtZumAuftrag } from "./auftragPasst";
import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { TimerTag } from './gardenUi';
import { StandFenster, StandReiter, Zettel, Fortschritt, Belohnung, KaufKnopf, NebenKnopfHolz } from './laden/Marktstand';
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
        <Zettel erledigt={quest.abgeholt} bereit={quest.erreicht && !quest.abgeholt}>
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight text-[#3b2516]">{quest.name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-[#6e4426]">{quest.beschreibung}</div>
                </div>
                <Belohnung gold={quest.gold} xp={quest.xp} />
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1"><Fortschritt wert={anteil} fertig={quest.erreicht} /></div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#6e4426]">
                    {Math.min(quest.fortschritt, quest.ziel).toLocaleString("de-DE")}/{quest.ziel.toLocaleString("de-DE")}
                </span>
            </div>
            <div className="mt-2.5 flex justify-end">
                {quest.abgeholt ? (
                    <span className="text-[11px] font-bold text-[#3f7a35]">Abgeholt</span>
                ) : (
                    <KaufKnopf onClick={() => onAbholen(quest.id)} disabled={!quest.erreicht || busy}>
                        {quest.erreicht ? "Belohnung abholen" : "Noch nicht geschafft"}
                    </KaufKnopf>
                )}
            </div>
        </Zettel>
    );
}

// passtZumAuftrag: gemeinsame Regel in ui/auftragPasst.js (auch für die Marken über den Ständen)

function AuftragZeile({ auftrag, rucksack, onLiefern, onAblehnen, busy }) {
    const vorhanden = Array.isArray(rucksack)
        ? rucksack.filter((it) => passtZumAuftrag(it, auftrag)).length
        : (auftrag.vorhanden || 0);
    const bereit = vorhanden >= auftrag.anzahl;
    const bild = hydrateHarvestedItem({ seedId: auftrag.seedId, singleUse: auftrag.singleUse, name: auftrag.name, emoji: auftrag.emoji });
    return (
        <Zettel bereit={bereit}>
            <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border-[3px] bg-[#fffaf0]" style={{ borderColor: "#3b2516" }}>
                    <ItemIcon item={bild} className="h-12 w-12" emojiClassName="text-3xl" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a32]">Lieferschein</div>
                    <div className="truncate text-base font-bold leading-tight text-[#3b2516]">{auftrag.anzahl}× {auftrag.name}</div>
                    <div className="mt-0.5 text-[11px] text-[#6e4426]">
                        {auftrag.merkmalText ? `Nur ${auftrag.merkmalText} · ` : ""}läuft ab in {formatCountdown(auftrag.bis - Date.now())}
                    </div>
                </div>
                <Belohnung gold={auftrag.gold} xp={auftrag.xp} />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1"><Fortschritt wert={auftrag.anzahl > 0 ? vorhanden / auftrag.anzahl : 0} fertig={bereit} /></div>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#6e4426]">
                    {Math.min(vorhanden, auftrag.anzahl)}/{auftrag.anzahl} im Rucksack
                </span>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
                <NebenKnopfHolz onClick={() => onAblehnen(auftrag.id)} disabled={busy} title="Neuer Auftrag in 15 Minuten">Ablehnen</NebenKnopfHolz>
                <KaufKnopf onClick={() => onLiefern(auftrag.id)} disabled={!bereit || busy}>
                    {bereit ? "Liefern" : "Noch nicht genug"}
                </KaufKnopf>
            </div>
        </Zettel>
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
    if (!fest) return <div className="py-6 text-center text-sm text-[#f3e3c3]">Erntefest wird geladen…</div>;
    const gemeinsam = fest.ziel > 0 ? Math.min(1, fest.summe / fest.ziel) : 0;
    const naechsteStufe = (fest.stufen || []).find((s) => fest.punkte < s.ab);
    const aktuelleStufe = [...(fest.stufen || [])].reverse().find((s) => fest.punkte >= s.ab);
    const b = fest.abholbar;
    const MEDAILLE = { 0: ["#c8864a", "#8a5a2a"], 1: ["#c8ccd4", "#7d858c"], 2: ["#ffd84a", "#b8861a"] };
    return (
        <div className="mt-3 space-y-4">
            {b && (
                <Zettel bereit={Boolean(b.stufe)}>
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-sm font-bold text-[#3b2516]">Belohnung vom letzten Fest</div>
                            <div className="mt-0.5 text-[11px] text-[#6e4426]">
                                {b.stufe
                                    ? `${b.punkte.toLocaleString("de-DE")} Punkte · Stufe ${b.stufeName} · ${b.geschafft ? "Ziel erreicht" : `Ziel verfehlt (${fest.trostProzent} %)`}`
                                    : `${b.punkte.toLocaleString("de-DE")} Punkte — für eine Belohnung braucht es mindestens ${(fest.stufen?.[0]?.ab || 0).toLocaleString("de-DE")}.`}
                            </div>
                        </div>
                        {b.stufe && <Belohnung gold={b.gold} xp={b.xp} />}
                    </div>
                    {b.stufe && (
                        <div className="mt-2.5 flex justify-end">
                            <KaufKnopf onClick={onAbholen} disabled={busy}>Belohnung abholen</KaufKnopf>
                        </div>
                    )}
                </Zettel>
            )}

            <Zettel bereit={gemeinsam >= 1}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#3b2516]">{fest.aktiv ? "Das Erntefest läuft!" : "Nächstes Erntefest"}</span>
                    <span className="border-2 bg-[#fff3c4] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#3b2516]" style={{ borderColor: "#3b2516" }}>
                        {fest.aktiv ? `endet in ${formatCountdown(fest.ende - Date.now())}` : `beginnt in ${formatCountdown(fest.naechsterBeginn - Date.now())}`}
                    </span>
                </div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-[#6e4426]">
                    <span>Gemeinsames Ziel · {fest.teilnehmer} dabei</span>
                    <span className="font-bold tabular-nums">{fest.summe.toLocaleString("de-DE")} / {fest.ziel.toLocaleString("de-DE")}</span>
                </div>
                <Fortschritt wert={gemeinsam} fertig={gemeinsam >= 1} />
                <p className="mt-2 text-[11px] leading-snug text-[#6e4426]">
                    Jedes Wochenende ({wochentagUhr(fest.aktiv || !fest.vorbei ? fest.beginn : fest.naechsterBeginn)} bis {wochentagUhr(fest.aktiv || !fest.vorbei ? fest.ende : fest.naechsterBeginn + (fest.ende - fest.beginn))}) sammeln alle zusammen Punkte. Jede Ernte zählt so viel wie ihre Erfahrung, Saisonware {fest.saisonFaktor}×. Schafft ihr das Ziel, gibt es die volle Belohnung, sonst {fest.trostProzent} %.
                </p>
            </Zettel>

            <Zettel>
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#3b2516]">Deine Punkte</span>
                    <span className="border-2 bg-[#ffe066] px-2 py-0.5 text-sm font-bold tabular-nums text-[#3b2516]" style={{ borderColor: "#3b2516" }}>{fest.punkte.toLocaleString("de-DE")}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {(fest.stufen || []).map((st, i) => {
                        const erreicht = fest.punkte >= st.ab;
                        const [hell, dunkel] = MEDAILLE[i] || MEDAILLE[0];
                        return (
                            <div key={st.id} className={`flex flex-col items-center border-[3px] px-2 py-2 text-center ${erreicht ? "" : "opacity-55"}`}
                                style={{ borderColor: "#3b2516", background: erreicht ? "#fff3c4" : "#e8d7a8" }}>
                                {/* Medaille: Band und Scheibe aus Bildpunkten */}
                                <div className="flex gap-0.5"><span className="h-3 w-2" style={{ background: "#c8403a" }} /><span className="h-3 w-2" style={{ background: "#3a6ab0" }} /></div>
                                <span className="-mt-0.5 flex h-8 w-8 items-center justify-center border-[3px] text-[11px] font-bold"
                                    style={{ borderColor: "#3b2516", background: erreicht ? hell : "#c9b48a", color: dunkel }}>{i + 1}</span>
                                <div className="mt-1 text-xs font-bold text-[#3b2516]">{st.name}</div>
                                <div className="text-[10px] tabular-nums text-[#6e4426]">ab {st.ab.toLocaleString("de-DE")}</div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-2.5 text-[11px] text-[#6e4426]">
                    {naechsteStufe
                        ? `Noch ${(naechsteStufe.ab - fest.punkte).toLocaleString("de-DE")} Punkte bis ${naechsteStufe.name}.`
                        : `Höchste Stufe erreicht${aktuelleStufe ? ` (${aktuelleStufe.name})` : ""}.`}
                </div>
            </Zettel>
        </div>
    );
}

function AuftragPause({ pauseBis }) {
    return (
        <div className="flex min-h-[150px] flex-col items-center justify-center border-[3px] border-dashed p-3 text-center" style={{ borderColor: "#c9b48a" }}>
            <span className="text-xs font-bold text-[#f3e3c3]">Der Händler packt aus …</span>
            <span className="mt-1 text-[11px] text-[#c9b48a]">Neuer Auftrag in {formatCountdown(pauseBis - Date.now())}</span>
        </div>
    );
}

/**
 * `modus` (05.11.): "brett" = Missionsbrett (Missionen, Wettbewerb, Jahreszeit),
 * "haendler" / "erntefest" = eigener Stand auf dem Dorfplatz, nur diese Ansicht.
 */
export default function QuestBoardModal({ offen, modus = "brett", onClose, onBack, daten, onAbholen, rucksack, onLiefern, onAblehnen, onAuftraegeNeuLaden, onErntefestAbholen, ladeWettbewerb, ladeSaisonziele }) {
    const [brettTab, setTab] = useState("taeglich");
    const tab = modus === "haendler" || modus === "erntefest" ? modus : brettTab;
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

    const tabs = [
        { key: "taeglich", label: "Täglich", icon: HudIcon.check, count: taeglich.filter((q) => q.abgeholt).length + "/" + taeglich.length },
        { key: "woechentlich", label: "Wöchentlich", icon: CalendarDays, count: woechentlich.filter((q) => q.abgeholt).length + "/" + woechentlich.length },
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
        <StandFenster
            titel={modus === "haendler" ? "Händler" : modus === "erntefest" ? "Erntefest" : "Missionsbrett"}
            untertitel={modus === "haendler" ? "Liefere, was er sucht — er zahlt mehr als der Markt"
                : modus === "erntefest" ? "Ernte gemeinsam für das große Fest"
                    : "Aufgaben für heute und diese Woche"}
            farbe={modus === "haendler" ? "blau" : modus === "erntefest" ? "orange" : "gold"}
            bild={modus === "haendler" ? "/garden-assets/world/haendler.png" : modus === "erntefest" ? "/garden-assets/world/erntefest.png" : "/garden-assets/world/quest_board.png"}
            kopfRechts={tab === "haendler" || tab === "erntefest" || tab === "wettbewerb" || tab === "jahreszeit" ? null : (
                <TimerTag
                    title={tab === "taeglich" ? "Nächste tägliche Mission" : "Nächste wöchentliche Mission"}
                    label={formatCountdown((naechsteAb || 0) - Date.now())}
                />
            )}
            onClose={onClose}
            onBack={onBack}
            reiter={modus === "brett" ? (
                <StandReiter aktiv={tab} onWaehlen={setTab} reiter={tabs.map((t) => ({ key: t.key, label: t.label, anzahl: t.count }))} />
            ) : null}
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
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {plaetze.length === 0 && (
                        <div className="py-6 text-center text-sm text-[#f3e3c3] md:col-span-2">Aufträge werden geladen…</div>
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
                <div className="py-6 text-center text-sm text-[#f3e3c3]">Gerade keine Missionen verfügbar.</div>
            ) : (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {liste.map((quest) => (
                        <QuestZeile key={quest.id} quest={quest} onAbholen={abholenMitSperre} busy={laufendeId === quest.id} />
                    ))}
                </div>
            )}
        </StandFenster>
    );
}
