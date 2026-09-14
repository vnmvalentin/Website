// ui/MailboxModal.jsx
// Briefkasten — zwei Modi, kein Umschalten:
//   mode="inbox"  am EIGENEN Kasten: nur lesen und abholen.
//   mode="send"   am Kasten eines anderen: nur hinterlegen.
//
// Es gibt bewusst weder Tabs noch ein Empfängerfeld: der angeklickte Briefkasten
// bestimmt, wem man schreibt. Eine Farm gehört genau einem Spieler, also ist der
// Empfänger durch den Ort schon eindeutig.
//
// Eine Sendung nimmt mehrere Gegenstände auf (bis MAX_ANHANG). Gleiche Gegenstände
// stehen als eine Zeile mit Anzahl da — sonst müsste man sieben identische Karotten
// einzeln anhaken, und genau dafür reicht das Sendelimit des Servers nicht.
//
// Der Server rechnet (siehe Backend/garden/world/mail.js); hier wird nur so weit geprüft,
// dass keine offensichtlich sinnlose Anfrage rausgeht.
import React, { useMemo, useState } from 'react';
import { GardenModal, PrimaryButton, RarityLabel } from './gardenUi';
import { HudIcon, TabIcon } from './gameIcons';
import { ItemIcon, SpecialItemIcon } from './ItemIcon';
import { beschreibeErnte } from './itemTints';
import { hydrateHarvestedItem, getPlantVisuals } from '../engine/PlantSystem';

const MESSAGE_MAX = 200;
const MAX_ANHANG = 12;  // muss zu MAIL_MAX_ANHANG in Backend/garden/world/mail.js passen

/** Listen zuerst, Einzelfeld als Rückfall — im Kasten liegen evtl. noch alte Sendungen. */
function anhaenge(liste, einzeln) {
    if (Array.isArray(liste)) return liste.filter(Boolean);
    return einzeln ? [einzeln] : [];
}

/**
 * Samen tragen im Anhang nur die seedId — das Samentütchen wird daraus abgeleitet,
 * genauso wie die Frucht bei der Ernte. Bildpfade des Absenders kommen bewusst nie
 * mit (siehe Backend/garden/world/mail.js).
 */
function samenMitBild(seed) {
    if (!seed?.seedId) return seed;
    const visuals = getPlantVisuals(seed.seedId, seed.singleUse !== false);
    return { ...seed, image: seed.image || visuals.seedShopImage };
}

/**
 * Gleiche Beschriftung = gleicher Gegenstand → eine Zeile mit Anzahl.
 * `beispiel` ist ein Vertreter der Gruppe und liefert das Bild — ohne ihn stünden
 * die Anhänge im Kasten als reiner Text da, während sie im Rucksack ein Bild haben.
 */
function fasseZusammen(eintraege, beschriften) {
    const map = new Map();
    for (const eintrag of eintraege) {
        const text = beschriften(eintrag);
        const treffer = map.get(text);
        if (treffer) treffer.anzahl += 1;
        else map.set(text, { text, anzahl: 1, rarity: eintrag?.rarity, beispiel: eintrag });
    }
    return [...map.values()];
}

function MailEntry({ mail, onClaim, busy }) {
    const when = new Date(mail.sentAt || Date.now());
    const seeds = fasseZusammen(anhaenge(mail.seeds, mail.seed), (s) => s?.name || "Samen");
    const items = fasseZusammen(anhaenge(mail.items, mail.item), beschreibeErnte);
    const pets = fasseZusammen(anhaenge(mail.pets, mail.pet), beschreibeTier);

    return (
        <div className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium text-white truncate">{mail.from}</span>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                    {when.toLocaleDateString("de-DE")} {when.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
            </div>
            {mail.message ? (
                <p className="text-xs text-slate-300 leading-relaxed mb-2 break-words whitespace-pre-wrap">{mail.message}</p>
            ) : null}
            <div className="flex items-end gap-3">
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
                    {mail.gold > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold tabular-nums">
                            <HudIcon.gold size={13} /> {mail.gold.toLocaleString("de-DE")} Gold
                        </span>
                    )}
                    {seeds.map((g) => (
                        <span key={`s-${g.text}`} className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <ItemIcon item={samenMitBild(g.beispiel)} className="w-5 h-5" emojiClassName="text-sm" />
                            {g.text}
                            <RarityLabel rarity={g.rarity} />
                            {g.anzahl > 1 && <span className="text-slate-400 tabular-nums">× {g.anzahl}</span>}
                        </span>
                    ))}
                    {items.map((g) => (
                        <span key={`e-${g.text}`} className="flex items-center gap-1.5 text-xs text-lime-300">
                            <SpecialItemIcon item={hydrateHarvestedItem(g.beispiel)} className="w-5 h-5" emojiClassName="text-sm" />
                            {g.text}
                            {g.anzahl > 1 && <span className="text-slate-400 tabular-nums">× {g.anzahl}</span>}
                        </span>
                    ))}
                    {pets.map((g) => (
                        <span key={`t-${g.text}`} className="flex items-center gap-1.5 text-xs text-sky-300">
                            <TabIcon.pet size={13} /> {g.text}
                            {g.anzahl > 1 && <span className="text-slate-400 tabular-nums">× {g.anzahl}</span>}
                        </span>
                    ))}
                </div>
                <PrimaryButton onClick={() => onClaim(mail.id)} disabled={busy} className="ml-auto shrink-0">
                    Abholen
                </PrimaryButton>
            </div>
        </div>
    );
}

