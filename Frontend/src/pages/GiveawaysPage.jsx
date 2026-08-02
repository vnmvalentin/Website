import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import {
  Gift,
  Users,
  Plus,
  Trash2,
  Trophy,
  Check,
  X,
  Clock,
} from "lucide-react";
import { socket, useFeedRoom } from "../utils/socket";
import SEO from "../components/SEO";

const STREAMER_ID = "160224748"; // deine Twitch-ID
const STREAMER_LOGIN = "vnmvalentin";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

const REQUIREMENT_TEMPLATES = [
  {
    id: "twitch-follow",
    type: "twitch-follow",
    label: "Twitch-Follower",
    data: {
      channelId: STREAMER_ID,
      channelLogin: STREAMER_LOGIN,
      channelUrl: `https://twitch.tv/${STREAMER_LOGIN}`,
    },
  },
];

// --- HELPERS ---

function formatDate(dt) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Nutzt den neuen Helix-Endpoint: channels/followed
async function isFollowingChannel({ userId, broadcasterId, accessToken, clientId }) {
  if (!userId || !broadcasterId || !accessToken || !clientId) return false;
  try {
    const params = new URLSearchParams({
      user_id: String(userId),
      broadcaster_id: String(broadcasterId),
      first: "1",
    });
    const res = await fetch(
      "https://api.twitch.tv/helix/channels/followed?" + params.toString(),
      { headers: { "Client-ID": clientId, Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.data) && data.data.length > 0;
  } catch {
    return false;
  }
}

// --- COMPONENTS ---

function CreateGiveawayModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    title: "",
    prize: "",
    quantity: 1,
    endDate: "",
    req_twitchFollow: false,
  });

  const handleSave = () => {
      if (!form.title || !form.endDate) return alert("Titel und Enddatum sind Pflicht.");
      onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg panel-strong shadow-2xl shadow-black/60 flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2"><Gift className="text-violet-300" size={20} /> Neues Giveaway</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
            <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Titel</label>
                <input
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors placeholder:text-white/20"
                    placeholder="Was wird verlost?"
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                    autoFocus
                />
            </div>

            <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Gewinn (Optional)</label>
                <input
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors placeholder:text-white/20"
                    placeholder="z.B. 10€ Steam Karte"
                    value={form.prize}
                    onChange={e => setForm({...form, prize: e.target.value})}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Anzahl Gewinner</label>
                    <input
                        type="number" min="1"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors"
                        value={form.quantity}
                        onChange={e => setForm({...form, quantity: e.target.value})}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Enddatum</label>
                    <input
                        type="datetime-local"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors text-sm"
                        value={form.endDate}
                        onChange={e => setForm({...form, endDate: e.target.value})}
                    />
                </div>
            </div>

            <div className="pt-2">
                <label className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-white/20 bg-black/50 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
                        checked={form.req_twitchFollow}
                        onChange={e => setForm({...form, req_twitchFollow: e.target.checked})}
                    />
                    <div className="text-sm">
                        <span className="block font-medium text-white">Twitch Follower Only</span>
                        <span className="block text-xs text-white/50">Teilnehmer müssen {STREAMER_LOGIN} folgen</span>
                    </div>
                </label>
            </div>
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors">Abbrechen</button>
            <button onClick={handleSave} className="px-6 py-2.5 rounded-lg font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors">Erstellen</button>
        </div>
      </div>
    </div>
  );
}

