// WinTrackerOverlayPage.jsx — Kompaktes OBS-Overlay: Liga/Trophäen des aktiven Accounts, plus
// zwei ein-/ausblendbare Zusatzteile — "Session" (Profit/Win-Loss/letzte 5 Spiele, EIN Block)
// und "Deck". Das Deck kann im vertikalen Stapel stehen (oben oder unten) oder als eigene Spalte
// links/rechts neben allem — dann exakt so hoch wie der Rest (kein JS-Messen für die HÖHE nötig:
// die Spalten sitzen in einer Flex-Reihe mit alignItems:stretch). Reihenfolge/Sichtbarkeit kommt
// aus settings (deckPlacement, last5Style, showDeck, showProfile,
// showDailyProfit/showWinLossNumbers/showWinLossPercent/showLast5) — im Designer-Panel der
// Win-Tracker-Seite eingestellt.
//
// BREITE der Karte: kommt jetzt aus einer echten JS-Messung des Profilkopfs (useHeaderWidth
// unten), nicht mehr aus CSS allein. Reiner CSS-Versuch (Karte auf width:"fit-content", Deck/
// Stufenleiste auf width:"100%"/flex:1 als "passive" Nicht-Treiber) ist an CSS Grids
// Intrinsic-Sizing gescheitert: ein `1fr`-Spaltenraster (das Deck-Gitter) will bei der
// Berechnung der Wunschbreite eines fit-content-Vorfahren IMMER so viel Platz wie möglich (bis
// zur maxWidth-Deckelung), unabhängig vom tatsächlichen Namen/Liga-Abzeichen — die
// Stufenleiste blieb dadurch immer so breit wie das Deck statt wie der Kopf. Eine echte Messung
// umgeht diese Mehrdeutigkeit komplett: der Kopf bekommt via display:inline-flex seine eigene
// natürliche Breite, ResizeObserver liest sie aus, und ALLES andere (Deck, Stufenleiste,
// Session-Zeilen) bekommt diese Zahl als ganz normale, unzweideutige feste Pixelbreite.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Trophy, TrendingUp, TrendingDown, ChevronsUp } from "lucide-react";
import { leagueIconUrl, leagueName, MEDAL_ICON_URL } from "../data/leagueIcons";
import { trophyArenaIcon, trophyArenaName } from "../data/trophyArenas";
import { cardImageUrl } from "../data/cards";
import { useStableState } from "../../../utils/useStableState";
import { getOverlayData } from "./winTrackerApi";
import { dictForWt } from "./wtI18n";
import trophyIcon from "../../../assets/clashRoyale/ui/trophy.png";
import trophy2v2Icon from "../../../assets/clashRoyale/ui/trophy2v2.webp";
import league2v2Badge from "../../../assets/clashRoyale/ui/league2v2.png";

