// GardenMenu.jsx — das Hauptmenü von Virtual Farm („Hofmarkt"): Wiese mit den echten Marktständen und Tieren, links das
// Holzschild mit Konto und Weltwahl, rechts die Bestenliste als Aushang. Vorher war das der Lobby-Bildschirm mitten in
// GameContainer.jsx; die Logik (enterWorld, Anmeldung, Bestenliste) bleibt dort, hier steht nur die Oberfläche.
//
// Umbau 04.11.: Titel einzeilig, beide Schilder nebeneinander auf gleicher Höhe (vorher hing die Bestenliste 140 px
// tiefer), Bestenliste mit allen zehn Plätzen und dem eigenen Eintrag hervorgehoben, Vorschau für Abgemeldete als
// kompaktes Raster — sie lief auf 1366×768 unter den Bildschirmrand. Kulisse geteilt mit dem Ladebildschirm.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Play, FlaskConical, ArrowLeftToLine, KeyRound, Plus } from "lucide-react";
import SEO from "../../../../components/SEO";
import { HudIcon } from "../gameIcons";
import { versionedAsset } from "../../engine/assetVersion";
import { formatGold } from "../gardenTokens";
import { FARM_SEO, TwitchGlyph } from "../../engine/gameConstants";
import FarmKulisse from "./FarmKulisse";

// Für Besucher ohne Login: was sie nach der Anmeldung erwartet — mit echten Spielgrafiken (auf dem Handy gibt es sonst
// gar keine, die Kulisse erscheint erst ab lg)
const PREVIEW = [
  { src: "/garden-assets/plants/apfel/structure.png", title: "Pflanzen und ernten", text: "Über 50 Sorten, mit Wetter und Tageszeiten." },
  { src: "/garden-assets/animals/kuh/1.png", title: "Tiere halten", text: "Vom Huhn bis zu Drache und Einhorn." },
  { src: "/garden-assets/deco/nature/tulpenbett.png", title: "Hof gestalten", text: "Zäune, Beete, Lampen und Wege." },
  { src: "/garden-assets/world/mailbox.png", title: "Mit Nachbarn spielen", text: "Post schicken, Bestenliste, Erntefest." },
];

const LISTEN = [
  { key: "gold", label: "Gold" },
  { key: "logbuch", label: "Logbuch" },
  { key: "wettbewerb", label: "Siege" },
  { key: "saison", label: "Saison" },
];

/** Rechte Spalte je Liste. */
function listenWert(liste, e) {
  if (liste === "logbuch") return <span title={`${e.sorten} Sorten eingetragen`}>{e.seiten} Seiten komplett</span>;
  if (liste === "wettbewerb") return <span title={`${e.ersterPlatz}× Platz 1`}>{e.punkte} Punkte</span>;
  if (liste === "saison") return <span>{e.anzahl}× geschafft</span>;
  return <><HudIcon.gold size={15} /> {formatGold(e.gold)}</>;
}

