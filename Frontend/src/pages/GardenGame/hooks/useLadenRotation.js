// hooks/useLadenRotation.js
// Laden-Rotation: Angebot und Bestand vom Server holen, Rotationswechsel ansagen, Countdown-Ziele
// setzen, Bestand nach Käufen übernehmen. Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useCallback, useEffect } from "react";
import { generateShopRotation } from "../engine/PlantSystem";
import { SHOP_ROTATION_MS, WEATHER_BY_ROLL, rollWeatherFromRotation } from "../engine/gameConstants";

export default function useLadenRotation({
    letzterKaufAtRef, setLadenBestand, savedToolShopStockRef, toolShopRotation, setToolShopStock,
    ladenbestandGeladen, savedEggShopStockRef, eggShopRotation, setEggShopStock, showLobbyScreen,
    apiCall, setShopRotationIfChanged, bestandFuerRotationRef, seedRotationKeyRef,
    announceRotation, seedNextRotationAtRef, setToolShopRotation, toolRotationKeyRef,
    toolShopSeededForGenAtRef, toolNextRotationAtRef, letzterToolKaufAtRef, setEggShopRotation,
    eggRotationKeyRef, eggShopSeededForGenAtRef, eggNextRotationAtRef, setShopCountdown,
    setToolShopCountdown, setEggShopCountdown, ladenOffenRef, shopRotation, shopBootstrapTriedRef,
    weltUebersteuerung, setWeatherState, playSound, notify,
}) {
    /**
     * Ladenbestand aus der Serverantwort übernehmen.
     *
     * Der Bestand ist seit v4.0 GLOBAL und gehört dem Server: alle teilen sich
     * einen Vorrat je Sorte. Vorher hatte jeder Spieler seinen eigenen, der Browser
     * hat ihn selbst heruntergezählt und im Spielstand mitgeführt — geprüft hat ihn
     * nie jemand. Der gespeicherte Bestand aus alten Ständen (`shopStock`) wird
     * deshalb bewusst NICHT mehr wiederhergestellt; er würde den echten überschreiben.
     */
    const uebernimmBestand = useCallback((rotation, angefordertAm = Infinity) => {
        // Eine Antwort, die VOR dem letzten Kauf losgeschickt wurde, kennt diesen
        // Kauf noch nicht. Sie trägt damit den Stand von davor und würde die frisch
        // abgezogene Zahl wieder hochsetzen — genau das Zurückspringen, das man nach
        // dem Kaufen kurz sah. Der Laden fragt alle vier Sekunden nach; die Chance,
        // dass ein Klick genau in eine laufende Abfrage fällt, ist entsprechend hoch.
        if (angefordertAm < letzterKaufAtRef.current) return;
        const stock = {};
        for (const s of rotation?.seeds || []) {
            stock[s.seedId] = s.active ? Math.max(0, Number(s.stock) || 0) : 0;
        }
        setLadenBestand(stock);
    }, []);

    useEffect(() => {
        if (savedToolShopStockRef.current && toolShopRotation?.generatedAt) {
            if (savedToolShopStockRef.current.version === Number(toolShopRotation.generatedAt)) {
                setToolShopStock(savedToolShopStockRef.current.stock);
            }
            savedToolShopStockRef.current = null;
        }
    }, [toolShopRotation?.generatedAt, ladenbestandGeladen]);

    useEffect(() => {
        if (savedEggShopStockRef.current && eggShopRotation?.generatedAt) {
            if (savedEggShopStockRef.current.version === Number(eggShopRotation.generatedAt)) {
                setEggShopStock(savedEggShopStockRef.current.stock);
            }
            savedEggShopStockRef.current = null;
        }
    }, [eggShopRotation?.generatedAt, ladenbestandGeladen]);

    // ── Shop rotation (global backend source) ──────────────────────
    useEffect(() => {
        if (showLobbyScreen) return;

        let rotationTimer = null;
        const fetchGlobalShop = async () => {
            try {
                // Vor dem Abschicken merken: nur so lässt sich hinterher erkennen,
                // ob zwischenzeitlich ein eigener Kauf durchging (siehe uebernimmBestand).
                const angefordertAm = Date.now();
                const data = await apiCall("/global-shop");
                const now = Date.now();

                setShopRotationIfChanged(data.shopRotation || null);
                const seedGen = data.shopRotation?.generatedAt;
                // Bei JEDER Antwort übernehmen, nicht nur beim Rotationswechsel:
                // der Vorrat ist global und sinkt zwischendurch, weil andere kaufen.
                uebernimmBestand(data.shopRotation, angefordertAm);
                bestandFuerRotationRef.current = Number(seedGen);
                const seedKey = String(data.shopRotation?.generatedAt || "");
                if (seedKey && seedRotationKeyRef.current && seedRotationKeyRef.current !== seedKey) {
                    announceRotation("Samen-Shop hat rotiert");
                }
                if (seedKey) seedRotationKeyRef.current = seedKey;
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);

                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    const toolKey = String(data.toolShopRotation.generatedAt || "");
                    if (toolKey && toolRotationKeyRef.current && toolRotationKeyRef.current !== toolKey) {
                        announceRotation("Tool-Shop neu aufgefüllt");
                    }
                    if (toolKey) toolRotationKeyRef.current = toolKey;
                    // Nur beim WECHSEL der Rotation auffüllen — sonst macht der Poller
                    // jeden Kauf nach spätestens 30 s wieder rückgängig.
                    const toolGen = Number(data.toolShopRotation.generatedAt);
                    if (toolGen !== toolShopSeededForGenAtRef.current) {
                        const nextStock = {};
                        for (const item of data.toolShopRotation.items || []) {
                            if (item.type === "single") nextStock[item.id] = item.stock || 0;
                        }
                        setToolShopStock(nextStock);
                        toolShopSeededForGenAtRef.current = toolGen;
                    }
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation.nextRotation || 0);
                }

                // Server-Wahrheit bei JEDER Antwort übernehmen, nicht nur beim
                // Rotationswechsel (genau wie uebernimmBestand für Samen oben) —
                // sonst korrigiert sich ein einmal verdrehter Bestand (siehe
                // handleBuyTool) erst wieder nach zehn Minuten von selbst. Nur die
                // Sorten mit echtem Kontingent (plant_pot, watering_can): Spitzhacke
                // und Rucksack sind absichtlich unbegrenzt, ihr `stock` aus
                // werkzeugladen ist dafür nicht gedacht.
                if (Array.isArray(data.werkzeugladen) && angefordertAm >= letzterToolKaufAtRef.current) {
                    const mitKontingent = new Set(
                        (data.toolShopRotation?.items || [])
                            .filter((item) => item.type === "single")
                            .map((item) => item.id),
                    );
                    if (mitKontingent.size > 0) {
                        const naechsterBestand = {};
                        for (const eintrag of data.werkzeugladen) {
                            if (mitKontingent.has(eintrag.id) && Number.isFinite(eintrag.stock)) {
                                naechsterBestand[eintrag.id] = Math.max(0, eintrag.stock);
                            }
                        }
                        if (Object.keys(naechsterBestand).length > 0) {
                            setToolShopStock((prev) => ({ ...prev, ...naechsterBestand }));
                        }
                    }
                }

                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    const eggKey = String(data.eggShopRotation.generatedAt || "");
                    if (eggKey && eggRotationKeyRef.current && eggRotationKeyRef.current !== eggKey) {
                        announceRotation("Eier-Shop hat rotiert");
                    }
                    if (eggKey) eggRotationKeyRef.current = eggKey;
                    const eggGen = Number(data.eggShopRotation.generatedAt);
                    if (eggGen !== eggShopSeededForGenAtRef.current) {
                        const nextEggStock = {};
                        for (const item of data.eggShopRotation.items || []) {
                            nextEggStock[item.id] = item.stock || 0;
                        }
                        setEggShopStock(nextEggStock);
                        eggShopSeededForGenAtRef.current = eggGen;
                    }
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation.nextRotation || 0);
                }

                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));

                // Steht der Samenladen offen, häufiger nachfragen: der Vorrat ist
                // global, andere kaufen währenddessen, und ein Regal, das erst nach
                // 30 Sekunden leer wird, schickt einen bloss in „ausverkauft".
                const takt = ladenOffenRef.current === "seed" ? 4_000 : 30_000;
                const nextTimerMs = Math.max(1500, Math.min(
                    ...[
                        seedNextRotationAtRef.current,
                        toolNextRotationAtRef.current,
                        eggNextRotationAtRef.current,
                    ].filter(Boolean).map(ts => Math.max(0, ts - now)),
                    takt
                ));
                rotationTimer = setTimeout(fetchGlobalShop, nextTimerMs + 200);
            } catch {
                // Keep current rotation/timer on transient API failures to avoid
                // premature weather/shop jumps and visible UI flashing.
                if (!shopRotation?.generatedAt) {
                    const fallback = generateShopRotation(8);
                    setShopRotationIfChanged(fallback);
                    uebernimmBestand(fallback);
                    bestandFuerRotationRef.current = Number(fallback.generatedAt);
                    seedNextRotationAtRef.current = Date.now() + SHOP_ROTATION_MS;
                    setShopCountdown(SHOP_ROTATION_MS);
                }
                rotationTimer = setTimeout(fetchGlobalShop, 5000);
            }
        };
        fetchGlobalShop();
        return () => clearTimeout(rotationTimer);
    }, [showLobbyScreen, apiCall, uebernimmBestand, announceRotation, setShopRotationIfChanged]);

    // Einmaliger Nachlade-Versuch, falls beim Betreten noch keine Rotation da ist.
    //
    // Vorher hing dieser Effekt am GESAMTEN `shopRotation`-Objekt und setzte es selbst neu:
    // liefert der Server eine Rotation ohne Samen (`seeds: []`), greift die Abbruchprüfung
    // `shopRotation?.seeds?.length` nicht, der Effekt läuft erneut, holt, setzt ein neues
    // Objekt — und dreht sich mit voller Netzgeschwindigkeit im Kreis. In der Messung waren
    // das ~490 Zustandsänderungen pro Sekunde und damit praktisch alle React-Commits im
    // Leerlauf. Ein Ref begrenzt das jetzt auf einen Versuch; die laufende Aktualisierung
    // macht ohnehin der reguläre Rotations-Poller.
    useEffect(() => {
        if (showLobbyScreen) {
            shopBootstrapTriedRef.current = false;
            return;
        }
        if (shopRotation?.seeds?.length) return;
        if (shopBootstrapTriedRef.current) return;
        shopBootstrapTriedRef.current = true;
        apiCall("/global-shop")
            .then((data) => {
                if (!data?.shopRotation) return;
                setShopRotationIfChanged(data.shopRotation);
                const now = Date.now();
                // Wie im regulären Poller: der Vorrat ist global und gehört dem
                // Server, also wird er bei jeder Antwort übernommen statt nur beim
                // Rotationswechsel.
                uebernimmBestand(data.shopRotation);
                bestandFuerRotationRef.current = Number(data.shopRotation?.generatedAt);
                seedNextRotationAtRef.current = Number(data.nextRotation || data.shopRotation?.nextRotation || 0);
                if (data.toolShopRotation) {
                    setToolShopRotation(data.toolShopRotation);
                    toolNextRotationAtRef.current = Number(data.nextToolRotation || data.toolShopRotation?.nextRotation || 0);
                }
                if (data.eggShopRotation) {
                    setEggShopRotation(data.eggShopRotation);
                    eggNextRotationAtRef.current = Number(data.nextEggRotation || data.eggShopRotation?.nextRotation || 0);
                }
                setShopCountdown(Math.max(0, seedNextRotationAtRef.current - now));
                setToolShopCountdown(Math.max(0, toolNextRotationAtRef.current - now));
                setEggShopCountdown(Math.max(0, eggNextRotationAtRef.current - now));
            })
            .catch(() => { shopBootstrapTriedRef.current = false; });
    }, [showLobbyScreen, shopRotation?.seeds?.length, apiCall, uebernimmBestand, setShopRotationIfChanged]);

    useEffect(() => {
        if (showLobbyScreen) return;
        if (!shopRotation?.generatedAt) return;
        const rotationKey = String(shopRotation.generatedAt);
        // Von Hand gesetztes Wetter schlägt die Rotation, solange es läuft. Der
        // Rotationsschlüssel bleibt trotzdem der Anker für `startedAt`, damit die
        // Intensitätsrampe nicht bei jedem Poll neu anfängt.
        const uebersteuert = weltUebersteuerung.wetterTyp
            && (Number(weltUebersteuerung.wetterBis) || 0) > Date.now()
            ? WEATHER_BY_ROLL.find((w) => w.type === weltUebersteuerung.wetterTyp)
            : null;
        const nextWeather = uebersteuert || rollWeatherFromRotation(rotationKey);
        setWeatherState((prev) => {
            if (prev.type === nextWeather.type && prev.label === nextWeather.label && prev.startedAt === Number(rotationKey)) return prev;
            if (nextWeather.type === "rain") playSound("rain", 0.4);
            else if (nextWeather.type === "thunder") playSound("thunder", 0.5);
            return {
                ...nextWeather,
                intensity: 0.05,
                startedAt: Number(rotationKey) || Date.now(),
            };
        });
    }, [showLobbyScreen, shopRotation?.generatedAt, weltUebersteuerung.wetterTyp, weltUebersteuerung.wetterBis, notify, playSound]);
}