const POLL_MS = 15000;
const CARD_MIN_WIDTH = 260;
const CARD_MAX_WIDTH = 480;
// Zahlenformat folgt der Overlay-Sprache (settings.language) — Tausendertrennzeichen
// unterscheiden sich zwischen de-DE (Punkt) und en-US (Komma).
const fmt = (n, lang) => (n || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE");

// Misst die WAHRE, ungebremste Wunschbreite von Kopf und Session-Tageszeile und liefert die
// GRÖSSERE der beiden zurück, geklemmt zwischen min/max.
//
// ZWEITER ANLAUF — der erste (nur headerRef, dann headerRef+dailyLeft/dailyRight) hing beide Male
// an derselben Falle: gemessen wurde das SICHTBARE Element, aber styles.headerRow trägt bewusst
// maxWidth:"100%" (Sicherheitsnetz gegen extreme Namen, siehe Kommentar dort) — ist die Karte
// GERADE zu schmal, schrumpft der sichtbare Kopf selbst auf diese Breite, UND MISST SICH DANN
// SELBST ALS "genau richtig" (ein sich selbst bestätigender Zirkelschluss: klein bleibt klein).
// dailyLeft/dailyRight hatten zwar keine eigene maxWidth-Bremse, aber das änderte nichts, wenn der
// Zirkelschluss beim Kopf zuerst zuschlägt.
//
// Deshalb jetzt: refs zeigen NICHT mehr auf sichtbare Elemente, sondern auf zwei unsichtbare
// Messkopien (position:absolute, visibility:hidden, whiteSpace:nowrap, OHNE maxWidth) — die
// können sich physisch nicht selbst zusammenschrumpfen oder umbrechen, ihre gemessene Breite ist
// deshalb IMMER die echte Wunschbreite, unabhängig von der aktuellen Kartenbreite.
function useMeasuredWidth(min, max, fallback) {
  const headerRef = useRef(null);
  const dailyRef = useRef(null);
  const raw = useRef({ header: 0, daily: 0 });
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const recompute = () => {
      const need = Math.max(raw.current.header, raw.current.daily);
      setWidth(Math.max(min, Math.min(max, Math.ceil(need))));
    };
    const observers = [];
    const attach = (ref, key) => {
      if (!ref.current) return;
      const measure = () => { raw.current[key] = ref.current.getBoundingClientRect().width; recompute(); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(ref.current);
      observers.push(ro);
    };
    attach(headerRef, "header");
    attach(dailyRef, "daily");
    recompute();
    return () => observers.forEach((ro) => ro.disconnect());
  });

  return [headerRef, dailyRef, width];
}

