import React, { useState, useEffect, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import {
  Radio, Gamepad2, Eye, LayoutDashboard, Swords, Coins, Sprout, Ticket,
  Trophy, Grid3x3, Crown, Search, RefreshCw, Trash2, Pencil, ExternalLink,
  Plus, Infinity as InfinityIcon, Layers, Users, SlidersHorizontal,
} from "lucide-react";
import { io } from "socket.io-client";
import SEO from "../components/SEO";
import CardPresetAdminPanel from "./ClashRoyale/admin/CardPresetAdminPanel";
import GardenAdminPanel from "../components/GardenAdminPanel";

// DEINE ID
const STREAMER_ID = "160224748";

const SECTIONS = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "adventures", label: "adVentures", icon: Swords },
  { id: "casino", label: "Credits", icon: Coins },
  { id: "garden", label: "Virtual Farm", icon: Sprout },
  { id: "codes", label: "Promo-Codes", icon: Ticket },
  { id: "winchallenge", label: "Win-Challenges", icon: Trophy },
  { id: "bingo", label: "Bingo", icon: Grid3x3 },
  { id: "clashroyale", label: "Clash Royale", icon: Crown },
  { id: "broadcast", label: "Broadcast", icon: Radio },
];

// Sucht über alle gängigen Namens-/ID-Felder — vorher konnte man bei
// WinChallenge/Bingo nur über die rohe Twitch-ID suchen, weil deren
// Einträge "hostName"/"host.twitchLogin" statt "name"/"twitchLogin" nutzen.
function searchTextFor(id, val) {
  const parts = [
    id,
    val?.name,
    val?.twitchLogin,
    val?.twitchId,
    val?.userId,
    val?.hostName,
    val?.host?.name,
    val?.host?.twitchLogin,
    val?.host?.twitchId,
    val?.theme?.name,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export default function AdminDashboard() {
  const { user } = useContext(TwitchAuthContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  // --- BROADCAST STATES ---
  const [bcMessage, setBcMessage] = useState("");
  const [bcDuration, setBcDuration] = useState(15); // in Minuten
  const [bcType, setBcType] = useState("warning");
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Ref für Socket, damit wir nicht bei jedem Render neu verbinden
  const socketRef = useRef(null);

  const handleSendBroadcast = async () => {
      if (!bcMessage.trim()) return;
      setIsBroadcasting(true);
      try {
          const res = await fetch("/api/admin/broadcast", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  message: bcMessage,
                  duration: bcDuration,
                  type: bcType
              }),
              credentials: "include"
          });
          if (res.ok) {
              setBcMessage("");
              alert("Broadcast erfolgreich gesendet!");
          } else {
              alert("Fehler beim Senden des Broadcasts.");
          }
      } catch (e) {
          console.error(e);
      }
      setIsBroadcasting(false);
  };

  // --- NEUE STATES FÜR CODES ---
  const [newCode, setNewCode] = useState({
      code: "", type: "credits", value: 0, maxUses: 10, expiresAt: ""
  });
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [gardenUsers, setGardenUsers] = useState([]);
  const [gardenEditId, setGardenEditId] = useState(null);
  const [gardenEditGold, setGardenEditGold] = useState("");
  // Wessen Farm gerade im ausführlichen Admin-Menü offen ist ({ userId, name }).
  const [gardenDetail, setGardenDetail] = useState(null);
  const [clashLobbies, setClashLobbies] = useState([]);
  const [clashSubTab, setClashSubTab] = useState("lobbies"); // 'lobbies' | 'presets'
  // Follower-Zahlen der Win-Challenge-Streamer: twitchId → Anzahl (null = unbekannt).
  // Kommen von Twitch und laden deshalb getrennt von der Liste nach.
  const [wcFollowers, setWcFollowers] = useState({});
  const [wcFollowersLoading, setWcFollowersLoading] = useState(false);

  // --- SICHERHEITS-CHECK ---
  useEffect(() => {
    if (!user || String(user.id) !== STREAMER_ID) {
        navigate("/");
    }
  }, [user, navigate]);

  // Daten laden Funktion
  const fetchData = async (type) => {
      try {
          let url = `/api/admin/data/${type}`;
          if (type === "codes") url = "/api/promo/list";
          if (type === "stats") url = "/api/admin/stats";
          if (type === "garden") {
              const r = await fetch("/api/admin/garden/users", { credentials: "include" });
              const j = await r.json();
              setGardenUsers(j.users || []);
              return;
          }
          if (type === "clashroyale") {
              const r = await fetch("/api/clash/admin/lobbies", { credentials: "include" });
              const j = await r.json();
              setClashLobbies(Array.isArray(j) ? j : []);
              return;
          }
          const res = await fetch(url);
          const json = await res.json();
          setData(json);
      } catch(e) { console.error(e); }
  };

  // Follower nachladen. fresh=1 umgeht den 15-Minuten-Zwischenspeicher im Backend.
  const fetchWcFollowers = async (fresh = false) => {
      setWcFollowersLoading(true);
      try {
          const r = await fetch(`/api/admin/winchallenge/followers${fresh ? "?fresh=1" : ""}`, { credentials: "include" });
          const j = await r.json();
          setWcFollowers(j.followers || {});
      } catch(e) { console.error(e); }
      setWcFollowersLoading(false);
  };

  useEffect(() => {
      if (activeTab === "winchallenge") fetchWcFollowers();
  }, [activeTab]);

  // Initial Fetch bei Tab-Wechsel
  useEffect(() => {
      const keyMap = {
          "overview": "stats",
          "adventures": "adventure",
          "casino": "casino",
          "garden": "garden",
          "winchallenge": "winchallenge",
          "bingo": "bingo",
          "codes": "codes",
          "clashroyale": "clashroyale"
      };

      if (keyMap[activeTab]) {
          setFetchLoading(true);
          fetchData(keyMap[activeTab]).then(() => setFetchLoading(false));
      }
  }, [activeTab]);

  // --- SOCKET IO INTEGRATION ---
  useEffect(() => {
      socketRef.current = io("https://vnmvalentin.de", {
          path: "/socket.io",
          withCredentials: true
      });

      const socket = socketRef.current;

      socket.on("connect", () => {
          socket.emit("join_room", `streamer:${STREAMER_ID}`);
          console.log("Admin Socket connected");
      });

      socket.on("admin_data_changed", (updatedTypes) => {
          console.log("Update received:", updatedTypes);

           const keyMap = {
              "overview": "stats",
              "adventures": "adventure",
              "casino": "casino",
              "winchallenge": "winchallenge",
              "bingo": "bingo",
              "codes": "codes"
          };

          const currentApiType = keyMap[activeTab];

          if (updatedTypes.includes(currentApiType)) {
              fetchData(currentApiType);
          }
      });

      return () => {
          socket.disconnect();
      };
  }, [activeTab]);

  // --- ACTIONS ---
  const createCode = async () => {
      const payload = {
          ...newCode,
          maxUses: isUnlimited ? -1 : parseInt(newCode.maxUses)
      };
      await fetch("/api/promo/create", {
          method: "POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(payload)
      });
      setNewCode({ code: "", type: "credits", value: 0, maxUses: 10, expiresAt: "" });
      setIsUnlimited(false);
      fetchData("codes");
  };

  const deleteCode = async (code) => {
      if(!window.confirm("Code löschen?")) return;
      await fetch(`/api/promo/${code}`, { method: "DELETE" });
      fetchData("codes");
  };

  const updateUser = async (id, changes) => {
      await fetch("/api/admin/update/user", {
          method: "POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ targetId: id, changes })
      });
  };

  const deleteItem = async (type, id) => {
      if(!window.confirm("Wirklich löschen?")) return;

      let url = `/api/admin/${type}/${id}`;
      if (type === "winchallenge") url = `/api/winchallenge/${id}`;

      await fetch(url, { method: "DELETE" });

      setTimeout(() => {
          if(activeTab === "winchallenge") fetchData("winchallenge");
          if(activeTab === "bingo") fetchData("bingo");
      }, 200);
  };

  // --- RENDER HELPERS ---

  if (!user || String(user.id) !== STREAMER_ID) {
      return <div className="min-h-screen flex items-center justify-center text-white/40">Checking permissions...</div>;
  }

  const activeSection = SECTIONS.find(s => s.id === activeTab) || SECTIONS[0];

  const renderContent = () => {
      if (fetchLoading) return <div className="p-8 text-center animate-pulse text-violet-300 font-semibold">Lade Daten aus der Datenbank...</div>;

      if (!data && activeTab === "overview") return <div className="p-8 text-center text-red-400">Keine Statistik-Daten empfangen. (Backend prüfen)</div>;

      if (!data && activeTab !== "broadcast") return <div className="p-8 text-center text-white/40">Wähle einen Bereich</div>;

      // FILTER
      let entries = data ? Object.entries(data) : [];
      if (search && data) {
          const s = search.toLowerCase();
          entries = entries.filter(([id, val]) => searchTextFor(id, val).includes(s));
      }

      // --- BROADCAST TAB ---
      if (activeTab === "broadcast") {
          return (
              <div className="panel p-6 border-red-500/20">
                  <h2 className="font-display text-xl font-bold text-red-400 flex items-center gap-3 mb-2">
                      <Radio size={22} /> System Broadcast
                  </h2>
                  <p className="text-white/50 mb-6 text-sm leading-relaxed">
                      Sende eine Nachricht an alle gerade aktiven User. Die Nachricht wird als Pop-Up angezeigt und bleibt für die eingestellte Dauer auch bei Seiten-Reloads aktiv.
                  </p>

                  <div className="space-y-4 max-w-2xl">
                      <div>
                          <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Nachricht</label>
                          <textarea
                              value={bcMessage}
                              onChange={(e) => setBcMessage(e.target.value)}
                              placeholder="z.B. Website wird in 5 Minuten für ein Update kurz neugestartet!"
                              className="w-full bg-black/40 border border-white/10 rounded-lg p-4 text-white placeholder:text-white/25 focus:border-red-500/50 outline-none resize-none h-24 transition-colors"
                          />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Dauer (in Minuten)</label>
                              <input
                                  type="number"
                                  value={bcDuration}
                                  onChange={(e) => setBcDuration(Number(e.target.value))}
                                  min="1"
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-red-500/50 outline-none transition-colors"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Art des Hinweises</label>
                              <select
                                  value={bcType}
                                  onChange={(e) => setBcType(e.target.value)}
                                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-red-500/50 outline-none appearance-none transition-colors"
                              >
                                  <option value="warning">Warnung (Rot)</option>
                                  <option value="info">Info (Violett)</option>
                              </select>
                          </div>
                      </div>

                      <button
                          onClick={handleSendBroadcast}
                          disabled={isBroadcasting || !bcMessage.trim()}
                          className="mt-4 w-full bg-red-600 hover:bg-red-500 disabled:bg-white/5 disabled:text-white/30 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                          {isBroadcasting ? "Sendet..." : "Broadcast jetzt auslösen"}
                      </button>
                  </div>
              </div>
          );
      }

      // 0. OVERVIEW (STATS)
      if (activeTab === "overview") {
          if (!data) return null;

          const statCards = [
              { label: "Total Credits", value: data.totalCredits?.toLocaleString(), accent: "text-amber-400", border: "border-amber-500/20" },
              { label: "Casino User", value: data.totalUsers, accent: "text-blue-400", border: "border-blue-500/20" },
              { label: "adVentures Spieler", value: data.advPlayers, accent: "text-emerald-400", border: "border-emerald-500/20" },
          ];
          const miniCards = [
              { label: "Aktive Bingos", value: data.activeBingoSessions },
              { label: "Win-Challenges", value: data.activeChallenges },
              { label: "Aktive Promo-Codes", value: data.activeCodes },
          ];

          return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {statCards.map(c => (
                      <div key={c.label} className={`panel p-6 ${c.border}`}>
                          <div className={`${c.accent} text-xs font-bold uppercase tracking-wider mb-2`}>{c.label}</div>
                          <div className="text-4xl font-bold text-white">{c.value}</div>
                      </div>
                  ))}

                  {miniCards.map(c => (
                      <div key={c.label} className="panel p-6">
                          <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">{c.label}</div>
                          <div className="text-3xl font-bold text-white">{c.value}</div>
                      </div>
                  ))}
              </div>
          );
      }

      // 1. CODES TAB
      if (activeTab === "codes") {
          return (
              <div className="space-y-6">
                  {/* ERSTELLEN FORMULAR */}
                  <div className="panel p-5 flex flex-wrap gap-4 items-end">
                      <div>
                          <label className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Code (leer = auto)</label>
                          <input className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 w-32 text-white focus:border-violet-500 outline-none transition-colors" value={newCode.code} onChange={e=>setNewCode({...newCode, code: e.target.value})} placeholder="AUTO" />
                      </div>
                      <div>
                          <label className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Typ</label>
                          <select className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-violet-500 outline-none transition-colors" value={newCode.type} onChange={e=>setNewCode({...newCode, type: e.target.value})}>
                              <option value="credits">Credits</option>
                              <option value="skin">Skin</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Wert/SkinID</label>
                          <input className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 w-24 text-white focus:border-violet-500 outline-none transition-colors" value={newCode.value} onChange={e=>setNewCode({...newCode, value: e.target.value})} />
                      </div>

                      {/* ANZAHL & UNBEGRENZT */}
                      <div className="flex items-center gap-2">
                          {!isUnlimited ? (
                              <div>
                                  <label className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Anzahl</label>
                                  <input type="number" className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 w-20 text-white focus:border-violet-500 outline-none transition-colors" value={newCode.maxUses} onChange={e=>setNewCode({...newCode, maxUses: e.target.value})} />
                              </div>
                          ) : (
                             <div className="h-[42px] flex items-center px-2 text-violet-300">
                                 <InfinityIcon size={22} />
                             </div>
                          )}
                          <label className="flex items-center gap-1.5 cursor-pointer select-none h-[42px]">
                              <input type="checkbox" checked={isUnlimited} onChange={e => setIsUnlimited(e.target.checked)} className="accent-violet-500 w-4 h-4" />
                              <span className="text-xs text-white/50">Unbegrenzt</span>
                          </label>
                      </div>

                      {/* DATUM */}
                      <div>
                          <label className="text-xs text-white/40 font-bold uppercase tracking-wider block mb-1.5">Ablauf (Optional)</label>
                          <input
                              type="datetime-local"
                              className="block bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-violet-500 outline-none transition-colors"
                              value={newCode.expiresAt}
                              onChange={e=>setNewCode({...newCode, expiresAt: e.target.value})}
                          />
                      </div>

                      <button onClick={createCode} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors">
                          <Plus size={15} /> Erstellen
                      </button>
                  </div>

                  {/* SUCHE (Codes hat eigene Filterung, da Codes selbst der Key sind) */}
                  <div className="relative max-w-sm">
                      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                          type="text"
                          placeholder="Code suchen..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-violet-500 outline-none transition-colors"
                      />
                  </div>

                  {/* LISTE */}
                  <div className="grid gap-2">
                      {entries.map(([code, info]) => {
                          const isExpired = info.expiresAt && Date.now() > info.expiresAt;
                          const isInfinity = info.maxUses === -1;
                          const usedCount = info.usedBy?.length || 0;

                          return (
                              <div key={code} className={`panel p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 ${isExpired ? 'opacity-50' : ''}`}>
                                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                      <div className="min-w-[100px]">
                                          <span className="font-mono text-amber-400 font-bold text-lg">{code}</span>
                                          {isExpired && <span className="ml-2 text-red-400 text-[10px] font-bold uppercase">Abgelaufen</span>}
                                      </div>

                                      <div className="text-sm text-white/70">
                                          <span className="uppercase text-[10px] text-white/30 font-bold block">Reward</span>
                                          {info.type === "credits" ? `${info.value} Credits` : `Skin: ${info.value}`}
                                      </div>

                                      <div className="text-sm text-white/70">
                                          <span className="uppercase text-[10px] text-white/30 font-bold block">Genutzt</span>
                                          <span className={usedCount >= info.maxUses && !isInfinity ? "text-red-400" : "text-emerald-400"}>
                                              {usedCount} / {isInfinity ? "∞" : info.maxUses}
                                          </span>
                                      </div>

                                      <div className="text-sm text-white/70">
                                          <span className="uppercase text-[10px] text-white/30 font-bold block">Läuft ab</span>
                                          {info.expiresAt ? new Date(info.expiresAt).toLocaleString() : "Nie"}
                                      </div>
                                  </div>
                                  <button onClick={() => deleteCode(code)} className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors self-start sm:self-auto shrink-0"><Trash2 size={16} /></button>
                              </div>
                          );
                      })}
                      {entries.length === 0 && <p className="text-center text-white/30 italic py-8">Keine Codes vorhanden.</p>}
                  </div>
              </div>
          );
      }

      // 2. ADVENTURES & CASINO
      if (activeTab === "adventures" || activeTab === "casino") {
          return (
              <div className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-black/25 text-[10px] uppercase tracking-wider text-white/40">
                          <tr>
                              <th className="p-3 font-bold">User</th>
                              <th className="p-3 font-bold">Credits</th>
                              {activeTab === "adventures" && (
                                  <>
                                      <th className="p-3 font-bold">Highscore</th>
                                      <th className="p-3 font-bold">Skins</th>
                                      <th className="p-3 font-bold">Slots</th>
                                  </>
                              )}
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                          {entries.map(([id, u]) => (
                              <tr key={id} className="hover:bg-white/[0.03] transition-colors">
                                  <td className="p-3 font-mono text-xs text-white/40">
                                      <div className="text-white font-semibold text-sm font-sans">{u.name || u.twitchLogin || "Unknown"}</div>
                                      {id}
                                  </td>
                                  <td className="p-3">
                                      <input
                                          type="number"
                                          defaultValue={u.credits}
                                          onBlur={(e) => updateUser(id, { credits: e.target.value })}
                                          className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:border-violet-500 outline-none transition-colors"
                                      />
                                  </td>
                                  {activeTab === "adventures" && (
                                      <>
                                          <td className="p-3">
                                              <input
                                                  type="number"
                                                  defaultValue={u.highScore}
                                                  onBlur={(e) => updateUser(id, { highScore: e.target.value })}
                                                  className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:border-violet-500 outline-none transition-colors"
                                              />
                                          </td>
                                          <td className="p-3 max-w-xs truncate text-xs text-white/40">
                                              {u.skins?.join(", ")}
                                              <button
                                                  onClick={() => {
                                                      const newSkins = prompt("Skins (kommagetrennt):", u.skins?.join(","));
                                                      if(newSkins !== null) updateUser(id, { skins: newSkins.split(",").map(s=>s.trim()) });
                                                  }}
                                                  className="ml-2 text-violet-300 hover:text-violet-200 inline-flex align-middle"
                                              ><Pencil size={12} /></button>
                                          </td>
                                          <td className="p-3">
                                              <input
                                                  type="number"
                                                  defaultValue={u.unlockedSlots}
                                                  onBlur={(e) => updateUser(id, { unlockedSlots: e.target.value })}
                                                  className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white focus:border-violet-500 outline-none transition-colors"
                                              />
                                          </td>
                                      </>
                                  )}
                              </tr>
                          ))}
                          {entries.length === 0 && (
                              <tr><td colSpan={5} className="p-8 text-center text-white/30 italic">Keine Einträge gefunden.</td></tr>
                          )}
                      </tbody>
                  </table>
                </div>
              </div>
          );
      }

      // 3. WINCHALLENGE & BINGO
      if (activeTab === "winchallenge" || activeTab === "bingo") {
          const isWc = activeTab === "winchallenge";
          // Unbekannte Zahlen (Twitch-Fehler, gelöschter Kanal) landen hinten,
          // statt sich als "0 Follower" zwischen die echten Nullen zu mischen.
          const followersOf = ([id, item]) => {
              const n = wcFollowers[String(item?.userId || id)];
              return typeof n === "number" ? n : -1;
          };
          const list = isWc
              ? [...entries].sort((a, b) => followersOf(b) - followersOf(a))
              : entries;
          const knownFollowers = isWc
              ? list.map(followersOf).filter(n => n >= 0)
              : [];

          return (
              <div>
                  {isWc && (
                      <div className="flex gap-3 mb-5 flex-wrap items-center">
                          <div className="panel px-4 py-2.5 flex items-center gap-2">
                              <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Overlays</span>
                              <span className="text-lg font-bold text-white">{list.length}</span>
                          </div>
                          <div className="panel px-4 py-2.5 flex items-center gap-2">
                              <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Follower gesamt</span>
                              <span className="text-lg font-bold text-violet-300">
                                  {knownFollowers.reduce((s, n) => s + n, 0).toLocaleString("de-DE")}
                              </span>
                          </div>
                          <button
                              onClick={() => fetchWcFollowers(true)}
                              disabled={wcFollowersLoading}
                              className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/30 text-white rounded-lg text-sm font-semibold transition-colors"
                          >
                              <RefreshCw size={14} /> {wcFollowersLoading ? "Lädt Follower..." : "Follower aktualisieren"}
                          </button>
                      </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {list.map(([id, item]) => {
                       let displayName = "Unknown";
                       if (item.hostName) displayName = item.hostName;
                       else if (item.host?.twitchLogin) displayName = item.host.twitchLogin;
                       else displayName = item.userId || item.host?.twitchId || id;

                       const followers = wcFollowers[String(item?.userId || id)];

                       return (
                           <div key={id} className="panel p-4">
                               <h3 className="font-bold text-white mb-1.5">
                                   {item.title || item.theme?.name || "Unbenannt"}
                               </h3>

                               <div className="text-xs text-white/40 mb-3 flex items-center gap-2 flex-wrap">
                                   <span className="uppercase font-bold text-white/25">Host:</span>
                                   <a
                                       href={`https://twitch.tv/${displayName}`}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="text-violet-300 font-semibold bg-violet-500/10 border border-violet-400/20 px-2 py-0.5 rounded-md hover:bg-violet-500 hover:text-white hover:border-violet-500 transition-colors flex items-center gap-1"
                                       title={`Gehe zu twitch.tv/${displayName}`}
                                   >
                                       {displayName}
                                       <ExternalLink size={10} className="opacity-60" />
                                   </a>
                                   {isWc && (
                                       <span
                                           className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-md text-white/70 font-semibold"
                                           title="Follower auf Twitch"
                                       >
                                           <Users size={10} className="opacity-60" />
                                           {typeof followers === "number"
                                               ? followers.toLocaleString("de-DE")
                                               : (wcFollowersLoading ? "..." : "—")}
                                       </span>
                                   )}
                               </div>

                               <pre className="text-[10px] bg-black/30 border border-white/5 p-2 rounded-lg overflow-hidden text-white/30 mb-4 font-mono select-all">
                                   ID: {id}
                               </pre>

                               <button
                                  onClick={() => deleteItem(activeTab, id)}
                                  className="w-full bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                               >
                                   <Trash2 size={14} /> Löschen
                               </button>
                           </div>
                       );
                   })}

                   {list.length === 0 && (
                       <div className="col-span-full text-center text-white/30 italic py-10">
                           Keine Einträge gefunden.
                       </div>
                   )}
                  </div>
              </div>
          );
      }

      // GARDEN TAB
      if (activeTab === "garden") {
          const filtered = search
              ? gardenUsers.filter(u => searchTextFor(u.userId, u).includes(search.toLowerCase()))
              : gardenUsers;
          const saveGold = async (uid, gold) => {
              await fetch(`/api/admin/garden/user/${uid}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ gold: Number(gold) }),
              });
              setGardenUsers(prev => prev.map(u => u.userId === uid ? { ...u, gold: Number(gold) } : u));
              setGardenEditId(null);
          };
          return (
              <div>
                  <div className="flex gap-3 mb-5 flex-wrap items-center">
                      <div className="panel px-4 py-2.5 flex items-center gap-2">
                          <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Spieler</span>
                          <span className="text-lg font-bold text-white">{gardenUsers.length}</span>
                      </div>
                      <div className="panel px-4 py-2.5 flex items-center gap-2">
                          <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Gold gesamt</span>
                          <span className="text-lg font-bold text-amber-400">{gardenUsers.reduce((s, u) => s + u.gold, 0).toLocaleString("de-DE")}</span>
                      </div>
                      <button onClick={() => fetchData("garden")} className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold transition-colors">
                          <RefreshCw size={14} /> Aktualisieren
                      </button>
                  </div>
                  <div className="panel overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-black/25 text-[10px] uppercase tracking-wider text-white/40">
                              <tr>
                                  <th className="p-3 font-bold">Spieler</th>
                                  <th className="p-3 font-bold">Gold</th>
                                  <th className="p-3 font-bold">Samen</th>
                                  <th className="p-3 font-bold">Ernte</th>
                                  <th className="p-3 font-bold">Tiere</th>
                                  <th className="p-3 font-bold">Pflanzen</th>
                                  <th className="p-3 font-bold">Erw.</th>
                                  <th className="p-3 font-bold">Zuletzt aktiv</th>
                                  <th className="p-3 font-bold text-right">Menü</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                              {filtered.map(u => (
                                  <tr key={u.userId} className="hover:bg-white/[0.03] transition-colors">
                                      <td className="p-3">
                                          <div className="flex items-center gap-2">
                                              {u.online && (
                                                  <span title="Gerade im Spiel" className="w-1.5 h-1.5 rounded-sm bg-emerald-400 shrink-0" />
                                              )}
                                              <div className="min-w-0">
                                                  {u.twitchLogin && (
                                                      <div className="text-white font-semibold text-sm">{u.twitchLogin}</div>
                                                  )}
                                                  <div className="font-mono text-xs text-white/30">{u.userId}</div>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="p-3">
                                          {gardenEditId === u.userId ? (
                                              <div className="flex gap-1.5 items-center">
                                                  <input autoFocus type="number" value={gardenEditGold} onChange={e => setGardenEditGold(e.target.value)} placeholder="Wert"
                                                      className="w-24 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:border-violet-500 outline-none transition-colors" />
                                                  <button onClick={() => saveGold(u.userId, gardenEditGold)} className="text-emerald-300 font-bold bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-md text-xs transition-colors">SET</button>
                                                  <button onClick={() => saveGold(u.userId, Number(u.gold) + Number(gardenEditGold))} className="text-blue-300 font-bold bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-md text-xs transition-colors">ADD</button>
                                                  <button onClick={() => setGardenEditId(null)} className="text-white/40 bg-white/5 hover:text-white hover:bg-white/10 px-2 py-1 rounded-md text-xs transition-colors">X</button>
                                              </div>
                                          ) : (
                                              <div className="flex items-center gap-3">
                                                  <span className="text-amber-400 font-bold text-sm">{u.gold.toLocaleString("de-DE")}</span>
                                                  <button onClick={() => { setGardenEditId(u.userId); setGardenEditGold(""); }} className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-colors uppercase font-bold tracking-wider">
                                                      <Pencil size={10} /> Edit
                                                  </button>
                                              </div>
                                          )}
                                      </td>
                                      <td className="p-3 text-white/50">{u.inventoryCount}</td>
                                      <td className="p-3 text-white/50">{u.harvestedCount}</td>
                                      <td className="p-3 text-white/50">{u.petCount}</td>
                                      <td className="p-3 text-white/50">{u.plantCount}</td>
                                      <td className="p-3 text-white/50">{u.expansions}</td>
                                      <td className="p-3 text-white/40 text-xs">{u.updatedAt ? new Date(u.updatedAt).toLocaleString("de-DE") : "—"}</td>
                                      <td className="p-3 text-right">
                                          <button
                                              onClick={() => setGardenDetail({ userId: u.userId, name: u.twitchLogin })}
                                              className="inline-flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-colors uppercase font-bold tracking-wider"
                                          >
                                              <SlidersHorizontal size={10} /> Bearbeiten
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                              {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-white/30 italic">Keine Spieler gefunden.</td></tr>}
                          </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Ausführliches Menü für eine Farm — Gold, Rucksack, Ernte, Tiere, Deko, Werte */}
                  {gardenDetail && (
                      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                           onClick={() => setGardenDetail(null)}>
                          <div className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-slate-900 border border-slate-700 rounded-md p-4"
                               onClick={(e) => e.stopPropagation()}>
                              <GardenAdminPanel
                                  userId={gardenDetail.userId}
                                  anzeigeName={gardenDetail.name}
                                  onClose={() => { setGardenDetail(null); fetchData("garden"); }}
                              />
                          </div>
                      </div>
                  )}
              </div>
          );
      }

      // CLASH ROYALE TAB
      if (activeTab === "clashroyale") {
          const modeLabel = {
              snake: "Snake Royale", auction: "Elixir Auction", bingo: "Bingo Royale",
              "shadow-carousel": "Blindes Karussel", "elixir-rush": "Elixir Rush",
              "card-evolution": "Karten-Evolution", "angel-royale": "Angel Royale", "dark-maze": "Dunkles Labyrinth",
          };
          const phaseLabel = { lobby: "Lobby", playing: "Läuft", finished: "Beendet" };
          const phaseColor = { lobby: "text-white/40 border-white/10", playing: "text-emerald-400 border-emerald-500/30", finished: "text-amber-400 border-amber-500/30" };
          const filtered = search
              ? clashLobbies.filter(l => searchTextFor(l.code, { hostName: l.hostName }).includes(search.toLowerCase()))
              : clashLobbies;
          return (
              <div>
                  {/* Aktive Lobbys oder die Karten-Presets verwalten */}
                  <div className="flex border-b border-white/5 mb-5">
                      {[
                          { id: "lobbies", label: "Aktive Lobbys", icon: Gamepad2 },
                          { id: "presets", label: "Karten-Presets", icon: Layers },
                      ].map(sub => {
                          const SubIcon = sub.icon;
                          const active = clashSubTab === sub.id;
                          return (
                              <button key={sub.id} onClick={() => setClashSubTab(sub.id)}
                                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 ${
                                      active ? "border-violet-400 text-white bg-white/[0.03]" : "border-transparent text-white/40 hover:text-white/70"
                                  }`}>
                                  <SubIcon size={14} />
                                  {sub.label}
                              </button>
                          );
                      })}
                  </div>

                  {clashSubTab === "presets" ? <CardPresetAdminPanel search={search} /> : (
                  <div>
                  <div className="flex gap-3 mb-5 flex-wrap items-center">
                      <div className="panel px-4 py-2.5 flex items-center gap-2">
                          <span className="text-white/40 text-[10px] uppercase font-bold tracking-wider">Aktive Lobbys</span>
                          <span className="text-lg font-bold text-white">{clashLobbies.length}</span>
                      </div>
                      <button onClick={() => fetchData("clashroyale")} className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold transition-colors">
                          <RefreshCw size={14} /> Aktualisieren
                      </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.map(l => (
                          <div key={l.code} className="panel p-4">
                              <div className="flex items-center justify-between mb-2">
                                  <span className="font-mono text-lg font-bold text-violet-300">{l.code}</span>
                                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${phaseColor[l.phase] || "text-white/40 border-white/10"}`}>
                                      {phaseLabel[l.phase] || l.phase}
                                  </span>
                              </div>
                              <div className="text-white font-semibold text-sm mb-1 flex items-center gap-1.5">
                                  <Gamepad2 size={13} className="text-violet-300" /> {modeLabel[l.mode] || l.mode}
                              </div>
                              <div className="text-xs text-white/40 mb-3">
                                  Host: <span className="text-white/70 font-semibold">{l.hostName}</span> · {l.playerCount} Spieler
                              </div>
                              <button
                                  onClick={() => navigate(`/clash-royale?adminCode=${l.code}`)}
                                  className="w-full bg-violet-500/10 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                              >
                                  <Eye size={14} /> Ansehen
                              </button>
                          </div>
                      ))}
                      {filtered.length === 0 && (
                          <div className="col-span-full text-center text-white/30 italic py-10">
                              Keine aktiven Lobbys.
                          </div>
                      )}
                  </div>
                  </div>
                  )}
              </div>
          );
      }

      return null;
  };

  return (
    <div className="page-fade max-w-7xl mx-auto px-2 md:px-4 py-6 md:py-8">
        <SEO title = "Admin"/>

        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400/80 mb-2">Admin</p>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start">

          {/* SIDEBAR NAV */}
          <nav className="panel p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible lg:sticky lg:top-6">
              {SECTIONS.map(sec => {
                  const Icon = sec.icon;
                  const active = activeTab === sec.id;
                  return (
                      <button
                          key={sec.id}
                          onClick={() => { setActiveTab(sec.id); setSearch(""); }}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 lg:shrink lg:w-full text-left ${
                              active ? "bg-violet-600 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                          }`}
                      >
                          <Icon size={16} className="shrink-0" />
                          {sec.label}
                      </button>
                  );
              })}
          </nav>

          {/* CONTENT */}
          <div className="min-w-0 space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                      <activeSection.icon size={18} className="text-violet-300" /> {activeSection.label}
                  </h2>

                  {!["codes", "broadcast"].includes(activeTab) && (
                      <div className="relative w-full sm:w-72">
                          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                          <input
                              type="text"
                              placeholder="Suche nach Name, Login, ID..."
                              value={search}
                              onChange={e => setSearch(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:border-violet-500 outline-none transition-colors"
                          />
                      </div>
                  )}
              </div>

              {renderContent()}
          </div>
        </div>
    </div>
  );
}
