// src/pages/Adventures/AdventureGame.jsx
import React, { useEffect, useRef, useState, useContext } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import GameEngine from "../../components/Adventure/AdventureEngine"; 

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export default function AdventureGame() {
  const { user } = useContext(TwitchAuthContext);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  
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
    stats: { damage: 1, speed: 1, maxHp: 100, multishot: 0, lifesteal: 0, magnet: 0, piercing: 0 },
    loadout: [null, null, null],
    topMessage: null 
  });
  
  const [boughtCounts, setBoughtCounts] = useState({ damage: 0, maxHp: 0, speed: 0, magnet: 0 });
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
          default: { name: "Held", file: "player.png", price: 0 },
          ninja: { name: "Ninja", file: "player_ninja.png", price: 2000 },
          knight: { name: "Ritter", file: "player_knight.png", price: 5000 },
          wizard: { name: "Magier", file: "player_wizard.png", price: 8000 },
          cyber: { name: "Cyberpunk", file: "player_cyber.png", price: 15000 }
      },
      powerups: [],
      loadout: [null, null, null],
      powerupDefs: {
        potion: { name: "Heiltrank", price: 500, desc: "Heilt 50 HP", cooldown: 30000, icon: "🍷" },
        shield: { name: "Schutzschild", price: 1500, desc: "5 Sekunden unverwundbar", cooldown: 60000, icon: "🛡️" },
        spin: { name: "Wirbelwind", price: 2500, desc: "Schaden um dich herum", cooldown: 15000, icon: "🌪️" },
        decoy: { name: "Köder", price: 2000, desc: "Lenkt Gegner ab", cooldown: 45000, icon: "🧸" },
        grenade: { name: "Granate", price: 3000, desc: "Explosiver Flächenschaden", cooldown: 10000, icon: "💣" }
      },
      hasActiveRun: false
  };
  
  const refreshData = async () => {
      if(!user) return;
      try {
        const r = await fetch("/api/adventure/profile", { credentials: "include" });
        if(r.ok) {
            const d = await r.json();
            // Fallback falls DB leer
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
      if(activeRunData) { try { await fetch("/api/adventure/clear-run", { method: "POST", credentials: "include" }); } catch(e){} }
      setBoughtCounts({ damage: 0, maxHp: 0, speed: 0, magnet: 0 }); 
      launchEngine({ stage: 0 });
  };


  // 2. Autospeichern Funktion
  const autoSave = async (saveCurrent = true) => {
        if(!engineRef.current) return;
        // Hier geben wir mit, ob wir den aktuellen Fortschritt wollen oder den Start-Snapshot
        const stateToSave = engineRef.current.exportState(saveCurrent);
        
        try {
            await fetch("/api/adventure/save-run", {
                method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                body: JSON.stringify({ gameState: stateToSave })
            });
            console.log("Autosaved. Current Progress:", saveCurrent);
        } catch(e) { console.error("Autosave failed", e); }
    };

  const resumeGame = () => { launchEngine(activeRunData); };

  const launchEngine = (initialState) => {
    if(!canvasRef.current || !userData) return;
    setMenuView('GAME');
    setEndScreenData(null);
    
    const baseStats = initialState ? initialState.baseStats : { 
        damage: 1, speed: 1, maxHp: 100, multishot: 0, lifesteal: 0, magnet: 0, piercing: 0 
    };

    setGameState({ 
        hp: initialState ? initialState.hp : 100, 
        maxHp: initialState ? initialState.maxHp : 100, 
        kills: initialState ? initialState.kills : 0, 
        stage: initialState ? initialState.stage : 1, 
        gold: initialState ? initialState.gold : 0, 
        killsRequired: 10,
        stageKills: 0,
        hasKey: false, 
        gameOver: false,
        stats: baseStats,
        loadout: [null, null, null],
        topMessage: null
    });

    engineRef.current = new GameEngine(
        canvasRef.current, 
        {
            onUpdateUI: (newState) => {
                if(newState.gameOver) handleGameOver(newState);
                else setGameState(prev => ({...prev, ...newState}));
            },
            onShopOpen: () => setMenuView('INGAME_SHOP'),
            onStageComplete: () => setMenuView('STAGE_COMPLETE')
        },
        userData.skinDefs[userData.activeSkin].file, 
        userData.loadout, 
        userData.powerupDefs, 
        initialState 
    );
    engineRef.current.start();
  };

  const saveAndQuit = async () => {
      if(!engineRef.current) return;
      
      // Wenn wir im 'GAME' view sind, spielen wir gerade -> also Reset auf Stage-Anfang (false)
      // Wenn wir im Shop oder Stage Complete sind -> Fortschritt behalten (true)
      const isMidGame = menuView === 'GAME'; 
      
      // Speichern
      await autoSave(!isMidGame);

      engineRef.current.stop();
      setMenuView('MAIN');
      refreshData();
  };

  const handleGameOver = async (finalState) => {
      setMenuView('GAMEOVER');
      try {
        const res = await fetch("/api/adventure/end-run", {
            method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({ kills: finalState.kills, stage: finalState.stage })
        });
        const data = await res.json();
        setEndScreenData({ ...data, kills: finalState.kills, stage: finalState.stage });
        refreshData(); 
      } catch(e) {
          setEndScreenData({ earnedCredits: finalState.kills * 10, kills: finalState.kills, stage: finalState.stage });
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

  const handleNextStep = () => {
       if(engineRef.current) {
          autoSave(true);
          setMenuView('GAME');
          const stage = engineRef.current.state.stage;
          if (stage % 10 === 0) setMenuView('MILESTONE_SELECT');
          else if (stage % 5 === 0) setMenuView('INGAME_SHOP');
          else engineRef.current.continueNextStage();
       }
  };

  const continueFromShop = () => { if(engineRef.current) {
    autoSave(true);
    setMenuView('GAME');
    engineRef.current.continueNextStage();
  } };
  
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
            case 'speed': return 0.1;
            case 'magnet': return 1;
            default: return 0;
        }
  };
  
  // --- CASINO SHOP CALLS ---
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
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] bg-black/90 p-2 select-none">
      <div className="relative shadow-2xl bg-[#111]" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        
        {/* HUD: 1280x720 VERSION */}
        {(menuView === 'GAME' || menuView === 'INGAME_SHOP' || menuView === 'STAGE_COMPLETE' || menuView === 'MILESTONE_SELECT') && (
             <div className="absolute inset-0 z-10 pointer-events-none text-white p-6">
                <div className="absolute top-4 right-4 pointer-events-auto">
                    <button onClick={saveAndQuit} className="bg-red-900/80 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded border border-red-500">
                        SAVE & QUIT
                    </button>
                </div>
                {/* TOP MESSAGE */}
                {gameState.topMessage && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center animate-in zoom-in duration-300">
                        <div className="bg-black/60 backdrop-blur-sm px-8 py-2 border-x-4 border-red-600">
                            <h2 className="text-3xl font-black text-white tracking-widest uppercase drop-shadow-[0_2px_2px_rgba(255,0,0,0.8)]">
                                {gameState.topMessage}
                            </h2>
                        </div>
                    </div>
                )}

                {/* NEU: BOSS HEALTHBAR (Oben Mitte) */}
                {gameState.boss && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[500px] flex flex-col items-center z-30">
                        <div className="text-red-500 font-black text-xl tracking-[0.2em] mb-1 drop-shadow-md">{gameState.boss.name}</div>
                        <div className="w-full h-6 bg-black/80 border-2 border-red-900 rounded-full overflow-hidden relative shadow-[0_0_15px_rgba(255,0,0,0.5)]">
                            <div className="absolute inset-0 bg-red-900/20"></div>
                            <div className="h-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 transition-all duration-200" 
                                style={{ width: `${Math.max(0, (gameState.boss.hp / gameState.boss.maxHp) * 100)}%` }}></div>
                        </div>
                        <div className="text-xs font-bold text-red-200 mt-1">{Math.floor(gameState.boss.hp)} / {Math.floor(gameState.boss.maxHp)}</div>
                    </div>
                )}
                {/* PLAYER UI (Links & Rechts) */}
                <div className="flex justify-between items-start mt-2">
                    {/* LINKS: HP & GOLD */}
                    <div className="flex flex-col gap-2">
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
                    {/* RECHTS: STAGE INFO (Tiefer gesetzt durch mt-10) */}
                    <div className="text-right mt-10 mr-2 bg-black/40 p-2 rounded backdrop-blur-sm border border-white/10">
                        <div className="text-2xl text-white font-black italic tracking-wider">STAGE {gameState.stage}</div>
                        <div className="text-gray-400 text-sm font-bold">
                            KILLS: {gameState.stageKills} / {gameState.killsRequired > 999 ? 'BOSS' : gameState.killsRequired}
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 pointer-events-auto">
                    {gameState.loadout && gameState.loadout.map((slot, i) => {
                         const def = slot ? userData.powerupDefs[slot.id] : null;
                         const isOnCd = slot && slot.cooldownTimer > 0;
                         const cdPercent = slot && isOnCd ? (slot.cooldownTimer / slot.maxCooldown) * 100 : 0;
                         return (
                            <div key={i} className="w-14 h-14 bg-gray-900/80 border-2 border-gray-600 rounded-lg flex items-center justify-center relative shadow-xl transform transition-transform hover:scale-105">
                                <span className="absolute -top-3 -left-2 text-xs font-bold text-gray-900 bg-gray-400 px-1.5 rounded-sm border border-white/20">{i+1}</span>
                                {def ? <span className="text-3xl filter drop-shadow-lg">{def.icon}</span> : <span className="text-gray-700 text-xs">LEER</span>}
                                {isOnCd && <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg"><div className="text-sm font-bold text-white">{(slot.cooldownTimer/1000).toFixed(0)}</div></div>}
                                {isOnCd && <div className="absolute bottom-0 left-0 right-0 bg-blue-500 h-1" style={{width: `${cdPercent}%`}}/>}
                            </div>
                         )
                    })}
                </div>
            </div>
        )}

        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="block bg-[#111]" />

        {/* MAIN MENU */}
        {menuView === 'MAIN' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-red-600 mb-4 drop-shadow-xl filter">ADVENTURES</h1>
                
                <div className="flex gap-10">
                    <div className="flex flex-col gap-4 w-80">
                        <button onClick={handleStartRequest} className="bg-red-700 hover:bg-red-600 text-white font-bold py-4 rounded text-2xl shadow-lg border border-red-500 transition-all">
                            {activeRunData ? "WEITER SPIELEN" : "NEUES SPIEL"}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setMenuView('SKIN_SHOP')} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">🎨 SKINS</button>
                            <button onClick={() => setMenuView('LOADOUT_SHOP')} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded border border-gray-600">💣 POWERUPS</button>
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

        {/* SKIN SHOP (Grid-Layout, mit Credits) */}
        {menuView === 'SKIN_SHOP' && userData && (
             <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-30 animate-in fade-in">
                <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl w-full max-w-4xl h-[600px] flex flex-col">
                    <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">SKIN SHOP</h2>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm">Guthaben:</span>
                            <span className="bg-purple-900/50 px-4 py-1 rounded-full border border-purple-500 text-purple-300 font-bold text-xl">{casinoCredits} 💎</span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-6 overflow-y-auto p-2 flex-1 custom-scrollbar content-start">
                        {Object.entries(userData.skinDefs).map(([id, skin]) => {
                            const owned = userData.skins.includes(id);
                            const active = userData.activeSkin === id;
                            return (
                                <div key={id} className={`relative group p-4 rounded-xl border-2 flex flex-col items-center transition-all duration-300 ${active ? 'border-green-500 bg-green-900/20 shadow-[0_0_15px_rgba(0,255,0,0.3)]' : owned ? 'border-gray-600 bg-gray-800 hover:border-gray-400' : 'border-purple-900/30 bg-gray-900/50 hover:border-purple-500 hover:bg-gray-800'}`}>
                                    {/* Preview Image Container */}
                                    <div className="w-24 h-24 mb-4 relative flex items-center justify-center">
                                         <div className={`absolute inset-0 rounded-full blur-xl opacity-50 ${active ? 'bg-green-500' : 'bg-purple-600'}`}></div>
                                         <img src={`/assets/adventure/${skin.file}`} alt={skin.name} className="w-full h-full object-contain relative z-10 drop-shadow-lg transition-transform group-hover:scale-110" onError={(e) => {e.target.style.display='none';}} />
                                    </div>
                                    <h3 className="font-bold text-white text-lg mb-1">{skin.name}</h3>
                                    <div className="mt-auto w-full pt-2">
                                        {active ? (
                                            <div className="text-center text-green-400 text-xs font-bold py-2 border border-green-500/30 rounded bg-green-900/20 tracking-wider">AUSGERÜSTET</div>
                                        ) : owned ? (
                                            <button onClick={() => equipSkin(id)} className="w-full bg-gray-700 hover:bg-white hover:text-black text-gray-200 text-xs py-2 rounded font-bold border border-gray-500 transition-colors uppercase tracking-wider">AUSRÜSTEN</button>
                                        ) : (
                                            <button onClick={() => buySkin(id)} disabled={casinoCredits < skin.price} className={`w-full text-xs py-2 rounded font-bold border transition-all ${casinoCredits >= skin.price ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-900/50' : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'}`}>
                                                KAUFEN <span className="block text-sm">{skin.price} 💎</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={() => setMenuView('MAIN')} className="mt-6 self-center px-10 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-bold border border-gray-600 hover:border-white transition-all">ZURÜCK ZUM MENÜ</button>
                </div>
             </div>
        )}

        {/* LOADOUT SHOP (Split View) */}
        {menuView === 'LOADOUT_SHOP' && userData && (
            <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-30 animate-in fade-in">
                <div className="bg-gray-900 border border-gray-700 p-6 rounded-2xl w-full max-w-4xl h-[550px] flex gap-6">
                    {/* LINKS: SHOP LISTE */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar border-r border-gray-700">
                        <div className="sticky top-0 bg-gray-900 pb-4 border-b border-gray-800 mb-4 z-10 flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-white">SHOP</h2>
                            <span className="text-sm font-bold text-purple-400 border border-purple-900 bg-purple-900/20 px-3 py-1 rounded-full">{casinoCredits} Credits</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(userData.powerupDefs).map(([id, def]) => {
                                const owned = userData.powerups.includes(id);
                                return (
                                    <div key={id} className={`p-3 rounded border flex flex-col gap-1 transition-all ${owned ? 'bg-gray-800/50 border-gray-700 opacity-60' : 'bg-gray-800 border-gray-600'}`}>
                                        <div className="flex items-center gap-2">
                                            <div className="text-3xl">{def.icon}</div>
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

                    {/* RECHTS: LOADOUT & INVENTAR */}
                    <div className="w-72 flex flex-col">
                        <h3 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">DEIN LOADOUT</h3>
                        <div className="flex flex-col gap-3 mb-6">
                            {/* FIX: Direkt über Array mappen, statt const im JSX zu nutzen */}
                            {[0, 1, 2, 3].map((_, i) => {
                                const maxSlots = userData.unlockedSlots || 1; 
                                const isLocked = i >= maxSlots;
                                const itemId = userData.loadout[i];
                                const item = itemId ? userData.powerupDefs[itemId] : null;
                                const unlockPrice = 5000 * Math.pow(2, i - 1);

                                return (
                                    <div key={i} className={`p-3 rounded border flex items-center justify-between min-h-[60px] relative group ${isLocked ? 'bg-black/80 border-gray-800' : 'bg-black/40 border-gray-600'}`}>
                                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-600 font-black text-xs -rotate-90">SLOT {i+1}</div>
                                        
                                        {isLocked ? (
                                            <div className="flex-1 flex justify-center">
                                                <button onClick={() => buySlot(i)} className="text-xs text-yellow-500 font-bold border border-yellow-600 px-2 py-1 rounded hover:bg-yellow-900/50">
                                                    🔒 KAUFEN ({unlockPrice} 💎)
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-3 pl-4">
                                                    {item ? (
                                                        <div className="flex items-center gap-2"><span className="text-2xl">{item.icon}</span><div className="text-sm text-white font-bold">{item.name}</div></div>
                                                    ) : <span className="text-gray-600 text-sm italic">Leer</span>}
                                                </div>
                                                {item && <button onClick={() => equipPowerup(i, null)} className="text-red-500 hover:text-red-400 px-2 py-1 font-bold">✕</button>}
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="mt-auto flex flex-col">
                             <h4 className="text-gray-400 font-bold mb-2 text-xs uppercase tracking-wider">Inventar (Klicken zum Ausrüsten)</h4>
                             <div className="bg-gray-800 p-3 rounded border border-gray-700 min-h-[100px] flex flex-wrap gap-2 content-start">
                                 {userData.powerups.length === 0 && <span className="text-gray-600 text-xs italic w-full text-center mt-4">Leer - Kaufe Items links!</span>}
                                 {userData.powerups.map(pid => (
                                     <button key={pid} onClick={() => {
                                         const freeSlot = userData.loadout.indexOf(null);
                                         equipPowerup(freeSlot === -1 ? 0 : freeSlot, pid);
                                     }} className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-xl border border-gray-600 hover:border-white transition-colors relative group/item">
                                         {userData.powerupDefs[pid]?.icon}
                                         <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/item:opacity-100 pointer-events-none z-20">
                                             {userData.powerupDefs[pid]?.name}
                                         </div>
                                     </button>
                                 ))}
                             </div>
                        </div>
                        <button onClick={() => setMenuView('MAIN')} className="mt-4 w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold border border-gray-500">ZURÜCK</button>
                    </div>
                </div>
            </div>
        )}

        {/* STAGE COMPLETE */}
        {menuView === 'STAGE_COMPLETE' && (
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-in zoom-in duration-200">
                <h2 className="text-6xl font-black text-white mb-2 tracking-tighter">STAGE COMPLETE</h2>
                <div className="w-32 h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mb-8"></div>
                <div className="flex gap-6">
                    <button onClick={saveAndQuit} className="px-8 py-4 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold border border-gray-600">Speichern & Menü</button>
                    <button onClick={handleNextStep} className="px-10 py-4 rounded bg-green-700 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-900/50 border border-green-500 transform hover:scale-105 transition-all text-xl">
                        {(gameState.stage % 5 === 0) ? "ZUM SHOP >>" : "NÄCHSTE STAGE >>"}
                    </button>
                </div>
            </div>
        )}

        {/* MILESTONE */}
        {menuView === 'MILESTONE_SELECT' && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-40">
                <h2 className="text-5xl font-bold text-purple-400 mb-4">MEILENSTEIN ERREICHT!</h2>
                <div className="flex gap-6">
                    <MilestoneCard title="Multishot" icon="🏹" desc="+1 Projektil pro Schuss" onClick={() => selectMilestone('multishot')} />
                    <MilestoneCard title="Vampirismus" icon="🩸" desc="+5% Heilung bei Kill" onClick={() => selectMilestone('lifesteal')} />
                    <MilestoneCard title="Piercing" icon="⚡" desc="Projektile durchschlagen +1 Gegner" onClick={() => selectMilestone('piercing')} />
                </div>
            </div>
        )}

        {/* INGAME SHOP */}
        {menuView === 'INGAME_SHOP' && (
            <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col items-center justify-center z-30">
                <div className="flex justify-between w-full max-w-4xl items-end mb-6 border-b border-white/10 pb-4">
                    <h2 className="text-5xl font-black text-yellow-500">HÄNDLER</h2>
                    <div className="text-3xl text-yellow-400 font-mono font-bold">{gameState.gold} 🪙</div>
                </div>
                <div className="grid grid-cols-2 gap-6 mb-10 w-full max-w-4xl">
                    <ShopItem title="Waffe schärfen" desc="+0.5 Schaden" baseCost={200} icon="⚔️" currentVal={gameState.stats.damage}
                        onClick={() => buyIngameUpgrade('damage', 200)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'damage'} actualCost={getPrice('damage', 200)} />
                    <ShopItem title="Rüstung" desc="+20 Max HP" baseCost={150} icon="🛡️" currentVal={gameState.stats.maxHp}
                        onClick={() => buyIngameUpgrade('maxHp', 150)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'maxHp'} actualCost={getPrice('maxHp', 150)} />
                    <ShopItem title="Leichtfüßig" desc="+10% Speed" baseCost={300} icon="👟" currentVal={gameState.stats.speed.toFixed(1)}
                        onClick={() => buyIngameUpgrade('speed', 300)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'speed'} actualCost={getPrice('speed', 300)} />
                    <ShopItem title="Münzmagnet" desc="+Reichweite" baseCost={400} icon="🧲" currentVal={Math.floor(gameState.stats.magnet)}
                        onClick={() => buyIngameUpgrade('magnet', 400)} gold={gameState.gold} 
                        scaling={true} selected={selectedShopItem === 'magnet'} actualCost={getPrice('magnet', 400)} />
                    <ShopItem title="Heiltrank" desc="HP voll heilen" baseCost={100} icon="💖" currentVal={`${Math.floor(gameState.hp)}/${gameState.maxHp}`}
                        onClick={() => buyIngameUpgrade('heal', 100)} gold={gameState.gold} 
                        scaling={false} selected={false} actualCost={100} />
                </div>
                <button onClick={continueFromShop} className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-16 rounded text-2xl border border-green-500">WEITER KÄMPFEN</button>
            </div>
        )}

        {/* LOAD SAVE MENU */}
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

        {/* GAME OVER */}
        {menuView === 'GAMEOVER' && (
             <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-20">
                <div className="text-center">
                    <h2 className="text-6xl text-red-600 font-black mb-4">GESTORBEN</h2>
                    {endScreenData && <div className="text-2xl text-white mb-8">Stage {endScreenData.stage} erreicht</div>}
                    <button onClick={() => setMenuView('MAIN')} className="bg-gray-800 text-white px-8 py-3 rounded">Menü</button>
                </div>
             </div>
        )}
      </div>
    </div>
  );
}

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