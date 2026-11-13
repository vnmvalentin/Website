// ui/GoldShopModal.jsx
// Der Gold-Shop: rein kosmetische Reskins für Schuppen, Briefkasten und
// Namensschild — teuer, weil sie nichts als den Look ändern.
//
// Katalog UND "schon gekauft"/"ausgerüstet" kommen vom Server (GET
// /api/garden/reskins) — wie beim Missionsbrett und dem Fähigkeitsbaum: eine
// Anzeige, die etwas anderes verspricht als die Route tatsächlich auszahlt,
// wäre schlimmer als gar keine Anzeige.
import React, { useEffect, useState } from 'react';
import { GoldTag } from './gardenUi';
import { StandFenster, StandReiter, Regal, WarenKachel, KaufKnopf } from './laden/Marktstand';
import { HudIcon, TabIcon } from './gameIcons';
import { hutVorschau } from '../engine/huete';
import { raumVorschau } from './hausRaum';
import { versionedAsset } from '../engine/assetVersion';

// Alle drei Reiter zeigen echte Icons statt lucide (Feedback 31.08./01.09.:
// "dont use lucide icons anymore for things like that"). Werkzeug-Reiter
// raus (Feedback 01.09.) — der Katalog dahinter war ohnehin leer (kein
// eigenes Bild für Spitzhacke/Gießkanne/Schaufel geliefert), siehe
// core/reskins.js für die passende Entfernung dort.
const TAB_META = {
    shed: { label: "Haus", icon: HudIcon.shed },
    mailbox: { label: "Briefkasten", icon: HudIcon.mailbox },
    nameplate: { label: "Namensschild", icon: HudIcon.nameplate },
    hut: { label: "Hüte", icon: HudIcon.wardrobe },
    tierhut: { label: "Tierhüte", icon: TabIcon.pet },
    tapete: { label: "Tapeten", icon: HudIcon.shed },
};
const TAB_REIHENFOLGE = ["shed", "tapete", "hut", "tierhut", "mailbox", "nameplate"];

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
    hut: { id: null, name: "Ohne Hut", price: 0, gekauft: true },
    tierhut: { id: null, name: "Ohne Hut", price: 0, gekauft: true },
    tapete: { id: null, name: "Wie das Haus", price: 0, gekauft: true },
    nameplate: {
        id: null, name: "Standard", price: 0, gekauft: true,
        // Dieselben Farben wie der eigene Nametag ohne Reskin (Renderer.js,
        // _drawPlayerNametag, isLocal-Zweig) — als Verlauf mit sich selbst,
        // damit Vorschau keinen Sonderfall braucht.
        farbe: { bg: "rgba(15,23,42,0.9)", bg2: "rgba(30,41,59,0.9)", border: "rgba(148,163,184,0.7)", text: "#e2e8f0" },
    },
};

function Vorschau({ kategorie, eintrag }) {
    // 06.11.: Hüte sind Code-Pixelbilder (engine/huete.js), Tapeten ein Blick ins Zimmer (ui/hausRaum.js)
    if (kategorie === "hut" || kategorie === "tierhut") {
        const url = eintrag.id ? hutVorschau(eintrag.id) : null;
        return url ? <img src={url} alt="" draggable={false} className="h-24 object-contain" style={{ imageRendering: "pixelated" }} /> : <span className="text-xs font-bold text-[#8a7a5a]">—</span>;
    }
    if (kategorie === "tapete") {
        const url = raumVorschau(eintrag.id);
        return url ? <img src={url} alt="" draggable={false} className="h-32 w-[92%] object-cover" style={{ imageRendering: "pixelated" }} /> : null;
    }
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
        eintrag.image ? (
            <img src={versionedAsset(eintrag.image)} alt="" className="h-32 max-w-[90%] object-contain sm:h-36" style={{ imageRendering: "pixelated" }} draggable={false} />
        ) : null
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
    // Saison-Namensschilder gibt es nur über die Saisonziele (Missionsbrett → Jahreszeit).
    const nurSaison = Boolean(eintrag.saison) && !eintrag.gekauft;
    return (
        <WarenKachel
            gross
            hervorheben={istAusgeruestet}
            band={istAusgeruestet ? { text: "Ausgerüstet", farbe: "#3f7a35", hell: "#dcebc8" }
                : eintrag.gekauft ? { text: eintrag.saison ? "Freigeschaltet" : "Gekauft", farbe: "#2f6ab0", hell: "#d4e4f4" }
                    : nurSaison ? { text: "Saisonziel", farbe: "#c8407a", hell: "#f8d8e6" }
                        : { text: "", farbe: "transparent", hell: "#f8e8b8" }}
            bild={<Vorschau kategorie={kategorie} eintrag={eintrag} />}
            name={eintrag.name}
            text={nurSaison ? (eintrag.saison === "alle" ? "Für alle vier Jahreszeiten-Namensschilder" : "Belohnung der Saisonziele (Missionsbrett → Jahreszeit)") : null}
            preis={eintrag.gekauft || nurSaison ? undefined : eintrag.price}
            leistbar={leistbar}
            aktionen={eintrag.gekauft ? (
                <KaufKnopf onClick={() => onAusruesten(kategorie, eintrag.id)} disabled={istAusgeruestet || busy}>
                    {istAusgeruestet ? "Aktiv" : "Ausrüsten"}
                </KaufKnopf>
            ) : nurSaison ? null : (
                <KaufKnopf onClick={() => onKaufen(kategorie, eintrag.id)} disabled={!leistbar || busy}>
                    {leistbar ? "Kaufen" : "Zu teuer"}
                </KaufKnopf>
            )}
        />
    );
}

export default function GoldShopModal({ offen, onClose, onBack, daten, gold, onKaufen, onAusruesten, startTab = null }) {
    const [tab, setTab] = useState("shed");
    const [laufendeId, setLaufendeId] = useState(null);
    // 11.11.: Im begehbaren Gold-Shop öffnet jedes Regal seine Abteilung (ui/HausInnen.jsx)
    useEffect(() => {
        if (offen && startTab && TAB_META[startTab]) setTab(startTab);
    }, [offen, startTab]);
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
        <StandFenster
            titel="Gold-Shop"
            untertitel="Rein kosmetisch — kein Vorteil, nur ein anderer Look"
            farbe="gold"
            bild="/garden-assets/world/gold_shop.png"
            onClose={onClose}
            onBack={onBack}
            kopfRechts={<GoldTag gold={gold} />}
            reiter={<StandReiter aktiv={tab} onWaehlen={setTab} reiter={tabs.map((t) => ({ key: t.key, label: t.label, anzahl: t.count }))} />}
        >
            {liste.length === 0 ? (
                <div className="py-6 text-center text-sm text-[#f3e3c3]">Gerade nichts im Angebot.</div>
            ) : (
                <Regal titel={TAB_META[tab]?.label}>
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
                </Regal>
            )}
        </StandFenster>
    );
}