function hexToRgba(hex, opacityPct) {
  const h = String(hex || "#0c0c12").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct ?? 88)) / 100})`;
}

export default function WinTrackerOverlayPage() {
  const { overlayKey } = useParams();
  // Läuft in OBS dauerhaft: nur neu rendern, wenn sich wirklich etwas geändert hat
  const [data, setData] = useStableState(null);
  const [headerRef, dailyRef, cardWidth] = useMeasuredWidth(CARD_MIN_WIDTH, CARD_MAX_WIDTH, CARD_MIN_WIDTH);

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

  // OBS-Browserquelle — gehört nicht in die Google-Suche (zusätzlich per robots.txt gesperrt)
  const noIndex = <meta name="robots" content="noindex, nofollow" />;
  if (!data || !data.hasAccount) return noIndex;

  const {
    playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank,
    league2v2Trophies, league2v2BestTrophies, ladder, daily, last5, deck, settings,
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
  const badgeUrl = isLeague2v2 ? league2v2Badge : isTrophyMode ? trophyArenaIcon(trophies) : leagueIconUrl(leagueNumber);
  const badgeAlt = isTrophyMode ? trophyArenaName(trophies) : leagueName(leagueNumber, lang);
  // Ligen 1-6 kennen keine Medaillen: dort zählt der Tracker die Stufen bis Ultimate Champion.
  // Ab UC (Liga 7) liefert das Backend kein ladder-Objekt mehr und es geht zurück auf Medaillen.
  // computeLadder läuft serverseitig unabhängig vom trackMode (1v1-Liga bleibt bestehen, auch
  // während 2v2 Ranked getrackt wird) — hier deshalb zusätzlich isLeague2v2 ausschließen, sonst
  // würde ein 2v2-Account in Liga 1-6 fälschlich die 1v1-Stufenanzeige statt seiner 2v2-Trophäen
  // zeigen.
  const isLadderMode = !isTrophyMode && !isLeague2v2 && !!ladder;
  const mainValue = isLeague2v2 ? league2v2Trophies : isTrophyMode ? trophies : seasonMedals;
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
  const showSession = showDaily || showLast5;
  const showDeck = settings.showDeck !== false;
  const showProfile = settings.showProfile !== false;
  const deckPlacement = settings.deckPlacement || "top";
  const opacityFrac = Math.max(0, Math.min(100, settings.bgOpacity ?? 88)) / 100;
  // Interne Trennlinien bleiben IMMER die dezente automatische Linie — siehe ausführliche
  // Begründung an derselben Stelle in OverlayPreview.jsx (1:1 übernommen für Pixel-Parität).
  const lineColor = `rgba(255,255,255,${(0.08 * opacityFrac).toFixed(3)})`;
  const dividerStyle = { ...styles.divider, background: lineColor };
  const vDividerStyle = { ...styles.vDivider, background: lineColor };
  const cardBorderColor = settings.borderColor
    ? hexToRgba(settings.borderColor, Math.max(45, settings.bgOpacity ?? 88))
    : lineColor;
  const cardBackground = settings.bgGradient
    ? `linear-gradient(135deg, ${hexToRgba(settings.bgColor, settings.bgOpacity)}, ${hexToRgba(settings.bgColor2, settings.bgOpacity)})`
    : hexToRgba(settings.bgColor, settings.bgOpacity);

  // Vertikaler Stapel unterhalb/oberhalb des Profilkopfs — deck landet hier nur, wenn es NICHT
  // seitlich angedockt ist (siehe sidebarSide unten).
  const stack = [];
  if (showProfile) stack.push("profile");
  if (showDeck && deckPlacement === "top") stack.push("deck");
  if (showSession) stack.push("session");
  if (showDeck && deckPlacement === "bottom") stack.push("deck");

  // Seitlich andocken ergibt nur Sinn, wenn daneben auch wirklich etwas steht — sonst (z.B. nur
  // das Deck sichtbar) fällt es zurück in den normalen Stapel statt eine leere Spalte danebenzustellen.
  let sidebarSide = null;
  if (showDeck && (deckPlacement === "left" || deckPlacement === "right")) {
    if (stack.length > 0) sidebarSide = deckPlacement;
    else stack.push("deck");
  }

  // Inhalt von headerText — einmal definiert, ZWEIMAL verwendet: sichtbar im echten Kopf UND
  // (unverändert, gleiche Styles) in der unsichtbaren Messkopie weiter unten. Kein manuelles
  // Nachbauen mit eigenen Zahlen nötig, dadurch kein Risiko, dass Messkopie und echtes Aussehen
  // auseinanderlaufen.
  const headerTextInner = (
    <>
      <div style={styles.nameRow}>
        <span style={styles.name}>{playerName}</span>
      </div>
      {isLadderMode ? (
        <div style={styles.trophyRow}>
          <ChevronsUp size={18} color="#fbbf24" />
          <span style={styles.trophyValue}>{ladder.step}</span>
          <span style={styles.stepMax}>/{ladder.maxSteps}</span>
          <span style={styles.leagueLabel}>{leagueName(leagueNumber, lang)}</span>
        </div>
      ) : (
        <div style={styles.trophyRow}>
          {isLeague2v2
            ? <img src={trophy2v2Icon} alt="" style={styles.valueIcon} />
            : isTrophyMode
              ? <img src={trophyIcon} alt="" style={styles.valueIcon} />
              : <img src={MEDAL_ICON_URL} alt="" style={styles.valueIcon} />}
          <span style={styles.trophyValue}>{fmt(mainValue, lang)}</span>
          {/* polRank ist 1v1-spezifisch (Path of Legend) — bei 2v2 Ranked und beim Trophäenmodus
              (Lifetime-Trophäen, keine eigene Rangliste) liefert die API keinen vergleichbaren
              Rang, würde hier sonst fälschlich den 1v1-Rang neben einem anderen Wert zeigen. */}
          {polRank && !isLeague2v2 && !isTrophyMode ? <span style={styles.rankInline}>#{fmt(polRank, lang)}</span> : null}
        </div>
      )}
      {/* Feste Höhe für die Beste-Zeile: nur Trophäen/2v2 Ranked zeigen sie, Ranked-Liga/
          Ultimate-Champion nicht — der Modus des aktiven Accounts kann per Chat-Befehl
          (!tracker set/mode) jederzeit wechseln. Ohne festen Platz würde der Kopf dabei mal
          höher, mal niedriger, und schneidet in eine in OBS fest eingestellte
          Browserquellen-Größe (siehe auch styles.bestRowSlot). */}
      <div style={styles.bestRowSlot}>
        {(isTrophyMode || isLeague2v2) && (
          <span>{t.bestLabel}: {fmt(isLeague2v2 ? league2v2BestTrophies : bestTrophies, lang)}</span>
        )}
      </div>
    </>
  );

  const profileBlock = (
    <>
      <div style={styles.headerRow}>
        <div style={styles.badgeWrap}>
          {badgeUrl ? (
            <img src={badgeUrl} alt={badgeAlt} style={styles.badgeImg} />
          ) : (
            <div style={styles.badgeFallback}>
              <Trophy size={26} color="#fbbf24" />
            </div>
          )}
        </div>
        <div style={styles.headerText}>{headerTextInner}</div>
      </div>

      {/* Feste Höhe für die Stufenleiste, SOLANGE showLadderBar an ist: nur Ranked-Liga 1-6 zeigt
          tatsächlich Pips, aber der Platz bleibt bei jedem Modus reserviert (siehe bestRowSlot
          oben) — sonst würde ein Moduswechsel per Chat (!tracker set/mode) die Höhe ändern. Ist
          showLadderBar dagegen bewusst ausgeschaltet, fällt der Platz komplett weg (dokumentiertes
          Verhalten des Schalters: "macht das Overlay etwas niedriger") statt ihn nur leer zu zeigen. */}
      {settings.showLadderBar !== false && (
        <div style={styles.pipRowSlot}>
          {isLadderMode && (
            <div style={styles.pipRow}>
              {Array.from({ length: ladder.maxSteps }, (_, i) => (
                <div key={i} style={i < ladder.step ? styles.pipFilled : styles.pipEmpty} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  // Inhalt der Tageszeile — wie headerTextInner oben: einmal definiert, im echten (umbrechbaren)
  // Block UND in der unsichtbaren (nicht umbrechbaren) Messkopie verwendet.
  const dailyRowInner = (
    <>
      <div style={styles.dailyLeft}>
        {settings.showDailyProfit && (
          <span style={{ ...styles.profitValue, color: profitPositive ? "#4ade80" : "#f87171" }}>
            {profitPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {profitPositive ? "+" : ""}{fmt(dailyValue, lang)}
            {isLadderMode && <span style={styles.profitUnit}>{Math.abs(dailyValue) === 1 ? t.stepSingular : t.stepPlural}</span>}
          </span>
        )}
      </div>
      <div style={styles.dailyRight}>
        {settings.showWinLossNumbers && (
          <span style={styles.wlNumbers}>
            <span style={{ color: "#4ade80" }}>{daily.wins}W</span>
            {" – "}
            <span style={{ color: "#f87171" }}>{daily.losses}L</span>
          </span>
        )}
        {settings.showWinLossPercent && (
          <span style={styles.wlPct}>{daily.winPct}%</span>
        )}
      </div>
    </>
  );

  // Session: Profit/Win-Loss + letzte 5 Spiele als EIN Block, eng beieinander statt getrennt
  // durch eine Linie — kein "Session"-Label, kein "Letzte 5 Spiele"-Titel mehr.
  const sessionBlock = (
    <div style={styles.sessionBlock}>
      {showDaily && <div style={styles.dailyRow}>{dailyRowInner}</div>}
      {showLast5 && (
        last5Style === "dot" ? (
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
                    {last5Style === "result"
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
        )
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
          <div key={i} title={title} style={styles.deckCard}>
            {c.id ? (
              <img src={cardImageUrl(c.id, c.variant)} alt={c.name} style={styles.deckCardImg} onError={(e) => { e.target.style.visibility = "hidden"; }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const stackContent = stack.map((key, i) => (
    <React.Fragment key={key}>
      {i > 0 && <div style={dividerStyle} />}
      {key === "profile" && profileBlock}
      {key === "deck" && deckGridEl(styles.deckGrid)}
      {key === "session" && sessionBlock}
    </React.Fragment>
  ));

  // Unsichtbare Messkopien für useMeasuredWidth (siehe ausführlichen Kommentar dort und an
  // styles.headerMeasure/dailyMeasure). Bewusst IMMER gerendert (headerProbe unabhängig von
  // showProfile, dailyProbe nur an showDaily gekoppelt wie die echte Zeile) — Position im Baum
  // ist egal, sie nehmen keinen Platz weg und zeigen nichts an.
  const headerProbe = (
    <div ref={headerRef} style={styles.headerMeasure}>
      <div style={styles.badgeWrap} />
      <div style={styles.headerText}>{headerTextInner}</div>
    </div>
  );
  const dailyProbe = showDaily ? <div ref={dailyRef} style={styles.dailyMeasure}>{dailyRowInner}</div> : null;

  if (sidebarSide) {
    const deckPane = <div style={styles.deckPane}>{deckGridEl(styles.deckGridSidebar)}</div>;
    const cardStyle = { ...styles.card, ...styles.cardRow, width: "auto", background: cardBackground, border: `1px solid ${cardBorderColor}` };
    // Steht neben dem Deck nur EIN Teil (Kopf ODER Session, nicht beide), mittig statt oben
    // ausrichten — sonst hängt es oben an der (durch das Deck vorgegebenen) Spaltenhöhe fest,
    // mit ungenutztem Platz darunter. Bei beiden Teilen bleibt es der normale Stapel von oben.
    const mainPaneStyle = { ...styles.mainPane, width: cardWidth, justifyContent: stack.length === 1 ? "center" : "flex-start" };
    return (
      <div style={styles.page}>
        {noIndex}
        {headerProbe}
        {dailyProbe}
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

  const cardStyle = { ...styles.card, width: cardWidth, background: cardBackground, border: `1px solid ${cardBorderColor}` };
  return (
    <div style={styles.page}>
      {noIndex}
      {headerProbe}
      {dailyProbe}
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

const styles = {
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
  // width kommt jetzt per Inline-Style aus der JS-Messung (siehe useMeasuredWidth) — hier nur
  // der Fallback-Rahmen, falls die Messung mal ausbleibt (z.B. Profilkopf ausgeblendet).
  card: {
    width: CARD_MIN_WIDTH,
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: "16px 18px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    color: "#fff",
  },
  // Deck seitlich: Karte wird zur Flex-Reihe statt zur Spalte, Kind-Spalten teilen sich per
  // alignItems:stretch automatisch dieselbe Höhe — kein JS-Messen für die Höhe nötig (die
  // Breite von mainPane kommt aber sehr wohl aus der Messung, per Inline-Style überschrieben).
  cardRow: { display: "flex", flexDirection: "row", alignItems: "stretch" },
  // display:flex/column, damit justifyContent (per Inline-Style gesetzt) greift: sind Kopf UND
  // Session sichtbar, bleibt es der normale Stapel von oben (flex-start); ist nur einer von
  // beiden da, zentriert ihn das mittig in der (vom Deck vorgegebenen) Spaltenhöhe.
  mainPane: { width: CARD_MIN_WIDTH, display: "flex", flexDirection: "column" },
  // Zentriert das (immer 4×2, fest breite) Deckgitter auf der Y-Achse in der ihm zugeteilten
  // Spaltenhöhe, statt es künstlich zu strecken/zuzuschneiden — "genau so hoch wie der Rest"
  // gilt für die SPALTE (per alignItems:stretch von cardRow), nicht fürs Gitter selbst.
  deckPane: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  vDivider: { width: 1, margin: "0 14px", alignSelf: "stretch" },
  // inline-flex statt flex: zieht sich auf seine eigene natürliche Breite zusammen. maxWidth:100%
  // ist ein Sicherheitsnetz für den Fall, dass ein extremer Name die Karte an ihre eigene
  // maxWidth-Grenze treibt: dann darf der Kopf selbst nicht breiter werden als die Karte das noch
  // zulässt (Ellipsis am Namen greift dann) — GENAU DESHALB liest useMeasuredWidth die Breite
  // NICHT mehr an diesem (sichtbaren, selbst-limitierenden) Element ab, sondern an headerMeasure
  // weiter unten: eine unsichtbare Kopie OHNE dieses maxWidth, die sich nicht selbst kleinrechnen
  // kann (siehe ausführlicher Kommentar an useMeasuredWidth).
  headerRow: { display: "inline-flex", alignItems: "center", gap: 14, maxWidth: "100%" },
  // Messkopie von headerRow: derselbe Aufbau, aber ohne maxWidth, aus dem Fluss genommen
  // (position:absolute) und unsichtbar (visibility:hidden) — nimmt keinen Platz weg und
  // beeinflusst nichts Sichtbares, whiteSpace:nowrap verhindert, dass sich der Name (oder die
  // Liga-Zeile) selbst kleinrechnet, indem er innerlich umbricht.
  headerMeasure: {
    display: "inline-flex", alignItems: "center", gap: 14,
    position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap",
    left: 0, top: 0,
  },
  badgeWrap: { width: 54, height: 54, flexShrink: 0 },
  badgeImg: { width: "100%", height: "100%", objectFit: "contain" },
  badgeFallback: {
    width: "100%", height: "100%", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  // Kein flex:1 mehr: headerText soll seine EIGENE natürliche Breite (Name/Stufe/Platzierung)
  // an die Karte weiterreichen, statt künstlich in einen von außen vorgegebenen Rest-Platz
  // gezwängt zu werden — genau das soll ja die Kartenbreite bestimmen (siehe styles.card).
  // minWidth:0 bleibt als Sicherheitsnetz: erlaubt Schrumpfen (+Ellipsis am Namen), falls ein
  // wirklich extremer Name gegen die maxWidth-Grenze der Karte läuft.
  headerText: { minWidth: 0 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: {
    fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  // whiteSpace:nowrap (vererbt an leagueLabel & co.) verhindert, dass z.B. "League 4" am
  // Leerzeichen umbricht, wenn die Zeile mal knapp ist — "Liga 4" (DE) ist kürzer und passte
  // meist zufällig noch, "League 4" (EN) nicht immer.
  trophyRow: { display: "flex", alignItems: "center", gap: 7, marginTop: 5, whiteSpace: "nowrap" },
  // Das Medaillen-Bild ist hochformatig (Bandende unten) statt quadratisch wie das Trophy-Icon —
  // in eine 18x18-Box gezwängt (wie zuvor) wirkte die Medaille selbst dadurch kleiner als die
  // Schrift daneben. Höhe statt fester Box vorgeben, Breite folgt automatisch im Seitenverhältnis.
  valueIcon: { height: 24, width: "auto", objectFit: "contain" },
  trophyValue: { fontSize: 25, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
  rankInline: {
    fontSize: 14, fontWeight: 800, color: "#c4b5fd", background: "rgba(167,139,250,0.16)",
    border: "1px solid rgba(167,139,250,0.45)", borderRadius: 7, padding: "2px 8px",
    fontVariantNumeric: "tabular-nums",
  },
  leagueLabel: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 2 },
  stepMax: { fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.45)", marginLeft: -5, fontVariantNumeric: "tabular-nums" },
  // Feste Höhe (6px, wie pipFilled/pipEmpty) + der frühere marginTop der Pip-Reihe selbst — jetzt
  // am WRAPPER statt an pipRow, damit der Abstand auch ohne Inhalt (nicht im Ladder-Modus) steht.
  // Siehe Kommentar an der Verwendungsstelle (profileBlock) für das "Warum" der festen Höhe.
  pipRowSlot: { marginTop: 12, height: 6 },
  pipRow: { display: "flex", gap: 3, height: "100%" },
  pipFilled: { flex: 1, height: 6, borderRadius: 2, background: "#fbbf24" },
  pipEmpty: { flex: 1, height: 6, borderRadius: 2, background: "rgba(255,255,255,0.12)" },
  profitUnit: { fontSize: 12, fontWeight: 700, opacity: 0.75, marginLeft: 1 },
  // Feste Höhe (Zeilenhöhe bei fontSize 10) statt content-abhängig — steht immer im Layout, nur
  // Trophäen-/2v2-Ranked-Accounts füllen sie mit Text (siehe profileBlock).
  bestRowSlot: { fontSize: 13, lineHeight: "15px", height: 15, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  divider: { height: 1, margin: "12px 0" },
  // Im Stapel: width:100% füllt die von der Kopf-Messung vorgegebene (feste, per Inline-Style
  // gesetzte) Kartenbreite. maxWidth deckelt das zusätzlich nach oben (bei einem sehr breiten
  // Namen sollen die Kartenbilder nicht riesig werden) — margin:auto zentriert das Gitter dann
  // in der breiteren Karte statt es linksbündig abzuschneiden.
  deckGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, width: "100%", maxWidth: 320, margin: "0 auto" },
  // Seitlich (deckPane) hat KEINEN Kopf neben sich, der eine Breite vorgeben könnte — eigene
  // feste Breite nötig, sonst kollabiert das Gitter (Prozentbreite eines Elternelements ohne
  // eigene definierte Breite wird als 0 aufgelöst).
  deckGridSidebar: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, width: 288 },
  // Kein eigener Rahmen: die Kartenbilder von RoyaleAPI bringen ihre seltenheitsfarbene
  // Umrandung schon mit.
  deckCard: {
    position: "relative", aspectRatio: "150 / 172", borderRadius: 7, overflow: "hidden",
    background: "rgba(0,0,0,0.35)", lineHeight: 0,
  },
  deckCardImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  // Session: Profit-Zeile und letzte-5-Zeile eng beieinander (ein kleiner Abstand statt einer
  // Trennlinie zwischen den beiden) — sie gehören jetzt zu genau einem Modul.
  sessionBlock: { display: "flex", flexDirection: "column", gap: 8 },
  // space-between hält Win-Rate % weiterhin rechtsbündig (wie gewünscht) — gap setzt dabei
  // nur den MINDESTABSTAND zwischen Profit und Win/Loss-Zahlen; die Lücke selbst schrumpft mit,
  // weil die Karte jetzt insgesamt schmaler ist (Breite kommt vom Profilkopf, nicht mehr fix 340).
  dailyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  // Messkopie von dailyRow: derselbe Aufbau (display/gap/alignItems), aber flexWrap:"nowrap"
  // statt "wrap" — kann sich also nicht durch Umbrechen kleinrechnen — plus dieselbe unsichtbare/
  // aus-dem-Fluss-genommene Behandlung wie headerMeasure oben.
  dailyMeasure: {
    display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", justifyContent: "flex-start",
    position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap",
    left: 0, top: 0,
  },
  dailyLeft: { display: "flex", alignItems: "center", gap: 8 },
  dailyRight: { display: "flex", alignItems: "center", gap: 8 },
  profitValue: { display: "flex", alignItems: "center", gap: 4, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlNumbers: { fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlPct: {
    fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px",
  },
  // Immer 5 Spalten (nicht flex:1 über die tatsächliche Anzahl) — bei weniger als 5 Spielen
  // (junge Session) bleiben die Blasen genau so groß, wie sie mit allen 5 wären, statt sich
  // aufzublähen; der Rest der Zeile bleibt sichtbar leer, als Platz für die noch kommenden Spiele.
  last5Row: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 },
  // Dieselben 5 Spalten wie last5Row (nicht als eigenes Layout, sondern exakt spiegelbildlich),
  // damit gridColumnStart am Badge-Span wirklich unter der richtigen Blase landet. marginTop
  // statt marginBottom: sitzt jetzt UNTER der Reihe statt darüber.
  last5BadgeRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", marginTop: 3 },
  last5Badge: {
    justifySelf: "center", fontSize: 8, fontWeight: 800, letterSpacing: "0.05em",
    color: "#fbbf24", whiteSpace: "nowrap",
  },
  // Richtungshinweis unter den Punkten (kein festes Raster dort, siehe dotRow) — grob an die
  // richtige Seite ausgerichtet statt exakt unter einem Punkt.
  last5Caption: {
    display: "flex", marginTop: 3, fontSize: 8, fontWeight: 800, letterSpacing: "0.05em",
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
