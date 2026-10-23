// overlayParts.jsx — Bausteine, die das OBS-Overlay und die Editor-Vorschau gemeinsam nutzen.
// Beides muss pixelgleich aussehen; zwei getrennte Kopien sind vorher bereits
// auseinandergelaufen (z. B. die Größe des Zählers).
//
// Alle Bausteine bekommen `st`, das Ergebnis von resolveOverlayStyle(). Welche Form
// das Overlay hat, entscheidet `st.layout` (siehe OVERLAY_LAYOUTS in overlayUtils.js):
// OverlayFrame baut Kopf, Timer und Seitenanzeige um die Zeilen herum, OverlayRow
// zeichnet die einzelne Challenge passend dazu.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pin, Check, Play, Pause } from "lucide-react";
import {
  OVERLAY_FONT,
  hexToRgba,
  isItemDone,
  itemIconUrl,
  msToClock,
  overlayTextShadow,
  readableOn,
} from "./overlayUtils";

const DONE_GREEN = "#2ecc71";

const BLOCK_SHADOW = "0 8px 24px rgba(0,0,0,.35)";

// Kurze Rückmeldung, wenn sich im Stream etwas tut: die Zeile blitzt beim Abhaken
// in der Akzentfarbe auf, eine geänderte Zahl leuchtet kurz. Die Akzentfarbe kommt
// als CSS-Variable vom Rahmen (OverlayFrame).
const OVERLAY_KEYFRAMES = `
@keyframes wcFlash { from { opacity: .6; } to { opacity: 0; } }
@keyframes wcCount { from { color: var(--wc-accent); } }
@keyframes wcTicker { to { transform: translateX(calc(-1 * var(--wc-shift))); } }
`;

/**
 * Zählt hoch, sobald sich `value` ändert. Als `key` gesetzt startet das die
 * CSS-Animation neu. Beim ersten Zeichnen bleibt es 0 — dann blitzt nichts,
 * auch nicht beim Seitenwechsel (die Zeilen werden dabei neu eingehängt).
 */
function useChangeTick(value) {
  const [tick, setTick] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setTick((n) => n + 1);
    }
  }, [value]);
  return tick;
}

/**
 * Laufband der Leiste: die Challenges ziehen endlos von rechts nach links durch,
 * wie der Nachrichten-Ticker am unteren Bildrand. Der Inhalt wird so oft
 * hintereinandergehängt, dass der Ausschnitt immer gefüllt ist; verschoben wird
 * genau um die Breite einer Kopie — der Sprung zurück an den Anfang ist deshalb
 * nicht zu sehen. `speed` in Pixeln pro Sekunde.
 */
