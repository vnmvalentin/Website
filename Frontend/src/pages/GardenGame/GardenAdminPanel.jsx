// components/GardenAdminPanel.jsx
// Admin-Menü für eine einzelne Virtual-Farm — Gold, Rucksack, Ernte, Eier, Tiere,
// Deko, Kiste, Vitrine, Werkzeug und Zähler.
//
// WARUM HIER UND NICHT IM SPIEL ODER IM DASHBOARD
// Es hängt an zwei Stellen: im Admin-Dashboard (Reiter „Virtual Farm", Klick auf eine
// Zeile) und im Spiel selbst über den Admin-Knopf im HUD. Zwei Kopien wären zwei
// Formulare, die auseinanderlaufen, sobald ein Feld dazukommt.
//
// Was das Menü darf, entscheidet der Server (Backend/garden/admin.js). Hier wird
// nur AUSGEWÄHLT: die Route baut jedes Stück selbst, damit sich über das Menü kein
// Verkaufswert und keine Fähigkeitsstufe frei setzen lässt.
//
// Designregeln (feedback_design_clean): rounded-md/sm, flache dunkle Flächen, keine
// Gradients, keine Glows, keine Scale-Hovers, keine Emojis in der Oberfläche.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    RefreshCw, Trash2, Plus, X, Coins, Wifi, WifiOff, AlertTriangle, Check,
    Disc3, Globe, Users, Search,
} from 'lucide-react';
import { SpecialItemIcon } from './ui/ItemIcon';

const ZAHL = (n) => Number(n || 0).toLocaleString("de-DE");

/** Menschliche Kurzbeschreibung eines Stücks für die Listenzeile. */
function beschreibe(item) {
    const teile = [];
    if (item?.size) teile.push(`Größe ${item.size}`);
    if (item?.specialData?.name) teile.push(item.specialData.name);
    if (item?.specialType) teile.push(item.specialType);
    if (item?.statusEffect) teile.push(item.statusEffect);
    if (item?.ability?.type) teile.push(`${item.ability.type} Lv${item.ability.level ?? 1}`);
    if (item?.sellValue) teile.push(`${ZAHL(item.sellValue)} Gold`);
    if (item?.kategorie) teile.push(item.kategorie);
    if (item?.rarity && teile.length === 0) teile.push(item.rarity);
    return teile.join(" · ");
}

function idVon(item) {
    return item?.instanceId ?? item?.id ?? null;
}

/**
 * Bild für ein Ernte-Stück nachreichen.
 *
 * Der Server speichert bei Ernte nur die Werte, keine Bildpfade — im Spiel legt
 * hydrateHarvestedItem sie beim Laden dazu. Ohne dasselbe hier stünde in jeder
 * Ernte-Zeile nur das Ersatz-Kästchen. Die Pfade stecken schon im Katalog.
 */
function mitBild(item, bilderNachSeedId) {
    if (!item?.seedId || item.image) return item;
    const visuals = bilderNachSeedId.get(item.seedId);
    if (!visuals) return item;
    const bild = item.singleUse === false ? visuals.fruitImage : visuals.harvestImage;
    return { ...item, image: bild || visuals.harvestImage };
}

// ─── Kleine Bausteine ────────────────────────────────────────────────────────

function Feld({ label, children }) {
    return (
        <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
            {children}
        </label>
    );
}

const EINGABE = "bg-slate-950 border border-slate-700 rounded-sm px-2 py-1.5 text-xs text-white outline-none focus:border-violet-500 transition-colors";

function Auswahl({ wert, setzen, optionen, leerLabel }) {
    return (
        <select value={wert} onChange={(e) => setzen(e.target.value)} className={EINGABE}>
            {leerLabel ? <option value="">{leerLabel}</option> : null}
            {optionen.map((o) => (
                <option key={o.wert} value={o.wert}>{o.label}</option>
            ))}
        </select>
    );
}

