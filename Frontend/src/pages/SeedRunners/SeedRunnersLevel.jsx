// SeedRunnersLevel.jsx — die Seite eines veröffentlichten Levels: Angaben, Share-Code, Werte, Spielen (mit Geistern), Bestenliste,
// Sterne und Favorit, Melden; für den Ersteller zusätzlich Angaben ändern, Löschen und die Neu-Verifizierung nach einer Physik-Änderung.
//
// Gespielt wird das Dokument vom Server, aber erst nach einer eigenen Prüfung: Der Browser berechnet den Inhalts-Hash selbst und
// spielt nur, wenn er dem des Servers entspricht — er glaubt dem Server nicht blind, was er da bekommt.
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Flag, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";
import SEO from "../../components/SEO";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import LevelPreview from "./levels/LevelPreview.jsx";
import { DifficultyMeter } from "./levels/LevelCard.jsx";
import ShareCode from "./levels/ShareCode.jsx";
import Leaderboard from "./levels/Leaderboard.jsx";
import ReplayScrubber from "./levels/ReplayScrubber.jsx";
import LevelPlay from "./levels/LevelPlay.jsx";
import ReportForm from "./levels/ReportForm.jsx";
import OwnerPanel from "./levels/OwnerPanel.jsx";
import { getLevel, getLevelDoc } from "./levels/levelsApi.js";
import RateBox from "./ui/RateBox.jsx";
import { RatingBadge } from "./ui/kit.jsx";
import { useShellBiome } from "./ui/shellContext.js";
import { loadGhosts, toggleGhost, ghostColors } from "./levels/ghostSetup.js";
import { creatorPath, normalizeCode } from "./levels/shareCode.js";
import { STATUS_LABELS, formatDate, formatPercent } from "./levels/labels.js";
import { validateDoc } from "./level/index.js";
import { getIdentity, rememberName } from "./room/identity.js";
import { formatTicks } from "./room/format.js";
import { BIOMES } from "./gen/biomes.js";
import { SPEED_CLASSES } from "./sim/classes.js";
import { buttonClass, inputClass, primaryButtonClass } from "./editor/fields.jsx";

const Stat = ({ label, value, sub, testId }) => (
  <div className="px-4 py-3 min-w-0">
    <p className="sr-label mb-0.5">{label}</p>
    <div className="text-xl sr-num sr-ink truncate" data-testid={testId}>{value}</div>
    {sub && <p className="text-xs sr-faint sr-num truncate">{sub}</p>}
  </div>
);

function Notice({ tone = "warn", icon: Icon = AlertTriangle, children }) {
  const colors = { warn: "border-amber-400/30 bg-amber-500/8", info: "border-violet-400/30 bg-violet-500/8" };
  return (
    <div className={`border rounded-md px-4 py-3 text-sm text-white/85 flex items-start gap-3 leading-relaxed ${colors[tone]}`} role="status">
      <Icon size={16} className="mt-0.5 shrink-0 text-amber-300" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page-fade w-full max-w-xl mx-auto px-4 py-16">
      <SEO title="Level nicht gefunden — Seed Runners" description="Dieses Level gibt es nicht." path="/seed-runners/levels" noindex />
      <h1 className="font-display text-2xl font-bold text-white mb-3">Dieses Level gibt es nicht</h1>
      <p className="text-sm text-white/55 mb-6 leading-relaxed">Der Code stimmt nicht, oder das Level wurde gelöscht oder von der Moderation ausgeblendet.</p>
      <Link to="/seed-runners/levels" className={primaryButtonClass}><ArrowLeft size={14} />Zum Level-Browser</Link>
    </div>
  );
}

