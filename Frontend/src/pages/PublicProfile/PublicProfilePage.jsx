// PublicProfilePage.jsx — /u/<adresse>: die Visitenkarte (opt-in unter /profile), für jedes Konto — Twitch, Discord
// oder Gast. Die Daten kommen fertig aus Backend/profile/profileRoutes.js: Abschnitte in der Reihenfolge, die der
// Besitzer gewählt hat; Abschnitte ohne Inhalt oder versteckte liefert der Server gar nicht erst.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Award, Check, Heart, Loader2, Share2, Timer } from "lucide-react";
import logo from "../../assets/logo-header.webp";
import { TwitchGlyph } from "../../components/BrandGlyphs";
import SEO from "../../components/SEO";
import KontoBild from "../../components/KontoBild";
import { Page, Card, Section as UiSection, Button } from "../../components/ui";
import LanguageSwitch from "../../i18n/LanguageSwitch";
import { useLanguage } from "../../i18n/language.js";
import { NAV_CATEGORIES } from "../../config/navigation";
import { leagueIconUrl, leagueName } from "../ClashRoyale/data/leagueIcons";
import { trophyArenaIcon } from "../ClashRoyale/data/trophyArenas";
import { VISITENKARTE_TEXTE } from "./visitenkarteTexte.js";
import { formatiereBestwert, nameIn, zahl } from "./visitenkarte.js";

// Vorschaubild eines Spiels aus der Navigation (dieselben Bilder wie auf der Startseite)
const NAV_LINKS = NAV_CATEGORIES.flatMap((c) => c.links || []);
function spielBild(pfad) {
  const l = NAV_LINKS.find((x) => x.to === pfad);
  return l?.previews?.[0]?.src || l?.thumb || null;
}

function Stat({ value, label }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-2xl font-bold text-white tabular-nums leading-none">{value}</div>
      <div className="text-xs text-white/55 mt-1.5">{label}</div>
    </div>
  );
}

