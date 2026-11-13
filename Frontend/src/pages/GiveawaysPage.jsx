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
import { TwitchGlyph } from "../components/BrandGlyphs";
import { Page, PageHeader, Card, EmptyState, Button, Dialog, Tabs, Field, Input } from "../components/ui";

import { STREAMER_ID } from "../config/owner";
const STREAMER_LOGIN = "vnmvalentin";

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

  // Pflichtfelder im Fenster selbst anmahnen statt per alert()
  const [tried, setTried] = useState(false);
  const handleSave = () => {
      setTried(true);
      if (!form.title || !form.endDate) return;
      onSave(form);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      kicker="Giveaway"
      title="Neues Giveaway"
      footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button icon={Gift} onClick={handleSave}>Erstellen</Button></>}
    >
      <div className="space-y-4">
        <Field label="Titel" error={tried && !form.title ? "Bitte einen Titel eingeben." : undefined}>
          <Input placeholder="Was wird verlost?" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        </Field>
        <Field label="Gewinn (optional)">
          <Input placeholder="z. B. 10 € Steam-Karte" value={form.prize} onChange={e => setForm({...form, prize: e.target.value})} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Anzahl Gewinner">
            <Input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
          </Field>
          <Field label="Enddatum" error={tried && !form.endDate ? "Bitte ein Enddatum wählen." : undefined}>
            <Input type="datetime-local" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
          </Field>
        </div>
        <label className="flex items-center gap-3 p-3 bg-white/5 border border-line rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
          <input
            type="checkbox"
            className="w-4 h-4 accent-violet-500 shrink-0"
            checked={form.req_twitchFollow}
            onChange={e => setForm({...form, req_twitchFollow: e.target.checked})}
          />
          <span className="text-sm">
            <span className="block font-medium text-white">Nur für Follower</span>
            <span className="block text-xs text-white/50">Teilnehmer müssen {STREAMER_LOGIN} auf Twitch folgen</span>
          </span>
        </label>
      </div>
    </Dialog>
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
        <Card className="flex flex-col md:flex-row gap-5">

            {/* Icon Box */}
            <div className="hidden md:flex shrink-0 w-14 h-14 rounded-lg bg-accent/10 border border-accent/25 items-center justify-center">
                <Gift className="text-accent-soft" size={26} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                             <h3 className="text-lg font-bold text-white leading-tight">{giveaway.title}</h3>
                             {isAdmin && (
                                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(giveaway.id)} title="Löschen" aria-label="Löschen" className="hover:!text-red-400" />
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
                <Button
                    block
                    size="lg"
                    onClick={() => onJoin(giveaway)}
                    disabled={!!user && !joined && !met}
                    variant={!user ? "twitch" : joined ? "secondary" : "primary"}
                    icon={!user ? TwitchGlyph : undefined}
                >
                    {!user ? "Anmelden" : joined ? "Verlassen" : "Teilnehmen"}
                </Button>
                {user && !joined && !met && (
                    <div className="text-xs text-red-400 text-center mt-2">
                        Voraussetzungen fehlen
                    </div>
                )}
            </div>
        </Card>
    );
}

function ExpiredGiveawayCard({ giveaway, isAdmin, onDelete }) {
    const participants = giveaway.participants || {};
    const winners = giveaway.winners || [];
    const winnerNames = winners.map(id => participants[id]?.displayName || "Unbekannt");

    return (
        <Card className="flex flex-col gap-4">
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
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(giveaway.id)} title="Löschen" aria-label="Löschen" className="hover:!text-red-400" />
                )}
            </div>

            {/* Winners Section */}
            <div className="bg-black/20 rounded-lg p-3 border border-line">
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
        </Card>
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

  const [loadError, setLoadError] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/giveaways", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData({ active: json.active || [], expired: json.expired || [] });
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
      // Das erste Laden macht refresh() unten. Hier stand zusätzlich ein zweiter, ungeprüfter
      // Abruf, der die Antwort roh in den State schrieb — bei einer Fehlerantwort ohne
      // active/expired stürzte die Seite danach beim Sortieren ab.

      // Live Listener
      const handleUpdate = (newData) => {
          // newData hat schon die Struktur { active: [], expired: [] } vom Server
          if (!newData) return;
          setData({ active: newData.active || [], expired: newData.expired || [] });
          setLoadError(false);
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
      const body = alreadyIn ? null : JSON.stringify({ displayName: user.displayName, profileImageUrl: user.profileImageUrl });

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
    <Page width="default" className="py-4 md:py-8 min-h-[70vh]">
        <SEO title = "Giveaways"/>

        <PageHeader
            icon={Gift}
            kicker="Community"
            title="Giveaways"
            description="Aktuelle Verlosungen aus dem Stream — anmelden, teilnehmen, Daumen drücken."
            actions={isAdmin && <Button icon={Plus} onClick={() => setShowModal(true)}>Neues Giveaway</Button>}
        />

        <Tabs
            className="mb-6"
            label="Giveaways"
            value={activeTab}
            onChange={setActiveTab}
            items={[
                { value: "active", label: "Laufend", badge: activeSorted.length },
                { value: "expired", label: "Vergangen", badge: expiredSorted.length },
            ]}
        />

        {/* Content List */}
        <div className="space-y-4">
            {loadError ? (
                <EmptyState action={<Button variant="secondary" onClick={refresh}>Erneut versuchen</Button>}>
                    Die Giveaways konnten gerade nicht geladen werden.
                </EmptyState>
            ) : activeTab === "active" ? (
                activeSorted.length === 0 ? (
                    <EmptyState>Aktuell keine aktiven Giveaways.</EmptyState>
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
                    <EmptyState>Keine vergangenen Giveaways.</EmptyState>
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

        {/* Admin: Neues Giveaway (Knopf steht oben im Seitenkopf) */}
        {showModal && <CreateGiveawayModal onClose={() => setShowModal(false)} onSave={handleCreate} />}

    </Page>
  );
}
