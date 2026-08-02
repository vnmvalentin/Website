import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Plus, Trash2, Calendar, Clock, BarChart2, X, Image as ImageIcon, RefreshCw, ArrowRight, Vote } from "lucide-react";
import SEO from "../../components/SEO";
import { socket, useFeedRoom } from "../../utils/socket";

const STREAMER_ID = "160224748";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

// --- HELPER COMPONENTS ---

function PollCard({ poll, onClick, isAdmin, onDelete }) {
  const isExpired = new Date(poll.endDate) <= new Date();

  return (
    <div
      onClick={onClick}
      className="group panel flex items-center gap-4 p-3 transition-colors hover:bg-white/[0.06] hover:border-violet-400/30 cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/10">
        {poll.background ? (
          <img src={poll.background} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-violet-300/40 group-hover:text-violet-300/70 transition-colors">
            <BarChart2 size={28} />
          </div>
        )}
        {isExpired && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white/70">Beendet</div>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <h3 className="font-semibold text-white group-hover:text-white truncate pr-4">{poll.title}</h3>

        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
           <div className="flex items-center gap-1.5">
              <Calendar size={13} />
              <span>{new Date(poll.endDate).toLocaleDateString("de-DE")}</span>
           </div>
           <div className="flex items-center gap-1.5">
              <Clock size={13} />
              <span>{new Date(poll.endDate).toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})}</span>
           </div>
        </div>
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(poll.id); }}
          className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
          title="Löschen"
        >
          <Trash2 size={17} />
        </button>
      )}

      <ArrowRight size={17} className="text-white/15 group-hover:text-violet-300 group-hover:translate-x-1 transition-all shrink-0" />
    </div>
  );
}

