// src/pages/GiveawaysPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext";

const STREAMER_ID = "160224748"; // deine Twitch-ID
const STREAMER_LOGIN = "vnmvalentin";

const REQUIREMENT_TEMPLATES = [
  {
    id: "twitch-follow",
    type: "twitch-follow",
    label: "Twitch-Follower (vnmvalentin)",
    data: {
      channelId: STREAMER_ID,
      channelLogin: STREAMER_LOGIN,
      channelUrl: `https://twitch.tv/${STREAMER_LOGIN}`,
    },
  },
];

function formatDate(dt) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Nutzt den neuen Helix-Endpoint: channels/followed
async function isFollowingChannel({ userId, broadcasterId, accessToken, clientId }) {
  if (!userId || !broadcasterId || !accessToken || !clientId) return false;

  try {
    const params = new URLSearchParams({
      user_id: String(userId),
      broadcaster_id: String(broadcasterId),
      first: "1",
    });

    const res = await fetch(
      "https://api.twitch.tv/helix/channels/followed?" + params.toString(),
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      console.warn("Follower-Check fehlgeschlagen:", res.status);
      return false;
    }

    const data = await res.json();
    // Wenn data.data einen Eintrag hat → User folgt dem Kanal
    return Array.isArray(data.data) && data.data.length > 0;
  } catch (err) {
    console.error("Follower-Check Fehler:", err);
    return false;
  }
}