function ActiveGiveawayCard({ giveaway, user, onJoin, isAdmin, onDelete, requirementsCheck }) {
    const participants = giveaway.participants || {};
    const count = Object.keys(participants).length;
    const joined = user && !!participants[user.id];

    // Prüfen ob Requirements erfüllt sind
    const reqs = giveaway.requirements || [];
    const met = reqs.every(r => requirementsCheck(r));

    return (
        <div className="group panel p-5 transition-colors hover:bg-white/[0.05] flex flex-col md:flex-row gap-5">

            {/* Icon Box */}
            <div className="hidden md:flex shrink-0 w-16 h-16 rounded-xl bg-violet-500/10 border border-violet-400/20 items-center justify-center">
                <Gift className="text-violet-300" size={30} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                             <h3 className="text-lg font-bold text-white leading-tight">{giveaway.title}</h3>
                             {isAdmin && (
                                <button onClick={() => onDelete(giveaway.id)} className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Löschen">
                                    <Trash2 size={15} />
                                </button>
                             )}
                        </div>
                        {giveaway.prize && (
                            <div className="text-emerald-400 font-medium text-sm mb-2 flex items-center gap-1.5">
                                <Trophy size={14} />
                                <span>Gewinn: <span className="text-white font-bold">{giveaway.prize}</span></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 mt-2">
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                        <Users size={13} />
                        <span>{count} Teilnehmer</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                        <Clock size={13} />
                        <span>Endet: {formatDate(giveaway.endDate)}</span>
                    </div>
                    {giveaway.quantity > 1 && (
                        <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                            <Gift size={13} />
                            <span>{giveaway.quantity} Gewinner</span>
                        </div>
                    )}
                </div>

                {/* Requirements Chips */}
                {reqs.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {reqs.map((r, i) => {
                             const ok = requirementsCheck(r);
                             return (
                                 <div key={i} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border flex items-center gap-1 ${ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                                     {ok ? <Check size={10} /> : <X size={10} />}
                                     {r.label || r.type}
                                 </div>
                             )
                        })}
                    </div>
                )}
            </div>

            {/* Action Button */}
            <div className="flex flex-col justify-center items-stretch md:w-44 shrink-0">
                <button
                    onClick={() => onJoin(giveaway)}
                    disabled={user && !met}
                    className={`
                        w-full py-3 px-4 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2
                        ${!user ? "bg-[#9146FF] hover:bg-[#7c3aed] text-white" :
                          joined ? "bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20" :
                          met ? "bg-violet-600 hover:bg-violet-500 text-white" :
                          "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"}
                    `}
                >
                    {!user ? <><TwitchGlyph className="w-4 h-4" /> Login</> : joined ? "Verlassen" : "Teilnehmen"}
                </button>
                {user && !met && (
                    <div className="text-[10px] text-red-400 text-center mt-2">
                        Voraussetzungen fehlen
                    </div>
                )}
            </div>
        </div>
    );
}

function ExpiredGiveawayCard({ giveaway, isAdmin, onDelete }) {
    const participants = giveaway.participants || {};
    const winners = giveaway.winners || [];
    const winnerNames = winners.map(id => participants[id]?.displayName || "Unbekannt");

    return (
        <div className="panel p-5 flex flex-col gap-4 opacity-80 hover:opacity-100 transition-opacity">
            <div className="flex justify-between items-start">
                <div>
                     <h3 className="text-base font-bold text-white/80">{giveaway.title}</h3>
                     <div className="text-xs text-white/40 mt-1 flex items-center gap-2">
                        <span>Beendet am {formatDate(giveaway.endDate)}</span>
                        <span>•</span>
                        <span>{Object.keys(participants).length} Teilnehmer</span>
                     </div>
                </div>
                {isAdmin && (
                    <button onClick={() => onDelete(giveaway.id)} className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={15} />
                    </button>
                )}
            </div>

            {/* Winners Section */}
            <div className="bg-black/20 rounded-lg p-3 border border-white/10">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                    <Trophy size={12} /> Gewinner
                </div>
                {winnerNames.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {winnerNames.map((name, i) => (
                            <div key={i} className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-200 text-sm font-medium">
                                {name}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-white/30 italic">Noch nicht ausgelost oder keine Teilnehmer.</div>
                )}
            </div>
        </div>
    );
}

// --- MAIN PAGE ---

export default function GiveawaysPage() {
  // Vollpayload nur für diese Seite (siehe Backend/lib/liveBadges.js)
  useFeedRoom("giveaways");
  const { user, clientId, accessToken, login } = useContext(TwitchAuthContext);

  const [data, setData] = useState({ active: [], expired: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const [showModal, setShowModal] = useState(false);

  // Follower State
  const [followState, setFollowState] = useState({ loading: false, ok: false });

  const isAdmin = !!user && String(user.id) === String(STREAMER_ID);

  const refresh = async () => {
    try {
      const res = await fetch("/api/giveaways", { credentials: "include" });
      const json = await res.json();
      setData({ active: json.active || [], expired: json.expired || [] });
    } catch (e) {
      console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      // Initial
      fetch("/api/giveaways", { credentials: "include" })
        .then(r => r.json())
        .then(setData);

      // Live Listener
      const handleUpdate = (newData) => {
          // newData hat schon die Struktur { active: [], expired: [] } vom Server
          setData(newData);
      };

      socket.on("giveaways_update", handleUpdate);
      return () => socket.off("giveaways_update", handleUpdate);
  }, []);

  useEffect(() => { refresh(); }, []);

  // Twitch Follow Check
  useEffect(() => {
    if (!user || !accessToken || !clientId) {
      setFollowState({ loading: false, ok: false });
      return;
    }
    let cancelled = false;
    const check = async () => {
      setFollowState({ loading: true, ok: false });
      const ok = await isFollowingChannel({ userId: user.id, broadcasterId: STREAMER_ID, accessToken, clientId });
      if (!cancelled) setFollowState({ loading: false, ok });
    };
    check();
    return () => { cancelled = true; };
  }, [user?.id, accessToken, clientId]);

  // Cleanup wenn Requirements wegfallen (Auto-Leave)
  useEffect(() => {
    if (!user || followState.loading || followState.ok) return;

    const cleanup = async () => {
        const toLeave = (data.active || []).filter(g => {
            const joined = g.participants && g.participants[user.id];
            const hasFollowReq = (g.requirements || []).some(r => r.type === "twitch-follow");
            return joined && hasFollowReq;
        });
        if (toLeave.length === 0) return;

        for (const g of toLeave) {
             await fetch(`/api/giveaways/${g.id}/leave`, { method: "POST", credentials: "include" }).catch(()=>{});
        }
        refresh();
    };
    cleanup();
  }, [user?.id, followState.ok, followState.loading, data.active]);

  const handleCreate = async (formData) => {
      const reqs = [];
      if (formData.req_twitchFollow) reqs.push(REQUIREMENT_TEMPLATES[0]);

      try {
        const res = await fetch("/api/giveaways", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: formData.title,
                prize: formData.prize,
                quantity: parseInt(formData.quantity || 1, 10),
                endDate: formData.endDate,
                requirements: reqs,
            }),
        });
        if (!res.ok) throw new Error("Fehler");
        setShowModal(false);
      } catch {
          alert("Fehler beim Erstellen.");
      }
  };

  const handleDelete = async (id) => {
      if(!window.confirm("Löschen?")) return;
      await fetch(`/api/giveaways/${id}`, { method: "DELETE", credentials: "include" });
  };

  const checkRequirement = (r) => {
      if (r.type === "twitch-follow") return !!followState.ok;
      return false;
  };

  const allReqsMet = (g) => {
      if (!g.requirements || !g.requirements.length) return true;
      return g.requirements.every(r => checkRequirement(r));
  };

  const handleJoinToggle = async (g) => {
      if (!user) {
          if(window.confirm("Zum Teilnehmen bitte mit Twitch einloggen.")) login();
          return;
      }

      const participants = g.participants || {};
      const alreadyIn = !!participants[user.id];

      if (!alreadyIn && !allReqsMet(g)) return alert("Voraussetzungen nicht erfüllt.");

      const url = alreadyIn ? `/api/giveaways/${g.id}/leave` : `/api/giveaways/${g.id}/join`;
      const body = alreadyIn ? null : JSON.stringify({ displayName: user.display_name, profileImageUrl: user.profile_image_url });

      try {
          const res = await fetch(url, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body
          });
          if(!res.ok) throw new Error("Fehler");
      } catch {
          alert("Aktion fehlgeschlagen.");
      }
  };

  if(loading) return <div className="p-20 text-center text-white/30 animate-pulse">Lade Giveaways...</div>;

  // Sortierung
  const activeSorted = [...data.active].sort((a,b) => new Date(a.endDate) - new Date(b.endDate));
  const expiredSorted = [...data.expired].sort((a,b) => new Date(b.endDate) - new Date(a.endDate));

  return (
    <div className="page-fade max-w-4xl mx-auto px-2 md:px-4 py-8 md:py-12 min-h-[80vh]">
        <SEO title = "Giveaways"/>

        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-10">
            <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
              <Gift size={26} />
            </span>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">Giveaways</h1>

            {/* Underline Tabs */}
            <div className="flex border-b border-white/10 mt-2">
            <button
                className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "active" ? "border-violet-400 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}
                onClick={() => setActiveTab("active")}
            >
                Laufend ({activeSorted.length})
            </button>
            <button
                className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "expired" ? "border-violet-400 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}
                onClick={() => setActiveTab("expired")}
            >
                Vergangen ({expiredSorted.length})
            </button>
            </div>
        </div>

        {/* Content List */}
        <div className="space-y-4">
            {activeTab === "active" ? (
                activeSorted.length === 0 ? (
                    <div className="text-center py-20 text-white/30 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                        Aktuell keine aktiven Giveaways.
                    </div>
                ) : (
                    activeSorted.map(g => (
                        <ActiveGiveawayCard
                            key={g.id}
                            giveaway={g}
                            user={user}
                            onJoin={handleJoinToggle}
                            onDelete={handleDelete}
                            isAdmin={isAdmin}
                            requirementsCheck={checkRequirement}
                        />
                    ))
                )
            ) : (
                expiredSorted.length === 0 ? (
                    <div className="text-center py-20 text-white/30 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                        Keine vergangenen Giveaways.
                    </div>
                ) : (
                    expiredSorted.map(g => (
                        <ExpiredGiveawayCard
                            key={g.id}
                            giveaway={g}
                            isAdmin={isAdmin}
                            onDelete={handleDelete}
                        />
                    ))
                )
            )}
        </div>

        {/* Admin Floating Button */}
        {isAdmin && (
            <div className="fixed bottom-8 right-8 z-40">
                <button
                    onClick={() => setShowModal(true)}
                    className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors shadow-lg shadow-violet-950/40"
                    title="Neues Giveaway"
                >
                    <Plus size={20} />
                </button>
            </div>
        )}

        {/* Admin Modal */}
        {showModal && <CreateGiveawayModal onClose={() => setShowModal(false)} onSave={handleCreate} />}

    </div>
  );
}
