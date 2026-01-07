// src/pages/CardSuggestionsPage.jsx
import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";

const CARD_TYPES = [
  "natur",
  "bestie",
  "drache",
  "dunkelheit",
  "cyber",
  "magie",
  "ozean",
  "himmel",
  "mechanisch",
  "kristall",
  "hölle",
  "wüste",
  "untergrund",
];

const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "mythic",
  "secret",
  "legendary",
];

const RARITY_LABELS = {
  common: "Gewöhnlich",
  uncommon: "Ungewöhnlich",
  rare: "Selten",
  "very-rare": "Sehr selten",
  mythic: "Mythisch",
  secret: "Geheim",
  legendary: "Legendär",
};

// Twitch-ID für Admin-Buttons (löschen)
const STREAMER_TWITCH_ID = "160224748"; // ggf. anpassen

export default function CardSuggestionsPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "",
    rarity: "",
    description: "",
  });

  const userIsStreamer = user && String(user.id) === STREAMER_TWITCH_ID;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/card-suggestions", {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Fehler beim Laden der Vorschläge");
        }
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setError("Vorschläge konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sortedSuggestions = [...suggestions].sort(
    (a, b) => (b.votes || 0) - (a.votes || 0)
  );

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      const res = await fetch("/api/card-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          rarity: form.rarity,
          description: form.description,
        }),
      });

      if (!res.ok) {
        throw new Error("Fehler beim Einreichen des Vorschlags");
      }

      const created = await res.json();
      setSuggestions((prev) => [created, ...prev]);
      setForm({ name: "", type: "", rarity: "", description: "" });
      setShowForm(false);
    } catch (e) {
      console.error(e);
      setError("Vorschlag konnte nicht eingereicht werden.");
    }
  };

  const handleVote = async (id, delta) => {
  if (!user) return;
  setError("");

  // Doppeltes Klicken auf die gleiche Richtung verhindern (Client-Seite)
  const current = suggestions.find((s) => s.id === id);
  if (current && current._myVote === delta) {
    return; // schon so gevotet → kein weiterer Request
  }

  try {
    const res = await fetch(`/api/card-suggestions/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ delta }),
    });
    if (!res.ok) {
      throw new Error("Fehler beim Voting");
    }
    const updated = await res.json();

    // Lokales Feld _myVote anhängen, um die Buttons zu stylen
    updated._myVote = delta;

    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === updated.id ? { ...updated, _myVote: delta } : s
      )
    );
  } catch (e) {
    console.error(e);
    setError("Deine Stimme konnte nicht gespeichert werden.");
  }
};


  const handleDelete = async (id) => {
    if (!userIsStreamer) return;

    if (!window.confirm("Diesen Vorschlag wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/card-suggestions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Fehler beim Löschen");
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
      setError("Vorschlag konnte nicht gelöscht werden.");
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">
          Vorschläge für neue Karten
        </h1>
        <p className="mb-4">
          Melde dich mit deinem Twitch-Account an, um Vorschläge zu sehen,
          zu voten und eigene Ideen einzureichen.
        </p>
        <button
          onClick={() => login(true)}
          className="bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg"
        >
          Mit Twitch einloggen
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-8 text-white px-2">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            Vorschläge für neue Karten
          </h1>
          <p className="text-sm text-gray-300">
            Stimme über Vorschläge ab oder reiche deine eigene Karten-Idee ein.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/Packs"
            className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            ⬅️ Zurück zum Pack
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="bg-gray-900/80 rounded-2xl p-4 md:p-6 shadow-xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              Eigene Idee einreichen
            </h2>
            <p className="text-xs text-gray-400">
              Überlege dir einen Namen, Typ, Seltenheit und eine kurze Beschreibung.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="px-4 py-2 rounded-lg bg-[#9146FF] hover:bg-[#7d36ff] text-sm font-semibold"
          >
            {showForm ? "Formular schließen" : "Vorschlag einreichen"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-gray-900/90 border border-gray-700 rounded-2xl p-4 space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    handleFormChange("name", e.target.value)
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                  placeholder="Name der Karte"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Typ
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    handleFormChange("type", e.target.value)
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                >
                  <option value="">Bitte auswählen</option>
                  {CARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Seltenheit
                </label>
                <select
                  value={form.rarity}
                  onChange={(e) =>
                    handleFormChange("rarity", e.target.value)
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                >
                  <option value="">Bitte auswählen</option>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {RARITY_LABELS[r] || r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Beschreibung
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    handleFormChange("description", e.target.value)
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                  placeholder="Kurzbeschreibung der Karte"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm"
              >
                Zurück
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#9146FF] hover:bg-[#7d36ff] text-sm font-semibold"
              >
                Einreichen
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-gray-900/80 rounded-2xl p-4 md:p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-3">
          Bestehende Vorschläge
        </h2>
        {loading ? (
          <div className="text-sm text-gray-400">
            Vorschläge werden geladen…
          </div>
        ) : sortedSuggestions.length === 0 ? (
          <div className="text-sm text-gray-400">
            Es wurden noch keine Vorschläge eingereicht.
          </div>
        ) : (
          <ul className="space-y-3 text-sm">
            {sortedSuggestions.map((s) => {
            const myVote = s._myVote || 0;

            return (
                <li
                key={s.id}
                className="bg-gray-900/80 border border-gray-700 rounded-xl p-3"
                >
                <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="font-semibold">
                        {s.name || "Ohne Titel"}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                        Typ:{" "}
                        <span className="font-medium">
                            {s.type || "-"}
                        </span>{" "}
                        · Seltenheit:{" "}
                        <span className="font-medium">
                            {RARITY_LABELS[s.rarity] || s.rarity || "-"}
                        </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          von <span className="text-gray-200 font-medium">
                            {s.authorTwitchLogin || s.authorName || s.authorTwitchId}
                          </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                        type="button"
                        disabled={!user}
                        onClick={() => handleVote(s.id, 1)}
                        className={`px-2 py-1 rounded-lg text-xs disabled:opacity-50 ${
                            myVote === 1
                            ? "bg-green-700"
                            : "bg-gray-800 hover:bg-gray-700"
                        }`}
                        >
                        👍
                        </button>
                        <button
                        type="button"
                        disabled={!user}
                        onClick={() => handleVote(s.id, -1)}
                        className={`px-2 py-1 rounded-lg text-xs disabled:opacity-50 ${
                            myVote === -1
                            ? "bg-red-700"
                            : "bg-gray-800 hover:bg-gray-700"
                        }`}
                        >
                        👎
                        </button>
                        <span className="ml-1 text-sm font-semibold w-8 text-center">
                        {s.votes || 0}
                        </span>
                        {userIsStreamer && (
                        <button
                            type="button"
                            onClick={() => handleDelete(s.id)}
                            className="ml-2 px-2 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-xs"
                        >
                            Löschen
                        </button>
                        )}
                    </div>
                    </div>
                    {s.description && (
                    <p className="text-xs text-gray-300 whitespace-pre-line">
                        {s.description}
                    </p>
                    
                    )}
                </div>
                </li>
            );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
