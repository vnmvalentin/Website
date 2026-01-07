import React, { useContext, useEffect, useState, useMemo } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Link } from "react-router-dom";

// --- 1. Definition der Typen ---
const CARD_TYPES = [
  { id: "natur", title: "Natur", min: 1, max: 50, icon: "🌿" },
  { id: "bestie", title: "Bestie", min: 51, max: 100, icon: "🐾" },
  { id: "drache", title: "Drache", min: 101, max: 150, icon: "🐲" },
  { id: "dunkelheit", title: "Dunkelheit", min: 151, max: 200, icon: "🌑" },
  { id: "cyber", title: "Cyber", min: 201, max: 250, icon: "🤖" },
  { id: "magie", title: "Magie", min: 251, max: 300, icon: "🪄" },
  { id: "ozean", title: "Ozean", min: 301, max: 350, icon: "🌊" },
  { id: "himmel", title: "Himmel", min: 351, max: 400, icon: "☁️" },
  { id: "mechanisch", title: "Mechanisch", min: 401, max: 450, icon: "⚙️" },
  { id: "kristall", title: "Kristall", min: 451, max: 500, icon: "💎" },
  { id: "hoelle", title: "Hölle", min: 501, max: 550, icon: "🔥" },
  { id: "wueste", title: "Wüste", min: 551, max: 600, icon: "🌵" },
  { id: "untergrund", title: "Untergrund", min: 601, max: 650, icon: "🔦" },
];

// Helper: Generiert Typ-Achievements + Fortschrittslogik
const typeAchievements = CARD_TYPES.map((type) => ({
  id: `collection_${type.id}`,
  title: `Meister: ${type.title}`,
  description: `Besitze alle Karten vom Typ ${type.title}.`,
  icon: type.icon,
  // Berechnet den Fortschritt (current / max)
  getProgress: (stats, allOwnedCards) => {
    // 1. Alle existierenden Karten dieses Typs finden
    const cardsInType = allOwnedCards.filter((c) => {
      const num = parseInt(c.number || "0", 10);
      return num >= type.min && num <= type.max;
    });
    
    const max = cardsInType.length;
    // 2. Zählen, wie viele davon wir besitzen
    const current = cardsInType.filter(c => (c.count || 0) > 0).length;
    
    return { current, max, done: max > 0 && current >= max };
  }
}));

// --- 2. Manuelle Achievements ---
const MANUAL_ACHIEVEMENTS = [
  {
    id: "first_blood",
    title: "Der Anfang",
    description: "Sammle deine erste Karte.",
    icon: "🃏",
    getProgress: (stats) => {
      return { 
        current: stats.totalOwned > 0 ? 1 : 0, 
        max: 1, 
        done: stats.totalOwned > 0 
      };
    }
  },
  {
    id: "collector_100",
    title: "Sammler",
    description: "Besitze 100 verschiedene Karten.",
    icon: "📚",
    getProgress: (stats) => {
      return { 
        current: Math.min(stats.uniqueOwned, 100), 
        max: 100, 
        done: stats.uniqueOwned >= 100 
      };
    }
  },
  {
    id: "mythic_full",
    title: "Mythologie",
    description: "Besitze alle mythischen Karten.",
    icon: "🔮",
    getProgress: (stats, allOwnedCards) => {
      const mythics = allOwnedCards.filter(
        (c) => c.rarity === "mythic" || c.rarityName === "Mythisch"
      );
      const max = mythics.length;
      const current = mythics.filter(c => (c.count || 0) > 0).length;
      
      // Falls es noch keine mythischen gibt, setzen wir max auf 1, damit nicht 0/0 steht, sondern 0/0 (Done false)
      return { current, max, done: max > 0 && current >= max };
    },
  },
  {
    id: "secret_full",
    title: "Geheim",
    description: "Besitze alle geheimen Karten.",
    icon: "🕵️",
    getProgress: (stats, allOwnedCards) => {
      const secrets = allOwnedCards.filter(
        (c) => c.rarity === "secret" || c.rarityName === "Geheim"
      );
      const max = secrets.length;
      const current = secrets.filter(c => (c.count || 0) > 0).length;
      return { current, max, done: max > 0 && current >= max };
    },
  },
  {
    id: "legend_found",
    title: "Legendär!",
    description: "Besitze die legendäre Karte.",
    icon: "✨",
    getProgress: (stats, allOwnedCards) => {
      const legends = allOwnedCards.filter(
          (c) => c.rarity === "legendary" || c.rarityName === "Legendär"
      );
      // Wir nehmen an, man braucht nur EINE beliebige Legendäre für dieses Achievement?
      // Oder alle? Hier Logik für "Besitze irgendeine Legendäre":
      const hasOne = legends.some(c => (c.count || 0) > 0);
      
      return { 
        current: hasOne ? 1 : 0, 
        max: 1, 
        done: hasOne 
      };
    },
  },
  {
    id: "ultimate_collector",
    title: "Und was jetzt?",
    description: "Sammle alle Karten.",
    icon: "🎗️",
    getProgress: (stats, allOwnedCards) => {
        const max = allOwnedCards.length;
        const current = stats.uniqueOwned;
        return { 
            current, 
            max, 
            done: max > 0 && current >= max 
        };
    },
  },
];