function Knopf({ children, onClick, disabled, variante = "normal", className = "", titel }) {
    const farben = {
        normal: "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700",
        aktion: "bg-violet-600 hover:bg-violet-500 text-white border-violet-600",
        gefahr: "bg-red-900/40 hover:bg-red-900/70 text-red-200 border-red-900/60",
    };
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={titel}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${farben[variante]} ${className}`}
        >
            {children}
        </button>
    );
}

// ─── Welt-Steuerung ──────────────────────────────────────────────────────────

/** Wie lange ein gesetztes Wetter bzw. eine gestartete Party laufen soll. */
const DAUER_VORSCHLAEGE = [5, 15, 30, 60];

function restMinuten(bis) {
    if (!bis) return 0;
    return Math.max(0, Math.ceil((bis - Date.now()) / 60000));
}

/**
 * Wetter und Party für die GANZE Welt.
 *
 * Beides läuft sonst aus der Uhr bzw. der Ladenrotation und ist damit bei allen
 * gleich, ohne dass jemand etwas verteilen muss (garden/core/tageszeit.js). Was hier
 * gesetzt wird, liegt als Ausnahme darüber, gilt befristet und ist nach einem
 * Serverneustart wieder weg — deshalb steht auch immer dabei, wie lange noch.
 */
export function WeltSteuerung() {
    const [welt, setWelt] = useState(null);
    const [minuten, setMinuten] = useState(15);
    const [laeuft, setLaeuft] = useState(false);
    const [fehler, setFehler] = useState(null);
    const [, tick] = useState(0);

    const laden = useCallback(async () => {
        try {
            const r = await fetch("/api/admin/garden/welt", { credentials: "include" });
            if (!r.ok) throw new Error(`Fehler ${r.status}`);
            setWelt(await r.json());
            setFehler(null);
        } catch (e) { setFehler(e?.message || "Weltzustand nicht ladbar."); }
    }, []);

    useEffect(() => { laden(); }, [laden]);
    // Der Countdown läuft weiter, ohne dass jemand etwas anklickt.
    useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const senden = useCallback(async (koerper) => {
        setLaeuft(true);
        setFehler(null);
        try {
            const r = await fetch("/api/admin/garden/welt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(koerper),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error || `Fehler ${r.status}`);
            setWelt((alt) => ({ ...(alt || {}), ...d }));
        } catch (e) { setFehler(e?.message || "Ging nicht."); }
        finally { setLaeuft(false); }
    }, []);

    const lagen = welt?.lagen || [];
    const wetterRest = restMinuten(welt?.wetterBis);
    const partyRest = restMinuten(welt?.partyBis);
    const etwasLaeuft = wetterRest > 0 || partyRest > 0;

    return (
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <Globe size={12} /> Welt
                </span>
                {wetterRest > 0 ? (
                    <span className="rounded-sm border border-sky-800 bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                        {lagen.find((l) => l.typ === welt.wetterTyp)?.name || welt.wetterTyp} · noch {wetterRest} min
                    </span>
                ) : null}
                {partyRest > 0 ? (
                    <span className="flex items-center gap-1 rounded-sm border border-fuchsia-700 bg-fuchsia-950/60 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-200">
                        <Disc3 size={10} /> Party · noch {partyRest} min
                    </span>
                ) : null}
                {!etwasLaeuft ? (
                    <span className="text-[10px] text-slate-600">läuft nach der Uhr</span>
                ) : null}
                <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Dauer</span>
                    {DAUER_VORSCHLAEGE.map((m) => (
                        <button key={m} type="button" onClick={() => setMinuten(m)}
                            className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                minuten === m
                                    ? "border-violet-500 bg-violet-600 text-white"
                                    : "border-slate-700 text-slate-400 hover:text-slate-200"
                            }`}>
                            {m}m
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {lagen.map((l) => (
                    <Knopf key={l.typ} disabled={laeuft} titel={`${l.name} für ${minuten} Minuten`}
                        variante={welt?.wetterTyp === l.typ && wetterRest > 0 ? "aktion" : "normal"}
                        onClick={() => senden({ op: "wetter", typ: l.typ, minuten })}>
                        {l.name}
                    </Knopf>
                ))}
                <span className="mx-1 h-4 w-px bg-slate-800" />
                <Knopf disabled={laeuft} variante={partyRest > 0 ? "aktion" : "normal"}
                    titel={`Party für ${minuten} Minuten — vierfache Rainbow-Chance, und bestehende Pflanzen können nachträglich veredelt werden`}
                    onClick={() => senden({ op: "party", minuten })}>
                    <Disc3 size={12} /> Party
                </Knopf>
                <Knopf disabled={laeuft || !etwasLaeuft} variante="gefahr" titel="Zurück auf die Uhr"
                    onClick={() => senden({ op: "aus" })}>
                    Aufheben
                </Knopf>
                <Knopf onClick={laden} disabled={laeuft} titel="Neu laden"><RefreshCw size={12} /></Knopf>
            </div>

            {fehler ? <div className="mt-2 text-[11px] text-red-300">{fehler}</div> : null}
            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
                Gilt für alle in allen Welten und endet von selbst. Nach einem Serverneustart
                zählt wieder die Uhr. Während einer Party wird Rainbow viermal so wahrscheinlich —
                und alle dreissig Sekunden bekommen auch schon stehende Pflanzen eine Chance darauf.
            </p>
        </div>
    );
}

