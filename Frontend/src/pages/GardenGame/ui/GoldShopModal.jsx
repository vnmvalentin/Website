// ui/GoldShopModal.jsx
// Der Gold-Shop: rein kosmetische Reskins für Schuppen, Briefkasten und
// Namensschild — teuer, weil sie nichts als den Look ändern.
//
// Katalog UND "schon gekauft"/"ausgerüstet" kommen vom Server (GET
// /api/garden/reskins) — wie beim Missionsbrett und dem Fähigkeitsbaum: eine
// Anzeige, die etwas anderes verspricht als die Route tatsächlich auszahlt,
// wäre schlimmer als gar keine Anzeige.
import React, { useState } from 'react';
import { GardenModal, PrimaryButton, TabBar, GoldTag } from './gardenUi';
import { HudIcon } from './gameIcons';

// Alle drei Reiter zeigen echte Icons statt lucide (Feedback 31.08./01.09.:
// "dont use lucide icons anymore for things like that"). Werkzeug-Reiter
// raus (Feedback 01.09.) — der Katalog dahinter war ohnehin leer (kein
// eigenes Bild für Spitzhacke/Gießkanne/Schaufel geliefert), siehe
// core/reskins.js für die passende Entfernung dort.
const TAB_META = {
    shed: { label: "Schuppen", icon: HudIcon.shed },
    mailbox: { label: "Briefkasten", icon: HudIcon.mailbox },
    nameplate: { label: "Nameplate", icon: HudIcon.nameplate },
};
const TAB_REIHENFOLGE = ["shed", "mailbox", "nameplate"];

/**
 * Zurück zum Standard-Look — fehlte bisher (Feedback 01.09.: "einmal gekauft,
 * kein Weg mehr zurück zum Standard"), obwohl der Server das längst kann
 * (reskinAusruesten mit id: null, core/reskins.js). Ein synthetischer
 * Katalog-Eintrag oben in jeder Kategorie reicht — schon "gekauft" (es ist
 * ja der Ausgangszustand).
 */
const STANDARD_EINTRAG = {
    shed: { id: null, name: "Standard", price: 0, gekauft: true, image: "/garden-assets/world/shed.png" },
    mailbox: { id: null, name: "Standard", price: 0, gekauft: true, image: "/garden-assets/world/mailbox.png" },
    nameplate: {
        id: null, name: "Standard", price: 0, gekauft: true,
        // Dieselben Farben wie der eigene Nametag ohne Reskin (Renderer.js,
        // _drawPlayerNametag, isLocal-Zweig) — als Verlauf mit sich selbst,
        // damit Vorschau keinen Sonderfall braucht.
        farbe: { bg: "rgba(15,23,42,0.9)", bg2: "rgba(30,41,59,0.9)", border: "rgba(148,163,184,0.7)", text: "#e2e8f0" },
    },
};

function Vorschau({ kategorie, eintrag }) {
    if (kategorie === "nameplate") {
        const f = eintrag.farbe || {};
        // Derselbe diagonale Verlauf wie in der Welt (Renderer.js,
        // _drawPlayerNametag) — sonst zeigt der Laden eine flache Farbe für
        // etwas, das im Spiel eine Textur ist.
        return (
            <span
                className="flex h-9 items-center justify-center rounded-lg border-2 px-3 text-xs font-bold"
                style={{ background: `linear-gradient(135deg, ${f.bg}, ${f.bg2 || f.bg})`, borderColor: f.border, color: f.text }}
            >
                {eintrag.name}
            </span>
        );
    }
    return (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-amber-950/40 bg-amber-50 p-1">
            {eintrag.image ? (
                <img src={eintrag.image} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
            ) : null}
        </div>
    );
}

