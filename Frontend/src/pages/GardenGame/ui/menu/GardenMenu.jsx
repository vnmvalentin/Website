// GardenMenu.jsx — Hauptmenü von Virtual Farm als Titelbildschirm (Umbau 05.11.).
// Hinten die echte Spielwelt (MenuWelt: Kamerafahrt über den Dorfplatz), davor im Pixel-Look
// das Logo, ein Spielmenü mit großen Knöpfen und die Bestenliste als Anzeigetafel. Die Logik
// (enterWorld, Anmeldung, Bestenliste) bleibt in GameContainer.jsx, hier steht nur die Oberfläche.
import React, { useState } from "react";
import { Play, FlaskConical, KeyRound, Plus, Users } from "lucide-react";
import SEO from "../../../../components/SEO";
import { HudIcon } from "../gameIcons";
import { formatGold } from "../gardenTokens";
import { FARM_SEO, TwitchGlyph } from "../../engine/gameConstants";
import MenuWelt from "./MenuWelt";
import BackToSite from "../../../../components/shell/BackToSite";

const LISTEN = [
  { key: "gold", label: "Gold" },
  { key: "logbuch", label: "Logbuch" },
  { key: "wettbewerb", label: "Siege" },
  { key: "saison", label: "Saison" },
];

/** Für Besucher ohne Login: was sie nach der Anmeldung erwartet. */
const VORSCHAU = [
  "Über 50 Sorten pflanzen und ernten",
  "Tiere halten, vom Huhn bis zum Drachen",
  "Den Hof mit Deko gestalten",
  "Mit Nachbarn handeln und Post schicken",
];

/** Rechte Spalte je Liste. */
function listenWert(liste, e) {
  if (liste === "logbuch") return <span title={`${e.sorten} Sorten eingetragen`}>{e.seiten} Seiten</span>;
  if (liste === "wettbewerb") return <span title={`${e.ersterPlatz}× Platz 1`}>{e.punkte} Punkte</span>;
  if (liste === "saison") return <span>{e.anzahl}×</span>;
  return <><HudIcon.gold size={14} /> {formatGold(e.gold)}</>;
}

