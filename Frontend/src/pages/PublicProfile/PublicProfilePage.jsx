// PublicProfilePage.jsx — /u/<login>: das öffentliche Profil (opt-in unter /profile). Erfolge aus allen Bereichen der
// Seite auf einer teilbaren Seite; die Daten kommen fertig aus Backend/profile/profileRoutes.js. Abschnitte, in denen
// jemand nie etwas gemacht hat, liefert der Server gar nicht erst.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, Loader2, Share2, UserRound } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Card, Section as UiSection, Button } from "../../components/ui";
import { leagueIconUrl, leagueName } from "../ClashRoyale/data/leagueIcons";
import { trophyArenaIcon } from "../ClashRoyale/data/trophyArenas";

const fmt = (n) => (Number(n) || 0).toLocaleString("de-DE");

function Stat({ value, label }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">{value}</div>
      <div className="text-xs text-white/45 mt-1.5">{label}</div>
    </div>
  );
}

// Abschnitt mit Link „Selbst nutzen“ o. Ä. rechts oben — der gemeinsame Baustein aus components/ui
function Section({ title, kicker, to, linkLabel, children }) {
  return (
    <UiSection
      title={title}
      kicker={kicker}
      actions={to && (
        <Link to={to} className="group inline-flex items-center gap-1 text-xs font-semibold text-white/45 hover:text-accent-soft">
          {linkLabel} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    >
      {children}
    </UiSection>
  );
}

function WinTrackerSection({ d }) {
  const ranked = d.trackMode !== "trophies" && d.leagueNumber > 0;
  const games = d.last30.wins + d.last30.losses + d.last30.draws;
  const rate = games > 0 ? Math.round((d.last30.wins / games) * 100) : null;
  return (
    <Section title="Win Tracker" kicker="Clash Royale" to="/clash-royale/win-tracker" linkLabel="Selbst nutzen">
      <div className="flex items-center gap-3 mb-5">
        {ranked
          ? <img src={leagueIconUrl(d.leagueNumber)} alt="" className="w-12 h-12 object-contain shrink-0" />
          : <img src={trophyArenaIcon(d.trophies)} alt="" className="w-12 h-12 object-contain shrink-0" />}
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{d.playerName || "Clash-Royale-Account"}</div>
          <div className="text-sm text-white/50">
            {ranked ? `${leagueName(d.leagueNumber, "de")}${d.seasonMedals ? ` · ${fmt(d.seasonMedals)} Medaillen` : ""}` : `${fmt(d.trophies)} Trophäen`}
            {d.polRank ? ` · Platz ${fmt(d.polRank)}` : ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
        <Stat value={`${d.last30.wins}–${d.last30.losses}`} label="Siege–Niederlagen (30 Tage)" />
        <Stat value={rate === null ? "–" : `${rate} %`} label="Siegquote" />
        <Stat value={fmt(d.bestTrophies)} label="Trophäen-Rekord" />
      </div>
    </Section>
  );
}

function TournamentsSection({ list }) {
  const wins = list.filter((t) => t.champion).length;
  return (
    <Section title="Turniere" kicker="Clash Royale" to="/clash-royale" linkLabel="Zu den Turnieren">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Stat value={list.length} label={list.length === 1 ? "Turnier gespielt" : "Turniere gespielt"} />
        <Stat value={wins} label={wins === 1 ? "Turniersieg" : "Turniersiege"} />
      </div>
      <ul className="border-t border-white/10 divide-y divide-white/10">
        {list.slice(0, 5).map((t) => (
          <li key={t.id}>
            <Link to={`/clash-royale/turnier/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-white">
              <span className="truncate text-white/80">{t.name}</span>
              <span className={`shrink-0 text-xs font-semibold ${t.champion ? "text-amber-300" : "text-white/40"}`}>
                {t.champion ? "Sieger" : t.status === "running" ? "Läuft" : "Teilgenommen"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SeedRunnersSection({ d }) {
  return (
    <Section title="Level-Baumeister" kicker="Seed Runners" to={`/seed-runners/levels/creator/${d.creatorId}`} linkLabel="Level ansehen">
      <div className="grid grid-cols-3 gap-4">
        <Stat value={d.levels} label="Level gebaut" />
        <Stat value={fmt(d.plays)} label="Mal gespielt" />
        <Stat value={d.ratings > 0 ? (d.ratingAvg || 0).toFixed(1).replace(".", ",") : "–"} label={`Sterne (${d.ratings} Bewertungen)`} />
      </div>
    </Section>
  );
}

function AdventureSection({ d }) {
  return (
    <Section title="adVentures" kicker="Roguelite" to="/adventures" linkLabel="Spielen">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat value={d.level} label="Stufe" />
        <Stat value={`${d.wins}/${d.runs}`} label="Siege / Läufe" />
        <Stat value={fmt(d.bestScore)} label="Bestwert" />
        <Stat value={`${d.achievements}/${d.achievementsTotal}`} label="Erfolge" />
      </div>
    </Section>
  );
}

function GardenSection({ d }) {
  return (
    <Section title="Virtual Farm" kicker="Farm" to="/garden" linkLabel="Spielen">
      <div className="grid grid-cols-2 gap-4">
        <Stat value={d.level} label="Farm-Stufe" />
        <Stat value={fmt(d.gold)} label="Gold" />
      </div>
    </Section>
  );
}

function ShareButton({ name }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async () => {
    const url = window.location.href.split("?")[0];
    const mobil = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (mobil && navigator.share) {
      try { await navigator.share({ title: `${name} auf vnmvalentin.de`, url }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 2200);
    } catch { /* ohne Zwischenablage bleibt die Adresszeile */ }
  };
  return (
    <Button variant="secondary" onClick={share} icon={done ? Check : Share2}>
      {done ? "Link kopiert" : "Profil teilen"}
    </Button>
  );
}

export default function PublicProfilePage() {
  const { login } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, data: null, error: "" });
    fetch(`/api/public-profile/u/${encodeURIComponent(login)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "Dieses Profil gibt es nicht.");
        setState({ loading: false, data: d, error: "" });
      })
      .catch((e) => { if (e.name !== "AbortError") setState({ loading: false, data: null, error: e.message }); });
    return () => ctrl.abort();
  }, [login]);

  const { loading, data, error } = state;
  const name = data?.displayName || login;
  const s = data?.sections || {};
  const empty = data && Object.keys(s).length === 0;

  return (
    <Page width="default" className="py-4 md:py-8">
      <SEO
        title={data ? `${name} — Profil` : "Profil"}
        description={`Das Profil von ${name} auf vnmvalentin.de: Clash-Royale-Statistik, Turniere, Level und Spielstände.`}
        path={`/u/${String(login || "").toLowerCase()}`}
        noindex={!data}
      />

      {loading && <p className="flex items-center gap-2 text-sm text-white/50 py-16"><Loader2 size={16} className="animate-spin" /> Lade Profil …</p>}

      {!loading && error && (
        <Card className="p-8 max-w-lg">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-2">Kein öffentliches Profil</h1>
          <p className="text-sm text-white/55 mb-5">{error} Profile sind erst sichtbar, wenn man sie unter „Profil“ selbst einschaltet.</p>
          <Button to="/profile" variant="secondary">
            Eigenes Profil einrichten <ArrowRight size={15} />
          </Button>
        </Card>
      )}

      {data && (
        <>
          <PageHeader
            media={data.avatar
              ? <img src={data.avatar} alt="" className="w-20 h-20 rounded-lg object-cover border border-line" />
              : <span className="w-20 h-20 rounded-lg border border-line bg-white/[0.03] flex items-center justify-center text-white/30"><UserRound size={32} /></span>}
            kicker="Profil"
            title={name}
            description={<a href={`https://twitch.tv/${data.login}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">twitch.tv/{data.login}</a>}
            actions={<ShareButton name={name} />}
          />

          {empty ? (
            <Card as="p" className="text-sm text-white/55">Hier ist noch nichts zu sehen — {name} hat noch keine Spielstände auf der Seite.</Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {s.winTracker && <WinTrackerSection d={s.winTracker} />}
              {s.tournaments && <TournamentsSection list={s.tournaments} />}
              {s.seedRunners && <SeedRunnersSection d={s.seedRunners} />}
              {s.adventure && <AdventureSection d={s.adventure} />}
              {s.garden && <GardenSection d={s.garden} />}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
