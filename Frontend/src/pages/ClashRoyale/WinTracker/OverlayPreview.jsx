// OverlayPreview.jsx — Interaktive Live-Vorschau im Overlay-Designer: rendert die Karte exakt
// wie WinTrackerOverlayPage.jsx (gleiche styles, gleiche Bedingungen, gleiche Stapel-/Seiten-
// Logik für die Deck-Platzierung). Jedes Teil (Profilkopf, Session, Deck) trägt ein Auge-Symbol
// zum direkten Ein-/Ausblenden; die Reihenfolge selbst kommt nur noch aus den Einstellungen
// (deckPlacement) — nichts mehr zum Ziehen, seit Session und letzte-5-Spiele zu einem Modul
// verschmolzen sind, bleibt nur die Deck-Platzierung als echte Wahl übrig, dafür gibt es die
// Pillen unten in der Liste (SettingsTab), nicht Drag & Drop hier.
//
// Datenquelle: dieselbe öffentliche Overlay-Route wie das echte Overlay (getOverlayData) — damit
// zeigt die Vorschau echte, aktuelle Werte des aktiven Accounts. Ohne Account/Daten (z.B. frisch
// registriert) springt sie auf Beispieldaten, damit man das Layout trotzdem schon gestalten kann.
//
// BREITE der Karte: kommt aus einer echten JS-Messung des Profilkopfs (useMeasuredWidth), nicht
// aus CSS allein — siehe die ausführliche Begründung in WinTrackerOverlayPage.jsx (dieselbe
// Technik, 1:1 übernommen für Pixel-Parität zwischen echtem Overlay und Vorschau).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, ChevronsUp, Eye, EyeOff } from "lucide-react";
import { leagueIconUrl, leagueName, MEDAL_ICON_URL } from "../data/leagueIcons";
import { trophyArenaIcon, trophyArenaName } from "../data/trophyArenas";
import { cardImageUrl } from "../data/cards";
import { useClanBadgeUrl } from "../data/clanBadges";
import { getOverlayData } from "./winTrackerApi";
import { usePagedTransition, SLIDE_MS } from "./usePagedTransition";
import { dictForWt } from "./wtI18n";
import trophyIcon from "../../../assets/clashRoyale/ui/trophy.png";
import trophy2v2Icon from "../../../assets/clashRoyale/ui/trophy2v2.webp";
import league2v2Badge from "../../../assets/clashRoyale/ui/league2v2.png";

const CARD_MIN_WIDTH = 260;
// Kleiner als im echten Overlay (dort 480, siehe WinTrackerOverlayPage.jsx) — die Vorschau hier
// ist nur zum Entwerfen da, nicht pixelgenau mit der in OBS eingestellten Browserquellen-Größe
// verbunden. Kleiner heißt: mehr vom restlichen Editor bleibt gleichzeitig sichtbar.
const CARD_MAX_WIDTH = 360;
// Zahlenformat folgt der Editor-Sprache (settings.language) — siehe WinTrackerOverlayPage.jsx.
const fmt = (n, lang) => (n || 0).toLocaleString(lang === "en" ? "en-US" : "de-DE");

// Misst die WAHRE, ungebremste Wunschbreite von Kopf und Session-Tageszeile und liefert die
// GRÖSSERE der beiden zurück — siehe ausführlichen Kommentar an derselben Stelle in
// WinTrackerOverlayPage.jsx (1:1 übernommen für Pixel-Parität). Kurzfassung: die refs zeigen auf
// unsichtbare Messkopien (headerMeasure/dailyMeasure), NICHT auf die sichtbaren Elemente — die
// sichtbaren haben absichtlich ein maxWidth-Sicherheitsnetz (headerRow) bzw. flexWrap (dailyRow),
// beides würde die Messung an der aktuellen (ggf. noch zu schmalen) Kartenbreite selbst verfälschen.
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