function CreatePollModal({ onClose, onSave }) {
  const [data, setData] = useState({
    title: "",
    background: "",
    endDate: "",
    questions: [],
  });

  const addQuestion = () => {
    setData(prev => ({
        ...prev,
        questions: [...prev.questions, { id: Date.now(), question: "", type: "single", options: ["", ""] }]
    }));
  };

  const updateQuestion = (idx, field, value) => {
    const qs = [...data.questions];
    qs[idx] = { ...qs[idx], [field]: value };
    setData({ ...data, questions: qs });
  };

  const updateOption = (qIdx, oIdx, val) => {
    const qs = [...data.questions];
    const opts = [...qs[qIdx].options];
    opts[oIdx] = val;
    qs[qIdx].options = opts;
    setData({ ...data, questions: qs });
  };

  const addOption = (qIdx) => {
    const qs = [...data.questions];
    qs[qIdx].options.push("");
    setData({ ...data, questions: qs });
  };

  const removeOption = (qIdx, oIdx) => {
    const qs = [...data.questions];
    qs[qIdx].options.splice(oIdx, 1);
    setData({ ...data, questions: qs });
  };

  const removeQuestion = (idx) => {
      const qs = data.questions.filter((_, i) => i !== idx);
      setData({ ...data, questions: qs });
  };

  const handleSave = () => {
      if(!data.title || !data.endDate) return alert("Titel & Enddatum fehlen!");
      onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl panel-strong shadow-2xl shadow-black/60 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-display text-xl font-bold text-white">Neue Abstimmung</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

            {/* Metadata Section */}
            <div className="space-y-4 mb-8">
                <div>
                    <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Titel</label>
                    <input
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors placeholder:text-white/20"
                        placeholder="Worum geht es?"
                        value={data.title}
                        onChange={e => setData({...data, title: e.target.value})}
                        autoFocus
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Enddatum</label>
                        <input
                            type="datetime-local"
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none transition-colors text-sm"
                            value={data.endDate}
                            onChange={e => setData({...data, endDate: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1.5 block">Bild URL (Optional)</label>
                        <div className="relative">
                            <input
                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:border-violet-500 outline-none transition-colors placeholder:text-white/20 text-sm"
                                placeholder="https://..."
                                value={data.background}
                                onChange={e => setData({...data, background: e.target.value})}
                            />
                            <ImageIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Questions Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                     <label className="text-xs font-bold text-white/40 uppercase tracking-wider block">Fragen ({data.questions.length})</label>
                     <button onClick={addQuestion} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-white/70 hover:text-white">
                        <Plus size={14} /> Frage hinzufügen
                     </button>
                </div>

                {data.questions.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-white/10 rounded-lg bg-white/[0.02] text-white/30 text-sm">
                        Noch keine Fragen hinzugefügt.
                    </div>
                )}

                {data.questions.map((q, i) => (
                    <div key={q.id} className="bg-black/20 border border-white/10 rounded-lg p-4">
                        <div className="flex gap-3 mb-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-violet-500/10 border border-violet-400/20 text-xs font-bold text-violet-300 mt-1.5 shrink-0">{i+1}</span>
                            <div className="flex-1 space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-violet-500 outline-none transition-colors"
                                        placeholder="Deine Frage..."
                                        value={q.question}
                                        onChange={e => updateQuestion(i, 'question', e.target.value)}
                                    />
                                    <select
                                        className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-violet-500 outline-none transition-colors"
                                        value={q.type}
                                        onChange={e => updateQuestion(i, 'type', e.target.value)}
                                    >
                                        <option value="single">Single Choice</option>
                                        <option value="multiple">Multiple Choice</option>
                                        <option value="text">Freitext</option>
                                    </select>
                                    <button onClick={() => removeQuestion(i)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {q.type !== 'text' && (
                                    <div className="pl-1 space-y-2 border-l-2 border-white/10 ml-1">
                                        {q.options.map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-2 pl-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-violet-400/50 shrink-0" />
                                                <input
                                                    className="flex-1 bg-transparent border-b border-white/10 px-2 py-1 text-sm focus:border-violet-500 outline-none placeholder:text-white/15 transition-colors"
                                                    placeholder={`Option ${oi+1}`}
                                                    value={opt}
                                                    onChange={e => updateOption(i, oi, e.target.value)}
                                                />
                                                <button onClick={() => removeOption(i, oi)} className="text-white/15 hover:text-red-400 transition-colors shrink-0"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addOption(i)} className="text-xs text-violet-300 hover:text-violet-200 ml-3 pt-1 flex items-center gap-1">
                                            <Plus size={12} /> Option
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors">Abbrechen</button>
            <button onClick={handleSave} className="px-6 py-2.5 rounded-lg font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors">Speichern</button>
        </div>
      </div>
    </div>
  );
}

export default function AbstimmungPage() {
  // Vollpayload nur für diese Seite (siehe Backend/lib/liveBadges.js)
  useFeedRoom("polls");
  const { user, login } = useContext(TwitchAuthContext);
  const navigate = useNavigate();

  const [polls, setPolls] = useState([]);
  const [activeTab, setActiveTab] = useState("active"); // 'active' | 'expired'
  const [showModal, setShowModal] = useState(false);

  const isAdmin = useMemo(() => {
    return !!user && String(user.id) === String(STREAMER_ID);
  }, [user]);

  // Load Polls
  useEffect(() => {
    // Initial laden
    fetch("/api/polls", { credentials: "include" })
      .then(r => r.json())
      .then(d => setPolls(d));

    // Live Updates
    const handleUpdate = (updatedList) => {
        if(Array.isArray(updatedList)) {
            setPolls(updatedList);
        }
    };

    socket.on("polls_update", handleUpdate);
    return () => socket.off("polls_update", handleUpdate);
  }, []);

  const refreshPolls = async () => {
    try {
      const res = await fetch("/api/polls", { credentials: "include" });
      const data = await res.json();
      setPolls(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Reload Error:", e);
    }
  };

  const handleCreate = async (newPollData) => {
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPollData),
      });

      if (!res.ok) throw new Error("Failed to create");
      setShowModal(false);
    } catch {
      alert("Fehler beim Erstellen.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Wirklich löschen?")) return;
    try {
      await fetch(`/api/polls/${id}`, { method: "DELETE", credentials: "include" });
    } catch {
      alert("Fehler beim Löschen.");
    }
  };

  const now = new Date();

  // Filtern & Sortieren
  const activePolls = polls
      .filter((p) => new Date(p.endDate) > now)
      .sort((a,b) => new Date(a.endDate) - new Date(b.endDate)); // Die am ehesten enden zuerst

  const expiredPolls = polls
      .filter((p) => new Date(p.endDate) <= now)
      .sort((a,b) => new Date(b.endDate) - new Date(a.endDate)); // Neueste zuerst

  const displayPolls = activeTab === "active" ? activePolls : expiredPolls;

  return (
    <div className="page-fade max-w-4xl mx-auto px-2 md:px-4 py-8 md:py-12 min-h-[80vh]">
      <SEO title = "Abstimmungen"/>

      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4 mb-10">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
          <Vote size={26} />
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">Abstimmungen</h1>

        {/* Underline Tabs */}
        <div className="flex border-b border-white/10 mt-2">
          <button
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "active" ? "border-violet-400 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}
            onClick={() => setActiveTab("active")}
          >
            Laufend ({activePolls.length})
          </button>
          <button
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === "expired" ? "border-violet-400 text-white" : "border-transparent text-white/40 hover:text-white/70"}`}
            onClick={() => setActiveTab("expired")}
          >
            Vergangen ({expiredPolls.length})
          </button>
        </div>
      </div>

      {/* List Area */}
      <div className="space-y-3">
          {displayPolls.length === 0 ? (
              <div className="text-center py-20 text-white/30 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                 {activeTab === "active" ? "Keine aktiven Abstimmungen." : "Keine vergangenen Abstimmungen."}
              </div>
          ) : (
              displayPolls.map(poll => (
                  <PollCard
                    key={poll.id}
                    poll={poll}
                    isAdmin={isAdmin}
                    onDelete={handleDelete}
                    onClick={() => navigate(`/Abstimmungen/${poll.id}`)}
                  />
              ))
          )}
      </div>

      {/* Admin Floating Action Button */}
      {isAdmin ? (
          <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
              <button
                onClick={refreshPolls}
                className="w-10 h-10 rounded-xl panel-strong text-white/50 hover:text-white flex items-center justify-center transition-colors"
                title="Reload"
              >
                  <RefreshCw size={17} />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors shadow-lg shadow-violet-950/40"
                title="Neue Abstimmung"
              >
                  <Plus size={20} />
              </button>
          </div>
      ) : (
         !user && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                <button onClick={() => login(false)} className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-black/40">
                    <TwitchGlyph className="w-3.5 h-3.5" /> Admin Login
                </button>
            </div>
         )
      )}

      {/* Modal */}
      {showModal && (
          <CreatePollModal onClose={() => setShowModal(false)} onSave={handleCreate} />
      )}

    </div>
  );
}
