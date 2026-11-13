// MenuWelt.jsx — Hintergrund des Hauptmenüs (05.11.): die echte Spielwelt, live gezeichnet.
// Eine Katze spaziert langsam über den Rundweg um den Dorfteich, die Kamera folgt ihr — mit
// Ständen, Fischen, Wald, Tages- und Jahreszeit genau wie im Spiel. Gezeichnet vom normalen
// 2D-Renderer (engine/Renderer.js), deshalb ohne eigene Bilder und immer im aktuellen Look.
import React, { useEffect, useRef } from "react";
import Renderer from "../../engine/Renderer";
import { generatePlotSlots, TILE_SIZE } from "../../engine/MapConfig";
import { WORLD_SLOTS, stelleStaendeAuf } from "../../engine/gameConstants";
import { dunkelheit, saisonStand } from "../../engine/Tageszeit";

/** Rundweg-Runde der Katze: so viele Sekunden für einmal um den Teich. */
const RUNDE_S = 140;
const ZOOM = 0.55;

export default function MenuWelt() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        let renderer;
        try {
            renderer = new Renderer(canvas);
        } catch {
            return undefined; // ohne Zeichenfläche bleibt der dunkle Hintergrund
        }
        const layout = generatePlotSlots(WORLD_SLOTS);
        const areas = {
            seedShop: { type: "seed", label: "Samen-Shop" }, toolShop: { type: "tool", label: "Tool-Shop" },
            eggShop: { type: "egg", label: "Eier-Shop" }, decoShop: { type: "deco", label: "Deko-Shop" },
            market: { type: "market", label: "Markt" }, petMarket: { type: "petMarket", label: "Tier-Verkauf" },
            questBoard: { type: "questBoard", label: "Missionen" }, goldShop: { type: "goldShop", label: "Gold-Shop" },
            haendler: { type: "haendler", label: "Händler" }, erntefest: { type: "erntefest", label: "Erntefest" },
        };
        stelleStaendeAuf(areas, layout);
        const rw = layout.rundweg;
        const katze = { x: 0, y: 0, tileX: 0, tileY: 0, facingRight: true, isMoving: true, hopBob: 0 };
        const zustand = {
            layout, areas, zoom: ZOOM, petPlacements: [], decoPlacements: [], remotePlayers: null,
            weather: { type: "sun" }, localPlayerName: "", playerAppearance: {},
        };
        const start = performance.now();
        let bild = 0;
        const groesse = () => {
            const w = canvas.clientWidth, h = canvas.clientHeight;
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        };
        const schritt = (jetzt) => {
            // Unsichtbar (0 × 0, z. B. unter einem Hinweisfenster): nichts zeichnen — der
            // Renderer legt seine Nacht-Ebene in Leinwandgröße an, 0 Pixel wären ein Fehler.
            if (!canvas.clientWidth || !canvas.clientHeight) {
                bild = requestAnimationFrame(schritt);
                return;
            }
            groesse();
            // Ellipse etwas innerhalb des Rundwegs, gegen den Uhrzeigersinn
            const t = ((jetzt - start) / 1000) / RUNDE_S * Math.PI * 2;
            const rx = (rw.rx - 1.6) * TILE_SIZE, ry = (rw.ry - 1.6) * TILE_SIZE;
            const nx = rw.cx * TILE_SIZE + Math.cos(t) * rx;
            const ny = rw.cy * TILE_SIZE + Math.sin(t) * ry;
            katze.facingRight = nx >= katze.x;
            katze.x = nx; katze.y = ny;
            // Gemütlicher Schritt (06.11.): eigene Phase nach der Uhr, sonst nimmt der
            // Renderer den Bildzähler — und der lief hier viel zu schnell (Wackeln).
            katze.laufPhase = ((jetzt - start) / 1000) * 2.6 * Math.PI;
            katze.hopBob = Math.abs(Math.sin(katze.laufPhase)) * 3;
            const jetztMs = Date.now();
            zustand.nacht = dunkelheit(jetztMs);
            zustand.saison = saisonStand(jetztMs).id;
            renderer.draw(zustand, katze);
            bild = requestAnimationFrame(schritt);
        };
        bild = requestAnimationFrame(schritt);
        return () => {
            cancelAnimationFrame(bild);
            try { renderer.destroy(); } catch { /* egal */ }
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
