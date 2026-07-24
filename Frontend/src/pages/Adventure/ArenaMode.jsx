// src/pages/Adventure/ArenaMode.jsx
// PvPvE Arena: Multiplayer-Modus von adVentures. Rendert das Canvas der
// ArenaEngine und legt das HUD (HP, Level/XP, Rangliste, Killfeed) darüber.

import React, { useEffect, useRef, useState } from "react";
import { socket } from "../../utils/socket";
import ArenaEngine from "../../components/Adventure/ArenaEngine";
import { Trophy, LogOut, Skull, Swords } from "lucide-react";

export default function ArenaMode({ skinFile, onExit }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const [hud, setHud] = useState({ self: null, ranking: [], online: 0 });
    const [feed, setFeed] = useState([]);
    const [error, setError] = useState(null);
    const [respawnLeft, setRespawnLeft] = useState(0);

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;
        const canvas = canvasRef.current;
        const container = containerRef.current;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        const engine = new ArenaEngine(canvas, socket, {
            skinFile,
            onHud: (h) => setHud(h),
        });
        engineRef.current = engine;

        const onError = (e) => setError(e?.error || "Verbindung fehlgeschlagen.");
        const onEvent = (ev) => {
            let msg = null;
            if (ev.type === "kill") msg = { text: `${ev.killer} hat ${ev.victim} besiegt`, tone: "kill" };
            else if (ev.type === "levelup") msg = { text: `${ev.name} erreicht Level ${ev.level}`, tone: "level" };
            else if (ev.type === "join") msg = { text: `${ev.name} ist beigetreten`, tone: "info" };
            else if (ev.type === "leave") msg = { text: `${ev.name} hat die Arena verlassen`, tone: "info" };
            if (!msg) return;
            const id = Date.now() + Math.random();
            setFeed((prev) => [...prev.slice(-3), { ...msg, id }]);
            setTimeout(() => setFeed((prev) => prev.filter((f) => f.id !== id)), 5000);
        };
        socket.on("arena:error", onError);
        socket.on("arena:event", onEvent);

        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                engine.resize(entry.contentRect.width, entry.contentRect.height);
            }
        });
        ro.observe(container);

        engine.start();
        return () => {
            ro.disconnect();
            socket.off("arena:error", onError);
            socket.off("arena:event", onEvent);
            engine.stop();
        };
    }, [skinFile]);

    // Respawn-Countdown
    useEffect(() => {
        if (!hud.self?.dead) { setRespawnLeft(0); return; }
        const t = setInterval(() => {
            setRespawnLeft(Math.max(0, Math.ceil(((hud.self?.respawnAt || 0) - Date.now()) / 1000)));
        }, 200);
        return () => clearInterval(t);
    }, [hud.self?.dead, hud.self?.respawnAt]);

    const xpPercent = hud.self ? Math.min(100, (hud.self.xp / Math.max(1, hud.self.xpNext)) * 100) : 0;

    return (
        <div ref={containerRef} className="absolute inset-0 bg-black overflow-hidden">
            <canvas ref={canvasRef} className="block w-full h-full" />

            {/* Fehler (z. B. Arena voll / nicht eingeloggt) */}
            {error && (
                <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
                    <div className="panel-strong p-8 max-w-sm w-full flex flex-col items-center gap-4 text-center">
                        <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400">
                            <Skull size={22} />
                        </span>
                        <p className="text-white/70 text-sm">{error}</p>
                        <button onClick={onExit} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-2xl transition-colors">
                            Zurück zum Menü
                        </button>
                    </div>
                </div>
            )}

            {/* HUD oben links: HP + Online */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
                {hud.self && (
                    <div className="relative w-60 h-7 bg-black/60 border border-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${(Math.max(0, hud.self.hp) / hud.self.maxHp) * 100}%` }} />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/90">
                            {Math.max(0, Math.floor(hud.self.hp))} / {hud.self.maxHp} HP
                        </div>
                    </div>
                )}
                <div className="text-xs text-white/50 font-semibold bg-black/50 border border-white/10 rounded-lg px-2.5 py-1 w-fit flex items-center gap-1.5">
                    <Swords size={12} /> {hud.online} Spieler online
                </div>
            </div>

            {/* Verlassen-Button oben rechts */}
            <button
                onClick={onExit}
                className="absolute top-4 right-4 z-30 bg-black/60 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
                <LogOut size={15} /> Verlassen
            </button>

            {/* Rangliste rechts */}
            <div className="absolute top-16 right-4 z-20 w-52 bg-black/55 border border-white/10 rounded-2xl p-3 pointer-events-none">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">
                    <Trophy size={11} className="text-amber-400" /> Arena-Rangliste
                </div>
                {hud.ranking.map((r, i) => (
                    <div key={i} className={`flex justify-between items-center text-xs py-1 ${r.isSelf ? "text-violet-300 font-bold" : "text-white/70"}`}>
                        <span className="truncate">#{i + 1} {r.name}</span>
                        <span className="font-mono shrink-0 ml-2">Lv {r.level}</span>
                    </div>
                ))}
            </div>

            {/* Killfeed links */}
            <div className="absolute top-24 left-4 z-20 flex flex-col gap-1.5 pointer-events-none">
                {feed.map((f) => (
                    <div key={f.id} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border backdrop-blur-sm ${
                        f.tone === "kill" ? "bg-red-500/10 border-red-400/25 text-red-200"
                        : f.tone === "level" ? "bg-violet-500/10 border-violet-400/25 text-violet-200"
                        : "bg-white/5 border-white/10 text-white/50"
                    }`}>
                        {f.text}
                    </div>
                ))}
            </div>

            {/* Level + XP unten */}
            {hud.self && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(480px,80vw)] pointer-events-none">
                    <div className="flex justify-between items-end mb-1 px-1">
                        <span className="font-display text-lg font-bold text-white drop-shadow">Level {hud.self.level}</span>
                        <span className="text-[11px] text-white/50 font-mono">{Math.floor(hud.self.xp)} / {hud.self.xpNext} XP</span>
                    </div>
                    <div className="h-3 bg-black/60 border border-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${xpPercent}%` }} />
                    </div>
                </div>
            )}

            {/* Death Overlay */}
            {hud.self?.dead && !error && (
                <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                    <div className="panel-strong p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full">
                        <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400">
                            <Skull size={22} />
                        </span>
                        <h3 className="font-display text-2xl font-bold text-white">Besiegt</h3>
                        <p className="text-sm text-white/45">Du verlierst einen Teil deiner Level.<br />Respawn in <span className="text-white font-bold">{respawnLeft}s</span></p>
                    </div>
                </div>
            )}
        </div>
    );
}
