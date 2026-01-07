// src/pages/CardGalleryPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";

const MAX_GALLERY = 10;

const RARITY_ORDER = [
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

function rarityRank(r) {
  const i = RARITY_ORDER.indexOf(String(r || ""));
  return i === -1 ? 0 : i;
}

function guessLoginName(data, user) {
  return (
    data?.twitchLogin ||
    user?.login ||
    user?.username ||
    user?.display_name ||
    user?.displayName ||
    user?.name ||
    ""
  );
}

export default function CardGalleryPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [loading, setLoading] = useState(true);
  const [busySave, setBusySave] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);

  const [error, setError] = useState("");
  const [album, setAlbum] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [published, setPublished] = useState(false);

  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
    const [rarityFilter, setRarityFilter] = useState(""); // "" = alle
    const [sortMode, setSortMode] = useState("rarity_desc"); 
// "rarity_desc" | "rarity_asc" | "name_asc" | "count_desc" | "number_asc"

  // Laden: owned + gallery
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/user/${user.id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Fehler beim Laden deiner Karten");

        const data = await res.json();
        setAlbum(data);

        setSelectedIds(Array.isArray(data.gallery) ? data.gallery.map(String) : []);
        setPublished(!!data.galleryPublished); // falls du es ergänzt hast
      } catch (e) {
        console.error(e);
        setError("Galerie konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const ownedCards = useMemo(() => {
  const list = Array.isArray(album?.owned) ? album.owned : [];

  // nur Karten die du besitzt
  let out = list.filter((c) => Number(c.count || 0) > 0);

  // Filter: rarity
  if (rarityFilter) {
    out = out.filter((c) => String(c.rarity || "") === rarityFilter);
  }

  // Filter: Search (Name/Typ/Rarity)
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    out = out.filter((c) => {
      const name = String(c.name || "").toLowerCase();
      const type = String(c.type || "").toLowerCase();
      const rarity = String(c.rarity || "").toLowerCase();
      return name.includes(q) || type.includes(q) || rarity.includes(q);
    });
  }

  // Sort
  out = out.slice().sort((a, b) => {
    if (sortMode === "rarity_desc") {
      const ra = rarityRank(a.rarity);
      const rb = rarityRank(b.rarity);
      if (rb !== ra) return rb - ra;
    } else if (sortMode === "rarity_asc") {
      const ra = rarityRank(a.rarity);
      const rb = rarityRank(b.rarity);
      if (ra !== rb) return ra - rb;
    } else if (sortMode === "count_desc") {
      const ca = Number(a.count || 0);
      const cb = Number(b.count || 0);
      if (cb !== ca) return cb - ca;
    } else if (sortMode === "name_asc") {
      const na = String(a.name || "");
      const nb = String(b.name || "");
      const cmp = na.localeCompare(nb, "de");
      if (cmp !== 0) return cmp;
    }

    // Fallback: nach Nummer (wenn vorhanden)
    const na = parseInt(a.number || "0", 10);
    const nb = parseInt(b.number || "0", 10);
    return na - nb;
  });

  return out;
}, [album, rarityFilter, search, sortMode]);

  const byId = useMemo(() => {
    const m = new Map();
    ownedCards.forEach((c) => m.set(String(c.id), c));
    return m;
  }, [ownedCards]);

  const selectedCards = useMemo(() => {
    return (selectedIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  }, [selectedIds, byId]);

  const loginName = useMemo(() => guessLoginName(album, user), [album, user]);

  const publicUrl = useMemo(() => {
    if (!loginName) return "";
    return `${window.location.origin}/Packs/Galerie/${encodeURIComponent(
      String(loginName).toLowerCase()
    )}`;
  }, [loginName]);

  const toggleCard = (id) => {
    const sid = String(id);

    setSelectedIds((prev) => {
      const has = prev.includes(sid);
      if (has) return prev.filter((x) => x !== sid);
      if (prev.length >= MAX_GALLERY) return prev; // max 10
      return [...prev, sid];
    });
  };

  const doSave = async () => {
    if (!user) return;
    setError("");
    setBusySave(true);
    try {
      const res = await fetch(`/api/cards/user/${user.id}/gallery`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gallery: selectedIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Speichern fehlgeschlagen");
      }
      // optional: zurückgesendete gallery übernehmen
      if (Array.isArray(data?.gallery)) {
        setSelectedIds(data.gallery.map(String));
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Speichern fehlgeschlagen");
    } finally {
      setBusySave(false);
    }
  };

  const doPublishToggle = async () => {
    if (!user) return;
    const next = !published;

    setError("");
    setBusyPublish(true);
    try {
      const res = await fetch(`/api/cards/user/${user.id}/gallery/publish`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ published: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Publish fehlgeschlagen");
      setPublished(data?.galleryPublished ?? next);
    } catch (e) {
      console.error(e);
      setError(e.message || "Publish fehlgeschlagen");
    } finally {
      setBusyPublish(false);
    }
  };

  const doCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {}
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">Galerie</h1>
        <p className="mb-4">Melde dich mit Twitch an, um deine Galerie zu bearbeiten.</p>
        <button
          onClick={() => login(true)}
          className="bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg"
        >
          Mit Twitch einloggen
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center text-white mt-8">Galerie wird geladen…</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto mt-8 text-white px-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🖼️ Deine Galerie</h1>
          <p className="text-sm text-gray-300">
            Wähle bis zu <span className="font-semibold">{MAX_GALLERY}</span> Karten aus deiner Sammlung aus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/Packs/Galerien/"
            className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            ⬅️ Zurück zur Galerie
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      {/* Actions */}
      <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4 md:p-6 shadow-xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm text-gray-300">
            Ausgewählt: <span className="font-semibold">{selectedIds.length}</span> / {MAX_GALLERY}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={doSave}
              disabled={busySave}
              className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                busySave ? "bg-gray-700 text-gray-300" : "bg-[#9146FF] hover:bg-[#7d36ff]"
              }`}
            >
              {busySave ? "Speichere…" : "Speichern"}
            </button>

            <button
              onClick={doPublishToggle}
              disabled={busyPublish}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                published
                  ? "bg-green-600/30 hover:bg-green-600/40 border-green-500/40"
                  : "bg-gray-800 hover:bg-gray-700 border-gray-700"
              }`}
            >
              {busyPublish ? "…" : published ? "✅ Veröffentlicht" : "📣 Veröffentlichen"}
            </button>

            {published && publicUrl && (
              <>
                <button
                  onClick={doCopy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700"
                >
                  {copied ? "Copied!" : "Share-Link kopieren"}
                </button>

                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700"
                >
                  Öffnen ↗
                </a>
              </>
            )}
          </div>
        </div>

        {published && publicUrl && (
          <div className="mt-3 text-xs text-gray-400 break-all">
            Public: <span className="text-gray-200">{publicUrl}</span>
          </div>
        )}
      </div>

      {/* Layout: links ausgewählt, rechts Sammlung */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Selected */}
        <div className="xl:w-[520px]">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Deine Auswahl</h2>

            {selectedCards.length === 0 ? (
              <div className="text-sm text-gray-400">
                Noch keine Karten ausgewählt. Klicke rechts in deiner Sammlung auf Karten, um sie hinzuzufügen.
              </div>
            ) : (
              <div
                className="grid gap-4 justify-center"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
              >
                {selectedCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleCard(card.id)}
                    className="relative flex justify-center focus:outline-none"
                    title="Klicken zum Entfernen"
                  >
                    <Card card={card} />
                    <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded text-xs">
                      Entfernen ✖
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Owned list */}
        <div className="flex-1">
          <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">Deine Sammlung (klick zum Hinzufügen/Entfernen)</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Suchen (Name/Typ/Rarity)…"
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                />

                <select
                    value={rarityFilter}
                    onChange={(e) => setRarityFilter(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                >
                    <option value="">Alle Seltenheiten</option>
                    {RARITY_ORDER.slice().reverse().map((r) => (
                    <option key={r} value={r}>
                        {RARITY_LABELS[r] || r}
                    </option>
                    ))}
                </select>

                <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
                >
                    <option value="rarity_desc">Seltenheit (hoch → niedrig)</option>
                    <option value="rarity_asc">Seltenheit (niedrig → hoch)</option>
                    <option value="count_desc">Anzahl (hoch → niedrig)</option>
                    <option value="name_asc">Name (A → Z)</option>
                    <option value="number_asc">Nummer (aufsteigend)</option>
                </select>
                <button
                    type="button"
                    onClick={() => { setSearch(""); setRarityFilter(""); setSortMode("rarity_desc"); }}
                    className="mt-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs"
                    >
                    Filter zurücksetzen
                    </button>
                </div>

            {ownedCards.length === 0 ? (
              <div className="text-sm text-gray-400">Du besitzt noch keine Karten.</div>
            ) : (
              <div
                className="grid gap-8 justify-center"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
              >
                {ownedCards.map((card) => {
                  const selected = selectedIds.includes(String(card.id));
                  const count = Number(card.count || 0);

                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => toggleCard(card.id)}
                      className={`relative flex justify-center rounded-xl focus:outline-none transition ${
                        selected ? "ring-2 ring-[#9146FF]" : "hover:opacity-95"
                      }`}
                      title={selected ? "Klicken zum Entfernen" : "Klicken zum Hinzufügen"}
                    >
                      <Card card={card} />
                      {count > 1 && (
                        <div className="absolute top-2 right-2 z-5 bg-black/80 px-2 py-1 rounded text-xs font-semibold">
                          x{count}
                        </div>
                      )}
                      <div
                        className={`absolute bottom-2 left-2 z-5 px-2 py-1 rounded text-xs font-semibold ${
                          selected ? "bg-[#9146FF]" : "bg-black/70"
                        }`}
                      >
                        {selected ? "In Galerie ✓" : "Zur Galerie +"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
