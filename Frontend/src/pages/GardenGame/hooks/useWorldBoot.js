// hooks/useWorldBoot.js
// Ablauf des Ladebildschirms beim Betreten einer Welt: Bilder vorladen und auf die
// Farmdaten warten, erst dann (frühestens nach WORLD_BOOT_MIN_MS) die Welt zeigen.
// Jeder Start bekommt eine Marke (token) — Rückmeldungen eines älteren Starts verfallen.
// Ausgelagert aus GameContainer.jsx. Die Statustexte erscheinen im Ladebildschirm
// (ui/menu/Ladebildschirm.jsx) und sind deshalb in Spielersprache.
import { useState, useEffect, useRef, useCallback } from "react";
import { generatePlotSlots } from "../engine/MapConfig";
import { WORLD_SLOTS, WORLD_BOOT_MIN_MS, WAGEN_VERSATZ_X, AREA_IMAGES } from "../engine/gameConstants";

export default function useWorldBoot({ engineRef, layout, preloadCriticalAssets, showLobbyScreen, setIsInitialLoadDone }) {
    const [worldBootState, setWorldBootState] = useState({ active: false, label: "", progress: 0 });
    const worldBootTokenRef = useRef(0);
    const worldBootKindRef = useRef(null); // "single" | "multi" | null — source of truth for boot type
    const worldBootStatusRef = useRef({ preloadDone: false, dataDone: false, minDoneAt: 0 });
    const worldBootFinishTimerRef = useRef(null);

    const tryCompleteWorldBoot = useCallback((token) => {
        if (token !== worldBootTokenRef.current) return;
        const status = worldBootStatusRef.current;
        if (!status.preloadDone || !status.dataDone) return;
        const finish = () => {
            if (token !== worldBootTokenRef.current) return;
            worldBootKindRef.current = null;
            setWorldBootState({ active: false, label: "", progress: 100 });
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        const waitMs = Math.max(0, status.minDoneAt - Date.now());
        if (waitMs > 0) {
            worldBootFinishTimerRef.current = setTimeout(finish, waitMs);
            return;
        }
        finish();
    }, []);

    const markWorldBootDataReady = useCallback((mode) => {
        const token = worldBootTokenRef.current;
        const status = worldBootStatusRef.current;
        if (token <= 0 || worldBootKindRef.current !== mode) return;
        status.dataDone = true;
        setWorldBootState((prev) => prev.active
            ? { ...prev, label: mode === "multi" ? "Deine Farm wird abgeglichen …" : "Deine Farm wird vorbereitet …", progress: Math.max(prev.progress, 82) }
            : prev);
        tryCompleteWorldBoot(token);
    }, [tryCompleteWorldBoot]);

    const updateAreaPositions = useCallback((l) => {
        const a = engineRef.current.areas;
        // Siehe WAGEN_VERSATZ_X: die Werte halten Abstand zu den Grundstücksschildern.
        const y = {
            seedShop: l.centerPathTopY + 92, toolShop: l.centerPathTopY + 92,
            eggShop: l.centerPathBottomY - 140, decoShop: l.centerPathBottomY - 140,
            market: l.centerY, petMarket: l.centerY, questBoard: l.centerY,
        };
        for (const [art, versatz] of Object.entries(WAGEN_VERSATZ_X)) {
            a[art].x = l.centerX + versatz;
            a[art].y = y[art];
            a[art].image = AREA_IMAGES[art];
        }
    }, []);

    const startWorldBoot = useCallback((mode) => {
        const token = worldBootTokenRef.current + 1;
        worldBootTokenRef.current = token;
        worldBootKindRef.current = mode;

        layout.current = generatePlotSlots(WORLD_SLOTS);
        updateAreaPositions(layout.current);

        worldBootStatusRef.current = {
            preloadDone: false,
            dataDone: false,
            minDoneAt: Date.now() + WORLD_BOOT_MIN_MS,
        };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState({
            active: true,
            label: mode === "multi" ? "Verbinde mit der Welt …" : "Lade die Welt …",
            progress: 8,
        });

        preloadCriticalAssets((done, total) => {
            if (token !== worldBootTokenRef.current) return;
            const pct = Math.max(12, Math.min(70, Math.round((done / total) * 70)));
            setWorldBootState((prev) => prev.active
                ? { ...prev, label: "Lade Bilder …", progress: Math.max(prev.progress, pct) }
                : prev);
        }).then(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
                setWorldBootState((prev) => prev.active
                ? { ...prev, label: mode === "multi" ? "Warte auf deine Nachbarn …" : "Lade deine Farm …", progress: Math.max(prev.progress, 76) }
                : prev);
            tryCompleteWorldBoot(token);
        }).catch(() => {
            if (token !== worldBootTokenRef.current) return;
            worldBootStatusRef.current.preloadDone = true;
            tryCompleteWorldBoot(token);
        });
    }, [preloadCriticalAssets, tryCompleteWorldBoot]);

    useEffect(() => {
        if (!showLobbyScreen) return;
        setIsInitialLoadDone(false);
        worldBootTokenRef.current += 1;
        worldBootKindRef.current = null;
        worldBootStatusRef.current = { preloadDone: false, dataDone: false, minDoneAt: 0 };
        if (worldBootFinishTimerRef.current) clearTimeout(worldBootFinishTimerRef.current);
        setWorldBootState((prev) => (prev.active ? { active: false, label: "", progress: 0 } : prev));
    }, [showLobbyScreen]);

    return { worldBootState, startWorldBoot, markWorldBootDataReady };
}
