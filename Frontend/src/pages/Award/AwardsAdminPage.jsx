// src/pages/AwardsAdminPage.jsx
import React, { useEffect, useState } from "react";

const AWARDS_SEASON = 2026;

const CATEGORIES = [
  { id: "best-chatter", label: "Best Twitch-Chatter" },
  { id: "worst-chatter", label: "Worst Twitch-Chatter" },
  { id: "best-mod", label: "Best Twitch-Mod", type: "mod" },
  { id: "worst-mod", label: "Worst Twitch-Mod", type: "mod" },
  { id: "best-vip", label: "Best VIP" },
  { id: "best-stream-game", label: "Best Stream Game" },
  { id: "best-event", label: "Best Event" },
  { id: "best-clip", label: "Best Clip" },
  { id: "best-new-viewer", label: "Best New Viewer" },
  { id: "best-meme", label: "Best Meme / Running Gag" },
  { id: "best-community-moment", label: "Community-Moment des Jahres" },
];

// Hilfsfunktion: baut aus der DB ein Summary für die gewünschte Season
function buildSummary(db, seasonYear) {
  const result = {
    totalSubmissions: 0,
    perCategory: {},
  };

  const submissions = Array.isArray(db?.submissions) ? db.submissions : [];
  if (!submissions.length) return result;

  const byCategory = {};
  let totalSubs = 0;

  for (const sub of submissions) {
    if (seasonYear && Number(sub.season) !== Number(seasonYear)) continue;
    totalSubs++;

    const answers = sub.answers || {};
    for (const [catId, rawArr] of Object.entries(answers)) {
      const arr = Array.isArray(rawArr) ? rawArr : [];
      if (!byCategory[catId]) byCategory[catId] = {};

      for (const raw of arr) {
        const value = String(raw || "").trim();
        if (!value) continue;

        // Doppelte Einträge werden hier ganz automatisch mehrfach gezählt
        byCategory[catId][value] = (byCategory[catId][value] || 0) + 1;
      }
    }
  }

  const perCategory = {};
  for (const [catId, counts] of Object.entries(byCategory)) {
    const items = Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.value.localeCompare(b.value, "de-DE")
      );

    perCategory[catId] = {
      totalEntries: items.reduce((sum, item) => sum + item.count, 0),
      uniqueCount: items.length,
      items,
    };
  }

  result.totalSubmissions = totalSubs;
  result.perCategory = perCategory;
  return result;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AwardsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/awards/submissions", {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 401) {
            setError(
              "Nicht eingeloggt. Bitte oben rechts mit Twitch einloggen."
            );
          } else if (res.status === 403) {
            setError(
              "Nur der Streamer-Account darf diese Seite sehen (STREAMER_TWITCH_ID)."
            );
          } else {
            const data = await res.json().catch(() => null);
            setError(data?.error || "Fehler beim Laden der Einsendungen.");
          }
          return;
        }

        const data = await res.json();
        setDb(data);
      } catch (e) {
        console.error("Fehler beim Laden /api/awards/submissions:", e);
        setError("Server nicht erreichbar.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const summary = db ? buildSummary(db, AWARDS_SEASON) : null;
  const totalSubs = summary?.totalSubmissions || 0;
  const perCategory = summary?.perCategory || {};


  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-extrabold">
          Awards {AWARDS_SEASON} – Admin
        </h1>
        <p className="text-sm text-white/70">
          Interne Übersicht über alle Einsendungen. Du alleine siehst diese
          Seite – Daten kommen direkt aus <code>awards-submissions.json</code>.
        </p>
        {!loading && !error && (
          <p className="text-xs text-white/60">
            Einsendungen in Season {AWARDS_SEASON}:{" "}
            <span className="font-semibold">{totalSubs}</span>
          </p>
        )}
      </header>

      {loading && <p className="text-sm text-white/70">Lade Einsendungen...</p>}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Detail-Übersicht pro Kategorie */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold">Alle Kategorien – Ranking</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {CATEGORIES.map((cat) => {
                const s = perCategory[cat.id];
                return (
                  <div
                    key={cat.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold">{cat.label}</h3>
                      <span className="text-[11px] text-white/50">
                        {s
                          ? `${s.totalEntries} Stimmen · ${s.uniqueCount} Einträge`
                          : "Keine Einträge"}
                      </span>
                    </div>

                    {!s || s.items.length === 0 ? (
                      <p className="text-sm text-white/60">
                        Noch keine Einsendungen für diese Kategorie.
                      </p>
                    ) : (
                      <table className="w-full text-sm mt-1">
                        <thead className="text-xs text-white/60 border-b border-white/10">
                          <tr>
                            <th className="text-left py-1">Eintrag</th>
                            <th className="text-right py-1">Stimmen</th>
                            <th className="text-right py-1">Anteil</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((item, idx) => {
                            const pct =
                              s.totalEntries > 0
                                ? Math.round(
                                    (item.count / s.totalEntries) * 100
                                  )
                                : 0;
                            return (
                              <tr
                                key={`${item.value}-${idx}`}
                                className="border-b border-white/5"
                              >
                                <td className="py-1 pr-2 align-top">
                                  #{idx + 1}{" "}
                                  <span className="break-words">
                                    {item.value}
                                  </span>
                                </td>
                                <td className="py-1 text-right align-top">
                                  {item.count}
                                </td>
                                <td className="py-1 text-right align-top">
                                  {pct}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Rohdaten-Vorschau */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Rohdaten (pro Einsendung)</h2>
            {!Array.isArray(db?.submissions) ||
            db.submissions.filter(
              (s) => Number(s.season) === Number(AWARDS_SEASON)
            ).length === 0 ? (
              <p className="text-sm text-white/60">
                Noch keine Einsendungen in Season {AWARDS_SEASON}.
              </p>
            ) : (
              <div className="space-y-3">
                {db.submissions
                  .filter(
                    (s) => Number(s.season) === Number(AWARDS_SEASON)
                  )
                  .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="rounded-2xl border border-white/10 bg-black/40 p-3 text-sm space-y-2"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <div className="font-semibold">
                            {sub.twitchLogin || sub.twitchId}
                          </div>
                          <div className="text-[11px] text-white/60">
                            ID: {sub.twitchId}
                          </div>
                        </div>
                        <div className="text-[11px] text-white/60 text-right">
                          <div>
                            Erstellt: {formatDate(sub.createdAt || sub.id)}
                          </div>
                          <div>Zuletzt: {formatDate(sub.updatedAt)}</div>
                        </div>
                      </div>

                      <div className="border-t border-white/10 pt-2 space-y-1">
                        {CATEGORIES.map((cat) => {
                          const arr = sub.answers?.[cat.id];
                          if (!Array.isArray(arr) || arr.length === 0)
                            return null;
                          return (
                            <div key={cat.id}>
                              <span className="text-[11px] uppercase tracking-wide text-white/60">
                                {cat.label}:
                              </span>{" "}
                              <span className="text-sm break-words">
                                {arr.join(", ")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
