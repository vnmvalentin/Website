import React, { useState, useEffect } from "react";
import CoinIcon from "../components/CoinIcon"; 
import { Trophy, History, FileText, Shield, Award } from "lucide-react";
// NEU: Importiere die Patchnotes und das Badge Dictionary
import { patchNotes, BADGE_DICTIONARY } from "../utils/patchNotes";

const TABS = [
  { id: "current", label: "Aktuelle Saison", icon: <Trophy size={16} /> },
  { id: "past", label: "Hall of Fame", icon: <History size={16} /> },
  { id: "patchnotes", label: "Patch Notes", icon: <FileText size={16} /> }
];

const BadgeFlex = ({ userBadges }) => {
    if (!userBadges || userBadges.length === 0) return null;

    return (
        <div className="flex items-center gap-1.5 ml-3">
            {userBadges.map((badgeId, idx) => {
                const badgeInfo = BADGE_DICTIONARY[badgeId];
                if (!badgeInfo) return null; // Unbekanntes Badge überspringen

                return (
                    <div key={idx} className="relative group cursor-help flex items-center justify-center">
                        
                        {/* BILD ODER EMOJI RENDERN */}
                        {badgeInfo.image ? (
                            <img 
                                src={badgeInfo.image} 
                                alt={badgeInfo.description}
                                // Hier stellst du die Größe der Badges ein (w-6 h-6 ist ca 24x24px)
                                className="w-6 h-6 object-contain drop-shadow-md hover:scale-110 transition-transform duration-200" 
                            />
                        ) : (
                            <span className="text-base bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 shadow-sm hover:bg-white/10 transition-colors">
                                {badgeInfo.icon}
                            </span>
                        )}

                        {/* TOOLTIP (bleibt gleich) */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-3 py-1.5 bg-[#202028] border border-white/10 text-xs text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                            {badgeInfo.description}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#202028]"></div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default function Season() {
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState("");
  const [activeTab, setActiveTab] = useState("current");


  useEffect(() => {
    const fetchData = async () => {
      try {
        // Lade aktuelle Season
        const currentRes = await fetch("/api/seasons/current");
        if (currentRes.ok) setData(await currentRes.json());

        // Lade Historie
        const historyRes = await fetch("/api/seasons/history");
        if (historyRes.ok) setHistoryData(await historyRes.json());

      } catch (e) {
        console.error("Fehler beim Laden", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Timer Logik
  useEffect(() => {
    if (!data?.endsAt) return;

    const interval = setInterval(() => {
      const diff = data.endsAt - Date.now();
      if (diff <= 0) {
        setTimeLeft("BEENDET");
        clearInterval(interval);
        return;
      }
      
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      
      setTimeLeft(`${d}T ${h}h ${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [data?.endsAt]);

  if (loading) {
    return <div className="flex justify-center mt-20 text-gray-500 animate-pulse font-medium">Lade Season Daten...</div>;
  }

  if (!data) return <div className="text-red-400 text-center mt-10 bg-red-900/10 p-4 rounded-xl inline-block border border-red-500/20">Fehler beim Laden der Daten.</div>;

  const topCoins = [...data.players].sort((a, b) => b.credits - a.credits).slice(0, 10);
  const topAdventure = [...data.players].sort((a, b) => b.adventureMaxStage - a.adventureMaxStage).slice(0, 10);
  const topCards = [...data.players].sort((a, b) => b.uniqueCards - a.uniqueCards).slice(0, 10);

  const getRankBadge = (index) => {
    if (index === 0) return <span className="text-xl text-yellow-400 font-black w-6 text-center">1.</span>;
    if (index === 1) return <span className="text-xl text-gray-300 font-bold w-6 text-center">2.</span>;
    if (index === 2) return <span className="text-xl text-amber-700 font-bold w-6 text-center">3.</span>;
    return <span className="text-gray-600 font-mono w-6 inline-block text-center text-sm">{index + 1}.</span>;
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-wider text-white mb-2">
                {data.seasonName}
            </h1>
            <div className="text-gray-400 text-sm">
                Sammle Credits, besiege Monster und vervollständige dein Deck.
            </div>
          </div>
          
          <div className="bg-[#18181b] border border-white/10 px-6 py-3 rounded-xl flex items-center gap-4 min-w-[200px] justify-between">
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Endet in</span>
            <span className="font-mono text-cyan-400 font-bold">
                {timeLeft || "Berechne..."}
            </span>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-white/5 pb-4">
          {TABS.map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                      activeTab === tab.id 
                      ? "bg-white text-black shadow-lg" 
                      : "bg-[#18181b] hover:bg-white/10 text-gray-400 border border-white/5"
                  }`}
              >
                  {tab.icon} {tab.label}
              </button>
          ))}
      </div>

      {/* --- TAB CONTENT: CURRENT SEASON --- */}
      {activeTab === "current" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="bg-[#18181b] border border-white/5 rounded-2xl p-6">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <CoinIcon className="w-4 h-4" /> Top Credits
                </h2>
                <div className="space-y-1">
                    {topCoins.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2">
                            {getRankBadge(i)}
                            <span className={`text-sm ${i < 3 ? 'text-white font-bold' : 'text-gray-400'}`}>{p.name}</span>
                            {/* HIER FLEXEN WIR DIE BADGES */}
                            <BadgeFlex userBadges={p.badges} />
                        </div>
                        <div className="font-mono text-sm text-yellow-400/90">
                            {p.credits.toLocaleString("de-DE")}
                        </div>
                    </div>
                    ))}
                </div>
            </div>

            <div className="bg-[#18181b] border border-white/5 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Shield size={16} /> RPG Stages
            </h2>
            <div className="space-y-1">
                {topAdventure.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                    {getRankBadge(i)}
                    <span className={`text-sm ${i < 3 ? 'text-white font-bold' : 'text-gray-400'}`}>{p.name}</span>
                        <BadgeFlex userBadges={p.badges} />
                    </div>
                    <div className="font-mono text-sm text-red-400/90">
                        Stage {p.adventureMaxStage}
                    </div>
                </div>
                ))}
            </div>
            </div>

            <div className="bg-[#18181b] border border-white/5 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Award size={16} /> Card Deck
            </h2>
            <div className="space-y-1">
                {topCards.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                    {getRankBadge(i)}
                    <span className={`text-sm ${i < 3 ? 'text-white font-bold' : 'text-gray-400'}`}>{p.name}</span>
                        <BadgeFlex userBadges={p.badges} />
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="font-mono text-sm text-purple-400/90">
                            {p.uniqueCards} / {data.totalCards}
                        </div>
                    </div>
                </div>
                ))}
            </div>
            </div>

        </div>
      )}

      {/* --- TAB CONTENT: HALL OF FAME (PAST) --- */}
      {activeTab === "past" && (
          <div className="space-y-12 animate-in fade-in">
              {historyData.length === 0 ? (
                  <div className="text-center text-gray-500 py-10">Noch keine vergangenen Seasons vorhanden.</div>
              ) : (
                  historyData.map((season, idx) => (
                      <div key={idx} className="bg-[#18181b] border border-white/5 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                          
                          {/* Season Header */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 border-b border-white/5 pb-4 gap-4 relative z-10">
                              <h2 className="text-2xl font-black italic text-white uppercase tracking-wider flex items-center gap-3">
                                  <Trophy className="text-yellow-500" size={24} />
                                  {season.seasonName}
                              </h2>
                              <div className="text-sm text-gray-500 font-mono bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                                  Beendet am {new Date(season.endedAt).toLocaleDateString("de-DE")}
                              </div>
                          </div>

                          {/* Die 3 Kategorien */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                              
                              {/* TOP COINS */}
                              <div>
                                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <CoinIcon className="w-4 h-4" /> Top Credits
                                  </h3>
                                  <div className="space-y-2">
                                      {season.topCoins?.map((p, i) => (
                                          <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                                              <div className="flex items-center gap-3">
                                                  {getRankBadge(i)}
                                                  <span className="text-sm text-white font-bold truncate max-w-[100px] sm:max-w-[150px]">{p.name}</span>
                                              </div>
                                              <div className="font-mono text-sm text-yellow-400/90">
                                                  {p.credits?.toLocaleString("de-DE")}
                                              </div>
                                          </div>
                                      ))}
                                      {(!season.topCoins || season.topCoins.length === 0) && <div className="text-xs text-gray-600 italic">Keine Daten</div>}
                                  </div>
                              </div>

                              {/* TOP ADVENTURE */}
                              <div>
                                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <Shield size={16} /> RPG Stages
                                  </h3>
                                  <div className="space-y-2">
                                      {season.topAdventure?.map((p, i) => (
                                          <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                                              <div className="flex items-center gap-3">
                                                  {getRankBadge(i)}
                                                  <span className="text-sm text-white font-bold truncate max-w-[100px] sm:max-w-[150px]">{p.name}</span>
                                              </div>
                                              <div className="font-mono text-sm text-red-400/90">
                                                  Stage {p.stage}
                                              </div>
                                          </div>
                                      ))}
                                      {(!season.topAdventure || season.topAdventure.length === 0) && <div className="text-xs text-gray-600 italic">Keine Daten</div>}
                                  </div>
                              </div>

                              {/* TOP CARDS */}
                              <div>
                                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                      <Award size={16} /> Card Deck
                                  </h3>
                                  <div className="space-y-2">
                                      {season.topCards?.map((p, i) => (
                                          <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors">
                                              <div className="flex items-center gap-3">
                                                  {getRankBadge(i)}
                                                  <span className="text-sm text-white font-bold truncate max-w-[100px] sm:max-w-[150px]">{p.name}</span>
                                              </div>
                                              <div className="font-mono text-sm text-purple-400/90">
                                                  {p.uniqueCards} Karten
                                              </div>
                                          </div>
                                      ))}
                                      {(!season.topCards || season.topCards.length === 0) && <div className="text-xs text-gray-600 italic">Keine Daten</div>}
                                  </div>
                              </div>

                          </div>
                      </div>
                  ))
              )}
          </div>
      )}

      {/* --- TAB CONTENT: PATCH NOTES --- */}
      {activeTab === "patchnotes" && (
          <div className="max-w-3xl animate-in fade-in space-y-6">
              {patchNotes.map((note, idx) => (
                  <div key={idx} className="bg-[#18181b] border border-white/5 rounded-2xl p-6 md:p-8">
                      <div className="flex items-center gap-4 mb-6 border-b border-white/5 pb-4">
                          <span className="bg-white/10 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                              {note.version}
                          </span>
                          <h2 className="text-lg font-bold text-white">{note.title}</h2>
                          <span className="ml-auto text-xs text-gray-500 font-mono">{note.date}</span>
                      </div>
                      
                      <div className="space-y-6 text-sm text-gray-300">
                          {note.categories.map((cat, cIdx) => (
                              <div key={cIdx}>
                                  <h3 className="text-white font-bold mb-3">{cat.name}</h3>
                                  <ul className="list-disc list-inside space-y-2 ml-2 text-gray-400">
                                      {cat.changes.map((change, chIdx) => (
                                          <li key={chIdx}>{change}</li>
                                      ))}
                                  </ul>
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
          </div>
      )}

    </div>
  );
}