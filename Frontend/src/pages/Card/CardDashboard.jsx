import React, { useContext } from "react";
import { useSearchParams } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import SEO from "../../components/SEO";
import { Library, Images, Lightbulb, Trophy, Gift, LayoutGrid, Sword, Anvil } from "lucide-react";

// Importiere deine umgebauten Seiten als Komponenten
import CardPackPage from "./CardPackPage";
import CardAlbumPage from "./CardAlbumPage";
import AchievementsPage from "./AchievementsPage";
import CardSuggestionsPage from "./CardSuggestionsPage";
import CardEquipmentPage from "./CardEquipmentPage"; // Bauen wir gleich!
import CardCraftingPage from "./CardCraftingPage";   // Bauen wir gleich!

const TABS = [
  { id: "open", label: "Shop", icon: Gift, color: "text-violet-400" },
  { id: "album", label: "Sammlung", icon: Library, color: "text-blue-400" },
  { id: "equipment", label: "Ausrüstung", icon: Sword, color: "text-red-400" }, // NEU
  { id: "crafting", label: "Schmiede", icon: Anvil, color: "text-orange-400" }, // NEU
  { id: "achievements", label: "Achievements", icon: Trophy, color: "text-yellow-400" },
  { id: "suggestions", label: "Vorschläge", icon: Lightbulb, color: "text-cyan-400" },
];

export default function CardDashboard() {
  const { user, login } = useContext(TwitchAuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "open";

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-4xl font-black mb-4 bg-gradient-to-r from-violet-400 to-fuchsia-600 bg-clip-text text-transparent">Card Packs</h1>
            <p className="text-white/50 mb-8 max-w-md mx-auto">Sammle Karten, vervollständige dein Album und stelle sie aus!</p>
            <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg transition-transform hover:scale-105">
            Login mit Twitch
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto p-4 md:p-8 text-white pb-20">
      <SEO title="Card Packs Dashboard"/>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* --- LINKE SIDEBAR --- */}
        <div className="lg:col-span-3 space-y-4 sticky top-8">
            <div className="bg-[#18181b] border border-white/10 rounded-3xl p-4 shadow-lg">
                <div className="px-2 pb-2 mb-2 border-b border-white/5">
                    <h2 className="text-xs font-bold text-white/40 uppercase tracking-wider">Karten Menü</h2>
                </div>
                
                <div className="space-y-1">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button 
                                key={tab.id} 
                                onClick={() => setSearchParams({ tab: tab.id })}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${
                                    isActive 
                                    ? "bg-white/10 text-white shadow-md border border-white/10" 
                                    : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                                }`}
                            >
                                <Icon size={20} className={isActive ? tab.color : "text-white/40 group-hover:text-white"} />
                                <span className="font-bold text-sm">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* --- RECHTER CONTENT BEREICH --- */}
        <div className="lg:col-span-9 animate-in fade-in zoom-in-95 duration-200">
            {activeTab === "open" && <CardPackPage />}
            {activeTab === "album" && <CardAlbumPage />}
            {activeTab === "equipment" && <CardEquipmentPage />}
            {activeTab === "crafting" && <CardCraftingPage />}
            {activeTab === "achievements" && <AchievementsPage />}
            {activeTab === "suggestions" && <CardSuggestionsPage />}
        </div>

      </div>
    </div>
  );
}