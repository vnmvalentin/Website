import React, { useContext, useState, useEffect } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import SEO from "../../components/SEO";
import { 
  Fish, Save, RefreshCw, Sliders, Check, Anchor, Shield,
  Waves, Droplets, Image as ImageIcon, Shuffle, Zap, UserX, Lock, Palette
} from "lucide-react";

// --- HILFSKOMPONENTE FÜR TOGGLES ---
const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-cyan-500' : 'bg-white/10 border border-white/20'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6 shadow-md' : 'translate-x-1'}`} />
  </button>
);

// --- ALLE FISCHE ---
const ALL_FISHES = [
  { id: "goldfish", name: "Goldfisch", img: "/assets/viewerpond/goldfish/goldfish.png" },
  { id: "clownfish", name: "Nemo", img: "/assets/viewerpond/clownfish/clownfish.png" },
  { id: "stripedfish", name: "Gill", img: "/assets/viewerpond/stripedfish/stripedfish.png" },
  { id: "puffer", name: "Kugelfisch", img: "/assets/viewerpond/puffer/puffer.png" },
  { id: "seahorse", name: "Seepferdchen", img: "/assets/viewerpond/seahorse/seahorse.png" },
  { id: "jellyfish", name: "Qualle", img: "/assets/viewerpond/jellyfish/jellyfish.png" },
  { id: "turtle", name: "Schildkröte", img: "/assets/viewerpond/turtle/turtle.png" },
  { id: "octopus", name: "Oktopus", img: "/assets/viewerpond/octopus/octopus.png" },
  { id: "sharky", name: "Baby Hai", img: "/assets/viewerpond/babyshark/babyshark.png" },
  { id: "dolphin", name: "Delphin", img: "/assets/viewerpond/dolphin/dolphin.png" },
  { id: "whale", name: "Wal", img: "/assets/viewerpond/whale/whale.png" },
  { id: "starfish", name: "Seestern", img: "/assets/viewerpond/starfish/starfish.png" },
  { id: "seal", name: "Seehund", img: "/assets/viewerpond/seal/seal.png" },
  { id: "hammershark", name: "Hammerhai", img: "/assets/viewerpond/hammershark/hammershark.png" },
  { id: "rainbow", name: "Regenbogen", img: "/assets/viewerpond/rainbow/rainbow.png", reqAchievement: "ultimate_collector" },
  { id: "schleier", name: "Schleierfisch", img: "/assets/viewerpond/schleier/schleier.png" },
  { id: "crab", name: "Krabbe", img: "/assets/viewerpond/crab/crab.png" },
  { id: "eel", name: "Aal", img: "/assets/viewerpond/eel/eel.png" },
  { id: "ray", name: "Rochen", img: "/assets/viewerpond/ray/ray.png" },
  { id: "orca", name: "Orca", img: "/assets/viewerpond/orca/orca.png" },
  { id: "modente", name: "Mod-Ente", img: "/assets/viewerpond/exclusive/modente.png" },
];

const ALL_COLORS = [
    { id: "default", name: "Standard", class: "text-white", reqAchievement: null },
    { id: "blue", name: "Ozean Blau", class: "text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]", reqAchievement: "collector_50" },
    { id: "purple", name: "Mythisch Lila", class: "text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]", reqAchievement: "mythic_found" },
    { id: "gold", name: "Legendäres Gold", class: "text-yellow-300 drop-shadow-[0_0_8px_rgba(234,179,8,1)] font-black", reqAchievement: "legend_found" },
    { id: "rainbow", name: "Regenbogen", class: "animate-text-rainbow bg-gradient-to-r from-red-500 via-green-500 to-blue-500 text-transparent bg-clip-text font-black", reqAchievement: "ultimate_collector" },
    // Neue Ideen:
];

export default function PondPage() {
  const { user, login } = useContext(TwitchAuthContext);
  // HIER DEINE EIGENE TWITCH ID EINTRAGEN:
  const isAdmin = user && String(user.id) === "160224748";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [
      activeTab, setActiveTab
  ] = useState("fish");
  const [success, setSuccess] = useState(false);
  
  // Viewer States
  const [userFish, setUserFish] = useState("goldfish");
  const [userColor, setUserColor] = useState("default");

  const [claimedAchievements, setClaimedAchievements] = useState([]);
  
  // Admin Config States
  const [showConfig, setShowConfig] = useState(false);
  const [subTab, setSubTab] = useState("water");
  
  const [waterSettings, setWaterSettings] = useState({
      height: 15, opacity: 0.5, color: "#06b6d4", sharkEnabled: true, showBubbles: true, 
      showDecorations: true, activeDecorations: [], layoutSeed: 12345, waveIntensity: 1, 
      position: "bottom", fishScale: 1.0, decoScale: 1.0
  });
  const [eventSettings, setEventSettings] = useState({ hypeTrain: true, raid: true });
  const [excludedUsers, setExcludedUsers] = useState("StreamElements, Nightbot");
  const [fishRequirements, setFishRequirements] = useState({});

  useEffect(() => {
    if (!user) return;
    
    Promise.all([
        fetch(`/api/pond/user`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/pond/config`).then(r => r.json()),
        fetch(`/api/cards/user`, { credentials: "include" }).then(r => r.json()) // Achievements laden
    ]).then(([pondUser, configData, cardUser]) => {
        if (pondUser.selectedFish) setUserFish(pondUser.selectedFish);
        if (pondUser.selectedColor) setUserColor(pondUser.selectedColor);
        
        if (cardUser && cardUser.claimedAchievements) {
            setClaimedAchievements(cardUser.claimedAchievements);
        }

        if(configData) {
            if(configData.waterSettings) setWaterSettings(configData.waterSettings);
            if(configData.eventSettings) setEventSettings(configData.eventSettings);
            if(configData.excludedUsers) setExcludedUsers(Array.isArray(configData.excludedUsers) ? configData.excludedUsers.join(", ") : configData.excludedUsers);
            if(configData.fishRequirements) setFishRequirements(configData.fishRequirements);
        }
        setLoading(false);
    });
  }, [user]);

  const saveUserSetting = async (key, value) => {
      if (key === "selectedFish") setUserFish(value);
      if (key === "selectedColor") setUserColor(value);

      const payload = {};
      payload[key] = value;

      await fetch("/api/pond/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
      });
  };

  const saveFish = async (fishId) => {
      setUserFish(fishId);
      await fetch("/api/pond/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedFish: fishId }),
          credentials: "include"
      });
  };

  const saveAdminConfig = async () => {
      setSaving(true);
      await fetch("/api/pond/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waterSettings, eventSettings, excludedUsers, fishRequirements }),
          credentials: "include"
      });
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
  };

  const triggerReload = async () => {
      await fetch("/api/pond/trigger-reload", { method: "POST", credentials: "include" });
  };

  const toggleDeco = (id) => {
      const current = waterSettings.activeDecorations || [];
      if (current.includes(id)) {
          setWaterSettings({ ...waterSettings, activeDecorations: current.filter(x => x !== id) });
      } else {
          setWaterSettings({ ...waterSettings, activeDecorations: [...current, id] });
      }
  };

  const toggleRequirement = (fishId, role) => {
      let reqs = fishRequirements[fishId] || [];
      if (reqs.includes("all")) reqs = []; // Wenn vorher "all", array leeren
      
      if (reqs.includes(role)) {
          reqs = reqs.filter(r => r !== role);
      } else {
          reqs = [...reqs, role];
      }
      setFishRequirements({ ...fishRequirements, [fishId]: reqs });
  };

  if (!user) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
            <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
                <Anchor size={48} className="text-cyan-400 mx-auto mb-4" />
                <h1 className="text-4xl font-black mb-4">Viewer Sea</h1>
                <p className="text-white/50 mb-8 max-w-md mx-auto">Logge dich ein, um deinen Avatar für den Stream-Teich auszuwählen.</p>
                <button onClick={() => login(false)} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:scale-105">
                    Login mit Twitch
                </button>
            </div>
          </div>
      );
  }

  if (loading) return <div className="text-center text-white/50 p-20">Lade Teich-Daten...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 text-white min-h-[85vh] space-y-8">
      <SEO title="Viewer Sea" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                 <Fish className="text-cyan-400" size={32} /> Viewer Sea
              </h1>
              <p className="text-white/50 mt-1">Gestalte deinen Auftritt im Stream!</p>
          </div>
          {isAdmin && (
              <button onClick={() => setShowConfig(!showConfig)} className="bg-white/5 px-4 py-2 rounded-xl text-sm font-bold border border-white/10">
                  <Shield size={16} className="inline mr-2"/> Admin Config
              </button>
          )}
      </div>

      {!showConfig && (
          <div className="space-y-8 animate-in fade-in">
              
              {/* TABS FÜR USER */}
              <div className="flex gap-4 border-b border-white/10 pb-1">
                  <button onClick={() => setActiveTab("fish")} className={`pb-3 px-4 font-bold text-sm transition-all border-b-2 ${activeTab === "fish" ? "border-cyan-400 text-cyan-400" : "border-transparent text-white/50 hover:text-white"}`}>
                      🐟 Avatar
                  </button>
                  <button onClick={() => setActiveTab("color")} className={`pb-3 px-4 font-bold text-sm transition-all border-b-2 ${activeTab === "color" ? "border-cyan-400 text-cyan-400" : "border-transparent text-white/50 hover:text-white"}`}>
                      🎨 Namensfarbe
                  </button>
              </div>

              {/* TAB 1: FISCHE */}
              {activeTab === "fish" && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {ALL_FISHES.map(f => {
                          const isActive = userFish === f.id;
                          
                          // Rollen-Restriktionen laden
                          const reqs = fishRequirements[f.id] || [];
                          
                          const isLockedByAch = f.reqAchievement && !claimedAchievements.includes(f.reqAchievement);
                          // (Optional: Hier könntest du auch checken, ob der User wirklich Mod/Sub ist und ihn sonst sperren.
                          // Aktuell zeigen wir nur die Badges an.)

                          return (
                              <button 
                                  key={f.id}
                                  onClick={() => !isLockedByAch && saveUserSetting("selectedFish", f.id)}
                                  disabled={isLockedByAch}
                                  className={`relative p-4 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-300 group
                                      ${isActive 
                                          ? "bg-cyan-500/20 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-105" 
                                          : isLockedByAch 
                                              ? "bg-black/20 border border-white/5 opacity-50 grayscale cursor-not-allowed"
                                              : "bg-[#18181b] border-2 border-transparent hover:bg-white/5 hover:border-white/10"
                                      }
                                  `}
                              >
                                  {/* ROLLE BADGES - WIEDER EINGEFÜGT! */}
                                  <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                                      {reqs.includes("mod") && (
                                          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 text-[10px] font-black px-1.5 rounded uppercase backdrop-blur-sm">
                                              MOD
                                          </span>
                                      )}
                                      {reqs.includes("vip") && (
                                          <span className="bg-pink-500/20 text-pink-400 border border-pink-500/50 text-[10px] font-black px-1.5 rounded uppercase backdrop-blur-sm">
                                              VIP
                                          </span>
                                      )}
                                      {reqs.includes("sub") && (
                                          <span className="bg-purple-500/20 text-purple-400 border border-purple-500/50 text-[10px] font-black px-1.5 rounded uppercase backdrop-blur-sm">
                                              SUB
                                          </span>
                                      )}
                                  </div>

                                  {isLockedByAch && (
                                      <div className="absolute top-2 right-2 text-red-400"><Lock size={14}/></div>
                                  )}
                                  
                                  <div className={`w-16 h-16 ${isActive ? "scale-110" : ""}`}>
                                      <img src={f.img} alt={f.name} className="w-full h-full object-contain drop-shadow-lg" />
                                  </div>
                                  <span className="text-sm font-bold text-white/80">{f.name}</span>
                              </button>
                          );
                      })}
                  </div>
              )}

              {/* TAB 2: FARBEN */}
              {activeTab === "color" && (
                  <div className="space-y-6">
                      <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 items-start">
                          <Zap className="text-blue-400 shrink-0 mt-1" size={20} />
                          <div className="text-sm text-blue-200">
                              <p className="font-bold mb-1">So schaltest du Farben frei:</p>
                              <p className="opacity-70">Sammle Kartenpacks, vervollständige Sets und hole dir <strong>Achievements</strong> im Karten-Bereich ab. Jedes Achievement kann exklusive Farben freischalten!</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {ALL_COLORS.map(c => {
                              const isActive = userColor === c.id;
                              const isLocked = c.reqAchievement && !claimedAchievements.includes(c.reqAchievement);

                              return (
                                  <button 
                                      key={c.id}
                                      onClick={() => !isLocked && saveUserSetting("selectedColor", c.id)}
                                      disabled={isLocked}
                                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                                          isActive 
                                            ? "border-cyan-400 bg-cyan-500/10" 
                                            : isLocked 
                                                ? "border-white/5 bg-black/20 opacity-60 cursor-not-allowed" 
                                                : "border-white/10 bg-[#18181b] hover:border-white/20"
                                      }`}
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-black/40 border border-white/10`}>
                                              <Palette size={18} className={isActive ? "text-cyan-400" : "text-white/30"} />
                                          </div>
                                          <div className="text-left">
                                              {/* VORSCHAU DER FARBE */}
                                              <div className={`font-bold text-lg ${c.class}`}>
                                                  {user.display_name || "DeinName"}
                                              </div>
                                              <div className="text-xs text-white/40 font-mono mt-0.5">{c.name}</div>
                                          </div>
                                      </div>

                                      {isLocked ? (
                                          <div className="text-red-400 bg-red-500/10 p-1.5 rounded-lg" title="Gesperrt">
                                              <Lock size={16} />
                                          </div>
                                      ) : isActive && (
                                          <div className="text-cyan-400 bg-cyan-500/10 p-1.5 rounded-lg">
                                              <Check size={16} strokeWidth={4} />
                                          </div>
                                      )}
                                  </button>
                              );
                          })}
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* ADMIN KONFIGURATION */}
      {isAdmin && showConfig && (
          <div className="bg-[#18181b] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl animate-in fade-in slide-in-from-top-4">
            
            {/* Header & Aktionen */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-white/5 pb-6">
                <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                    <Sliders size={20} /> Overlay Einstellungen
                </h2>
                <div className="flex gap-2">
                    <button onClick={saveAdminConfig} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all text-sm">
                        {success ? <Check size={16} /> : <Save size={16} />} {saving ? "Speichert..." : "Speichern"}
                    </button>
                    <button onClick={triggerReload} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all text-sm">
                        <RefreshCw size={16} /> Neuladen
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto gap-2 mb-6 hide-scrollbar">
                {[
                    { id: "water", label: "Wasser & Fische", icon: Waves },
                    { id: "deco", label: "Dekorationen", icon: ImageIcon },
                    { id: "events", label: "Events", icon: Zap },
                    { id: "roles", label: "Freischaltungen", icon: Lock },
                    { id: "exclude", label: "Bots ausblenden", icon: Shield }
                ].map(tab => (
                    <button 
                        key={tab.id} onClick={() => setSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap transition-colors ${subTab === tab.id ? "bg-cyan-500/20 text-cyan-400" : "text-white/50 hover:bg-white/5 hover:text-white"}`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Contents */}
            <div className="min-h-[300px]">
                {/* 1. WASSER & FISCHE */}
                {subTab === "water" && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Wasser Position</label>
                                    <select className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none" value={waterSettings.position} onChange={(e) => setWaterSettings({...waterSettings, position: e.target.value})}>
                                        <option value="bottom">Unten (Boden)</option>
                                        <option value="top">Oben (Decke)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Wasser Höhe ({waterSettings.height}%)</label>
                                    <input type="range" min="5" max="100" className="w-full accent-cyan-500" value={waterSettings.height} onChange={(e) => setWaterSettings({...waterSettings, height: parseInt(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Transparenz ({(waterSettings.opacity * 100).toFixed(0)}%)</label>
                                    <input type="range" min="0" max="1" step="0.05" className="w-full accent-cyan-500" value={waterSettings.opacity} onChange={(e) => setWaterSettings({...waterSettings, opacity: parseFloat(e.target.value)})} />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Wellen Intensität ({waterSettings.waveIntensity})</label>
                                    <input type="range" min="0" max="5" step="0.1" className="w-full accent-cyan-500" value={waterSettings.waveIntensity} onChange={(e) => setWaterSettings({...waterSettings, waveIntensity: parseFloat(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Fisch Skalierung ({waterSettings.fishScale}x)</label>
                                    <input type="range" min="0.5" max="3" step="0.1" className="w-full accent-cyan-500" value={waterSettings.fishScale} onChange={(e) => setWaterSettings({...waterSettings, fishScale: parseFloat(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2">Wasser Farbe</label>
                                    <div className="flex items-center gap-3">
                                        <input type="color" className="h-10 w-20 rounded cursor-pointer bg-transparent border-0" value={waterSettings.color} onChange={(e) => setWaterSettings({...waterSettings, color: e.target.value})} />
                                        <span className="text-mono text-sm text-white/50 uppercase">{waterSettings.color}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. DEKORATIONEN */}
                {subTab === "deco" && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                                    <div className="font-bold text-white flex items-center gap-2"><ImageIcon size={18} className="text-cyan-400"/> Dekorationen anzeigen</div>
                                    <Toggle checked={waterSettings.showDecorations} onChange={(v) => setWaterSettings({...waterSettings, showDecorations: v})} />
                                </div>
                                <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                                    <div className="font-bold text-white flex items-center gap-2"><Droplets size={18} className="text-blue-400"/> Blubberblasen</div>
                                    <Toggle checked={waterSettings.showBubbles} onChange={(v) => setWaterSettings({...waterSettings, showBubbles: v})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-white/70 mb-2 mt-4">Deko Skalierung ({waterSettings.decoScale}x)</label>
                                    <input type="range" min="0.5" max="3" step="0.1" className="w-full accent-cyan-500" value={waterSettings.decoScale} onChange={(e) => setWaterSettings({...waterSettings, decoScale: parseFloat(e.target.value)})} />
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-bold text-white/70">Aktive Objekte</label>
                                    <button onClick={() => setWaterSettings({...waterSettings, layoutSeed: Math.floor(Math.random() * 100000)})} className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors">
                                        <Shuffle size={12}/> Layout mischen
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: "seaweed_1", label: "Seetang (Groß)" },
                                        { id: "seaweed_2", label: "Seetang (Busch)" },
                                        { id: "rock_1", label: "Felsen 1" },
                                        { id: "rock_2", label: "Felsen 2" },
                                        { id: "ship", label: "Schiffswrack" },
                                    ].map(item => (
                                        <label key={item.id} className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer border transition-colors ${(waterSettings.activeDecorations || []).includes(item.id) ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-black/20 border-white/5 text-white/50"}`}>
                                            <input type="checkbox" className="hidden" checked={(waterSettings.activeDecorations || []).includes(item.id)} onChange={() => toggleDeco(item.id)} />
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${(waterSettings.activeDecorations || []).includes(item.id) ? "bg-cyan-500 border-cyan-500 text-black" : "border-white/30"}`}>
                                                {(waterSettings.activeDecorations || []).includes(item.id) && <Check size={12} strokeWidth={4} />}
                                            </div>
                                            <span className="text-sm font-bold">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. EVENTS */}
                {subTab === "events" && (
                    <div className="space-y-4 animate-in fade-in max-w-2xl">
                        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                            <div>
                                <div className="font-bold text-white flex items-center gap-2">🦈 Hai-Angriffe</div>
                                <p className="text-xs text-white/50 mt-1">Fische werden von Haien gefressen, wenn User den Chat verlassen (statt einfach zu verpuffen).</p>
                            </div>
                            <Toggle checked={waterSettings.sharkEnabled} onChange={(v) => setWaterSettings({...waterSettings, sharkEnabled: v})} />
                        </div>
                        
                        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                            <div>
                                <div className="font-bold text-white flex items-center gap-2"><Zap size={16} className="text-yellow-400"/> Hype-Train Party</div>
                                <p className="text-xs text-white/50 mt-1">Löst eine bunte Party im Teich aus, sobald ein Hype-Train startet.</p>
                            </div>
                            <Toggle checked={eventSettings.hypeTrain} onChange={(v) => setEventSettings({...eventSettings, hypeTrain: v})} />
                        </div>
                        
                        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                            <div>
                                <div className="font-bold text-white flex items-center gap-2"><UserX size={16} className="text-purple-400"/> Raid Swarm</div>
                                <p className="text-xs text-white/50 mt-1">Ein massiver Fischschwarm schwimmt durch das Bild, wenn ein Raid eingeht.</p>
                            </div>
                            <Toggle checked={eventSettings.raid} onChange={(v) => setEventSettings({...eventSettings, raid: v})} />
                        </div>
                    </div>
                )}

                {/* 4. FREISCHALTUNGEN / ROLLEN */}
                {subTab === "roles" && (
                    <div className="space-y-4 animate-in fade-in">
                        <p className="text-sm text-white/60 mb-4">
                            Lege fest, welche Rolle benötigt wird, um einen bestimmten Fisch im Stream zu erhalten. Wenn nichts ausgewählt ist, ist der Fisch für alle verfügbar.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {ALL_FISHES.map(f => {
                                const reqs = fishRequirements[f.id] || [];
                                const isSub = reqs.includes("sub");
                                const isVip = reqs.includes("vip");
                                const isMod = reqs.includes("mod");
                                
                                return (
                                    <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <img src={f.img} alt={f.name} className="w-10 h-10 object-contain drop-shadow-md" />
                                            <span className="font-bold text-sm">{f.name}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => toggleRequirement(f.id, "sub")} 
                                                className={`px-3 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${isSub ? 'bg-[#9146FF] text-white shadow-lg shadow-purple-900/40' : 'bg-black/30 text-white/40 hover:bg-white/10'}`}
                                            >
                                                Sub
                                            </button>
                                            <button 
                                                onClick={() => toggleRequirement(f.id, "vip")} 
                                                className={`px-3 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${isVip ? 'bg-pink-500 text-white shadow-lg shadow-pink-900/40' : 'bg-black/30 text-white/40 hover:bg-white/10'}`}
                                            >
                                                VIP
                                            </button>
                                            <button 
                                                onClick={() => toggleRequirement(f.id, "mod")} 
                                                className={`px-3 py-1.5 text-[10px] uppercase font-black rounded-lg transition-all ${isMod ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40' : 'bg-black/30 text-white/40 hover:bg-white/10'}`}
                                            >
                                                Mod
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 5. AUSSCHLÜSSE */}
                {subTab === "exclude" && (
                    <div className="space-y-4 animate-in fade-in">
                        <p className="text-sm text-white/60">
                            Gib hier die Namen von Chat-Bots ein (kommagetrennt), damit diese nicht als Fische im Teich auftauchen.
                        </p>
                        <textarea 
                            className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-cyan-500 focus:outline-none font-mono" 
                            value={excludedUsers} 
                            onChange={(e) => setExcludedUsers(e.target.value)} 
                            placeholder="StreamElements, Nightbot, Moobot..."
                        />
                    </div>
                )}
            </div>
          </div>
      )}
    </div>
  );
}