const ACHIEVEMENTS_DEF = [...MANUAL_ACHIEVEMENTS, ...typeAchievements];

export default function AchievementsPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [loading, setLoading] = useState(true);
  const [ownedCards, setOwnedCards] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`/api/cards/user/${user.id}`, { credentials: "include" });
        if (!res.ok) throw new Error("Fehler beim Laden");
        const data = await res.json();
        setOwnedCards(data.owned || []);
      } catch (e) {
        console.error(e);
        setError("Daten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const { list, progress } = useMemo(() => {
    const totalOwned = ownedCards.reduce((acc, c) => acc + (c.count || 0), 0);
    const uniqueOwned = ownedCards.filter((c) => (c.count || 0) > 0).length;
    const stats = { totalOwned, uniqueOwned };

    // Hier rufen wir jetzt getProgress auf statt check
    const calculated = ACHIEVEMENTS_DEF.map((ach) => {
       const info = ach.getProgress(stats, ownedCards);
       return { ...ach, ...info };
    });

    const doneCount = calculated.filter((a) => a.done).length;
    return {
      list: calculated,
      progress: { done: doneCount, total: calculated.length },
    };
  }, [ownedCards]);

  if (!user) return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">Achievements</h1>
        <button onClick={() => login(true)} className="bg-[#9146FF] px-4 py-2 rounded-lg">Login</button>
      </div>
  );
  if (loading) return <div className="text-center text-white mt-8">Lade...</div>;
  if (error) return <div className="text-center text-red-400 mt-8">{error}</div>;

  return (
    <div className="max-w-[1400px] mx-auto mt-8 text-white px-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Deine Achievements</h1>
          <p className="text-sm text-gray-300">
            Fortschritt: <span className="font-semibold text-[#9146FF]">{progress.done} / {progress.total}</span> freigeschaltet.
          </p>
        </div>
        <div className="flex justify-end">
          <Link to="/Packs" className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">
            ⬅️ Zurück zum Pack
          </Link>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Linke Seite: Grid mit Achievements */}
        <div className="flex-1">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map((ach) => (
                <div
                  key={ach.id}
                  className={`relative p-4 rounded-xl border flex items-center gap-4 transition-all overflow-hidden ${
                    ach.done
                      ? "bg-green-900/20 border-green-500/30"
                      : "bg-gray-800/40 border-gray-700/50 opacity-80"
                  }`}
                >
                  <div className={`text-3xl ${ach.done ? "" : "grayscale"}`}>{ach.icon}</div>
                  
                  <div className="flex-1 z-10 min-w-0">
                    <h3 className={`font-bold truncate ${ach.done ? "text-green-400" : "text-gray-300"}`}>
                      {ach.title}
                    </h3>
                    <p className="text-xs text-gray-400 line-clamp-2">{ach.description}</p>
                    
                    {/* Fortschrittsanzeige */}
                    <div className="mt-2 flex items-center gap-2">
                        {/* Kleiner Balken */}
                        <div className="h-1.5 flex-1 bg-gray-700 rounded-full overflow-hidden">
                            <div 
                                className={`h-full rounded-full ${ach.done ? "bg-green-500" : "bg-[#9146FF]"}`} 
                                style={{ width: `${ach.max > 0 ? (ach.current / ach.max) * 100 : 0}%` }}
                            />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-gray-400">
                            {ach.current} / {ach.max}
                        </span>
                    </div>
                  </div>

                  {ach.done && (
                    <div className="absolute top-2 right-2 text-green-500 text-lg font-bold">
                      ✓
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rechte Seite: Menü */}
        <aside className="w-full md:w-56">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Navigation</h2>
            <div className="space-y-2 text-sm">
              <Link to="/Packs" className="block w-full px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200">
                📦 Pack Öffnen
              </Link>
              <Link to="/Packs/Album" className="block w-full px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200">
                📚 Sammlung
              </Link>
              <div className="block w-full px-3 py-2 rounded-lg bg-[#9146FF] text-white">
                🏆 Achievements
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}