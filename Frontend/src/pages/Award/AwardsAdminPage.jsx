import React, { useEffect, useState } from "react";
import SEO from "../../components/SEO";
import { BarChart3, Users, Clock, Trophy } from "lucide-react";

const AWARDS_SEASON = 2026;

const CATEGORIES = [
  { id: "best-chatter", label: "Best Twitch-Chatter" },
  { id: "worst-chatter", label: "Worst Twitch-Chatter" },
  { id: "best-mod", label: "Best Twitch-Mod", type: "mod" },
  { id: "worst-mod", label: "Worst Twitch-Mod", type: "mod" },
  { id: "best-vip", label: "Best VIP" },
  { id: "best-stream-game", label: "Best Stream Game" },
  { id: "best-event", label: "Best Event" },
  { id: "best-clip", label: "Best Clip" },
  { id: "best-new-viewer", label: "Best New Viewer" },
  { id: "best-meme", label: "Best Meme / Running Gag" },
  { id: "best-community-moment", label: "Community-Moment" },
];

function buildSummary(db, seasonYear) {
  const result = { totalSubmissions: 0, perCategory: {} };
  const submissions = Array.isArray(db?.submissions) ? db.submissions : [];
  if (!submissions.length) return result;

  const byCategory = {};
  let totalSubs = 0;

  for (const sub of submissions) {
    if (seasonYear && Number(sub.season) !== Number(seasonYear)) continue;
    totalSubs++;
    const answers = sub.answers || {};
    for (const [catId, rawArr] of Object.entries(answers)) {
      const arr = Array.isArray(rawArr) ? rawArr : [];
      if (!byCategory[catId]) byCategory[catId] = {};
      for (const raw of arr) {
        const value = String(raw || "").trim();
        if (!value) continue;
        byCategory[catId][value] = (byCategory[catId][value] || 0) + 1;
      }
    }
  }

  const perCategory = {};
  for (const [catId, counts] of Object.entries(byCategory)) {
    const items = Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    perCategory[catId] = {
      totalEntries: items.reduce((sum, item) => sum + item.count, 0),
      uniqueCount: items.length,
      items,
    };
  }
  result.totalSubmissions = totalSubs;
  result.perCategory = perCategory;
  return result;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function StatCard({ title, value, icon: Icon, color }) {
    return (
        <div className="bg-[#18181b] border border-white/10 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
            <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-opacity-100`}>
                <Icon size={24} />
            </div>
            <div>
                <div className="text-white/50 text-xs uppercase font-bold tracking-wider">{title}</div>
                <div className="text-2xl font-black text-white">{value}</div>
            </div>
        </div>
    )
}

export default function AwardsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/awards/submissions", { credentials: "include" });
        if (!res.ok) throw new Error("Kein Zugriff oder Fehler.");
        const data = await res.json();
        setDb(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const summary = db ? buildSummary(db, AWARDS_SEASON) : null;
  const totalSubs = summary?.totalSubmissions || 0;
  const perCategory = summary?.perCategory || {};

  if (loading) return <div className="p-20 text-center animate-pulse text-white/50">Lade Daten...</div>;
  if (error) return <div className="p-10 text-center text-red-400 border border-red-500/20 bg-red-500/5 rounded-2xl m-10">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
        <SEO title = "aVards Admin"/>
      
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
         <div>
            <h1 className="text-3xl font-black tracking-tight">Awards {AWARDS_SEASON} Admin</h1>
            <p className="text-white/50 mt-1">Live Auswertung der Community Einsendungen.</p>
         </div>
         <div className="flex gap-2 text-xs font-mono text-white/30 bg-black/20 px-3 py-1 rounded-lg">
             <span>DB Version: {db?.version || "1.0"}</span>
         </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Einsendungen" value={totalSubs} icon={Users} color="text-violet-400 bg-violet-500" />
          <StatCard title="Kategorien" value={CATEGORIES.length} icon={Trophy} color="text-amber-400 bg-amber-500" />
          <StatCard title="Season" value={AWARDS_SEASON} icon={Calendar} color="text-emerald-400 bg-emerald-500" />
          <StatCard title="Status" value="Live" icon={BarChart3} color="text-blue-400 bg-blue-500" />
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {CATEGORIES.map((cat) => {
            const s = perCategory[cat.id];
            const hasData = s && s.items.length > 0;
            const topItem = hasData ? s.items[0] : null;

            return (
                <div key={cat.id} className="bg-[#18181b] border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-4">
                        <div>
                            <h3 className="font-bold text-lg text-white">{cat.label}</h3>
                            <div className="text-xs text-white/40 mt-1">{hasData ? `${s.totalEntries} Stimmen insgesamt` : "Keine Daten"}</div>
                        </div>
                        {hasData && (
                            <div className="text-right">
                                <div className="text-emerald-400 font-bold text-sm">Top: {topItem.value}</div>
                                <div className="text-xs text-emerald-500/50">{Math.round((topItem.count / s.totalEntries) * 100)}%</div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 space-y-3 custom-scrollbar overflow-y-auto max-h-[300px] pr-2">
                        {!hasData ? (
                            <div className="text-center text-white/20 py-10 italic">Noch keine Votes.</div>
                        ) : (
                            s.items.map((item, idx) => {
                                const percent = Math.round((item.count / s.totalEntries) * 100);
                                const rankColor = idx === 0 ? "text-amber-400" : idx === 1 ? "text-gray-300" : idx === 2 ? "text-amber-700" : "text-white/50";
                                
                                return (
                                    <div key={idx} className="group relative">
                                        <div className="flex justify-between text-sm relative z-10 mb-1">
                                            <div className="flex gap-3 font-medium">
                                                <span className={`w-4 text-right font-bold ${rankColor}`}>#{idx+1}</span>
                                                <span className="text-white/90">{item.value}</span>
                                            </div>
                                            <div className="text-white/40 font-mono text-xs">{item.count} ({percent}%)</div>
                                        </div>
                                        {/* Progress Bar Background */}
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${idx === 0 ? "bg-amber-500" : "bg-white/20"}`} 
                                                style={{ width: `${percent}%` }} 
                                            />
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            );
        })}
      </div>

      {/* Raw Data Table (Collapsibleish) */}
      <div className="mt-12 pt-8 border-t border-white/10">
         <h2 className="text-xl font-bold mb-4">Letzte Einsendungen (Log)</h2>
         <div className="bg-black/40 rounded-2xl border border-white/10 overflow-hidden">
             <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-white/70">
                     <thead className="bg-white/5 text-white/40 uppercase text-xs">
                         <tr>
                             <th className="p-4 font-medium">User</th>
                             <th className="p-4 font-medium">Updated</th>
                             <th className="p-4 font-medium text-right">Filled Categories</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {db.submissions
                            .filter(s => Number(s.season) === Number(AWARDS_SEASON))
                            .sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                            .slice(0, 50) // Limit to last 50 for performance
                            .map(sub => {
                                const filledCount = Object.keys(sub.answers || {}).length;
                                return (
                                    <tr key={sub.id} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4 font-medium text-white">{sub.twitchLogin || sub.twitchId}</td>
                                        <td className="p-4">{formatDate(sub.updatedAt)}</td>
                                        <td className="p-4 text-right font-mono">{filledCount} / {CATEGORIES.length}</td>
                                    </tr>
                                )
                            })
                        }
                     </tbody>
                 </table>
             </div>
         </div>
      </div>

    </div>
  );
}

// Icon Helper for import
function Calendar({ size, className }) { return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> }