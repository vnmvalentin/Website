// SeedRunnersVerlauf.jsx — zwei Listen, aus denen man ein Level im Nachhinein merken oder wieder spielen kann:
//   Deine Runden   die letzten Mehrspieler-Runden dieses Browsers (room/rundenVerlauf.js) mit Seed, Platz und Zeit
//   Tagesarchiv    jedes vergangene Tagesrennen (ui/tagesArchiv.js) — spielbar unter /seed-runners/daily/JJJJ-MM-TT
// Was hier gemerkt wird, steht danach in jeder Lobby unter „Favoriten“ (room/LevelPicker.jsx). Der Reiter steht in der Adresse
// (?tab=archiv), damit die Tagesseite direkt aufs Archiv verlinken kann.
import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bookmark, Copy, Check, Play, X, ExternalLink } from "lucide-react";
import SEO from "../../components/SEO";
import { Tabs, RatingBadge, Empty } from "./ui/kit.jsx";
import { randomTitle, seedLine, refKey } from "./ui/levelRef.js";
import { useFavoriten } from "./ui/useFavoriten.js";
import { archivTage, tagesRef, germanDate, berlinDateKey } from "./ui/tagesArchiv.js";
import { getVerlauf, subscribeVerlauf, entferneRunde, leereVerlauf, VERLAUF_MAX } from "./room/rundenVerlauf.js";
import { formatTicks } from "./room/format.js";
import { copyText } from "./levels/clipboard.js";

const ARCHIV_SEITE = 30;

const zeitpunkt = (ms) => new Date(ms).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function FavKnopf({ status, onToggle }) {
  const on = !!status?.favorite;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!status}
      aria-pressed={on}
      className={`sr-btn sr-btn-sm ${on ? "" : "sr-btn-ghost"} shrink-0`}
      title={on ? "Aus den Favoriten entfernen" : "Als Favorit merken — in jeder künftigen Lobby direkt auswählbar"}
    >
      <Bookmark size={14} fill={on ? "currentColor" : "none"} />
      {on ? "Favorit" : "Merken"}
    </button>
  );
}

function SeedKopieren({ seed }) {
  const [ok, setOk] = useState(false);
  const kopieren = async () => {
    if (await copyText(seed)) {
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }
  };
  return (
    <button type="button" onClick={kopieren} className="sr-btn sr-btn-sm sr-btn-quiet shrink-0" title="Seed kopieren">
      {ok ? <Check size={14} /> : <Copy size={14} />}
      <span className="hidden sm:inline">{ok ? "Kopiert" : "Seed"}</span>
    </button>
  );
}