// Misst die Höhe jedes einzelnen Stapel-Teils — 1:1 aus WinTrackerOverlayPage.jsx übernommen
// (siehe dort für die ausführliche Begründung), für dieselbe Paginierungs-Vorschau hier: sonst
// zeigte die Vorschau die Paginierung gar nicht erst an, obwohl sie in den Einstellungen bereits
// aktiv war (Nutzer-Feedback).
function useBlockHeights() {
  const profileRef = useRef(null);
  const deckRef = useRef(null);
  const sessionRef = useRef(null);
  const raw = useRef({ profile: 0, deck: 0, session: 0 });
  const [heights, setHeights] = useState({ profile: 0, deck: 0, session: 0 });

  useLayoutEffect(() => {
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

function hexToRgba(hex, opacityPct) {
  const h = String(hex || "#0c0c12").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct ?? 88)) / 100})`;
}

// Beispieldaten für Accounts ohne (genug) echte Daten — bewusst ein bunter Mix (Evo, Hero, Rang,
// alle Teile gefüllt), damit man am Layout arbeiten kann, ohne erst Spiele zu sammeln.
const DEMO_DATA = {
  hasAccount: true,
  playerName: "DeinName",
  // Ranked ist die feste Vorgabe für neue Accounts (keine globale Voreinstellung mehr) — die
  // Demo spiegelt das.
  trackMode: "medals",
  trophies: 6821, bestTrophies: 7104, seasonMedals: 1180, leagueNumber: 7, polRank: 214,
  clanName: "Deine Crew", clanBadgeId: 16000170,
  ladder: null,
  daily: { profit: 42, wins: 9, losses: 4, winPct: 69 },
  last5: [
    { result: "win", trophyChange: 31 },
    { result: "win", trophyChange: 28 },
    { result: "loss", trophyChange: -24 },
    { result: "win", trophyChange: 33 },
    { result: "draw", trophyChange: 0 },
  ],
  deck: {
    mode: "ranked",
    cards: [
      { id: "knight", name: "Knight", level: 14, variant: "ev1" },
      { id: "fireball", name: "Fireball", level: 13, variant: null },
      { id: "hog-rider", name: "Hog Rider", level: 14, variant: null },
      { id: "musketeer", name: "Musketeer", level: 13, variant: null },
      { id: "skeletons", name: "Skeletons", level: 14, variant: null },
      { id: "zap", name: "Zap", level: 12, variant: null },
      { id: "giant", name: "Giant", level: 12, variant: "hero" },
      { id: "mini-pekka", name: "Mini P.E.K.K.A", level: 13, variant: null },
    ],
  },
};

const RESULT_LABEL = { win: "Win", loss: "Lose", draw: "Draw" };
// Stufen-Änderung für die "+/-"-Darstellung in Liga 1-6 (dort ist trophy_change immer 0).
const STEP_DELTA = { win: "+1", loss: "-1", draw: "0" };
const RESULT_COLOR = {
  win: { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.55)", text: "#4ade80" },
  loss: { bg: "rgba(239,68,68,0.16)", border: "rgba(239,68,68,0.55)", text: "#f87171" },
  draw: { bg: "rgba(148,163,184,0.16)", border: "rgba(148,163,184,0.5)", text: "#cbd5e1" },
};

// Auge-Knopf — dieselbe Fläche/Farbsprache für die Vorschau UND die Liste darunter (siehe
// VisibilityButton in WinTrackerPage.jsx). Sitzt in einer eigenen schmalen Zeile OBERHALB jedes
// Teils, die für alle drei (Profilkopf, Deck, Session) gleichermaßen Platz reserviert, egal wie
// deren Inhalt aussieht — nie absolut ÜBER dem Inhalt, das würde ihn verdecken.
function VisibilityButton({ visible, onClick, t }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={visible ? t.eyeHide : t.eyeShow}
      style={{
        width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, cursor: "pointer",
        border: `1px solid ${visible ? "rgba(255,255,255,0.15)" : "rgba(167,139,250,0.55)"}`,
        background: visible ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.35)",
        color: visible ? "rgba(255,255,255,0.5)" : "#c4b5fd",
      }}>
      {visible ? <Eye size={11} /> : <EyeOff size={11} />}
    </button>
  );
}

// Reine Funktion statt Inline-Logik in der Komponente — hängt nur von Props (settings,
// moduleVisibility) ab, ist also (anders als bei WinTrackerOverlayPage.jsx, wo echte Account-
// Daten erst asynchron laden) schon beim allerersten Render vollständig berechenbar, kein
// data?.-Sicherheitsnetz nötig. stackKeys/sidebarSide: IMMER alle drei Teile (fürs Entwerfen,
// abgedunkelt statt versteckt, siehe Toggleable). activeStackKeys: NUR die echt sichtbaren —
// genau das, was das echte Overlay auch zeigen würde, für die Paginierungs-Vorschau gebraucht.
function computeStacks(settings, moduleVisibility) {
  const deckPlacement = settings.deckPlacement || "top";
  const stack = [];
  stack.push("profile");
  if (deckPlacement === "top") stack.push("deck");
  stack.push("session");
  if (deckPlacement === "bottom") stack.push("deck");
  const sidebarSide = (deckPlacement === "left" || deckPlacement === "right") ? deckPlacement : null;
  const stackKeys = sidebarSide ? stack.filter((k) => k !== "deck") : stack;
  const showProfile = settings.showProfile !== false;
  const activeStackKeys = stackKeys.filter((k) =>
    k === "profile" ? showProfile : k === "deck" ? moduleVisibility.deck : moduleVisibility.session);
  return { stackKeys, sidebarSide, activeStackKeys };
}

// ── Hülle um ein Teil: abgedunkelt wenn ausgeblendet, eigene Kopfzeile mit dem Auge-Knopf
// rechtsbündig darüber. Nicht mehr ziehbar (siehe Datei-Kommentar oben) — nur noch Sichtbarkeit.
function Toggleable({ visible, onToggleVisible, t, children }) {
  return (
    <div style={{ opacity: visible ? 1 : 0.4, transition: "opacity .15s ease" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 5 }}>
        <VisibilityButton visible={visible} onClick={onToggleVisible} t={t} />
      </div>
      {children}
    </div>
  );
}

export default function OverlayPreview({ settings, overlayKey, moduleVisibility, onToggleModule, onToggleProfile, refreshSignal }) {
  const [data, setData] = useState(null); // null = lädt noch
  const [headerRef, dailyRef, cardWidth] = useMeasuredWidth(CARD_MIN_WIDTH, CARD_MAX_WIDTH, CARD_MIN_WIDTH);
  const [heightRefs, blockHeights] = useBlockHeights();
  const paginate = !!settings.paginateOverlay;
  const paginateIntervalMs = Math.max(2, Number(settings.paginateIntervalS) || 6) * 1000;
  // Anders als bei WinTrackerOverlayPage.jsx: settings/moduleVisibility sind Props, also schon
  // beim ersten Render vollständig da — computeStacks braucht hier kein data?.-Sicherheitsnetz.
  const { stackKeys, sidebarSide, activeStackKeys } = computeStacks(settings, moduleVisibility);
  const { index: pageIndex, offsetPct, transitionOn } =
    usePagedTransition(activeStackKeys.length, paginateIntervalMs, paginate && activeStackKeys.length > 1);
  // Sprache kommt aus den (noch ungespeicherten) Editor-Einstellungen, nicht aus data.settings —
  // so wechselt die Vorschau sofort mit, sobald der Nutzer die Sprache umschaltet, statt erst
  // nach dem nächsten Speichern/Poll.
  const lang = settings.language === "en" ? "en" : "de";
  const t = dictForWt(lang);

  // refreshSignal: die Vorschau pollt NICHT von selbst (anders als das echte Overlay, siehe
  // WinTrackerOverlayPage.jsx) — ohne dieses zusätzliche Abhängigkeits-Signal würde sie nach
  // "!tracker mode"/dem Moduswechsel hier im Designer, einem Accountwechsel (Aktivieren) oder
  // einer Stufen-Korrektur weiter die ALTEN Daten zeigen, weil sich overlayKey dabei nie ändert.
  // Der Aufrufer (SettingsTab) übergibt hier einen kurzen String, der sich bei jeder dieser
  // Änderungen ändert (accountId+trackMode+ladderStep des aktiven Accounts).
  useEffect(() => {
    let alive = true;
    if (!overlayKey) { setData(DEMO_DATA); return undefined; }
    getOverlayData(overlayKey)
      .then((json) => { if (alive) setData(json && json.hasAccount ? json : DEMO_DATA); })
      .catch(() => { if (alive) setData(DEMO_DATA); });
    return () => { alive = false; };
  }, [overlayKey, refreshSignal]);

  // Wie oben: sicher auf data?. zurückgreifen, damit der Hook (React-Regel) auch vor dem ersten
  // Laden JEDES Mal gleich oft läuft.
  const clanBadgeImgUrl = useClanBadgeUrl(data?.clanBadgeId ?? null);

  if (!data) {
    return <div className="rounded-lg border border-white/10 bg-[#08080b] p-10 text-center text-gray-600 text-xs">{t.loadingPreview}</div>;
  }

  const isDemo = data === DEMO_DATA;
  const {
    playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, clanName,
    league2v2Trophies, league2v2BestTrophies, ladder, daily, last5, deck,
  } = data;
  // trackMode kommt vom aktiven Account selbst (data.settings, genau wie beim echten Overlay) —
  // es gibt keine globale Voreinstellung mehr dafür. In der Demo (kein data.settings) gilt
  // Ranked, wie bei jedem neu verknüpften Account.
  const trackMode = isDemo ? data.trackMode : data.settings?.trackMode;
  const isTrophyMode = trackMode === "trophies";
  const isLeague2v2 = trackMode === "2v2";
  // Trophäenmodus zeigt player.trophies (Lifetime-Trophäen) — das hat KEINE Liga, der
  // Ranked1v1-Liga-Orden wäre also irreführend, siehe ausführlicher Kommentar an derselben Stelle
  // in WinTrackerOverlayPage.jsx. Zeigt stattdessen die klassische Trophäenstraßen-Arena.
  const badgeUrl = isLeague2v2 ? league2v2Badge : isTrophyMode ? trophyArenaIcon(trophies) : leagueIconUrl(leagueNumber);
  const badgeAlt = isTrophyMode ? trophyArenaName(trophies) : leagueName(leagueNumber, lang);
  // Siehe Kommentar zu isLadderMode in WinTrackerOverlayPage.jsx — computeLadder läuft
  // serverseitig unabhängig vom trackMode, isLeague2v2 muss hier deshalb ausgeschlossen werden.
  const isLadderMode = !isTrophyMode && !isLeague2v2 && !!ladder;
  const mainValue = isLeague2v2 ? league2v2Trophies : isTrophyMode ? trophies : seasonMedals;
  const dailyValue = isLadderMode ? (ladder.sessionDelta || 0) : (daily?.profit || 0);
  const profitPositive = dailyValue >= 0;
  const last5Style = settings.last5Style || "result";
  const last5Direction = settings.last5Direction || "newestLeft";
  const showLast5NewBadge = settings.last5NewBadge !== false;
  const directionLabel = "NEWEST";
  const showProfile = settings.showProfile !== false;
  const opacityFrac = Math.max(0, Math.min(100, settings.bgOpacity ?? 88)) / 100;
  // Interne Trennlinien (zwischen Profilkopf/Session/Deck) bleiben IMMER die dezente, von
  // bgOpacity abgeleitete weiße Linie — die Rahmenfarbe unten gilt bewusst nur für den
  // äußeren Kartenrand, sonst wirkt eine kräftige eigene Farbe an jeder Trennlinie schnell
  // unruhig statt wie ein einzelner, bewusst gesetzter Akzent.
  const lineColor = `rgba(255,255,255,${(0.08 * opacityFrac).toFixed(3)})`;
  const dividerStyle = { ...styles.divider, background: lineColor };
  const vDividerStyle = { ...styles.vDivider, background: lineColor };
  // Eigene Rahmenfarbe: nie hauchdünn-unsichtbar wie die automatische Linie (min. 45% Deckkraft),
  // sonst wirkt eine bewusst gewählte Farbe bei niedriger Karten-Deckkraft wie "nichts passiert".
  const cardBorderColor = settings.borderColor
    ? hexToRgba(settings.borderColor, Math.max(45, settings.bgOpacity ?? 88))
    : lineColor;
  const cardBackground = settings.bgGradient
    ? `linear-gradient(135deg, ${hexToRgba(settings.bgColor, settings.bgOpacity)}, ${hexToRgba(settings.bgColor2, settings.bgOpacity)})`
    : hexToRgba(settings.bgColor, settings.bgOpacity);

  // Bei ausgeblendetem Session-Teil gibt es keine echten Unter-Flags (alle stehen auf false) —
  // für die Vorschau trotzdem repräsentativ alle zeigen, statt eine leere, nur abgedunkelte Box.
  // Ist der Teil sichtbar, gilt der echte, einzeln eingestellte Zustand.
  const sessionFlags = moduleVisibility.session
    ? { profit: settings.showDailyProfit, numbers: settings.showWinLossNumbers, percent: settings.showWinLossPercent, last5: settings.showLast5 }
    : { profit: true, numbers: true, percent: true, last5: true };

  // Echte (ggf. lückenhafte) Daten + Platzhalter statt komplettem Demo-Ersatz — genau wie im
  // echten Overlay (siehe last5Row/deckGridEl unten sowie der ausführliche Kommentar dazu in
  // WinTrackerOverlayPage.jsx): eine junge Session mit wenigen echten Spielen soll hier auch so
  // aussehen, nicht durch 5 erfundene Demo-Spiele ersetzt werden. Im echten Demo-Fall (kein
  // Account) IST last5 bereits DEMO_DATA.last5 (5 Einträge) — dieselbe Variable trägt beides.
  const games = last5 || [];
  // Reihenfolge kommt bereits fertig sortiert vom Backend (last5Direction wird dort angewendet)
  // — hier nur noch merken, an welchem ARRAY-INDEX das neueste Spiel steht.
  const newestIndex = games.length ? (last5Direction === "newestRight" ? games.length - 1 : 0) : -1;

  // stackKeys/sidebarSide/activeStackKeys kommen bereits von computeStacks() oben (vor dem ersten
  // Render berechnet, siehe dortiger Kommentar) — Auge-Knöpfe bleiben auf der gerade gezeigten
  // Seite trotzdem bedienbar (siehe stackContent weiter unten).
  const pagesActive = paginate && activeStackKeys.length > 1;
  const pageHeight = pagesActive ? Math.max(...activeStackKeys.map((k) => blockHeights[k] || 0)) : 0;

  // Inhalt von headerText — einmal definiert, ZWEIMAL verwendet: sichtbar im echten Kopf UND
  // (unverändert, gleiche Styles) in der unsichtbaren Messkopie weiter unten. Siehe ausführlichen
  // Kommentar an derselben Stelle in WinTrackerOverlayPage.jsx.
  const headerTextInner = (
    <>
      <div style={styles.nameRow}><span style={styles.name}>{playerName}</span></div>
      {/* Feste Höhe, siehe ausführlicher Kommentar in WinTrackerOverlayPage.jsx (dieselbe
          Technik, für Pixel-Parität zwischen Vorschau und echtem Overlay). */}
      {settings.showClan && (
        <div style={styles.clanRowSlot}>
          {clanName && (
            <div style={styles.clanRow}>
              {clanBadgeImgUrl && <img src={clanBadgeImgUrl} alt="" style={styles.clanBadgeImg} />}
              <span style={styles.clanName}>{clanName}</span>
            </div>
          )}
        </div>
      )}
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
      {/* Feste Höhe, siehe ausführlicher Kommentar in WinTrackerOverlayPage.jsx (dieselbe
          Technik, für Pixel-Parität zwischen Vorschau und echtem Overlay). */}
      <div style={styles.bestRowSlot}>
        {(isTrophyMode || isLeague2v2) && (
          <span>{t.bestLabel}: {fmt(isLeague2v2 ? league2v2BestTrophies : bestTrophies, lang)}</span>
        )}
      </div>
    </>
  );

  const profileBlock = (
    <Toggleable visible={showProfile} onToggleVisible={onToggleProfile} t={t}>
      <div style={styles.headerRow}>
        <div style={styles.badgeWrap}>
          {badgeUrl ? (
            <img src={badgeUrl} alt={badgeAlt} style={styles.badgeImg} />
          ) : (
            <div style={styles.badgeFallback}><Trophy size={26} color="#fbbf24" /></div>
          )}
        </div>
        <div style={styles.headerText}>{headerTextInner}</div>
      </div>
    </Toggleable>
  );

  // Inhalt der Tageszeile — wie headerTextInner oben: einmal definiert, im echten (umbrechbaren)
  // Block UND in der unsichtbaren (nicht umbrechbaren) Messkopie verwendet.
  const dailyRowInner = (
    <>
      <div style={styles.dailyLeft}>
        {sessionFlags.profit && (
          <span style={{ ...styles.profitValue, color: profitPositive ? "#4ade80" : "#f87171" }}>
            {profitPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {profitPositive ? "+" : ""}{fmt(dailyValue, lang)}
            {isLadderMode && <span style={styles.profitUnit}>{Math.abs(dailyValue) === 1 ? t.stepSingular : t.stepPlural}</span>}
          </span>
        )}
      </div>
      <div style={styles.dailyRight}>
        {sessionFlags.numbers && (
          <span style={styles.wlNumbers}>
            <span style={{ color: "#4ade80" }}>{daily.wins}W</span>
            {" – "}
            <span style={{ color: "#f87171" }}>{daily.losses}L</span>
          </span>
        )}
        {sessionFlags.percent && <span style={styles.wlPct}>{daily.winPct}%</span>}
      </div>
    </>
  );

  // Pillen um Profit-Zeile/letzte-5-Bereich — 1:1 aus WinTrackerOverlayPage.jsx (siehe dortiger
  // Kommentar, Pixel-Parität).
  const sessionBlock = (
    <Toggleable visible={moduleVisibility.session} onToggleVisible={() => onToggleModule("session")} t={t}>
      <div style={styles.sessionBlock}>
        {(sessionFlags.profit || sessionFlags.numbers || sessionFlags.percent) && (
          <div style={styles.dailyPill}>
            <div style={styles.dailyRow}>{dailyRowInner}</div>
          </div>
        )}
        {sessionFlags.last5 && (
          <div style={styles.last5Pill}>
          {last5Style === "dot" ? (
            <div>
              {/* Immer 5 Punkte, fehlende Spiele als gedimmter Platzhalter — siehe
                  WinTrackerOverlayPage.jsx für die ausführliche Begründung (Pixel-Parität). */}
              <div style={styles.dotRow}>
                {Array.from({ length: 5 }, (_, i) => {
                  const b = games[i];
                  if (!b) return <span key={i} style={styles.dotEmpty} />;
                  return <span key={i} style={i === newestIndex && showLast5NewBadge ? { ...styles.dot(b.result), ...styles.dotNewest } : styles.dot(b.result)} />;
                })}
              </div>
              {/* Zeile bleibt reserviert sobald showLast5NewBadge an ist, siehe ausführlicher
                  Kommentar in WinTrackerOverlayPage.jsx (Pixel-Parität). */}
              {showLast5NewBadge && (
                <div style={{ ...styles.last5Caption, justifyContent: last5Direction === "newestRight" ? "flex-end" : "flex-start" }}>
                  {newestIndex >= 0 ? directionLabel : " "}
                </div>
              )}
            </div>
          ) : (
            // EIN Wrapper statt zwei direkter Kinder des Session-Blocks: die NEUESTE-Zeile soll
            // eng an den Blasen kleben statt den vollen sessionBlock-Zeilenabstand zu bekommen.
            <div>
              {/* Immer 5 Blasen, fehlende Spiele als Platzhalter (siehe WinTrackerOverlayPage.jsx). */}
              <div style={styles.last5Row}>
                {Array.from({ length: 5 }, (_, i) => {
                  const b = games[i];
                  if (!b) return <div key={i} style={styles.matchPillEmpty}>{" "}</div>;
                  return (
                    <div key={i} style={styles.matchPill(b.result)}>
                      {/* 2v2 zeigt IMMER Win/Lose, unabhängig vom gewählten last5Style — siehe
                          ausführlicher Kommentar an derselben Stelle in WinTrackerOverlayPage.jsx. */}
                      {last5Style === "result" || isLeague2v2
                        ? (RESULT_LABEL[b.result] || RESULT_LABEL.draw)
                        // In den Stufen-Ligen ist trophy_change je Match immer 0 — die Zahl kommt
                        // dort aus dem Ergebnis selbst (Sieg = +1 Stufe, Niederlage = -1).
                        : isLadderMode
                          ? (STEP_DELTA[b.result] ?? "0")
                          : `${b.trophyChange > 0 ? "+" : ""}${b.trophyChange}`}
                    </div>
                  );
                })}
              </div>
              {/* Immer ein <span>, nur unsichtbar ohne echtes "neuestes" Spiel — ein Grid ohne
                  jedes Kind hätte sonst keine intrinsische Höhe. Siehe WinTrackerOverlayPage.jsx. */}
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
    </Toggleable>
  );

  // Immer 4×2 UND immer alle 8 Slots (auch ohne Deck-Daten) — siehe WinTrackerOverlayPage.jsx
  // für die ausführliche Begründung (Pixel-Parität, feste Größe egal welcher Modus/Account
  // gerade aktiv ist). Egal ob im Stapel oder seitlich angedockt. Im Stapel füllt das Gitter die
  // vom Profilkopf vorgegebene Breite (width:100%), seitlich hat es keinen Kopf neben sich und
  // braucht deshalb eine eigene feste Breite (deckGridSidebar); deckPane zentriert es dort
  // zusätzlich auf der Y-Achse statt es zu strecken/zuzuschneiden.
  const deckGridEl = (gridStyle) => (
    <div style={gridStyle}>
      {Array.from({ length: 8 }, (_, i) => {
        const c = deck?.cards?.[i];
        if (!c) return <div key={i} style={styles.deckCard} />;
        return (
          <div key={i} title={c.name} style={styles.deckCard}>
            {c.id ? <img src={cardImageUrl(c.id, c.variant)} alt={c.name} style={styles.deckCardImg} onError={(e) => { e.target.style.visibility = "hidden"; }} /> : null}
          </div>
        );
      })}
    </div>
  );
  const deckBlock = (gridStyle) => (
    <Toggleable visible={moduleVisibility.deck} onToggleVisible={() => onToggleModule("deck")} t={t}>
      {deckGridEl(gridStyle)}
    </Toggleable>
  );

  const renderStackBlock = (key) =>
    key === "profile" ? profileBlock : key === "deck" ? deckBlock(styles.deckGrid) : key === "session" ? sessionBlock : null;

  const stackContent = pagesActive ? (
    // Wie im echten Overlay: nur die aktive Seite, mittig in der fest reservierten pageHeight
    // (die größte aller sichtbaren Seiten) — kein Höhensprung beim Wechsel, plus dieselbe
    // Gleit-Animation (siehe usePagedTransition).
    <div style={{ ...styles.pageSlideOuter, height: pageHeight }}>
      <div style={{
        ...styles.pageSlideInner,
        transform: `translateX(${offsetPct}%)`,
        transition: transitionOn ? `transform ${SLIDE_MS}ms ease` : "none",
      }}>
        {renderStackBlock(activeStackKeys[pageIndex])}
      </div>
    </div>
  ) : (
    stackKeys.map((key, i) => (
      <React.Fragment key={key}>
        {i > 0 && <div style={dividerStyle} />}
        {renderStackBlock(key)}
      </React.Fragment>
    ))
  );

  // Unsichtbare Messkopien für useBlockHeights — nur nötig, solange pagesActive ist. width wie
  // beim echten Overlay: cardWidth minus Karten-Innenabstand (siehe pageProbe-Kommentar dort).
  const heightProbes = pagesActive ? (
    <>
      {activeStackKeys.includes("profile") && (
        <div ref={heightRefs.profile} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{profileBlock}</div>
      )}
      {activeStackKeys.includes("deck") && (
        <div ref={heightRefs.deck} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{deckBlock(styles.deckGrid)}</div>
      )}
      {activeStackKeys.includes("session") && (
        <div ref={heightRefs.session} style={{ ...styles.pageProbe, width: Math.max(0, cardWidth - 36) }}>{sessionBlock}</div>
      )}
    </>
  ) : null;

  const cardBase = { ...styles.card, background: cardBackground, border: `1px solid ${cardBorderColor}` };
  // Steht neben dem Deck nur EIN Teil (Kopf ODER Session, nicht beide), mittig statt oben
  // ausrichten — nach der ECHTEN Sichtbarkeit, nicht danach, ob es hier (abgedunkelt) noch im
  // DOM steht: beide Teile bleiben in der Vorschau immer sichtbar, damit man sie zurückschalten
  // kann (siehe Toggleable), auch wenn nur eins davon wirklich "an" ist. Bei aktiver Paginierung
  // gilt dieselbe Logik wie "nur ein Teil sichtbar" — es steht ja ohnehin nur eine Seite da.
  const visibleMainCount = (showProfile ? 1 : 0) + (moduleVisibility.session ? 1 : 0);
  const mainPaneStyle = { ...styles.mainPane, width: cardWidth, justifyContent: (pagesActive || visibleMainCount === 1) ? "center" : "flex-start" };

  // Unsichtbare Messkopien für useMeasuredWidth — siehe ausführlichen Kommentar an
  // useMeasuredWidth und styles.headerMeasure/dailyMeasure (1:1 aus WinTrackerOverlayPage.jsx).
  const headerProbe = (
    <div ref={headerRef} style={styles.headerMeasure}>
      <div style={styles.badgeWrap} />
      <div style={styles.headerText}>{headerTextInner}</div>
    </div>
  );
  const dailyProbe = (sessionFlags.profit || sessionFlags.numbers || sessionFlags.percent)
    ? <div ref={dailyRef} style={styles.dailyMeasure}>{dailyRowInner}</div>
    : null;

  return (
    <div>
      {isDemo && (
        <p className="text-[11px] text-gray-600 mb-2">
          {t.demoDataHint}
        </p>
      )}
      <div className="relative rounded-lg border border-white/10 bg-[#08080b] p-5 flex justify-center overflow-x-auto">
        {headerProbe}
        {dailyProbe}
        {heightProbes}
        {sidebarSide ? (
          <div style={{ ...cardBase, ...styles.cardRow, width: "auto" }}>
            {sidebarSide === "left" && <div style={styles.deckPane}>{deckBlock(styles.deckGridSidebar)}</div>}
            {sidebarSide === "left" && <div style={vDividerStyle} />}
            <div style={mainPaneStyle}>{stackContent}</div>
            {sidebarSide === "right" && <div style={vDividerStyle} />}
            {sidebarSide === "right" && <div style={styles.deckPane}>{deckBlock(styles.deckGridSidebar)}</div>}
          </div>
        ) : (
          <div style={{ ...cardBase, width: cardWidth }}>{stackContent}</div>
        )}
      </div>
    </div>
  );
}

// 1:1 aus WinTrackerOverlayPage.jsx übernommen (siehe dort für Details) — für Pixel-Parität
// zwischen echtem Overlay und Vorschau bewusst dieselben Werte, nicht Tailwind.
const styles = {
  // width kommt per Inline-Style aus der JS-Messung (cardWidth) — hier nur der Fallback-Rahmen.
  // Details siehe WinTrackerOverlayPage.jsx (styles.card).
  card: {
    width: CARD_MIN_WIDTH,
    backdropFilter: "blur(10px)", borderRadius: 16, padding: "16px 18px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)", color: "#fff",
  },
  cardRow: { display: "flex", flexDirection: "row", alignItems: "stretch" },
  // display:flex/column, damit justifyContent (per Inline-Style gesetzt) greift — siehe
  // visibleMainCount weiter oben.
  mainPane: { width: CARD_MIN_WIDTH, display: "flex", flexDirection: "column" },
  // Zentriert das (immer 4×2, fest breite) Deckgitter auf der Y-Achse in seiner Spalte.
  deckPane: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  vDivider: { width: 1, margin: "0 14px", alignSelf: "stretch" },
  // inline-flex statt flex: zieht sich auf die eigene natürliche Breite zusammen. maxWidth:100%
  // als Sicherheitsnetz gegen extreme Namen — GENAU DESHALB liest useMeasuredWidth die Breite
  // nicht mehr hier ab, sondern an headerMeasure unten (siehe ausführlicher Kommentar an
  // useMeasuredWidth und an derselben Stelle in WinTrackerOverlayPage.jsx).
  headerRow: { display: "inline-flex", alignItems: "center", gap: 14, maxWidth: "100%" },
  // padding: "0 18px" + border: "1px solid transparent" — dieselben 18px links/rechts wie
  // styles.card.padding ("16px 18px") PLUS der 1px-Kartenrahmen, siehe ausführlicher Kommentar an
  // derselben Stelle in WinTrackerOverlayPage.jsx: ohne beides bekam der Kopf am Ende 38px
  // weniger Platz als gemessen (globales box-sizing:border-box zieht beides von der width ab),
  // unabhängig von CARD_MAX_WIDTH.
  headerMeasure: {
    display: "inline-flex", alignItems: "center", gap: 14, padding: "0 18px", border: "1px solid transparent",
    position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap",
    left: 0, top: 0,
  },
  // Messkopie für useBlockHeights (Paginierungs-Vorschau) — 1:1 aus WinTrackerOverlayPage.jsx
  // (siehe dortiger Kommentar zum weit-negativen left/top statt bloßem visibility:hidden).
  pageProbe: {
    position: "absolute", visibility: "hidden", pointerEvents: "none",
    left: -99999, top: -99999, boxSizing: "border-box",
  },
  // 1:1 aus WinTrackerOverlayPage.jsx (siehe dortiger Kommentar) — Rahmen für die
  // Seitenwechsel-Animation.
  pageSlideOuter: { overflow: "hidden", width: "100%" },
  pageSlideInner: { display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", willChange: "transform" },
  badgeWrap: { width: 54, height: 54, flexShrink: 0 },
  badgeImg: { width: "100%", height: "100%", objectFit: "contain" },
  badgeFallback: {
    width: "100%", height: "100%", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  // Kein flex:1: headerText gibt seine eigene natürliche Breite an die Karte weiter, statt in
  // einen von außen vorgegebenen Rest-Platz gezwängt zu werden — das soll die Kartenbreite
  // bestimmen. minWidth:0 bleibt als Sicherheitsnetz (Ellipsis bei extrem langem Namen).
  headerText: { minWidth: 0 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 18, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  // whiteSpace:nowrap (vererbt an leagueLabel & co.) verhindert, dass z.B. "League 4" am
  // Leerzeichen umbricht, wenn die Zeile mal knapp ist — siehe WinTrackerOverlayPage.jsx.
  trophyRow: { display: "flex", alignItems: "center", gap: 7, marginTop: 5, whiteSpace: "nowrap" },
  valueIcon: { height: 24, width: "auto", objectFit: "contain" },
  trophyValue: { fontSize: 25, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" },
  rankInline: {
    fontSize: 14, fontWeight: 800, color: "#c4b5fd", background: "rgba(167,139,250,0.16)",
    border: "1px solid rgba(167,139,250,0.45)", borderRadius: 7, padding: "2px 8px",
    fontVariantNumeric: "tabular-nums",
  },
  leagueLabel: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 2 },
  stepMax: { fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.45)", marginLeft: -5, fontVariantNumeric: "tabular-nums" },
  // Feste Höhe statt content-abhängig, siehe WinTrackerOverlayPage.jsx (dieselbe Technik).
  clanRowSlot: { marginTop: 4, height: 18 },
  clanRow: { display: "flex", alignItems: "center", gap: 5, height: "100%" },
  clanBadgeImg: { width: 16, height: 16, objectFit: "contain", flexShrink: 0 },
  clanName: {
    fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  profitUnit: { fontSize: 12, fontWeight: 700, opacity: 0.75, marginLeft: 1 },
  bestRowSlot: { fontSize: 13, lineHeight: "15px", height: 15, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  divider: { height: 1, margin: "12px 0" },
  // Im Stapel: width:100% füllt die von der Kopf-Messung vorgegebene (feste) Kartenbreite.
  // maxWidth deckelt das zusätzlich nach oben (ein sehr breiter Name soll die Kartenbilder
  // nicht riesig werden lassen), margin:auto zentriert es dann in der breiteren Karte. Seitlich
  // (deckGridSidebar) hat es keinen Kopf neben sich, der eine Breite vorgeben könnte — eigene
  // feste Breite nötig, sonst kollabiert das Gitter.
  deckGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, width: "100%", maxWidth: 320, margin: "0 auto" },
  deckGridSidebar: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, width: 288 },
  deckCard: { position: "relative", aspectRatio: "150 / 172", borderRadius: 7, overflow: "hidden", background: "rgba(0,0,0,0.35)", lineHeight: 0 },
  deckCardImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  sessionBlock: { display: "flex", flexDirection: "column", gap: 4 },
  // 1:1 aus WinTrackerOverlayPage.jsx (siehe dortiger Kommentar für die genaue Pixel-Rechnung,
  // Pixel-Parität) — boxShadow statt border: kein Einfluss auf die Layout-Größe.
  dailyPill: {
    boxShadow: "0 0 0 1px rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)",
    borderRadius: 10, padding: "2px 10px",
  },
  last5Pill: {
    boxShadow: "0 0 0 1px rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.022)",
    borderRadius: 10, padding: "2px 8px 1px",
  },
  // space-between hält Win-Rate % rechtsbündig; gap setzt nur den Mindestabstand — die Lücke
  // selbst schrumpft mit der jetzt vom Profilkopf (nicht mehr fix 340) bestimmten Kartenbreite.
  dailyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  // padding: "0 28px" = 18px Kartenpadding PLUS 10px dailyPill-Padding — siehe ausführlicher
  // Kommentar an derselben Stelle in WinTrackerOverlayPage.jsx (Pixel-Parität).
  dailyMeasure: {
    display: "flex", alignItems: "center", gap: 16, flexWrap: "nowrap", justifyContent: "flex-start",
    padding: "0 28px", border: "1px solid transparent",
    position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap",
    left: 0, top: 0,
  },
  dailyLeft: { display: "flex", alignItems: "center", gap: 8 },
  dailyRight: { display: "flex", alignItems: "center", gap: 8 },
  profitValue: { display: "flex", alignItems: "center", gap: 4, fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlNumbers: { fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" },
  wlPct: { fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px" },
  // Immer 5 Spalten (nicht flex:1 über die tatsächliche Anzahl) — bei weniger als 5 Spielen
  // bleiben die Blasen so groß, wie sie mit allen 5 wären, statt sich aufzublähen.
  last5Row: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 },
  // Dieselben 5 Spalten wie last5Row, damit gridColumnStart am Badge exakt unter der richtigen
  // Blase landet. marginTop statt marginBottom: sitzt UNTER der Reihe.
  last5BadgeRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", marginTop: 0 },
  last5Badge: { justifySelf: "center", fontSize: 8, fontWeight: 800, letterSpacing: "0.05em", color: "#fbbf24", whiteSpace: "nowrap" },
  // Richtungshinweis unter den Punkten (kein festes Raster dort, siehe dotRow).
  last5Caption: { display: "flex", marginTop: 0, fontSize: 8, fontWeight: 800, letterSpacing: "0.05em", color: "#fbbf24" },
  matchPill: (result) => ({
    textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    background: (RESULT_COLOR[result] || RESULT_COLOR.draw).bg,
    border: `1px solid ${(RESULT_COLOR[result] || RESULT_COLOR.draw).border}`,
    color: (RESULT_COLOR[result] || RESULT_COLOR.draw).text,
  }),
  matchPillEmpty: {
    padding: "6px 0", borderRadius: 8, textAlign: "center", fontSize: 12, fontWeight: 800,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
  },
  dotRow: { display: "flex", gap: 6, alignItems: "center", justifyContent: "center" },
  dotEmpty: { width: 9, height: 9, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)" },
  dot: (result) => ({ width: 9, height: 9, borderRadius: "50%", background: (RESULT_COLOR[result] || RESULT_COLOR.draw).text }),
  // outline statt box-shadow: kein Glow, keine Layoutverschiebung (liegt außerhalb der Box).
  dotNewest: { outline: "1.5px solid rgba(255,255,255,0.75)", outlineOffset: 1.5 },
};
