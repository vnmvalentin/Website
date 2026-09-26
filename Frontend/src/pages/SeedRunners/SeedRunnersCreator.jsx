// SeedRunnersCreator.jsx — das Profil eines Erstellers: Name, Summen über seine veröffentlichten Level, und die Level selbst.
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import SEO from "../../components/SEO";
import LevelCard from "./levels/LevelCard.jsx";
import { getCreator } from "./levels/levelsApi.js";
import { primaryButtonClass } from "./editor/fields.jsx";

const Stat = ({ label, value }) => (
  <div className="px-4 py-3">
    <p className="text-[11px] uppercase tracking-wider text-white/35 mb-0.5">{label}</p>
    <p className="text-xl text-white tabular-nums font-display font-bold">{value}</p>
  </div>
);

export default function SeedRunnersCreator() {
  const { id } = useParams();
  const [creator, setCreator] = useState(undefined);   // undefined: lädt, null: gibt es nicht
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setCreator(undefined);
    setError("");
    getCreator(id)
      .then((c) => { if (alive) setCreator(c); })
      .catch((e) => { if (alive) setError(e.message || "Das Profil konnte nicht geladen werden."); });
    return () => { alive = false; };
  }, [id]);

  if (creator === null) {
    return (
      <div className="page-fade w-full max-w-xl mx-auto px-4 py-16">
        <SEO title="Ersteller nicht gefunden — Seed Runners" description="Diesen Ersteller gibt es nicht." path="/seed-runners/levels" noindex />
        <h1 className="font-display text-2xl font-bold text-white mb-3">Diesen Ersteller gibt es nicht</h1>
        <p className="text-sm text-white/55 mb-6">Entweder hat er noch kein Level veröffentlicht, oder der Link stimmt nicht.</p>
        <Link to="/seed-runners/levels" className={primaryButtonClass}><ArrowLeft size={14} />Zum Level-Browser</Link>
      </div>
    );
  }
  if (creator === undefined) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-16">
        {error ? <p className="text-sm text-amber-300" role="alert">{error}</p> : <p className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={15} className="animate-spin" />Lädt …</p>}
      </div>
    );
  }

  return (
    <div className="page-fade w-full max-w-6xl mx-auto px-2 md:px-4 py-8 md:py-12">
      <SEO title={`${creator.name} — Level-Ersteller — Seed Runners`} description={`Level von ${creator.name}.`} path={`/seed-runners/levels/creator/${creator.id}`} />
      <Link to="/seed-runners/levels" className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white transition-colors mb-4">
        <ArrowLeft size={15} />Level-Browser
      </Link>
      <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight mb-1" data-testid="creator-name">{creator.name}</h1>
      <p className="text-sm text-white/50 mb-5">{creator.isMe ? "Das bist du." : "Level-Ersteller"}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 border border-white/10 rounded-md bg-[#0d0d14] mb-6">
        <Stat label="Level" value={creator.stats.levels} />
        <Stat label="Versuche" value={creator.stats.plays} />
        <Stat label="Im Ziel" value={creator.stats.clears} />
        <Stat label="Bewertungen" value={creator.stats.ratingAvg ? `${creator.stats.ratingAvg.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ★ (${creator.stats.ratings})` : "–"} />
      </div>

      {creator.levels.length === 0 ? (
        <p className="text-sm text-white/45">Noch keine veröffentlichten Level.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creator.levels.map((l) => <LevelCard key={l.code} level={l} />)}
        </div>
      )}
    </div>
  );
}
