// src/pages/Abstimmung/PollRenderer.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import {
  BarChart2,
  Check,
  Edit3,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Clock
} from "lucide-react";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default function PollRenderer({ poll: initialPoll }) {
  const { user, login } = useContext(TwitchAuthContext);

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

  // Poll regelmäßig aktualisieren
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
      <div className="text-center py-6">
        <div className="inline-flex p-4 bg-violet-500/10 border border-violet-400/20 rounded-2xl mb-4 text-violet-300">
            <AlertCircle size={28} />
        </div>
        <h3 className="font-display text-lg font-bold text-white mb-2">Login erforderlich</h3>
        <p className="text-white/50 text-sm mb-5">
          Verbinde dich mit Twitch, um an der Abstimmung teilzunehmen.
        </p>
        <button onClick={() => login(false)} className="inline-flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          <TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden
        </button>
      </div>
    );
  }

  // 2. ERGEBNIS ANSICHT
  if (mode === "results") {
    return (
      <div>
        <div className="text-center mb-8 border-b border-white/10 pb-6">
            <h2 className="font-display text-xl md:text-2xl font-bold text-white flex items-center justify-center gap-3">
                <BarChart2 className="text-violet-400" size={22} /> {poll.title}
            </h2>
            {pollEnded && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider">
                    <Clock size={13} /> Beendet
                </div>
            )}
        </div>

        <div className="space-y-6">
            {poll.questions.map((q) => {
                const totalVotesForQ = q.options
                    ? q.options.reduce((acc, opt) => acc + countVotes(q.id, opt), 0)
                    : 0;

                return (
                  <div key={q.id} className="bg-black/20 rounded-xl p-5 md:p-6 border border-white/10">
                    <p className="font-semibold text-white mb-4">{q.question}</p>

                    {q.type !== "text" && (
                        <div className="space-y-2.5">
                            {q.options.map((opt) => {
                                const count = countVotes(q.id, opt);
                                const percent = totalVotesForQ > 0 ? ((count / totalVotesForQ) * 100).toFixed(1) : 0;

                                return (
                                    <div key={opt} className="relative group">
                                        <div className="absolute inset-0 bg-white/5 rounded-lg overflow-hidden">
                                            <div
                                                className="h-full bg-violet-500/25 transition-all duration-1000 ease-out"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>

                                        <div className="relative flex justify-between items-center p-3 px-4 z-10">
                                            <span className="font-medium text-white/85">{opt}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-white/40">{percent}%</span>
                                                <span className="font-mono text-sm font-bold text-violet-300 bg-black/30 px-2 py-0.5 rounded-md border border-white/10">
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
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar bg-black/30 rounded-lg p-4 border border-white/10">
                        {collectTextAnswers(q.id).length > 0 ? (
                          collectTextAnswers(q.id).map((ans, i) => (
                            <div key={i} className="border-b border-white/5 last:border-0 pb-2 last:pb-0 text-sm text-white/70 italic">
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
          <div className="flex justify-center mt-8 pt-6 border-t border-white/10">
            <button
              onClick={() => {
                setIsEditing(true);
                setMode("form");
                setAnswers(existingVote || {});
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white font-semibold transition-colors border border-white/10 hover:border-white/20"
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
      <div className="text-center py-6">
        <h2 className="font-display text-2xl font-bold text-white mb-2">{poll.title}</h2>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 font-bold border border-red-500/20 mt-4 text-sm">
            <X size={16} /> Abstimmung beendet
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
            {poll.title}
          </h2>
          {isEditing && (
              <span className="inline-block px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
                  Bearbeitungsmodus
              </span>
          )}
      </div>

      <div className="space-y-6">
          {poll.questions.map((q) => (
            <div key={q.id} className="bg-black/20 rounded-xl p-5 md:p-6 border border-white/10">
              <p className="font-semibold text-white mb-4 border-l-2 border-violet-400 pl-3">
                  {q.question}
              </p>

              <div className="space-y-2.5">
                  {/* SINGLE CHOICE (RADIO) */}
                  {q.type === "single" && q.options.map((opt) => {
                      const isSelected = answers?.[q.id] === opt;
                      return (
                          <label key={opt} className={`flex items-center gap-4 p-3.5 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'bg-violet-500/10 border-violet-400/50' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}>
                            <input
                              type="radio"
                              name={String(q.id)}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleChange(q.id, opt)}
                              className="hidden"
                            />
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-violet-400' : 'border-white/25'}`}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />}
                            </div>
                            <span className={`font-medium ${isSelected ? 'text-white' : 'text-white/60'}`}>{opt}</span>
                          </label>
                      );
                  })}

                  {/* MULTIPLE CHOICE (CHECKBOX) */}
                  {q.type === "multiple" && q.options.map((opt) => {
                      const selected = Array.isArray(answers?.[q.id]) ? answers[q.id] : [];
                      const checked = selected.includes(opt);

                      return (
                        <label key={opt} className={`flex items-center gap-4 p-3.5 rounded-lg cursor-pointer transition-colors border ${checked ? 'bg-violet-500/10 border-violet-400/50' : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'}`}>
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
                          <span className={`font-medium ${checked ? 'text-white' : 'text-white/60'}`}>{opt}</span>
                        </label>
                      );
                  })}

                  {/* TEXT INPUT */}
                  {q.type === "text" && (
                    <textarea
                      value={answers?.[q.id] ?? ""}
                      onChange={(e) => handleChange(q.id, e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg p-4 text-white focus:outline-none focus:border-violet-500 transition-colors placeholder:text-white/20 min-h-[100px]"
                      placeholder="Deine Antwort..."
                    />
                  )}
              </div>
            </div>
          ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-white/10">
        <button
          onClick={submitVote}
          className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isEditing ? <><CheckCircle2 size={19}/> Änderungen speichern</> : <><Send size={19}/> Abstimmen</>}
        </button>

        {isEditing && (
          <button
            onClick={() => {
              setIsEditing(false);
              setMode("results");
            }}
            className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg border border-white/10 transition-colors"
          >
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}