// ─── Formular zum Geben ──────────────────────────────────────────────────────

/**
 * Je Listenart eine andere Beschreibung. Rückgabe ist genau das, was die Route unter
 * `eintrag` erwartet — die konkreten Werte (Verkaufswert, Bild, Kennung) setzt sie selbst.
 */
function GebenFormular({ art, katalog, onGeben, laeuft }) {
    const [spec, setSpec] = useState({});
    const [anzahl, setAnzahl] = useState(1);
    const setzeFeld = (k, v) => setSpec((s) => ({ ...s, [k]: v }));

    // Beim Wechsel der Liste die alte Auswahl fallen lassen, sonst schickt das
    // Formular eine seedId an eine Tierliste.
    useEffect(() => { setSpec({}); setAnzahl(1); }, [art]);

    const samenOptionen = useMemo(
        () => (katalog.seeds || []).map((s) => ({ wert: s.seedId, label: `${s.name} (${s.rarity})` })),
        [katalog.seeds],
    );

    let auswahl = null;
    let bereit = false;

    if (art === "samen") {
        bereit = Boolean(spec.seedId);
        auswahl = <Feld label="Samen"><Auswahl wert={spec.seedId || ""} setzen={(v) => setzeFeld("seedId", v)} optionen={samenOptionen} leerLabel="— wählen —" /></Feld>;
    } else if (art === "ernte") {
        bereit = Boolean(spec.seedId);
        auswahl = (
            <>
                <Feld label="Pflanze"><Auswahl wert={spec.seedId || ""} setzen={(v) => setzeFeld("seedId", v)} optionen={samenOptionen} leerLabel="— wählen —" /></Feld>
                <Feld label="Größe (1–50)">
                    <input type="number" min={1} max={50} value={spec.size ?? 25}
                        onChange={(e) => setzeFeld("size", e.target.value)} className={`${EINGABE} w-20`} />
                </Feld>
                <Feld label="Sonderform">
                    <Auswahl wert={spec.specialType || ""} setzen={(v) => setzeFeld("specialType", v)} leerLabel="keine"
                        optionen={(katalog.sonderformen || []).map((s) => ({ wert: s, label: s }))} />
                </Feld>
                <Feld label="Wetter">
                    <Auswahl wert={spec.statusEffect || ""} setzen={(v) => setzeFeld("statusEffect", v)} leerLabel="keins"
                        optionen={(katalog.wetterEffekte || []).map((s) => ({ wert: s, label: s }))} />
                </Feld>
            </>
        );
    } else if (art === "ei") {
        bereit = Boolean(spec.eggId);
        auswahl = (
            <Feld label="Ei">
                <Auswahl wert={spec.eggId || ""} setzen={(v) => setzeFeld("eggId", v)} leerLabel="— wählen —"
                    optionen={(katalog.eggs || []).map((e) => ({ wert: e.id, label: `${e.name} (${e.rarity})` }))} />
            </Feld>
        );
    } else if (art === "tier") {
        bereit = Boolean(spec.type);
        auswahl = (
            <>
                <Feld label="Tierart">
                    <Auswahl wert={spec.type || ""} setzen={(v) => setzeFeld("type", v)} leerLabel="— wählen —"
                        optionen={(katalog.tiere || []).map((t) => ({ wert: t.type, label: `${t.type} (${t.rarity})` }))} />
                </Feld>
                <Feld label="Fähigkeit">
                    <Auswahl wert={spec.abilityType || "goldfinder"} setzen={(v) => setzeFeld("abilityType", v)}
                        optionen={(katalog.faehigkeiten || []).map((f) => ({ wert: f, label: f }))} />
                </Feld>
                <Feld label="Stufe (1–6)">
                    <input type="number" min={1} max={6} value={spec.abilityLevel ?? 1}
                        onChange={(e) => setzeFeld("abilityLevel", e.target.value)} className={`${EINGABE} w-16`} />
                </Feld>
                <Feld label="Seltenheit">
                    <Auswahl wert={spec.rarity || ""} setzen={(v) => setzeFeld("rarity", v)} leerLabel="wie Art"
                        optionen={(katalog.seltenheiten || []).map((r) => ({ wert: r, label: r }))} />
                </Feld>
                <Feld label="Sonderform">
                    <Auswahl wert={spec.specialType || ""} setzen={(v) => setzeFeld("specialType", v)} leerLabel="keine"
                        optionen={(katalog.sonderformen || []).map((s) => ({ wert: s, label: s }))} />
                </Feld>
                <Feld label="Eigener Name">
                    <input type="text" maxLength={24} value={spec.customName || ""} placeholder="optional"
                        onChange={(e) => setzeFeld("customName", e.target.value)} className={`${EINGABE} w-32`} />
                </Feld>
            </>
        );
    } else if (art === "deko") {
        bereit = Boolean(spec.decoId);
        auswahl = (
            <Feld label="Deko">
                <Auswahl wert={spec.decoId || ""} setzen={(v) => setzeFeld("decoId", v)} leerLabel="— wählen —"
                    optionen={(katalog.deko || []).map((d) => ({ wert: d.id, label: `${d.name} (${d.rarity})` }))} />
            </Feld>
        );
    }

    return (
        <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-md mb-3">
            {auswahl}
            <Feld label="Anzahl">
                <input type="number" min={1} max={100} value={anzahl}
                    onChange={(e) => setAnzahl(e.target.value)} className={`${EINGABE} w-16`} />
            </Feld>
            <Knopf variante="aktion" disabled={!bereit || laeuft} onClick={() => onGeben(spec, anzahl)}>
                <Plus size={13} /> Geben
            </Knopf>
        </div>
    );
}