export default function SeedRunnersLevel() {
  const { code: rawCode } = useParams();
  const code = normalizeCode(rawCode) || String(rawCode || "").toUpperCase();
  const navigate = useNavigate();
  const auth = useContext(TwitchAuthContext);
  const user = auth?.user || null;
  const userId = user?.id ? String(user.id) : null;

  const [detail, setDetail] = useState(undefined);        // undefined: lädt, null: gibt es nicht
  const [loadError, setLoadError] = useState("");
  const [play, setPlay] = useState(null);                 // { level, ghosts, mode }
  const [starting, setStarting] = useState(false);
  const [startNote, setStartNote] = useState("");
  const [ghostSel, setGhostSel] = useState([]);
  const [guestName, setGuestName] = useState(() => getIdentity().name);
  const [reporting, setReporting] = useState(false);
  const [watching, setWatching] = useState(null);   // { id, name, color } | null — Zeitleiste für einen Geisterlauf

  const reload = useCallback(async () => {
    try {
      setDetail(await getLevel(code));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Das Level konnte nicht geladen werden.");
    }
  }, [code]);

  // Die Oberfläche nimmt das Biom des Levels an
  useShellBiome(detail?.biome);

  // Neu laden, wenn sich die Anmeldung ändert: eigene Sterne, "eigenes Level" und die eigene Bestzeit hängen daran
  useEffect(() => {
    setDetail(undefined);
    setPlay(null);
    setGhostSel([]);
    setReporting(false);
    setWatching(null);
    reload();
  }, [reload, userId]);

  const colors = useMemo(() => ghostColors(ghostSel), [ghostSel]);

  const start = async () => {
    if (!detail) return;
    setStarting(true);
    setStartNote("");
    try {
      const served = await getLevelDoc(code);
      if (!served) { setStartNote("Das Level gibt es nicht mehr."); return; }
      const res = validateDoc(served.doc, { smoke: false });
      if (!res.ok) { setStartNote("Das Level ist auf dieser Seite nicht spielbar."); return; }
      // Der Inhalt muss genau der sein, den der Server verifiziert hat — sonst wären Zeiten nicht vergleichbar
      if (res.hash !== served.hash) { setStartNote("Das Level stimmt nicht mit der Prüfsumme des Servers überein. Lade die Seite neu."); return; }
      const { ghosts, skipped } = await loadGhosts(code, ghostSel);
      if (skipped > 0) setStartNote(`${skipped === 1 ? "Ein Geist fehlt" : `${skipped} Geister fehlen`} oder stammt aus einer älteren Spielversion — er läuft nicht mit.`);
      if (!userId) rememberName(guestName.trim());
      setPlay({ level: res.level, ghosts: ghosts.length ? ghosts : undefined, mode: detail.status === "reverify" && detail.me.isOwner ? "reverify" : "submit" });
    } catch (e) {
      setStartNote(e.message || "Das Level konnte nicht geladen werden.");
    } finally {
      setStarting(false);
    }
  };

  const exitPlay = useCallback(() => { setPlay(null); reload(); }, [reload]);

  if (detail === null) return <NotFound />;
  if (detail === undefined) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-16">
        {loadError
          ? <p className="text-sm text-amber-300" role="alert">{loadError} <button type="button" onClick={reload} className="underline underline-offset-2">Erneut versuchen</button></p>
          : <p className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={15} className="animate-spin" />Lädt …</p>}
      </div>
    );
  }

  const { me } = detail;
  const status = STATUS_LABELS[detail.status];
  const guestNameOk = guestName.trim().length >= 2;
  const needsName = !userId && !guestNameOk;
  const playable = detail.status === "published" || (detail.status === "reverify" && me.isOwner);

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 py-8 md:py-10">
      <SEO title={`${detail.name} — Seed Runners`} description={`Level von ${detail.creator.name}: bestätigte Ersteller-Zeit ${formatTicks(detail.creatorTicks)}.`} path={`/seed-runners/levels/${detail.code}`} noindex={detail.status !== "published"} />

      <Link to="/seed-runners/levels" className="sr-btn sr-btn-sm sr-btn-quiet !pl-0 mb-4">
        <ArrowLeft size={15} />Level-Bibliothek
      </Link>

      <div className="mb-5">
        <h1 className="sr-display text-3xl md:text-5xl break-words">{detail.name}</h1>
        <p className="text-sm text-white/55 mt-1">
          von <Link to={creatorPath(detail.creator.id)} className="text-white/80 hover:text-white underline underline-offset-2 decoration-white/25">{detail.creator.name}</Link>
          <span className="text-white/25"> · </span>{formatDate(detail.createdAt)}
        </p>
        <div className="mt-3"><ShareCode code={detail.code} /></div>
      </div>

      {status && (
        <div className="mb-5">
          <Notice icon={ShieldAlert}>
            <strong className="text-white">{status.label}.</strong> {status.hint}
            {detail.statusReason && detail.status === "hidden" && <span className="block text-white/60 mt-1">Grund: {detail.statusReason}</span>}
          </Notice>
        </div>
      )}

      {play ? (
        <LevelPlay
          code={detail.code}
          level={play.level}
          ghosts={play.ghosts}
          mode={play.mode}
          name={userId ? "" : guestName.trim()}
          canImprove={me.isOwner && play.mode === "submit" ? { ticks: detail.creatorRun.ticks } : null}
          onExit={exitPlay}
          onSubmitted={reload}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid md:grid-cols-[minmax(0,1fr)_20rem] gap-5">
            <div className="min-w-0 space-y-4">
              <LevelPreview preview={detail.preview} biome={detail.biome} className="aspect-[3/1] w-full border border-white/10 rounded-md" />
              {detail.description && <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line break-words">{detail.description}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
                <span className="border border-white/10 rounded px-2 py-1">{BIOMES[detail.biome]?.label || detail.biome}</span>
                <span className="border border-white/10 rounded px-2 py-1">{SPEED_CLASSES[detail.speedClass]?.label || detail.speedClass}</span>
                <span className="border border-white/10 rounded px-2 py-1 tabular-nums">{detail.width} × {detail.height}</span>
                <span className="border border-white/10 rounded px-2 py-1 tabular-nums">{detail.elements} Elemente</span>
                {detail.difficulty && <span className="border border-white/10 rounded px-2 py-1 inline-flex items-center gap-2">Schwierigkeit <DifficultyMeter value={detail.difficulty} /></span>}
                {detail.tags.map((t) => (
                  <Link key={t} to={`/seed-runners/levels?tag=${encodeURIComponent(t)}`} className="text-violet-200/80 border border-violet-400/20 rounded px-2 py-1 hover:bg-violet-500/10 transition-colors">{t}</Link>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 divide-x divide-white/10 border border-white/10 rounded-md bg-[#0d0d14]">
                <Stat label="Ersteller-Zeit" value={formatTicks(detail.creatorRun.ticks)} sub={`${detail.creatorRun.deaths} ${detail.creatorRun.deaths === 1 ? "Tod" : "Tode"}`} testId="detail-creator-time" />
                <Stat label="Im Ziel" value={formatPercent(detail.clearRate)} sub={`${detail.clears} von ${detail.players}`} />
              </div>
              <div className="grid grid-cols-2 divide-x divide-white/10 border border-white/10 rounded-md bg-[#0d0d14]">
                <Stat label="Bewertung" value={<RatingBadge rating={detail.rating} className="!text-xl" />} testId="detail-rating" />
                <Stat label="Versuche" value={detail.plays} sub={`${detail.players} Spieler`} />
              </div>

              {playable && (
                <div className="space-y-2.5">
                  {!userId && (
                    <label className="block">
                      <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Dein Name in der Bestenliste</span>
                      <input
                        type="text"
                        value={guestName}
                        maxLength={24}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Name eingeben"
                        className={inputClass}
                        aria-label="Dein Name in der Bestenliste"
                      />
                    </label>
                  )}
                  <button type="button" onClick={start} disabled={starting || needsName} className={`${primaryButtonClass} w-full !py-2.5 !text-base`} data-testid="play-button">
                    {starting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {detail.status === "reverify" ? "Neu verifizieren" : "Spielen"}
                  </button>
                  {needsName && <p className="text-xs text-white/40">Gib einen Namen an (mindestens 2 Zeichen) oder melde dich mit Twitch an.</p>}
                  {ghostSel.length > 0 && <p className="text-xs text-white/50">{ghostSel.length} {ghostSel.length === 1 ? "Geist läuft" : "Geister laufen"} mit.</p>}
                  {startNote && <p className="text-sm text-amber-300" role="alert">{startNote}</p>}
                </div>
              )}

              {detail.status === "published" && (
                <RateBox levelRef={{ kind: "custom", code: detail.code }} canRate={!me.isOwner} title="Deine Bewertung" />
              )}
              {!me.isOwner && detail.status === "published" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setReporting((v) => !v)} className={buttonClass} data-testid="report-button"><Flag size={14} />Melden</button>
                </div>
              )}
              {reporting && <ReportForm code={detail.code} loggedIn={me.loggedIn} onLogin={() => auth?.login?.()} onClose={() => setReporting(false)} />}
            </div>
          </div>

          {me.isOwner && <OwnerPanel detail={detail} onChanged={reload} onDeleted={() => navigate("/seed-runners/levels")} />}

          {watching && (
            <div className="bg-[#0d0d14] border border-white/10 rounded-md p-3">
              <ReplayScrubber code={detail.code} which={watching.id} name={watching.name} color={watching.color} onClose={() => setWatching(null)} />
            </div>
          )}

          {detail.status === "published" || me.isOwner ? (
            <Leaderboard
              detail={detail}
              selected={ghostSel}
              colors={colors}
              onToggle={(id) => setGhostSel((sel) => toggleGhost(sel, id))}
              onWatch={(id, name, color) => setWatching({ id, name, color })}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
