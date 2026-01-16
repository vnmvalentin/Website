// src/pages/Adventures/AdventureGame.jsx
import React, { useEffect, useRef, useState, useContext } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import GameEngine from "../../components/Adventure/AdventureEngine"; 

export default function AdventureGame() {
  const { user } = useContext(TwitchAuthContext);
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
  const [menuView, setMenuView] = useState('MAIN');
  const [userData, setUserData] = useState(null); 
  const [activeRunData, setActiveRunData] = useState(null); 
  const [leaderboard, setLeaderboard] = useState([]);
  const [endScreenData, setEndScreenData] = useState(null);
  const [casinoCredits, setCasinoCredits] = useState(0); 

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
        potion: { name: "Heiltrank", price: 500, desc: "Heilt 50 HP", cooldown: 30000, icon: "assets/adventure/powerups/healpotion.png" },
        shield: { name: "Schutzschild", price: 1500, desc: "5 Sekunden unverwundbar", cooldown: 60000, icon: "assets/adventure/powerups/shield.png" },
        spin: { name: "Wirbelwind", price: 2500, desc: "Schaden um dich herum", cooldown: 15000, icon: "assets/adventure/powerups/spinattack.png" },
        decoy: { name: "Köder", price: 2000, desc: "Lenkt Gegner ab", cooldown: 45000, icon: "assets/adventure/powerups/decoy.png" },
        grenade: { name: "Granate", price: 3000, desc: "Explosiver Flächenschaden", cooldown: 10000, icon: "assets/adventure/projectiles/grenade.png" },
        fastshot: { name: "Hyperfeuer", price: 4000, desc: "Doppelte Feuerrate (5s)", cooldown: 40000, icon: "assets/adventure/powerups/rapidfire.png" },
        fastboots: { name: "Speedboots", price: 3500, desc: "Doppelter Speed (5s)", cooldown: 30000, icon: "assets/adventure/powerups/fastboots.png" }
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
      } catch(e) { setUserData(mockUserData); }
  };

  useEffect(() => { refreshData(); }, [user]);
  
  const loadLeaderboard = async () => { 
      try { 
          const r = await fetch("/api/adventure/leaderboard"); 
          const data = await r.json();
          setLeaderboard(Array.isArray(data) ? data : []); 
      } catch(e){ setLeaderboard([]); } 
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
            credentials: "include"
            // Ggf. Body falls nötig
        });
        const data = await res.json();
        
        // --- FIX: Run SOFORT auf dem Server löschen ---
        // Damit ist der Spielstand weg. Ein F5 führt jetzt zurück ins Hauptmenü (ohne "Weiter"-Button).
        await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" });
        // ----------------------------------------------

        setEndScreenData({ ...data, kills: finalState.kills, stage: finalState.stage, earnedCredits: data.earnedCredits || earnedCredits });
        refreshData(); 
      } catch(e) {
          // --- FIX: Auch bei Fehler (z.B. Internet weg) versuchen zu löschen ---
          // Verhindert, dass man bei Netzwerkfehlern neu laden kann
          try { await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" }); } catch(err) {}
          // ---------------------------------------------------------------------

          setEndScreenData({ earnedCredits: earnedCredits, kills: finalState.kills, stage: finalState.stage });
      } 
  };


  const buySlot = async () => {
        try {
            const res = await fetch("/api/adventure/buy-slot", { method: "POST", credentials: "include" });
            const d = await res.json();
            if(d.success) refreshData();
            else alert(d.error);
        } catch(e) {}
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
      if (selectedShopItem !== type && type !== 'heal') { setSelectedShopItem(type); return; }

      const cost = getPrice(type, baseCost);
      const engine = engineRef.current;
      
      if (engine.state.player.gold >= cost) {
          engine.state.player.gold -= cost;
          const upgradeEffect = {};
          if(type === "heal") { engine.state.player.hp = engine.state.player.maxHp; } 
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
            case 'magnet': return 1;
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
      } catch(e) {}
  };

  const equipSkin = async (skinId) => {
      try {
          const res = await fetch("/api/adventure/equip-skin", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ skinId })
          });
          if(res.ok) refreshData();
      } catch(e) {}
  };

  const buyPowerup = async (powerupId) => {
      try {
          const res = await fetch("/api/adventure/buy-powerup", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ powerupId })
          });
          const data = await res.json();
          if(data.success) { refreshData(); } else { alert(data.error || "Fehler"); }
      } catch(e) {}
  };

  const equipPowerup = async (slotIndex, powerupId) => {
      try {
          const res = await fetch("/api/adventure/equip-powerup", {
              method: "POST", headers: {"Content-Type":"application/json"}, credentials: "include", body: JSON.stringify({ slotIndex, powerupId })
          });
          if(res.ok) refreshData();
      } catch(e) {}
  };

  useEffect(() => { return () => { if(engineRef.current) engineRef.current.stop(); }; }, []);
  if (!user) return <div className="text-white p-10 text-center">Bitte einloggen.</div>;

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-120px)] min-h-[500px] bg-black overflow-hidden rounded-xl shadow-2xl border border-white/10 select-none">

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
                    {/* MENU BUTTON - Jetzt mit z-50 und pointer-events-auto */}
                    <div className="absolute top-0 right-0 pointer-events-auto z-50">
                        <button 
                            onClick={togglePause} 
                            className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-500 shadow-xl transition-transform active:scale-95 flex items-center justify-center group"
                            title="Pause / Menü"
                        >
                            {/* Pause Icon SVG */}
                            <svg className="w-8 h-8 text-white drop-shadow-md group-hover:text-yellow-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                        </button>
                    </div>

                    {/* BOSS HEALTHBAR */}
                    {gameState.boss && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[40%] max-w-[600px] flex flex-col items-center z-30">
                            <div className="text-red-500 font-black text-xl tracking-[0.2em] mb-1 drop-shadow-md">{gameState.boss.name}</div>
                            <div className="w-full h-6 bg-black/80 border-2 border-red-900 rounded-full overflow-hidden relative shadow-[0_0_15px_rgba(255,0,0,0.5)]">
                                <div className="absolute inset-0 bg-red-900/20"></div>
                                <div className="h-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 transition-all duration-200" 
                                    style={{ width: `${Math.max(0, (gameState.boss.hp / gameState.boss.maxHp) * 100)}%` }}></div>
                            </div>
                            <div className="text-xs font-bold text-red-200 mt-1">{Math.floor(gameState.boss.hp)} / {Math.floor(gameState.boss.maxHp)}</div>
                        </div>
                    )}
                </div>

                {/* MIDDLE UI */}
                <div className="flex justify-between items-start w-full absolute top-6 left-0 px-6 pointer-events-none">
                    <div className="flex flex-col gap-2 pointer-events-auto">
                        <div className="relative w-64 h-6 bg-gray-900 border border-gray-600 rounded skew-x-[-10deg] overflow-hidden shadow-lg">
                            <div className="absolute inset-0 bg-red-900/30"></div>
                            <div className="h-full bg-gradient-to-r from-red-700 to-red-500 transition-all duration-300" style={{ width: `${(Math.max(0,gameState.hp)/gameState.maxHp)*100}%`}} />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/90 skew-x-[10deg]">
                                {Math.floor(gameState.hp)} / {gameState.maxHp} HP
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-yellow-400 font-bold text-xl drop-shadow-md">
                            <span>{gameState.gold} 🪙</span>
                        </div>
                    </div>
                    {/* RECHTE SEITE (Stage & Kills) - FIX: mt-14 schiebt es unter den Pause-Button */}
                    <div className="mt-14 text-right bg-black/40 p-2 rounded backdrop-blur-sm border border-white/10 pointer-events-auto">
                        <div className="text-2xl text-white font-black italic tracking-wider">STAGE {gameState.stage}</div>
                        <div className="text-gray-400 text-sm font-bold">
                            KILLS: {gameState.stageKills} / {gameState.killsRequired > 999 ? 'BOSS' : gameState.killsRequired}
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
                            <div key={i} className="w-14 h-14 bg-gray-900/80 border-2 border-gray-600 rounded-lg flex items-center justify-center relative shadow-xl transform transition-transform hover:scale-105">
                                <span className="absolute -top-3 -left-2 text-xs font-bold text-gray-900 bg-gray-400 px-1.5 rounded-sm border border-white/20">{i+1}</span>
                                {def ? (
                                    def.icon.includes('.') ? (
                                        <img src={def.icon} alt={def.name} className="w-10 h-10 object-contain drop-shadow-lg" />
                                    ) : (
                                        <span className="text-3xl filter drop-shadow-lg">{def.icon}</span>
                                    )
                                ) : (
                                    <span className="text-gray-700 text-xs">LEER</span>
                                )}
                                {isOnCd && (
                                    <>
                                        <div 
                                            className="absolute bottom-0 left-0 w-full bg-black/70 z-20 transition-all duration-100 ease-linear"
                                            style={{ height: `${cdPercent}%` }} 
                                        />
                                        <div className="absolute inset-0 z-30 flex items-center justify-center">
                                            <span className="text-white font-black text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
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
            className="block bg-[#111] touch-none w-full h-full"
        />
        {/* NEU: PAUSE MENÜ OVERLAY */}
        {isPaused && menuView === 'GAME' && (
            <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200">
                <div className="bg-gray-900 border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col gap-4 w-64">
                    <h2 className="text-2xl font-bold text-center text-white mb-2">PAUSE</h2>
                    <button 
                        onClick={togglePause} 
                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        WEITERSPIELEN
                    </button>
                    <button 
                        onClick={saveAndQuit} 
                        className="bg-red-900/50 hover:bg-red-800 text-red-200 font-bold py-3 rounded-xl border border-red-900 transition-colors"
                    >
                        SPEICHERN & MENÜ
                    </button>
                </div>
            </div>
        )}

        {/* MENÜS: Jetzt auch absolute zum Container */}
        {menuView === 'MAIN' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-red-600 mb-4 drop-shadow-xl filter text-center">ADVENTURES</h1>
                
                <div className="flex flex-col md:flex-row gap-10 items-center">
                    <div className="flex flex-col gap-4 w-[30vmin] min-w-[250px]">
                        <button onClick={handleStartRequest} className="bg-red-700 hover:bg-red-600 text-white font-bold py-4 rounded text-xl md:text-2xl shadow-lg border border-red-500 transition-all">
                            {activeRunData ? "WEITER SPIELEN" : "NEUES SPIEL"}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setMenuView('SKIN_SHOP')} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">🎨 SKINS</button>
                            <button onClick={() => setMenuView('LOADOUT_SHOP')} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">💣 POWERUPS</button>
                            <button onClick={() => setShowHelp(true)} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">📖 WISSENSBUCH</button>
                            <button onClick={() => setShowFeedback(true)} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">📝 FEEDBACK</button>
                        </div>
                    </div>

                    <div className="w-64 bg-gray-900/80 border border-gray-700 p-4 rounded text-left overflow-hidden">
                        <h3 className="text-yellow-500 font-bold mb-2 border-b border-gray-700 pb-1">🏆 TOP RUNS</h3>
                        <div className="text-xs space-y-2">
                            {leaderboard.length === 0 && <span className="text-gray-500">Keine Daten...</span>}
                            {leaderboard.slice(0,5).map((e,i) => (
                                <div key={i} className="flex justify-between">
                                    <span className="text-white truncate w-24">{e.name}</span>
                                    <span className="text-gray-400">Stage: {e.score}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {/* SHOP MENUS (gekürzt dargestellt, nutzen aber absolute inset-0) */}
        {menuView === 'SKIN_SHOP' && userData && (
             <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-30 animate-in fade-in p-4">
                <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl w-full max-w-4xl h-full md:h-[600px] flex flex-col">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                        <h2 className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">SKIN SHOP</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm hidden md:inline">Guthaben:</span>
                            <span className="bg-purple-900/50 px-4 py-1 rounded-full border border-purple-500 text-purple-300 font-bold text-lg md:text-xl">{casinoCredits} 💎</span>
                        </div>
                    </div>
                    {/* ... Restlicher Skin Shop Code identisch, nur Responsive Grid angepasst ... */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 overflow-y-auto p-2 flex-1 custom-scrollbar content-start">
                        {Object.entries(userData.skinDefs).map(([id, skin]) => {
                            const owned = userData.skins.includes(id); const active = userData.activeSkin === id;
                            return (
                                <div key={id} className={`relative group p-4 rounded-xl border-2 flex flex-col items-center transition-all duration-300 ${active ? 'border-green-500 bg-green-900/20 shadow-[0_0_15px_rgba(0,255,0,0.3)]' : owned ? 'border-gray-600 bg-gray-800 hover:border-gray-400' : 'border-purple-900/30 bg-gray-900/50 hover:border-purple-500 hover:bg-gray-800'}`}>
                                    <div className="w-16 h-16 md:w-24 md:h-24 mb-4 relative flex items-center justify-center">
                                         <div className={`absolute inset-0 rounded-full blur-xl opacity-50 ${active ? 'bg-green-500' : 'bg-purple-600'}`}></div>
                                         <img src={`/assets/adventure/${skin.file}`} alt={skin.name} className="w-full h-full object-contain relative z-10 drop-shadow-lg transition-transform group-hover:scale-110" onError={(e) => {e.target.style.display='none';}} />
                                    </div>
                                    <h3 className="font-bold text-white text-sm md:text-lg mb-1">{skin.name}</h3>
                                    <div className="mt-auto w-full pt-2">
                                        {active ? (<div className="text-center text-green-400 text-xs font-bold py-2 border border-green-500/30 rounded bg-green-900/20 tracking-wider">AKTIV</div>) : owned ? (<button onClick={() => equipSkin(id)} className="w-full bg-gray-700 hover:bg-white hover:text-black text-gray-200 text-xs py-2 rounded font-bold border border-gray-500 transition-colors uppercase tracking-wider">WÄHLEN</button>) : (<button onClick={() => buySkin(id)} disabled={casinoCredits < skin.price} className={`w-full text-xs py-2 rounded font-bold border transition-all ${casinoCredits >= skin.price ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-900/50' : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'}`}>KAUFEN <span className="block text-sm">{skin.price} 💎</span></button>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={() => setMenuView('MAIN')} className="mt-6 self-center px-10 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-bold border border-gray-600 hover:border-white transition-all">ZURÜCK</button>
                </div>
             </div>
        )}
        
        {menuView === 'LOADOUT_SHOP' && userData && (
            <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-30 animate-in fade-in p-4">
                <div className="bg-gray-900 border border-gray-700 p-6 rounded-2xl w-full max-w-4xl h-full md:h-[550px] flex flex-col md:flex-row gap-6">
                    {/* ... Loadout Shop Code (angepasst für flex-row auf desktop) ... */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar border-b md:border-b-0 md:border-r border-gray-700">
                         <div className="sticky top-0 bg-gray-900 pb-4 border-b border-gray-800 mb-4 z-10 flex justify-between items-center">
                            <h2 className="text-xl md:text-2xl font-bold text-white">SHOP</h2>
                            <span className="text-sm font-bold text-purple-400 border border-purple-900 bg-purple-900/20 px-3 py-1 rounded-full">{casinoCredits} Credits</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(userData.powerupDefs).map(([id, def]) => {
                                const owned = userData.powerups.includes(id);
                                return (
                                    <div key={id} className={`p-3 rounded border flex flex-col gap-1 transition-all ${owned ? 'bg-gray-800/50 border-gray-700 opacity-60' : 'bg-gray-800 border-gray-600'}`}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 flex items-center justify-center text-2xl">
                                                {def.icon.includes('.') ? <img src={def.icon} className="max-w-full max-h-full"/> : def.icon}
                                            </div>
                                            <div className="font-bold text-white text-sm">{def.name}</div>
                                        </div>
                                        <div className="text-[10px] text-gray-400 leading-tight h-8">{def.desc}</div>
                                        {!owned ? (
                                            <button onClick={() => buyPowerup(id)} disabled={casinoCredits < def.price} 
                                                className={`mt-auto w-full py-1.5 text-xs font-bold rounded flex justify-between px-2 ${casinoCredits >= def.price ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                                                <span>KAUFEN</span>
                                                <span>{def.price}</span>
                                            </button>
                                        ) : (
                                            <div className="mt-auto w-full text-green-500 text-xs font-bold text-center border border-green-900 bg-green-900/20 py-1 rounded">
                                                ✓ IM BESITZ
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div className="w-full md:w-72 flex flex-col">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">LOADOUT</h3>
                        <div className="flex flex-col gap-3 mb-6">
                            {[0, 1, 2, 3].map((_, i) => {
                                const maxSlots = userData.unlockedSlots || 1; 
                                const isLocked = i >= maxSlots;
                                const itemId = userData.loadout[i];
                                const item = itemId ? userData.powerupDefs[itemId] : null;
                                const unlockPrice = 5000 * Math.pow(2, i - 1);
                                return (
                                    <div key={i} className={`p-3 rounded border flex items-center justify-between min-h-[50px] md:min-h-[60px] relative group ${isLocked ? 'bg-black/80 border-gray-800' : 'bg-black/40 border-gray-600'}`}>
                                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-600 font-black text-xs -rotate-90">SLOT {i+1}</div>
                                        {isLocked ? (
                                            <div className="flex-1 flex justify-center">
                                                <button onClick={() => buySlot(i)} className="text-xs text-yellow-500 font-bold border border-yellow-600 px-2 py-1 rounded hover:bg-yellow-900/50">🔒 KAUFEN ({unlockPrice})</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-3 pl-4">
                                                    {item ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
                                                                {item.icon && item.icon.includes('.') ? <img src={item.icon} alt={item.name} className="max-w-full max-h-full object-contain" /> : <span className="text-xl">{item.icon}</span>}
                                                            </div>
                                                            <div className="text-sm text-white font-bold">{item.name}</div>
                                                        </div>
                                                    ) : <span className="text-gray-600 text-sm italic">Leer</span>}
                                                </div>
                                                {item && <button onClick={() => equipPowerup(i, null)} className="text-red-500 hover:text-red-400 px-2 py-1 font-bold">✕</button>}
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        {/* Inventar Anzeige */}
                         <div className="bg-gray-800 p-3 rounded border border-gray-700 min-h-[80px] flex flex-wrap gap-2 content-start flex-1 overflow-y-auto">
                             {userData.powerups.length === 0 && <span className="text-gray-600 text-xs italic w-full text-center mt-2">Leer</span>}
                             {userData.powerups.map(pid => {
                                const def = userData.powerupDefs[pid];
                                return (
                                    <button key={pid} onClick={() => {
                                        const freeSlot = userData.loadout.indexOf(null);
                                        equipPowerup(freeSlot === -1 ? 0 : freeSlot, pid);
                                    }} className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-xl border border-gray-600 hover:border-white transition-colors">
                                        {def?.icon && def.icon.includes('.') ? <img src={def.icon} alt={def.name} className="w-8 h-8 object-contain" /> : <span>{def?.icon}</span>}
                                    </button>
                                )
                            })}
                         </div>
                        <button onClick={() => setMenuView('MAIN')} className="mt-4 w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold border border-gray-500">ZURÜCK</button>
                    </div>
                </div>
            </div>
        )}

        {/* STAGE COMPLETE */}
        {menuView === 'STAGE_COMPLETE' && (
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-in zoom-in duration-200">
                <h2 className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tighter text-center">STAGE COMPLETE</h2>
                <div className="w-32 h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mb-8"></div>
                <div className="flex gap-6">
                    <button onClick={saveAndQuit} className="px-8 py-4 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold border border-gray-600">Menü</button>
                    <button onClick={handleNextStep} className="px-10 py-4 rounded bg-green-700 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-900/50 border border-green-500 transform hover:scale-105 transition-all text-xl">
                        {(gameState.stage > 0 && gameState.stage % 5 === 0) ? "SHOP >>" : "WEITER >>"}
                    </button>
                </div>
            </div>
        )}

        {/* MILESTONE & SHOP MENUS (Layouts beibehalten) */}
        {menuView === 'MILESTONE_SELECT' && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-40">
                <h2 className="text-3xl md:text-5xl font-bold text-purple-400 mb-8 text-center">MEILENSTEIN ERREICHT!</h2>
                <div className="flex flex-col md:flex-row gap-6">
                    <MilestoneCard title="Multishot" icon="🏹" desc="+1 Projektil pro Schuss" onClick={() => selectMilestone('multishot')} />
                    <MilestoneCard title="Vampirismus" icon="🩸" desc="+5% Heilung bei Kill" onClick={() => selectMilestone('lifesteal')} />
                    <MilestoneCard title="Piercing" icon="⚡" desc="Projektile durchschlagen +1 Gegner" onClick={() => selectMilestone('piercing')} />
                </div>
            </div>
        )}

        {/* WISSENSBUCH MODAL */}
        {showHelp && (
            <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
                <div className="bg-gray-900 border border-gray-600 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl relative">
                    <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold">✕</button>
                    <h2 className="text-3xl font-bold text-yellow-400 mb-6 border-b border-gray-700 pb-2">📖 Abenteurer Handbuch</h2>
                    
                    <div className="space-y-4 text-gray-300">
                        <p>1. Bewege dich mit WASD.<br></br> 2. Schieße mit Leertaste/ linke Maustaste.<br></br> 3. Benutze PowerUps mit 1-4.<br></br> 4. Töte eine bestimmte Anzahl an Gegnern pro Stage und entkomme durch die Tür.<br></br>
                         5. Alle 5 Stages kommt ein Shop. Alle 10 Stages kommt ein Boss Level.<br></br>
                         6. Nach dem Boss Level kannst du ein Meilenstein/ besonderes PowerUp auswählen.<br></br> 7. Manche Gegner haben später besondere Effekte (Gift, Brand, Erfrieren, Schock etc.).<br></br>8. Pro Level gibt es 2 Kisten mit extra Gold.
                        </p>
                    </div>
                    
                    <button onClick={() => setShowHelp(false)} className="mt-8 w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 rounded">Verstanden!</button>
                </div>
            </div>
        )}

        {/* Feedback */}
        {showFeedback && (
            <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
                <div className="bg-gray-900 border border-gray-600 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl relative">
                    <button onClick={() => setShowFeedback(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold">✕</button>
                    <h2 className="text-3xl font-bold text-yellow-400 mb-6 border-b border-gray-700 pb-2">Feedback</h2>
                    
                    <div className="space-y-4 text-gray-300">
                        <p>Hast du Feedback, Bugs oder Ideen für das Spiel, melde dich auf meinem Discord:</p>
                        <a href={"https://discord.gg/V38GBSVNeh"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] px-4 py-2 rounded-lg text-sm font-semibold">💬 Zum Discord</a>
                    </div>
                    
                    <button onClick={() => setShowFeedback(false)} className="mt-8 w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 rounded">Zurück</button>
                </div>
            </div>
        )}

        {menuView === 'INGAME_SHOP' && (
            <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col items-center justify-center z-30 p-4">
                <div className="flex justify-between w-full max-w-4xl items-end mb-6 border-b border-white/10 pb-4">
                    <h2 className="text-3xl md:text-5xl font-black text-yellow-500">HÄNDLER</h2>
                    <div className="text-2xl md:text-3xl text-yellow-400 font-mono font-bold">{gameState.gold} 🪙</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 w-full max-w-4xl overflow-y-auto max-h-[60vh] p-4 custom-scrollbar">
                    <ShopItem title="Waffe schärfen" desc="+0.5 Schaden" baseCost={200} icon="⚔️" currentVal={gameState.stats.damage}
                        onClick={() => buyIngameUpgrade('damage', 200)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'damage'} actualCost={getPrice('damage', 200)} />
                    <ShopItem title="Rüstung" desc="+20 Max HP" baseCost={150} icon="🛡️" currentVal={gameState.stats.maxHp}
                        onClick={() => buyIngameUpgrade('maxHp', 150)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'maxHp'} actualCost={getPrice('maxHp', 150)} />
                    <ShopItem title="Münzmagnet" desc="+Reichweite" baseCost={400} icon="🧲" currentVal={Math.floor(gameState.stats.magnet)}
                        onClick={() => buyIngameUpgrade('magnet', 400)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'magnet'} actualCost={getPrice('magnet', 400)} />
                    <ShopItem title="Heiltrank" desc="HP voll heilen" baseCost={100} icon="💖" currentVal={`${Math.floor(gameState.hp)}/${gameState.maxHp}`}
                        onClick={() => buyIngameUpgrade('heal', 100)} gold={gameState.gold} 
                        scaling={false} selected={false} actualCost={100} />
                    <ShopItem title="Schnellfeuer" desc="+20% Feuerrate" baseCost={350} icon="🔫" currentVal={`${(gameState.stats.fireRate || 1).toFixed(1)}x`}
                        onClick={() => buyIngameUpgrade('fireRate', 350)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'fireRate'} actualCost={getPrice('fireRate', 350)} />
                    <ShopItem title="Glücksbringer" desc="+Crit Chance" baseCost={400} icon="🍀" currentVal={gameState.stats.luck || 1}
                        onClick={() => buyIngameUpgrade('luck', 400)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'luck'} actualCost={getPrice('luck', 400)} />
                </div>
                <button onClick={continueFromShop} className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-16 rounded text-xl md:text-2xl border border-green-500">WEITER KÄMPFEN</button>
            </div>
        )}

        {/* LOAD SAVE & GAMEOVER - Identisch, nur absolute inset */}
        {menuView === 'LOAD_SAVE' && activeRunData && (
            <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-30 animate-in fade-in">
                <h2 className="text-3xl font-bold text-white mb-6">Spielstand gefunden</h2>
                <div className="bg-gray-800 border border-gray-600 p-6 rounded-xl mb-8 text-center min-w-[300px]">
                    <div className="text-4xl font-bold text-yellow-400 mb-2">STAGE {activeRunData.stage}</div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                        <div className="bg-gray-900 p-2 rounded text-red-400">❤️ {Math.floor(activeRunData.hp)} HP</div>
                        <div className="bg-gray-900 p-2 rounded text-yellow-500">🪙 {activeRunData.gold} Gold</div>
                    </div>
                </div>
                <div className="flex gap-4">
                    <button onClick={startNewGame} className="px-6 py-3 rounded-xl bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400 font-bold border border-gray-600 hover:border-red-500 transition-all">Löschen & Neustart</button>
                    <button onClick={resumeGame} className="px-8 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-900/50 transform hover:scale-105 transition-all">WEITERMACHEN</button>
                </div>
            </div>
        )}
        {/* GAMEOVER SCREEN ANPASSUNG */}
        {menuView === 'GAMEOVER' && (
             <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-20">
                <div className="text-center">
                    <h2 className="text-6xl text-red-600 font-black mb-4">GESTORBEN</h2>
                    {endScreenData && (
                        <>
                            <div className="text-2xl text-white mb-2">Stage {endScreenData.stage} erreicht</div>
                            <div className="text-xl text-gray-400 mb-6">{endScreenData.kills} Kills</div>
                            {/* NEU: Credits Anzeige */}
                            <div className="text-4xl text-yellow-400 font-bold mb-8 border-t border-b border-gray-800 py-4">
                                + {endScreenData.earnedCredits} 💎 Credits
                            </div>
                        </>
                    )}
                    <button onClick={() => setMenuView('MAIN')} className="bg-gray-800 text-white px-8 py-3 rounded hover:bg-gray-700">Menü</button>
                </div>
             </div>
        )}
    </div>
  );
}

// ShopItem und MilestoneCard bleiben unverändert
function ShopItem({ title, desc, baseCost, actualCost, icon, onClick, gold, currentVal, scaling, selected }) {
    const canAfford = gold >= actualCost;
    return (
        <button onClick={onClick} disabled={!canAfford && !selected} 
            className={`flex items-center gap-4 p-5 rounded-lg border-2 transition-all text-left group relative overflow-hidden ${selected ? 'bg-yellow-900/40 border-yellow-400 scale-[1.02]' : canAfford ? 'bg-gray-800/80 border-gray-700 hover:border-gray-500 hover:bg-gray-800' : 'bg-gray-900 border-gray-800 opacity-60 cursor-not-allowed'}`}>
            <div className="text-4xl group-hover:scale-110 transition-transform z-10">{icon}</div>
            <div className="flex-1 z-10">
                <div className="font-bold text-xl text-gray-200">{title}</div>
                <div className="text-sm text-gray-400">{desc}</div>
                <div className="text-xs text-blue-400 font-mono mt-1">Aktuell: {currentVal}</div>
            </div>
            <div className="flex flex-col items-end z-10">
                <div className={`font-mono font-bold text-xl ${canAfford ? 'text-yellow-400' : 'text-red-500'}`}>{actualCost} 💰</div>
                {scaling && <div className="text-[10px] text-gray-500 uppercase tracking-wider">Steigender Preis</div>}
            </div>
            {selected && <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-[1px]"><span className="text-yellow-400 font-bold uppercase tracking-widest text-sm border border-yellow-400 px-3 py-1 rounded bg-black/50">Klicken zum Kaufen</span></div>}
        </button>
    );
}

function MilestoneCard({ title, icon, desc, onClick }) {
    return (
        <button onClick={onClick} className="w-64 h-80 bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-purple-500/50 hover:border-purple-400 rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:scale-105 transition-all shadow-lg hover:shadow-purple-900/50 group">
            <div className="text-6xl group-hover:scale-110 transition-transform">{icon}</div>
            <h3 className="text-2xl font-bold text-white">{title}</h3>
            <p className="text-center text-gray-400">{desc}</p>
            <div className="mt-auto px-6 py-2 bg-purple-700 text-white font-bold rounded hover:bg-purple-600 transition-colors">WÄHLEN</div>
        </button>
    )
}