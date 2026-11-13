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
import { Button, Textarea, TwitchLoginButton } from "../../components/ui";

// Antwortzeile: das echte Eingabefeld bleibt per sr-only erreichbar (Tab + Leertaste); früher stand hier
// `hidden`, damit ließ sich ohne Maus gar nicht abstimmen. focus-within zeigt, wo der Fokus gerade ist.
const optionRow = (on) =>
  `flex items-center gap-4 p-3.5 rounded-lg cursor-pointer transition-colors border focus-within:outline-2 focus-within:outline-accent-soft ${
    on ? "bg-accent/10 border-accent/50" : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10"
  }`;

// showTitle=false: die Seite zeigt den Titel schon selbst (AbstimmungDetail im Bild-Banner) — sonst stünde er doppelt da
export default function PollRenderer({ poll: initialPoll, showTitle = true }) {
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
        <div className="inline-flex p-3 bg-accent/10 border border-accent/25 rounded-lg mb-4 text-accent-soft">
            <AlertCircle size={24} />
        </div>
        <h3 className="font-display text-lg font-bold text-white mb-2">Anmeldung erforderlich</h3>
        <p className="text-white/55 text-sm mb-5">
          Verbinde dich mit Twitch, um an der Abstimmung teilzunehmen.
        </p>
        <TwitchLoginButton />
      </div>
    );
  }

  // 2. ERGEBNIS ANSICHT
  if (mode === "results") {
    return (
      <div>
        <div className="text-center mb-8 border-b border-line pb-6">
            <h2 className="font-display text-xl md:text-2xl font-bold text-white flex items-center justify-center gap-3">
                <BarChart2 className="text-accent-soft" size={22} /> {showTitle ? poll.title : "Ergebnisse"}
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
                  <div key={q.id} className="bg-black/20 rounded-lg p-5 md:p-6 border border-line">
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
                                                className="h-full bg-accent/25 transition-all duration-1000 ease-out"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>

                                        <div className="relative flex justify-between items-center p-3 px-4 z-10">
                                            <span className="font-medium text-white/85">{opt}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-white/40">{percent}%</span>
                                                <span className="font-mono text-sm font-bold text-accent-soft bg-black/30 px-2 py-0.5 rounded-md border border-white/10">
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
            <Button
              variant="secondary"
              size="lg"
              icon={Edit3}
              onClick={() => {
                setIsEditing(true);
                setMode("form");
                setAnswers(existingVote || {});
              }}
            >
              Antwort ändern
            </Button>
          </div>
        )}
      </div>
    );
  }

  // 3. ABSTIMMUNGS FORMULAR
  if (pollEnded) {
    return (
      <div className="text-center py-6">
        {showTitle && <h2 className="font-display text-2xl font-bold text-white mb-2">{poll.title}</h2>}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 font-bold border border-red-500/20 mt-4 text-sm">
            <X size={16} /> Abstimmung beendet
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`text-center ${showTitle || isEditing ? "mb-8" : ""}`}>
          {showTitle && (
            <h2 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
              {poll.title}
            </h2>
          )}
          {isEditing && (
              <span className="inline-block px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
                  Bearbeitungsmodus
              </span>
          )}
      </div>

      <div className="space-y-6">
          {poll.questions.map((q) => (
            <div key={q.id} className="bg-black/20 rounded-lg p-5 md:p-6 border border-line">
              <p className="font-semibold text-white mb-4 border-l-2 border-accent-soft pl-3">
                  {q.question}
              </p>

              <div className="space-y-2.5">
                  {/* SINGLE CHOICE (RADIO) */}
                  {q.type === "single" && q.options.map((opt) => {
                      const isSelected = answers?.[q.id] === opt;
                      return (
                          <label key={opt} className={optionRow(isSelected)}>
                            <input
                              type="radio"
                              name={String(q.id)}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleChange(q.id, opt)}
                              className="sr-only"
                            />
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-accent-soft' : 'border-white/25'}`}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-accent-soft" />}
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
                        <label key={opt} className={optionRow(checked)}>
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
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-accent text-white' : 'bg-white/10 text-transparent'}`}>
                              <Check size={14} strokeWidth={4} />
                          </div>
                          <span className={`font-medium ${checked ? 'text-white' : 'text-white/60'}`}>{opt}</span>
                        </label>
                      );
                  })}

                  {/* TEXT INPUT */}
                  {q.type === "text" && (
                    <Textarea
                      value={answers?.[q.id] ?? ""}
                      onChange={(e) => handleChange(q.id, e.target.value)}
                      aria-label={q.question}
                      placeholder="Deine Antwort..."
                    />
                  )}
              </div>
            </div>
          ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-line">
        <Button size="lg" className="flex-1" icon={isEditing ? CheckCircle2 : Send} onClick={submitVote}>
          {isEditing ? "Änderungen speichern" : "Abstimmen"}
        </Button>

        {isEditing && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setIsEditing(false);
              setMode("results");
            }}
          >
            Abbrechen
          </Button>
        )}
      </div>
    </div>
  );
}