function Ticker({ speed, children }) {
  const wrapRef = useRef(null);
  const oneRef = useRef(null);
  const [m, setM] = useState({ one: 0, copies: 2 });

  useLayoutEffect(() => {
    const measure = () => {
      const one = oneRef.current?.offsetWidth || 0;
      const wrap = wrapRef.current?.offsetWidth || 0;
      if (!one) return;
      const copies = Math.max(2, Math.ceil(wrap / one) + 1);
      setM((p) => (p.one === one && p.copies === copies ? p : { one, copies }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    if (oneRef.current) ro.observe(oneRef.current);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const duration = m.one > 0 ? m.one / Math.max(5, Number(speed) || 30) : 0;
  const copy = { display: "flex", alignItems: "stretch", flexShrink: 0 };
  return (
    <div ref={wrapRef} style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", display: "flex" }}>
      <div
        style={{
          ...copy,
          willChange: "transform",
          "--wc-shift": `${m.one}px`,
          animation: duration ? `wcTicker ${duration}s linear infinite` : undefined,
        }}
      >
        {Array.from({ length: m.copies }).map((_, i) => (
          <div key={i} ref={i === 0 ? oneRef : undefined} aria-hidden={i > 0 ? "true" : undefined} style={copy}>
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Deckende Farbschicht hinter dem Inhalt — so färbt die Deckkraft den Text nicht mit. */
function Fill({ color, opacity }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: color,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
}

/** „3 / 7“ — der aktuelle Stand fett, das Ziel gedämpft. */
function CounterText({ value, total }) {
  return (
    <>
      <span style={{ fontWeight: 700 }}>{value}</span>
      <span style={{ opacity: 0.6 }}> / {total}</span>
    </>
  );
}

/**
 * Rahmen um eine Zahl. Dieselbe Marke steht bei den Zeilen und im Header, damit
 * beide Orte gleich aussehen, wenn „Box“ gewählt ist. `fill` ist die Farbe der
 * (blassen) Füllung — die Deckkraft dafür kommt vom Zähler-Regler.
 */
function CounterBox({ st, fill, fontSize, children }) {
  return (
    <span
      style={{
        position: "relative",
        padding: "1px 8px",
        borderRadius: st.badgeRadius,
        border: `1px solid ${hexToRgba(st.accent || "#9146FF", 0.5)}`,
        fontSize,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Eigene Füllung, damit die Zähler-Deckkraft die Zahlen nicht mitfärbt.
          Gefüllt wird mit der Bandfarbe, nicht mit Weiß: sonst wird der Text
          bei hoher Deckkraft unlesbar. */}
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: fill,
          opacity: st.counterAlpha,
          pointerEvents: "none",
        }}
      />
      <span style={{ position: "relative" }}>{children}</span>
    </span>
  );
}

/**
 * Spielcover vor dem Namen (Twitch-Boxart, hochkant 3:4). Ergänzt den Namen, ersetzt
 * ihn nicht. Die Größe hängt an der Schriftgröße der Zeile und steht von Anfang an
 * fest — beim Laden des Bildes springt nichts.
 *
 * Das Cover ist höher als eine Textzeile, darf die Zeile aber nicht höher machen:
 * sonst wären Zeilen mit Cover höher als Zeilen ohne, und die Laufschrift rechnet
 * mit gleich hohen Zeilen. Der negative Rand lässt es deshalb nur 1em Höhe
 * beanspruchen; der Rest ragt in den Innenabstand der Zeile.
 *
 * Ohne `url` bleibt nur der Platz stehen (siehe `iconSlot` bei OverlayRow).
 */
function ItemCover({ url, st, dim }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        flexShrink: 0,
        width: "1.35em",
        height: "1.8em",
        margin: "-0.4em 0",
        borderRadius: st.badgeRadius,
        overflow: "hidden",
        // Sichtbar, solange das Bild lädt oder falls es fehlt
        background: url ? hexToRgba(st.textColor, 0.1) : undefined,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {url && !broken && (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

/**
 * Titelband des Stils „Klassisch“, auf Wunsch mit Gesamtfortschritt („Zahl“ oder in
 * der Box wie bei den Zeilen). Der Platz dafür ist immer für den größten möglichen
 * Stand („7 / 7“) reserviert: ein langer Titel bricht deshalb von Anfang an so um,
 * als wäre die Zahl schon da, und springt nicht, wenn sich die Zahl ändert.
 */
export function OverlayHeader({ title, st, progress }) {
  const center = st.titleAlign === "center";
  const showCount =
    !!progress && progress.total > 0 && st.headerProgress !== "off";
  const countSize = `${Math.max(11, Math.round(st.titleFontSize * 0.75))}px`;

  const makeCount = (value) =>
    st.headerProgress === "box" ? (
      <CounterBox st={st} fill={st.headerBg} fontSize={countSize}>
        {value} / {progress.total}
      </CounterBox>
    ) : (
      <span
        style={{
          fontSize: countSize,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <CounterText value={value} total={progress.total} />
      </span>
    );

  // Breiteste mögliche Anzeige: alles erledigt
  const sizer = showCount ? makeCount(progress.total) : null;
  const count = showCount ? makeCount(progress.done) : null;

  const countCell = (gridColumn) => (
    <div
      style={{
        gridColumn,
        justifySelf: "end",
        display: "grid",
        color: st.titleColor,
      }}
    >
      <div aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {sizer}
      </div>
      <div style={{ gridArea: "1 / 1", justifySelf: "end" }}>{count}</div>
    </div>
  );

  let columns;
  if (center) {
    // Bei Zahl sind beide Seiten gleich breit (links unsichtbares Spiegelbild),
    // sonst säße der Titel nicht mehr mittig.
    columns = showCount
      ? "minmax(auto, 1fr) auto minmax(auto, 1fr)"
      : "minmax(0, 1fr) auto minmax(0, 1fr)";
  } else {
    columns = showCount ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)";
  }

  return (
    <div style={{ position: "relative" }}>
      <Fill color={st.headerBg} opacity={st.headerAlpha} />
      <div
        style={{
          position: "relative",
          padding: st.metrics.headPad,
          display: "grid",
          alignItems: "center",
          gridTemplateColumns: columns,
          columnGap: showCount ? 10 : 0,
          textShadow: overlayTextShadow(st.titleColor),
        }}
      >
        {center && showCount && (
          <div
            aria-hidden="true"
            style={{ gridColumn: 1, visibility: "hidden", color: st.titleColor }}
          >
            {sizer}
          </div>
        )}
        <div
          style={{
            gridColumn: center ? 2 : 1,
            fontWeight: 800,
            textAlign: center ? "center" : "left",
            color: st.titleColor,
            fontSize: `${st.titleFontSize}px`,
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </div>
        {showCount && countCell(center ? 3 : 2)}
      </div>
    </div>
  );
}

/**
 * Gesamtstand als deckender Block in der Akzentfarbe („Sendegrafik“, „Leiste“).
 * Die Breite ist für den Endstand reserviert, damit der Titel daneben nicht
 * wandert, wenn aus „9/10“ „10/10“ wird.
 */
function ProgressSlab({ st, progress }) {
  const accent = st.accent || "#9146FF";
  const text = (value) => (
    <>
      <span style={{ fontWeight: 800 }}>{value}</span>
      <span style={{ fontWeight: 600, opacity: 0.65 }}>/{progress.total}</span>
    </>
  );
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        alignItems: "center",
        justifyItems: "center",
        padding: "0 12px",
        background: accent,
        color: readableOn(accent),
        textShadow: "none",
        fontSize: `${Math.max(12, Math.round(st.titleFontSize * 0.95))}px`,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {text(progress.total)}
      </span>
      <span style={{ gridArea: "1 / 1" }}>{text(progress.done)}</span>
    </div>
  );
}

/**
 * Eine Challenge. Zähler-Challenges zeigen ihren Stand als reine Zahl (Standard)
 * oder in einer Box. Die Form hängt am Stil:
 *   list      — durchgehendes Band mit feiner Trennlinie, erledigt = grüner Name
 *   broadcast — dasselbe Band ohne Linie, erledigt = gedimmt
 *   bar       — ein Abschnitt des waagerechten Streifens, bricht nie um
 *
 * Hat die Challenge ein Spielcover, steht es als feste Spalte ganz links. Schrumpfen
 * darf weiterhin nur der Name: Cover, Zähler und Haken behalten ihre Breite.
 * `iconSlot` hält den Platz auch in Zeilen ohne Cover frei, damit in einer gemischten
 * Liste alle Namen auf einer Linie beginnen.
 */
export function OverlayRow({ it, st, iconSlot = false }) {
  const done = isItemDone(it);
  const iconUrl = itemIconUrl(it);
  const cover = iconUrl || iconSlot ? <ItemCover url={iconUrl} st={st} dim={done} /> : null;
  const layout = st.layout;
  const boxed = st.counterStyle === "box";
  const accentColor = st.accent || "#9146FF";
  const itemBg = st.itemBg;
  const rowBgOpacity = itemBg ? st.itemAlpha : 0.04;
  const target = it.target || 0;
  const progress = it.progress || 0;

  const doneTick = useChangeTick(done);
  const countTick = useChangeTick(progress);

  const makeCounter = (shownProgress, animated) => {
    if (!it.useWins) return null;
    const anim = animated && countTick > 0 ? { animation: "wcCount 700ms ease-out" } : null;
    if (boxed) {
      return (
        <CounterBox st={st} fill={itemBg || "#ffffff"} fontSize="0.9em">
          <span key={animated ? countTick : undefined} style={anim || undefined}>
            {shownProgress} / {target}
          </span>
        </CounterBox>
      );
    }
    return (
      <span
        key={animated ? countTick : undefined}
        style={{
          position: "relative",
          fontSize: "0.9em",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
          ...anim,
        }}
      >
        <CounterText value={shownProgress} total={target} />
      </span>
    );
  };
  const counter = makeCounter(progress, true);

  const check = (label) => (
    <Check
      size="1em"
      strokeWidth={3.5}
      aria-label={label}
      style={{ color: DONE_GREEN, flexShrink: 0 }}
    />
  );
  const pin = it.pinned ? (
    <Pin
      aria-label="pinned"
      size="1em"
      strokeWidth={2.5}
      style={{ color: accentColor, flexShrink: 0 }}
    />
  ) : null;
  // Die Pinnadel steht ganz vorn, noch vor dem Spielcover — in allen Stilen
  const pinMark = pin ? <span style={{ position: "relative", display: "flex", flexShrink: 0 }}>{pin}</span> : null;
  const fontSize = st.itemFontSize ? `${st.itemFontSize}px` : undefined;

  // Aufblitzen beim Abhaken (nicht beim Zurücknehmen)
  const flash =
    doneTick > 0 && done ? (
      <div
        key={doneTick}
        style={{
          position: "absolute",
          inset: 0,
          background: accentColor,
          opacity: 0,
          animation: "wcFlash 900ms ease-out",
          pointerEvents: "none",
        }}
      />
    ) : null;

  // --- Leiste: Abschnitt eines waagerechten Streifens ---
  if (layout === "bar") {
    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: st.metrics.rowPad,
          borderLeft: `1px solid ${st.divider}`,
          fontSize,
          whiteSpace: "nowrap",
        }}
      >
        <Fill color={itemBg || "#ffffff"} opacity={rowBgOpacity} />
        {flash}
        {pinMark}
        {cover}
        <span style={{ position: "relative", fontWeight: 600, opacity: done ? 0.55 : 1 }}>
          {it.name}
        </span>
        {counter}
        {done ? <span style={{ position: "relative", display: "flex" }}>{check("erledigt")}</span> : null}
      </div>
    );
  }

  // --- Klassisch und Sendegrafik: durchgehendes Band ---
  const classic = layout === "list";
  // Für die Breitenreservierung mit dem Endstand rechnen: aus „9 / 10“ wird
  // beim Abschluss „10 / 10“ und damit eine Ziffer mehr Breite — der Name würde
  // sonst genau dann neu umbrechen.
  const counterSizer = makeCounter(Math.max(progress, target), false);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: st.metrics.rowPad,
        borderTop: classic ? `1px solid ${st.divider}` : undefined,
        fontSize,
      }}
    >
      <Fill color={itemBg || "#ffffff"} opacity={rowBgOpacity} />
      {flash}
      {pinMark}
      {cover}
      <span
        style={{
          position: "relative",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          // Klassisch färbt den erledigten Namen grün, die Sendegrafik nimmt ihn
          // zurück — dort trägt allein der Haken die Farbe.
          color: done && classic ? DONE_GREEN : "inherit",
          opacity: done && !classic ? 0.55 : 1,
          // Der Name ist das einzige Element, das schrumpfen darf. minWidth: 0
          // hebt die Flex-Mindestbreite auf, sonst drückt ein langer Name die
          // Zähler-Anzeige zusammen, statt selbst umzubrechen.
          flex: "1 1 auto",
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {it.name}
      </span>

      {/* Zähler und Haken. Beide Ebenen liegen im selben Rasterfeld:
          - die unsichtbare bestimmt die Breite (Zähler + Haken), damit der Name
            schon von Anfang an so umbricht, als wäre der Haken da — beim
            Abhaken springt der Text also nicht
          - die sichtbare ist rechtsbündig: offen sitzt der Zähler bündig am
            Rand, erledigt rutscht er nach links und der Haken erscheint dahinter.
          So bleibt hinter dem Zähler kein leerer Platz stehen. */}
      <span style={{ position: "relative", display: "grid", flexShrink: 0 }}>
        <span
          aria-hidden="true"
          style={{
            gridArea: "1 / 1",
            display: "flex",
            alignItems: "center",
            gap: 8,
            visibility: "hidden",
          }}
        >
          {counterSizer}
          {check()}
        </span>
        <span
          style={{
            gridArea: "1 / 1",
            justifySelf: "end",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {counter}
          {done ? check("erledigt") : null}
        </span>
      </span>
    </div>
  );
}

/** Fußband des Stils „Klassisch“: Timer und (falls nötig) Seitenanzeige. */
export function OverlayFooter({ st, children }) {
  return (
    <div
      style={{
        position: "relative",
        borderTop: `1px solid ${st.divider}`,
      }}
    >
      <Fill color={st.boxBg} opacity={st.timerAlpha} />
      <div
        style={{
          position: "relative",
          padding: st.metrics.footPad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Timer. Bewusst Inter mit festbreiten Ziffern statt `monospace`: die
 * Systemschrift (Courier/Consolas) wirkte wie ein Terminal. Der Status ist ein
 * kleines Play-/Pause-Zeichen statt eines farbigen Punktes.
 */
export function OverlayTimer({ running, ms, timeRef, fontSize }) {
  const StateIcon = running ? Play : Pause;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: fontSize ? `${fontSize}px` : undefined,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <StateIcon
        size="0.7em"
        strokeWidth={0}
        fill="currentColor"
        style={{ color: running ? "#22c55e" : "#ef4444", flexShrink: 0 }}
      />
      <span ref={timeRef}>{msToClock(ms)}</span>
    </div>
  );
}

/** Seitenanzeige als kurze Balken statt Punkte. */
export function OverlayPagerDots({ count, index, st }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 14,
            height: 3,
            background: i === index ? st.accent || "#9146FF" : hexToRgba(st.textColor, 0.28),
          }}
        />
      ))}
    </div>
  );
}

/**
 * Das ganze Overlay um die Zeilen herum: Kopf, Timer und Seitenanzeige sitzen je
 * nach Stil an anderer Stelle. `children` sind die fertigen Zeilen (im Overlay
 * samt Laufschrift-Ausschnitt).
 *
 *   timer — { running, ms, timeRef? } oder null, wenn er ausgeblendet ist
 *   pager — { count, index } oder null, wenn es nur eine Seite gibt
 *   ticker — { speed } oder null; nur die Leiste kennt das Laufband
 *   style — Zusätze für die äußere Hülle (die Vorschau skaliert und zentriert damit)
 *
 * Bewusst KEINE Hintergrundebene über das ganze Overlay: Kopf, jede Zeile und
 * Fuß füllen nur ihre eigene Fläche. Dadurch lässt sich jede einzeln bis auf 0 %
 * ziehen.
 */
export function OverlayFrame({ st, title, progress, timer, pager, ticker, children, style }) {
  const accent = st.accent || "#9146FF";
  const showCount = !!progress && progress.total > 0 && st.headerProgress !== "off";
  const timerEl = timer ? (
    <OverlayTimer
      running={timer.running}
      ms={timer.ms}
      timeRef={timer.timeRef}
      fontSize={st.timerFontSize}
    />
  ) : null;
  const dots = pager ? <OverlayPagerDots count={pager.count} index={pager.index} st={st} /> : null;
  const root = {
    position: "relative",
    display: "flex",
    fontFamily: OVERLAY_FONT,
    color: st.textColor,
    textShadow: st.textShadow,
    "--wc-accent": accent,
  };
  const keyframes = <style>{OVERLAY_KEYFRAMES}</style>;
  const titleText = {
    fontWeight: 800,
    color: st.titleColor,
    fontSize: `${st.titleFontSize}px`,
  };

  // --- Sendegrafik: Kopf und Zeilen als zwei getrennte Blöcke ---
  if (st.layout === "broadcast") {
    const radius = Math.min(14, st.borderRadius);
    const block = { position: "relative", borderRadius: radius, overflow: "hidden", boxShadow: BLOCK_SHADOW };
    return (
      <div style={{ ...root, flexDirection: "column", gap: 4, width: st.boxWidth, ...style }}>
        {keyframes}
        <div style={{ ...block, display: "flex", alignItems: "stretch" }}>
          <Fill color={st.headerBg} opacity={st.headerAlpha} />
          {showCount ? (
            <ProgressSlab st={st} progress={progress} />
          ) : (
            <div style={{ position: "relative", width: 4, background: accent, flexShrink: 0 }} />
          )}
          <div
            style={{
              position: "relative",
              flex: "1 1 auto",
              minWidth: 0,
              padding: st.metrics.headPad,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              color: st.titleColor,
              textShadow: overlayTextShadow(st.titleColor),
            }}
          >
            <div style={{ ...titleText, lineHeight: 1.2, overflowWrap: "anywhere" }}>{title}</div>
            {timerEl && <div style={{ opacity: 0.85 }}>{timerEl}</div>}
          </div>
        </div>
        <div style={{ ...block, display: "flex", flexDirection: "column" }}>
          {children}
          {dots && (
            <div style={{ position: "relative", padding: "6px 14px 8px", display: "flex", justifyContent: "center" }}>
              <Fill color={st.itemBg || "#ffffff"} opacity={st.itemBg ? st.itemAlpha : 0.04} />
              <div style={{ position: "relative" }}>{dots}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Leiste: ein Streifen. Ohne Laufband so breit wie sein Inhalt, mit Laufband
  //     so breit wie eingestellt — Stand, Titel und Timer stehen fest, nur die
  //     Challenges laufen durch. ---
  if (st.layout === "bar") {
    const timerLeft = st.barTimerSide === "left";
    const head =
      showCount || st.barTitle ? (
        <div style={{ position: "relative", display: "flex", alignItems: "stretch", flexShrink: 0 }}>
          <Fill color={st.headerBg} opacity={st.headerAlpha} />
          {showCount && <ProgressSlab st={st} progress={progress} />}
          {st.barTitle && (
            <div
              style={{
                ...titleText,
                position: "relative",
                padding: st.metrics.headPad,
                display: "flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                textShadow: overlayTextShadow(st.titleColor),
              }}
            >
              {title}
            </div>
          )}
        </div>
      ) : null;
    const timerSeg = timerEl ? (
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          padding: st.metrics.footPad,
          flexShrink: 0,
          [timerLeft ? "borderRight" : "borderLeft"]: `1px solid ${st.divider}`,
        }}
      >
        <Fill color={st.boxBg} opacity={st.timerAlpha} />
        <div style={{ position: "relative" }}>{timerEl}</div>
      </div>
    ) : null;
    return (
      <div
        style={{
          ...root,
          alignItems: "stretch",
          width: ticker ? st.barWidth : "max-content",
          borderRadius: st.borderRadius,
          overflow: "hidden",
          boxShadow: BLOCK_SHADOW,
          ...style,
        }}
      >
        {keyframes}
        {timerLeft && timerSeg}
        {head}
        {ticker ? (
          <Ticker speed={ticker.speed}>{children}</Ticker>
        ) : (
          <div style={{ display: "flex", alignItems: "stretch" }}>{children}</div>
        )}
        {!timerLeft && timerSeg}
      </div>
    );
  }

  // --- Klassisch: ein Block mit gemeinsamer Rundung und Schatten ---
  return (
    <div
      style={{
        ...root,
        flexDirection: "column",
        width: st.boxWidth,
        borderRadius: st.borderRadius,
        overflow: "hidden",
        boxShadow: BLOCK_SHADOW,
        ...style,
      }}
    >
      {keyframes}
      <OverlayHeader title={title} st={st} progress={progress} />
      {children}
      {(timerEl || dots) && (
        <OverlayFooter st={st}>
          {timerEl}
          {dots}
        </OverlayFooter>
      )}
    </div>
  );
}
