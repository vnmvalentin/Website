// GardenMenu.jsx — das Hauptmenü von Virtual Farm („Hofmarkt"): Wiese mit den echten Marktständen und Tieren, links das
// Holzschild mit Konto und Weltwahl, rechts die Bestenliste als Aushang. Vorher war das der Lobby-Bildschirm mitten in
// GameContainer.jsx; die Logik (enterWorld, Anmeldung, Bestenliste) bleibt dort, hier steht nur die Oberfläche.
import React from "react";
import { Link } from "react-router-dom";
import { Play, FlaskConical, ArrowLeftToLine, KeyRound, Plus } from "lucide-react";
import SEO from "../../../../components/SEO";
import { HudIcon } from "../gameIcons";
import { formatGold } from "../gardenTokens";
import { FARM_SEO, TwitchGlyph } from "../../engine/gameConstants";

const PROPS = [
  // Grafik, Position (unten/links oder rechts in %), Breite — erst ab lg, darunter stünden sie hinter den Schildern
  { src: "/garden-assets/world/seed_shop.png", style: { left: "-2%", bottom: "4%", width: "min(30vw, 380px)" } },
  { src: "/garden-assets/world/market.png", style: { right: "-1%", bottom: "6%", width: "min(26vw, 340px)" } },
  { src: "/garden-assets/animals/kuh/1.png", style: { right: "24%", bottom: "5%", width: "min(12vw, 160px)" } },
  { src: "/garden-assets/animals/huhn/1.png", style: { left: "27%", bottom: "4%", width: "min(6vw, 78px)" } },
  { src: "/garden-assets/deco/nature/tulpenbett.png", style: { left: "40%", bottom: "2%", width: "min(14vw, 180px)" } },
  { src: "/garden-assets/deco/nature/cherry_blossom.png", style: { right: "12%", bottom: "30%", width: "min(14vw, 190px)" } },
];

// Für Besucher ohne Login: was sie nach der Anmeldung erwartet — mit echten Spielgrafiken (auf dem Handy gibt es sonst
// gar keine, die Kulisse oben erscheint erst ab lg)
const PREVIEW = [
  { src: "/garden-assets/plants/apfel/structure.png", title: "Pflanzen und ernten", text: "Über 50 Sorten vom Radieschen bis zum Obstbaum, mit Wetter und Tageszeiten." },
  { src: "/garden-assets/animals/kuh/1.png", title: "Tiere halten", text: "Hühner, Kühe, Pferde — bis hin zu Drache und Einhorn." },
  { src: "/garden-assets/deco/nature/tulpenbett.png", title: "Deinen Hof gestalten", text: "Zäune, Beete, Lampen und Wege frei platzieren." },
  { src: "/garden-assets/world/mailbox.png", title: "Mit Nachbarn spielen", text: "Acht Grundstücke pro Welt, Post an Nachbarn, Bestenliste." },
];

