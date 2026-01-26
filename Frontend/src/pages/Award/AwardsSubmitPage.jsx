import React, { useEffect, useState, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Check, ChevronRight, Save, Trophy, AlertCircle, ChevronLeft } from "lucide-react";

const SEASON = 2026;
const STREAMER_ID = "160224748"; 

const MOD_OPTIONS = ["flluffattack", "gh0stqq", "paraskiill"];

const CATEGORIES = [
  { id: "best-chatter", label: "Best Twitch-Chatter", description: "Wer war dieses Jahr im Chat am aktivsten / nettesten?" },
  { id: "worst-chatter", label: "Worst Twitch-Chatter", description: "Nervigster / toxischster Chatter" },
  { id: "best-mod", label: "Best Twitch-Mod", description: "Welcher Mod hat am meisten geglänzt?", type: "mod" },
  { id: "worst-mod", label: "Worst Twitch-Mod", description: "Wer trollt am meisten im Mod-Team?", type: "mod" },
  { id: "best-vip", label: "Best VIP", description: "Welcher VIP ist dir am stärksten im Gedächtnis geblieben?" },
  { id: "best-stream-game", label: "Best Stream Game", description: "Welches Spiel war im Stream dieses Jahr am besten?" },
  { id: "best-event", label: "Best Event", description: "Special Streams, Community-Aktionen" },
  { id: "best-clip", label: "Best Clip", description: "Links zu Clips, durch Kommas getrennt (z.B. aus Twitch)." },
  { id: "best-new-viewer", label: "Best New Viewer", description: "Neuer Stammgast des Jahres." },
  { id: "best-meme", label: "Best Meme / Running Gag", description: "Insider, Meme, Running Gag aus dem Stream." },
  { id: "best-community-moment", label: "Community-Moment des Jahres", description: "Schönster Community-Moment." },
];

