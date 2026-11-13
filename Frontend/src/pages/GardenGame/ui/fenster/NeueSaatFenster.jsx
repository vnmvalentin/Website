// ui/fenster/NeueSaatFenster.jsx — „Neue Saat": Farm neu anfangen gegen einen
// dauerhaften Stern (Backend garden/core/prestige.js). Zeigt Fortschritt, was
// verloren geht, was bleibt und was der Stern bringt. Der Neustart braucht zwei
// Klicks; danach lädt die Seite neu, weil sich fast der ganze Spielstand ändert.
import React, { useEffect, useState } from "react";
import { StandFenster } from "../laden/Marktstand";
import { Abschnitt, ProgressBar, PrimaryButton, NebenKnopf, LeerHinweis } from "../gardenUi";
import { formatGold } from "../gardenTokens";
import { sterneText } from "../prestige";

const WEG = [
    "Gold, Level und Fähigkeiten",
    "Freigelegte Felder und Steine",
    "Rucksack-Stufe, Samen und Ernte",
    "Kiste und Vitrine samt Inhalt",
    "Schaufel und Werkzeug-Vorräte",
    "Ausgebaute Brutplätze",
];
const BLEIBT = [
    "Logbuch und Zuchtbuch",
    "Tiere und Eier",
    "Deko und Umkleide",
    "Gold-Shop-Käufe",
    "Wettbewerbs-Siege und Post",
    "Insgesamt gesammeltes Gold",
];

