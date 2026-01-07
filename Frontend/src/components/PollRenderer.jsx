import React, { useContext, useEffect, useMemo, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";

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

  // 🔁 Poll regelmäßig aktualisieren (alle 5 Sekunden, aber nur solange aktiv)
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

  // Initiale Ansicht setzen: wenn schon abgestimmt -> Ergebnisse, sonst Formular
  // Wichtig: während isEditing NICHT automatisch auf Ergebnisse umschalten.
  useEffect(() => {
    if (!userId) return;

    if (existingVote && !isEditing) {
      setMode("results");
      setAnswers(existingVote); // Prefill, damit "Antworten ändern" direkt passt
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
        credentials: "include", // ⬅️ wichtig (Auth)
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          votes: { [userId]: answers },
          replace: isEditing, // ⬅️ neu: erlaubt Überschreiben im Backend
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // wenn Backend noch "bereits abgestimmt" liefert (und replace=false), geh in Ergebnisse
        if (data?.error === "User hat bereits abgestimmt") {
          setIsEditing(false);
          setMode("results");
        } else {
          console.error("Fehler beim Abstimmen:", data);
          alert(data?.error || "Fehler beim Abstimmen");
        }
        return;
      }

      // ✅ Erfolgreich gespeichert
      setPoll(data);
      setIsEditing(false);
      setMode("results");

      // sichere Prefill-Quelle (falls Backend normalisiert)
      const saved = data?.votes?.[userId];
      if (saved) setAnswers(saved);
    } catch (err) {
      console.error("Netzwerkfehler beim Abstimmen:", err);
      alert("Server nicht erreichbar oder Fehler beim Absenden der Stimme.");
    }
  };

  // Stimmen zählen
  const countVotes = (qid, opt) => {
    const votes = Object.values(poll?.votes || {});
    return votes.filter(
      (v) => v?.[qid] === opt || (Array.isArray(v?.[qid]) && v[qid].includes(opt))
    ).length;
  };

  // Freitext-Antworten sammeln
  const collectTextAnswers = (qid) => {
    const votes = Object.values(poll?.votes || {});
    return votes
      .map((v) => v?.[qid])
      .filter((ans) => ans && typeof ans === "string" && ans.trim() !== "");
  };

  // Kein Login
  if (!user) {
    return (
      <div className="mt-10 text-center text-lg">
        <p className="mb-3 text-gray-300">
          Du musst dich <strong>oben rechts</strong> mit deinem Twitch-Account verbinden, um
          abzustimmen.
        </p>
      </div>
    );
  }

  // ✅ Ergebnisansicht
  if (mode === "results") {
    return (
      <div className="mt-6 max-w-2xl mx-auto bg-gray-900 p-6 rounded-2xl space-y-6">
        <h2 className="text-xl font-bold mb-4 text-center">Ergebnisse: {poll.title}</h2>

        {pollEnded && (
          <p className="text-center text-sm text-red-400">Diese Abstimmung ist beendet.</p>
        )}

        {poll.questions.map((q) => (
          <div key={q.id} className="mb-6">
            <p className="font-semibold mb-3">{q.question}</p>

            {q.type !== "text" &&
              q.options.map((opt) => (
                <div
                  key={opt}
                  className="flex justify-between items-center mb-1 bg-gray-800 p-2 rounded"
                >
                  <span>{opt}</span>
                  <span className="font-mono text-sm text-gray-300">
                    {countVotes(q.id, opt)} Stimmen
                  </span>
                </div>
              ))}

            {q.type === "text" && (
              <div className="bg-gray-800 p-3 rounded space-y-1">
                {collectTextAnswers(q.id).length > 0 ? (
                  collectTextAnswers(q.id).map((ans, i) => (
                    <div key={i} className="border-b border-gray-700 pb-1">
                      {ans}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 italic">Noch keine Antworten eingereicht.</p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* ✅ Antworten ändern */}
        {!pollEnded && (
          <div className="flex justify-center pt-2">
            <button
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => {
                setIsEditing(true);
                setMode("form");
                setAnswers(existingVote || {}); // Prefill
              }}
            >
              Antworten ändern
            </button>
          </div>
        )}
      </div>
    );
  }

  // 🗳️ Abstimmungsformular (oder Edit-Formular)
  if (pollEnded) {
    return (
      <div className="max-w-2xl mx-auto text-center p-6 bg-gray-900 rounded-2xl mt-6">
        <h2 className="text-2xl font-bold mb-4">{poll.title}</h2>
        <p className="text-red-400">Diese Abstimmung ist abgelaufen.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-gray-900 p-6 rounded-2xl mt-6 space-y-6">
      <h2 className="text-2xl font-bold text-center">
        {poll.title}
        {isEditing && <span className="text-sm text-gray-300 block mt-1">(Bearbeiten)</span>}
      </h2>

      {poll.questions.map((q) => (
        <div key={q.id}>
          <p className="font-semibold mb-2">{q.question}</p>

          {q.type === "single" &&
            q.options.map((opt) => (
              <label key={opt} className="block">
                <input
                  type="radio"
                  name={String(q.id)}
                  value={opt}
                  checked={answers?.[q.id] === opt}
                  onChange={() => handleChange(q.id, opt)}
                  className="mr-2"
                />
                {opt}
              </label>
            ))}

          {q.type === "multiple" &&
            q.options.map((opt) => {
              const selected = Array.isArray(answers?.[q.id]) ? answers[q.id] : [];
              const checked = selected.includes(opt);

              return (
                <label key={opt} className="block">
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
                    className="mr-2"
                  />
                  {opt}
                </label>
              );
            })}

          {q.type === "text" && (
            <textarea
              value={answers?.[q.id] ?? ""}
              onChange={(e) => handleChange(q.id, e.target.value)}
              className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              rows="3"
            />
          )}
        </div>
      ))}

      <button
        onClick={submitVote}
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg"
      >
        {isEditing ? "Änderungen speichern" : "Abstimmen"}
      </button>

      {isEditing && (
        <button
          onClick={() => {
            setIsEditing(false);
            setMode("results");
          }}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg"
        >
          Abbrechen
        </button>
      )}
    </div>
  );
}