export default function AwardsSubmitPage() {
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);

  const [activeCatId, setActiveCatId] = useState(CATEGORIES[0].id);
  const [formData, setFormData] = useState({});
  const [loadingData, setLoadingData] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const isAdmin = !!user && String(user.twitchId) === STREAMER_ID;

  // 1. Initialisieren
  useEffect(() => {
    const initial = {};
    CATEGORIES.forEach((c) => { initial[c.id] = ""; });
    setFormData(initial);
  }, []);

  // 2. Daten laden wenn User da
  useEffect(() => {
    if (!user) {
      setLastSavedAt(null);
      setSubmitSuccess(false);
      return;
    }

    async function fetchSubmission() {
      setLoadingData(true);
      try {
        const res = await fetch("/api/awards/submissions/me", { credentials: "include" });
        if (!res.ok) return;

        const data = await res.json();
        if (!data || !data.answers) return;

        const newForm = {};
        CATEGORIES.forEach((cat) => {
          const raw = data.answers[cat.id];
          if (Array.isArray(raw)) {
            newForm[cat.id] = cat.type === "mod" ? (raw[0] || "") : raw.join(", ");
          } else {
            newForm[cat.id] = typeof raw === "string" ? raw : "";
          }
        });

        setFormData((prev) => ({ ...prev, ...newForm }));
        if (data.updatedAt) setLastSavedAt(new Date(data.updatedAt));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    }
    fetchSubmission();
  }, [user]);

  const handleChange = (val) => {
    setFormData(prev => ({ ...prev, [activeCatId]: val }));
    setSubmitSuccess(false); // Reset success state on edit
  };

  const handleSubmit = async () => {
    if (!user) return login();
    setSubmitError(null);
    setSubmitSuccess(false);
    setSubmitting(true);

    const answers = {};
    let hasAny = false;
    for (const cat of CATEGORIES) {
      const raw = (formData[cat.id] || "").trim();
      if (!raw) continue;
      answers[cat.id] = raw;
      hasAny = true;
    }

    try {
      const res = await fetch("/api/awards/submissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: SEASON, answers: hasAny ? answers : {} }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Fehler");

      if (hasAny) setLastSavedAt(new Date(data.updatedAt || Date.now()));
      else setLastSavedAt(null);
      
      setSubmitSuccess(true);
      // Timeout für Success Message entfernen nach 3s
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (e) {
      setSubmitError("Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  };

  // Navigation Logic
  const activeIndex = CATEGORIES.findIndex(c => c.id === activeCatId);
  const activeCat = CATEGORIES[activeIndex];
  
  const goNext = () => {
    if (activeIndex < CATEGORIES.length - 1) setActiveCatId(CATEGORIES[activeIndex + 1].id);
  };
  const goPrev = () => {
    if (activeIndex > 0) setActiveCatId(CATEGORIES[activeIndex - 1].id);
  };

  // Progress Calc
  const filledCount = CATEGORIES.filter(c => !!formData[c.id]?.trim()).length;
  const progressPercent = Math.round((filledCount / CATEGORIES.length) * 100);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-[85vh] flex flex-col gap-6">
      
      {/* Header Mobile / Tablet */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
               <Trophy className="text-yellow-500" />
               aVards {SEASON}
            </h1>
            <p className="text-white/50 text-sm mt-1">
               Reiche deine Highlights ein. ({filledCount}/{CATEGORIES.length} ausgefüllt)
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             {isAdmin && (
                <button onClick={() => navigate("/avards-admin")} className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10">
                    Admin Panel
                </button>
             )}
             {!user && (
                 <button onClick={login} className="bg-[#9146FF] hover:bg-[#772ce8] px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20">
                    Login mit Twitch
                 </button>
             )}
          </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:h-[600px]">
        
        {/* LEFT SIDEBAR (Navigation) */}
        <div className="lg:w-80 shrink-0 flex flex-col bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
           <div className="p-4 border-b border-white/5 bg-black/20">
              <div className="flex justify-between text-xs text-white/50 mb-1">
                 <span>Fortschritt</span>
                 <span>{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
           </div>
           
           <div className="flex-1 overflow-x-auto lg:overflow-y-auto custom-scrollbar flex lg:flex-col p-2 gap-1 scroll-smooth">
              {CATEGORIES.map((cat) => {
                  const isFilled = !!formData[cat.id]?.trim();
                  const isActive = activeCatId === cat.id;
                  
                  return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCatId(cat.id)}
                        className={`
                            shrink-0 lg:w-full text-left px-4 py-3 rounded-xl flex items-center justify-between gap-3 transition-all relative
                            ${isActive ? "bg-white/10 text-white shadow-md border border-white/5" : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"}
                        `}
                      >
                         <span className="truncate text-sm font-medium">{cat.label}</span>
                         {isFilled && <div className="p-0.5 rounded-full bg-green-500/20 text-green-400"><Check size={12} strokeWidth={3} /></div>}
                         {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-violet-500 rounded-r-full hidden lg:block" />}
                      </button>
                  );
              })}
           </div>
        </div>

        {/* RIGHT CONTENT (Form) */}
        <div className="flex-1 bg-[#18181b] border border-white/10 rounded-2xl p-6 md:p-10 shadow-xl flex flex-col relative overflow-hidden">
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 p-20 bg-violet-500/5 blur-[100px] rounded-full pointer-events-none" />

            {/* Category Header */}
            <div className="mb-6 relative z-10">
               <div className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Kategorie {activeIndex + 1} von {CATEGORIES.length}</div>
               <h2 className="text-3xl font-bold text-white mb-2">{activeCat.label}</h2>
               <p className="text-white/60 text-lg leading-relaxed">{activeCat.description}</p>
            </div>

            {/* Input Area */}
            <div className="flex-1 relative z-10">
                {!user ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-black/20 rounded-2xl border border-dashed border-white/10">
                        <AlertCircle size={40} className="text-white/20 mb-4" />
                        <p className="text-white/50 mb-4">Bitte logge dich ein, um teilzunehmen.</p>
                        <button onClick={login} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-semibold">Login</button>
                    </div>
                ) : (
                    <>
                        {activeCat.type === "mod" ? (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white/70">Wähle einen Mod:</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {MOD_OPTIONS.map(mod => (
                                        <button
                                            key={mod}
                                            onClick={() => handleChange(mod)}
                                            className={`px-4 py-3 rounded-xl border text-left transition-all ${formData[activeCat.id] === mod ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-900/20" : "bg-white/5 border-white/10 hover:border-white/20"}`}
                                        >
                                            {mod}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white/70">Deine Antwort:</label>
                                <textarea 
                                    className="w-full h-40 bg-black/30 border border-white/10 rounded-2xl p-5 text-base focus:border-white/30 focus:ring-1 focus:ring-white/20 outline-none resize-none transition-all placeholder:text-white/10"
                                    placeholder="Schreibe hier..."
                                    value={formData[activeCat.id] || ""}
                                    onChange={e => handleChange(e.target.value)}
                                    autoFocus
                                />
                                <div className="text-xs text-white/30 text-right">Mehrere Nennungen mit Komma trennen.</div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer Navigation & Save */}
            <div className="pt-6 mt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 relative z-10">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={goPrev} 
                        disabled={activeIndex === 0}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        <ChevronLeft size={18} /> Zurück
                    </button>
                    <button 
                        onClick={goNext}
                        disabled={activeIndex === CATEGORIES.length - 1}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        Weiter <ChevronRight size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {submitSuccess && <span className="text-sm text-green-400 font-medium animate-in fade-in slide-in-from-right-4">Gespeichert!</span>}
                    {submitError && <span className="text-sm text-red-400 font-medium">{submitError}</span>}
                    
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !user}
                        className={`
                            px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95
                            ${submitting ? "bg-white/10 cursor-wait" : "bg-white text-black hover:bg-gray-200"}
                            ${!user ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                    >
                        <Save size={18} />
                        {submitting ? "..." : "Alles Speichern"}
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}