function RundenListe() {
  const verlauf = useSyncExternalStore(subscribeVerlauf, getVerlauf, getVerlauf);
  const refs = useMemo(() => verlauf.map((e) => e.ref), [verlauf]);
  const { status, toggle } = useFavoriten(refs);
  const [fehler, setFehler] = useState("");

  if (!verlauf.length) {
    return <Empty>Noch keine Runden. Nach jedem Mehrspieler-Rennen steht das Level hier, mit Seed, Platz und Zeit.</Empty>;
  }

  const umschalten = async (e) => setFehler((await toggle(e.ref, e.info)) || "");

  return (
    <>
      <ul className="sr-rows">
        {verlauf.map((e) => {
          const custom = e.ref.kind === "custom";
          const title = custom ? e.custom?.name || e.ref.code : e.daily ? "Tages-Level" : randomTitle(e.info);
          const sub = custom ? `von ${e.custom?.creatorName || "?"} · ${e.ref.code}` : seedLine(e.ref.seed, e.ref.biome);
          const ergebnis = e.place ? `Platz ${e.place} von ${e.total}${e.ticks ? ` · ${formatTicks(e.ticks)}` : ""}` : e.dnf ? "Nicht im Ziel" : "Zugeschaut";
          const key = refKey(e.ref);
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-semibold sr-ink truncate leading-tight" title={title}>{title}</p>
                <p className="text-xs sr-faint truncate">{sub}</p>
                <p className="text-xs sr-dim mt-0.5">
                  <span className="sr-num">{zeitpunkt(e.at)}</span> · {ergebnis}
                  {e.winner && e.place !== 1 ? <span className="sr-faint"> · gewonnen von {e.winner}</span> : null}
                </p>
              </div>
              <RatingBadge rating={status.get(key)?.rating} />
              <div className="flex items-center gap-2 ml-auto">
                {custom ? (
                  <Link to={`/seed-runners/levels/${e.ref.code}`} className="sr-btn sr-btn-sm sr-btn-quiet shrink-0" title="Level-Seite öffnen">
                    <ExternalLink size={14} /><span className="hidden sm:inline">Level</span>
                  </Link>
                ) : (
                  <SeedKopieren seed={e.ref.seed} />
                )}
                <FavKnopf status={status.get(key)} onToggle={() => umschalten(e)} />
                <button type="button" onClick={() => entferneRunde(e.id)} className="sr-icon-btn" title="Aus dem Verlauf entfernen" aria-label="Aus dem Verlauf entfernen">
                  <X size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {fehler && <p className="text-sm sr-bad pt-2">{fehler}</p>}
      <div className="pt-3 sr-divider flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs sr-faint">Nur in diesem Browser gespeichert, die letzten {VERLAUF_MAX} Runden.</p>
        <button type="button" onClick={() => { if (window.confirm("Den ganzen Verlauf löschen? Favoriten bleiben erhalten.")) leereVerlauf(); }} className="sr-btn sr-btn-sm sr-btn-quiet">
          Verlauf leeren
        </button>
      </div>
    </>
  );
}

function ArchivListe() {
  const alleTage = useMemo(() => archivTage(berlinDateKey()), []);
  const [anzahl, setAnzahl] = useState(ARCHIV_SEITE);
  const tage = alleTage.slice(0, anzahl);
  const refs = useMemo(() => tage.map(tagesRef), [tage.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const { status, toggle } = useFavoriten(refs);
  const [fehler, setFehler] = useState("");

  if (!alleTage.length) {
    return <Empty>Noch keine vergangenen Tagesrennen — ab morgen steht das heutige Level hier.</Empty>;
  }

  return (
    <>
      <ul className="sr-rows">
        {tage.map((tag, i) => {
          const ref = refs[i];
          const key = refKey(ref);
          return (
            <li key={tag} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-semibold sr-ink leading-tight">Tagesrennen vom <span className="sr-num">{germanDate(tag)}</span></p>
                <p className="text-xs sr-faint truncate">Seed {ref.seed}</p>
              </div>
              <RatingBadge rating={status.get(key)?.rating} />
              <div className="flex items-center gap-2 ml-auto">
                <Link to={`/seed-runners/daily/${tag}`} className="sr-btn sr-btn-sm sr-btn-ghost shrink-0">
                  <Play size={13} fill="currentColor" />Spielen
                </Link>
                <FavKnopf status={status.get(key)} onToggle={async () => setFehler((await toggle(ref)) || "")} />
              </div>
            </li>
          );
        })}
      </ul>
      {fehler && <p className="text-sm sr-bad pt-2">{fehler}</p>}
      {anzahl < alleTage.length && (
        <div className="pt-3 flex justify-center">
          <button type="button" onClick={() => setAnzahl((n) => n + ARCHIV_SEITE)} className="sr-btn sr-btn-sm sr-btn-quiet">Ältere Tage</button>
        </div>
      )}
      <p className="pt-3 sr-divider text-xs sr-faint">
        Jeder Tag ist genau das Level von damals. Die Ranglisten sind abgeschlossen: Läufe im Archiv oder in einer Lobby zählen nicht mehr.
      </p>
    </>
  );
}

export default function SeedRunnersVerlauf() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "archiv" ? "archiv" : "runden";

  return (
    <div className="w-full max-w-[960px] mx-auto px-4 py-8 md:py-10">
      <SEO title="Seed Runners: Verlauf" description="Deine letzten Runden und alle vergangenen Tagesrennen von Seed Runners." path="/seed-runners/verlauf" noindex />
      <div className="mb-6">
        <p className="sr-label mb-2">Verlauf</p>
        <h1 className="sr-display text-3xl md:text-5xl mb-3">Gespielte Level</h1>
        <p className="sr-dim text-sm max-w-2xl leading-relaxed">
          Deine letzten Mehrspieler-Runden und alle vergangenen Tagesrennen. Was du hier merkst, steht in jeder Lobby unter „Favoriten“.
        </p>
      </div>
      <section className="sr-panel">
        <div className="px-4 pt-3">
          <Tabs
            label="Verlauf"
            value={tab}
            onChange={(t) => setParams(t === "archiv" ? { tab: "archiv" } : {}, { replace: true })}
            tabs={[{ id: "runden", label: "Deine Runden" }, { id: "archiv", label: "Tagesarchiv" }]}
          />
        </div>
        <div className="px-4 pb-4">
          {tab === "runden" ? <RundenListe /> : <ArchivListe />}
        </div>
      </section>
    </div>
  );
}
