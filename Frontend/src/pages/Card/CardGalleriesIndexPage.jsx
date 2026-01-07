// src/pages/Card/CardGalleriesIndexPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import Card from "../../components/Card";

export default function CardGalleriesIndexPage() {
  const { user, login } = useContext(TwitchAuthContext);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [galleries, setGalleries] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/cards/galleries", {
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Fehler beim Laden der Galerien");
        }

        setGalleries(Array.isArray(data?.galleries) ? data.galleries : []);
      } catch (e) {
        console.error(e);
        setError(e.message || "Galerien konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return galleries;

    return (galleries || []).filter((g) =>
      String(g.twitchLogin || "").toLowerCase().includes(s)
    );
  }, [galleries, q]);

  return (
    <div className="max-w-[1400px] mx-auto mt-8 text-white px-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🖼️ Galerien</h1>
          <p className="text-sm text-gray-300">
            Schau dir veröffentlichte Galerien an – oder erstelle deine eigene.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/Packs"
            className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            ⬅️ Zurück zum Pack
          </Link>

          {user ? (
            <Link
              to="/Packs/Galerie"
              className="inline-flex items-center gap-1 bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg text-sm font-semibold"
            >
              ✨ Eigene Galerie bearbeiten
            </Link>
          ) : (
            <button
              onClick={() => login(true)}
              className="inline-flex items-center gap-1 bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Mit Twitch einloggen
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      {/* Search */}
      <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4 md:p-6 shadow-xl mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Veröffentlichte Galerien</div>
            <div className="text-xs text-gray-400">
              {loading ? "Lade…" : `${filtered.length} Galerie(n) gefunden`}
            </div>
          </div>

          <div className="w-full md:w-[320px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen nach Twitch-Name…"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4 md:p-6 shadow-xl">
        {loading ? (
          <div className="text-sm text-gray-400">Galerien werden geladen…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-400">
            Keine veröffentlichten Galerien gefunden.
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((g) => {
              const loginName = String(g.twitchLogin || "");
              const preview = Array.isArray(g.previewCards) ? g.previewCards : [];
              const cardsCount = Number(g.cardsCount || preview.length || 0);

              return (
                <div
                  key={loginName}
                  className="bg-gray-900/80 border border-gray-700 rounded-2xl p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{loginName}</div>
                      <div className="text-xs text-gray-400">
                        Karten in Galerie:{" "}
                        <span className="text-gray-200 font-medium">
                          {cardsCount}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/Packs/Galerie/${encodeURIComponent(
                        loginName.toLowerCase()
                      )}`}
                      className="inline-flex justify-center md:justify-start items-center gap-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm font-semibold"
                    >
                      Galerie ansehen ↗
                    </Link>
                  </div>

                  {/* Preview Cards */}
                  {preview.length > 0 && (
                    <div
                      className="mt-4 grid gap-4 justify-center"
                      style={{
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(320px, 1fr))",
                      }}
                    >
                      {preview.map((card) => (
                        <div key={card.id} className="flex justify-center">
                          <Card card={card} />
                        </div>
                      ))}
                    </div>
                  )}

                  {preview.length === 0 && (
                    <div className="mt-3 text-xs text-gray-500">
                      Keine Vorschau verfügbar.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
