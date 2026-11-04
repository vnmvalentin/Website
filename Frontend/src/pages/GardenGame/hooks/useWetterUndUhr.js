// hooks/useWetterUndUhr.js
// Wetter-Takt, Uhrzeit/Party/Saison fürs HUD (einmal je Sekunde) und Wetter-Effekte auf die Pflanzen.
// Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useEffect } from "react";
import {
    partyStand, saisonStand, uhrzeit as spielUhrzeit, istNacht, erntefestZeitraum,
    PARTY_RAINBOW_FAKTOR, SAISON_ERLOES,
} from "../engine/Tageszeit";
import { partyTrack, KATALOG_NACH_ID } from "../engine/gameConstants";
import { wetterChanceFuer, zyklusMinuten, wetterEffektSchritt, isPlantReady } from "../engine/PlantSystem";

export default function useWetterUndUhr({
    showLobbyScreen, weatherState, setWeatherState, tagesInfoRef, weltRef, setTagesInfo, notify,
    skillWirkung, setPlotPlants,
}) {
    useEffect(() => {
        if (showLobbyScreen) return undefined;
        if (!weatherState || weatherState.type === "sun" || weatherState.intensity >= 1) return undefined;
        const timer = setInterval(() => {
            setWeatherState((prev) => {
                if (!prev || prev.type === "sun" || prev.intensity >= 1) return prev;
                return { ...prev, intensity: Math.min(1, (Number(prev.intensity) || 0) + 0.16) };
            });
        }, 120);
        return () => clearInterval(timer);
    }, [showLobbyScreen, weatherState?.type]);

    /**
     * Uhrzeit und Party-Countdown fürs HUD — einmal je Sekunde.
     *
     * Der Renderer holt sich Dunkelheit und Party-Stärke jedes Bild direkt aus der Uhr
     * (siehe drawState). Hier geht es nur um die Anzeige; ein Update je Bild würde die
     * ganze Komponente sechzigmal pro Sekunde neu rendern.
     */
    useEffect(() => {
        if (showLobbyScreen) return undefined;
        let warParty = tagesInfoRef.current.party;
        let warSaison = tagesInfoRef.current.saison;
        let warFest = tagesInfoRef.current.erntefest;
        const lauf = () => {
            const now = Date.now();
            const p = partyStand(now);
            const s = saisonStand(now);
            const vonHand = Number(weltRef.current?.partyBis) || 0;
            const naechste = {
                uhrzeit: spielUhrzeit(now),
                nacht: istNacht(now),
                party: p.aktiv || vonHand > now,
                verbleibendMs: Math.max(p.aktiv ? p.verbleibendMs : 0, vonHand > now ? vonHand - now : 0),
                // Der Beginn bleibt über die ganze Party derselbe und ist damit der
                // stabile Anker für die Titelwahl — `now` wäre es nicht.
                partyBeginn: p.beginn,
                // Jahreszeit (engine/Tageszeit.js) — wechselt montags 0 Uhr UTC.
                saison: s.id, saisonName: s.name, saisonEnde: s.ende, saisonSorten: s.sorten, naechsteSaison: s.naechste.name,
                erntefest: erntefestZeitraum(now).aktiv,
            };
            setTagesInfo((alt) => (
                alt.uhrzeit === naechste.uhrzeit && alt.nacht === naechste.nacht
                    && alt.party === naechste.party && alt.partyBeginn === naechste.partyBeginn
                    && alt.saison === naechste.saison && alt.erntefest === naechste.erntefest
                    && Math.round(alt.verbleibendMs / 1000) === Math.round(naechste.verbleibendMs / 1000)
                    ? alt : naechste
            ));
            if (naechste.party !== warParty) {
                warParty = naechste.party;
                notify(naechste.party
                    ? `Partyzeit! „${partyTrack(naechste.partyBeginn).name}" läuft — Rainbow ist ${PARTY_RAINBOW_FAKTOR}× so wahrscheinlich.`
                    : "Die Party ist vorbei. Rainbow ist wieder so selten wie sonst.");
            }
            if (naechste.erntefest !== warFest) {
                warFest = naechste.erntefest;
                notify(naechste.erntefest
                    ? "Das Erntefest hat begonnen! Jede Ernte bringt Punkte für das gemeinsame Ziel — Saisonware zählt doppelt. Stand am Missionsbrett."
                    : "Das Erntefest ist vorbei. Deine Belohnung wartet am Missionsbrett.");
            }
            if (naechste.saison !== warSaison) {
                warSaison = naechste.saison;
                const namen = s.sorten.map((id) => KATALOG_NACH_ID.get(id)?.name || id).join(", ");
                notify(`Der ${s.name} beginnt! Saisonsorten (+${Math.round((SAISON_ERLOES - 1) * 100)} %, öfter im Laden): ${namen}`);
            }
        };
        lauf();
        const timer = setInterval(lauf, 1000);
        return () => clearInterval(timer);
    }, [showLobbyScreen, notify]);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        const effectType =
            weatherState?.type === "rain" ? "wet"
                : weatherState?.type === "snow" ? "frozen"
                    : weatherState?.type === "thunder" ? "charged"
                        : weatherState?.type === "moonlight" ? "moonlit"
                            : null;
        const interval = setInterval(() => {
            const now = Date.now();
            // Wetterfühlig: das Wetter greift häufiger zu.
            const skillFaktor = 1 + skillWirkung("wetterfuehlig");
                setPlotPlants((prev) => {
                let changed = false;
                const next = { ...prev };
                for (const [key, plant] of Object.entries(prev)) {
                    if (!plant) continue;
                    // Die Chance hängt jetzt am ZYKLUS der Pflanze, nicht mehr an
                    // einer festen Rate pro Minute. Vorher bekam eine Sorte mit
                    // Tagen an Wachstum garantiert alle vier Effekte (×11,25), eine
                    // mit Minuten praktisch keinen (×1,02) — der Aufschlag hing
                    // allein an der Wachstumsdauer und liess sich nicht einpreisen.
                    const wetterChance = wetterChanceFuer(zyklusMinuten(plant), skillFaktor);

                    // ── Dauerträger: Effekt hängt an der einzelnen Frucht ──────────
                    // Jede reife Frucht würfelt für sich. Dadurch können an einem Strauch
                    // zwei Früchte gefroren sein, ohne dass das Ernten der einen die
                    // andere zurücksetzt.
                    if (!plant.singleUse && Array.isArray(plant.fruitSlots)) {
                        let slotsChanged = false;
                        const nextSlots = plant.fruitSlots.map((slot) => {
                            if (!slot) return slot;
                            const aenderung = wetterEffektSchritt(slot, effectType, (slot.readyAt || 0) <= now, now, wetterChance);
                            if (!aenderung) return slot;
                            slotsChanged = true;
                            return { ...slot, ...aenderung };
                        });
                        if (slotsChanged) {
                            changed = true;
                            next[key] = { ...plant, fruitSlots: nextSlots };
                        }
                        continue;
                    }

                    // ── Einmalernte: Effekt gehört zur ganzen Pflanze ──────────────
                    const aenderung = wetterEffektSchritt(plant, effectType, isPlantReady(plant), now, wetterChance);
                    if (!aenderung) continue;
                    changed = true;
                    next[key] = { ...plant, ...aenderung };
                }
                return changed ? next : prev;
            });
        }, 60 * 1000);
        return () => clearInterval(interval);
        // Nur der Wetter-TYP ist relevant — mit dem vollen Objekt wurde das Intervall
        // während der Intensitäts-Rampe alle 120ms neu aufgesetzt. `skillWirkung` ist
        // ein Ref-Leser und ändert sich nie, hält das Intervall also auch nicht auf.
    }, [showLobbyScreen, weatherState?.type, skillWirkung]);
}
