// src/pages/CardGalleryPublicPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../components/Card";

export default function CardGalleryPublicPage() {
  const { twitchLogin } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cards, setCards] = useState([]);
  const [owner, setOwner] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/gallery/${encodeURIComponent(twitchLogin)}`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.error || "Galerie nicht gefunden");
        }

        setOwner(data?.twitchLogin || twitchLogin);
        setCards(Array.isArray(data?.cards) ? data.cards : []);
      } catch (e) {
        console.error(e);
        setError(e.message || "Galerie konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, [twitchLogin]);

  if (loading) {
    return <div className="text-center text-white mt-8">Galerie wird geladen…</div>;
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-gray-900/80 p-6 rounded-2xl text-center text-white">
        <h1 className="text-2xl font-bold mb-2">🖼️ Galerie</h1>
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <Link
          to="/Packs/Galerien"
          className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
        >
          ⬅️ Zur Galerie
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto mt-8 text-white px-2">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🖼️ Galerie von {owner}</h1>
          <p className="text-sm text-gray-300">
            {cards.length ? `Ausgewählte Karten: ${cards.length}` : "Keine Karten in der Galerie."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/Packs/Galerien/"
            className="inline-flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            ⬅️ Zur Galerie
          </Link>
        </div>
      </div>

      <div className="bg-gray-900/70 border border-gray-700 rounded-2xl p-4">
        {cards.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Noch keine Galerie-Karten gesetzt.</div>
        ) : (
          <div
            className="grid gap-8 justify-center"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
          >
            {cards.map((card) => (
              <div key={card.id} className="flex justify-center">
                <Card card={card} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
