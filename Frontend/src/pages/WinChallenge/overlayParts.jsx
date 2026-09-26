// overlayParts.jsx — Bausteine, die das OBS-Overlay und die Editor-Vorschau gemeinsam nutzen.
// Beides muss pixelgleich aussehen; zwei getrennte Kopien sind vorher bereits
// auseinandergelaufen (z. B. die Größe des Zählers).
//
// Alle Bausteine bekommen `st`, das Ergebnis von resolveOverlayStyle().
import React from "react";
import { Pin, Check, Play, Pause } from "lucide-react";
import {
  hexToRgba,
  isItemDone,
  msToClock,
  overlayTextShadow,
} from "./overlayUtils";

const DONE_GREEN = "#2ecc71";
// Geschütztes Leerzeichen als Zeichencode statt Escape-Schreibweise: im Quelltext
// wäre ein echtes NBSP unsichtbar und beim Kopieren leicht zu verlieren.
const NBSP = String.fromCharCode(160);

/** Bei „Karten“ ist jedes Band eine eigene Karte mit Rundung, sonst füllt es die Hülle. */
function bandShape(st) {
  return st.layout === "cards"
    ? { borderRadius: st.cardRadius, overflow: "hidden" }
    : {};
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
 * Titelband, auf Wunsch mit Gesamtfortschritt („Zahl“ oder in der Box wie bei den
 * Zeilen). Der Platz dafür ist immer für den größten möglichen Stand („7 / 7“)
 * reserviert: ein langer Titel bricht deshalb von Anfang an so um, als wäre die
 * Zahl schon da, und springt nicht, wenn sich die Zahl ändert.
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
    <div style={{ position: "relative", ...bandShape(st) }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: st.headerBg,
          opacity: st.headerAlpha,
          pointerEvents: "none",
        }}
      />
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
 * Eine Challenge als durchgehendes Band. Es gibt bewusst keinen Kasten mit
 * eigenem Hintergrund um die Zeilen und keine Zeilen-Pillen: die Zeile selbst
 * ist der Hauptteil, getrennt nur durch eine feine Linie (bei „Karten“ durch
 * eine Lücke).
 *
 * Zähler-Challenges zeigen ihren Stand rechts am Rand: als reine Zahl (Standard)
 * oder in einer Box.
 */
export function OverlayRow({ it, st }) {
  const done = isItemDone(it);
  const boxed = st.counterStyle === "box";
  const accentColor = st.accent || "#9146FF";
  const itemBg = st.itemBg;
  const rowBgOpacity = itemBg ? st.itemAlpha : 0.04;
  const target = it.target || 0;
  const progress = it.progress || 0;

  const makeCounter = (shownProgress) => {
    if (!it.useWins) return null;
    if (boxed) {
      return (
        <CounterBox st={st} fill={itemBg || "#ffffff"} fontSize="0.9em">
          {shownProgress} / {target}
        </CounterBox>
      );
    }
    return (
      <span
        style={{
          position: "relative",
          fontSize: "0.9em",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        <CounterText value={shownProgress} total={target} />
      </span>
    );
  };
  const counter = makeCounter(progress);
  // Für die Breitenreservierung mit dem Endstand rechnen: aus „9 / 10“ wird
  // beim Abschluss „10 / 10“ und damit eine Ziffer mehr Breite — der Name würde
  // sonst genau dann neu umbrechen.
  const counterSizer = makeCounter(Math.max(progress, target));

  const check = (
    <Check
      size="1em"
      strokeWidth={3.5}
      style={{ color: DONE_GREEN, flexShrink: 0 }}
    />
  );

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: st.metrics.rowPad,
        borderTop: st.layout === "cards" ? undefined : `1px solid ${st.divider}`,
        fontSize: st.itemFontSize ? `${st.itemFontSize}px` : undefined,
        ...bandShape(st),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: itemBg || "#ffffff",
          opacity: rowBgOpacity,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: done ? DONE_GREEN : "inherit",
          // Der Name ist das einzige Element, das schrumpfen darf. minWidth: 0
          // hebt die Flex-Mindestbreite auf, sonst drückt ein langer Name die
          // Zähler-Anzeige zusammen, statt selbst umzubrechen.
          flex: "1 1 auto",
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {it.pinned ? (
          <Pin
            aria-label="pinned"
            size="1em"
            strokeWidth={2.5}
            style={{ color: accentColor, flexShrink: 0 }}
          />
        ) : null}
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
          {check}
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
          {done ? (
            <Check
              size="1em"
              strokeWidth={3.5}
              aria-label="erledigt"
              style={{ color: DONE_GREEN, flexShrink: 0 }}
            />
          ) : null}
        </span>
      </span>
    </div>
  );
}

/**
 * Unsichtbare Füllzeile, damit eine Seite immer gleich hoch bleibt. Es ist die
 * echte Zeile (mit Zähler, also die höchste Variante) — so kann die Höhe nicht
 * von der Darstellung abweichen.
 */
export function OverlayRowPlaceholder({ st }) {
  return (
    <div aria-hidden="true" style={{ visibility: "hidden" }}>
      <OverlayRow
        st={st}
        it={{ id: "placeholder", name: NBSP, useWins: true, target: 0, progress: 0 }}
      />
    </div>
  );
}

/** Fußband: Timer und (falls nötig) Seitenanzeige. */
export function OverlayFooter({ st, children }) {
  return (
    <div
      style={{
        position: "relative",
        borderTop: st.layout === "cards" ? undefined : `1px solid ${st.divider}`,
        ...bandShape(st),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: st.boxBg,
          opacity: st.timerAlpha,
          pointerEvents: "none",
        }}
      />
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
