// WinTrackerOverlayPage.jsx — Kompaktes OBS-Overlay: Liga/Trophäen des aktiven Accounts, plus
// zwei ein-/ausblendbare Zusatzteile — "Session" (Profit/Win-Loss/letzte 5 Spiele, EIN Block)
// und "Deck". Das Deck kann im vertikalen Stapel stehen (oben oder unten) oder als eigene Spalte
// links/rechts neben allem — dann exakt so hoch wie der Rest (kein JS-Messen für die HÖHE nötig:
// die Spalten sitzen in einer Flex-Reihe mit alignItems:stretch). Reihenfolge/Sichtbarkeit kommt
// aus settings (deckPlacement, last5Style, showDeck, showProfile,
// showDailyProfit/showWinLossNumbers/showWinLossPercent/showLast5) — im Designer-Panel der
// Win-Tracker-Seite eingestellt.
//
// BREITE der Karte: fest (CARD_WIDTH). Wechselnde Inhalte (langer Name, Rang #12.345, große
// Session-Zahlen) ändern die Größe der OBS-Quelle nie — sie werden per FitText kleiner skaliert.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Trophy, ChevronsUp } from "lucide-react";
import { leagueIconUrl, leagueName, MEDAL_ICON_URL, LEAGUE_MEDAL_ICON_URL, seasonalBadgeUrl, challengeBadgeUrl } from "../data/leagueIcons";
import { trophyArenaIcon, trophyArenaName } from "../data/trophyArenas";
import { cardImageUrl } from "../data/cards";
import { useClanBadgeUrl } from "../data/clanBadges";
import { useStableState } from "../../../utils/useStableState";
import { getOverlayData } from "./winTrackerApi";
import { usePagedTransition, SLIDE_MS } from "./usePagedTransition";
import { dictForWt, challengeLabel } from "./wtI18n";
import FitText from "./FitText";
import ChallengeValue, { ChallengeBadge } from "./ChallengeValue";
import { overlayLook, CR_FONT_HREF } from "./overlayTheme";
import trophyIcon from "../../../assets/clashRoyale/ui/trophy.png";
import trophy2v2Icon from "../../../assets/clashRoyale/ui/trophy2v2.webp";
import league2v2Badge from "../../../assets/clashRoyale/ui/league2v2.png";

