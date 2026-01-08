// src/pages/AwardsSubmitPage.jsx
import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext"; // Import aus CasinoPage übernommen

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

  // HIER: Statt lokalem Fetch nutzen wir den globalen Context wie im Casino
  const { user, login } = useContext(TwitchAuthContext);

  const [formData, setFormData] = useState(() => {
    const initial = {};
    CATEGORIES.forEach((c) => {
      initial[c.id] = "";
    });
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const isAdmin = !!user && String(user.twitchId) === STREAMER_ID;

  // HINWEIS: Der useEffect für fetchUser('/api/auth/me') wurde komplett entfernt.
  // Der TwitchAuthContext kümmert sich um das Laden des Users.

  // Wenn User sich ausloggt (user wird null durch Context), Formular resetten
  useEffect(() => {
    if (!user) {
      setLastSavedAt(null);
      setSubmitSuccess(false);
      setSubmitError(null);
      // Optional: Formular leeren, wenn du willst, dass beim Logout alles weg ist:
      // const reset = {};
      // CATEGORIES.forEach((c) => (reset[c.id] = ""));
      // setFormData(reset);
    }
  }, [user]);

  // Eigene Einsendung laden, sobald User im Context verfügbar ist
  useEffect(() => {
    if (!user) return;

    async function fetchSubmission() {
      try {
        const res = await fetch("/api/awards/submissions/me", {
          credentials: "include",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (!data || !data.answers) return;

        const newForm = {};
        CATEGORIES.forEach((cat) => {
          const raw = data.answers[cat.id];
          if (Array.isArray(raw)) {
            if (cat.type === "mod") {
              newForm[cat.id] = raw[0] || "";
            } else {
              newForm[cat.id] = raw.join(", ");
            }
          } else if (typeof raw === "string") {
            newForm[cat.id] = raw;
          } else {
            newForm[cat.id] = "";
          }
        });

        setFormData((prev) => ({ ...prev, ...newForm }));
        if (data.updatedAt) {
          setLastSavedAt(new Date(data.updatedAt));
        }
      } catch (e) {
        console.error("Fehler beim Laden der Award-Einsendung:", e);
      }
    }

    fetchSubmission();
  }, [user]);

  const handleChange = (categoryId, value) => {
    setFormData((prev) => ({
      ...prev,
      [categoryId]: value,
    }));
  };

  const handleModSelect = (categoryId, value) => {
    setFormData((prev) => ({
      ...prev,
      [categoryId]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      // Fallback, falls jemand versucht zu senden ohne Login
      login(); 
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(false);

    const answers = {};
    let hasAny = false;

    for (const cat of CATEGORIES) {
      const raw = (formData[cat.id] || "").trim();
      if (!raw) continue;
      answers[cat.id] = raw;
      hasAny = true;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/awards/submissions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: SEASON,
          answers: hasAny ? answers : {},
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setSubmitError(
          data?.error ||
            (hasAny
              ? "Fehler beim Speichern der Einsendung."
              : "Fehler beim Löschen der Einsendung.")
        );
        return;
      }

      if (hasAny) {
        setLastSavedAt(new Date(data.updatedAt || Date.now()));
      } else {
        setLastSavedAt(null);
        const reset = {};
        CATEGORIES.forEach((c) => (reset[c.id] = ""));
        setFormData(reset);
      }

      setSubmitSuccess(true);
    } catch (e) {
      console.error("Fehler beim Senden der Awards-Einsendung:", e);
      setSubmitError("Server nicht erreichbar. Versuch es später erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    const reset = {};
    CATEGORIES.forEach((c) => (reset[c.id] = ""));
    setFormData(reset);
    setSubmitSuccess(false);
    setSubmitError(null);
  };

  return (
    <div className="relative min-h-full">
      <div className="flex gap-6 items-start">
        <aside className="hidden lg:block w-40 shrink-0 sticky top-4">
          <div className="rounded-2xl p-2 shadow-lg">
            <img
              src="/logos/avards2026.png"
              alt="vnmvalentin Awards"
              className="h-40 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        </aside>

        <div className="flex-1 space-y-8">
          <header className="pt-4 flex flex-col items-center lg:items-start text-center lg:text-left space-y-3">
            <img
              src="/logos/avards2026.png"
              alt="vnmvalentin Awards"
              className="h-16 w-auto mb-1 lg:hidden"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />

            <h1 className="text-4xl font-extrabold tracking-wide">
              vnmvalentin Awards {SEASON}
            </h1>

            <p className="text-sm text-white/70 max-w-3xl">
              Hier kannst du das ganze Jahr über deine persönlichen Highlights
              einreichen. Kategorien kannst du jederzeit skippen – füll einfach
              das aus, was du schon hast. Gegen Ende {SEASON} bauen wir daraus
              die finale Voting-Seite.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-white/60">
              <div>
                {!user ? (
                  <span>
                    Nicht eingeloggt –{" "}
                    <button 
                      onClick={login} 
                      className="text-violet-400 hover:text-violet-300 underline font-bold"
                    >
                      Login mit Twitch
                    </button>
                  </span>
                ) : (
                  `Eingeloggt als ${user.twitchLogin}`
                )}
                {lastSavedAt && (
                  <div>
                    Zuletzt gespeichert:{" "}
                    {lastSavedAt.toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => navigate("/avards-admin")}
                  className="ml-0 lg:ml-4 px-3 py-1 rounded-lg text-[11px] font-semibold bg-white/10 border border-white/25 hover:bg-white/20"
                >
                  Admin-Auswertung öffnen
                </button>
              )}
            </div>
            
            {!user && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex flex-col sm:flex-row items-center gap-3">
                <span>
                    Um Vorschläge einzureichen, logge dich bitte ein.
                </span>
                <button 
                    onClick={login}
                    className="bg-amber-500 hover:bg-amber-600 text-black px-3 py-1 rounded-lg text-xs font-bold transition"
                >
                    Jetzt einloggen
                </button>
              </div>
            )}
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              {CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-lg flex flex-col gap-3"
                >
                  <div>
                    <h2 className="text-lg font-semibold">{cat.label}</h2>
                    {cat.description && (
                      <p className="text-xs text-white/70 mt-1">
                        {cat.description}
                      </p>
                    )}
                  </div>

                  {cat.type === "mod" ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] uppercase tracking-wide text-white/60">
                        Mod auswählen (optional)
                      </label>
                      <select
                        className="bg-white text-black rounded-lg px-2 py-1 text-sm outline-none"
                        value={formData[cat.id] || ""}
                        onChange={(e) =>
                          handleModSelect(cat.id, e.target.value)
                        }
                      >
                        <option value="">– Kein Mod ausgewählt –</option>
                        {MOD_OPTIONS.map((mod) => (
                          <option key={mod} value={mod}>
                            {mod}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-1">
                      <textarea
                        rows={3}
                        value={formData[cat.id] || ""}
                        onChange={(e) => handleChange(cat.id, e.target.value)}
                        placeholder="Mehrere Einträge mit , trennen."
                        className="w-full resize-none rounded-xl bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/60"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {submitError}
              </div>
            )}

            {submitSuccess && !submitError && (
              <div className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                {lastSavedAt
                  ? "Deine Einsendung wurde gespeichert!"
                  : "Deine Einsendung wurde gelöscht."}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting || !user}
                className={`px-5 py-2 rounded-xl text-sm font-semibold shadow-md transition ${
                  submitting || !user
                    ? "bg-violet-700/50 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-500"
                }`}
              >
                {submitting ? "Speichere..." : "Einsendung speichern"}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl text-sm border border-white/20 bg-white/5 hover:bg-white/10"
              >
                Formular zurücksetzen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}