// ─── Werte-Reiter ────────────────────────────────────────────────────────────

function WerteFormular({ katalog, state, onSpeichern, laeuft }) {
    const [entwurf, setEntwurf] = useState({});
    // Nach jedem Speichern kommt ein neuer Stand — der Entwurf muss dann weg, sonst
    // zeigen die Felder weiter die eben abgeschickten Zahlen statt der echten.
    useEffect(() => { setEntwurf({}); }, [state]);

    const werkzeug = state?.toolInventory || {};
    const wert = (feld, quelle) => (entwurf[feld] !== undefined ? entwurf[feld] : quelle[feld]);
    const setzen = (feld, v) => setEntwurf((e) => ({ ...e, [feld]: v }));

    const abschicken = () => {
        const werte = {};
        for (const f of katalog.zahlFelder || []) {
            if (entwurf[f.feld] !== undefined) werte[f.feld] = Number(entwurf[f.feld]);
        }
        const werkzeugWerte = {};
        for (const f of katalog.werkzeugFelder || []) {
            if (entwurf[f.feld] === undefined) continue;
            werkzeugWerte[f.feld] = f.boolean ? Boolean(entwurf[f.feld]) : Number(entwurf[f.feld]);
        }
        if (Object.keys(werkzeugWerte).length > 0) werte.toolInventory = werkzeugWerte;
        if (entwurf.tutorialCompleted !== undefined) werte.tutorialCompleted = Boolean(entwurf.tutorialCompleted);
        onSpeichern(werte);
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Grundstück und Rucksack</div>
                <div className="flex flex-wrap gap-3">
                    {(katalog.zahlFelder || []).map((f) => (
                        <Feld key={f.feld} label={`${f.label} (${f.min}–${f.max})`}>
                            <input type="number" min={f.min} max={f.max}
                                value={wert(f.feld, state) ?? f.min}
                                onChange={(e) => setzen(f.feld, e.target.value)}
                                className={`${EINGABE} w-28`} />
                        </Feld>
                    ))}
                </div>
            </div>

            <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Werkzeug und Gebäude</div>
                <div className="flex flex-wrap gap-3">
                    {(katalog.werkzeugFelder || []).map((f) => (f.boolean ? (
                        <label key={f.feld} className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-700 rounded-sm cursor-pointer">
                            <input type="checkbox" checked={Boolean(wert(f.feld, werkzeug))}
                                onChange={(e) => setzen(f.feld, e.target.checked)}
                                className="accent-violet-500" />
                            <span className="text-xs text-slate-200">{f.label}</span>
                        </label>
                    ) : (
                        <Feld key={f.feld} label={`${f.label} (${f.min}–${f.max})`}>
                            <input type="number" min={f.min} max={f.max}
                                value={wert(f.feld, werkzeug) ?? f.min}
                                onChange={(e) => setzen(f.feld, e.target.value)}
                                className={`${EINGABE} w-28`} />
                        </Feld>
                    )))}
                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-700 rounded-sm cursor-pointer">
                        <input type="checkbox"
                            checked={Boolean(entwurf.tutorialCompleted !== undefined ? entwurf.tutorialCompleted : state?.tutorialCompleted)}
                            onChange={(e) => setzen("tutorialCompleted", e.target.checked)}
                            className="accent-violet-500" />
                        <span className="text-xs text-slate-200">Tutorial abgeschlossen</span>
                    </label>
                </div>
            </div>

            <Knopf variante="aktion" disabled={laeuft || Object.keys(entwurf).length === 0} onClick={abschicken}>
                <Check size={13} /> Werte übernehmen
            </Knopf>
        </div>
    );
}

