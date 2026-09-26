// src/pages/Adventures/AdventureGame.jsx
import React, { useEffect, useRef, useState, useContext } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import GameEngine from "./AdventureEngine";
import CoinIcon from "../../components/CoinIcon";
import SEO from "../../components/SEO";
import { Swords, Play, Trophy, Palette, Zap, BookOpen, MessageSquare, ScrollText, X, Send, CheckCircle2, Sword, Shield, Magnet, Heart, Gauge, Clover, Layers, Droplets, ChevronsRight, Skull, Save, Coins, Store, Flag } from "lucide-react";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default function AdventureGame() {
  const { user, login } = useContext(TwitchAuthContext);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const containerRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(false); 
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialer State
  const [dimensions, setDimensions] = useState({ 
      width: window.innerWidth, 
      height: window.innerHeight 
  });
  
  // Game State
  const [gameState, setGameState] = useState({ 
    hp: 100, 
    maxHp: 100, 
    kills: 0, 
    stage: 1, 
    gold: 0, 
    killsRequired: 10, 
    stageKills: 0, 
    gameOver: false,
    stats: { damage: 1, speed: 1, maxHp: 100, multishot: 0, lifesteal: 0, magnet: 0, piercing: 0,
             luck: 1, fireRate: 1
     },
    loadout: [null, null, null],
    topMessage: null,
    boss: null 
  });
  
  const [boughtCounts, setBoughtCounts] = useState({ damage: 0, maxHp: 0, speed: 0, magnet: 0, fireRate:0, luck:0 });
  // Ref, damit autoSave (aus Engine-Callbacks aufgerufen) nie veraltete Counts speichert
  const boughtCountsRef = useRef(boughtCounts);
  useEffect(() => { boughtCountsRef.current = boughtCounts; }, [boughtCounts]);
  const [menuView, setMenuView] = useState('MAIN');
  const [userData, setUserData] = useState(null); 
  const [activeRunData, setActiveRunData] = useState(null); 
  const [leaderboard, setLeaderboard] = useState([]);
  const [endScreenData, setEndScreenData] = useState(null);
  const [casinoCredits, setCasinoCredits] = useState(0); 
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("idle");
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // MOCK DATA (Fallback)
  const mockUserData = {
      skins: ["default"],
      activeSkin: "default",
      skinDefs: { 
          default: { name: "Standard", file: "player.png", price: 0 },
          ninja: { name: "Ninja", file: "player_ninja.png", price: 2000 },
          knight: { name: "Ritter", file: "player_knight.png", price: 5000 },
          wizard: { name: "Magier", file: "player_wizard.png", price: 8000 },
          cyber: { name: "Cyberpunk", file: "player_cyber.png", price: 15000 },
          gh0stqq: { name: "Gh0stQQ", file: "gh0stqq.png", price: 15000 },
          bestmod: { name: "Best Mod",  file: "bestmod.png", price: 15000 }
      },
      powerups: [],
      loadout: [null, null, null],
      powerupDefs: {
        potion: { name: "Heiltrank", price: 500, desc: "Heilt 50 HP", cooldown: 40000, icon: "assets/adventure/powerups/healpotion.png" },
        shield: { name: "Schutzschild", price: 1500, desc: "3 Sekunden unverwundbar", cooldown: 45000, icon: "assets/adventure/powerups/shield.png" },
        spin: { name: "Wirbelwind", price: 2500, desc: "Schaden um dich herum", cooldown: 25000, icon: "assets/adventure/powerups/spinattack.png" },
        decoy: { name: "Köder", price: 2000, desc: "Lenkt Gegner ab", cooldown: 45000, icon: "assets/adventure/powerups/decoy.png" },
        grenade: { name: "Granate", price: 3000, desc: "Explosiver Flächenschaden", cooldown: 35000, icon: "assets/adventure/projectiles/grenade.png" },
        fastshot: { name: "Hyperfeuer", price: 4000, desc: "Doppelte Feuerrate (5s)", cooldown: 25000, icon: "assets/adventure/powerups/rapidfire.png" },
        fastboots: { name: "Speedboots", price: 3500, desc: "Doppelter Speed (5s)", cooldown: 25000, icon: "assets/adventure/powerups/fastboots.png" },
        lightning: { name: "Blitzschlag", price: 5000, desc: "Blitz-Flächenschaden am Cursor", cooldown: 30000, icon: "assets/adventure/boss2/lightning.png" }
      },
      hasActiveRun: false
  };
  
  // --- NEUER RESIZE HANDLER (ResizeObserver) ---
  // Passt die Größe an den Container im Layout an, nicht an das Fenster.
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
            // Wir holen uns die exakte Größe des Content-Divs
            const { width, height } = entry.contentRect;
            
            // State updaten
            setDimensions({ width, height });

            // Engine bescheid geben, falls sie schon läuft
            if (engineRef.current) {
                engineRef.current.resize(width, height);
            }
        }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  const refreshData = async () => {
      if(!user) return;
      try {
        const r = await fetch("/api/adventure/profile", { credentials: "include" });
        if(r.ok) {
            const d = await r.json();
            if (!d.skinDefs || Object.keys(d.skinDefs).length === 0) d.skinDefs = mockUserData.skinDefs;
            if (!d.powerupDefs || Object.keys(d.powerupDefs).length === 0) d.powerupDefs = mockUserData.powerupDefs;
            
            setUserData(d);
            if (d.hasActiveRun) {
                const r2 = await fetch("/api/adventure/load-run", { credentials: "include" });
                const run = await r2.json();
                if(run.success) setActiveRunData(run.run);
            } else { setActiveRunData(null); }

            const r3 = await fetch("/api/casino/user", { credentials: "include" });
            const d3 = await r3.json();
            setCasinoCredits(d3.credits || 0);
        } else { setUserData(mockUserData); }
        loadLeaderboard();
      } catch { setUserData(mockUserData); }
  };

  useEffect(() => { refreshData(); }, [user]);
  
  const loadLeaderboard = async () => { 
      try { 
          const r = await fetch("/api/adventure/leaderboard"); 
          const data = await r.json();
          setLeaderboard(Array.isArray(data) ? data : []); 
      } catch { setLeaderboard([]); } 
  };

  const handleStartRequest = () => { if(activeRunData) { setMenuView('LOAD_SAVE'); } else { startNewGame(); } };

  const startNewGame = async () => {
      // FIX: Immer löschen, nicht nur wenn activeRunData existiert.
      // Nach Game Over ist activeRunData nämlich null, aber auf dem Server liegt noch der alte Run.
      try { 
          await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" }); 
      } catch(e) { console.error(e); }
      
      setActiveRunData(null); // State sicherheitshalber leeren
      setBoughtCounts({ damage: 0, maxHp: 0, speed: 0, magnet: 0 }); 
      
      launchEngine({ stage: 0 });
  };

  const autoSave = async (saveCurrent = true) => {
        if(!engineRef.current) return;
        const stateToSave = engineRef.current.exportState(saveCurrent);
        // FIX (Exploit): Shop-Kaufzähler mitspeichern — vorher starteten die
        // Upgrade-Preise nach jedem Reload wieder beim Basispreis.
        stateToSave.boughtCounts = boughtCountsRef.current;
        try {
            await fetch("/api/adventure/save-run", {
                method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                body: JSON.stringify({ gameState: stateToSave })
            });
        } catch(e) { console.error("Autosave failed", e); }
    };

  const resumeGame = () => { launchEngine(activeRunData); };

  // NEU: ESC TASTE LISTENER
  useEffect(() => {
    const handleEsc = (e) => {
        if (e.key === "Escape") {
            if (menuView === 'GAME') {
                togglePause();
            } else if (menuView === 'INGAME_SHOP') {
                // Optional: Shop mit ESC schließen
                setMenuView('GAME'); 
            }
        }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [menuView, isPaused]); // Abhängigkeiten wichtig

  // NEU: Pause Funktion
  const togglePause = () => {
      if (!engineRef.current) return;
      
      const nextState = !engineRef.current.state.paused;
      engineRef.current.state.paused = nextState; // Engine direkt pausieren
      setIsPaused(nextState);
  };


  const launchEngine = (initialState) => {
    if(!canvasRef.current || !userData) return;
    
    // Standardmäßig starten wir im Spiel
    let startView = 'GAME';
    let startPaused = false;

    // FIX: Prüfen ob wir direkt in einen Shop/Meilenstein laden müssen
    if (initialState && initialState.stage > 1) { 
        const prevStage = initialState.stage - 1;
        
        // Wir prüfen NUR die Stage Nummer. Da der Savegame-Reset die Stats zurücksetzt,
        // ist es sicher, den Shop immer anzuzeigen.
        if (prevStage % 10 === 0) {
            startView = 'MILESTONE_SELECT';
            startPaused = true; 
        } 
        else if (prevStage % 5 === 0) {
             startView = 'INGAME_SHOP';
             startPaused = true; 
        }
    }
    

    setMenuView(startView);
    setEndScreenData(null);
    setIsPaused(startPaused);

    // Gespeicherte Shop-Kaufzähler wiederherstellen (Preis-Exploit-Fix)
    if (initialState?.boughtCounts) {
        setBoughtCounts({ damage: 0, maxHp: 0, speed: 0, magnet: 0, fireRate: 0, luck: 0, ...initialState.boughtCounts });
    }
    
    const baseStats = initialState ? initialState.baseStats : { 
        damage: 1, speed: 1, maxHp: 100, multishot: 0, lifesteal: 0, magnet: 0, piercing: 0, luck: 1
    };

    setGameState({ 
        hp: initialState ? initialState.hp : 100, 
        maxHp: initialState ? initialState.maxHp : 100, 
        kills: initialState ? initialState.kills : 0, 
        stage: (initialState && initialState.stage !== undefined) ? initialState.stage : 1, 
        gold: initialState ? initialState.gold : 0, 
        killsRequired: 10,
        stageKills: 0,
        hasKey: false, 
        gameOver: false,
        stats: baseStats,
        loadout: [null, null, null],
        topMessage: null,
        boss: null
    });

    setIsLoading(true); 

    engineRef.current = new GameEngine(
        canvasRef.current, 
        {
            onUpdateUI: (newState) => {
                if(newState.gameOver) handleGameOver(newState);
                else setGameState(prev => ({...prev, ...newState}));
            },
            onShopOpen: () => setMenuView('INGAME_SHOP'),
            onStageComplete: () => {
                autoSave(true); 
                setMenuView('STAGE_COMPLETE');
            },
            // 2. WICHTIG: Start erst HIER auslösen!
            onAssetsLoaded: () => {
                console.log("Assets geladen -> Starte Loop");
                setIsLoading(false); 
                if (engineRef.current) {
                    engineRef.current.resize(dimensions.width, dimensions.height);
                    engineRef.current.start();
                    
                    // --- FIX: Tutorial-Start sofort speichern ---
                    // Damit ist der "alte Run" im Backend definitiv überschrieben mit Stage 0.
                    if (engineRef.current.state.stage === 0) {
                        autoSave(false);
                    }
                }
            }
        },
        userData.skinDefs[userData.activeSkin].file, 
        userData.loadout, 
        userData.powerupDefs, 
        initialState 
    );
    
    // Engine starten. Die Größe wird durch den ResizeObserver kurz darauf nochmal korrigiert, falls nötig.
    if(engineRef.current) {
        engineRef.current.resize(dimensions.width, dimensions.height);
        
        if (startPaused) {
            engineRef.current.state.paused = true;
            if (startView === 'INGAME_SHOP') engineRef.current.state.inShop = true;
        }
        
        // ENTFERNT: engineRef.current.start();  <-- Das darf hier NICHT mehr stehen!
    }
  };

  // ÄNDERUNG: saveAndQuit anpassen
  const saveAndQuit = async () => {
      if(!engineRef.current) return;
      
      // FIX: Wenn wir im STAGE_COMPLETE Screen sind, wollen wir den Fortschritt behalten (Next Stage)
      if (menuView === 'STAGE_COMPLETE') {
          // Wir erhöhen die Stage in der Engine manuell, damit der Savegame "Stage X+1" speichert
          engineRef.current.state.stage++;
          // 'true' = Speichere aktuelle HP/Gold, nicht die vom Start der Stage
          await autoSave(true); 
      } else {
          // Normales Speichern (Pause mitten drin): Reset auf Stage-Anfang (Schutz vor Save-Scumming)
          await autoSave(false); 
      }
      
      engineRef.current.stop();
      setIsPaused(false); 
      setMenuView('MAIN');
      refreshData();
  };

  const handleGameOver = async (finalState) => {
      setMenuView('GAMEOVER');
      
      // Lokal den Run sofort entfernen
      setActiveRunData(null); 

      const earnedCredits = finalState.kills * 10; 

      try {
        // 1. Run beenden und Belohnungen abholen
        const res = await fetch("/api/adventure/end-run", {
            method: "POST", // Vermutlich POST, je nach deiner API
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ 
                kills: finalState.kills, 
                stage: finalState.stage 
            })
            // Ggf. Body falls nötig
        });
        const data = await res.json();
        
        // --- FIX: Run SOFORT auf dem Server löschen ---
        // Damit ist der Spielstand weg. Ein F5 führt jetzt zurück ins Hauptmenü (ohne "Weiter"-Button).
        await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" });
        // ----------------------------------------------

        setEndScreenData({ 
            ...data, 
            kills: finalState.kills, 
            stage: finalState.stage, 
            earnedCredits: data.earnedCredits !== undefined ? data.earnedCredits : earnedCredits 
        });
        refreshData(); // Lädt Highscore neu
      } catch(e) {
          console.error("Game Over Error:", e);
          // --- FIX: Auch bei Fehler versuchen zu löschen ---
          try { await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" }); } catch { /* ignore */ }

          setEndScreenData({ earnedCredits: earnedCredits, kills: finalState.kills, stage: finalState.stage });
      }
  };


  const buySlot = async () => {
        try {
            const res = await fetch("/api/adventure/buy-slot", { method: "POST", credentials: "include" });
            const d = await res.json();
            if(d.success) refreshData();
            else alert(d.error);
        } catch { /* ignore */ }
    };

  const handleNextStep = async () => {
       if(engineRef.current) {
          const engine = engineRef.current;
          const completedStage = engine.state.stage; 

          // 1. Stage erhöhen
          engine.state.stage = completedStage + 1;

          // 2. WICHTIG: ZUERST die neue Stage generieren.
          // Dadurch wird das neue Theme (Random oder Boss) festgelegt und in engine.state.currentTheme geschrieben.
          engine.spawnStage(); 
          
          // 3. Engine-Status "sauber" machen (Standardmäßig Spiel läuft)
          engine.state.inShop = false; 
          engine.state.paused = false;

          // 4. JETZT speichern. 
          // Jetzt wird das gerade generierte Theme mitgespeichert.
          await autoSave(true);
          
          setMenuView('GAME');
          
          // 5. Routing prüfen (Shop / Meilenstein)
          // Falls wir in einen Shop müssen, pausieren wir die Engine wieder.
          // Das Level (Theme) im Hintergrund ist aber schon bereit.
          if (completedStage > 0 && completedStage % 10 === 0) {
              setMenuView('MILESTONE_SELECT');
              engine.state.inShop = true; 
          }
          else if (completedStage > 0 && completedStage % 5 === 0) {
              setMenuView('INGAME_SHOP');
              engine.state.inShop = true; 
          }
          
          // Falls kein Shop: Spiel läuft einfach weiter (inShop = false haben wir bei Schritt 3 schon gesetzt)
       }
  };

  const continueFromShop = () => { 
    if(!engineRef.current) return;
    const engine = engineRef.current;

    // UI auf Game setzen und Pause entfernen
    setMenuView('GAME');
    setIsPaused(false); 
    engine.state.paused = false; 
    engine.state.inShop = false; 

    // FIX: Nur spawnStage() aufrufen, nicht continueNextStage()
    // continueNextStage würde stage++ machen, was wir jetzt schon vorher erledigt haben.
    if (engine.state.stageKills >= engine.state.killsRequired || engine.state.doorOpen) {
        engine.spawnStage(); 
    }
  };
  
  const selectMilestone = (type) => {
      if(!engineRef.current) return;
      const engine = engineRef.current;
      const upgrade = {};
      if(type === 'multishot') upgrade.multishot = 1;
      if(type === 'lifesteal') upgrade.lifesteal = 0.05;
      if(type === 'piercing') upgrade.piercing = 1;
      if(type === 'rapidfire') upgrade.fireRate = 0.3;
      if(type === 'fortune') upgrade.luck = 1;
      engine.applyUpgrades(upgrade);
      setMenuView('INGAME_SHOP');
  };

  const [selectedShopItem, setSelectedShopItem] = useState(null);
  const getPrice = (type, baseCost) => {
      const count = boughtCounts[type] || 0;
      return Math.floor(baseCost * Math.pow(1.4, count));
  };

  const buyIngameUpgrade = (type, baseCost) => {
      if(!engineRef.current) return;
      
      if (selectedShopItem !== type) { 
          setSelectedShopItem(type); 
          return; 
      }

      const cost = getPrice(type, baseCost);
      const engine = engineRef.current;
    
      const finalCost = (type === 'heal') ? 100 : cost;

      if (engine.state.player.gold >= finalCost) {
          engine.state.player.gold -= finalCost;
          const upgradeEffect = {};
          
          if(type === "heal") { 
              engine.state.player.hp = engine.state.player.maxHp; 
          } 
          else {
              upgradeEffect[type] = getUpgradeValue(type);
              setBoughtCounts(prev => ({ ...prev, [type]: (prev[type] || 0) + 1 }));
          }
          
          if(type !== "heal") engine.applyUpgrades(upgradeEffect);
          
          setGameState(prev => ({
              ...prev, gold: engine.state.player.gold, hp: engine.state.player.hp, stats: {...engine.baseStats}
          }));
          
          setSelectedShopItem(null);
      }
  };

  const getUpgradeValue = (type) => {
        switch(type) {
            case 'damage': return 0.5;
            case 'maxHp': return 20;
            case 'magnet': return 0.5;
            case 'fireRate': return 0.2; // +20% Angriffsgeschwindigkeit
            case 'luck': return 0.5;
            default: return 0;
        }
  };
  
  const buySkin = async (skinId) => {
      try {
          const res = await fetch("/api/adventure/buy-skin", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ skinId })
          });
          const data = await res.json();
          if(data.success) { refreshData(); } else { alert(data.error || "Fehler"); }
      } catch { /* ignore */ }
  };

  const equipSkin = async (skinId) => {
      try {
          const res = await fetch("/api/adventure/equip-skin", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ skinId })
          });
          if(res.ok) refreshData();
      } catch { /* ignore */ }
  };

  const buyPowerup = async (powerupId) => {
      try {
          const res = await fetch("/api/adventure/buy-powerup", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ powerupId })
          });
          const data = await res.json();
          if(data.success) { refreshData(); } else { alert(data.error || "Fehler"); }
      } catch { /* ignore */ }
  };

  const equipPowerup = async (slotIndex, powerupId) => {
      try {
          const res = await fetch("/api/adventure/equip-powerup", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ slotIndex, powerupId })
          });
          if(res.ok) refreshData();
      } catch { /* ignore */ }
  };

  useEffect(() => { return () => { if(engineRef.current) engineRef.current.stop(); }; }, []);

  if (!user) return (
    <div className="page-fade h-full w-full flex items-center justify-center p-6">
      <div className="panel p-10 max-w-md w-full flex flex-col items-center gap-5 text-center">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
          <Swords size={26} />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white mb-2">adVentures</h1>
          <p className="text-sm text-white/50">Melde dich mit Twitch an, um zu spielen.</p>
        </div>
        <button
          onClick={() => login(false)}
          className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          <TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden
        </button>
      </div>
    </div>
  );

  // Vor dem eigentlichen Spielstart brauchen wir keinen schwarzen Hintergrund —
  // der lädt erst, sobald die Engine wirklich startet (Ladescreen übernimmt das).
  const isPreGame = menuView === 'MAIN';

  return (
    <div className="h-full w-full min-h-0 flex flex-col flex-1 -mx-0">
    <div ref={containerRef} className={`relative w-full flex-1 min-h-[400px] h-full max-h-full overflow-hidden md:rounded-xl shadow-2xl border border-white/10 select-none transition-colors ${isPreGame ? 'bg-transparent' : 'bg-black'}`}>
        <SEO title = "Adventure"/>
        {/* NEU: LADESCREEN OVERLAY */}
        {isLoading && menuView !== 'MAIN' && (
            <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center">
                <div className="text-4xl font-black text-yellow-500 mb-4 animate-pulse">LADE WELT...</div>
                <div className="w-64 h-2 bg-gray-800 rounded overflow-hidden">
                    <div className="h-full bg-yellow-500 animate-[width_1s_ease-in-out_infinite]" style={{width: '50%'}}></div>
                </div>
            </div>
        )}
        
        {/* HUD LAYOUT - 'absolute inset-0' bezieht sich jetzt auf DIESEN Container, nicht das Fenster */}
        {(menuView === 'GAME' || menuView === 'INGAME_SHOP' || menuView === 'STAGE_COMPLETE' || menuView === 'MILESTONE_SELECT') && (
             <div className="absolute inset-0 z-10 pointer-events-none text-white p-[2vmin] flex flex-col justify-between">
                
                {/* TOP HEADER */}
                <div className="relative w-full">
                    <div className="absolute top-0 right-0 pointer-events-auto z-50">
                        <button
                            onClick={togglePause}
                            className="bg-black/50 backdrop-blur-sm hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/10 shadow-xl transition-colors flex items-center justify-center group"
                            title="Pause / Menü"
                        >
                            <svg className="w-7 h-7 text-white/80 group-hover:text-violet-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        </button>
                    </div>

                    {/* BOSS HEALTHBAR */}
                    {gameState.boss && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[40%] max-w-[600px] flex flex-col items-center z-30">
                            <div className="text-red-400 font-display font-bold text-xl tracking-[0.2em] mb-1.5 drop-shadow-md">{gameState.boss.name}</div>
                            <div className="w-full h-6 bg-black/60 border border-red-400/30 rounded-full overflow-hidden relative">
                                <div className="h-full bg-red-500 transition-all duration-200"
                                    style={{ width: `${Math.max(0, (gameState.boss.hp / gameState.boss.maxHp) * 100)}%` }}></div>
                            </div>
                            <div className="text-xs font-semibold text-red-200 mt-1">{Math.floor(gameState.boss.hp)} / {Math.floor(gameState.boss.maxHp)}</div>
                        </div>
                    )}
                </div>

                {/* MIDDLE UI */}
                <div className="flex justify-between items-start w-full absolute top-6 left-0 px-6 pointer-events-none">
                    <div className="flex flex-col gap-2.5 pointer-events-auto">
                        <div className="relative w-64 h-7 bg-black/50 border border-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${(Math.max(0,gameState.hp)/gameState.maxHp)*100}%`}} />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/90">
                                {Math.floor(gameState.hp)} / {gameState.maxHp} HP
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-amber-300 font-bold text-xl">
                            <span>{gameState.gold} 🪙</span>
                        </div>
                    </div>
                    <div className="mt-14 text-right bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-2.5 pointer-events-auto">
                        <div className="font-display text-2xl text-white font-bold tracking-wide">Stage {gameState.stage}</div>
                        <div className="text-white/40 text-sm font-semibold">
                            Kills: {gameState.stageKills} / {gameState.killsRequired > 999 ? 'BOSS' : gameState.killsRequired}
                        </div>
                    </div>
                </div>

                {/* BOTTOM LOADOUT */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-auto">
                    {gameState.loadout && gameState.loadout.map((slot, i) => {
                         const def = slot ? userData.powerupDefs[slot.id] : null;
                         const isOnCd = slot && slot.cooldownTimer > 0;
                         const cdPercent = slot && isOnCd ? (slot.cooldownTimer / slot.maxCooldown) * 100 : 0;
                         const cdSeconds = slot && isOnCd ? Math.ceil(slot.cooldownTimer / 1000) : 0;
                         return (
                            <div key={i} className="w-16 h-16 bg-black/50 backdrop-blur-sm border border-white/10 rounded-2xl flex items-center justify-center relative">
                                <span className="absolute -top-2.5 -left-2 text-[10px] font-bold text-black bg-white/70 w-4 h-4 rounded-full flex items-center justify-center">{i+1}</span>
                                {def ? (
                                    def.icon.includes('.') ? (
                                        <img src={def.icon} alt={def.name} className="w-11 h-11 object-contain" />
                                    ) : (
                                        <span className="text-3xl">{def.icon}</span>
                                    )
                                ) : (
                                    <span className="text-white/20 text-[10px]">Leer</span>
                                )}
                                {isOnCd && (
                                    <>
                                        <div
                                            className="absolute bottom-0 left-0 w-full bg-black/70 z-20 transition-all duration-100 ease-linear rounded-b-2xl"
                                            style={{ height: `${cdPercent}%` }}
                                        />
                                        <div className="absolute inset-0 z-30 flex items-center justify-center">
                                            <span className="text-white font-bold text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                                                {cdSeconds}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                         )
                    })}
                </div>
            </div>
        )}

        {/* TOP MESSAGE - Textgröße angepasst (5vmin statt text-7xl) */}
        {gameState.topMessage && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-in zoom-in duration-300 z-50 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-sm px-[4vmin] py-[2vmin] border-x-4 border-red-600 rounded-xl">
                    <h2 className="text-[5vmin] font-black text-white tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(255,0,0,0.8)]">
                        {gameState.topMessage}
                    </h2>
                </div>
            </div>
        )}

        {/* CANVAS: Block für sauberes Rendering */}
        <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className={`block touch-none w-full h-full ${isPreGame ? 'bg-transparent' : 'bg-[#111]'}`}
        />
        {/* NEU: PAUSE MENÜ OVERLAY */}
        {isPaused && menuView === 'GAME' && (
            <div className="page-fade absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="panel-strong p-8 flex flex-col gap-3 w-80">
                    <h2 className="font-display text-2xl font-bold text-center text-white mb-3">Pause</h2>
                    <button
                        onClick={togglePause}
                        className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl transition-colors"
                    >
                        Weiterspielen
                    </button>
                    <button
                        onClick={saveAndQuit}
                        className="panel py-3.5 text-red-300 hover:text-red-200 hover:border-red-400/30 font-semibold transition-colors"
                    >
                        Speichern & Menü
                    </button>
                </div>
            </div>
        )}

        {/* HAUPTMENÜ */}
        {menuView === 'MAIN' && (
            <div className="page-fade absolute inset-0 flex flex-col items-center justify-center z-20 p-6 md:p-10 overflow-y-auto custom-scrollbar">
                <div className="w-full max-w-3xl flex flex-col items-center gap-7 py-6">

                    {/* 1. TITEL */}
                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                            <Swords size={24} />
                        </span>
                        <h1 className="font-display text-4xl md:text-6xl font-bold text-white tracking-tight">adVentures</h1>
                    </div>

                    {/* 2. LEADERBOARD PREVIEW */}
                    <div className="panel-strong w-full p-6">
                        <h3 className="flex items-center justify-center gap-2 font-display text-xs font-bold uppercase tracking-[0.25em] text-white/50 mb-5">
                            <Trophy size={15} className="text-amber-400" /> Hall of Fame
                        </h3>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {leaderboard.length === 0 && (
                                <span className="col-span-2 sm:col-span-5 text-center py-4 text-sm text-white/30 italic">Noch keine Legenden...</span>
                            )}

                            {leaderboard.slice(0, 5).map((e, i) => {
                                let rankColor = "text-white/40";
                                let boxClass = "bg-white/[0.02] border-white/10";

                                if (i === 0) { rankColor = "text-amber-400"; boxClass = "bg-amber-500/5 border-amber-400/30"; }
                                else if (i === 1) { rankColor = "text-slate-300"; boxClass = "bg-white/5 border-white/20"; }
                                else if (i === 2) { rankColor = "text-orange-400"; boxClass = "bg-orange-500/5 border-orange-400/25"; }

                                return (
                                    <div key={i} className={`flex flex-col items-center justify-center p-3 rounded-xl border ${boxClass} transition-transform hover:scale-105`}>
                                        <div className={`text-xs font-bold mb-1 ${rankColor}`}>#{i + 1}</div>
                                        <div className="font-semibold text-white text-sm truncate max-w-full px-1" title={e.name}>{e.name}</div>
                                        <div className="text-[11px] text-white/35 font-mono mt-1">Stage <span className="text-white/70 font-bold">{e.score}</span></div>
                                    </div>
                                )
                            })}
                        </div>

                        {leaderboard.length > 5 && (
                            <button
                                onClick={() => setShowLeaderboardModal(true)}
                                className="mt-5 w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                            >
                                <ScrollText size={13} /> Alle anzeigen ({leaderboard.length})
                            </button>
                        )}
                    </div>

                    {/* 3. BUTTONS */}
                    <div className="w-full flex flex-col gap-3">
                        <button
                            onClick={handleStartRequest}
                            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-5 rounded-2xl text-lg md:text-xl transition-colors flex items-center justify-center gap-3"
                        >
                            <Play size={20} fill="currentColor" />
                            {activeRunData ? "Spiel fortsetzen" : "Neues Abenteuer starten"}
                        </button>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MenuButton icon={Palette} label="Skins" onClick={() => setMenuView('SKIN_SHOP')} />
                            <MenuButton icon={Zap} label="Powerups" onClick={() => setMenuView('LOADOUT_SHOP')} />
                            <MenuButton icon={BookOpen} label="Handbuch" onClick={() => setShowHelp(true)} />
                            <MenuButton icon={MessageSquare} label="Feedback" onClick={() => setShowFeedback(true)} />
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {/* SHOP MENUS (gekürzt dargestellt, nutzen aber absolute inset-0) */}
        {menuView === 'SKIN_SHOP' && userData && (
             <div className="page-fade absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 p-4 md:p-8">
                <div className="panel-strong w-full max-w-6xl h-full md:h-[85vh] flex flex-col p-6 md:p-8">
                    <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                        <h2 className="font-display text-2xl md:text-4xl font-bold text-white">Skins</h2>
                        <div className="flex items-center gap-2 panel px-4 py-2">
                            <span className="text-white/40 text-sm hidden md:inline">Guthaben</span>
                            <span className="text-violet-300 font-bold text-lg md:text-xl flex items-center gap-1.5">{casinoCredits} <CoinIcon className="w-5 h-5 text-yellow-500" /></span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 overflow-y-auto p-1 flex-1 custom-scrollbar content-start">
                        {Object.entries(userData.skinDefs).map(([id, skin]) => {
                            const owned = userData.skins.includes(id); const active = userData.activeSkin === id;
                            return (
                                <div key={id} className={`panel relative flex flex-col items-center p-5 transition-colors ${active ? 'border-emerald-400/40 bg-emerald-500/5' : 'hover:border-violet-400/30'}`}>
                                    <div className="w-20 h-20 md:w-28 md:h-28 mb-4 flex items-center justify-center">
                                         <img
                                            src={`/assets/adventure/${skin.file.replace('.png', '3.png')}`}
                                            alt={skin.name}
                                            className="w-full h-full object-contain"
                                            onError={(e) => {e.target.style.display='none';}}
                                        />
                                    </div>
                                    <h3 className="font-semibold text-white text-sm md:text-base mb-1 text-center">{skin.name}</h3>
                                    <div className="mt-auto w-full pt-3">
                                        {active ? (<div className="text-center text-emerald-400 text-xs font-bold py-2 rounded-lg bg-emerald-500/10 border border-emerald-400/20 tracking-wider">AKTIV</div>) : owned ? (<button onClick={() => equipSkin(id)} className="w-full bg-white/10 hover:bg-white/20 text-white text-xs py-2.5 rounded-lg font-semibold transition-colors uppercase tracking-wider">Wählen</button>) : (<button onClick={() => buySkin(id)} disabled={casinoCredits < skin.price} className={`w-full text-xs py-2.5 rounded-lg font-semibold transition-colors ${casinoCredits >= skin.price ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}>Kaufen <span className="inline-flex items-center gap-1 ml-1">{skin.price} <CoinIcon className="w-3.5 h-3.5 text-yellow-500" /></span></button>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={() => setMenuView('MAIN')} className="mt-6 self-center px-10 py-3 panel text-white/70 hover:text-white font-semibold transition-colors">Zurück</button>
                </div>
             </div>
        )}
        
        {menuView === 'LOADOUT_SHOP' && userData && (
            <div className="page-fade absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 p-4 md:p-8">
                <div className="panel-strong w-full max-w-6xl h-full md:h-[85vh] flex flex-col md:flex-row gap-6 p-6 md:p-8">
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                         <div className="sticky top-0 pb-4 border-b border-white/10 mb-4 z-10 flex justify-between items-center bg-inherit">
                            <h2 className="font-display text-xl md:text-2xl font-bold text-white">Powerups</h2>
                            <span className="text-sm font-bold text-violet-300 panel px-3 py-1.5">{casinoCredits} Credits</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(userData.powerupDefs).map(([id, def]) => {
                                const owned = userData.powerups.includes(id);
                                return (
                                    <div key={id} className={`panel p-4 flex flex-col gap-1.5 ${owned ? 'opacity-50' : ''}`}>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 flex items-center justify-center text-2xl shrink-0">
                                                {def.icon.includes('.') ? <img src={def.icon} className="max-w-full max-h-full"/> : def.icon}
                                            </div>
                                            <div className="font-semibold text-white text-sm">{def.name}</div>
                                        </div>
                                        <div className="text-xs text-white/40 leading-relaxed h-9">{def.desc}</div>
                                        {!owned ? (
                                            <button onClick={() => buyPowerup(id)} disabled={casinoCredits < def.price}
                                                className={`mt-auto w-full py-2 text-xs font-semibold rounded-lg flex justify-between px-3 transition-colors ${casinoCredits >= def.price ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}>
                                                <span>Kaufen</span>
                                                <span>{def.price}</span>
                                            </button>
                                        ) : (
                                            <div className="mt-auto w-full text-emerald-400 text-xs font-semibold text-center bg-emerald-500/10 border border-emerald-400/20 py-2 rounded-lg">
                                                Im Besitz
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div className="w-full md:w-80 flex flex-col">
                        <h3 className="font-display text-xl font-bold text-white mb-4 border-b border-white/10 pb-3">Loadout</h3>
                        <div className="flex flex-col gap-3 mb-6">
                            {[0, 1, 2, 3].map((_, i) => {
                                const maxSlots = userData.unlockedSlots || 1;
                                const isLocked = i >= maxSlots;
                                const itemId = userData.loadout[i];
                                const item = itemId ? userData.powerupDefs[itemId] : null;
                                const unlockPrice = 5000 * Math.pow(2, i - 1);
                                return (
                                    <div key={i} className="panel p-3 flex items-center justify-between min-h-[56px] md:min-h-[64px] gap-2">
                                        <span className="text-white/30 font-bold text-[10px] shrink-0 uppercase tracking-widest">#{i+1}</span>
                                        {isLocked ? (
                                            <div className="flex-1 flex justify-center">
                                                <button onClick={() => buySlot(i)} className="text-xs text-amber-300 font-semibold bg-amber-500/10 border border-amber-400/20 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors">Kaufen ({unlockPrice})</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                    {item ? (
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center shrink-0">
                                                                {item.icon && item.icon.includes('.') ? <img src={item.icon} alt={item.name} className="max-w-full max-h-full object-contain" /> : <span className="text-xl">{item.icon}</span>}
                                                            </div>
                                                            <div className="text-sm text-white font-semibold truncate">{item.name}</div>
                                                        </div>
                                                    ) : <span className="text-white/30 text-sm italic">Leer</span>}
                                                </div>
                                                {item && <button onClick={() => equipPowerup(i, null)} className="text-white/30 hover:text-red-400 px-2 py-1 font-bold transition-colors shrink-0">✕</button>}
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="panel p-3 min-h-[90px] flex flex-wrap gap-2 content-start flex-1 overflow-y-auto">
                             {userData.powerups.length === 0 && <span className="text-white/30 text-xs italic w-full text-center mt-2">Leer</span>}
                             {userData.powerups.map(pid => {
                                const def = userData.powerupDefs[pid];
                                return (
                                    <button key={pid} onClick={() => {
                                        const freeSlot = userData.loadout.indexOf(null);
                                        equipPowerup(freeSlot === -1 ? 0 : freeSlot, pid);
                                    }} className="w-11 h-11 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center text-xl transition-colors">
                                        {def?.icon && def.icon.includes('.') ? <img src={def.icon} alt={def.name} className="w-8 h-8 object-contain" /> : <span>{def?.icon}</span>}
                                    </button>
                                )
                            })}
                         </div>
                        <button onClick={() => setMenuView('MAIN')} className="mt-4 w-full py-3 panel text-white/70 hover:text-white font-semibold transition-colors">Zurück</button>
                    </div>
                </div>
            </div>
        )}

        {/* STAGE COMPLETE */}
        {menuView === 'STAGE_COMPLETE' && (
             <div className="page-fade absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30 p-6">
                <div className="panel-strong p-8 md:p-10 w-full max-w-md flex flex-col items-center gap-6">
                    <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300">
                        <Flag size={26} />
                    </span>
                    <div className="text-center">
                        <h2 className="font-display text-3xl md:text-4xl font-bold text-white">Stage {gameState.stage} geschafft</h2>
                        <p className="text-sm text-white/40 mt-2">{gameState.kills} Kills insgesamt · {gameState.gold} Gold dabei</p>
                    </div>
                    <div className="w-full flex flex-col gap-3">
                        <button onClick={handleNextStep} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2.5">
                            {(gameState.stage > 0 && gameState.stage % 5 === 0) ? <><Store size={19} /> Zum Händler</> : <><Play size={18} fill="currentColor" /> Weiter</>}
                        </button>
                        <button onClick={saveAndQuit} className="panel w-full py-3 text-white/60 hover:text-white font-semibold transition-colors flex items-center justify-center gap-2">
                            <Save size={15} /> Speichern &amp; Menü
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MILESTONE SELECT */}
        {menuView === 'MILESTONE_SELECT' && (
            <div className="page-fade absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center z-40 p-6 overflow-y-auto custom-scrollbar">
                <div className="text-center mb-8">
                    <h2 className="font-display text-3xl md:text-4xl font-bold text-white">Meilenstein erreicht</h2>
                    <p className="text-sm text-white/40 mt-2">Wähle ein dauerhaftes Upgrade für diesen Run.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full max-w-5xl">
                    <MilestoneCard title="Multishot" icon={Layers} desc="+1 Projektil pro Schuss" onClick={() => selectMilestone('multishot')} />
                    <MilestoneCard title="Vampirismus" icon={Droplets} desc="+5% Heilung bei jedem Kill" onClick={() => selectMilestone('lifesteal')} />
                    <MilestoneCard title="Piercing" icon={ChevronsRight} desc="Projektile durchschlagen +1 Gegner" onClick={() => selectMilestone('piercing')} />
                    <MilestoneCard title="Schnellfeuer" icon={Gauge} desc="+30% Feuerrate dauerhaft" onClick={() => selectMilestone('rapidfire')} />
                    <MilestoneCard title="Fortuna" icon={Clover} desc="+1 Glück: mehr Crits und mehr Gold" onClick={() => selectMilestone('fortune')} />
                </div>
            </div>
        )}

        {/* WISSENSBUCH MODAL */}
        {showHelp && (
            <div className="page-fade absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
                <div className="panel-strong max-w-3xl w-full max-h-[85vh] overflow-y-auto custom-scrollbar p-6 md:p-10 relative">
                    <button onClick={() => setShowHelp(false)} className="absolute top-5 right-5 p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-8">
                        <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                            <BookOpen size={20} />
                        </span>
                        <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Abenteurer Handbuch</h2>
                    </div>

                    <ol className="space-y-3 text-white/60 text-sm md:text-base leading-relaxed list-none">
                        {[
                            'Bewege dich mit WASD.',
                            'Schieße mit Leertaste / linker Maustaste.',
                            'Benutze PowerUps mit 1-4.',
                            'Töte eine bestimmte Anzahl an Gegnern pro Stage und entkomme durch die Tür.',
                            'Alle 5 Stages kommt ein Shop. Alle 10 Stages kommt ein Boss-Level.',
                            'Nach dem Boss-Level kannst du einen Meilenstein / ein besonderes PowerUp auswählen.',
                            'Manche Gegner haben später besondere Effekte (Gift, Brand, Erfrieren, Schock etc.).',
                            'Pro Level gibt es 2 Kisten mit extra Gold.',
                            'Nach dem Öffnen der Tür werden Gegner schneller, tankier und brutaler — gehe so schnell es geht zum Ausgang.',
                            'Je höher du kommst desto mehr Credits.',
                        ].map((line, i) => (
                            <li key={i} className="flex gap-3">
                                <span className="text-violet-400 font-display font-bold shrink-0">{i + 1}</span>
                                <span>{line}</span>
                            </li>
                        ))}
                    </ol>

                    <button onClick={() => setShowHelp(false)} className="mt-8 w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl transition-colors">Verstanden!</button>
                </div>
            </div>
        )}

        {/* LEADERBOARD MODAL */}
        {showLeaderboardModal && (
            <div className="page-fade absolute inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
                <div className="panel-strong max-w-2xl w-full max-h-[85vh] flex flex-col p-6 md:p-8 relative">
                    <button onClick={() => setShowLeaderboardModal(false)} className="absolute top-5 right-5 p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-400/20 text-amber-300 shrink-0">
                            <Trophy size={20} />
                        </span>
                        <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Hall of Fame</h2>
                    </div>

                    <div className="overflow-y-auto custom-scrollbar flex-1 space-y-2 pr-1">
                        {leaderboard.map((e, i) => {
                             let rankStyle = "bg-white/[0.02] border-white/10";
                             let rankColor = "text-white/40";
                             if (i === 0) { rankStyle = "bg-amber-500/5 border-amber-400/30"; rankColor = "text-amber-400"; }
                             else if (i === 1) { rankStyle = "bg-white/5 border-white/20"; rankColor = "text-slate-300"; }
                             else if (i === 2) { rankStyle = "bg-orange-500/5 border-orange-400/25"; rankColor = "text-orange-400"; }

                             return (
                                <div key={i} className={`flex justify-between items-center p-3.5 rounded-xl border ${rankStyle}`}>
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-9 text-center text-sm font-display font-bold shrink-0 ${rankColor}`}>#{i + 1}</div>
                                        <div className="font-semibold text-white truncate">{e.name}</div>
                                    </div>
                                    <div className="font-mono text-sm font-bold text-white/70 bg-white/[0.04] border border-white/10 px-3 py-1 rounded-lg shrink-0">
                                        Stage {e.score}
                                    </div>
                                </div>
                             )
                        })}
                    </div>

                    <button onClick={() => setShowLeaderboardModal(false)} className="mt-6 w-full py-3 panel text-white/70 hover:text-white font-semibold transition-colors">Schließen</button>
                </div>
            </div>
        )}

        {/* Feedback Modal - NEU */}
        {showFeedback && (
            <div className="page-fade absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
                <div className="panel-strong max-w-2xl w-full p-6 md:p-10 relative flex flex-col gap-5">
                    <button onClick={() => setShowFeedback(false)} className="absolute top-5 right-5 p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                            <MessageSquare size={20} />
                        </span>
                        <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Feedback & Bugs</h2>
                    </div>

                    {feedbackStatus === "success" ? (
                        <div className="flex flex-col items-center justify-center py-10">
                            <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 mb-4">
                                <CheckCircle2 size={30} />
                            </span>
                            <h3 className="text-xl font-bold text-white mb-2">Danke für dein Feedback!</h3>
                            <p className="text-white/40 text-sm">Deine Nachricht wurde an den Discord Server gesendet.</p>
                            <button onClick={() => { setShowFeedback(false); setFeedbackStatus("idle"); setFeedbackText(""); }} className="mt-6 panel px-6 py-2.5 text-white/70 hover:text-white font-semibold transition-colors">Schließen</button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <p className="text-sm text-white/50">Beschreibe ausführlich was dein Anliegen ist. Bugs, Wünsche oder Balance-Vorschläge sind willkommen!</p>
                                <p className="text-xs text-white/30 italic">Dein Twitch-Name ({user?.login}) wird automatisch mitgesendet.</p>
                            </div>

                            <textarea
                                className="w-full h-40 bg-black/30 border border-white/10 rounded-xl p-3.5 text-white focus:border-violet-400/50 focus:outline-none resize-none placeholder-white/25 transition-colors"
                                placeholder="Schreibe hier dein Feedback..."
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                disabled={feedbackStatus === "sending"}
                            />

                            {feedbackStatus === "error" && <p className="text-red-400 text-sm font-semibold">Fehler beim Senden. Bitte versuche es später erneut.</p>}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowFeedback(false)}
                                    className="flex-1 panel py-3 text-white/70 hover:text-white font-semibold transition-colors"
                                    disabled={feedbackStatus === "sending"}
                                >
                                    Abbrechen
                                </button>
                                <button
                                    onClick={async () => {
                                        if (feedbackText.trim().length < 10) return;
                                        setFeedbackStatus("sending");
                                        try {
                                            const res = await fetch("/api/adventure/feedback", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                credentials: "include",
                                                body: JSON.stringify({ message: feedbackText })
                                            });
                                            if (res.ok) {
                                                setFeedbackStatus("success");
                                            } else {
                                                setFeedbackStatus("error");
                                            }
                                        } catch {
                                            setFeedbackStatus("error");
                                        }
                                    }}
                                    disabled={feedbackText.trim().length < 10 || feedbackStatus === "sending"}
                                    className={`flex-1 font-bold py-3 rounded-2xl transition-colors flex items-center justify-center gap-2
                                        ${feedbackText.trim().length < 10
                                            ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                            : 'bg-violet-600 hover:bg-violet-500 text-white'
                                        }`}
                                >
                                    {feedbackStatus === "sending" ? (
                                        <>
                                            <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full"></span>
                                            Sende...
                                        </>
                                    ) : <><Send size={16} /> Absenden</>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

        {menuView === 'INGAME_SHOP' && (
            <div className="page-fade absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center z-30 p-4 md:p-8">
                <div className="panel-strong w-full max-w-4xl flex flex-col p-6 md:p-8 max-h-full">
                    <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-400/20 text-amber-300 shrink-0">
                                <Store size={20} />
                            </span>
                            <h2 className="font-display text-2xl md:text-3xl font-bold text-white">Händler</h2>
                        </div>
                        <div className="panel px-4 py-2 flex items-center gap-2 text-amber-300 font-bold text-lg md:text-xl">
                            <Coins size={18} /> {gameState.gold}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 overflow-y-auto custom-scrollbar p-1">
                        <ShopItem title="Waffe schärfen" desc="+0.5 Schaden" icon={Sword} currentVal={gameState.stats.damage}
                            onClick={() => buyIngameUpgrade('damage', 200)} gold={gameState.gold}
                            scaling={true} selected={selectedShopItem === 'damage'} actualCost={getPrice('damage', 200)} />
                        <ShopItem title="Rüstung" desc="+20 Max HP" icon={Shield} currentVal={gameState.stats.maxHp}
                            onClick={() => buyIngameUpgrade('maxHp', 150)} gold={gameState.gold}
                            scaling={true} selected={selectedShopItem === 'maxHp'} actualCost={getPrice('maxHp', 150)} />
                        <ShopItem title="Münzmagnet" desc="+Reichweite" icon={Magnet} currentVal={Math.floor(gameState.stats.magnet)}
                            onClick={() => buyIngameUpgrade('magnet', 400)} gold={gameState.gold}
                            scaling={true} selected={selectedShopItem === 'magnet'} actualCost={getPrice('magnet', 400)} />
                        <ShopItem title="Heiltrank" desc="HP voll heilen" icon={Heart} currentVal={`${Math.floor(gameState.hp)}/${gameState.maxHp}`}
                            onClick={() => buyIngameUpgrade('heal', 100)} gold={gameState.gold}
                            scaling={false} selected={selectedShopItem === 'heal'} actualCost={100} />
                        <ShopItem title="Schnellfeuer" desc="+20% Feuerrate" icon={Gauge} currentVal={`${(gameState.stats.fireRate || 1).toFixed(1)}x`}
                            onClick={() => buyIngameUpgrade('fireRate', 350)} gold={gameState.gold}
                            scaling={true} selected={selectedShopItem === 'fireRate'} actualCost={getPrice('fireRate', 350)} />
                        <ShopItem title="Glücksbringer" desc="+Crit-Chance & Gold" icon={Clover} currentVal={gameState.stats.luck || 1}
                            onClick={() => buyIngameUpgrade('luck', 400)} gold={gameState.gold}
                            scaling={true} selected={selectedShopItem === 'luck'} actualCost={getPrice('luck', 400)} />
                    </div>
                    <button onClick={continueFromShop} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2.5">
                        <Play size={18} fill="currentColor" /> Weiter kämpfen
                    </button>
                </div>
            </div>
        )}

        {/* LOAD SAVE */}
        {menuView === 'LOAD_SAVE' && activeRunData && (
            <div className="page-fade absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-30 p-6">
                <div className="panel-strong p-8 w-full max-w-md flex flex-col items-center gap-6">
                    <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
                        <Save size={24} />
                    </span>
                    <div className="text-center">
                        <h2 className="font-display text-2xl font-bold text-white mb-1">Spielstand gefunden</h2>
                        <p className="text-sm text-white/40">Dein Run wartet auf dich.</p>
                    </div>
                    <div className="w-full panel p-5 text-center">
                        <div className="font-display text-3xl font-bold text-amber-300 mb-3">Stage {activeRunData.stage}</div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white/[0.03] border border-white/10 rounded-xl py-2.5 flex items-center justify-center gap-2 text-red-300 font-semibold">
                                <Heart size={14} /> {Math.floor(activeRunData.hp)} HP
                            </div>
                            <div className="bg-white/[0.03] border border-white/10 rounded-xl py-2.5 flex items-center justify-center gap-2 text-amber-300 font-semibold">
                                <Coins size={14} /> {activeRunData.gold}
                            </div>
                        </div>
                    </div>
                    <div className="w-full flex flex-col gap-3">
                        <button onClick={resumeGame} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2.5">
                            <Play size={18} fill="currentColor" /> Weitermachen
                        </button>
                        <button onClick={startNewGame} className="panel w-full py-3 text-red-300/80 hover:text-red-300 hover:border-red-400/30 font-semibold transition-colors">
                            Löschen &amp; neu starten
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* GAMEOVER SCREEN */}
        {menuView === 'GAMEOVER' && (
             <div className="page-fade absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-20 p-6">
                <div className="panel-strong p-8 md:p-10 w-full max-w-md flex flex-col items-center gap-6">
                    <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-400">
                        <Skull size={26} />
                    </span>
                    <h2 className="font-display text-3xl md:text-4xl font-bold text-white">Gestorben</h2>
                    {endScreenData && (
                        <div className="w-full flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="panel py-3">
                                    <div className="text-[10px] uppercase tracking-widest text-white/35 font-bold mb-1">Stage</div>
                                    <div className="font-display text-2xl font-bold text-white">{endScreenData.stage}</div>
                                </div>
                                <div className="panel py-3">
                                    <div className="text-[10px] uppercase tracking-widest text-white/35 font-bold mb-1">Kills</div>
                                    <div className="font-display text-2xl font-bold text-white">{endScreenData.kills}</div>
                                </div>
                            </div>
                            <div className="panel py-4 flex items-center justify-center gap-2 text-amber-300 font-bold text-2xl">
                                +{endScreenData.earnedCredits} <CoinIcon className="w-6 h-6 text-yellow-500" />
                            </div>
                        </div>
                    )}
                    <button onClick={() => setMenuView('MAIN')} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-2xl transition-colors">
                        Zurück zum Menü
                    </button>
                </div>
             </div>
        )}
    </div>
    </div>
  );
}

function ShopItem({ title, desc, actualCost, icon, onClick, gold, currentVal, scaling, selected }) {
    const canAfford = gold >= actualCost;
    const Icon = icon;
    return (
        <button onClick={onClick} disabled={!canAfford && !selected}
            className={`panel flex items-center gap-4 p-4 md:p-5 transition-colors text-left relative overflow-hidden ${selected ? 'border-amber-400/50 bg-amber-500/5' : canAfford ? 'hover:border-violet-400/30 hover:bg-white/[0.05]' : 'opacity-50 cursor-not-allowed'}`}>
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
                <Icon size={20} />
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-white">{title}</div>
                <div className="text-xs text-white/40">{desc}</div>
                <div className="text-[11px] text-sky-300/80 font-mono mt-1">Aktuell: {currentVal}</div>
            </div>
            <div className="flex flex-col items-end shrink-0">
                <div className={`font-mono font-bold text-lg flex items-center gap-1.5 ${canAfford ? 'text-amber-300' : 'text-red-400'}`}>
                    {actualCost} <Coins size={14} />
                </div>
                {scaling && <div className="text-[9px] text-white/30 uppercase tracking-wider mt-0.5">Steigender Preis</div>}
            </div>
            {selected && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-[1px]">
                    <span className="text-amber-300 font-bold uppercase tracking-widest text-xs border border-amber-400/50 px-3 py-1.5 rounded-lg bg-black/50">Klicken zum Kaufen</span>
                </div>
            )}
        </button>
    );
}

function MilestoneCard({ title, icon, desc, onClick }) {
    const Icon = icon;
    return (
        <button onClick={onClick} className="panel group flex flex-col items-center gap-4 p-6 min-h-[220px] transition-colors hover:border-violet-400/40 hover:bg-white/[0.05] text-center">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 group-hover:text-violet-200 transition-colors">
                <Icon size={26} />
            </span>
            <h3 className="font-display text-lg font-bold text-white">{title}</h3>
            <p className="text-xs text-white/45 leading-relaxed">{desc}</p>
            <div className="mt-auto w-full py-2.5 bg-violet-600 group-hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors">Wählen</div>
        </button>
    )
}

function MenuButton({ icon, label, onClick }) {
    const Icon = icon;
    return (
        <button
            onClick={onClick}
            className="group panel flex items-center justify-center gap-2.5 py-4 text-white/70 hover:text-white transition-colors hover:bg-white/[0.06] hover:border-violet-400/30"
        >
            <Icon size={17} className="text-white/40 group-hover:text-violet-300 transition-colors" />
            <span className="text-sm font-semibold tracking-wide">{label}</span>
        </button>
    );
}