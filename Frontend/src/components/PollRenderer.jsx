// src/components/PollRenderer.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { 
  BarChart2, 
  Check, 
  Circle, 
  Edit3, 
  Send, 
  X, 
  AlertCircle,
  CheckCircle2,
  Clock
} from "lucide-react";

export default function PollRenderer({ poll: initialPoll }) {
  const { user } = useContext(TwitchAuthContext);

  const [poll, setPoll] = useState(initialPoll);
  const [answers, setAnswers] = useState({});
  const [mode, setMode] = useState("form"); // "form" | "results"
  const [isEditing, setIsEditing] = useState(false);

  const userId = useMemo(() => (user ? String(user.id) : null), [user]);
  const existingVote = useMemo(() => {
    if (!userId) return null;
    return poll?.votes?.[userId] ?? null;
  }, [poll, userId]);

  const pollEnded = useMemo(() => {
    if (!poll?.endDate) return false;
    return new Date(poll.endDate) <= new Date();
  }, [poll?.endDate]);

  // 🔁 Poll regelmäßig aktualisieren
  useEffect(() => {
    if (!poll?.id) return;

    const fetchLatestPoll = async () => {
      try {
        const res = await fetch(`/api/polls/${poll.id}`, {
          credentials: "include",
        });
        if (res.ok) {
          const fresh = await res.json();
          setPoll(fresh);
        }
      } catch (err) {
        console.error("Fehler beim Aktualisieren der Poll-Daten:", err);
      }
    };

    if (pollEnded) return; // abgelaufen -> kein interval
    fetchLatestPoll();
    const interval = setInterval(fetchLatestPoll, 5000);
    return () => clearInterval(interval);
  }, [poll?.id, pollEnded]);

  // Initiale Ansicht setzen
  useEffect(() => {
    if (!userId) return;

    if (existingVote && !isEditing) {
      setMode("results");
      setAnswers(existingVote); // Prefill
    }

    if (!existingVote && !isEditing) {
      setMode("form");
    }
  }, [existingVote, isEditing, userId]);

  const handleChange = (qid, value) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const submitVote = async () => {
    if (!userId) return;

    try {
      const res = await fetch(`/api/polls/${poll.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          votes: { [userId]: answers },
          replace: isEditing,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "User hat bereits abgestimmt") {
          setIsEditing(false);
          setMode("results");
        } else {
          console.error("Fehler beim Abstimmen:", data);
          alert(data?.error || "Fehler beim Abstimmen");
        }
        return;
      }

      setPoll(data);
      setIsEditing(false);
      setMode("results");

      const saved = data?.votes?.[userId];
      if (saved) setAnswers(saved);
    } catch (err) {
      console.error("Netzwerkfehler beim Abstimmen:", err);
      alert("Server nicht erreichbar oder Fehler beim Absenden der Stimme.");
    }
  };

  const countVotes = (qid, opt) => {
    const votes = Object.values(poll?.votes || {});
    return votes.filter(
      (v) => v?.[qid] === opt || (Array.isArray(v?.[qid]) && v[qid].includes(opt))
    ).length;
  };

  const collectTextAnswers = (qid) => {
    const votes = Object.values(poll?.votes || {});
    return votes
      .map((v) => v?.[qid])
      .filter((ans) => ans && typeof ans === "string" && ans.trim() !== "");
  };

  // 1. KEIN LOGIN
  if (!user) {
    return (
      <div className="mt-8 p-8 bg-[#18181b] border border-white/10 rounded-3xl text-center shadow-xl">
        <div className="inline-flex p-4 bg-white/5 rounded-full mb-4 text-white/50">
            <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Login erforderlich</h3>
        <p className="text-white/50">
          Verbinde dich mit Twitch, um an der Abstimmung teilzunehmen.
        </p>
      </div>
    );
  }

  // 2. ERGEBNIS ANSICHT
  if (mode === "results") {
    return (
      <div className="max-w-3xl mx-auto bg-[#18181b] border border-white/10 p-6 md:p-8 rounded-3xl shadow-2xl mt-8">
        <div className="text-center mb-8 border-b border-white/5 pb-6">
            <h2 className="text-2xl md:text-3xl font-black text-white flex items-center justify-center gap-3">
                <BarChart2 className="text-violet-500" /> {poll.title}
            </h2>
            {pollEnded && (
                <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold uppercase tracking-wider">
                    <Clock size={14} /> Beendet
                </div>
            )}
        </div>

        <div className="space-y-8">
            {poll.questions.map((q) => {
                // Für Prozentberechnung (optional, aber schick)
                const totalVotesForQ = q.options 
                    ? q.options.reduce((acc, opt) => acc + countVotes(q.id, opt), 0) 
                    : 0;

                return (
                  <div key={q.id} className="bg-black/20 rounded-2xl p-6 border border-white/5">
                    <p className="font-bold text-lg text-white mb-4">{q.question}</p>

                    {q.type !== "text" && (
                        <div className="space-y-3">
                            {q.options.map((opt) => {
                                const count = countVotes(q.id, opt);
                                const percent = totalVotesForQ > 0 ? ((count / totalVotesForQ) * 100).toFixed(1) : 0;
                                
                                return (
                                    <div key={opt} className="relative group">
                                        {/* Background Bar */}
                                        <div className="absolute inset-0 bg-white/5 rounded-xl overflow-hidden">
                                            <div 
                                                className="h-full bg-violet-500/20 transition-all duration-1000 ease-out" 
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                        
                                        {/* Content */}
                                        <div className="relative flex justify-between items-center p-3 px-4 z-10">
                                            <span className="font-medium text-gray-200">{opt}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-white/40">{percent}%</span>
                                                <span className="font-mono text-sm font-bold text-violet-400 bg-black/40 px-2 py-0.5 rounded-md border border-white/10">
                                                    {count}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {q.type === "text" && (
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar bg-black/40 rounded-xl p-4 border border-white/5">
                        {collectTextAnswers(q.id).length > 0 ? (
                          collectTextAnswers(q.id).map((ans, i) => (
                            <div key={i} className="border-b border-white/5 last:border-0 pb-2 last:pb-0 text-sm text-gray-300 italic">
                              "{ans}"
                            </div>
                          ))
                        ) : (
                          <p className="text-white/20 italic text-sm text-center">Noch keine Antworten.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
            })}
        </div>

        {!pollEnded && (
          <div className="flex justify-center mt-8 pt-6 border-t border-white/5">
            <button
              onClick={() => {
                setIsEditing(true);
                setMode("form");
                setAnswers(existingVote || {});
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all border border-white/10 hover:border-white/20"
            >
              <Edit3 size={16} /> Antwort ändern
            </button>
          </div>
        )}
      </div>
    );
  }

  // 3. ABSTIMMUNGS FORMULAR
  if (pollEnded) {
    return (
      <div className="max-w-2xl mx-auto text-center p-10 bg-[#18181b] border border-white/10 rounded-3xl mt-8 shadow-xl">
        <h2 className="text-3xl font-black text-white mb-2">{poll.title}</h2>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 text-red-400 font-bold border border-red-500/20 mt-4">
            <X size={18} /> Abstimmung beendet
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-[#18181b] border border-white/10 p-6 md:p-10 rounded-3xl shadow-2xl mt-8">
      <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
            {poll.title}
          </h2>
          {isEditing && (
              <span className="inline-block px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-bold border border-yellow-500/20">
                  Bearbeitungsmodus
              </span>
          )}
      </div>

      <div className="space-y-8">
          {poll.questions.map((q) => (
            <div key={q.id} className="bg-black/20 rounded-2xl p-6 border border-white/5 animate-in slide-in-from-bottom-4 duration-500">
              <p className="font-bold text-lg text-white mb-4 border-l-4 border-violet-500 pl-3">
                  {q.question}
              </p>

              <div className="space-y-3">
                  {/* SINGLE CHOICE (RADIO) */}
                  {q.type === "single" && q.options.map((opt) => {
                      const isSelected = answers?.[q.id] === opt;
                      return (
                          <label key={opt} className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-violet-600/10 border-violet-500' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}>
                            <input
                              type="radio"
                              name={String(q.id)}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleChange(q.id, opt)}
                              className="hidden"
                            />
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-violet-500' : 'border-white/30'}`}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />}
                            </div>
                            <span className={`font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>{opt}</span>
                          </label>
                      );
                  })}

                  {/* MULTIPLE CHOICE (CHECKBOX) */}
                  {q.type === "multiple" && q.options.map((opt) => {
                      const selected = Array.isArray(answers?.[q.id]) ? answers[q.id] : [];
                      const checked = selected.includes(opt);

                      return (
                        <label key={opt} className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all border ${checked ? 'bg-violet-600/10 border-violet-500' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}>
                          <input
                            type="checkbox"
                            value={opt}
                            checked={checked}
                            onChange={(e) => {
                              const newVals = e.target.checked
                                ? [...selected, opt]
                                : selected.filter((o) => o !== opt);
                              handleChange(q.id, newVals);
                            }}
                            className="hidden"
                          />
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-violet-500 text-white' : 'bg-white/10 text-transparent'}`}>
                              <Check size={14} strokeWidth={4} />
                          </div>
                          <span className={`font-medium ${checked ? 'text-white' : 'text-gray-400'}`}>{opt}</span>
                        </label>
                      );
                  })}

                  {/* TEXT INPUT */}
                  {q.type === "text" && (
                    <textarea
                      value={answers?.[q.id] ?? ""}
                      onChange={(e) => handleChange(q.id, e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all placeholder:text-white/20 min-h-[100px]"
                      placeholder="Deine Antwort..."
                    />
                  )}
              </div>
            </div>
          ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-white/5">
        <button
          onClick={submitVote}
          className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-violet-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          {isEditing ? <><CheckCircle2 size={20}/> Änderungen speichern</> : <><Send size={20}/> Abstimmen</>}
        </button>

        {isEditing && (
          <button
            onClick={() => {
              setIsEditing(false);
              setMode("results");
            }}
            className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-colors"
          >
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}