import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Plus, Trash2, Calendar, Clock, BarChart2, X, Check, Image as ImageIcon } from "lucide-react";

const STREAMER_ID = "160224748";

// --- HELPER COMPONENTS ---

function PollCard({ poll, onClick, isAdmin, onDelete }) {
  const isExpired = new Date(poll.endDate) <= new Date();
  
  return (
    <div 
      onClick={onClick}
      className="group relative flex items-center gap-4 bg-[#18181b] hover:bg-[#202023] border border-white/10 rounded-2xl p-3 transition-all cursor-pointer hover:border-white/20 hover:shadow-lg active:scale-[0.99]"
    >
      {/* Thumbnail */}
      <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/5">
        {poll.background ? (
          <img src={poll.background} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/10 group-hover:text-white/20 transition-colors">
            <BarChart2 size={32} />
          </div>
        )}
        {isExpired && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold uppercase tracking-wider text-white/70">Beendet</div>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <h3 className="text-lg font-bold text-white group-hover:text-white/90 truncate pr-4">{poll.title}</h3>
        
        <div className="flex items-center gap-4 mt-2 text-xs text-white/50">
           <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{new Date(poll.endDate).toLocaleDateString("de-DE")}</span>
           </div>
           <div className="flex items-center gap-1.5">
              <Clock size={14} />
              <span>{new Date(poll.endDate).toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})}</span>
           </div>
        </div>
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(poll.id); }}
          className="p-2 mr-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Löschen"
        >
          <Trash2 size={18} />
        </button>
      )}

      {/* Chevron Icon for Hint */}
      <div className="mr-2 text-white/10 group-hover:text-white/30 transition-colors">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
    </div>
  );
}

function CreatePollModal({ onClose, onSave }) {
  const [step, setStep] = useState(1);
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
      
      <div className="relative w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-xl font-bold">Neue Abstimmung</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            
            {/* Metadata Section */}
            <div className="space-y-4 mb-8">
                <div>
                    <label className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Titel</label>
                    <input 
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-white/30 outline-none transition-colors placeholder:text-white/20"
                        placeholder="Worum geht es?"
                        value={data.title}
                        onChange={e => setData({...data, title: e.target.value})}
                        autoFocus
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Enddatum</label>
                        <input 
                            type="datetime-local"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-white/30 outline-none transition-colors text-sm"
                            value={data.endDate}
                            onChange={e => setData({...data, endDate: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5 block">Bild URL (Optional)</label>
                        <div className="relative">
                            <input 
                                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:border-white/30 outline-none transition-colors placeholder:text-white/20 text-sm"
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
                     <label className="text-xs font-bold text-white/50 uppercase tracking-wider block">Fragen ({data.questions.length})</label>
                     <button onClick={addQuestion} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                        <Plus size={14} /> Frage hinzufügen
                     </button>
                </div>

                {data.questions.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-white/10 rounded-xl bg-white/5 text-white/30 text-sm">
                        Noch keine Fragen hinzugefügt.
                    </div>
                )}

                {data.questions.map((q, i) => (
                    <div key={q.id} className="bg-white/5 border border-white/5 rounded-xl p-4 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex gap-3 mb-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold text-white/50 mt-1.5">{i+1}</span>
                            <div className="flex-1 space-y-3">
                                <div className="flex gap-2">
                                    <input 
                                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-white/30 outline-none"
                                        placeholder="Deine Frage..."
                                        value={q.question}
                                        onChange={e => updateQuestion(i, 'question', e.target.value)}
                                    />
                                    <select 
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-white/30 outline-none"
                                        value={q.type}
                                        onChange={e => updateQuestion(i, 'type', e.target.value)}
                                    >
                                        <option value="single">Single Choice</option>
                                        <option value="multiple">Multiple Choice</option>
                                        <option value="text">Freitext</option>
                                    </select>
                                    <button onClick={() => removeQuestion(i)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {q.type !== 'text' && (
                                    <div className="pl-1 space-y-2 border-l-2 border-white/5 ml-1">
                                        {q.options.map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-2 pl-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                <input 
                                                    className="flex-1 bg-transparent border-b border-white/10 px-2 py-1 text-sm focus:border-white/30 outline-none placeholder:text-white/10"
                                                    placeholder={`Option ${oi+1}`}
                                                    value={opt}
                                                    onChange={e => updateOption(i, oi, e.target.value)}
                                                />
                                                <button onClick={() => removeOption(i, oi)} className="text-white/10 hover:text-red-400 transition-colors"><X size={14} /></button>
                                            </div>
                                        ))}
                                        <button onClick={() => addOption(i)} className="text-xs text-blue-400 hover:text-blue-300 ml-3 pt-1 flex items-center gap-1">
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
        <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-[#121212]">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors">Abbrechen</button>
            <button onClick={handleSave} className="px-6 py-2.5 rounded-xl font-bold bg-white text-black hover:bg-gray-200 transition-colors shadow-lg">Speichern</button>
        </div>
      </div>
    </div>
  );
}

export default function AbstimmungPage() {
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
    fetch("/api/polls", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setPolls(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Fehler beim Laden der Polls:", err));
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
      
      const created = await res.json();
      setPolls(prev => [...prev, created]);
      setShowModal(false);
    } catch (err) {
      alert("Fehler beim Erstellen.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Wirklich löschen?")) return;
    try {
      await fetch(`/api/polls/${id}`, { method: "DELETE", credentials: "include" });
      setPolls(s => s.filter(p => p.id !== id));
    } catch (e) {
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
    <div className="max-w-4xl mx-auto p-6 min-h-[80vh]">
      
      {/* Header Area */}
      <div className="flex flex-col items-center mb-10">
        <h1 className="text-4xl font-black tracking-tight mb-6">ABSTIMMUNGEN</h1>
        
        {/* Tabs */}
        <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
          <button 
            className={`px-6 py-2 rounded-xl font-medium transition-all ${activeTab === "active" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white"}`} 
            onClick={() => setActiveTab("active")}
          >
            Laufend ({activePolls.length})
          </button>
          <button 
            className={`px-6 py-2 rounded-xl font-medium transition-all ${activeTab === "expired" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white"}`} 
            onClick={() => setActiveTab("expired")}
          >
            Vergangen ({expiredPolls.length})
          </button>
        </div>
      </div>

      {/* List Area */}
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {displayPolls.length === 0 ? (
              <div className="text-center py-20 text-white/30 border border-dashed border-white/10 rounded-3xl bg-white/5">
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
                className="w-12 h-12 rounded-full bg-[#18181b] border border-white/10 text-white/50 hover:text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
                title="Reload"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              </button>
              <button 
                onClick={() => setShowModal(true)}
                className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-900/30 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                title="Neue Abstimmung"
              >
                  <Plus size={28} />
              </button>
          </div>
      ) : (
         !user && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
                <button onClick={login} className="px-4 py-2 bg-white/10 backdrop-blur rounded-full border border-white/10 text-xs font-semibold hover:bg-white/20 transition-colors">
                    Admin Login
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