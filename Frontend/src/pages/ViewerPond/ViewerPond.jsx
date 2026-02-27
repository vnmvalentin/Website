import React, { useEffect, useState, useRef, useMemo } from "react";
import { WifiOff } from "lucide-react";
import io from "socket.io-client";

// --- KONSTANTEN & HELPER ---

const COLOR_CLASSES = {
    default: "text-white",
    blue: "text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]",
    purple: "text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]",
    gold: "text-yellow-300 drop-shadow-[0_0_8px_rgba(234,179,8,1)] font-black",
    rainbow: "animate-text-rainbow bg-gradient-to-r from-red-500 via-green-500 to-blue-500 text-transparent bg-clip-text font-black"
};

const FISH_DEFS = {
  goldfish: { img: "/assets/viewerpond/goldfish/goldfish.png", name: "Goldfisch" },
  clownfish: { img: "/assets/viewerpond/clownfish/clownfish.png", name: "Nemo" },
  stripedfish: { img: "/assets/viewerpond/stripedfish/stripedfish.png", name: "Gill" },
  puffer: { img: "/assets/viewerpond/puffer/puffer.png", name: "Kugelfisch" },
  seahorse: { img: "/assets/viewerpond/seahorse/seahorse.png", name: "Seepferdchen" },
  jellyfish: { img: "/assets/viewerpond/jellyfish/jellyfish.png", name: "Qualle" },
  turtle: { img: "/assets/viewerpond/turtle/turtle.png", name: "Schildkröte" },
  octopus: { img: "/assets/viewerpond/octopus/octopus.png", name: "Oktopus" },
  sharky: { img: "/assets/viewerpond/babyshark/babyshark.png", name: "Baby Hai" },
  dolphin: { img: "/assets/viewerpond/dolphin/dolphin.png", name: "Delphin" },
  whale: { img: "/assets/viewerpond/whale/whale.png", name: "Wal" },
  starfish: { img: "/assets/viewerpond/starfish/starfish.png", name: "Seestern" },
  seal: { img: "/assets/viewerpond/seal/seal.png", name: "Seehund" },
  hammershark: { img: "/assets/viewerpond/hammershark/hammershark.png", name: "Hammerhai" },
  rainbow: { img: "/assets/viewerpond/rainbow/rainbow.png", name: "Regenbogenfisch" },
  schleier: { img: "/assets/viewerpond/schleier/schleier.png", name: "Schleierfisch" },
  crab: { img: "/assets/viewerpond/crab/crab.png", name: "Krabbe" },
  eel: { img: "/assets/viewerpond/eel/eel.png", name: "Aal" },
  ray: { img: "/assets/viewerpond/ray/ray.png", name: "Rochen" },
  orca: { img: "/assets/viewerpond/orca/orca.png", name: "Orca" },
  modente: { img: "/assets/viewerpond/exclusive/modente.png", name: "Mod-Ente" },
};

const DECO_ASSETS = {
    "seaweed_1": "/assets/viewerpond/decorations/seaweed_tall.png",
    "seaweed_2": "/assets/viewerpond/decorations/seaweed_bush.png" ,
    "rock_1": "/assets/viewerpond/decorations/rock1.png",
    "rock_2": "/assets/viewerpond/decorations/rock2.png",
    "ship": "/assets/viewerpond/decorations/shipwreck.png",
};

const IS_DEV = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const API_BASE = IS_DEV ? "http://localhost:5173" : ""; 

const getSafeTargetY = (isTop) => {
    if (isTop) {
        return Math.random() * 45 + 10; 
    } else {
        return Math.random() * 40 + 25; 
    }
};

function hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(6,182,212,${alpha})`;
    let c = hex.substring(1).split('');
    if(c.length === 3){ c = [c[0], c[0], c[1], c[1], c[2], c[2]]; }
    c = '0x' + c.join('');
    return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
}

function seededRandom(seed) {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function stringToHash(string) {
    let hash = 0;
    if (string.length === 0) return hash;
    for (let i = 0; i < string.length; i++) {
        const char = string.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
    }
    return Math.abs(hash);
}

const Preloader = () => <div className="hidden"><img src="/assets/viewerpond/shark/shark_attack.png" alt=""/><img src="/assets/viewerpond/shark/shark_normal.png" alt=""/></div>;

const BloodCloud = ({ x, y, scale = 1 }) => (
    <div className="absolute z-40 pointer-events-none animate-blood-dissolve" 
         style={{ left: `${x}%`, top: `${y}%`, width: `${80 * scale}px`, height: `${80 * scale}px`, transform: 'translate(-50%, -50%)', background: 'radial-gradient(circle, rgba(220,20,60,0.9) 0%, rgba(139,0,0,0.6) 50%, transparent 80%)', borderRadius: '50%' }} 
    />
);

const WaterTexture = ({ isTop }) => (
    <div className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay opacity-60">
        <div className="absolute inset-0" style={{ background: isTop ? `linear-gradient(to top, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0.1) 100%)` : `linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0.1) 100%)` }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% -20%, rgba(255,255,255,0.4), transparent 60%)' }} />
    </div>
);

const Bubbles = ({ scale = 1 }) => (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-100">
        <div className="absolute bottom-0 left-[10%] bg-white/40 shadow-[0_0_2px_rgba(255,255,255,0.8)] rounded-full animate-bubble-1" style={{ width: 4*scale, height: 4*scale }} />
        <div className="absolute bottom-0 left-[35%] bg-white/30 shadow-[0_0_2px_rgba(255,255,255,0.8)] rounded-full animate-bubble-3" style={{ width: 6*scale, height: 6*scale }} />
        <div className="absolute bottom-0 left-[65%] bg-white/30 shadow-[0_0_2px_rgba(255,255,255,0.8)] rounded-full animate-bubble-2" style={{ width: 4*scale, height: 4*scale, animationDelay: '0.1s' }} />
        <div className="absolute bottom-0 left-[90%] bg-white/40 shadow-[0_0_2px_rgba(255,255,255,0.8)] rounded-full animate-bubble-1" style={{ width: 5*scale, height: 5*scale, animationDelay: '0.1s' }} />
    </div>
);

const Decorations = ({ activeDecos, scale, layoutSeed = 12345, isTop }) => {
    const sceneObjects = useMemo(() => {
        if (!activeDecos || activeDecos.length === 0) return [];
        const objects = [];
        if (activeDecos.includes("ship")) {
            const stableSeed = layoutSeed + 999;
            const pos = 40 + (seededRandom(stableSeed) * 20); 
            const size = 90 * scale
            objects.push({ id: "ship", src: DECO_ASSETS.ship, left: pos, size: size, z: 2 });
        }
        const commons = activeDecos.filter(d => !["ship"].includes(d));
        commons.forEach(decoId => {
            const idHash = stringToHash(decoId);
            for(let i=0; i<3; i++) {
                let currentSeed = layoutSeed + idHash + (i * 100);
                const pos = seededRandom(currentSeed++) * 90 + 5;
                const sizeBase = decoId.includes("seaweed") ? 70 : 50;
                const size = sizeBase * (0.6 + (seededRandom(currentSeed++) * 0.2)); 
                objects.push({ id: `${decoId}_${i}`, src: DECO_ASSETS[decoId], left: pos, size: size, z: i % 2 === 0 ? 1 : 4 });
            }
        });
        return objects.sort((a,b) => a.z - b.z);
    }, [activeDecos, layoutSeed, scale]);

    return (
        <div className="absolute w-full pointer-events-none z-0 overflow-hidden" style={{ [isTop ? 'top' : 'bottom']: 0, height: 'calc(100% + 20px)' }}>
            {sceneObjects.map((obj, i) => (
                <img key={obj.id} src={obj.src} alt="decoration" className="absolute object-contain drop-shadow-lg transition-all duration-1000"
                    style={{ left: `${obj.left}%`, [isTop ? 'top' : 'bottom']: 0, height: `${obj.size * scale}px`, width: 'auto', transform: isTop ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)', opacity: 0.85, filter: 'blur(3px)', zIndex: obj.z }}
                />
            ))}
        </div>
    );
};

const FishEntity = ({ fish, pondPosition, scale, isHypetrain }) => {
  const skinDef = FISH_DEFS[fish.skin] || FISH_DEFS.goldfish;
  const scaleX = fish.direction === 'right' ? -1 : 1;
  const isTop = pondPosition === 'top';
  const w = fish.size * scale;
  const h = (fish.size / 1.5) * scale;
  const imgAnimationClass = isHypetrain ? 'animate-[fish-party_0.8s_linear_infinite]' : '';

  // FARBE ERMITTELN
  const colorClass = COLOR_CLASSES[fish.color] || COLOR_CLASSES.default;

  return (
      <div className="absolute pointer-events-none" 
           style={{ 
               left: `${fish.x}%`, top: `${fish.y}%`, width: `${w}px`, height: `${h}px`, 
               transform: `translate(-50%, -50%) scaleX(${scaleX})`, 
               transition: fish.isDropping ? "top 1s ease-in" : "left 0.5s linear, top 0.5s linear, width 0.3s ease, opacity 0.2s", 
               opacity: fish.isDead ? 0 : 1, 
               zIndex: 20 
           }}>
          
          {fish.message && (
              <div className={`absolute left-1/2 -translate-x-1/2 bg-white text-black rounded-xl px-3 py-1.5 z-50 animate-in zoom-in slide-in-from-bottom-2 duration-300 shadow-lg border-2 border-black/10 ${isTop ? "top-full mt-4" : "bottom-full mb-4"}`} style={{ transform: `scaleX(${scaleX})`, minWidth: '60px', textAlign: 'center' }}>
                  <p className="text-xs font-bold leading-tight whitespace-pre-wrap max-w-[150px]">{fish.message}</p>
                  <div className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 ${isTop ? "-top-1 border-l-2 border-t-2 border-black/10" : "-bottom-1 border-r-2 border-b-2 border-black/10"}`} />
              </div>
          )}
          {/* NAMENS-TAG: JETZT MIT FARBE! */}
          <div 
            className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm ${isTop ? "top-full mt-1" : "bottom-full mb-2"} ${colorClass}`} 
            style={{ transform: `scaleX(${scaleX})`, fontSize: `12px` }}
          >
              {fish.username}
          </div>

          <img src={skinDef.img} alt={fish.skin} className={`w-full h-full object-contain drop-shadow-xl transition-transform ${imgAnimationClass}`}/>
      </div>
  );
};

const SharkEntity = ({ yPos, targetX, targetFish, onBite, onComplete, scale }) => {
    const startFromLeft = useRef(Math.random() > 0.5).current;
    const [phase, setPhase] = useState('spawn');
    
    const START_X = startFromLeft ? -30 : 130;
    const TARGET_X = startFromLeft ? targetX - 1 : targetX + 1.5;
    const END_X = startFromLeft ? 130 : -30; 

    useEffect(() => { requestAnimationFrame(() => setPhase('attack-move')); }, []);
    
    // FIX: Hier dürfen NUR [phase] rein, sonst bricht der Game-Loop (50ms) 
    // den Timer immer wieder ab und der Hai friert ein!
    useEffect(() => {
        if (phase === 'attack-move') { const t = setTimeout(() => { onBite(targetFish); setPhase('leave-move'); }, 1500); return () => clearTimeout(t); }
        if (phase === 'leave-move') { const t = setTimeout(() => { onComplete(targetFish); }, 1500); return () => clearTimeout(t); }
    }, [phase]);

    const sharkImg = (phase === 'spawn' || phase === 'attack-move') ? "/assets/viewerpond/shark/shark_attack.png" : "/assets/viewerpond/shark/shark_normal.png";
    let currentLeft = START_X; let transition = "none";
    if (phase === 'attack-move') { currentLeft = TARGET_X; transition = "left 1.5s ease-out"; } 
    else if (phase === 'leave-move') { currentLeft = END_X; transition = "left 1.5s ease-in"; }
    const facing = startFromLeft ? "scaleX(-1)" : "scaleX(1)";

    return (
        <div className="absolute z-50 pointer-events-none" style={{ left: `${currentLeft}%`, top: `${yPos}%`, width: `${110 * scale}px`, marginTop: `${-25 * scale}px`, transform: `translateX(${startFromLeft ? '20%' : '-20%'}) ${facing}`, transition: transition, zIndex: 50 }}>
            <img src={sharkImg} className="w-full h-auto object-contain drop-shadow-2xl" alt="Shark" />
        </div>
    );
};

const SwarmLayer = ({ active }) => {
    if (!active) return null;
    const swarmFish = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({ 
        id: i, 
        top: 10 + Math.random() * 60, 
        delay: Math.random() * 2, 
        speed: 3 + Math.random() * 2, 
        size: 15 + Math.random() * 20 
    })), []);
    
    return (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {swarmFish.map(f => (
                <img key={f.id} src="/assets/viewerpond/goldfish/goldfish.png" alt="" className="absolute" 
                style={{ 
                    left: '-20%', 
                    top: `${f.top}%`, 
                    width: `${f.size}px`, 
                    transform: 'scaleX(-1)', 
                    animation: `swarm-pass ${f.speed}s linear forwards`, 
                    animationDelay: `${f.delay}s`, 
                    filter: 'brightness(0) drop-shadow(0 0 2px rgba(255,255,255,0.3))', 
                    opacity: 0.7 
                }} />
            ))}
        </div>
    );
};

export default function ViewerPond() {
    // KEIN useParams() MEHR! 
    const [fishes, setFishes] = useState([]);
    const [sharkAttacks, setSharkAttacks] = useState([]);
    const [bloodEffects, setBloodEffects] = useState([]); 
    const [wsConnected, setWsConnected] = useState(false); 
    const [config, setConfig] = useState({ 
        waterSettings: { height: 15, opacity: 0.5, color: "#06b6d4", sharkEnabled: true, showBubbles: true, showDecorations: true, activeDecorations: [], layoutSeed: 12345, waveIntensity: 1, position: "bottom", fishScale: 1.0, decoScale: 1.0 }, 
        eventSettings: { hypeTrain: true, raid: true },
        excludedUsers: [] 
    });
    
    const [currentVersion, setCurrentVersion] = useState(0);
    const [hideMe, setHideMe] = useState(false); 
    const timeoutsRef = useRef({});
    const [isHypetrain, setIsHypetrain] = useState(false);
    const [isRaid, setIsRaid] = useState(false);
    const [effects, setEffects] = useState([]);
    
    const ws = useRef(null); 
    const backendSocket = useRef(null); 
    const fishesRef = useRef([]); 
    const knownSkinsRef = useRef({}); 
    const configRef = useRef(config);

    useEffect(() => { configRef.current = config; }, [config]);

    // EINFACHES CONFIG LADEN (Global)
    const loadConfig = () => { 
        fetch(`${API_BASE}/api/pond/config`)
        .then(res => res.json())
        .then(data => { 
            const excludedArr = Array.isArray(data.excludedUsers) ? data.excludedUsers : (data.excludedUsers || "").split(",").map(s => s.trim().toLowerCase()).filter(s => s.length > 0); 
            setConfig({ 
                waterSettings: { ...config.waterSettings, ...(data.waterSettings || {}) }, 
                eventSettings: { ...config.eventSettings, ...(data.eventSettings || {}) }, 
                excludedUsers: [...new Set(excludedArr)] 
            }); 
            if(data.version) setCurrentVersion(data.version); 
        }).catch(e => console.error("Config Load Error", e)); 
    };
    
    // SOCKET.IO FÜR SKIN UPDATES IN ECHTZEIT (Statisch "pond_main")
    useEffect(() => {
        const s = io(window.location.origin, { path: "/socket.io" });
        backendSocket.current = s;
        
        s.on('connect', () => { s.emit('join_room', "pond_main"); });

        // UPDATE: Empfängt jetzt auch Color
        s.on('pond_skin_update', ({ userId, skinId, colorId }) => {
            console.log("🎨 Update:", userId, skinId, colorId);
            
            // Speichere beides in knownSkinsRef
            if (!knownSkinsRef.current[userId]) knownSkinsRef.current[userId] = {};
            knownSkinsRef.current[userId].skin = skinId;
            knownSkinsRef.current[userId].color = colorId;

            const existingFish = fishesRef.current.find(f => f.id === userId);
            if (existingFish) {
                if (skinId) existingFish.skin = skinId;
                if (colorId) existingFish.color = colorId;
                setFishes([...fishesRef.current]);
            }
        });
        return () => { s.disconnect(); };
    }, []);

    useEffect(() => { loadConfig(); }, []);
    
    // POLLING FÜR CONFIG UPDATES
    useEffect(() => { 
        const interval = setInterval(() => { 
            fetch(`${API_BASE}/api/pond/config/version`)
            .then(r => r.json())
            .then(d => { if (d.version && d.version > currentVersion) loadConfig(); })
            .catch(() => {}); 
        }, 3000); 
        return () => clearInterval(interval); 
    }, [currentVersion]);

    // ALLE SKINS LADEN (Für alle User)
    const fetchAllSkins = async () => {
        try { 
            const res = await fetch(`${API_BASE}/api/pond/all-users`); 
            const data = await res.json(); 
            knownSkinsRef.current = data; 
        } catch(e) {}
    };

    const handleActiveViewersResponse = async (viewers) => {
        const currentConfig = configRef.current;
        const now = Date.now();
        const isDockedTop = currentConfig.waterSettings.position === "top";

        const cleanList = viewers.map(u => ({ id: u.id || u.userId, username: u.display_name || u.name || u.login || "Unknown", subscribed: u.subscribed === true, role: u.role || "Viewer" })).filter(u => {
            const name = u.username.toLowerCase();
            if (currentConfig.excludedUsers.includes(name)) return false;
            if (hideMe && name === "vnmvalentin") return false; 
            const timeoutUntil = timeoutsRef.current[name];
            if (timeoutUntil && now < timeoutUntil) return false; 
            return true;
        });

        // Skins für alle updaten
        await fetchAllSkins();
        const activeNames = new Set(cleanList.map(u => u.username));

        cleanList.forEach(u => {
            // Jeder bekommt den Fisch, den er gewählt hat. Standard ist Goldfisch.
            const userData = knownSkinsRef.current[u.id] || {};
            const finalSkin = userData.skin || "goldfish";
            const finalColor = userData.color || "default";

            const existing = fishesRef.current.find(f => f.username === u.username);
            if (existing) {
                existing.isDead = false; existing.isLeaving = false;
                if (existing.skin !== finalSkin) existing.skin = finalSkin;
                if (existing.color !== finalColor) existing.color = finalColor; // Farbe updaten
            } else {
                const startX = Math.random() * 90; const startTargetX = Math.random() * 90;
                const safeTargetY = getSafeTargetY(isDockedTop);

                fishesRef.current.push({
                    id: u.id, username: u.username, skin: finalSkin, color: finalColor, x: startX, y: -20, 
                    targetX: startTargetX, targetY: safeTargetY,
                    size: 50, direction: startTargetX > startX ? 'right' : 'left', speed: 0.15 + Math.random() * 0.2, isDropping: true, isDead: false,
                    isMovingToEvent: false
                });
                setTimeout(() => {
                    const f = fishesRef.current.find(x => x.username === u.username);
                    if(f) { f.isDropping = false; f.y = safeTargetY; }
                }, 1000);
            }
        });

        fishesRef.current.forEach(fish => {
            if (!activeNames.has(fish.username) && !fish.isLeaving && !fish.isDead) {
                fish.isLeaving = true;
                if (currentConfig.waterSettings.sharkEnabled) { setSharkAttacks(prev => [...prev, { id: Date.now() + Math.random(), y: fish.y, targetFish: fish.username, targetX: fish.x }]); } 
                else { fish.isDead = true; setTimeout(() => { fishesRef.current = fishesRef.current.filter(f => f.username !== fish.username); setFishes([...fishesRef.current]); }, 500); }
            }
        });
        setFishes([...fishesRef.current]);
    };

    const isBusy = (f) => f.isRacing || f.isKissing || f.isMovingToEvent || f.isFrozen || f.isDead;

    const triggerManualShark = (targetUsername) => {
        const fish = fishesRef.current.find(f => f.username.toLowerCase() === targetUsername.toLowerCase());
        if (fish && !isBusy(fish)) {
            fish.isFrozen = true;
            setSharkAttacks(prev => [...prev, { id: Date.now(), y: fish.y, targetFish: fish.username, targetX: fish.x }]);
        }
    };

    const triggerFishSay = (username, message) => {
        const fish = fishesRef.current.find(f => f.username.toLowerCase() === username.toLowerCase());
        if (fish) {
            fish.message = message; setFishes([...fishesRef.current]);
            setTimeout(() => { const f = fishesRef.current.find(fi => fi.username === fish.username); if (f) { f.message = null; setFishes([...fishesRef.current]); } }, 6000);
        }
    };

    // --- WEBSOCKET ZU DEINEM STREAMER.BOT ---
    useEffect(() => {
        let socket;
        let pollInterval;
        let reconnectTimeout;

        const connect = () => {
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

            console.log("🔄 Versuche Verbindung zu Streamer.bot...");
            socket = new WebSocket("ws://127.0.0.1:8080/");
            ws.current = socket;

            socket.onopen = () => {
                console.log("🔌 WS Connected to Streamer.bot");
                setWsConnected(true);
                
                socket.send(JSON.stringify({ request: "Subscribe", id: "pond-sub", events: { "General": ["Custom"] } }));
                
                const trigger = () => { 
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ request: "GetActiveViewers", id: "pond-poll" })); 
                    }
                };
                trigger();
                pollInterval = setInterval(trigger, 5000);
            };

            socket.onclose = () => {
                console.log("🔌 WS Disconnected - Versuche Reconnect in 3s...");
                setWsConnected(false);
                if (pollInterval) clearInterval(pollInterval);
                reconnectTimeout = setTimeout(connect, 3000);
            };

            socket.onerror = (err) => { socket.close(); };

            socket.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data);
                    if (d.id === "pond-poll" && d.viewers) { handleActiveViewersResponse(d.viewers); }
                    if (d.event && d.event.type === "PondReload") { loadConfig(); }
                    if (d.data && d.event && d.event.source === "General" && d.event.type === "Custom") {
                        let payload = d.data;
                        if (payload.data && typeof payload.data === 'string') { try { payload = JSON.parse(payload.data); } catch (err) { return; } }
                        
                        // KEIN Broadcaster-Check mehr nötig, es ist dein eigener Bot!
                        const action = payload.action;
                        if (action === "shark_attack") triggerManualShark(payload.target);
                        if (action === "fish_say") triggerFishSay(payload.user, payload.message);
                        if (action === "hypetrain_start" && configRef.current.eventSettings.hypeTrain) setIsHypetrain(true);
                        if (action === "hypetrain_end") setIsHypetrain(false);
                        if (action === "raid_swarm" && configRef.current.eventSettings.raid) { setIsRaid(true); setTimeout(() => setIsRaid(false), 8000); }
                        if (action === "kiss") triggerKiss(payload.source, payload.target);
                        if (action === "race") triggerRace(payload.source, payload.target);
                    }
                } catch (err) { console.error("WS Message Error", err); }
            };
        };

        connect();

        return () => {
            if (pollInterval) clearInterval(pollInterval);
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (socket) socket.close();
        };
    }, []);
    
    // --- MAIN GAME LOOP ---
    useEffect(() => { 
        const loop = setInterval(() => { 
            const currentSettings = configRef.current?.waterSettings || {};
            const isDockedTop = currentSettings.position === "top";
            
            const hPercent = currentSettings.height || 15;
            const baseScale = Math.min(1.5, Math.max(0.2, hPercent / 6));
            const userFishScale = currentSettings.fishScale || 1.0;
            const totalScale = baseScale * userFishScale;

            const safetyMargin = 12 * totalScale;

            fishesRef.current.forEach(f => { 
                if (isNaN(f.x) || isNaN(f.y)) { f.x = 50; f.y = 50; }

                if (f.isDropping || f.isLeaving || f.isDead || f.isFrozen || f.isRacing) {
                    f.stuckCounter = 0; 
                    return; 
                }
                
                const moveDelta = Math.abs(f.x - (f.lastX || f.x)) + Math.abs(f.y - (f.lastY || f.y));
                f.lastX = f.x;
                f.lastY = f.y;

                if (moveDelta < 0.05 && !f.isMovingToEvent) {
                    f.stuckCounter = (f.stuckCounter || 0) + 1;
                } else {
                    f.stuckCounter = 0;
                }

                if (f.stuckCounter > 60) {
                    f.targetX = Math.random() * 90;
                    f.targetY = getSafeTargetY(isDockedTop);
                    f.stuckCounter = 0;
                    f.x += (Math.random() > 0.5 ? 1 : -1);
                }

                const dx = f.targetX - f.x, dy = f.targetY - f.y, dist = Math.sqrt(dx*dx + dy*dy); 
                
                if (dist < 4) { 
                    if (f.isMovingToEvent) {
                        f.x = f.targetX; 
                        f.y = f.targetY;
                        return; 
                    }

                    f.targetX = Math.random() * 90; 
                    f.targetY = getSafeTargetY(isDockedTop);
                    f.direction = f.targetX > f.x ? 'right' : 'left'; 
                } else { 
                    const moveSpeed = f.isMovingToEvent ? 2.0 : f.speed;
                    f.x += (dx/dist)*moveSpeed; 
                    f.y += (dy/dist)*moveSpeed; 
                }
                
                if (isDockedTop) { 
                    f.y = Math.max(safetyMargin, Math.min(60, f.y)); 
                } else { 
                    f.y = Math.max(20, Math.min(100 - safetyMargin, f.y)); 
                }
                
                f.x = Math.max(2, Math.min(98, f.x));
            }); 
            setFishes([...fishesRef.current]); 
        }, 50); 
        return () => clearInterval(loop); 
    }, []);

    const waitForArrival = (fishList, callback) => {
        let checkInterval = null;
        let fallbackTimeout = null;
        let hasTriggered = false;

        const finish = () => {
            if (hasTriggered) return;
            hasTriggered = true;
            if (checkInterval) clearInterval(checkInterval);
            if (fallbackTimeout) clearTimeout(fallbackTimeout);
            callback();
        };

        checkInterval = setInterval(() => {
            const allArrived = fishList.every(f => {
                const dx = f.targetX - f.x;
                const dy = f.targetY - f.y;
                return Math.sqrt(dx*dx + dy*dy) < 5; 
            });

            if (allArrived) finish();
        }, 100);
        
        fallbackTimeout = setTimeout(finish, 15000);
    };

    const triggerKiss = (userA, userB) => {
        let fishA = fishesRef.current.find(f => f.username.toLowerCase() === userA.toLowerCase());
        let fishB = fishesRef.current.find(f => f.username.toLowerCase() === userB.toLowerCase());

        if (fishA && fishB && !isBusy(fishA) && !isBusy(fishB)) {
            const [leftFish, rightFish] = (fishA.x < fishB.x) ? [fishA, fishB] : [fishB, fishA];

            leftFish.isMovingToEvent = true; 
            rightFish.isMovingToEvent = true;

            const midX = (leftFish.x + rightFish.x) / 2;
            const midY = (leftFish.y + rightFish.y) / 2;
            
            const KISS_OFFSET = 1.2; 

            const targetX_Left = midX - KISS_OFFSET;
            const targetX_Right = midX + KISS_OFFSET;

            leftFish.targetX = targetX_Left; leftFish.targetY = midY;
            rightFish.targetX = targetX_Right; rightFish.targetY = midY;
            
            leftFish.direction = 'right'; 
            rightFish.direction = 'left';

            waitForArrival([leftFish, rightFish], () => {
                leftFish.x = targetX_Left; leftFish.y = midY;
                rightFish.x = targetX_Right; rightFish.y = midY;

                leftFish.isFrozen = true; rightFish.isFrozen = true;
                setFishes([...fishesRef.current]); 

                setTimeout(() => {
                    leftFish.isKissing = true; rightFish.isKissing = true;
                    setFishes([...fishesRef.current]); 

                    const effectId = Date.now();
                    setEffects(prev => [...prev, { id: effectId, type: 'heart', x: midX, y: midY - 15 }]);
                    setTimeout(() => setEffects(prev => prev.filter(e => e.id !== effectId)), 2000);

                    setTimeout(() => {
                        const currentSettings = configRef.current?.waterSettings || {};
                        const isDockedTop = currentSettings.position === "top";

                        [leftFish, rightFish].forEach(f => {
                            f.isFrozen = false;
                            f.isKissing = false;
                            f.isMovingToEvent = false; 
                            
                            f.targetX = Math.random() * 90;
                            f.targetY = getSafeTargetY(isDockedTop);
                            f.direction = f.targetX > f.x ? 'right' : 'left';
                        });
                    }, 2000);
                }, 500);
            });
        }
    };

    const triggerRace = (userA, userB) => {
        const fishA = fishesRef.current.find(f => f.username.toLowerCase() === userA.toLowerCase());
        const fishB = fishesRef.current.find(f => f.username.toLowerCase() === userB.toLowerCase());
        const currentSettings = configRef.current?.waterSettings || {};
        const isDockedTop = currentSettings.position === "top";
        
        const startX = 5;
        const raceY = isDockedTop ? 20 + Math.random() * 30 : 50 + Math.random() * 30;

        if (fishA && fishB && !isBusy(fishA) && !isBusy(fishB)) {
            [fishA, fishB].forEach(f => {
                f.isMovingToEvent = true; 
                f.targetX = startX;
                f.targetY = raceY;
                f.direction = 'left';
            });
            setFishes([...fishesRef.current]);

            waitForArrival([fishA, fishB], () => {
                [fishA, fishB].forEach(f => {
                    f.isFrozen = true; 
                    f.direction = 'right'; 
                    f.x = startX; f.y = raceY; 
                });
                setFishes([...fishesRef.current]);
                
                setTimeout(() => {
                    [fishA, fishB].forEach(f => {
                        f.isFrozen = false;
                        f.isMovingToEvent = false; 
                        f.isRacing = true; 
                        f.raceSpeed = 0.05; 
                    });

                    const raceInterval = setInterval(() => {
                        let finished = false;
                        [fishA, fishB].forEach(f => {
                            const luck = Math.random();
                            
                            if (luck > 0.85) { 
                                f.raceSpeed += 0.05 + Math.random() * 0.05; 
                            }
                            else if (luck < 0.10) {
                                f.raceSpeed *= 0.5; 
                            }
                            
                            f.raceSpeed *= 0.99; 
                            f.raceSpeed = Math.max(0.02, Math.min(0.6, f.raceSpeed));

                            f.x += f.raceSpeed;
                            
                            if (f.x >= 92 && !finished) { 
                                finished = true; 
                                endRace(f.username, [fishA, fishB], raceInterval); 
                            }
                        });
                        setFishes([...fishesRef.current]);
                    }, 50);
                }, 1500); 
            });
        }
    };

    const endRace = (winnerName, participants, intervalId) => {
        clearInterval(intervalId);
        
        if (ws.current && ws.current.readyState === 1) {
            const payload = { request: "DoAction", action: { name: "PondRaceWinner" }, args: { winner: winnerName }, id: "PondRaceEnd" };
            ws.current.send(JSON.stringify(payload));
        }

        setTimeout(() => {
            const currentSettings = configRef.current?.waterSettings || {};
            const isDockedTop = currentSettings.position === "top";

            participants.forEach(f => {
                f.isFrozen = false; f.isRacing = false; f.raceSpeed = 0;
                f.isMovingToEvent = false; 
                
                f.targetX = Math.random() * 90;
                f.targetY = getSafeTargetY(isDockedTop);
                f.direction = f.targetX > f.x ? 'right' : 'left';
            });
        }, 3000);
    };

    if (!wsConnected) {
        return (
            <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-black/80 z-[100] text-white">
                <WifiOff size={64} className="text-red-500 mb-6 animate-pulse" />
                <h1 className="text-3xl font-bold mb-2">Keine Verbindung</h1>
                <p className="text-white/60 text-lg">Bitte Streamer.bot und WebSocket Server starten</p>
                <p className="text-white/30 text-sm mt-4 font-mono">127.0.0.1:8080</p>
            </div>
        );
    }

    const { height, opacity, color, showBubbles, showDecorations, activeDecorations, waveIntensity, position, layoutSeed, fishScale, decoScale } = config.waterSettings;
    const rgbaColor = hexToRgba(color, opacity);
    const isTop = position === "top";
    
    const baseScale = Math.min(1.5, Math.max(0.2, height / 6));
    const fishFinalScale = baseScale * (fishScale || 1);
    const decoFinalScale = baseScale * (decoScale || 1);
    
    return (
        <div className="fixed inset-0 w-full h-full pointer-events-none z-50">
            <Preloader />
            <div className="absolute w-full transition-all duration-1000" style={{ height: `${height}%`, [isTop ? 'top' : 'bottom']: 0, animation: isHypetrain ? 'rainbow-pulse 5s infinite' : 'none' }}>
                {waveIntensity > 0 && (
                     <div className="absolute w-full leading-[0]" style={{ [isTop ? 'top' : 'bottom']: '100%', [isTop ? 'marginTop' : 'marginBottom']: '1px', height: `${30 * baseScale}px`, zIndex: 10, overflow: 'hidden', transform: isTop ? 'rotate(180deg)' : 'none' }}>
                        <svg className={`relative block w-[200%] h-full animate-wave-${waveIntensity}`} style={{ transform: 'scaleY(1.05)' }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 25" preserveAspectRatio="none"><path d="M0,25 V15 c150,-15 300,10 600,0 c300,-10 450,15 600,0 V25 H0 Z" fill={rgbaColor} /></svg>
                     </div>
                )}
                <SwarmLayer active={isRaid} />
                <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: rgbaColor, boxShadow: `0 0 0 1px ${rgbaColor}` }}>
                    <WaterTexture isTop={isTop} />
                    {showDecorations && <Decorations activeDecos={activeDecorations} scale={decoFinalScale} color={color} layoutSeed={layoutSeed} isTop={isTop} />}
                    {showBubbles && <Bubbles scale={decoFinalScale} />}
                </div>
                {fishes.map(f => (<FishEntity key={f.username} fish={f} pondPosition={position} scale={fishFinalScale} isHypetrain={isHypetrain} />))}
                {effects.map(ef => (
                    <div key={ef.id} className="absolute z-[60] animate-out fade-out slide-out-to-top-10 duration-2000 fill-mode-forwards font-black text-white drop-shadow-md text-2xl" style={{ left: `${ef.x}%`, top: `${ef.y}%` }}>{ef.type === 'heart' && "❤️"}</div>
                ))}
                {sharkAttacks.map(a => (<SharkEntity key={a.id} yPos={a.y} targetX={a.targetX} targetFish={a.targetFish} scale={fishFinalScale} onBite={(name) => { const fish = fishesRef.current.find(f => f.username === name); if (fish) { fish.isDead = true; setBloodEffects(prev => [...prev, { id: Date.now(), x: fish.x, y: fish.y }]); setTimeout(() => setBloodEffects(prev => prev.filter(b => b.id < Date.now() - 1500)), 2000); setFishes([...fishesRef.current]); } }} onComplete={(name) => { fishesRef.current = fishesRef.current.filter(f => f.username !== name); setSharkAttacks(prev => prev.filter(a => a.targetFish !== name)); setFishes([...fishesRef.current]); }} />))}
                {bloodEffects.map(b => <BloodCloud key={b.id} x={b.x} y={b.y} scale={fishFinalScale} />)}
            </div>
        </div>
    );
}