function beschreibeTier(pet) {
    const teile = [pet?.customName ? `${pet.customName} (${pet.name})` : (pet?.name || "Tier")];
    if (pet?.rarity) teile.push(pet.rarity);
    if (pet?.specialType) teile.push(pet.specialType);
    if (pet?.ability?.type) teile.push(`${pet.ability.type} Lv${pet.ability.level ?? 1}`);
    return teile.join(" · ");
}

// ── Auswahl ──────────────────────────────────────────────────────────────────
// Ein Gegenstand ist durch seine ID eindeutig; die Anzeige fasst gleiche aber
// zusammen. Deshalb hält die Auswahl IDs, und die Stepper suchen sich die nächste
// freie ID der jeweiligen Gruppe.

/** Baut Anzeigegruppen: gleiche Beschriftung UND gleicher Wert landen zusammen. */
function baueGruppen(eintraege, idVon, beschriften, wertSchluessel, bildVon) {
    const map = new Map();
    for (const eintrag of eintraege || []) {
        const id = idVon(eintrag);
        if (!id) continue;
        const text = beschriften(eintrag);
        const key = `${text}|${wertSchluessel(eintrag)}`;
        let gruppe = map.get(key);
        if (!gruppe) {
            gruppe = { key, text, rarity: eintrag?.rarity, bild: bildVon ? bildVon(eintrag) : null, ids: [] };
            map.set(key, gruppe);
        }
        gruppe.ids.push(String(id));
    }
    return [...map.values()];
}

const STEPPER_KLASSE = "w-6 h-6 flex items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 text-sm leading-none hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 disabled:cursor-not-allowed transition-colors";