export default function NeueSaatFenster({ apiCall, onClose, notify, stand: anfangsStand }) {
    const [stand, setStand] = useState(anfangsStand || null);
    const [fehler, setFehler] = useState(false);
    const [nachfragen, setNachfragen] = useState(false);
    const [laeuft, setLaeuft] = useState(false);

    useEffect(() => {
        let aus = false;
        apiCall("/prestige")
            .then((d) => { if (!aus) setStand(d); })
            .catch(() => { if (!aus) setFehler(true); });
        return () => { aus = true; };
    }, [apiCall]);

    const neuAnfangen = async () => {
        setLaeuft(true);
        try {
            const r = await apiCall("/neue-saat", { method: "POST", body: JSON.stringify({ bestaetigt: true }) });
            notify(`Neue Saat! Du hast jetzt ${r.prestige?.sterne || 1} Stern${(r.prestige?.sterne || 1) > 1 ? "e" : ""} — die Farm startet neu.`, "success");
            // Fast der ganze Spielstand ist neu — sauberer als jedes Feld einzeln nachzuziehen.
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            notify(e?.message || "Neue Saat hat nicht geklappt.", "error");
            setLaeuft(false);
            setNachfragen(false);
        }
    };

    if (!stand) {
        return (
            <StandFenster markise={false} inhaltHintergrund="#f3e3c3" titel="Neue Saat" onClose={onClose} breite="max-w-2xl">
                <LeerHinweis>{fehler ? "Konnte nicht geladen werden." : "Wird geladen…"}</LeerHinweis>
            </StandFenster>
        );
    }

    const naechster = stand.kosmetik?.find((k) => !k.frei);

    return (
        <StandFenster markise={false} inhaltHintergrund="#f3e3c3"
            titel="Neue Saat"
            untertitel="Fang deine Farm neu an und behalte dafür für immer einen Stern."
            onClose={onClose}
            breite="max-w-2xl"
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-amber-800/60 bg-[#fffaf0] px-4 py-3">
                    <div>
                        <div className="text-xl tracking-widest text-[#a87414]">{sterneText(stand.sterne, stand.max)}</div>
                        <div className="text-xs text-[#6e4426]">{stand.sterne} von {stand.max} Sternen</div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-[#a87414]">+{stand.bonusJetzt} %</div>
                        <div className="text-[11px] text-[#6e4426]">Gold und Erfahrung</div>
                    </div>
                </div>

                {stand.voll ? (
                    <LeerHinweis className="py-3">Du hast alle Sterne gesammelt.</LeerHinweis>
                ) : (
                    <>
                        <Abschnitt>Voraussetzungen</Abschnitt>
                        <div className="space-y-2.5 px-1">
                            <div>
                                <div className="mb-1 flex justify-between text-xs text-[#3b2516]">
                                    <span>Level</span>
                                    <span className="tabular-nums">{stand.level} / {stand.levelNoetig}</span>
                                </div>
                                <ProgressBar value={stand.level / stand.levelNoetig} className="bg-violet-500" />
                            </div>
                            <div>
                                <div className="mb-1 flex justify-between text-xs text-[#3b2516]">
                                    <span>Gold verdient seit {stand.sterne ? "dem letzten Neustart" : "Spielbeginn"}</span>
                                    <span className="tabular-nums">{formatGold(stand.verdient)} / {formatGold(stand.schwelle)}</span>
                                </div>
                                <ProgressBar value={stand.verdient / stand.schwelle} className="bg-amber-500" />
                            </div>
                        </div>

                        <Abschnitt>Was der nächste Stern bringt</Abschnitt>
                        <ul className="space-y-1 px-1 text-xs text-[#3b2516]">
                            <li>Für immer +10 % Gold beim Verkaufen und +10 % Erfahrung beim Ernten (dann +{stand.bonusDanach} %).</li>
                            {naechster && <li>Neu für dich: {naechster.name}.</li>}
                        </ul>
                    </>
                )}

                <Abschnitt>Belohnungen zum Anschauen</Abschnitt>
                <div className="grid grid-cols-1 gap-1 px-1 sm:grid-cols-2">
                    {(stand.kosmetik || []).map((k) => (
                        <div key={k.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs ${k.frei ? "border-amber-700/60 text-[#a87414]" : "border-[#3b2516] text-[#6e4426]"}`}>
                            <span className="w-9 shrink-0 tabular-nums text-[#a87414]">{k.ab} ★</span>
                            <span className="min-w-0 flex-1">{k.name}</span>
                        </div>
                    ))}
                </div>

                {!stand.voll && (
                    <div className="grid grid-cols-2 gap-3 px-1 text-xs">
                        <div>
                            <div className="mb-1 font-semibold text-red-300">Wird zurückgesetzt</div>
                            <ul className="space-y-0.5 text-[#6e4426]">{WEG.map((w) => <li key={w}>– {w}</li>)}</ul>
                        </div>
                        <div>
                            <div className="mb-1 font-semibold text-[#2f6b2c]">Bleibt dir</div>
                            <ul className="space-y-0.5 text-[#6e4426]">{BLEIBT.map((w) => <li key={w}>– {w}</li>)}</ul>
                        </div>
                    </div>
                )}

                {!stand.voll && (
                    <div className="flex items-center justify-end gap-2 border-t border-[#3b2516] pt-3">
                        {nachfragen ? (
                            <>
                                <span className="mr-auto text-xs text-red-300">Wirklich? Das lässt sich nicht rückgängig machen.</span>
                                <NebenKnopf onClick={() => setNachfragen(false)} disabled={laeuft}>Abbrechen</NebenKnopf>
                                <NebenKnopf ton="gefahr" onClick={neuAnfangen} disabled={laeuft}>
                                    {laeuft ? "Startet…" : "Ja, neu anfangen"}
                                </NebenKnopf>
                            </>
                        ) : (
                            <>
                                {!stand.bereit && <span className="mr-auto text-xs text-[#6e4426]">Noch nicht freigeschaltet.</span>}
                                <PrimaryButton onClick={() => setNachfragen(true)} disabled={!stand.bereit} className="disabled:opacity-40">
                                    Neue Saat starten
                                </PrimaryButton>
                            </>
                        )}
                    </div>
                )}
            </div>
        </StandFenster>
    );
}
