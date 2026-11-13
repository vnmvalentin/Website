// ui/Umkleide.jsx
// Die Umkleide als Figurenauswahl wie in einem Spiel (06.11.): die Katze groß auf
// einem Podest, Pfeile links und rechts zum Durchblättern, darunter eine Leiste mit
// allen Figuren. Steht im Haus als Kleiderschrank (ui/HausInnen.jsx) und hängt
// weiter am Umkleide-Knopf im Profil — beides öffnet diesen Bildschirm.
//
// Gesperrte Kostüme bleiben sichtbar (als Schattenriss mit Level), wie vorher in
// WardrobeModal: ein Ziel, das man nicht sieht, ist kein Ziel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ALLE_SKINS, normalisiereSkin } from "./wardrobe";
import { versionedAsset } from "../engine/assetVersion";
import { PrimaryButton, NebenKnopf } from "./gardenUi";

const GRUPPEN = [
    { id: "farbe", name: "Fellfarben" },
    { id: "kostuem", name: "Kostüme" },
];

/** Dreieckspfeil aus Bildpunkten, wie der Pfeil über den Ständen. */
function Pfeil({ richtung, onClick, label }) {
    const zeilen = [8, 6, 4, 2];
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="group flex h-20 w-14 items-center justify-center border-[3px] border-[#3b2516] bg-[#fff3c4] shadow-[0_4px_0_0_#3b2516] transition-transform duration-100 active:translate-y-1 active:shadow-[0_1px_0_0_#3b2516] sm:h-24 sm:w-16"
        >
            <span className={`flex flex-col items-center ${richtung === "links" ? "rotate-90" : "-rotate-90"}`}>
                {zeilen.map((b, i) => (
                    <span key={i} className="block h-1.5 bg-[#3b2516] group-hover:bg-[#8a5a32]" style={{ width: `${b * 6}px` }} />
                ))}
            </span>
        </button>
    );
}

