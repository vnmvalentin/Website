import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { Star, MessageSquare, User, Calendar } from "lucide-react";
import { io } from "socket.io-client"; // <--- IMPORT
import SEO from "../components/SEO";

// DEINE ID
const STREAMER_ID = "160224748"; 

const SECTIONS = ["overview", "adventures", "casino", "codes", "winchallenge", "bingo", "feedback"];

export default function AdminDashboard() {
  const { user, isLoading } = useContext(TwitchAuthContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  
  // Ref für Socket, damit wir nicht bei jedem Render neu verbinden
  const socketRef = useRef(null);

  // --- NEUE STATES FÜR CODES ---
  const [newCode, setNewCode] = useState({ 
      code: "", type: "credits", value: 0, maxUses: 10, expiresAt: "" 
  });
  const [isUnlimited, setIsUnlimited] = useState(false);

  // --- SICHERHEITS-CHECK ---
  useEffect(() => {
    if (isLoading) return;
    if (!user || String(user.id) !== STREAMER_ID) {
        navigate("/"); 
    }
  }, [user, isLoading, navigate]);

  // Daten laden Funktion
  const fetchData = async (type) => {
      // Kleiner Schutz: Nicht laden, wenn gerade schon geladen wird, außer es ist ein Refetch im Hintergrund
      // Aber für Admin Dashboard ist es okay, kurz zu flackern oder setFetchLoading wegzulassen für Silent Updates.
      // Wir lassen setFetchLoading hier für initiale Loads, aber könnten es optimieren.
      
      try {
          let url = `/api/admin/data/${type}`;
          if (type === "codes") url = "/api/promo/list";
          if (type === "stats") url = "/api/admin/stats";
          if (type === "feedback") url = "/api/feedback/ytm";

          const res = await fetch(url);
          const json = await res.json();
          setData(json);
      } catch(e) { console.error(e); }
  };

  // Initial Fetch bei Tab-Wechsel
  useEffect(() => {
      const keyMap = {
          "overview": "stats",
          "adventures": "adventure",
          "casino": "casino",
          "winchallenge": "winchallenge",
          "bingo": "bingo",
          "codes": "codes",
          "feedback": "feedback"
      };
      
      if (keyMap[activeTab]) {
          setFetchLoading(true);
          fetchData(keyMap[activeTab]).then(() => setFetchLoading(false));
      }
  }, [activeTab]);

  // --- SOCKET IO INTEGRATION (NEU) ---
  useEffect(() => {
      // Verbindung aufbauen
      socketRef.current = io("https://vnmvalentin.de", { // Oder deine URL dynamisch
          path: "/socket.io",
          withCredentials: true
      });

      const socket = socketRef.current;

      socket.on("connect", () => {
          // Wir treten dem Streamer-Raum bei, damit wir Events bekommen
          socket.emit("join_room", `streamer:${STREAMER_ID}`);
          console.log("Admin Socket connected");
      });

      // HIER KOMMT DAS UPDATE VOM SERVER
      socket.on("admin_data_changed", (updatedTypes) => {
          // updatedTypes ist z.B. ["codes", "stats"]
          console.log("Update received:", updatedTypes);

          // Mapping von Tab-Namen zu API-Typen
           const keyMap = {
              "overview": "stats",
              "adventures": "adventure",
              "casino": "casino",
              "winchallenge": "winchallenge",
              "bingo": "bingo",
              "codes": "codes",
              "feedback": "feedback"
          };

          const currentApiType = keyMap[activeTab];

          // Wenn der aktuelle Tab von den Änderungen betroffen ist -> Silent Reload
          if (updatedTypes.includes(currentApiType)) {
              fetchData(currentApiType);
          }
      });

      return () => {
          socket.disconnect();
      };
  }, [activeTab]); // Dependency auf activeTab, damit der Listener den aktuellen Tab kennt (oder via Ref lösen)


  // --- ACTIONS (Angepasst: Kein manuelles fetchData mehr nötig, da Socket triggert!) ---
  // Aber: FetchData kann zur Sicherheit drin bleiben, falls Socket mal hängt.
  // Ich lasse fetchData drin für sofortiges Feedback, Socket fängt dann Cross-Device Updates.

  const createCode = async () => {
      const payload = {
          ...newCode,
          maxUses: isUnlimited ? -1 : parseInt(newCode.maxUses)
      };
      await fetch("/api/promo/create", {
          method: "POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(payload)
      });
      // Reset Form
      setNewCode({ code: "", type: "credits", value: 0, maxUses: 10, expiresAt: "" });
      setIsUnlimited(false);
      // fetchData("codes"); // <-- Nicht mehr zwingend nötig, da Server Event sendet, aber schadet nicht für Latenz.
      fetchData("codes"); 
  };

  const deleteCode = async (code) => {
      if(!window.confirm("Code löschen?")) return;
      await fetch(`/api/promo/${code}`, { method: "DELETE" });
      // fetchData wird durch Socket getriggert
      fetchData("codes");
  };

  const updateUser = async (id, changes) => {
      await fetch("/api/admin/update/user", {
          method: "POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ targetId: id, changes })
      });
      // fetchData wird durch Socket getriggert
  };
  
  const deleteItem = async (type, id) => {
      if(!window.confirm("Wirklich löschen?")) return;
      
      let url = `/api/admin/${type}/${id}`;
      if (type === "winchallenge") url = `/api/winchallenge/${id}`;

      await fetch(url, { method: "DELETE" });
      
      // Kleiner Timeout nicht mehr nötig, Server sendet wenn fertig
      setTimeout(() => {
          if(activeTab === "winchallenge") fetchData("winchallenge");
          if(activeTab === "bingo") fetchData("bingo");
      }, 200);
  };

  // --- RENDER HELPERS ---

  if (isLoading || !user || String(user.id) !== STREAMER_ID) {
      return <div className="min-h-screen flex items-center justify-center text-gray-500">Checking permissions...</div>;
  }

  const renderContent = () => {
      if (fetchLoading) return <div className="p-8 text-center animate-pulse text-purple-400 font-bold">Lade Daten aus der Datenbank...</div>;
      
      // FIX: Wenn Data null ist, aber wir im Overview sind, versuche neu zu laden oder zeige Fehler
      if (!data && activeTab === "overview") return <div className="p-8 text-center text-red-400">Keine Statistik-Daten empfangen. (Backend prüfen)</div>;
      
      if (!data) return <div className="p-8 text-center text-gray-500">Wähle einen Bereich</div>;

      // FILTER
      let entries = Object.entries(data);
      if (search) {
          const s = search.toLowerCase();
          entries = entries.filter(([id, val]) => 
              id.toLowerCase().includes(s) || 
              (val.name && val.name.toLowerCase().includes(s)) ||
              (val.twitchLogin && val.twitchLogin.toLowerCase().includes(s))
          );
      }
      // 0. FEEDBACK TAB (NEU)
      if (activeTab === "feedback") {
          const feedbacks = Array.isArray(data) ? data : [];
          // Optionaler Search Filter für Feedback
          const filteredFeedbacks = search 
            ? feedbacks.filter(f => f.user.toLowerCase().includes(search.toLowerCase()) || f.text.toLowerCase().includes(search.toLowerCase()))
            : feedbacks;

          return (
              <div className="space-y-4">
                  <div className="flex gap-4 mb-4">
                      <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                          <span className="text-gray-400 text-xs uppercase font-bold">Total</span>
                          <span className="text-xl font-bold text-white">{feedbacks.length}</span>
                      </div>
                      <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                          <span className="text-gray-400 text-xs uppercase font-bold">Ø Rating</span>
                          <span className="text-xl font-bold text-yellow-400">
                              {feedbacks.length > 0 ? (feedbacks.reduce((a,b) => a + b.rating, 0) / feedbacks.length).toFixed(1) : "0.0"}
                          </span>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredFeedbacks.map((item) => (
                          <div key={item.id} className="bg-[#18181b] border border-white/10 p-4 rounded-xl flex flex-col gap-3 relative group">
                              <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50">
                                          <User size={14} />
                                      </div>
                                      <div>
                                          <div className="font-bold text-sm text-white">{item.user}</div>
                                          <div className="text-[10px] text-white/40 flex items-center gap-1">
                                              <Calendar size={10} />
                                              {new Date(item.date).toLocaleString("de-DE")}
                                          </div>
                                      </div>
                                  </div>
                                  <div className="flex gap-0.5 bg-black/20 px-2 py-1 rounded-lg">
                                      <span className="text-yellow-400 font-bold">{item.rating}</span>
                                      <Star size={14} className="text-yellow-400 fill-current" />
                                  </div>
                              </div>
                              {item.text ? (
                                  <div className="bg-black/20 p-3 rounded-lg text-sm text-white/80 italic border border-white/5">
                                      "{item.text}"
                                  </div>
                              ) : (
                                  <div className="text-xs text-white/20 italic pl-1">Kein Kommentar.</div>
                              )}
                          </div>
                      ))}
                      {filteredFeedbacks.length === 0 && <div className="col-span-full text-center text-gray-500 py-10">Kein Feedback gefunden.</div>}
                  </div>
              </div>
          );
      }
      // 0. OVERVIEW (STATS)
      if (activeTab === "overview") {
          // Falls data noch null ist (beim ersten Render), kurz warten
          if (!data) return null;

          return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* CREDITS CARD */}
                  <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-600/10 p-6 rounded-2xl border border-yellow-500/20">
                      <div className="text-yellow-500 text-sm font-bold uppercase tracking-wider mb-2">Total Credits</div>
                      <div className="text-4xl font-black text-white flex items-center gap-2">
                          {data.totalCredits?.toLocaleString()} 
                          <span className="text-2xl">🪙</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-2">Im Umlauf bei allen Usern</div>
                  </div>

                  {/* USER CARD */}
                  <div className="bg-gradient-to-br from-blue-900/40 to-blue-600/10 p-6 rounded-2xl border border-blue-500/20">
                      <div className="text-blue-500 text-sm font-bold uppercase tracking-wider mb-2">Casino User</div>
                      <div className="text-4xl font-black text-white">
                          {data.totalUsers}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">Registrierte Datenbank-Einträge</div>
                  </div>

                  {/* ADVENTURE CARD */}
                  <div className="bg-gradient-to-br from-green-900/40 to-green-600/10 p-6 rounded-2xl border border-green-500/20">
                      <div className="text-green-500 text-sm font-bold uppercase tracking-wider mb-2">Adventure Spieler</div>
                      <div className="text-4xl font-black text-white">
                          {data.advPlayers}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">Haben das RPG gestartet</div>
                  </div>

                  {/* ACTIVE ITEMS */}
                  <div className="bg-gray-800 p-6 rounded-2xl border border-white/5">
                      <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">Aktive Bingos</div>
                      <div className="text-3xl font-bold text-white">{data.activeBingoSessions}</div>
                  </div>

                  <div className="bg-gray-800 p-6 rounded-2xl border border-white/5">
                      <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">Win-Challenges</div>
                      <div className="text-3xl font-bold text-white">{data.activeChallenges}</div>
                  </div>

                  <div className="bg-gray-800 p-6 rounded-2xl border border-white/5">
                      <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">Aktive Promo-Codes</div>
                      <div className="text-3xl font-bold text-white">{data.activeCodes}</div>
                  </div>
              </div>
          );
      }

      // 1. CODES TAB (Aktualisiert)
      if (activeTab === "codes") {
          return (
              <div className="space-y-6">
                  {/* ERSTELLEN FORMULAR */}
                  <div className="bg-gray-800 p-4 rounded-xl border border-white/10 flex flex-wrap gap-4 items-end">
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">Code (leer = auto)</label>
                          <input className="block bg-black/50 p-2 rounded border border-white/10 w-32" value={newCode.code} onChange={e=>setNewCode({...newCode, code: e.target.value})} placeholder="AUTO" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">Typ</label>
                          <select className="block bg-black/50 p-2 rounded border border-white/10" value={newCode.type} onChange={e=>setNewCode({...newCode, type: e.target.value})}>
                              <option value="credits">Credits</option>
                              <option value="skin">Skin</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">Wert/SkinID</label>
                          <input className="block bg-black/50 p-2 rounded border border-white/10 w-24" value={newCode.value} onChange={e=>setNewCode({...newCode, value: e.target.value})} />
                      </div>
                      
                      {/* ANZAHL & UNBEGRENZT */}
                      <div className="flex items-center gap-2">
                          {!isUnlimited ? (
                              <div>
                                  <label className="text-xs text-gray-400 block mb-1">Anzahl</label>
                                  <input type="number" className="block bg-black/50 p-2 rounded border border-white/10 w-20" value={newCode.maxUses} onChange={e=>setNewCode({...newCode, maxUses: e.target.value})} />
                              </div>
                          ) : (
                             <div className="h-[58px] flex items-end pb-3 px-2">
                                 <span className="text-2xl font-bold text-green-400">∞</span>
                             </div>
                          )}
                          <div className="h-[58px] flex items-end pb-3">
                              <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input type="checkbox" checked={isUnlimited} onChange={e => setIsUnlimited(e.target.checked)} className="accent-purple-500" />
                                  <span className="text-xs text-gray-400">Unbegrenzt</span>
                              </label>
                          </div>
                      </div>

                      {/* DATUM */}
                      <div>
                          <label className="text-xs text-gray-400 block mb-1">Ablauf (Optional)</label>
                          <input 
                              type="datetime-local" 
                              className="block bg-black/50 p-2 rounded border border-white/10 text-xs" 
                              value={newCode.expiresAt} 
                              onChange={e=>setNewCode({...newCode, expiresAt: e.target.value})} 
                          />
                      </div>

                      <button onClick={createCode} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-bold h-[38px] mb-[1px]">Erstellen</button>
                  </div>
                  
                  {/* LISTE */}
                  <div className="grid gap-2">
                      {entries.map(([code, info]) => {
                          const isExpired = info.expiresAt && Date.now() > info.expiresAt;
                          const isInfinity = info.maxUses === -1;
                          const usedCount = info.usedBy?.length || 0;
                          
                          return (
                              <div key={code} className={`p-3 rounded flex justify-between items-center border border-white/5 ${isExpired ? 'bg-red-900/10 opacity-60' : 'bg-white/5'}`}>
                                  <div className="flex items-center gap-4">
                                      <div className="w-32">
                                          <span className="font-mono text-yellow-400 font-bold text-lg">{code}</span>
                                          {isExpired && <span className="ml-2 text-red-500 text-xs font-bold">ABGELAUFEN</span>}
                                      </div>
                                      
                                      <div className="w-40 text-sm text-gray-300">
                                          <span className="uppercase text-xs text-gray-500 block">Reward</span>
                                          {info.type === "credits" ? `💰 ${info.value}` : `🎨 ${info.value}`}
                                      </div>

                                      <div className="w-32 text-sm text-gray-300">
                                          <span className="uppercase text-xs text-gray-500 block">Genutzt</span>
                                          <span className={usedCount >= info.maxUses && !isInfinity ? "text-red-400" : "text-green-400"}>
                                              {usedCount} / {isInfinity ? "∞" : info.maxUses}
                                          </span>
                                      </div>

                                      <div className="text-sm text-gray-300">
                                          <span className="uppercase text-xs text-gray-500 block">Läuft ab</span>
                                          {info.expiresAt ? new Date(info.expiresAt).toLocaleString() : "Nie"}
                                      </div>
                                  </div>
                                  <button onClick={() => deleteCode(code)} className="text-red-500 hover:text-red-400 bg-black/30 hover:bg-black/50 p-2 rounded">🗑️</button>
                              </div>
                          );
                      })}
                      {entries.length === 0 && <p className="text-center text-gray-500 italic py-8">Keine Codes vorhanden.</p>}
                  </div>
              </div>
          );
      }

      // 2. ADVENTURES & CASINO (User List Editor)
      if (activeTab === "adventures" || activeTab === "casino") {
          return (
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-white/10 text-xs uppercase">
                          <tr>
                              <th className="p-3">User</th>
                              <th className="p-3">Credits (Casino)</th>
                              {activeTab === "adventures" && (
                                  <>
                                      <th className="p-3">Highscore</th>
                                      <th className="p-3">Skins</th>
                                      <th className="p-3">Slots</th>
                                  </>
                              )}
                              <th className="p-3">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                          {entries.map(([id, user]) => (
                              <tr key={id} className="hover:bg-white/5">
                                  <td className="p-3 font-mono text-xs text-gray-400">
                                      <div className="text-white font-bold text-sm">{user.name || user.twitchLogin || "Unknown"}</div>
                                      {id}
                                  </td>
                                  <td className="p-3">
                                      <input 
                                          type="number" 
                                          defaultValue={user.credits}
                                          onBlur={(e) => updateUser(id, { credits: e.target.value })}
                                          className="w-24 bg-black/30 border border-white/10 rounded px-2 py-1"
                                      />
                                  </td>
                                  {activeTab === "adventures" && (
                                    <>
                                        <td className="p-3">
                                          <input 
                                              type="number" 
                                              defaultValue={user.highScore}
                                              onBlur={(e) => updateUser(id, { highScore: e.target.value })}
                                              className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1"
                                          />
                                        </td>
                                        <td className="p-3 max-w-xs truncate text-xs text-gray-400">
                                            {user.skins?.join(", ")}
                                            <button 
                                                onClick={() => {
                                                    const newSkins = prompt("Skins (kommagetrennt):", user.skins?.join(","));
                                                    if(newSkins !== null) updateUser(id, { skins: newSkins.split(",").map(s=>s.trim()) });
                                                }}
                                                className="ml-2 text-blue-400"
                                            >✎</button>
                                        </td>
                                        <td className="p-3">
                                            <input 
                                              type="number" 
                                              defaultValue={user.unlockedSlots}
                                              onBlur={(e) => updateUser(id, { unlockedSlots: e.target.value })}
                                              className="w-12 bg-black/30 border border-white/10 rounded px-2 py-1"
                                          />
                                        </td>
                                    </>
                                  )}
                                  <td className="p-3">
                                      {/* Platzhalter für Reset Logik falls gewünscht */}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          );
      }
      
      if (activeTab === "winchallenge" || activeTab === "bingo") {
          return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {entries.map(([id, item]) => {
                       // Logik für den Anzeigenamen
                       let displayName = "Unknown";
                       
                       // Fall 1: WinChallenge (HostName existiert direkt)
                       if (item.hostName) displayName = item.hostName;
                       // Fall 2: Bingo (Host ist ein Objekt mit twitchLogin)
                       else if (item.host?.twitchLogin) displayName = item.host.twitchLogin;
                       // Fall 3: Fallback auf ID
                       else displayName = item.userId || item.host?.twitchId || id;

                       return (
                           <div key={id} className="bg-gray-800 p-4 rounded-xl border border-white/10 relative group">
                               <h3 className="font-bold text-lg mb-1 text-white">
                                   {item.title || item.theme?.name || "Unbenannt"}
                               </h3>
                               
                               <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
                                   <span className="uppercase font-bold text-gray-600">Host:</span>
                                   
                                   {/* --- HIER IST DIE ÄNDERUNG: LINK STATT SPAN --- */}
                                   <a 
                                       href={`https://twitch.tv/${displayName}`}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="text-purple-400 font-bold bg-purple-900/20 px-2 py-0.5 rounded hover:bg-purple-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                                       title={`Gehe zu twitch.tv/${displayName}`}
                                   >
                                       {displayName}
                                       {/* Optional: Kleines Icon für externen Link */}
                                       <span className="text-[10px] opacity-50">↗</span>
                                   </a>
                                   {/* --------------------------------------------- */}
                               </div>

                               <pre className="text-[10px] bg-black/50 p-2 rounded overflow-hidden text-gray-500 mb-4 font-mono select-all">
                                   ID: {id}
                               </pre>
                               
                               <button 
                                  onClick={() => deleteItem(activeTab, id)}
                                  className="w-full bg-red-900/20 hover:bg-red-900/80 text-red-400 hover:text-white border border-red-900/50 py-2 rounded text-sm transition-all"
                               >
                                   Löschen
                               </button>
                           </div>
                       );
                   })}
                   
                   {entries.length === 0 && (
                       <div className="col-span-full text-center text-gray-500 italic py-10">
                           Keine Einträge gefunden.
                       </div>
                   )}
              </div>
          );
      }

      return null; // Fallback, falls gar kein Tab passt (sollte nicht passieren)
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
        <SEO title = "Admin"/>
      <h1 className="text-3xl font-black italic mb-8">ADMIN DASHBOARD</h1>
      
      {/* TABS */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-white/10 pb-4">
          {SECTIONS.map(tab => (
              <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                      activeTab === tab ? "bg-purple-600 text-white shadow-lg shadow-purple-900/50" : "bg-white/5 hover:bg-white/10 text-gray-400"
                  }`}
              >
                  {tab}
              </button>
          ))}
      </div>

      {/* SEARCH */}
      {activeTab !== "codes" && (
          <div className="mb-6">
              <input 
                  type="text" 
                  placeholder="Suche nach User, ID..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full md:w-96 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none"
              />
          </div>
      )}

      {/* CONTENT */}
      <div className="bg-gray-900/50 border border-white/10 rounded-2xl p-6 min-h-[500px]">
          {renderContent()}
      </div>
    </div>
  );
}