/**
 * Panel MIT Spielerauswahl — das ist die Form, die im Spiel gebraucht wird.
 *
 * Im Dashboard steht die Spielerliste schon als Tabelle da, dort wird direkt
 * GardenAdminPanel geöffnet. Im Spiel gibt es keine solche Liste, und die
 * Mitspieler in der Welt reichen nicht: bearbeiten will man auch jemanden, der
 * gerade nicht online ist.
 */
export function GardenAdminBrowser({ eigeneId, onClose }) {
    const [spieler, setSpieler] = useState([]);
    const [suche, setSuche] = useState("");
    const [gewaehlt, setGewaehlt] = useState(eigeneId ? String(eigeneId) : null);
    const [fehler, setFehler] = useState(null);

    useEffect(() => {
        let abgebrochen = false;
        fetch("/api/admin/garden/users", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Fehler ${r.status}`))))
            .then((d) => { if (!abgebrochen) setSpieler(d.users || []); })
            .catch((e) => { if (!abgebrochen) setFehler(e?.message || "Liste nicht ladbar."); });
        return () => { abgebrochen = true; };
    }, []);

    const gefiltert = useMemo(() => {
        const q = suche.trim().toLowerCase();
        const treffer = q
            ? spieler.filter((u) => `${u.twitchLogin || ""} ${u.userId}`.toLowerCase().includes(q))
            : spieler.slice();
        // Wer gerade spielt, steht oben — das ist fast immer der, den man sucht.
        // Danach nach Gold, weil das die Liste über Sitzungen hinweg stabil hält.
        return treffer.sort((a2, b2) => {
            if (Boolean(a2.online) !== Boolean(b2.online)) return a2.online ? -1 : 1;
            return (b2.gold || 0) - (a2.gold || 0);
        });
    }, [spieler, suche]);

    const onlineZahl = useMemo(() => spieler.filter((u) => u.online).length, [spieler]);

    const gewaehlterName = spieler.find((u) => u.userId === gewaehlt)?.twitchLogin;

    // Sonst zeigt die Liste links weiter den Goldstand von vor der Änderung.
    const uebernehmeStand = useCallback((id, neuerStand) => {
        setSpieler((alt) => alt.map((u) => (u.userId === id ? { ...u, gold: neuerStand?.gold ?? u.gold } : u)));
    }, []);

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            {/* Die Welt steht ÜBER den Spielern, weil sie alle betrifft. Vorher gab es
                sie gar nicht — Wetter und Party liessen sich nur abwarten. */}
            <WeltSteuerung />

            <div className="flex gap-4 min-h-0 flex-1">
            <div className="w-60 shrink-0 flex flex-col min-h-0 border-r border-slate-800 pr-4">
                <div className="relative mb-2">
                    <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input type="text" value={suche} onChange={(e) => setSuche(e.target.value)}
                        placeholder="Name oder ID" className={`${EINGABE} w-full pl-7`} />
                </div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                    <span className="flex items-center gap-1.5"><Users size={11} /> {gefiltert.length} Farmen</span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-sm bg-emerald-400" /> {onlineZahl} online
                    </span>
                </div>
                {fehler ? <div className="text-xs text-red-300">{fehler}</div> : null}
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5" style={{ overscrollBehavior: "contain" }}>
                    {gefiltert.map((u) => (
                        <button key={u.userId} type="button" onClick={() => setGewaehlt(u.userId)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-left transition-colors ${
                                gewaehlt === u.userId ? "bg-violet-600/20 border border-violet-700" : "border border-transparent hover:bg-slate-800/70"
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${u.online ? "bg-emerald-400" : "bg-slate-700"}`} />
                            <span className="flex-1 min-w-0">
                                <span className="block truncate text-xs text-slate-200">{u.twitchLogin || u.userId}</span>
                                <span className="block text-[10px] text-slate-500 tabular-nums">{ZAHL(u.gold)} Gold</span>
                            </span>
                        </button>
                    ))}
                    {gefiltert.length === 0 ? (
                        <div className="px-2 py-4 text-xs text-slate-600">Keine Treffer.</div>
                    ) : null}
                </div>
            </div>
            <div className="flex-1 min-w-0 min-h-0">
                {gewaehlt ? (
                    <GardenAdminPanel key={gewaehlt} userId={gewaehlt} anzeigeName={gewaehlterName}
                        onClose={onClose} onGeaendert={uebernehmeStand} />
                ) : (
                    <div className="p-8 text-center text-sm text-slate-500">Links einen Spieler wählen.</div>
                )}
            </div>
            </div>
        </div>
    );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function GardenAdminPanel({ userId, anzeigeName, onClose, onGeaendert }) {
    const [katalog, setKatalog] = useState(null);
    const [state, setState] = useState(null);
    const [online, setOnline] = useState(false);
    const [reiter, setReiter] = useState("inventory");
    const [goldEingabe, setGoldEingabe] = useState("");
    const [meldung, setMeldung] = useState(null);   // { text, fehler }
    const [laeuft, setLaeuft] = useState(false);

    const laden = useCallback(async () => {
        setLaeuft(true);
        try {
            const [kRes, sRes] = await Promise.all([
                fetch("/api/admin/garden/catalogue", { credentials: "include" }),
                fetch(`/api/admin/garden/user/${encodeURIComponent(userId)}`, { credentials: "include" }),
            ]);
            if (!kRes.ok || !sRes.ok) throw new Error("Laden fehlgeschlagen.");
            const k = await kRes.json();
            const s = await sRes.json();
            setKatalog(k);
            setState(s.state);
            setOnline(Boolean(s.online));
        } catch (err) {
            setMeldung({ text: err?.message || "Laden fehlgeschlagen.", fehler: true });
        } finally {
            setLaeuft(false);
        }
    }, [userId]);

    useEffect(() => { laden(); }, [laden]);

    const patch = useCallback(async (aktion) => {
        setLaeuft(true);
        setMeldung(null);
        try {
            const res = await fetch(`/api/admin/garden/user/${encodeURIComponent(userId)}/patch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(aktion),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `Fehler ${res.status}`);
            setState(data.state);
            setOnline(Boolean(data.online));
            // Der Gold-Betrag bleibt sonst stehen und ein zweiter Klick auf „Addieren"
            // legt unbemerkt noch einmal denselben Betrag drauf.
            if (aktion?.op === "gold") setGoldEingabe("");
            onGeaendert?.(userId, data.state);
            setMeldung({
                text: data.online ? `${data.info} — Spieler ist online, sein Spiel lädt nach.` : data.info,
                fehler: false,
            });
        } catch (err) {
            setMeldung({ text: err?.message || "Fehlgeschlagen.", fehler: true });
        } finally {
            setLaeuft(false);
        }
    }, [userId, onGeaendert]);

    const listen = katalog?.listen || [];
    const aktuelleListe = listen.find((l) => l.feld === reiter);
    const bilderNachSeedId = useMemo(
        () => new Map((katalog?.seeds || []).map((s) => [s.seedId, s])),
        [katalog?.seeds],
    );
    const eintraege = useMemo(() => {
        if (!aktuelleListe || !Array.isArray(state?.[reiter])) return [];
        return state[reiter].map((item) => mitBild(item, bilderNachSeedId));
    }, [aktuelleListe, state, reiter, bilderNachSeedId]);

    if (!katalog || !state) {
        return (
            <div className="p-8 text-center text-sm text-slate-400">
                {meldung?.fehler ? meldung.text : "Lade Spielstand…"}
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-0">
            {/* Kopf: wer, online, Gold */}
            <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-slate-800">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                        {anzeigeName || state.twitchLogin || "Unbekannt"}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">{userId}</div>
                </div>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-semibold uppercase tracking-wider border ${
                    online ? "border-emerald-700 text-emerald-300" : "border-slate-700 text-slate-500"
                }`}>
                    {online ? <Wifi size={11} /> : <WifiOff size={11} />}
                    {online ? "online" : "offline"}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                    {/* Gold in einem eigenen Kasten: vorher standen Anzeige, Eingabefeld
                        und zwei Knöpfe frei zwischen „online" und „Schließen", und man
                        traf beim schnellen Klicken das Falsche. */}
                    <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 tabular-nums">
                            <Coins size={14} /> {ZAHL(state.gold)}
                        </span>
                        <input type="number" value={goldEingabe} onChange={(e) => setGoldEingabe(e.target.value)}
                            placeholder="Betrag" className={`${EINGABE} w-28`} />
                        <Knopf disabled={laeuft || goldEingabe === ""} titel="Gold auf diesen Wert setzen"
                            onClick={() => patch({ op: "gold", modus: "setzen", wert: Number(goldEingabe) })}>
                            Setzen
                        </Knopf>
                        <Knopf disabled={laeuft || goldEingabe === ""} titel="Betrag addieren (negativ = abziehen)"
                            onClick={() => patch({ op: "gold", modus: "addieren", wert: Number(goldEingabe) })}>
                            Addieren
                        </Knopf>
                    </div>
                    <Knopf onClick={laden} disabled={laeuft} titel="Neu laden"><RefreshCw size={13} /></Knopf>
                    {onClose ? <Knopf onClick={onClose} titel="Schließen"><X size={13} /></Knopf> : null}
                </div>
            </div>

            {meldung ? (
                <div className={`flex items-start gap-2 mt-3 px-3 py-2 rounded-sm border text-xs ${
                    meldung.fehler
                        ? "border-red-900/60 bg-red-900/20 text-red-200"
                        : "border-emerald-900/60 bg-emerald-900/20 text-emerald-200"
                }`}>
                    {meldung.fehler ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <Check size={13} className="mt-0.5 shrink-0" />}
                    <span className="flex-1">{meldung.text}</span>
                    <button type="button" onClick={() => setMeldung(null)} aria-label="Meldung schließen"
                        className="shrink-0 opacity-60 transition-opacity hover:opacity-100">
                        <X size={12} />
                    </button>
                </div>
            ) : null}

            {/* Reiter */}
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 mt-3 mb-3">
                {listen.map((l) => (
                    <button key={l.feld} type="button" onClick={() => setReiter(l.feld)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                            reiter === l.feld ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                        }`}>
                        {l.label}
                        <span className="text-[10px] text-slate-500 tabular-nums">{(state[l.feld] || []).length}</span>
                        {/* Punkt = gehört dem Server und greift sofort. Ohne Punkt muss
                            der Browser des Spielers erst nachladen (Hinweis unten). */}
                        {l.serverbesitz ? <span className="h-1 w-1 rounded-sm bg-emerald-500" title="Serverbesitz" /> : null}
                    </button>
                ))}
                <button type="button" onClick={() => setReiter("werte")}
                    className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        reiter === "werte" ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}>
                    Werte
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                {reiter === "werte" ? (
                    <WerteFormular katalog={katalog} state={state} laeuft={laeuft}
                        onSpeichern={(werte) => patch({ op: "felder", werte })} />
                ) : (
                    <>
                        {aktuelleListe?.art ? (
                            <GebenFormular art={aktuelleListe.art} katalog={katalog} laeuft={laeuft}
                                onGeben={(eintrag, anzahl) => patch({ op: "geben", liste: reiter, eintrag, anzahl: Number(anzahl) })} />
                        ) : (
                            <div className="text-[11px] text-slate-500 mb-3">
                                {reiter === "petPlacements" || reiter === "decoPlacements"
                                    ? "Platzierte Stücke brauchen Koordinaten — hinzufügen geht nur im Spiel."
                                    : "Kiste und Vitrine füllt der Spieler selbst; hier lässt sich nur entfernen."}
                            </div>
                        )}

                        {!aktuelleListe?.serverbesitz && online ? (
                            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-sm border border-amber-900/60 bg-amber-900/15 text-amber-200 text-[11px]">
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                <span>
                                    Diese Liste gehört dem Browser des Spielers. Die Änderung greift erst,
                                    wenn sein Spiel nachgeladen hat — das stösst der Server automatisch an.
                                </span>
                            </div>
                        ) : null}

                        <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                {eintraege.length} Einträge
                            </span>
                            {eintraege.length > 0 ? (
                                <Knopf variante="gefahr" disabled={laeuft}
                                    onClick={() => patch({ op: "leeren", liste: reiter })}>
                                    <Trash2 size={13} /> Alles löschen
                                </Knopf>
                            ) : null}
                        </div>

                        <div className="divide-y divide-slate-800 border border-slate-800 rounded-md">
                            {eintraege.map((item, i) => (
                                <div key={idVon(item) || i} className="flex items-center gap-3 px-3 py-2">
                                    <SpecialItemIcon item={item} className="w-8 h-8" emojiClassName="text-xl" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs text-white truncate">
                                            {item?.customName || item?.name || "Unbenannt"}
                                            {item?.customName ? <span className="text-slate-500"> ({item.name})</span> : null}
                                        </div>
                                        <div className="text-[10px] text-slate-500 truncate">{beschreibe(item)}</div>
                                    </div>
                                    <Knopf variante="gefahr" disabled={laeuft} titel="Entfernen"
                                        onClick={() => patch({ op: "entfernen", liste: reiter, id: idVon(item) })}>
                                        <Trash2 size={12} />
                                    </Knopf>
                                </div>
                            ))}
                            {eintraege.length === 0 ? (
                                <div className="px-3 py-6 text-center text-xs text-slate-600">Leer.</div>
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