export default function GardenMenu({
  authUser, twitchLogin, istGartenAdmin, isSubscriber, isBeta,
  leaderboard, joinCodeInput, setJoinCodeInput, enterWorld,
}) {
  const loginName = authUser?.twitchLogin || authUser?.login;

  return (
    <div className="gf-scene relative w-full h-full overflow-y-auto overflow-x-hidden">
      <SEO {...FARM_SEO} />

      {/* Hügel und Requisiten: reine Kulisse */}
      <svg className="gf-hill" viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120 C 240 40, 480 60, 720 110 S 1200 170, 1440 80 L1440 400 L0 400 Z" fill="#86c95c" stroke="#3f6b22" strokeWidth="5" />
        <path d="M0 210 C 300 150, 620 190, 900 220 S 1300 240, 1440 190 L1440 400 L0 400 Z" fill="#6fb246" />
        <path d="M0 320 C 360 290, 760 310, 1080 330 S 1340 320, 1440 300 L1440 400 L0 400 Z" fill="#5b9e3a" />
      </svg>
      {PROPS.map((p) => (
        <img key={p.src} src={p.src} alt="" aria-hidden="true" draggable={false}
          className="gf-prop hidden lg:block" style={p.style} />
      ))}

      {/* Obere Leiste: nur im Menü — im Spiel liegt „Zurück" in den Einstellungen */}
      <div className="relative z-10 max-w-[1240px] mx-auto px-4 pt-4 flex items-center justify-end">
        <Link to="/fun" className="gf-btn gf-btn-wood gf-btn-sm" title="Zurück zur Website">
          <ArrowLeftToLine size={15} /> Website
        </Link>
      </div>

      <div className="relative z-10 max-w-[1240px] mx-auto px-4 pb-10 pt-2 md:pt-6 grid lg:grid-cols-[minmax(0,470px)_minmax(0,360px)] justify-between gap-8 items-start">
        <div className="min-w-0">
          <h1 className="gf-title text-[56px] sm:text-[76px] mb-2">Virtual<br />Farm</h1>
          <p className="gf-paper inline-block px-3 py-1 text-[15px] font-semibold mb-5">
            Eine gemeinsame Welt mit acht Grundstücken — pflanzen, ernten, verkaufen.
          </p>

          <div className="gf-board p-4 sm:p-5 space-y-4">
            {/* Konto */}
            <div className="gf-paper px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="gf-label text-[var(--gf-ink-dim)]">Twitch-Konto</div>
                {loginName ? (
                  <div className="font-extrabold text-lg truncate">{loginName}</div>
                ) : (
                  <div className="font-semibold text-[15px]">Nicht angemeldet</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Der Admin trägt sein eigenes Schild statt „Subscriber" — den Verkaufsbonus bekommt er trotzdem. */}
                {authUser && istGartenAdmin && (
                  <span className="gf-chip border-red-700 text-red-700 bg-red-50">
                    <HudIcon.trusted size={13} /> Admin{isSubscriber ? " · +50 % Verkauf" : ""}
                  </span>
                )}
                {authUser && !istGartenAdmin && isSubscriber && (
                  <span className="gf-chip border-amber-600 text-amber-800 bg-amber-100">
                    <HudIcon.star size={13} /> Subscriber · +50 % Verkauf
                  </span>
                )}
                {authUser && isBeta && (
                  <span className="gf-chip border-sky-600 text-sky-800 bg-sky-50">
                    <FlaskConical size={13} /> Beta
                  </span>
                )}
              </div>
            </div>

            {!authUser ? (
              <>
                <button type="button" onClick={() => twitchLogin?.()} className="gf-btn gf-btn-twitch gf-btn-lg w-full !whitespace-normal text-center leading-tight">
                  <TwitchGlyph className="w-5 h-5" /> Mit Twitch anmelden und loslegen
                </button>
                <div className="gf-paper px-4 py-3">
                  <div className="gf-label text-[var(--gf-ink-dim)] mb-1">Das erwartet dich</div>
                  <ul>
                    {PREVIEW.map((f) => (
                      <li key={f.title} className="flex items-center gap-3 py-2.5 border-b-2 border-dashed border-[var(--gf-cream-line)] last:border-b-0">
                        <img src={f.src} alt="" aria-hidden="true" draggable={false} loading="lazy" className="w-14 h-14 object-contain shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-extrabold leading-tight">{f.title}</span>
                          <span className="block text-[13px] leading-snug text-[var(--gf-ink-dim)]">{f.text}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[13px] leading-snug text-[var(--gf-ink-dim)] mt-2">
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
            <div className="gf-paper px-4 py-3 space-y-2.5">
              <div className="gf-label text-[var(--gf-ink-dim)]">Private Welt</div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                  onKeyDown={(e) => { if (e.key === "Enter" && authUser) enterWorld("code"); }}
                  placeholder="Weltcode"
                  aria-label="Weltcode"
                  disabled={!authUser}
                  className="gf-input tracking-[0.3em] uppercase placeholder:tracking-normal"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => enterWorld("code")} disabled={!authUser || joinCodeInput.trim().length < 4} className="gf-btn gf-btn-wood flex-1">
                    <KeyRound size={16} /> Beitreten
                  </button>
                  <button type="button" onClick={() => enterWorld("create")} disabled={!authUser} className="gf-btn gf-btn-wood flex-1">
                    <Plus size={16} /> Neue Welt
                  </button>
                </div>
              </div>
              <p className="text-[13px] leading-snug text-[var(--gf-ink-dim)]">
                Eine neue Welt bekommt einen fünfstelligen Code zum Weitergeben. Deine Farm zieht mit dir in jede Welt um.
              </p>
            </div>
            </>
            )}
          </div>
        </div>

        {/* Bestenliste als Aushang am Holzbrett */}
        <section className="gf-board p-4 sm:p-5 lg:mt-[140px]" aria-labelledby="gf-lb">
          <h2 id="gf-lb" className="flex items-center gap-2 font-extrabold text-xl mb-3">
            <HudIcon.level size={20} /> Bestenliste
          </h2>
          <div className="gf-paper overflow-hidden">
            {leaderboard.length === 0 ? (
              <p className="px-4 py-6 text-center font-semibold text-[var(--gf-ink-dim)]">Noch keine Farmer unterwegs.</p>
            ) : (
              <ol>
                {leaderboard.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2 border-b-2 border-dashed border-[var(--gf-cream-line)] last:border-b-0">
                    <span className={`w-6 shrink-0 font-extrabold tabular-nums ${i === 0 ? "text-amber-600" : "text-[var(--gf-ink-dim)]"}`}>{i + 1}</span>
                    <span className="flex-1 min-w-0 font-bold truncate" title={e.name}>{e.name}</span>
                    <span className="flex items-center gap-1.5 font-extrabold text-amber-700 tabular-nums shrink-0">
                      <HudIcon.gold size={15} /> {formatGold(e.gold)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
