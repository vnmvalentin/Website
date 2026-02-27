// src/pages/Card/CardSuggestionsPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { 
  Lightbulb, 
  Plus, 
  Send, 
  X, 
  ThumbsUp, 
  ThumbsDown, 
  Trash2,
  MessageSquare,
  Sparkles
} from "lucide-react";

// --- NEUE SELTENHEITEN OHNE KATEGORIEN ---
const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "mythic",
  "legendary",
  "secret",
  "divine"
];

const RARITY_LABELS = {
  common: "Gewöhnlich",
  uncommon: "Ungewöhnlich",
  rare: "Selten",
  epic: "Episch",
  mythic: "Mythisch",
  legendary: "Legendär",
  secret: "Geheim",
  divine: "Göttlich",
};

const RARITY_COLORS = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  mythic: "text-pink-400",
  secret: "text-red-400",
  legendary: "text-yellow-400",
  divine: "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]"
};

export default function CardSuggestionsPage() {
  const { user } = useContext(TwitchAuthContext);
  const userIsStreamer = user && String(user.id) === "160224748";

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rarity, setRarity] = useState("common");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchSuggestions = async () => {
    try {
      const res = await fetch("/api/cards/suggestions");
      setSuggestions(await res.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim()) return setError("Bitte gib deiner Idee einen Namen.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/cards/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Wir senden "Katze" als Platzhalter, damit das Backend (das noch "category" verlangt) glücklich ist
        body: JSON.stringify({ title, description, category: "Katze", rarity }),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Senden.");

      setSuccess("Dein Vorschlag wurde erfolgreich eingereicht!");
      setTitle("");
      setDescription("");
      setRarity("common");
      setShowForm(false);
      fetchSuggestions();

      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Vorschlag wirklich löschen?")) return;
    try {
      await fetch(`/api/cards/suggestions/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      fetchSuggestions();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="text-center text-white/50 p-20">Lade Vorschläge...</div>;

  return (
    <div className="w-full">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
             <Lightbulb className="text-orange-400" size={32} /> Katzen Ideen
          </h1>
          <p className="text-white/50 mt-1">
            Reiche deine Ideen für neue Karten ein oder bewerte die Vorschläge der Community.
          </p>
        </div>
        <button 
            onClick={() => setShowForm(!showForm)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg ${showForm ? "bg-white/10 text-white hover:bg-white/20" : "bg-orange-500 hover:bg-orange-400 text-black shadow-orange-900/20"}`}
        >
            {showForm ? <><X size={18}/> Abbrechen</> : <><Plus size={18}/> Idee einreichen</>}
        </button>
      </div>

      {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 text-green-400 font-bold rounded-xl flex items-center gap-3 animate-in fade-in">
              <Sparkles size={20} /> {success}
          </div>
      )}

      {/* FORMULAR */}
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${showForm ? "max-h-[800px] opacity-100 mb-8" : "max-h-0 opacity-0 m-0"}`}>
          <form onSubmit={handleSubmit} className="bg-[#18181b] border border-orange-500/30 rounded-3xl p-6 md:p-8 shadow-2xl relative">
              <div className="absolute top-0 right-0 p-32 bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
              
              <h2 className="text-2xl font-bold text-white mb-6">Neue Katze erschaffen</h2>

              {error && <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-bold">{error}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 relative z-10">
                  <div className="space-y-6">
                      <div>
                          <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Name der Katze *</label>
                          <input 
                              type="text" 
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="z.B. Feuerwehr-Katze, Hacker-Cat"
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none transition-colors"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Gewünschte Seltenheit *</label>
                          <select 
                              value={rarity}
                              onChange={(e) => setRarity(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none transition-colors appearance-none"
                          >
                              {RARITIES.map(r => (
                                  <option key={r} value={r} className="bg-[#18181b]">{RARITY_LABELS[r]}</option>
                              ))}
                          </select>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Details & Aussehen (Optional)</label>
                      <textarea 
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Wie sieht sie aus? Hat sie ein spezielles Item? Was ist der Witz dahinter?"
                          className="w-full h-[120px] bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none transition-colors resize-none custom-scrollbar"
                      />
                  </div>
              </div>

              <div className="flex justify-end relative z-10">
                  <button 
                      type="submit" 
                      disabled={submitting}
                      className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black px-8 py-3 rounded-xl font-black flex items-center gap-2 transition-all shadow-lg shadow-orange-900/20"
                  >
                      <Send size={18} /> {submitting ? "Wird gesendet..." : "Vorschlag einreichen"}
                  </button>
              </div>
          </form>
      </div>

      {/* LISTE DER VORSCHLÄGE */}
      <div>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            Community Vorschläge <span className="bg-white/10 text-white/50 text-xs px-2 py-0.5 rounded-full">{suggestions.length}</span>
        </h2>
        
        {suggestions.length === 0 ? (
          <div className="py-20 text-center text-white/30 border-2 border-dashed border-white/5 rounded-3xl">
              <Lightbulb size={48} className="mx-auto mb-4 opacity-20" />
              <p>Noch keine Ideen vorhanden. Mach den Anfang!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suggestions.slice().reverse().map(s => {
               const badgeColor = RARITY_COLORS[s.rarity] || "text-white";
               return (
                <div key={s.id} className="bg-[#18181b] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col justify-between transition-colors group">
                    <div>
                        <div className="flex gap-2 mb-3">
                            <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-1 rounded bg-white/5 border border-white/10 ${badgeColor}`}>
                                {RARITY_LABELS[s.rarity] || s.rarity}
                            </span>
                        </div>
                        
                        <h3 className="font-bold text-lg text-white mb-2 leading-tight">{s.title}</h3>
                        
                        {s.description && (
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5 mb-4">
                                <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed flex gap-2">
                                    <MessageSquare size={14} className="mt-0.5 text-white/20 shrink-0" />
                                    {s.description}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-2">
                        <div className="text-xs text-white/30 flex items-center gap-1">
                          von <span className="text-white/70 font-bold">
                            {s.authorTwitchLogin || s.authorName || s.authorTwitchId}
                          </span>
                        </div>

                        {userIsStreamer && (
                            <button
                                type="button"
                                onClick={() => handleDelete(s.id)}
                                className="text-xs flex items-center gap-1 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 px-2 py-1.5 rounded-lg transition-colors"
                            >
                                <Trash2 size={12} /> Löschen
                            </button>
                        )}
                    </div>
                </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}