export default function Umkleide({ offen, onClose, aktuellerSkin, level, onWaehlen }) {
    const getragen = normalisiereSkin(aktuellerSkin);
    const [index, setIndex] = useState(() => Math.max(0, ALLE_SKINS.findIndex((s) => s.skin === getragen)));
    const [richtung, setRichtung] = useState(1);
    const lvl = Number(level) || 1;

    // Beim Öffnen auf die getragene Figur springen
    useEffect(() => {
        if (offen) setIndex(Math.max(0, ALLE_SKINS.findIndex((s) => s.skin === getragen)));
    }, [offen, getragen]);

    const blaettern = useCallback((schritt) => {
        setRichtung(schritt);
        setIndex((i) => (i + schritt + ALLE_SKINS.length) % ALLE_SKINS.length);
    }, []);

    const eintrag = ALLE_SKINS[index];
    const frei = lvl >= (eintrag?.ab || 1);
    const traegt = eintrag?.skin === getragen;

    const anziehen = useCallback(() => {
        if (!eintrag || !frei || traegt) return;
        onWaehlen?.(eintrag.skin);
    }, [eintrag, frei, traegt, onWaehlen]);

    useEffect(() => {
        if (!offen) return undefined;
        const taste = (e) => {
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea") return;
            const k = e.key.toLowerCase();
            if (k === "arrowleft" || k === "a") { e.preventDefault(); e.stopPropagation(); blaettern(-1); }
            else if (k === "arrowright" || k === "d") { e.preventDefault(); e.stopPropagation(); blaettern(1); }
            else if (k === "enter" || k === " " || k === "e") { e.preventDefault(); e.stopPropagation(); anziehen(); }
            else if (k === "escape") { e.preventDefault(); e.stopPropagation(); onClose?.(); }
        };
        // capture: vor dem Raum (HausInnen) und der Welt, die sonst mitlaufen würden
        window.addEventListener("keydown", taste, true);
        return () => window.removeEventListener("keydown", taste, true);
    }, [offen, blaettern, anziehen, onClose]);

    const freiGesamt = useMemo(() => ALLE_SKINS.filter((s) => lvl >= s.ab).length, [lvl]);

    if (!offen || !eintrag) return null;
    const gruppe = GRUPPEN.find((g) => g.id === eintrag.gruppe);
    const springeZuGruppe = (id) => {
        const ziel = ALLE_SKINS.findIndex((s) => s.gruppe === id);
        if (ziel >= 0) { setRichtung(ziel > index ? 1 : -1); setIndex(ziel); }
    };

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#140d08] px-4 py-6 text-[#f3e3c3]" role="dialog" aria-label="Umkleide">
            <style>{`
                @keyframes gfUmkleideWippen { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
                @keyframes gfUmkleideRein { from { opacity: 0; transform: translateX(var(--von)) } to { opacity: 1; transform: translateX(0) } }
            `}</style>
            {/* Bühne: Holzwand mit Streifen, Licht von oben als harte Stufen statt Verlauf */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, #2a1a10 0 22px, #24160d 22px 26px)" }} />
            <div className="pointer-events-none absolute left-1/2 top-0 h-[70%] w-[min(560px,90vw)] -translate-x-1/2" style={{ background: "linear-gradient(#fff3c41a 0 33%, #fff3c412 33% 66%, #fff3c40a 66%)", clipPath: "polygon(30% 0, 70% 0, 100% 100%, 0 100%)" }} />

            <div className="relative z-10 flex w-full max-w-3xl items-center justify-between">
                <div className="flex gap-2">
                    {GRUPPEN.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => springeZuGruppe(g.id)}
                            className={`border-[3px] px-3 py-1.5 text-xs font-bold ${eintrag.gruppe === g.id ? "border-[#3b2516] bg-[#fff3c4] text-[#3b2516]" : "border-[#6e4426] bg-[#2a1a10] text-[#c9b48a] hover:text-[#f3e3c3]"}`}
                        >
                            {g.name}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-[#c9b48a]">{freiGesamt} von {ALLE_SKINS.length} freigeschaltet</span>
                <NebenKnopf onClick={() => onClose?.()}>Fertig (Esc)</NebenKnopf>
            </div>

            <div className="relative z-10 mt-4 flex w-full max-w-3xl flex-1 items-center justify-between gap-2" style={{ maxHeight: 460 }}>
                <Pfeil richtung="links" label="Vorherige Figur" onClick={() => blaettern(-1)} />
                <div className="flex flex-1 flex-col items-center">
                    <div key={index} className="flex flex-col items-center" style={{ animation: "gfUmkleideRein 180ms steps(4) both", "--von": `${richtung * 40}px` }}>
                        <img
                            src={versionedAsset(eintrag.skin)}
                            alt={eintrag.name}
                            draggable={false}
                            className="h-[min(300px,38vh)] w-auto object-contain"
                            style={{
                                imageRendering: "pixelated",
                                animation: frei ? "gfUmkleideWippen 1.1s steps(2) infinite" : "none",
                                filter: frei ? "none" : "brightness(0) opacity(0.55)",
                            }}
                        />
                    </div>
                    {/* Podest */}
                    <div className="-mt-3 h-4 w-56 bg-[#000]/40" style={{ clipPath: "ellipse(50% 50% at 50% 50%)" }} />
                    <div className="mt-1 h-5 w-64 border-[3px] border-[#3b2516] bg-[#8a5a32] shadow-[inset_0_3px_0_0_#b07a45]" />
                    <div className="h-4 w-72 border-x-[3px] border-b-[3px] border-[#3b2516] bg-[#6e4426]" />
                </div>
                <Pfeil richtung="rechts" label="Nächste Figur" onClick={() => blaettern(1)} />
            </div>

            <div className="relative z-10 mt-4 flex flex-col items-center gap-1 text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9b48a]">{gruppe?.name}</span>
                <span className="text-2xl font-bold text-[#fff3c4] sm:text-3xl">{eintrag.name}</span>
                <span className="text-sm text-[#c9b48a]">
                    {traegt ? "Trägst du gerade" : frei ? "Freigeschaltet" : `Ab Level ${eintrag.ab} · du bist Level ${lvl}`}
                </span>
                <PrimaryButton className="mt-2 min-w-40" disabled={!frei || traegt} onClick={anziehen}>
                    {traegt ? "Angezogen" : frei ? "Anziehen" : "Noch gesperrt"}
                </PrimaryButton>
            </div>

            {/* Leiste mit allen Figuren */}
            <div className="relative z-10 mt-5 flex max-w-full gap-1.5 overflow-x-auto pb-1">
                {ALLE_SKINS.map((s, i) => {
                    const offenS = lvl >= s.ab;
                    return (
                        <button
                            key={s.skin}
                            type="button"
                            title={offenS ? s.name : `${s.name} — ab Level ${s.ab}`}
                            onClick={() => { setRichtung(i > index ? 1 : -1); setIndex(i); }}
                            className={`relative h-12 w-10 shrink-0 border-[3px] ${i === index ? "border-[#fff3c4] bg-[#6e4426]" : "border-[#3b2516] bg-[#2a1a10] hover:bg-[#3b2516]"}`}
                        >
                            <img
                                src={versionedAsset(s.skin)}
                                alt=""
                                draggable={false}
                                className="h-full w-full object-contain object-bottom"
                                style={{ imageRendering: "pixelated", filter: offenS ? "none" : "brightness(0) opacity(0.5)" }}
                            />
                            {s.skin === getragen && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 border-2 border-[#3b2516] bg-[#7fc25a]" />}
                        </button>
                    );
                })}
            </div>
            <span className="relative z-10 mt-2 text-[11px] text-[#8a7a5a]">◀ ▶ oder A / D zum Blättern · Enter zum Anziehen</span>
        </div>
    );
}
