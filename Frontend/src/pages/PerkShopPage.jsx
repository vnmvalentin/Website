import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { ShoppingBag, Check, AlertCircle, Package, Backpack, Terminal, Zap, List, Wallet } from "lucide-react"; // Neue Icons importiert
import CoinIcon from "../components/CoinIcon";
import SEO from "../components/SEO";
import { socket } from "../utils/socket"; 

export default function PerkShopPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  
  const [activeTab, setActiveTab] = useState("shop");

  // Statische Liste der allgemeinen Befehle
  const GENERAL_COMMANDS = [
      { cmd: "!perklist", desc: "Zeigt alle Perks mit Commands im Chat.", icon: <List /> },
      { cmd: "!perkinventory", desc: "Listet deine gekauften Items im Chat auf.", icon: <Backpack /> },
  ];

  const fetchData = async () => {
    try {
        const resItems = await fetch("/api/perks/items");
        if(resItems.ok) setItems(await resItems.json());
    } catch(e) { console.error(e); }

    if (user) {
        try {
            const [resInv, resUser] = await Promise.all([
                fetch("/api/perks/inventory", { credentials: "include" }),
                fetch("/api/casino/user", { credentials: "include" })
            ]);
            
            if(resInv.ok) setInventory(await resInv.json());
            if(resUser.ok) {
                const u = await resUser.json();
                setCredits(u.credits);
            }
        } catch(e) { console.error(e); }
    }
  };

  useEffect(() => { 
      fetchData(); 

      const handleUpdate = (data) => {
          if (user && data.userId === String(user.id)) {
              console.log("Perk Update empfangen, lade neu...");
              fetchData();
          }
      };

      socket.on("perk_inventory_update", handleUpdate);

      return () => {
          socket.off("perk_inventory_update", handleUpdate);
      };
  }, [user]);

  const buyItem = async (item) => {
      if (credits < item.price) return;
      setLoading(true);
      try {
          const res = await fetch("/api/perks/buy", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify({ itemId: item.id }),
              credentials: "include"
          });
          const data = await res.json();
          if (res.ok) {
              setCredits(data.newCredits);
              setInventory(data.newInventory);
              setMsg({ type: "success", text: data.message });
          } else {
              setMsg({ type: "error", text: data.error });
          }
      } catch(e) { setMsg({ type: "error", text: "Fehler" }); }
      setLoading(false);
      setTimeout(() => setMsg(null), 3000);
  };

  const inventoryCount = Object.values(inventory).reduce((a, b) => a + b, 0);

  const getCommandUsage = (id) => {
      switch(id) {
          case 'sr_token': return '!songrequest <Link>';
          case 'timeout_hammer': return '!timeout @User';
          case 'vip_token': return '!perkvip'; 
          case 'skip_token': return '!perkskip';
          case 'discount_sr': return '!discountsr';
          default: return `!perk ${id}`;
      }
  };

  if (!user) {
      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-white">
              <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
                  <h1 className="text-4xl font-black mb-4 flex items-center justify-center gap-3">
                      <ShoppingBag className="text-pink-500"/> Stream Shop
                  </h1>
                  <p className="text-white/50 mb-6">Logge dich ein, um Perks zu kaufen und zu nutzen.</p>
                  <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-purple-900/20">Login mit Twitch</button>
              </div>
          </div>
      );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 text-white min-h-screen pb-20">
      <SEO title="Perk Shop" />

      {/* HEADER */}
      <header className="bg-[#18181b] p-6 rounded-3xl mb-8 border border-white/10 shadow-xl flex flex-col md:flex-row justify-between items-center relative overflow-hidden gap-6">
        <div className="absolute top-0 right-0 p-32 bg-pink-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:block items-center md:items-start text-center md:text-left">
            <h1 className="text-3xl font-black flex items-center gap-3">
                <span className="text-pink-500"><ShoppingBag /></span> Perk Shop
            </h1>
            <p className="text-white/40 text-sm mt-1">Interagiere mit dem Stream über Commands.</p>
        </div>
        <div className="relative z-10 bg-black/30 px-5 py-2.5 rounded-xl border border-white/5 flex items-center gap-3 animate-in fade-in">
            <div className="text-right">
                <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Dein Guthaben</p>
                <p className="text-xl font-mono font-bold text-yellow-400 leading-none">{credits.toLocaleString()}</p>
            </div>
            <CoinIcon className="w-8 h-8 text-yellow-500 drop-shadow-md" />
        </div>
      </header>
      
      {/* MSG TOAST */}
      {msg && (
          <div className={`fixed bottom-8 right-8 z-50 px-6 py-4 rounded-2xl shadow-2xl border font-bold flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {msg.type === 'success' ? <Check size={20}/> : <AlertCircle size={20}/>}
              {msg.text}
          </div>
      )}

      {/* TABS NAVIGATION */}
      <div className="flex gap-4 mb-8 justify-center md:justify-start">
        <button 
            onClick={() => setActiveTab("shop")} 
            className={`px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'shop' ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20 transform scale-105' : 'bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5'}`}
        >
            <ShoppingBag size={18}/> Shop Angebot
        </button>
        <button 
            onClick={() => setActiveTab("inventory")} 
            className={`px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'inventory' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20 transform scale-105' : 'bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5'}`}
        >
            <Backpack size={18}/> Dein Inventar
            {inventoryCount > 0 && <span className="bg-cyan-900 text-cyan-200 px-2 py-0.5 rounded text-xs ml-1 border border-cyan-500/30">{inventoryCount}</span>}
        </button>
      </div>

      {/* --- SHOP VIEW --- */}
      {activeTab === "shop" && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12">
            
            {/* ITEM GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map(item => (
                    <div key={item.id} className="bg-[#18181b] border border-white/10 rounded-2xl p-5 hover:border-pink-500/30 transition-all hover:-translate-y-1 hover:shadow-2xl relative group flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-white/5 ${item.color.replace('text-', 'shadow-')}/10 border border-white/5`}>
                                {item.icon}
                            </div>
                            <div className="text-right">
                                <span className="block font-bold text-yellow-400 text-lg drop-shadow-sm">{item.price.toLocaleString()}</span>
                                <span className="text-[10px] text-white/30 uppercase font-bold">Credits</span>
                            </div>
                        </div>
                        <h3 className={`font-bold text-lg mb-1 ${item.color}`}>{item.name}</h3>
                        <p className="text-white/50 text-sm mb-6 flex-1 leading-relaxed">{item.desc}</p>
                        <button 
                            onClick={() => buyItem(item)}
                            disabled={credits < item.price || loading}
                            className={`w-full py-3 rounded-xl font-bold text-sm transition-all mt-auto flex items-center justify-center gap-2 ${credits >= item.price ? 'bg-white/10 hover:bg-white/20 text-white hover:shadow-lg' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                        >
                            {loading ? "..." : "Kaufen"}
                        </button>
                    </div>
                ))}
            </div>

            {/* --- BEFEHLSÜBERSICHT --- */}
            <div className="bg-[#18181b] border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-40 bg-pink-900/10 blur-[120px] rounded-full pointer-events-none" />
                
                <div className="relative z-10">
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                        <Terminal className="text-pink-400" /> Befehlsübersicht
                    </h2>
                    
                    {/* ITEM BEFEHLE */}
                    <h3 className="text-white/60 font-bold uppercase text-xs tracking-widest mb-4">Perk Commands</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-4 bg-black/20 border border-white/5 p-4 rounded-xl hover:bg-black/30 transition-colors group">
                                <div className="text-2xl w-10 h-10 flex items-center justify-center bg-white/5 rounded-lg text-white/80 group-hover:scale-110 transition-transform">
                                    {item.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-bold text-sm ${item.color}`}>{item.name}</p>
                                    <code className="text-xs bg-black/40 text-pink-100 px-2 py-1 rounded mt-1 inline-block font-mono border border-white/5 break-all">
                                        {getCommandUsage(item.id)}
                                    </code>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ALLGEMEINE BEFEHLE (NEU) */}
                    <h3 className="text-white/60 font-bold uppercase text-xs tracking-widest mb-4">Allgemein</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {GENERAL_COMMANDS.map((cmd, i) => (
                            <div key={i} className="flex items-center gap-4 bg-cyan-900/10 border border-cyan-500/20 p-4 rounded-xl hover:bg-cyan-900/20 transition-colors">
                                <div className="text-xl w-10 h-10 flex items-center justify-center bg-cyan-500/20 rounded-lg text-cyan-400">
                                    {cmd.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <code className="text-sm font-bold text-cyan-300 font-mono">{cmd.cmd}</code>
                                    <p className="text-xs text-white/50 mt-1 leading-snug">{cmd.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-8 flex items-start gap-3 bg-pink-900/10 border border-pink-500/20 p-4 rounded-xl">
                        <Zap className="text-pink-400 shrink-0 mt-0.5" size={18} />
                        <p className="text-sm text-pink-200/80">
                            <span className="font-bold text-pink-200">Hinweis:</span> Perk-Befehle funktionieren nur, wenn du das Item im Inventar hast. Allgemeine Befehle kann jeder nutzen.
                        </p>
                    </div>
                </div>
            </div>

        </div>
      )}

      {/* --- INVENTORY VIEW --- */}
      {activeTab === "inventory" && (
          <div className="bg-[#18181b] border border-white/10 rounded-3xl p-8 min-h-[400px] animate-in fade-in zoom-in-95 duration-300">
             <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                 <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400"><Package size={24}/></div>
                 <h2 className="font-bold text-2xl text-white">Deine Items</h2>
             </div>

             {Object.keys(inventory).length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-64 text-white/30">
                     <Backpack size={64} className="mb-4 opacity-20"/>
                     <p className="text-lg">Dein Inventar ist leer.</p>
                     <button onClick={() => setActiveTab("shop")} className="text-pink-400 font-bold mt-2 hover:text-pink-300 transition-colors">Geh shoppen &rarr;</button>
                 </div>
             ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {Object.entries(inventory).map(([id, count]) => {
                         const item = items.find(i => i.id === id);
                         if (!item || count <= 0) return null;
                         return (
                             <div key={id} className="flex items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5 hover:bg-black/30 transition-colors group hover:border-cyan-500/30">
                                 <div className="flex items-center gap-4">
                                     <div className={`text-3xl w-12 h-12 flex items-center justify-center bg-white/5 rounded-xl shadow-inner`}>{item.icon}</div>
                                     <div>
                                         <p className="font-bold text-white text-lg">{item.name}</p>
                                         <div className="flex items-center gap-1 mt-1">
                                            <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded font-mono border border-white/5">
                                                {getCommandUsage(id)}
                                            </span>
                                         </div>
                                     </div>
                                 </div>
                                 <div className="flex flex-col items-center">
                                     <div className="bg-cyan-600 text-white px-3 py-1 rounded-lg font-bold text-sm shadow-lg shadow-cyan-900/40 min-w-[40px] text-center">
                                         x{count}
                                     </div>
                                     <span className="text-[10px] text-cyan-400/50 mt-1 uppercase font-bold">Menge</span>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             )}
             
             <div className="mt-10 bg-gradient-to-r from-cyan-900/20 to-transparent p-4 rounded-xl border border-cyan-500/20 flex gap-4 items-start">
                 <div className="shrink-0 pt-1 text-cyan-400"><Check size={20} /></div>
                 <div>
                     <h4 className="font-bold text-cyan-400 text-sm uppercase mb-1">Wie benutze ich Perks?</h4>
                     <p className="text-white/60 text-xs leading-relaxed">
                         Nutze einfach den entsprechenden Befehl im Twitch-Chat (z.B. <code className="bg-black/30 px-1 rounded text-cyan-200">!songrequest Link</code>). 
                         Der Bot prüft automatisch dein Inventar hier auf der Webseite. Wenn du das Item hast, wird es verbraucht und die Aktion ausgeführt.
                     </p>
                 </div>
             </div>
          </div>
      )}

    </div>
  );
}