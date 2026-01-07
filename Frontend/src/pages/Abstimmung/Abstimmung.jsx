import React, { useContext, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext"; // <- ggf. Pfad anpassen

const STREAMER_ID = "160224748"; // deine Twitch-ID (wie in Giveaways)

const StyledWrapper = styled.div`
  .card {
    position: relative;
    width: 100%;
    max-width: 900px; /* kleiner als vorher */
    height: clamp(220px, 28vw, 340px); /* macht die Karte kompakter */
    margin: 14px auto;
    color: #fff;
    cursor: pointer;
    border-radius: 1.2em;
    transition: 0.25s;
    overflow: hidden;
  }

  .card:hover {
    transform: translateY(-6px);
  }

  .card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 1.2em;
    background: linear-gradient(45deg, #ffbc00, #ff0058);
    z-index: 0;
  }

  .card::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 1.2em;
    background: linear-gradient(45deg, #ffbc00, #ff0058);
    filter: blur(20px);
    z-index: 0;
    opacity: 0.9;
  }

  /* Hintergrundfläche */
  .card span {
    position: absolute;
    inset: 6px;
    border-radius: 1em;
    z-index: 1;

    background-color: rgba(0, 0, 0, 0.35); /* weniger dunkel */
    background-size: cover;                /* “zoomt” durch Cropping */
    background-position: center;
    background-repeat: no-repeat;

    /* Blur entfernt, damit das Bild nicht “matschig” wirkt */
  }

  .content {
    position: relative;
    z-index: 2;
    padding: 18px 18px;
    text-align: center;
    width: 100%;
    display: grid;
    place-items: center;
    height: 100%;
  }

  .content h2 {
    margin: 0 0 8px;
    font-size: 1.7rem;
    font-weight: 800;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.85);
  }

  .content p {
    margin: 4px 0;
    font-size: 1.05rem;
    color: #e6e6e6;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.85);
  }

  .muted {
    opacity: 0.9;
    font-size: 0.95rem;
  }
`;

export default function AbstimmungPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const navigate = useNavigate();

  const [polls, setPolls] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const [newPoll, setNewPoll] = useState({
    title: "",
    background: "",
    endDate: "",
    questions: [],
  });

  const isAdmin = useMemo(() => {
    return !!user && String(user.id) === String(STREAMER_ID);
  }, [user]);

  // Polls laden
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
      console.error("Fehler beim Reload:", e);
    }
  };

  const addPoll = async () => {
    if (!isAdmin) return;
    if (!newPoll.title || !newPoll.endDate) {
      alert("Bitte Titel und Enddatum angeben.");
      return;
    }

    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPoll.title,
          background: newPoll.background,
          endDate: newPoll.endDate,
          questions: newPoll.questions || [],
        }),
      });

      const created = await res.json();
      if (!res.ok) {
        alert(created?.error || "Konnte Abstimmung nicht erstellen.");
        return;
      }

      setPolls((s) => [...s, created]);
      setNewPoll({ title: "", background: "", endDate: "", questions: [] });
      setShowForm(false);
    } catch (err) {
      console.error("Hinzufügen Fehler:", err);
      alert("Konnte Abstimmung nicht speichern. API erreichbar?");
    }
  };

  const removePoll = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm("Willst du diese Abstimmung wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/polls/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || "Löschen fehlgeschlagen.");
        return;
      }
      setPolls((s) => s.filter((p) => p.id !== id));
    } catch (e) {
      console.error("Delete Fehler:", e);
      alert("Server nicht erreichbar.");
    }
  };

  const now = new Date();
  const activePolls = polls.filter((p) => new Date(p.endDate) > now);
  const expiredPolls = polls.filter((p) => new Date(p.endDate) <= now);

  const formatGermanDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" });
  };

  return (
    <div className="min-h-full p-6">
      {/* Laufende Abstimmungen */}
      <section className="mb-12">
        <h1 className="text-4xl font-extrabold text-center mb-6">Laufende Abstimmungen</h1>
        <div className="w-full flex flex-col items-center gap-4">
          {activePolls.map((poll) => (
            <div key={poll.id} className="w-[95%] max-w-4xl mx-auto">
              <StyledWrapper>
                <div className="card" onClick={() => navigate(`/Abstimmungen/${poll.id}`)}>
                  <span
                    style={{
                      backgroundImage: poll.background ? `url(${poll.background})` : "none",
                    }}
                  />
                  <div className="content">
                    <div>
                      <h2>{poll.title}</h2>
                      <p className="muted">Endet am: {formatGermanDate(poll.endDate)}</p>

                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePoll(poll.id);
                          }}
                          className="mt-3 px-3 py-1 rounded bg-red-600 text-white text-sm"
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </StyledWrapper>
            </div>
          ))}
        </div>
      </section>

      {/* Abgelaufene Abstimmungen */}
      <section className="mb-12">
        <h1 className="text-4xl font-extrabold text-center mb-6">Abgelaufene Abstimmungen</h1>
        <div className="w-full flex flex-col items-center gap-4">
          {expiredPolls.map((poll) => (
            <div key={poll.id} className="w-[95%] max-w-4xl mx-auto">
              <StyledWrapper>
                <div
                  className="card opacity-80"
                  onClick={() => navigate(`/Abstimmungen/${poll.id}`)}
                >
                  <span
                    style={{
                      backgroundImage: poll.background ? `url(${poll.background})` : "none",
                    }}
                  />
                  <div className="content">
                    <div>
                      <h2>{poll.title}</h2>
                      <p className="muted">Abgelaufen am: {formatGermanDate(poll.endDate)}</p>
                    </div>
                  </div>
                </div>
              </StyledWrapper>
            </div>
          ))}
        </div>
      </section>

      {/* Admin-Formular */}
      {isAdmin && showForm && (
        <div className="max-w-xl mx-auto p-4 bg-gray-800/60 rounded-lg mb-8">
          <h3 className="text-lg font-semibold mb-3">Neue Abstimmung erstellen</h3>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Titel"
              value={newPoll.title}
              onChange={(e) => setNewPoll((p) => ({ ...p, title: e.target.value }))}
              className="w-full p-2 rounded bg-gray-700 text-white"
            />

            <input
              type="text"
              placeholder="Hintergrund-Bild URL (optional)"
              value={newPoll.background}
              onChange={(e) => setNewPoll((p) => ({ ...p, background: e.target.value }))}
              className="w-full p-2 rounded bg-gray-700 text-white"
            />

            <input
              type="datetime-local"
              value={newPoll.endDate}
              onChange={(e) => setNewPoll((p) => ({ ...p, endDate: e.target.value }))}
              className="w-full p-2 rounded bg-gray-700 text-white"
            />

            {/* Fragen hinzufügen */}
            <div className="mt-4 p-3 bg-gray-700/40 rounded-lg">
              <h4 className="font-semibold mb-2">Fragen</h4>

              {newPoll.questions.map((q, i) => (
                <div key={q.id} className="mb-4 border-b border-gray-600 pb-2">
                  <div className="flex justify-between items-center mb-1">
                    <input
                      type="text"
                      placeholder="Fragetext"
                      value={q.question}
                      onChange={(e) => {
                        const updated = [...newPoll.questions];
                        updated[i] = { ...updated[i], question: e.target.value };
                        setNewPoll((p) => ({ ...p, questions: updated }));
                      }}
                      className="flex-1 p-1 rounded bg-gray-800 text-white mr-2"
                    />
                    <button
                      onClick={() => {
                        const updated = newPoll.questions.filter((_, idx) => idx !== i);
                        setNewPoll((p) => ({ ...p, questions: updated }));
                      }}
                      className="bg-red-600 px-2 py-1 rounded"
                    >
                      ✕
                    </button>
                  </div>

                  <select
                    value={q.type}
                    onChange={(e) => {
                      const updated = [...newPoll.questions];
                      updated[i] = { ...updated[i], type: e.target.value };
                      setNewPoll((p) => ({ ...p, questions: updated }));
                    }}
                    className="p-1 bg-gray-800 rounded text-white mb-2"
                  >
                    <option value="single">Single Choice</option>
                    <option value="multiple">Multiple Choice</option>
                    <option value="text">Freitext</option>
                  </select>

                  {q.type !== "text" && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const updated = [...newPoll.questions];
                              const options = [...(updated[i].options || [])];
                              options[oi] = e.target.value;
                              updated[i] = { ...updated[i], options };
                              setNewPoll((p) => ({ ...p, questions: updated }));
                            }}
                            className="flex-1 p-1 rounded bg-gray-800 text-white"
                          />
                          <button
                            onClick={() => {
                              const updated = [...newPoll.questions];
                              const options = [...(updated[i].options || [])];
                              options.splice(oi, 1);
                              updated[i] = { ...updated[i], options };
                              setNewPoll((p) => ({ ...p, questions: updated }));
                            }}
                            className="bg-red-600 px-2 rounded"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() => {
                          const updated = [...newPoll.questions];
                          const options = [...(updated[i].options || [])];
                          options.push("");
                          updated[i] = { ...updated[i], options };
                          setNewPoll((p) => ({ ...p, questions: updated }));
                        }}
                        className="text-sm text-green-400 mt-1"
                      >
                        + Option hinzufügen
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() =>
                  setNewPoll((p) => ({
                    ...p,
                    questions: [
                      ...(p.questions || []),
                      { id: Date.now(), question: "", type: "single", options: [""] },
                    ],
                  }))
                }
                className="bg-blue-600 px-3 py-1 rounded text-white mt-2"
              >
                + Frage hinzufügen
              </button>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={addPoll} className="px-4 py-2 bg-green-600 rounded text-white">
                Hinzufügen
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-600 rounded text-white"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Controls (Twitch Login) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
        {!isAdmin ? (
          <button
            onClick={() => {
              if (!user) login();
            }}
            className="px-3 py-1 rounded bg-black/60 text-white text-sm"
            title={!user ? "Mit Twitch einloggen" : "Nur der Streamer ist Admin"}
          >
            {!user ? "Admin (Twitch Login)" : "Kein Admin"}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm((s) => !s)}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
            >
              {showForm ? "Formular schließen" : "Neue Abstimmung"}
            </button>
            <button
              onClick={refreshPolls}
              className="px-3 py-1 rounded bg-gray-800 text-white text-sm"
            >
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