const POLL_MS = 15000;
// Feste Kartenbreite (vor der Overlay-Größe/zoom). Inhalte passen sich per FitText an.
const CARD_WIDTH = 310;
// Zahlenformat folgt der Overlay-Sprache (settings.language) — Tausendertrennzeichen
// unterscheiden sich zwischen de-DE (Punkt) und en-US (Komma).
const fmt = (n, lang) => (n || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE");

// Misst die Höhe jedes einzelnen Stapel-Teils (Profil/Deck/Session) über unsichtbare Messkopien —
// unsichtbare Kopien statt der sichtbaren Elemente. Gebraucht für die
// Paginierung (settings.paginateOverlay, siehe unten): jede Seite bekommt exakt die Höhe der
// GRÖSSTEN aktuell sichtbaren Seite, fest — sonst würde die OBS-Browserquellen-Größe bei jedem
// Seitenwechsel springen. Immer alle drei gemessen (unabhängig davon, welche gerade Seite ist),
// unsichtbare Kopien statt sichtbarer Elemente, denn das
// sichtbare Element zeigt ja gerade nur EINE Seite, könnte sich also nie selbst als "die größte"
// messen.
function useBlockHeights() {
  const profileRef = useRef(null);
  const deckRef = useRef(null);
  const sessionRef = useRef(null);
  const raw = useRef({ profile: 0, deck: 0, session: 0 });
  const [heights, setHeights] = useState({ profile: 0, deck: 0, session: 0 });

  useLayoutEffect(() => {
    // WICHTIG: setHeights({ ...raw.current }) baut IMMER ein neues Objekt, selbst wenn sich kein
    // einziger Wert geändert hat — anders als ein setState(<Zahl>), wo React
    // bei gleichem Primitivwert von selbst abbricht). Ohne den Vergleich hier läuft der Effekt
    // (bewusst ohne Dependency-Array, jeden Render) jedes Mal auf ein "neues" Objekt hinaus,
    // triggert einen weiteren Render, der den Effekt erneut auslöst — "Maximum update depth
    // exceeded" (empirisch als React-Fehler in der Praxis aufgetreten). Der funktionale Updater
    // gibt bei UNVERÄNDERTEN Werten dieselbe prev-Referenz zurück, React bricht dann korrekt ab.
    const recompute = () => setHeights((prev) => {
      const next = raw.current;
      if (prev.profile === next.profile && prev.deck === next.deck && prev.session === next.session) return prev;
      return { ...next };
    });
    const observers = [];
    const attach = (ref, key) => {
      if (!ref.current) return;
      const measure = () => { raw.current[key] = ref.current.getBoundingClientRect().height; recompute(); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(ref.current);
      observers.push(ro);
    };
    attach(profileRef, "profile");
    attach(deckRef, "deck");
    attach(sessionRef, "session");
    recompute();
    return () => observers.forEach((ro) => ro.disconnect());
  });

  return [{ profile: profileRef, deck: deckRef, session: sessionRef }, heights];
}

// Reine Funktion statt Inline-Logik in der Komponente: wird ZWEIMAL gebraucht — einmal VOR dem
// early return (dort ist nur data?.settings verfügbar, kann noch
// undefined sein) für usePagedTransition (braucht die Seitenzahl schon, bevor "data" feststeht,
// weil React-Hooks nicht übersprungen werden dürfen), und einmal NACH dem early return mit dem
// echten, garantiert vorhandenen settings-Objekt. Dieselbe Funktion an beiden Stellen verhindert,
// dass beide Versionen auseinanderlaufen — settings === undefined liefert einfach einen leeren
// Stapel (0 Seiten), bis die echten Daten da sind.
function computeStack(settings) {
  if (!settings) return { stack: [], sidebarSide: null };
  const showDaily = settings.showDailyProfit || settings.showWinLossNumbers || settings.showWinLossPercent;
  const showLast5 = !!settings.showLast5;
  const showSession = showDaily || showLast5;
  const showDeck = settings.showDeck !== false;
  const showProfile = settings.showProfile !== false;
  const deckPlacement = settings.deckPlacement || "top";

  const stack = [];
  if (showProfile) stack.push("profile");
  if (showDeck && deckPlacement === "top") stack.push("deck");
  if (showSession) stack.push("session");
  if (showDeck && deckPlacement === "bottom") stack.push("deck");

  let sidebarSide = null;
  if (showDeck && (deckPlacement === "left" || deckPlacement === "right")) {
    if (stack.length > 0) sidebarSide = deckPlacement;
    else stack.push("deck");
  }
  return { stack, sidebarSide };
}

export default function WinTrackerOverlayPage() {
  const { overlayKey } = useParams();
  // Läuft in OBS dauerhaft: nur neu rendern, wenn sich wirklich etwas geändert hat
  const [data, setData] = useStableState(null);
  const cardWidth = CARD_WIDTH;
  const [heightRefs, blockHeights] = useBlockHeights();

  useEffect(() => {
    let alive = true;
    const tick = () => {
      getOverlayData(overlayKey)
        .then((json) => { if (alive) setData(json); })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [overlayKey, setData]);

  // Seitenwechsel-Animation der Paginierung — braucht die Seitenzahl schon HIER (vor dem early
  // return), deshalb computeStack(data?.settings) statt des echten stack unten (siehe
  // ausführlicher Kommentar an computeStack). paginate/paginateIntervalMs greifen aus demselben
  // Grund sicher auf data?. zurück: vor dem ersten Laden (data noch null) ist paginate einfach
  // false, der Hook selbst muss trotzdem JEDES Mal in derselben Reihenfolge laufen (React-Regel).
  const paginate = !!data?.settings?.paginateOverlay;
  const paginateIntervalMs = Math.max(2, Number(data?.settings?.paginateIntervalS) || 6) * 1000;
  const provisionalPageCount = computeStack(data?.settings).stack.length;
  const { index: pageIndex, offsetPct, transitionOn } =
    usePagedTransition(provisionalPageCount, paginateIntervalMs, paginate && provisionalPageCount > 1);

  // Wie paginate oben: sicher auf data?. zurückgreifen, damit der Hook (React-Regel) auch vor dem
  // ersten Laden JEDES Mal gleich oft läuft.
  const clanBadgeImgUrl = useClanBadgeUrl(data?.clanBadgeId ?? null);

  // Clash-Royale-Look braucht die Titelschrift — das Overlay läuft ohne CrShell (die sie sonst lädt).
  // Die Siegzahl im Challenge-Schild nutzt dieselbe Schrift, auch im klassischen Look.
  const royaleTheme = data?.settings?.overlayTheme === "royale" || !!data?.challenge;
  useEffect(() => {
    if (!royaleTheme || document.querySelector(`link[href="${CR_FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CR_FONT_HREF;
    document.head.appendChild(link);
  }, [royaleTheme]);

  // OBS-Browserquelle — gehört nicht in die Google-Suche (zusätzlich per robots.txt gesperrt)
  const noIndex = <meta name="robots" content="noindex, nofollow" />;
  if (!data || !data.hasAccount) return noIndex;

  const {
    playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, clanName,
    league2v2Trophies, league2v2BestTrophies, seasonal, challenge, ladder, daily, last5, deck, settings,
  } = data;
  const lang = settings.language === "en" ? "en" : "de";
  const t = dictForWt(lang);
  const isTrophyMode = settings.trackMode === "trophies";
  const isLeague2v2 = settings.trackMode === "2v2";
  // Trophäenmodus zeigt player.trophies (Lifetime-Trophäen, siehe "Seasonal Trophy Road"-Kommentar
  // in crWinTrackerRoutes.js) — das hat KEINE Liga, der Ranked1v1-Liga-Orden hier wäre also
  // irreführend (der Account kann z.B. in Liga 6 stehen, ohne dass das mit dem Trophäenwert etwas
  // zu tun hat). Zeigt stattdessen die klassische Trophäenstraßen-Arena (siehe trophyArenas.js);
  // trophyArenaIcon() liefert null oberhalb von 14.000 Trophäen (kein Icon bekannt) — fällt dann
  // in denselben Platzhalter wie ein fehlendes Liga-Icon (badgeFallback unten).
  // Generischer saisonaler Ranked-Modus (Spooky Chess League & künftige, siehe lib/seasonalModes.js
  // im Backend): eigenes Objekt mit Name, Stand und Stufe — kein eigenes Liga-Bild bekannt, deshalb
  // die Trophäe als Abzeichen.
  const isSeasonal = !!seasonal;
  // Challenge (Classic/Grand/20 Win): Kopf zeigt Siege des Runs + Niederlagen-Felder (ChallengeValue)
  const isChallenge = !!challenge;
  const badgeUrl = isChallenge ? challengeBadgeUrl(challenge.key) : isSeasonal ? (seasonalBadgeUrl(seasonal.mode) || trophyIcon) : isLeague2v2 ? league2v2Badge : isTrophyMode ? trophyArenaIcon(trophies) : leagueIconUrl(leagueNumber);
  const badgeAlt = isChallenge ? challengeLabel(challenge.key, t) : isSeasonal ? seasonal.label : isTrophyMode ? trophyArenaName(trophies) : leagueName(leagueNumber, lang);
  // Ligen 1-6 kennen keine Medaillen: dort zählt der Tracker die Stufen bis Ultimate Champion.
  // Ab UC (Liga 7) liefert das Backend kein ladder-Objekt mehr und es geht zurück auf Medaillen.
  // computeLadder läuft serverseitig unabhängig vom trackMode (1v1-Liga bleibt bestehen, auch
  // während 2v2 Ranked getrackt wird) — hier deshalb zusätzlich isLeague2v2 ausschließen, sonst
  // würde ein 2v2-Account in Liga 1-6 fälschlich die 1v1-Stufenanzeige statt seiner 2v2-Trophäen
  // zeigen.
  const isLadderMode = !isTrophyMode && !isLeague2v2 && !isSeasonal && !isChallenge && !!ladder;
  const mainValue = isSeasonal ? seasonal.trophies : isLeague2v2 ? league2v2Trophies : isTrophyMode ? trophies : seasonMedals;
  const dailyValue = isLadderMode ? (ladder.sessionDelta || 0) : (daily?.profit || 0);
  const profitPositive = dailyValue >= 0;
  const last5Style = settings.last5Style || "result";
  // Reihenfolge kommt bereits fertig sortiert vom Backend (last5Direction wird dort angewendet)
  // — hier nur noch merken, an welchem ARRAY-INDEX das neueste Spiel steht, für die Markierung.
  const last5Direction = settings.last5Direction || "newestLeft";
  const showLast5NewBadge = settings.last5NewBadge !== false;
  const newestIndex = last5.length ? (last5Direction === "newestRight" ? last5.length - 1 : 0) : -1;
  const directionLabel = "NEWEST";
  const showDaily = settings.showDailyProfit || settings.showWinLossNumbers || settings.showWinLossPercent;
  // GRÖSSE STABIL HALTEN: showLast5/showDeck hängen nur noch von der Einstellung ab, nicht mehr
  // zusätzlich davon, ob gerade schon Daten da sind (last5.length>0 bzw. ein gesynctes Deck) —
  // sonst wechselt die Kartenhöhe mitten im Stream (frische Session ohne Spiele, frisch verknüpfter
  // oder per Chat umgeschalteter Account ohne Deck-Sync) und schneidet in die feste OBS-Browser-
  // quellen-Größe. Fehlende Einträge werden stattdessen als leere Platzhalter gerendert (siehe
  // last5Row/deckGridEl unten) — das Modul behält seine Größe, nur der Inhalt füllt sich auf.
  const showLast5 = !!settings.showLast5;
  // Kartenfläche, Trennlinien und ggf. Clash-Royale-Look kommen aus overlayTheme.js (gemeinsam
  // mit OverlayPreview.jsx — vorher stand diese Rechnung in beiden Dateien).
  const look = overlayLook(baseStyles, settings);
  const styles = look.styles;
  const { dividerStyle, vDividerStyle } = look;

  // Vertikaler Stapel unterhalb/oberhalb des Profilkopfs — deck landet hier nur, wenn es NICHT
  // seitlich angedockt ist. Dieselbe Funktion wie oben vor dem early return (siehe computeStack),
  // jetzt mit dem echten settings-Objekt statt data?.settings.
  const { stack, sidebarSide } = computeStack(settings);

  // polRank ist 1v1-spezifisch (Path of Legend) — bei 2v2 Ranked und beim Trophäenmodus liefert
  // die API keinen vergleichbaren Rang, würde hier sonst fälschlich den 1v1-Rang zeigen.
  const subLine = (isTrophyMode || isLeague2v2)
    ? `${t.bestLabel}: ${fmt(isLeague2v2 ? league2v2BestTrophies : bestTrophies, lang)}`
    : isLadderMode ? leagueName(leagueNumber, lang)
    : (polRank && !isSeasonal) ? `#${fmt(polRank, lang)}` : null;
  const valueRow = isChallenge ? <ChallengeValue challenge={challenge} styles={styles} t={t} /> : (
    <FitText><div style={styles.trophyRow}>
      {isLadderMode
        ? <ChevronsUp size={22} color="#fbbf24" style={{ flexShrink: 0 }} />
        : <img src={isLeague2v2 ? trophy2v2Icon : isSeasonal ? LEAGUE_MEDAL_ICON_URL : isTrophyMode ? trophyIcon : MEDAL_ICON_URL} alt="" style={styles.valueIcon} />}
      <span style={styles.trophyValue}>{isLadderMode ? ladder.step : fmt(mainValue, lang)}</span>
      {/* Stufen-Ziel bzw. Qualifikationsziel eines Saison-Modus */}
      {isLadderMode
        ? <span style={styles.stepMax}>/{ladder.maxSteps}</span>
        : isSeasonal && seasonal.qualifyWins ? <span style={styles.stepMax}>/{seasonal.qualifyWins}</span> : null}
      {subLine && <span style={isLadderMode ? styles.leagueTag : subLine.startsWith("#") ? styles.rankLine : styles.bestRowSlot}>{subLine}</span>}
    </div></FitText>
  );

  // Profilkopf: Abzeichen links, daneben untereinander Name, Clan, eine Trennlinie und die
  // Wert-Zeile (Medaillen/Stufe + Rang bzw. Bestwert). Untereinander statt nebeneinander hält die
  // Karte schmal. Die Liga steht nur noch als Abzeichen da (kein "League 6"-Text mehr).
  // nameCol wird ZWEIMAL verwendet: im echten Kopf und in der unsichtbaren Messkopie.
  const nameCol = (
    <div style={styles.headerText}>
      <FitText><span style={styles.name}>{playerName}</span></FitText>
      {/* Feste Höhe, SOLANGE showClan an ist: der aktive Account/Modus kann jederzeit wechseln,
          ohne festen Platz würde der Kopf dabei mal höher, mal niedriger. */}
      {settings.showClan && (
        <div style={styles.clanRowSlot}>
          {clanName && (
            <FitText style={{ height: "100%" }}><div style={styles.clanRow}>
              {clanBadgeImgUrl && <img src={clanBadgeImgUrl} alt="" style={styles.clanBadgeImg} />}
              <span style={styles.clanName}>{clanName}</span>
            </div></FitText>
          )}
        </div>
      )}
      <div style={styles.headerLine} />
      {valueRow}
    </div>
  );

  const profileBlock = (
    <div style={styles.headerRow}>
      {/* Challenge: Kranz mit Siegzahl + Niederlagen-Felder wie im Spiel statt des Abzeichens */}
      {isChallenge ? <ChallengeBadge challenge={challenge} /> : (
        <div style={styles.badgeWrap}>
          {badgeUrl ? (
            <img src={badgeUrl} alt={badgeAlt} style={styles.badgeImg} />
          ) : (
            <div style={styles.badgeFallback}>
              <Trophy size={26} color="#fbbf24" />
            </div>
          )}
        </div>
      )}
      {nameCol}
    </div>
  );

  // Session-Werte als gleich breite Spalten (Beschriftung klein darüber, Wert groß darunter),
  // durch Trennlinien voneinander abgesetzt — keine eigenen Pillen, kein Trend-Pfeil mehr.
  const stats = [];
  if (settings.showDailyProfit && isChallenge) {
    // Challenges haben keinen Punkte-Profit — an seiner Stelle steht der beste Run der Session.
    stats.push({ key: "profit", label: t.statBestRun, value: challenge.bestWins });
  } else if (settings.showDailyProfit) {
    stats.push({
      key: "profit",
      label: isLadderMode ? t.statSteps : t.statProfit,
      value: <span style={{ color: profitPositive ? "#4ade80" : "#f87171" }}>{profitPositive ? "+" : ""}{fmt(dailyValue, lang)}</span>,
    });
  }
  if (settings.showWinLossNumbers) {
    stats.push({
      key: "record",
      label: t.statRecord,
      value: <><span style={{ color: "#4ade80" }}>{daily.wins}</span><span style={styles.statDash}>–</span><span style={{ color: "#f87171" }}>{daily.losses}</span></>,
    });
  }
  if (settings.showWinLossPercent) {
    stats.push({ key: "pct", label: t.statWinRate, value: `${daily.winPct}%` });
  }
  const statColumns = `repeat(${Math.max(1, stats.length)}, minmax(0, 1fr))`;
  const statsInner = stats.map((s, i) => (
    <div key={s.key} style={i > 0 ? { ...styles.statCell, ...look.statSepStyle } : styles.statCell}>
      <span style={styles.statLabel}>{s.label}</span>
      <FitText align="center"><span style={styles.statValue}>{s.value}</span></FitText>
    </div>
  ));

  // Session: Werte-Zeile + letzte 5 Spiele als EIN Block.
  const sessionBlock = (
    <div style={styles.sessionBlock}>
      {showDaily && (
        <div style={{ ...styles.statsRow, gridTemplateColumns: statColumns }}>{statsInner}</div>
      )}
      {showLast5 && (
        <div>
        {last5Style === "dot" ? (
          <div>
            {/* Immer 5 Punkte (wie last5Row unten) statt nur so viele wie es Spiele gibt — sonst
                schrumpft die zentrierte Gruppe mit einer jungen Session (wenige/keine Spiele
                seit dem letzten 4h-Reset) sichtbar zusammen. Fehlende Spiele als gedimmter
                Platzhalter-Punkt statt als Farb-Punkt. */}
            <div style={styles.dotRow}>
              {Array.from({ length: 5 }, (_, i) => {
                const b = last5[i];
                if (!b) return <span key={i} style={styles.dotEmpty} />;
                return <span key={i} style={i === newestIndex && showLast5NewBadge ? { ...styles.dot(b.result), ...styles.dotNewest } : styles.dot(b.result)} />;
              })}
            </div>
            {/* Punkte sitzen als zentrierte Gruppe (kein festes 5-Spalten-Raster wie die Blasen),
                deshalb hier nur grob links/rechts ausgerichtet statt exakt unter einem Punkt —
                reicht als Leserichtungs-Hinweis, ohne die Minimalismus-Idee der Punkte aufzugeben.
                Zeile bleibt reserviert, SOBALD showLast5NewBadge an ist — nicht erst wenn es
                bereits ein echtes "neuestes" Spiel gibt (newestIndex>=0): sonst wäre eine junge
                Session ohne Spiele kurz niedriger als eine mit erstem Ergebnis, derselbe Fehler
                wie bei last5/deck oben, nur eine Ebene tiefer. */}
            {showLast5NewBadge && (
              <div style={{ ...styles.last5Caption, justifyContent: last5Direction === "newestRight" ? "flex-end" : "flex-start" }}>
                {newestIndex >= 0 ? directionLabel : " "}
              </div>
            )}
          </div>
        ) : (
          // EIN Wrapper statt zwei direkter Kinder von sessionBlock: die NEUESTE-Zeile soll eng
          // an den Blasen kleben (eigener kleiner marginTop), nicht den vollen Zeilenabstand
          // (sessionBlock.gap) zur Profit-Zeile UND zu den Blasen gleichzeitig bekommen.
          <div>
            {/* Immer 5 Blasen: last5Row hat zwar schon ein festes 5-Spalten-Raster, aber vorher
                wurden nur so viele KINDER gerendert wie last5.length hergab — bei weniger als 5
                Spielen (junge Session) blieben die fehlenden Spalten leer statt eine sichtbare
                Platzhalter-Blase zu zeigen. Rein optisch, die Breite/Höhe der Reihe war schon
                vorher stabil (repeat(5, 1fr)); das hier macht nur sichtbar, dass da noch Plätze
                frei sind. */}
            <div style={styles.last5Row}>
              {Array.from({ length: 5 }, (_, i) => {
                const b = last5[i];
                // Unsichtbarer Zeilentext (kein leerer Div) statt fester Pixel-Höhe: die leere
                // Blase bekommt so exakt dieselbe Zeilenhöhe wie eine echte (gleiche fontSize/
                // fontWeight), unabhängig von Font-Metriken/künftigen Größenanpassungen an
                // matchPill — bleibt korrekt, selbst wenn ALLE 5 Blasen einer jungen Session leer
                // sind (Grid-Zellen strecken sich sonst nur an der höchsten ANDEREN Zelle in der
                // Reihe, nicht an sich selbst).
                if (!b) return <div key={i} style={styles.matchPillEmpty}>{" "}</div>;
                return (
                  <div key={i} style={styles.matchPill(b.result)}>
                    {/* 2v2 zeigt IMMER Win/Lose, unabhängig vom gewählten last5Style — battlelog
                        liefert startingTrophies strukturell nur für team[0] (siehe Kommentar an
                        applyLeague2v2Deltas in crWinTrackerRoutes.js), eine einzelne +/--Zahl
                        wäre also für viele Matches gar nicht verlässlich bekannt. Der
                        Session-Profit kommt für 2v2 stattdessen aus einem Kontostand-Anker
                        (siehe updateLeague2v2SessionAnchor), der diese Einschränkung nicht hat —
                        hier in "letzte 5" bleibt sie aber bestehen, deshalb der Zwang auf Win/Lose. */}
                    {last5Style === "result" || isLeague2v2 || isChallenge
                      ? (RESULT_LABEL[b.result] || RESULT_LABEL.draw)
                      // In den Stufen-Ligen ist trophy_change je Match immer 0 (dort zählt der
                      // Tracker eigene Stufen statt echter Medaillen) — die Zahl kommt dort aus
                      // dem Ergebnis selbst (Sieg = +1 Stufe, Niederlage = -1), nicht aus der API.
                      : isLadderMode
                        ? (STEP_DELTA[b.result] ?? "0")
                        : `${b.trophyChange > 0 ? "+" : ""}${b.trophyChange}`}
                  </div>
                );
              })}
            </div>
            {/* NEUESTE-Markierung: eigene Zeile UNTER der Blasen-Reihe, per Grid exakt unter der
                neuesten Blase platziert (gridColumnStart) — nie über dem Inhalt selbst. Zeile
                bleibt reserviert, sobald showLast5NewBadge an ist (siehe last5Caption-Kommentar
                oben für das "Warum" — dieselbe feste Höhe unabhängig von Datenlage). Ein Grid OHNE
                jedes Kind hat keine intrinsische Höhe — deshalb hier IMMER ein <span>, nur bei
                fehlendem echten "neuesten" Spiel unsichtbar (visibility statt display:none, damit
                die Zeile trotzdem ihre Höhe behält) statt komplett wegzulassen. */}
            {showLast5NewBadge && (
              <div style={styles.last5BadgeRow}>
                <span style={{
                  ...styles.last5Badge,
                  gridColumnStart: newestIndex >= 0 ? newestIndex + 1 : 1,
                  visibility: newestIndex >= 0 ? "visible" : "hidden",
                }}>
                  {newestIndex >= 0 ? directionLabel : " "}
                </span>
              </div>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );

  // Immer 4×2 UND immer alle 8 Slots gerendert (auch ohne Deck-Daten, z.B. frisch verknüpfter
  // oder gerade per Chat auf einen anderen Modus umgeschalteter Account, dessen Deck für DIESEN
  // Modus noch nicht gesynct ist) — vorher verschwand das Modul in diesem Fall komplett aus dem
  // Stapel (showDeck s.o.), was die Kartenhöhe je nach Datenlage ändert. Leere Slots bleiben
  // einfach unbefüllte deckCard-Boxen (dasselbe dunkle Feld wie der Hintergrund einer normalen
  // Karte, siehe styles.deckCard) — egal ob im Stapel oder seitlich angedockt. Im Stapel füllt
  // das Gitter die vom Profilkopf vorgegebene Breite (width:100%, siehe styles.deckGrid) —
  // der Kopf bestimmt die Breite, nicht das Deck. Seitlich hat es dagegen keinen Kopf neben
  // sich, der eine Breite vorgeben könnte, und braucht deshalb eine eigene feste
  // (styles.deckGridSidebar); deckPane zentriert es dort zusätzlich auf der Y-Achse.
  const deckGridEl = (gridStyle) => (
    <div style={gridStyle}>
      {Array.from({ length: 8 }, (_, i) => {
        const c = deck?.cards?.[i];
        if (!c) return <div key={i} style={styles.deckCard} />;
        const title = c.name + (typeof c.level === "number" ? ` (Lv. ${c.level})` : "");
        return (
          <div key={i} title={title} style={{ ...styles.deckCard, ...styles.deckCardFilled }}>
            {c.id ? (
              <img src={cardImageUrl(c.id, c.variant)} alt={c.name} style={styles.deckCardImg} onError={(e) => { e.target.style.visibility = "hidden"; }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const renderStackBlock = (key) =>
    key === "profile" ? profileBlock : key === "deck" ? deckGridEl(styles.deckGrid) : key === "session" ? sessionBlock : null;

  // Paginierung: nur sinnvoll ab 2 Seiten (bei genau einer wäre "durchwechseln" ein Wechsel
  // zwischen genau demselben Inhalt). pageIndex kommt direkt aus usePagedTransition — dessen
  // eigener provisionalPageCount (vor dem early return berechnet) und stack.length hier sind
  // IMMER gleich, weil beide aus computeStack(settings) mit denselben Daten stammen (siehe
  // Kommentar an computeStack), also nie ein ungültiger Index.
  const pagesActive = paginate && stack.length > 1;
  const pageHeight = pagesActive ? Math.max(...stack.map((k) => blockHeights[k] || 0)) : 0;

  const stackContent = pagesActive ? (
    // Äußerer Rahmen schneidet die gleitende Seite auf die Kartenbreite zu (sonst sichtbar über
    // den Kartenrand hinaus, solange sie unterwegs ist) — justifyContent:center im INNEREN Teil,
    // weil das die eigentliche Seite ist: verschieden hohe Seiten (z.B. Kopf allein ist niedriger
    // als das Deck) sollen mittig in der fest reservierten pageHeight sitzen statt oben zu kleben.
    <div style={{ ...styles.pageSlideOuter, height: pageHeight }}>
      <div style={{
        ...styles.pageSlideInner,
        transform: `translateX(${offsetPct}%)`,
        transition: transitionOn ? `transform ${SLIDE_MS}ms ease` : "none",
      }}>
        {renderStackBlock(stack[pageIndex])}
      </div>
    </div>
  ) : (
    stack.map((key, i) => (
      <React.Fragment key={key}>
        {i > 0 && <div style={dividerStyle} />}
        {renderStackBlock(key)}
      </React.Fragment>
    ))
  );

  // Unsichtbare Messkopien für useBlockHeights — nur nötig, solange pagesActive ist. width:
  // cardWidth minus der Karten-Innenabstände (styles.card.padding: "16px 18px", 18px links+rechts),
  // sonst würde bei knappen Breiten (z.B. dailyRow.flexWrap) etwas anderes umbrechen als im
  // echten, gepolsterten Kartenrahmen — dieselbe "exakte Parität statt Annäherung"-Regel wie
  // überall sonst in dieser Datei.
  const heightProbes = pagesActive ? (
    <>
      {stack.includes("profile") && (
        <div ref={heightRefs.profile} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{profileBlock}</div>
      )}
      {stack.includes("deck") && (
        <div ref={heightRefs.deck} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{deckGridEl(styles.deckGrid)}</div>
      )}
      {stack.includes("session") && (
        <div ref={heightRefs.session} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{sessionBlock}</div>
      )}
    </>
  ) : null;

  // Overlay-Größe (settings.overlayScale): echtes CSS-zoom NUR auf der sichtbaren Karte — die
  // Schrift wird so in der Zielgröße gerastert statt in OBS hochgezogen (unscharf). Die Messkopien
  // oben liegen bewusst AUSSERHALB der Karte (ungezoomt): ihre Pixel sind damit dieselben
  // CSS-Pixel, in denen die Karte ihre width/height angibt, unabhängig davon, wie eine Chromium-
  // Version getBoundingClientRect unter zoom auswertet.
  const zoom = Math.max(1, Math.min(2, (Number(settings.overlayScale) || 100) / 100));
  const zoomStyle = zoom > 1 ? { zoom } : null;

  if (sidebarSide) {
    const deckPane = <div style={styles.deckPane}>{deckGridEl(styles.deckGridSidebar)}</div>;
    const cardStyle = { ...styles.card, ...styles.cardRow, width: "auto", ...look.cardSurface, ...zoomStyle };
    // Steht neben dem Deck nur EIN Teil (Kopf ODER Session, nicht beide), mittig statt oben
    // ausrichten — sonst hängt es oben an der (durch das Deck vorgegebenen) Spaltenhöhe fest,
    // mit ungenutztem Platz darunter. Bei beiden Teilen bleibt es der normale Stapel von oben —
    // AUSSER bei aktiver Paginierung: dann steht ja ohnehin immer nur EIN (fest hohes) Teil im
    // sichtbaren Bereich, genau derselbe Grund wie bei stack.length===1.
    const mainPaneStyle = { ...styles.mainPane, width: cardWidth, justifyContent: (pagesActive || stack.length === 1) ? "center" : "flex-start" };
    return (
      <div style={styles.page}>
        {noIndex}
        {heightProbes}
        <div style={cardStyle}>
          {sidebarSide === "left" && deckPane}
          {sidebarSide === "left" && <div style={vDividerStyle} />}
          <div style={mainPaneStyle}>{stackContent}</div>
          {sidebarSide === "right" && <div style={vDividerStyle} />}
          {sidebarSide === "right" && deckPane}
        </div>
      </div>
    );
  }

  const cardStyle = { ...styles.card, width: cardWidth, ...look.cardSurface, ...zoomStyle };
  return (
    <div style={styles.page}>
      {noIndex}
      {heightProbes}
      <div style={cardStyle}>{stackContent}</div>
    </div>
  );
}

const RESULT_LABEL = { win: "Win", loss: "Lose", draw: "Draw" };
// Stufen-Änderung für die "+/-"-Darstellung in Liga 1-6 (dort ist trophy_change immer 0).
const STEP_DELTA = { win: "+1", loss: "-1", draw: "0" };

const RESULT_COLOR = {
  win: { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.55)", text: "#4ade80" },
  loss: { bg: "rgba(239,68,68,0.16)", border: "rgba(239,68,68,0.55)", text: "#f87171" },
  draw: { bg: "rgba(148,163,184,0.16)", border: "rgba(148,163,184,0.5)", text: "#cbd5e1" },
};

const baseStyles = {
  page: {
    position: "fixed",
    inset: 0,
    background: "transparent",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    padding: "24px",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    width: CARD_WIDTH,
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: "16px 18px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    color: "#fff",
  },
  // Deck seitlich: Karte wird zur Flex-Reihe statt zur Spalte, Kind-Spalten teilen sich per
  // alignItems:stretch automatisch dieselbe Höhe — kein JS-Messen für die Höhe nötig.
  cardRow: { display: "flex", flexDirection: "row", alignItems: "stretch" },
  // display:flex/column, damit justifyContent (per Inline-Style gesetzt) greift: sind Kopf UND
  // Session sichtbar, bleibt es der normale Stapel von oben (flex-start); ist nur einer von
  // beiden da, zentriert ihn das mittig in der (vom Deck vorgegebenen) Spaltenhöhe.
  mainPane: { width: CARD_WIDTH, display: "flex", flexDirection: "column" },
  // Zentriert das (immer 4×2, fest breite) Deckgitter auf der Y-Achse in der ihm zugeteilten
  // Spaltenhöhe, statt es künstlich zu strecken/zuzuschneiden — "genau so hoch wie der Rest"
  // gilt für die SPALTE (per alignItems:stretch von cardRow), nicht fürs Gitter selbst.
  deckPane: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  vDivider: { width: 1, margin: "0 14px", alignSelf: "stretch" },
  headerRow: { display: "flex", alignItems: "center", gap: 14, width: "100%" },
  // Messkopie für useBlockHeights (Paginierung) — width kommt per Inline-Style von der
  // Aufrufstelle (cardWidth minus Innenabstand), boxSizing:border-box nur der Vollständigkeit
  // halber (die Blöcke selbst setzen kein eigenes Padding, das die Breite verändern würde).
  // left/top weit im Negativen (nicht bloß visibility:hidden): sessionBlock enthält die NEUESTE-Badge, deren <span> im ECHTEN Render
  // ganz bewusst sein eigenes visibility:"visible" setzt (siehe Verwendungsstelle) — das
  // überschreibt das GEERBTE hidden dieses Wrappers, sonst blitzt "NEWEST" oben links im Bild
  // auf (per Screenshot-Test gefunden). Weit außerhalb des Viewports positioniert bleibt es
  // unsichtbar, ganz unabhängig davon, was ein Kind an eigenem visibility setzt.
  pageProbe: {
    position: "absolute", visibility: "hidden", pointerEvents: "none",
    left: -99999, top: -99999, boxSizing: "border-box",
  },
  // Rahmen für die Seitenwechsel-Animation (usePagedTransition): overflow:hidden schneidet die
  // Seite auf die Kartenbreite zu, während sie seitlich unterwegs ist — ohne das würde sie kurz
  // über den Kartenrand hinausragen. willChange als Performance-Hinweis für den Browser (weiß im
  // Voraus, dass sich transform gleich ändert).
  pageSlideOuter: { overflow: "hidden", width: "100%" },
  pageSlideInner: { display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", willChange: "transform" },
  badgeWrap: { width: 64, height: 64, flexShrink: 0 },
  badgeImg: { width: "100%", height: "100%", objectFit: "contain" },
  badgeFallback: {
    width: "100%", height: "100%", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  // Kein flex:1 mehr: headerText soll seine EIGENE natürliche Breite (Name/Stufe/Platzierung)
  // an die Karte weiterreichen, statt künstlich in einen von außen vorgegebenen Rest-Platz
  // gezwängt zu werden — genau das soll ja die Kartenbreite bestimmen (siehe styles.card).
  // minWidth:0 bleibt als Sicherheitsnetz: erlaubt Schrumpfen (FitText skaliert den Namen), falls ein
  // wirklich extremer Name gegen die maxWidth-Grenze der Karte läuft.
  headerText: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", justifyContent: "center" },
  // Linie zwischen Name/Clan und Wert-Zeile (Farbe kommt aus overlayTheme.js)
  headerLine: { height: 1, margin: "6px 0 5px", background: "rgba(255,255,255,0.12)" },
  name: { fontSize: 20, fontWeight: 800, whiteSpace: "nowrap", padding: "0 2px" },
  // Wert-Zeile rechtsbündig im Kopf; whiteSpace:nowrap hält Icon, Zahl und /Ziel zusammen.
  trophyRow: { display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" },
  // Das Medaillen-Bild ist hochformatig (Bandende unten) statt quadratisch wie das Trophy-Icon —
  // in eine 18x18-Box gezwängt (wie zuvor) wirkte die Medaille selbst dadurch kleiner als die
  // Schrift daneben. Höhe statt fester Box vorgeben, Breite folgt automatisch im Seitenverhältnis.
  valueIcon: { height: 26, width: "auto", objectFit: "contain" },
  trophyValue: { fontSize: 27, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
  // Rang (#1.234) unter dem Wert — schlichte Schrift statt eigener Pille
  rankLine: {
    fontSize: 19, marginLeft: 6, fontWeight: 900, color: "#c4b5fd",
    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  },
  stepMax: { fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.45)", marginLeft: -5, fontVariantNumeric: "tabular-nums" },
  // Feste Höhe, solange showClan an ist (Ersatz für die entfernte Stufenleiste, siehe Kommentar
  // an der Verwendungsstelle) — bleibt leer, wenn der Account gerade keinem Clan angehört, statt
  // komplett zu verschwinden (sonst würde ausgerechnet DAS die Höhe ändern).
  clanRowSlot: { marginTop: 3, height: 18 },
  clanRow: { display: "flex", alignItems: "center", gap: 5, height: "100%" },
  clanBadgeImg: { width: 16, height: 16, objectFit: "contain", flexShrink: 0 },
  clanName: { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", padding: "0 1px" },
  // Feste Höhe (Zeilenhöhe bei fontSize 10) statt content-abhängig — steht immer im Layout, nur
  // Trophäen-/2v2-Ranked-Accounts füllen sie mit Text (siehe profileBlock).
  bestRowSlot: { fontSize: 13, marginLeft: 4, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" },
  // Liga-Name hinter der Stufe (1/10) in den Ligen 1-6
  leagueTag: { fontSize: 15, marginLeft: 6, fontWeight: 800, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" },
  divider: { height: 1, margin: "12px 0" },
  // Im Stapel: width:100% füllt die feste Kartenbreite (CARD_WIDTH, per Inline-Style
  // gesetzte) Kartenbreite. maxWidth deckelt das zusätzlich nach oben (bei einem sehr breiten
  // Namen sollen die Kartenbilder nicht riesig werden) — margin:auto zentriert das Gitter dann
  // in der breiteren Karte statt es linksbündig abzuschneiden.
  deckGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3px 6px", width: "100%", maxWidth: 262, margin: "0 auto" },
  // Seitlich (deckPane) hat KEINEN Kopf neben sich, der eine Breite vorgeben könnte — eigene
  // feste Breite nötig, sonst kollabiert das Gitter (Prozentbreite eines Elternelements ohne
  // eigene definierte Breite wird als 0 aufgelöst).
  deckGridSidebar: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3px 6px", width: 262 },
  // Kein eigener Rahmen: die Kartenbilder von RoyaleAPI bringen ihre seltenheitsfarbene
  // Umrandung schon mit.
  deckCard: {
    position: "relative", aspectRatio: "285 / 392", borderRadius: 7, overflow: "hidden",
    background: "rgba(0,0,0,0.35)", lineHeight: 0,
  },
  // Bild 285×420, Feld 285×392: die 28 überzähligen Pixel sind transparenter Rand — 43 % oben
  // abschneiden (≈12px) entspricht dem leeren Streifen über dem Evo-/Hero-Symbol.
  deckCardImg: { width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 43%", display: "block" },
  // Belegtes Feld ohne dunkle Platzhalter-Fläche — die Kartenbilder haben transparente Ecken
  deckCardFilled: { background: "transparent", boxShadow: "none" },
  // Session: Werte-Zeile und letzte 5 Spiele als ein Modul.
  sessionBlock: { display: "flex", flexDirection: "column", gap: 10 },
  // Werte-Zeile: gleich breite Spalten (gridTemplateColumns per Inline-Style je nach Anzahl),
  // getrennt durch Linien (statSepStyle aus overlayTheme.js) statt eigener Pillen.
  statsRow: { display: "grid", alignItems: "center" },
  statCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "0 8px", whiteSpace: "nowrap", minWidth: 0 },
  statLabel: {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
  },
  statValue: { fontSize: 21, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: "#fff" },
  statDash: { color: "rgba(255,255,255,0.4)", margin: "0 5px" },
  // Immer 5 Spalten (nicht flex:1 über die tatsächliche Anzahl) — bei weniger als 5 Spielen
  // (junge Session) bleiben die Blasen genau so groß, wie sie mit allen 5 wären, statt sich
  // aufzublähen; der Rest der Zeile bleibt sichtbar leer, als Platz für die noch kommenden Spiele.
  last5Row: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 },
  // Dieselben 5 Spalten wie last5Row (nicht als eigenes Layout, sondern exakt spiegelbildlich),
  // damit gridColumnStart am Badge-Span wirklich unter der richtigen Blase landet. marginTop
  // statt marginBottom: sitzt jetzt UNTER der Reihe statt darüber.
  last5BadgeRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", marginTop: 4 },
  last5Badge: {
    justifySelf: "center", fontSize: 8, fontWeight: 800, letterSpacing: "0.05em",
    color: "#fbbf24", whiteSpace: "nowrap",
  },
  // Richtungshinweis unter den Punkten (kein festes Raster dort, siehe dotRow) — grob an die
  // richtige Seite ausgerichtet statt exakt unter einem Punkt.
  last5Caption: {
    display: "flex", marginTop: 4, fontSize: 8, fontWeight: 800, letterSpacing: "0.05em",
    color: "#fbbf24",
  },
  matchPill: (result) => ({
    textAlign: "center",
    padding: "6px 0",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    background: (RESULT_COLOR[result] || RESULT_COLOR.draw).bg,
    border: `1px solid ${(RESULT_COLOR[result] || RESULT_COLOR.draw).border}`,
    color: (RESULT_COLOR[result] || RESULT_COLOR.draw).text,
  }),
  // Platzhalter für ein noch nicht gespieltes Spiel dieser Session — gleiches Boxmodell wie
  // matchPill (Padding, fontSize/-weight für dieselbe Zeilenhöhe), nur ohne Text und ohne Farbe.
  // Eigener Text (ein geschütztes Leerzeichen, siehe Verwendungsstelle) statt eines leeren Divs:
  // sonst wären ALLE 5 Blasen einer jungen Session (0 Spiele) niedriger als eine Reihe mit
  // mindestens einem echten Match, weil ein Grid nur an der höchsten ANDEREN Zelle streckt.
  matchPillEmpty: {
    padding: "6px 0", borderRadius: 8, textAlign: "center", fontSize: 12, fontWeight: 800,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
  },
  // Ganz einfache kleine ausgefüllte Kreise statt Blasen — dritte, minimalste Darstellung.
  // Mittig statt linksbündig: bei nur 5 kleinen Punkten wirkt Linksbündigkeit verloren/schief.
  dotRow: { display: "flex", gap: 6, alignItems: "center", justifyContent: "center" },
  // Platzhalter-Punkt (siehe matchPillEmpty) — nur ein leerer Ring statt der ausgefüllten Farbe.
  dotEmpty: { width: 9, height: 9, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)" },
  dot: (result) => ({
    width: 9, height: 9, borderRadius: "50%",
    background: (RESULT_COLOR[result] || RESULT_COLOR.draw).text,
  }),
  // NEU-Markierung für den Punkt-Stil: ein dünner Ring statt Text (Punkte sollen klein/schlicht
  // bleiben) — outline statt box-shadow, damit kein Glow-Effekt entsteht und die Punktgröße
  // selbst unverändert bleibt (Ring liegt außerhalb, nimmt keinen Platz im Layout ein).
  dotNewest: { outline: "1.5px solid rgba(255,255,255,0.75)", outlineOffset: 1.5 },
};