function ReskinKarte({ kategorie, eintrag, ausgeruestet, gold, onKaufen, onAusruesten, busy }) {
    // Der Standard-Eintrag (id: null) gilt auch dann als aktiv, wenn noch nie
    // etwas ausgerüstet wurde (ausgeruestet[kategorie] dann undefined statt
    // null) — sonst zeigte "Standard" auf einem frischen Konto fälschlich
    // "Ausrüsten" statt "Aktiv".
    const istAusgeruestet = eintrag.id === null
        ? (ausgeruestet === null || ausgeruestet === undefined)
        : ausgeruestet === eintrag.id;
    const leistbar = gold >= eintrag.price;
    return (
        <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
            istAusgeruestet ? "border-emerald-600/60 bg-emerald-950/20" : "border-slate-800 bg-slate-900/50"
        }`}>
            <Vorschau kategorie={kategorie} eintrag={eintrag} />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">{eintrag.name}</div>
                {!eintrag.gekauft && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs font-bold text-amber-300 tabular-nums">
                        {eintrag.price.toLocaleString("de-DE")} Gold
                    </div>
                )}
                {istAusgeruestet && (
                    <div className="mt-0.5 text-[11px] font-semibold text-emerald-400">Ausgerüstet</div>
                )}
            </div>
            {eintrag.gekauft ? (
                <PrimaryButton
                    onClick={() => onAusruesten(kategorie, eintrag.id)}
                    disabled={istAusgeruestet || busy}
                    className="shrink-0 px-3 py-1.5 text-xs"
                >
                    {istAusgeruestet ? "Aktiv" : "Ausrüsten"}
                </PrimaryButton>
            ) : (
                <PrimaryButton
                    onClick={() => onKaufen(kategorie, eintrag.id)}
                    disabled={!leistbar || busy}
                    className="shrink-0 px-3 py-1.5 text-xs"
                >
                    {leistbar ? "Kaufen" : "Zu teuer"}
                </PrimaryButton>
            )}
        </div>
    );
}

export default function GoldShopModal({ offen, onClose, onBack, daten, gold, onKaufen, onAusruesten }) {
    const [tab, setTab] = useState("shed");
    const [laufendeId, setLaufendeId] = useState(null);
    if (!offen) return null;

    const katalog = daten?.katalog || {};
    const ausgeruestet = daten?.ausgeruestet || {};
    const standard = STANDARD_EINTRAG[tab];
    const liste = standard ? [standard, ...(katalog[tab] || [])] : (katalog[tab] || []);

    const tabs = TAB_REIHENFOLGE.map((key) => ({
        key,
        label: TAB_META[key].label,
        icon: TAB_META[key].icon,
        count: (katalog[key] || []).filter((e) => e.gekauft).length + "/" + (katalog[key] || []).length,
    }));

    const sperre = async (fn, kategorie, id) => {
        const sperrId = `${kategorie}:${id}`;
        if (laufendeId) return;
        setLaufendeId(sperrId);
        try { await fn(kategorie, id); } finally { setLaufendeId(null); }
    };

    return (
        <GardenModal
            title="Gold-Shop"
            subtitle="Rein kosmetisch — kein Vorteil, nur ein anderer Look."
            onClose={onClose}
            onBack={onBack}
            width="max-w-lg"
            headerRight={<GoldTag gold={gold} />}
            toolbar={<TabBar tabs={tabs} active={tab} onSelect={setTab} />}
        >
            {liste.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Gerade nichts im Angebot.</p>
            ) : (
                <div className="space-y-2">
                    {liste.map((eintrag) => (
                        <ReskinKarte
                            key={eintrag.id}
                            kategorie={tab}
                            eintrag={eintrag}
                            ausgeruestet={ausgeruestet[tab]}
                            gold={gold}
                            onKaufen={(k, id) => sperre(onKaufen, k, id)}
                            onAusruesten={(k, id) => sperre(onAusruesten, k, id)}
                            busy={laufendeId === `${tab}:${eintrag.id}`}
                        />
                    ))}
                </div>
            )}
        </GardenModal>
    );
}