// Abschnitt mit Link „Selbst nutzen“ o. Ä. rechts oben — der gemeinsame Baustein aus components/ui
function Section({ title, kicker, to, linkLabel, children, className = "" }) {
  return (
    <UiSection
      className={className}
      title={title}
      kicker={kicker}
      actions={to && (
        <Link to={to} className="group inline-flex items-center gap-1 text-xs font-semibold text-white/55 hover:text-accent-soft">
          {linkLabel} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    >
      {children}
    </UiSection>
  );
}

function LieblingsspielSection({ d, t, lang }) {
  const bild = spielBild(d.pfad);
  return (
    <Section title={d.name} kicker={t.abschnitt.lieblingsspiel} to={d.pfad} linkLabel={t.spielen}>
      <Link to={d.pfad} aria-label={`${t.spielen}: ${d.name}`}
        className="group flex items-center gap-4 rounded-lg border border-line bg-black/20 p-2.5 hover:border-white/25 transition-colors">
        {bild
          ? <img src={bild} alt="" loading="lazy" className="w-28 aspect-[16/10] rounded-md object-cover shrink-0" />
          : <span className="w-28 aspect-[16/10] rounded-md bg-white/[0.04] flex items-center justify-center text-white/30 shrink-0"><Heart size={22} /></span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm text-white/60 tabular-nums">
            <Heart size={14} className="text-rose-300 shrink-0" />
            {d.xp > 0 ? t.xp(zahl(d.xp, lang)) : t.nochOhneXp}
          </span>
        </span>
        <ArrowRight size={16} className="text-white/35 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 mr-1.5" />
      </Link>
    </Section>
  );
}

// Ein Abzeichen als Plakette: Medaille links, Name daneben. `gross` für die Vitrine im Kartenkopf.
function Plakette({ e, lang, gross = false }) {
  return (
    <li title={nameIn(e.text, lang)}
      className={`flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] max-w-full ${gross ? "pl-1.5 pr-3.5 py-1.5" : "pl-1 pr-3 py-1"}`}>
      <span className={`flex items-center justify-center rounded-md bg-amber-400/15 border border-amber-300/30 text-amber-300 shrink-0 ${gross ? "w-9 h-9" : "w-7 h-7"}`}>
        <Award size={gross ? 19 : 15} />
      </span>
      <span className={`font-semibold text-amber-50 truncate ${gross ? "text-sm" : "text-xs"}`}>{nameIn(e.name, lang, e.erfolg)}</span>
    </li>
  );
}

// Die Vitrine steht im Kartenkopf (KartenKopf) — hier folgen die übrigen Abzeichen. Gibt es keine weiteren, entfällt
// der Abschnitt (Abschnitt() unten).
function AbzeichenSection({ d, t, lang }) {
  const alle = d.vitrine.length + d.weitere.length;
  const [offen, setOffen] = useState(false);
  const weitere = offen ? d.weitere : d.weitere.slice(0, 12);
  return (
    <Section title={t.abschnitt.abzeichen} kicker={t.abzeichenGesamt(alle)}>
      {weitere.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {weitere.map((e) => (
            <li key={e.key} title={nameIn(e.text, lang)}
              className="rounded-md border border-line bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-white/70">
              {nameIn(e.name, lang, e.erfolg)}
            </li>
          ))}
          {!offen && d.weitere.length > weitere.length && (
            <li>
              <button type="button" onClick={() => setOffen(true)} className="rounded-md px-2.5 py-1 text-xs font-semibold text-accent-soft hover:text-white">
                {t.weitereAbzeichen(d.weitere.length - weitere.length)}
              </button>
            </li>
          )}
        </ul>
      )}
    </Section>
  );
}

function BestwerteSection({ list, t, lang }) {
  return (
    <Section title={t.abschnitt.bestwerte}>
      <ul className="divide-y divide-white/10">
        {list.map((b) => (
          <li key={`${b.spiel}:${b.wert}`} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm text-white/85 truncate">{nameIn(b.name, lang, b.wert)}</span>
              <span className="block text-xs text-white/55">{b.spielName}</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0 font-display text-lg font-bold text-white tabular-nums">
              {b.art === "zeit" && <Timer size={14} className="text-white/55" />}
              {formatiereBestwert(b.art, b.zahl, lang)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SpieleSection({ list, stufe, t, lang }) {
  const spanne = stufe ? Math.max(1, stufe.naechste - stufe.ab) : 1;
  const anteil = stufe ? Math.min(100, Math.round(((stufe.xp - stufe.ab) / spanne) * 100)) : 0;
  return (
    <Section title={t.abschnitt.spiele}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Stat value={zahl(stufe?.xp || 0, lang)} label={t.erfahrung} />
        <Stat value={list.length} label={t.spieleGesamt(list.length)} />
      </div>
      {stufe && (
        <div className="mb-4">
          <div className="h-2 rounded-sm bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${anteil}%` }} />
          </div>
          <p className="text-xs text-white/55 mt-1.5 tabular-nums">{t.bisStufe(zahl(stufe.naechste - stufe.xp, lang), stufe.stufe + 1)}</p>
        </div>
      )}
      <ul className="border-t border-white/10 divide-y divide-white/10">
        {list.map((s) => (
          <li key={s.spiel} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-white/80 truncate">{s.name}</span>
            <span className="text-white/50 tabular-nums shrink-0">{t.xp(zahl(s.xp, lang))}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ClashSection({ d, t, lang }) {
  const ranked = d.leagueNumber > 0;
  return (
    <Section title={t.abschnitt.clash} kicker={t.crKonto} to={`/clash/spieler/${d.tag}`} linkLabel={t.statsAnsehen}>
      <div className="flex items-center gap-3 mb-5">
        <img src={ranked ? leagueIconUrl(d.leagueNumber) : trophyArenaIcon(d.trophies)} alt="" className="w-12 h-12 object-contain shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{d.name || `#${d.tag}`}</div>
          <div className="text-sm text-white/50">
            {ranked ? leagueName(d.leagueNumber, lang) : `${zahl(d.trophies, lang)} ${t.trophaeen}`}
            {d.polRank ? ` · ${t.platz(zahl(d.polRank, lang))}` : ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
        <Stat value={zahl(d.trophies, lang)} label={t.trophaeen} />
        <Stat value={ranked ? zahl(d.seasonMedals, lang) : zahl(d.bestTrophies, lang)} label={ranked ? t.medaillen : t.trophaeenRekord} />
        <div className="min-w-0">
          <div className="font-semibold text-white truncate leading-tight">{d.clan || "–"}</div>
          <div className="text-xs text-white/55 mt-1.5">{d.clan ? t.clan : t.ohneClan}</div>
        </div>
      </div>
    </Section>
  );
}

function WinTrackerSection({ d, t, lang }) {
  const ranked = d.trackMode !== "trophies" && d.leagueNumber > 0;
  const games = d.last30.wins + d.last30.losses + d.last30.draws;
  const rate = games > 0 ? Math.round((d.last30.wins / games) * 100) : null;
  return (
    <Section title={t.abschnitt.winTracker} kicker="Clash Royale" to="/clash-royale/win-tracker" linkLabel={t.selbstNutzen}>
      <div className="flex items-center gap-3 mb-5">
        <img src={ranked ? leagueIconUrl(d.leagueNumber) : trophyArenaIcon(d.trophies)} alt="" className="w-12 h-12 object-contain shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{d.playerName || t.crKonto}</div>
          <div className="text-sm text-white/50">
            {ranked ? `${leagueName(d.leagueNumber, lang)}${d.seasonMedals ? ` · ${zahl(d.seasonMedals, lang)} ${t.medaillen}` : ""}` : `${zahl(d.trophies, lang)} ${t.trophaeen}`}
            {d.polRank ? ` · ${t.platz(zahl(d.polRank, lang))}` : ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
        <Stat value={`${d.last30.wins}–${d.last30.losses}`} label={t.siegeNiederlagen} />
        <Stat value={rate === null ? "–" : `${rate} %`} label={t.siegquote} />
        <Stat value={zahl(d.bestTrophies, lang)} label={t.trophaeenRekord} />
      </div>
    </Section>
  );
}

function TournamentsSection({ list, t }) {
  const wins = list.filter((x) => x.champion).length;
  return (
    <Section title={t.abschnitt.tournaments} kicker="Clash Royale" to="/clash-royale" linkLabel={t.zuTurnieren}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Stat value={list.length} label={t.turniereGespielt(list.length)} />
        <Stat value={wins} label={t.turniersiege(wins)} />
      </div>
      <ul className="border-t border-white/10 divide-y divide-white/10">
        {list.slice(0, 5).map((x) => (
          <li key={x.id}>
            <Link to={`/clash-royale/turnier/${x.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-white">
              <span className="truncate text-white/80">{x.name}</span>
              <span className={`shrink-0 text-xs font-semibold ${x.champion ? "text-amber-300" : "text-white/55"}`}>
                {x.champion ? t.sieger : x.status === "running" ? t.laeuft : t.teilgenommen}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SeedRunnersSection({ d, t, lang }) {
  return (
    <Section title={t.abschnitt.seedRunners} kicker="Seed Runners" to={`/seed-runners/levels/creator/${d.creatorId}`} linkLabel={t.levelAnsehen}>
      <div className="grid grid-cols-3 gap-4">
        <Stat value={d.levels} label={t.levelGebaut} />
        <Stat value={zahl(d.plays, lang)} label={t.malGespielt} />
        <Stat value={d.ratings > 0 ? (d.ratingAvg || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–"} label={t.sterne(d.ratings)} />
      </div>
    </Section>
  );
}

function AdventureSection({ d, t, lang }) {
  return (
    <Section title={t.abschnitt.adventure} kicker="Roguelite" to="/adventures" linkLabel={t.spielen}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat value={d.level} label={t.stufeKurz} />
        <Stat value={`${d.wins}/${d.runs}`} label={t.siegeLaeufe} />
        <Stat value={zahl(d.bestScore, lang)} label={t.bestwert} />
        <Stat value={`${d.achievements}/${d.achievementsTotal}`} label={t.erfolge} />
      </div>
    </Section>
  );
}

function GardenSection({ d, t, lang }) {
  return (
    <Section title={t.abschnitt.garden} kicker="Farm" to="/garden" linkLabel={t.spielen}>
      <div className="grid grid-cols-2 gap-4">
        <Stat value={d.level} label={t.farmStufe} />
        <Stat value={zahl(d.gold, lang)} label={t.gold} />
      </div>
    </Section>
  );
}

function ShareButton({ name, t }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async () => {
    const url = window.location.href.split("?")[0];
    const mobil = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (mobil && navigator.share) {
      try { await navigator.share({ title: t.teilenTitel(name), url }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 2200);
    } catch { /* ohne Zwischenablage bleibt die Adresszeile */ }
  };
  return (
    <Button variant="secondary" size="sm" onClick={share} icon={done ? Check : Share2} className="!bg-black/55 !border-white/15 hover:!border-white/30">
      {done ? t.linkKopiert : t.teilen}
    </Button>
  );
}

function Abschnitt({ k, d, data, t, lang }) {
  switch (k) {
    case "lieblingsspiel": return <LieblingsspielSection d={d} t={t} lang={lang} />;
    case "abzeichen": return d.weitere.length > 0 ? <AbzeichenSection d={d} t={t} lang={lang} /> : null;
    case "bestwerte": return <BestwerteSection list={d} t={t} lang={lang} />;
    case "spiele": return <SpieleSection list={d} stufe={data.stufe} t={t} lang={lang} />;
    case "clash": return <ClashSection d={d} t={t} lang={lang} />;
    case "winTracker": return <WinTrackerSection d={d} t={t} lang={lang} />;
    case "tournaments": return <TournamentsSection list={d} t={t} />;
    case "seedRunners": return <SeedRunnersSection d={d} t={t} lang={lang} />;
    case "adventure": return <AdventureSection d={d} t={t} lang={lang} />;
    case "garden": return <GardenSection d={d} t={t} lang={lang} />;
    default: return null;
  }
}

function Kennzahl({ wert, name }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <dd className="font-display text-xl font-bold text-white tabular-nums leading-none">{wert}</dd>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/55 mt-1.5 truncate">{name}</dt>
    </div>
  );
}

// Kopf der Visitenkarte: Banner (Bild des Lieblingsspiels, sonst ein ruhiges Streifenmuster) mit Logo der Website,
// darunter Bild, Name, Stufe mit Fortschritt, Kennzahlen und die Abzeichen-Vitrine.
function KartenKopf({ data, name, s, t, lang, aktionen }) {
  const bild = s.lieblingsspiel ? spielBild(s.lieblingsspiel.pfad) : null;
  const stufe = data.stufe;
  const spanne = stufe ? Math.max(1, stufe.naechste - stufe.ab) : 1;
  const anteil = stufe ? Math.min(100, Math.round(((stufe.xp - stufe.ab) / spanne) * 100)) : 0;
  const vitrine = s.abzeichen?.vitrine || [];
  const abzeichen = s.abzeichen ? s.abzeichen.vitrine.length + s.abzeichen.weitere.length : 0;
  const kennzahlen = [
    stufe && { wert: zahl(stufe.xp, lang), name: t.erfahrung },
    s.spiele?.length > 0 && { wert: s.spiele.length, name: t.abschnitt.spiele },
    abzeichen > 0 && { wert: abzeichen, name: t.abschnitt.abzeichen },
    s.bestwerte?.length > 0 && { wert: s.bestwerte.length, name: t.abschnitt.bestwerte },
  ].filter(Boolean);

  return (
    <header className="relative overflow-hidden rounded-xl border border-line bg-surface mb-5">
      <div className="relative h-32 sm:h-40 bg-[#17132e]">
        {bild
          ? <img src={bild} alt="" className="absolute inset-0 w-full h-full object-cover opacity-55" />
          : <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(124_58_237/0.22)_0_2px,transparent_2px_16px)]" aria-hidden="true" />}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/35 to-black/35" aria-hidden="true" />
        <Link to="/" className="absolute top-3 left-3 sm:left-4 inline-flex items-center gap-2 rounded-lg bg-black/55 border border-white/15 px-1.5 sm:pr-3 py-1 text-white/90 hover:text-white hover:border-white/30 transition-colors">
          <img src={logo} alt="" width="24" height="24" className="h-6 w-auto" />
          <span className="font-display text-sm font-bold tracking-tight max-sm:hidden">vnmvalentin.de</span>
        </Link>
        <div className="absolute top-3 right-3 sm:right-4 flex items-center gap-2">{aktionen}</div>
      </div>

      <div className="relative px-5 sm:px-7 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 -mt-12 sm:-mt-14">
          {data.avatar
            ? <img src={data.avatar} alt="" className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover border-4 border-surface bg-surface shrink-0" />
            : <KontoBild konto={{ name }} className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-4 border-surface shrink-0" schrift="text-4xl" />}
          <div className="min-w-0 flex-1 sm:pb-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent-soft/80">{t.kicker}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white break-words leading-tight">{name}</h1>
            {data.twitchLogin && (
              <a href={`https://twitch.tv/${data.twitchLogin}`} target="_blank" rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors">
                <TwitchGlyph size={14} className="text-[#a970ff]" /> twitch.tv/{data.twitchLogin}
              </a>
            )}
          </div>
          {stufe && (
            <div className="shrink-0 sm:w-52 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent-soft">{t.stufeKurz}</span>
                <span className="font-display text-3xl font-bold text-white tabular-nums leading-none">{stufe.stufe}</span>
              </div>
              <div className="mt-2.5 h-1.5 rounded-sm bg-white/10 overflow-hidden">
                <div className="h-full bg-accent-soft" style={{ width: `${anteil}%` }} />
              </div>
              <p className="text-[11px] text-white/60 mt-1.5 tabular-nums">{t.bisStufe(zahl(stufe.naechste - stufe.xp, lang), stufe.stufe + 1)}</p>
            </div>
          )}
        </div>

        {kennzahlen.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-line bg-black/20 divide-x divide-white/10 max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(n+3)]:border-white/10 max-sm:[&>*:nth-child(odd)]:border-l-0">
            {kennzahlen.map((k) => <Kennzahl key={k.name} wert={k.wert} name={k.name} />)}
          </dl>
        )}

        {vitrine.length > 0 && (
          <div className="mt-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/55 mb-2">{t.vitrine}</h2>
            <ul className="flex flex-wrap gap-2">
              {vitrine.map((e) => <Plakette key={e.key} e={e} lang={lang} gross />)}
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}

export default function PublicProfilePage() {
  const { login: adresse } = useParams();
  const { lang, setLang } = useLanguage({ supported: VISITENKARTE_TEXTE.langs });
  const t = VISITENKARTE_TEXTE.dict(lang);
  const [state, setState] = useState({ loading: true, data: null, error: false });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, data: null, error: false });
    fetch(`/api/public-profile/u/${encodeURIComponent(adresse)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) throw new Error("fehlt");
        setState({ loading: false, data: d, error: false });
      })
      .catch((e) => { if (e.name !== "AbortError") setState({ loading: false, data: null, error: true }); });
    return () => ctrl.abort();
  }, [adresse]);

  const { loading, data, error } = state;
  const name = data?.displayName || adresse;
  const s = data?.sections || {};
  const reihenfolge = (data?.reihenfolge || Object.keys(s)).filter((k) => s[k]);

  return (
    <Page width="default" className="py-4 md:py-8">
      <SEO
        title={data ? t.metaTitel(name) : t.metaTitelLeer}
        description={t.metaBeschreibung(name)}
        path={`/u/${String(adresse || "").toLowerCase()}`}
        noindex={!data}
        lang={lang}
      />

      {loading && <p className="flex items-center gap-2 text-sm text-white/50 py-16"><Loader2 size={16} className="animate-spin" /> {t.laedt}</p>}

      {!loading && error && (
        <Card className="p-8 max-w-lg">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white mb-2">{t.keinProfilTitel}</h1>
          <p className="text-sm text-white/55 mb-5">{t.keinProfilText}</p>
          <Button to="/profile?bereich=visitenkarte" variant="secondary">
            {t.eigenesEinrichten} <ArrowRight size={15} />
          </Button>
        </Card>
      )}

      {data && (
        <>
          <KartenKopf data={data} name={name} s={s} t={t} lang={lang}
            aktionen={(
              <>
                <span className="rounded-lg bg-black/55 border border-white/15"><LanguageSwitch lang={lang} langs={VISITENKARTE_TEXTE.langs} onChange={setLang} /></span>
                <ShareButton name={name} t={t} />
              </>
            )} />

          {reihenfolge.length === 0 ? (
            <Card as="p" className="text-sm text-white/55">{t.leer(name)}</Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {reihenfolge.map((k) => <Abschnitt key={k} k={k} d={s[k]} data={data} t={t} lang={lang} />)}
            </div>
          )}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-line bg-white/[0.02] px-4 py-3">
            <p className="flex items-center gap-2.5 text-sm text-white/60 min-w-0">
              <img src={logo} alt="" width="24" height="24" className="h-6 w-auto shrink-0" />
              <span>{t.fussText}</span>
            </p>
            <Link to="/profile?bereich=visitenkarte" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-accent-soft hover:text-white transition-colors">
              {t.eigenesEinrichten} <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </footer>
        </>
      )}
    </Page>
  );
}