export default function GardenMenu({
  authUser, twitchLogin, istGartenAdmin, isSubscriber, isBeta,
  leaderboard, ranglisten = null, joinCodeInput, setJoinCodeInput, enterWorld,
}) {
  const [liste, setListe] = useState("gold");
  const [privatOffen, setPrivatOffen] = useState(false);
  // Welche Liste gerade zu sehen ist (Backend world/ranglisten.js). Gold ist die alte Bestenliste.
  const eintraege = liste === "gold" ? leaderboard : (ranglisten?.[liste] || []);
  const loginName = authUser?.twitchLogin || authUser?.login;

  return (
    <div className="gf-titel relative h-full w-full overflow-y-auto overflow-x-hidden">
      <SEO {...FARM_SEO} />
      <MenuWelt />
      {/* Abdunkelung links, damit Logo und Menü auf der bunten Welt lesbar bleiben */}
      <div className="gf-titel-schleier pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 flex min-h-full flex-col px-4 py-4 sm:px-8 sm:py-6">
        {/* Kopfzeile: Konto links, Website rechts */}
        <div className="flex items-start justify-between gap-3">
          <div className="gf-pixelpanel flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-amber-200/70">Twitch</span>
            <span className="max-w-[14rem] truncate text-[15px] font-bold text-amber-50">{loginName || "Nicht angemeldet"}</span>
            {/* Der Admin trägt sein eigenes Schild statt „Subscriber" — den Verkaufsbonus bekommt er trotzdem. */}
            {authUser && istGartenAdmin && (
              <span className="gf-pixelchip bg-red-700 text-red-50"><HudIcon.trusted size={12} /> Admin{isSubscriber ? " · +25 %" : ""}</span>
            )}
            {authUser && !istGartenAdmin && isSubscriber && (
              <span className="gf-pixelchip bg-amber-500 text-amber-950"><HudIcon.star size={12} /> Subscriber · +25 % Verkauf</span>
            )}
            {authUser && isBeta && (
              <span className="gf-pixelchip bg-sky-600 text-sky-50"><FlaskConical size={12} /> Beta</span>
            )}
          </div>
          <BackToSite className="gf-menuknopf gf-menuknopf-klein shrink-0" iconSize={15} alwaysLabel />
        </div>

        <div className="mt-6 grid flex-1 items-center gap-8 lg:mt-0 lg:grid-cols-[minmax(0,460px)_1fr_minmax(0,360px)]">
          {/* Logo + Spielmenü */}
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="gf-logo">Virtual<br />Farm</h1>
              <p className="gf-logo-unter mt-3">Eine Welt, sechs Höfe — pflanzen, ernten, verkaufen.</p>
            </div>

            <nav className="gf-pixelpanel flex flex-col gap-3 p-4" aria-label="Hauptmenü">
              {!authUser ? (
                <>
                  <button type="button" onClick={() => twitchLogin?.()} className="gf-menuknopf gf-menuknopf-twitch">
                    <TwitchGlyph className="h-5 w-5" /> Mit Twitch anmelden
                  </button>
                  <ul className="space-y-1.5 px-1 text-[14px] text-amber-100/90">
                    {VORSCHAU.map((t) => (
                      <li key={t} className="flex items-center gap-2"><span className="gf-pixelpunkt" aria-hidden="true" /> {t}</li>
                    ))}
                  </ul>
                  <p className="px-1 text-[12px] leading-snug text-amber-100/60">
                    Kostenlos. Dein Hof wird mit deinem Twitch-Konto gespeichert, damit Nachbarn dich wiederfinden.
                  </p>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => enterWorld("public")} className="gf-menuknopf gf-menuknopf-gruen">
                    <Play size={20} fill="currentColor" /> Spielen
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.currentTarget.blur(); setPrivatOffen((o) => !o); }}
                    aria-expanded={privatOffen}
                    className="gf-menuknopf"
                  >
                    <Users size={18} /> Private Welt
                  </button>
                  {privatOffen && (
                    <div className="gf-pixelfach space-y-2.5 p-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                          onKeyDown={(e) => { if (e.key === "Enter") enterWorld("code"); }}
                          placeholder="Weltcode"
                          aria-label="Weltcode"
                          className="gf-input min-w-0 flex-1 uppercase tracking-[0.3em] placeholder:tracking-normal"
                        />
                        <button type="button" onClick={() => enterWorld("code")} disabled={joinCodeInput.trim().length < 4} className="gf-menuknopf gf-menuknopf-klein">
                          <KeyRound size={15} /> Beitreten
                        </button>
                      </div>
                      <button type="button" onClick={() => enterWorld("create")} className="gf-menuknopf gf-menuknopf-klein w-full">
                        <Plus size={15} /> Neue private Welt erstellen
                      </button>
                      <p className="text-[12px] leading-snug text-amber-100/70">
                        Eine neue Welt bekommt einen fünfstelligen Code zum Weitergeben. Deine Farm zieht mit dir in jede Welt um.
                      </p>
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>

          <div className="hidden lg:block" aria-hidden="true" />

          {/* Bestenliste als Anzeigetafel */}
          <section className="gf-pixelpanel p-4" aria-labelledby="gf-lb">
            <h2 id="gf-lb" className="mb-3 flex items-center gap-2 text-lg font-bold text-amber-50">
              <HudIcon.level size={18} /> Bestenliste
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
                    className={`gf-pixelreiter ${liste === l.key ? "gf-pixelreiter-an" : ""}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            <div className="gf-pixelfach">
              {eintraege.length === 0 ? (
                <p className="px-4 py-6 text-center text-amber-100/60">{liste === "gold" ? "Noch keine Farmer unterwegs." : "Noch niemand eingetragen."}</p>
              ) : (
                <ol>
                  {eintraege.slice(0, 10).map((e, i) => {
                    const eigener = loginName && String(e.name || "").toLowerCase() === String(loginName).toLowerCase();
                    return (
                      <li key={i} className={`flex items-center gap-3 border-b-2 border-black/25 px-3 py-1.5 text-[14px] last:border-b-0 ${eigener ? "bg-amber-400/15" : ""}`}>
                        <span className={`w-6 shrink-0 font-bold tabular-nums ${i === 0 ? "text-amber-300" : i < 3 ? "text-amber-100" : "text-amber-100/50"}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-amber-50" title={e.name}>
                          {e.sterne > 0 && <span className="mr-1 text-amber-300" title={`${e.sterne} Stern${e.sterne > 1 ? "e" : ""} aus „Neue Saat“`}>{`★${e.sterne > 1 ? e.sterne : ""}`}</span>}
                          {e.name}
                          {eigener && <span className="ml-1.5 text-[11px] text-amber-100/60">(du)</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 font-bold tabular-nums text-amber-300">
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