function GruppenListe({ label, gruppen, auswahl, setAuswahl, restplaetze, leerText, hinweis }) {
    const gewaehlt = auswahl.length;

    const mehr = (gruppe) => setAuswahl((alt) => {
        if (restplaetze <= 0) return alt;
        const naechste = gruppe.ids.find((id) => !alt.includes(id));
        return naechste ? [...alt, naechste] : alt;
    });

    const weniger = (gruppe) => setAuswahl((alt) => {
        for (let i = alt.length - 1; i >= 0; i--) {
            if (gruppe.ids.includes(alt[i])) return [...alt.slice(0, i), ...alt.slice(i + 1)];
        }
        return alt;
    });

    // „Alle" nimmt so viele, wie noch in die Sendung passen.
    const alle = (gruppe) => setAuswahl((alt) => {
        const frei = gruppe.ids.filter((id) => !alt.includes(id)).slice(0, Math.max(0, restplaetze));
        return frei.length ? [...alt, ...frei] : alt;
    });

    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <label className="block text-[11px] uppercase tracking-wider text-slate-500">
                    {label} <span className="normal-case tracking-normal text-slate-600">(optional)</span>
                </label>
                {gewaehlt > 0 && (
                    <button
                        type="button"
                        onClick={() => setAuswahl([])}
                        className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        {gewaehlt} gewählt — zurücksetzen
                    </button>
                )}
            </div>

            {gruppen.length === 0 ? (
                <p className="text-[11px] text-slate-600 px-3 py-2.5 rounded-2xl border border-slate-800 bg-slate-950">
                    {leerText}
                </p>
            ) : (
                <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 divide-y divide-slate-800" style={{ overscrollBehavior: "contain" }}>
                    {gruppen.map((gruppe) => {
                        const anzahl = gruppe.ids.reduce((n, id) => n + (auswahl.includes(id) ? 1 : 0), 0);
                        const voll = anzahl >= gruppe.ids.length || restplaetze <= 0;
                        return (
                            <div
                                key={gruppe.key}
                                className={`flex items-center gap-2 px-2.5 py-1.5 ${anzahl > 0 ? "bg-slate-900" : ""}`}
                            >
                                {gruppe.bild ? (
                                    <SpecialItemIcon item={gruppe.bild} className="w-6 h-6 shrink-0" emojiClassName="text-base" />
                                ) : null}
                                <span className="flex-1 min-w-0 text-xs text-slate-200 truncate" title={gruppe.text}>
                                    {gruppe.text}
                                    {gruppe.ids.length > 1 && (
                                        <span className="text-slate-600 tabular-nums"> · {gruppe.ids.length} vorhanden</span>
                                    )}
                                </span>
                                {gruppe.ids.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => alle(gruppe)}
                                        disabled={voll}
                                        className="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors px-1"
                                    >
                                        alle
                                    </button>
                                )}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button type="button" onClick={() => weniger(gruppe)} disabled={anzahl === 0} className={STEPPER_KLASSE} aria-label={`Weniger ${gruppe.text}`}>
                                        −
                                    </button>
                                    <span className={`w-6 text-center text-xs tabular-nums ${anzahl > 0 ? "text-white" : "text-slate-600"}`}>
                                        {anzahl}
                                    </span>
                                    <button type="button" onClick={() => mehr(gruppe)} disabled={voll} className={STEPPER_KLASSE} aria-label={`Mehr ${gruppe.text}`}>
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {hinweis && <p className="text-[10px] text-slate-600 mt-1">{hinweis}</p>}
        </div>
    );
}

export default function MailboxModal({
    mode, recipient, mailbox, onClose, onClaim, onSend, seedInventory,
    harvestInventory = [], petInventory = [], busy,
}) {
    const [goldInput, setGoldInput] = useState("");
    const [message, setMessage] = useState("");
    const [seedIds, setSeedIds] = useState([]);
    const [itemIds, setItemIds] = useState([]);
    const [petIds, setPetIds] = useState([]);
    const [localError, setLocalError] = useState(null);

    // Der Wertschlüssel entscheidet, was als „dasselbe" gilt. Nur wirklich
    // gleichwertige Gegenstände dürfen in eine Zeile — sonst verschenkt man beim
    // Hochzählen ungewollt den wertvolleren.
    const seedGruppen = useMemo(() => baueGruppen(
        seedInventory, (s) => s?.instanceId, (s) => s?.name || "Samen",
        (s) => `${s?.seedId}|${s?.rarity}|${s?.singleUse !== false}`,
        samenMitBild,
    ), [seedInventory]);

    const ernteGruppen = useMemo(() => baueGruppen(
        harvestInventory, (i) => i?.id, beschreibeErnte,
        (i) => `${i?.seedId}|${i?.rarity}|${i?.size}|${JSON.stringify(i?.specialData ?? null)}|${i?.statusEffect ?? ""}`,
        hydrateHarvestedItem,
    ), [harvestInventory]);

    const tierGruppen = useMemo(() => baueGruppen(
        petInventory, (p) => p?.id || p?.instanceId, beschreibeTier,
        (p) => `${p?.name}|${p?.customName ?? ""}|${p?.rarity}|${p?.specialType ?? ""}|${JSON.stringify(p?.ability ?? null)}`,
        (p) => p,
    ), [petInventory]);

    const gewaehlt = seedIds.length + itemIds.length + petIds.length;
    const restplaetze = MAX_ANHANG - gewaehlt;

    const goldValue = goldInput.trim() ? Number(goldInput.trim()) : 0;
    const goldInvalid = goldInput.trim() !== "" && (!Number.isInteger(goldValue) || goldValue <= 0);
    const nothingToSend = !goldInput.trim() && !message.trim() && gewaehlt === 0;
    const canSend = Boolean(recipient) && !goldInvalid && !nothingToSend && !busy;

    const submit = () => {
        setLocalError(null);
        if (goldInvalid) { setLocalError("Nur ganze Zahlen über 0."); return; }
        if (nothingToSend) { setLocalError("Leere Sendung."); return; }
        onSend({
            toLogin: recipient,
            gold: goldInput.trim() ? goldValue : undefined,
            message: message.trim() || undefined,
            seedInstanceIds: seedIds.length ? seedIds : undefined,
            itemIds: itemIds.length ? itemIds : undefined,
            petIds: petIds.length ? petIds : undefined,
        }, () => {
            setGoldInput(""); setMessage(""); setSeedIds([]); setItemIds([]); setPetIds([]);
        });
    };

    // ── Eigener Briefkasten: nur Posteingang ─────────────────────────────────
    if (mode === "inbox") {
        const gold = mailbox.reduce((s, m) => s + (m.gold || 0), 0);
        const seeds = mailbox.reduce((s, m) => s + anhaenge(m.seeds, m.seed).length, 0);
        const teile = [];
        if (gold > 0) teile.push(`${gold.toLocaleString("de-DE")} Gold`);
        if (seeds > 0) teile.push(seeds === 1 ? "1 Samen" : `${seeds} Samen`);

        return (
            <GardenModal
                title="Dein Briefkasten"
                subtitle={mailbox.length
                    ? `${mailbox.length === 1 ? "Eine Sendung wartet" : `${mailbox.length} Sendungen warten`}${teile.length ? ` — insgesamt ${teile.join(" und ")}` : ""}`
                    : "Nichts Neues"}
                onClose={onClose}
                width="max-w-xl"
            >
                {mailbox.length === 0 ? (
                    <div className="text-slate-500 text-sm text-center py-10">
                        Dein Briefkasten ist leer. Andere können dir etwas hinterlegen, indem sie
                        an deinem Grundstück vorbeikommen.
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {mailbox.map((mail) => (
                            <MailEntry key={mail.id} mail={mail} onClaim={onClaim} busy={busy} />
                        ))}
                    </div>
                )}
            </GardenModal>
        );
    }

    // ── Fremder Briefkasten: nur hinterlegen ─────────────────────────────────
    // Zähler und Knopf sitzen im festen Fußbereich: mit drei Auswahllisten wird der
    // Inhalt höher als das Modal, und ein Senden-Knopf unter der Scrollkante findet
    // niemand.
    const fuss = (
        <div className="space-y-2">
            {localError && <p className="text-xs text-rose-400">{localError}</p>}
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                <span>{gewaehlt} von {MAX_ANHANG} Gegenständen in dieser Sendung</span>
                {restplaetze <= 0 && <span className="text-amber-400">Sendung voll</span>}
            </div>
            <PrimaryButton onClick={submit} disabled={!canSend} className="w-full py-2.5">
                <span className="inline-flex items-center gap-2">
                    <HudIcon.send size={14} /> In den Briefkasten legen
                </span>
            </PrimaryButton>
        </div>
    );

    return (
        <GardenModal
            title={`Briefkasten von ${recipient}`}
            subtitle="Was du hier hinterlegst, findet nur diese Farm"
            onClose={onClose}
            width="max-w-xl"
            footer={fuss}
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                        Gold <span className="normal-case tracking-normal text-slate-600">(optional)</span>
                    </label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={goldInput}
                        onChange={(e) => setGoldInput(e.target.value)}
                        placeholder="0"
                        className={`w-full px-3 py-2 rounded-2xl bg-slate-950 border text-sm text-white placeholder:text-slate-600 focus:outline-none tabular-nums ${
                            goldInvalid ? "border-rose-600 focus:border-rose-500" : "border-slate-700 focus:border-violet-500"
                        }`}
                    />
                    {goldInvalid && (
                        <p className="text-[11px] text-rose-400 mt-1">
                            Nur ganze Zahlen über 0 — negative Beträge sind nicht möglich.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">
                        Nachricht <span className="normal-case tracking-normal text-slate-600">(optional)</span>
                    </label>
                    <textarea
                        rows={3}
                        maxLength={MESSAGE_MAX}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="w-full px-3 py-2 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:border-violet-500 focus:outline-none resize-none"
                    />
                    <div className="text-[10px] text-slate-600 text-right mt-0.5 tabular-nums">
                        {message.length}/{MESSAGE_MAX}
                    </div>
                </div>

                <GruppenListe
                    label="Samen"
                    gruppen={seedGruppen}
                    auswahl={seedIds}
                    setAuswahl={setSeedIds}
                    restplaetze={restplaetze}
                    leerText="Du hast keine Samen im Rucksack."
                />

                <GruppenListe
                    label="Ernte"
                    gruppen={ernteGruppen}
                    auswahl={itemIds}
                    setAuswahl={setItemIds}
                    restplaetze={restplaetze}
                    leerText="Dein Ernte-Lager ist leer."
                />

                <GruppenListe
                    label="Tiere"
                    gruppen={tierGruppen}
                    auswahl={petIds}
                    setAuswahl={setPetIds}
                    restplaetze={restplaetze}
                    leerText="Keine Tiere im Rucksack."
                    hinweis="Nur Tiere aus dem Rucksack. Platzierte musst du erst einsammeln."
                />

                <p className="text-[10px] text-slate-600 leading-relaxed">
                    Gold wird sofort von deinem Konto abgebucht und liegt dort, bis es abgeholt
                    wird. Wert entsteht dabei nicht neu — der Server prüft Betrag und Deckung.
                    Der Empfänger braucht beim Abholen für jeden Samen und jede Frucht einen
                    freien Rucksackplatz.
                </p>
            </div>
        </GardenModal>
    );
}
