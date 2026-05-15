// src/pages/Hub.jsx — Münzen-Rangliste, Daily Bonus, Links zu Minigames
import React, { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import CoinIcon from "../components/CoinIcon";
import {
  Trophy,
  Shield,
  Award,
  Users,
  X,
  Star,
  User,
  Gift,
  Gamepad2,
  ChevronRight,
} from "lucide-react";
import { BADGE_DICTIONARY } from "../utils/patchNotes";
import SEO from "../components/SEO";

const TABS = [
  { id: "coins", label: "Münzen-Rangliste", icon: <Trophy size={16} /> },
  { id: "users", label: "Spieler", icon: <Users size={16} /> },
];

const RPG_NAMES = {
  default: "Standard Skin",
  ninja: "Ninja",
  knight: "Ritter",
  wizard: "Magier",
  cyber: "Cyberpunk",
  gh0stqq: "Gh0stQQ",
  bestmod: "Best Mod",
  potion: "Heiltrank",
  shield: "Schutzschild",
  spin: "Wirbelwind",
  decoy: "Köder",
  grenade: "Granate",
  fastshot: "Hyperfeuer",
  fastboots: "Speedboots",
};

const avatarCache = {};

const TwitchAvatar = ({ username, className, iconSize = 24 }) => {
  const [imgUrl, setImgUrl] = useState(avatarCache[username] || null);

  useEffect(() => {
    if (!username) return;
    if (avatarCache[username]) {
      setImgUrl(avatarCache[username]);
      return;
    }

    let isMounted = true;
    fetch(
      `https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`
    )
      .then((res) => res.text())
      .then((text) => {
        if (isMounted && text && text.startsWith("http")) {
          avatarCache[username] = text;
          setImgUrl(text);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [username]);

  if (!imgUrl) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 animate-pulse ${className}`}
      >
        <User size={iconSize} />
      </div>
    );
  }
  return <img src={imgUrl} alt={username} className={`object-cover ${className}`} />;
};

const BadgeFlex = ({ userBadges, className = "justify-center" }) => {
  if (!userBadges || userBadges.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {userBadges.map((badgeId, idx) => {
        const badgeInfo = BADGE_DICTIONARY[badgeId];
        if (!badgeInfo) return null;

        return (
          <div
            key={idx}
            className="relative group cursor-help flex items-center justify-center"
          >
            {badgeInfo.image ? (
              <img
                src={badgeInfo.image}
                alt={badgeInfo.description}
                className="w-8 h-8 object-contain drop-shadow-md hover:scale-110 transition-transform duration-200"
              />
            ) : (
              <span className="text-xl bg-white/5 border border-white/10 rounded-md px-2 py-1 shadow-sm hover:bg-white/10 transition-colors">
                {badgeInfo.icon}
              </span>
            )}

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

function formatCooldown(ms) {
  if (ms <= 0) return null;
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export default function Hub() {
  const { user } = useContext(TwitchAuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("coins");
  const [selectedUser, setSelectedUser] = useState(null);

  const [lastDaily, setLastDaily] = useState(0);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/hub/players");
        if (res.ok) setData(await res.json());
      } catch (e) {
        console.error("Fehler beim Laden", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      try {
        const res = await fetch("/api/casino/user", { credentials: "include" });
        if (res.ok) {
          const d = await res.json();
          setLastDaily(d.lastDaily || 0);
          setDailyStreak(d.dailyStreak || 0);
        }
      } catch (e) {}
    };
    fetchUserData();
  }, [user]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (lastDaily > 0) {
        const now = Date.now();
        const diff = lastDaily + 24 * 60 * 60 * 1000 - now;
        setCooldownTime(Math.max(0, diff));
        if (dailyStreak > 0 && now - lastDaily > 48 * 60 * 60 * 1000) {
          setDailyStreak(0);
        }
      } else {
        setCooldownTime(0);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [lastDaily, dailyStreak]);

  const claimDaily = async () => {
    setLoadingDaily(true);
    try {
      const res = await fetch("/api/casino/daily", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const d = await res.json();
        setRewardMessage(`+${d.reward}`);
        setLastDaily(Date.now());
        setDailyStreak(d.dailyStreak || 1);
        setTimeout(() => {
          setRewardMessage(null);
        }, 3000);
      }
    } catch (e) {}
    setLoadingDaily(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center mt-20 text-gray-500 animate-pulse font-medium">
        Lade Hub…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-red-400 text-center mt-10 bg-red-900/10 p-4 rounded-xl inline-block border border-red-500/20">
        Fehler beim Laden der Daten.
      </div>
    );
  }

  const topCoins = [...data.players].sort((a, b) => b.credits - a.credits);

  const getRankBadge = (index) => {
    if (index === 0) {
      return (
        <span className="text-xl text-yellow-400 font-black w-6 text-center">
          1.
        </span>
      );
    }
    if (index === 1) {
      return (
        <span className="text-xl text-gray-300 font-bold w-6 text-center">
          2.
        </span>
      );
    }
    if (index === 2) {
      return (
        <span className="text-xl text-amber-700 font-bold w-6 text-center">
          3.
        </span>
      );
    }
    return (
      <span className="text-gray-600 font-mono w-6 inline-block text-center text-sm">
        {index + 1}.
      </span>
    );
  };

  const formatIdToName = (id) => {
    if (!id) return null;
    if (RPG_NAMES[id]) return RPG_NAMES[id];
    return id
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="max-w-7xl mx-auto py-8 relative">
      <SEO title="Hub" />

      {selectedUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-[#18181b] border border-white/10 w-full max-w-2xl rounded-2xl p-6 md:p-8 relative shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/20 hover:bg-white/10 p-2 rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-8 border-b border-white/5 pb-6">
              <TwitchAvatar
                username={selectedUser.name}
                className="w-20 h-20 bg-black/50 rounded-full mx-auto mb-4 border-2 border-white/10 shadow-lg"
                iconSize={32}
              />
              <h2 className="text-3xl font-black text-white tracking-wider mb-4">
                {selectedUser.name}
              </h2>
              {selectedUser.badges && selectedUser.badges.length > 0 ? (
                <BadgeFlex userBadges={selectedUser.badges} className="justify-center" />
              ) : (
                <span className="text-sm text-gray-600 italic">
                  Noch keine Badges gesammelt
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                  Credits
                </div>
                <div className="text-lg font-mono text-yellow-400">
                  {selectedUser.credits.toLocaleString("de-DE")}
                </div>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                  Adventure Stage
                </div>
                <div className="text-lg font-mono text-red-400">
                  {selectedUser.adventureMaxStage}
                </div>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                  Karten
                </div>
                <div className="text-lg font-mono text-purple-400">
                  {selectedUser.uniqueCards}
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Shield size={16} /> Adventure Ausrüstung
              </h3>
              <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Aktiver Skin:</span>
                  <span className="text-white font-medium">
                    {formatIdToName(selectedUser.activeSkin)}
                  </span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-gray-500">Powerups:</span>
                  <div className="text-right flex flex-col gap-1">
                    {selectedUser.loadout?.filter((p) => p).length > 0 ? (
                      selectedUser.loadout
                        .filter((p) => p)
                        .map((p, i) => (
                          <span
                            key={i}
                            className="text-cyan-400 bg-cyan-900/20 px-2 py-0.5 rounded border border-cyan-500/20 inline-block w-max ml-auto"
                          >
                            {formatIdToName(p)}
                          </span>
                        ))
                    ) : (
                      <span className="text-gray-600 italic">Keine ausgerüstet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Star size={16} /> Achievements
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedUser.achievements?.length > 0 ? (
                  selectedUser.achievements.map((ach, i) => (
                    <span
                      key={i}
                      className="text-xs font-bold text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-500/20"
                    >
                      {formatIdToName(ach)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-600 italic bg-black/20 p-4 rounded-xl border border-white/5 w-full text-center">
                    Keine Achievements freigeschaltet
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-white/5 pb-8">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-wider text-white mb-2">
            Hub
          </h1>
          <div className="text-gray-400 text-sm max-w-xl">
            Münzen-Rangliste: wer hat die meisten Coins? Spiele unten verlinkt,
            Daily Bonus oben.
          </div>
        </div>
      </div>

      {user && (
        <div className="bg-gradient-to-r from-[#18181b] to-black border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden mb-8">
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-cyan-500/10 blur-[80px] pointer-events-none" />

          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-2 mb-1">
              <Gift className="text-pink-400" /> Daily Bonus
            </h2>
            <p className="text-gray-400 text-sm">
              Täglich kostenlose Coins — für Packs oder Casino.
            </p>
          </div>

          <button
            onClick={claimDaily}
            disabled={cooldownTime > 0 || loadingDaily || rewardMessage !== null}
            className={`relative z-10 flex items-center gap-3 px-8 py-3 rounded-xl font-black text-base transition-all duration-300 shadow-lg ${
              rewardMessage
                ? "bg-yellow-500 text-black shadow-yellow-500/50 scale-105"
                : cooldownTime <= 0
                ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-green-900/30 hover:scale-105"
                : "bg-white/5 border border-white/5 text-white/40 cursor-not-allowed"
            }`}
          >
            {loadingDaily ? (
              "Lade…"
            ) : rewardMessage ? (
              <>
                <span>🎉</span>
                <span className="tracking-wider">{rewardMessage}</span>
              </>
            ) : cooldownTime > 0 ? (
              <>
                <span>⏱️</span>
                <span className="font-mono">{formatCooldown(cooldownTime)}</span>
                {dailyStreak > 0 && (
                  <span className="text-orange-400 ml-2">🔥 {dailyStreak}</span>
                )}
              </>
            ) : (
              <>
                Einsammeln!
                {dailyStreak > 0 && (
                  <span className="text-orange-400 ml-2 drop-shadow-md">
                    🔥 {dailyStreak}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Link
          to="/Casino"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-800 to-yellow-950 p-4 border border-yellow-500/30 flex flex-col justify-between min-h-[120px] hover:scale-[1.01] active:scale-95 transition-transform"
        >
          <CoinIcon className="w-8 h-8 text-yellow-200 drop-shadow-md" />
          <div>
            <h3 className="font-black text-white uppercase text-sm">Casino</h3>
            <p className="text-white/60 text-xs mt-1">Slots &amp; Co.</p>
          </div>
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 group-hover:translate-x-0.5 transition-transform" size={20} />
        </Link>
        <Link
          to="/Packs"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-800 to-purple-950 p-4 border border-purple-500/30 flex flex-col justify-between min-h-[120px] hover:scale-[1.01] active:scale-95 transition-transform"
        >
          <Award className="w-8 h-8 text-purple-200" />
          <div>
            <h3 className="font-black text-white uppercase text-sm">Karten</h3>
            <p className="text-white/60 text-xs mt-1">Packs öffnen</p>
          </div>
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 group-hover:translate-x-0.5 transition-transform" size={20} />
        </Link>
        <Link
          to="/adventures"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-800 to-red-950 p-4 border border-red-500/30 flex flex-col justify-between min-h-[120px] hover:scale-[1.01] active:scale-95 transition-transform"
        >
          <Shield className="w-8 h-8 text-red-200" />
          <div>
            <h3 className="font-black text-white uppercase text-sm">Adventures</h3>
            <p className="text-white/60 text-xs mt-1">Kämpfe &amp; Stages</p>
          </div>
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 group-hover:translate-x-0.5 transition-transform" size={20} />
        </Link>
        <Link
          to="/garden"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-4 border border-emerald-500/30 flex flex-col justify-between min-h-[120px] hover:scale-[1.01] active:scale-95 transition-transform"
        >
          <Gamepad2 className="w-8 h-8 text-emerald-200" />
          <div>
            <h3 className="font-black text-white uppercase text-sm">Garten</h3>
            <p className="text-white/60 text-xs mt-1">Farm &amp; Pflanzen</p>
          </div>
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 group-hover:translate-x-0.5 transition-transform" size={20} />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-white/5 pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === tab.id
                ? "bg-white text-black shadow-lg scale-105"
                : "bg-[#18181b] hover:bg-white/10 text-gray-400 border border-white/5"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "coins" && (
        <div className="animate-in fade-in bg-[#18181b] border border-white/5 rounded-3xl flex flex-col shadow-xl min-h-[50vh]">
          <div className="p-6 border-b border-white/5 bg-black/20 shrink-0">
            <h2 className="font-black text-xl text-white flex items-center gap-3">
              <CoinIcon className="w-6 h-6" /> Münzen-Rangliste
            </h2>
            <p className="text-sm text-white/40 mt-1">Sortiert nach Casino-Credits.</p>
          </div>
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-1 max-h-[65vh]">
            {topCoins.length === 0 ? (
              <p className="text-center text-white/30 py-12">Noch keine Einträge.</p>
            ) : (
              topCoins.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                    i < 3
                      ? "bg-white/5 border border-white/5 shadow-sm mb-1"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {getRankBadge(i)}
                    <span
                      className={`truncate ${
                        i < 3
                          ? "text-white font-bold text-base"
                          : "text-gray-400 text-sm"
                      }`}
                    >
                      {p.name}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-yellow-400 shrink-0">
                    {p.credits.toLocaleString("de-DE")}{" "}
                    <CoinIcon className="w-3 h-3 inline pb-0.5" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="animate-in fade-in">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.players
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="bg-[#18181b] border border-white/5 hover:border-white/20 hover:bg-white/5 p-4 rounded-xl text-left transition-all group flex items-center gap-3"
                >
                  <TwitchAvatar
                    username={u.name}
                    className="w-10 h-10 rounded-full border border-white/10 shrink-0 bg-black/50"
                    iconSize={18}
                  />
                  <div className="overflow-hidden">
                    <div className="text-white font-bold truncate group-hover:text-cyan-400 transition-colors">
                      {u.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex gap-2">
                      <span>{u.badges?.length || 0} Badges</span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