export default function GiveawaysPage() {
  const { user, clientId, accessToken, login } = useContext(TwitchAuthContext);

  const [data, setData] = useState({ active: [], expired: [] });
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    prize: "",
    quantity: 1,
    endDate: "",
    req_twitchFollow: false,
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = !!user && String(user.id) === String(STREAMER_ID);

  // Follower-Status für den eingeloggten User
  const [followState, setFollowState] = useState({
    loading: false,
    ok: false,
    error: null,
  });

  // Giveaways laden (aktiv + abgelaufen)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/giveaways", {
          credentials: "include",
        });
        const json = await res.json();
        setData({
          active: json.active || [],
          expired: json.expired || [],
        });
      } catch (e) {
        console.error("Fehler beim Laden der Giveaways:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const refresh = async () => {
    try {
      const res = await fetch("/api/giveaways", {
        credentials: "include",
      });
      const json = await res.json();
      setData({
        active: json.active || [],
        expired: json.expired || [],
      });
    } catch (e) {
      console.error("Fehler beim Reload der Giveaways:", e);
    }
  };

  // Twitch-Follower checken, wenn User + Token vorhanden
  useEffect(() => {
    if (!user || !accessToken || !clientId) {
      setFollowState({ loading: false, ok: false, error: null });
      return;
    }

    let cancelled = false;

    const check = async () => {
      setFollowState({ loading: true, ok: false, error: null });
      const ok = await isFollowingChannel({
        userId: user.id,
        broadcasterId: STREAMER_ID,
        accessToken,
        clientId,
      });
      if (!cancelled) {
        setFollowState({ loading: false, ok, error: null });
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [user?.id, accessToken, clientId]);

  // Wenn Requirements (z.B. Twitch-Follow) NICHT mehr erfüllt sind,
  // User automatisch aus passenden Giveaways austragen
  useEffect(() => {
    if (!user) return;
    if (followState.loading) return;
    if (followState.ok) return; // folgt -> alles gut

    const cleanup = async () => {
      try {
        const active = data.active || [];

        // Alle aktiven Giveaways, bei denen der User drin ist
        // UND die einen Twitch-Follow-Requirement haben
        const toLeave = active.filter((g) => {
          const participants = g.participants || {};
          const joined = !!participants[user.id];
          const hasFollowReq = (g.requirements || []).some(
            (r) => r.type === "twitch-follow"
          );
          return joined && hasFollowReq;
        });

        if (toLeave.length === 0) return;

        // Für jedes betroffene Giveaway leave callen
        for (const g of toLeave) {
          try {
            await fetch(`/api/giveaways/${g.id}/leave`, {
              method: "POST",
              credentials: "include",
            });
          } catch (e) {
            console.error("Auto-Leave Fehler für Giveaway", g.id, e);
          }
        }

        // Danach Liste neu laden
        await refresh();
      } catch (e) {
        console.error("Auto-Cleanup für Requirements fehlgeschlagen:", e);
      }
    };

    cleanup();
  }, [user?.id, followState.ok, followState.loading, data.active]);

  const buildRequirementsPayload = () => {
    const reqs = [];
    if (form.req_twitchFollow) {
      reqs.push(REQUIREMENT_TEMPLATES[0]);
    }
    return reqs;
  };

  const createGiveaway = async () => {
    if (!isAdmin) {
      alert("Nur der Streamer kann Giveaways erstellen.");
      return;
    }
    if (!form.title || !form.endDate) {
      alert("Titel und Enddatum sind Pflicht.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/giveaways", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          prize: form.prize,
          quantity: parseInt(form.quantity || 1, 10),
          endDate: form.endDate,
          requirements: buildRequirementsPayload(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Erstellen");
      }

      setForm({
        title: "",
        prize: "",
        quantity: 1,
        endDate: "",
        req_twitchFollow: false,
      });
      setCreating(false);
      await refresh();
    } catch (e) {
      console.error("Create Giveaway Fehler:", e);
      alert(e.message || "Konnte Giveaway nicht erstellen.");
    } finally {
      setSaving(false);
    }
  };

  const deleteGiveaway = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm("Giveaway wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/giveaways/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Fehler beim Löschen");
      }
      await refresh();
    } catch (e) {
      console.error("Delete Giveaway Fehler:", e);
      alert(e.message || "Konnte Giveaway nicht löschen.");
    }
  };

  const toggleJoin = async (g) => {
    if (!user) {
      if (
        window.confirm(
          "Du musst mit Twitch eingeloggt sein, um teilzunehmen. Jetzt einloggen?"
        )
      ) {
        login();
      }
      return;
    }

    const participants = g.participants || {};
    const alreadyIn = !!participants[user.id];

    const requirementsMet = allRequirementsOk(g);
    if (!requirementsMet) {
      alert("Du erfüllst (noch) nicht alle Voraussetzungen.");
      return;
    }

    const url = alreadyIn
      ? `/api/giveaways/${g.id}/leave`
      : `/api/giveaways/${g.id}/join`;

    try {
      await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: alreadyIn
          ? null
          : JSON.stringify({
              displayName: user.display_name,
              profileImageUrl: user.profile_image_url,
            }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Fehler bei Teilnahme");
        }
      });

      await refresh();
    } catch (e) {
      console.error("Join/Austritt Fehler:", e);
      alert(e.message || "Aktion fehlgeschlagen.");
    }
  };

  // Prüft eine einzelne Requirement
  const requirementOk = (req) => {
    if (req.type === "twitch-follow") {
      // Wenn noch geladen wird, interpretieren wir als "noch nicht erfüllt"
      return !!followState.ok;
    }
    // andere Requirement-Typen → aktuell immer false
    return false;
  };

  const allRequirementsOk = (g) => {
    if (!g.requirements || !g.requirements.length) return true;
    return g.requirements.every((r) => requirementOk(r));
  };

  if (loading) {
    return <div className="text-center p-8">Lade Giveaways…</div>;
  }

  // Abgelaufene Giveaways: neueste zuerst
  const expiredSorted = [...(data.expired || [])].sort(
    (a, b) => (b.endDate || 0) - (a.endDate || 0)
  );

  return (
    <div className="min-h-full space-y-10">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h1 className="text-3xl md:text-4xl font-extrabold">Giveaways</h1>
        {isAdmin && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm"
          >
            {creating ? "Formular schließen" : "Neues Giveaway erstellen"}
          </button>
        )}
      </header>

      {/* Admin Formular */}
      {isAdmin && creating && (
        <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Titel</label>
              <input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="w-full bg-gray-800 px-3 py-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Preis / Gewinn</label>
              <input
                value={form.prize}
                onChange={(e) =>
                  setForm((f) => ({ ...f, prize: e.target.value }))
                }
                className="w-full bg-gray-800 px-3 py-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Anzahl Gewinner</label>
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quantity: e.target.value,
                  }))
                }
                className="w-full bg-gray-800 px-3 py-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Enddatum</label>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endDate: e.target.value }))
                }
                className="w-full bg-gray-800 px-3 py-2 rounded"
              />
            </div>
          </div>

          <div className="mt-2">
            <span className="block text-sm mb-1">Voraussetzungen</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.req_twitchFollow}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    req_twitchFollow: e.target.checked,
                  }))
                }
              />
              Twitch-Follower von{" "}
              <a
                href={`https://twitch.tv/${STREAMER_LOGIN}`}
                target="_blank"
                rel="noreferrer"
                className="text-violet-400 underline"
              >
                {STREAMER_LOGIN}
              </a>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              disabled={saving}
              onClick={createGiveaway}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-sm disabled:opacity-60"
            >
              {saving ? "Speichere…" : "Erstellen"}
            </button>
          </div>
        </div>
      )}

      {/* Aktive Giveaways */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Aktive Giveaways</h2>
        {data.active.length === 0 && (
          <p className="text-sm text-gray-400">
            Aktuell laufen keine Giveaways.
          </p>
        )}
        <div className="space-y-4">
          {data.active.map((g) => {
            const participants = g.participants || {};
            const participantCount = Object.keys(participants).length;
            const joined = user && !!participants[user.id];

            const requirementsMet = allRequirementsOk(g);
            const canClickJoin = user ? requirementsMet : true;

            let disabledReason = null;
            if (user && !requirementsMet) {
              disabledReason = "Voraussetzungen nicht erfüllt.";
            }

            return (
              <div
                key={g.id}
                className="bg-gray-900/80 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{g.title}</h3>
                    {g.prize && (
                      <p className="text-sm text-gray-300">
                        Gewinn: {g.prize}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Endet am: {formatDate(g.endDate)}
                    </p>
                    <p className="text-xs text-gray-400">
                      Gewinner: {g.quantity}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <p className="text-sm text-gray-300">
                      Teilnehmer: {participantCount}
                    </p>
                    <button
                      onClick={() => toggleJoin(g)}
                      disabled={!canClickJoin}
                      className={`px-4 py-2 rounded text-sm ${
                        joined
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-violet-600 hover:bg-violet-700"
                      } disabled:opacity-50`}
                      title={
                        !user
                          ? "Bitte mit Twitch einloggen."
                          : disabledReason || ""
                      }
                    >
                      {!user
                        ? "Mit Twitch einloggen"
                        : joined
                        ? "Austreten"
                        : "Teilnehmen"}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => deleteGiveaway(g.id)}
                        className="px-3 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-red-400"
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </div>

                {/* Requirements Anzeige */}
                {g.requirements && g.requirements.length > 0 && (
                  <div className="border-t border-gray-800 pt-3">
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      Requirements
                    </span>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      {g.requirements.map((r) => {
                        const ok = requirementOk(r);
                        const isTF = r.type === "twitch-follow";
                        const url =
                          r.data?.channelUrl ||
                          `https://twitch.tv/${STREAMER_LOGIN}`;
                        return (
                          <div
                            key={r.id}
                            className="flex items-center gap-2 bg-gray-800/80 px-2 py-1 rounded-full"
                          >
                            <span>{ok ? "✅" : "❌"}</span>
                            <span>{r.label || r.type}</span>
                            {!ok && isTF && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-violet-400 underline"
                              >
                                Zum Kanal
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Abgelaufene Giveaways */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Abgelaufene Giveaways</h2>
        {expiredSorted.length === 0 && (
          <p className="text-sm text-gray-400">
            Noch keine abgelaufenen Giveaways.
          </p>
        )}
        <div className="space-y-4">
          {expiredSorted.map((g) => {
            const participants = g.participants || {};
            const winners = g.winners || [];
            const winnerNames = winners.map(
              (id) => participants[id]?.displayName || id
            );
            return (
              <div
                key={g.id}
                className="bg-gray-900/60 rounded-2xl p-4 border border-gray-800 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-semibold">{g.title}</h3>
                    {g.prize && (
                      <p className="text-sm text-gray-300">
                        Gewinn: {g.prize}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Endete am: {formatDate(g.endDate)}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteGiveaway(g.id)}
                      className="self-start px-3 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-red-400"
                    >
                      Löschen
                    </button>
                  )}
                </div>
                <div className="border-t border-gray-800 pt-2 text-sm text-gray-200">
                  <div className="font-semibold mb-1">Gewinner:</div>
                  {winnerNames.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Keine Teilnehmer oder noch nicht ausgelost.
                    </p>
                  ) : (
                    <ul className="list-disc list-inside text-sm">
                      {winnerNames.map((name, i) => (
                        <li key={i}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