export default function GardenMenu({
  authUser, twitchLogin, istGartenAdmin, isSubscriber, isBeta,
  leaderboard, ranglisten = null, joinCodeInput, setJoinCodeInput, enterWorld,
}) {
  const [liste, setListe] = useState("gold");
  // Welche Liste gerade zu sehen ist (Backend world/ranglisten.js). Gold ist die alte Bestenliste.
  const eintraege = liste === "gold" ? leaderboard : (ranglisten?.[liste] || []);
  const loginName = authUser?.twitchLogin || authUser?.login;

  return (
    <div className="gf-scene relative w-full h-full overflow-y-auto overflow-x-hidden">
      <SEO {...FARM_SEO} />
      <FarmKulisse />

      <div className="relative z-10 mx-auto max-w-[1040px] px-4 pb-10 pt-4">
        {/* Kopf: Titel links, „Zurück zur Website" rechts — im Spiel liegt der Rückweg in den Einstellungen */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="gf-title text-[44px] sm:text-[64px]">Virtual Farm</h1>
            <p className="gf-paper mt-3 inline-block px-3 py-1 text-[15px] font-semibold">
              Eine gemeinsame Welt mit acht Grundstücken — pflanzen, ernten, verkaufen.
            </p>
          </div>
          <Link to="/fun" className="gf-btn gf-btn-wood gf-btn-sm mt-2 shrink-0" title="Zurück zur Website">
            <ArrowLeftToLine size={15} /> Website
          </Link>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div className="gf-board space-y-4 p-4 sm:p-5">
            {/* Konto */}
            <div className="gf-paper flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="gf-label text-[var(--gf-ink-dim)]">Twitch-Konto</div>
                {loginName ? (
                  <div className="truncate text-lg font-extrabold">{loginName}</div>
                ) : (
                  <div className="text-[15px] font-semibold">Nicht angemeldet</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Der Admin trägt sein eigenes Schild statt „Subscriber" — den Verkaufsbonus bekommt er trotzdem. */}
                {authUser && istGartenAdmin && (
                  <span className="gf-chip border-red-700 bg-red-50 text-red-700">
                    <HudIcon.trusted size={13} /> Admin{isSubscriber ? " · +50 % Verkauf" : ""}
                  </span>
                )}
                {authUser && !istGartenAdmin && isSubscriber && (
                  <span className="gf-chip border-amber-600 bg-amber-100 text-amber-800">
                    <HudIcon.star size={13} /> Subscriber · +50 % Verkauf
                  </span>
                )}
                {authUser && isBeta && (
                  <span className="gf-chip border-sky-600 bg-sky-50 text-sky-800">
                    <FlaskConical size={13} /> Beta
                  </span>
                )}
              </div>
            </div>

            {!authUser ? (
              <>
                <button type="button" onClick={() => twitchLogin?.()} className="gf-btn gf-btn-twitch gf-btn-lg w-full !whitespace-normal text-center leading-tight">
                  <TwitchGlyph className="h-5 w-5" /> Mit Twitch anmelden und loslegen
                </button>
                <div className="gf-paper px-4 py-3">
                  <div className="gf-label mb-2 text-[var(--gf-ink-dim)]">Das erwartet dich</div>
                  <ul className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                    {PREVIEW.map((f) => (
                      <li key={f.title} className="flex items-center gap-3">
                        <img src={versionedAsset(f.src)} alt="" aria-hidden="true" draggable={false} loading="lazy" className="h-11 w-11 shrink-0 object-contain" />
                        <span className="min-w-0">
                          <span className="block font-extrabold leading-tight">{f.title}</span>
                          <span className="block text-[13px] leading-snug text-[var(--gf-ink-dim)]">{f.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[13px] leading-snug text-[var(--gf-ink-dim)]">
                    Kostenlos. Dein Hof wird mit deinem Twitch-Konto gespeichert, damit Nachbarn dich wiederfinden.
                  </p>
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => enterWorld("public")} className="gf-btn gf-btn-lg w-full">
                  <Play size={20} fill="currentColor" /> Öffentliche Welt betreten
                </button>

                {/* Private Welt */}
                <div className="gf-paper space-y-2.5 px-4 py-3">
                  <div className="gf-label text-[var(--gf-ink-dim)]">Private Welt</div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                      onKeyDown={(e) => { if (e.key === "Enter" && authUser) enterWorld("code"); }}
                      placeholder="Weltcode"
                      aria-label="Weltcode"
                      disabled={!authUser}
                      className="gf-input min-w-0 flex-1 uppercase tracking-[0.3em] placeholder:tracking-normal"
                    />
                    <button type="button" onClick={() => enterWorld("code")} disabled={!authUser || joinCodeInput.trim().length < 4} className="gf-btn gf-btn-wood">
                      <KeyRound size={16} /> Beitreten
                    </button>
                  </div>
                  <button type="button" onClick={() => enterWorld("create")} disabled={!authUser} className="gf-btn gf-btn-wood w-full">
                    <Plus size={16} /> Neue private Welt erstellen
                  </button>
                  <p className="text-[13px] leading-snug text-[var(--gf-ink-dim)]">
                    Eine neue Welt bekommt einen fünfstelligen Code zum Weitergeben. Deine Farm zieht mit dir in jede Welt um.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Bestenliste als Aushang am Holzbrett */}
          <section className="gf-board p-4 sm:p-5" aria-labelledby="gf-lb">
            <h2 id="gf-lb" className="mb-2 flex items-center gap-2 text-xl font-extrabold">
              <HudIcon.level size={20} /> Bestenliste
            </h2>
            {ranglisten && (
              <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
                {LISTEN.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    role="tab"
                    aria-selected={liste === l.key}
                    onClick={(e) => { e.currentTarget.blur(); setListe(l.key); }}
                    className={`rounded-lg border-2 px-2.5 py-1 text-[13px] font-extrabold transition-colors ${liste === l.key ? "border-amber-800 bg-amber-700 text-amber-50" : "border-[var(--gf-cream-line)] bg-[var(--gf-cream-2)] text-[var(--gf-ink-dim)] hover:text-[var(--gf-ink)]"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            <div className="gf-paper overflow-hidden">
              {eintraege.length === 0 ? (
                <p className="px-4 py-6 text-center font-semibold text-[var(--gf-ink-dim)]">{liste === "gold" ? "Noch keine Farmer unterwegs." : "Noch niemand eingetragen."}</p>
              ) : (
                <ol>
                  {eintraege.slice(0, 10).map((e, i) => {
                    const eigener = loginName && String(e.name || "").toLowerCase() === String(loginName).toLowerCase();
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 border-b-2 border-dashed border-[var(--gf-cream-line)] px-4 py-2 last:border-b-0 ${eigener ? "bg-[var(--gf-cream-2)]" : ""}`}
                      >
                        <span className={`w-6 shrink-0 font-extrabold tabular-nums ${i === 0 ? "text-amber-600" : "text-[var(--gf-ink-dim)]"}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-bold" title={e.name}>
                          {e.sterne > 0 && <span className="mr-1 text-amber-600" title={`${e.sterne} Stern${e.sterne > 1 ? "e" : ""} aus „Neue Saat“`}>{`★${e.sterne > 1 ? e.sterne : ""}`}</span>}
                          {e.name}
                          {eigener &&<span className="ml-1.5 text-[12px] font-semibold text-[var(--gf-ink-dim)]">(du)</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 font-extrabold tabular-nums text-amber-700">
                          {listenWert(liste, e)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
