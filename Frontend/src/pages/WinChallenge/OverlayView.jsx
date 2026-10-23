// OverlayView.jsx — das Overlay selbst: Reihenfolge, Seitenwechsel, Laufschrift und
// Laufband. Das OBS-Overlay (WinChallengeOverlay.jsx) und die Live-Vorschau im Editor
// zeichnen beide genau diese Komponente — die Vorschau bewegt sich deshalb so, wie es
// später im Stream aussieht, statt nur ein Standbild der ersten Zeilen zu zeigen.
//
// Skaliert wird außerhalb (per transform): gemessen wird hier deshalb immer in
// unskalierten Pixeln, siehe measure().
import React, { useEffect, useRef, useState } from "react";
import { OverlayFrame, OverlayRow } from "./overlayParts";
import {
  itemIconUrl,
  overallProgress,
  resolveOverlayStyle,
  splitOverlayItems,
} from "./overlayUtils";

/**
 * @param {object} props
 * @param {object} props.doc      Overlay-Dokument (Titel, Items, Stil, Animation, Timer)
 * @param {number} props.timerMs  aktuelle Timer-Zeit beim Zeichnen
 * @param {object} [props.timeRef] Ref auf die Zeitanzeige — das OBS-Overlay schreibt die
 *                                 laufende Zeit direkt ins DOM, ohne neu zu zeichnen
 */
export default function OverlayView({ doc, timerMs, timeRef }) {
  const [pageIndex, setPageIndex] = useState(0);
  const scrollInnerRef = useRef(null);
  const firstScrollRowRef = useRef(null);

  const rafRef = useRef(null);
  const pageCountRef = useRef(1);
  const lastTsRef = useRef(null);
  const offsetRef = useRef(0);
  const dirRef = useRef(1);
  const pauseUntilRef = useRef(0);
  const maxOffsetRef = useRef(0);

  const [scrollViewportHeight, setScrollViewportHeight] = useState(null);

  // Alle Rückfallwerte, Deckkräfte und Layout-Regeln stecken in resolveOverlayStyle
  const st = resolveOverlayStyle(doc?.style);
  const { layout, counterStyle, doneToBottom, itemFontSize } = st;
  const rowGap = st.metrics.gap;

  // Zeilen ohne Namen (leere Editor-Zeilen) nicht anzeigen
  const items = Array.isArray(doc?.items)
    ? doc.items.filter((i) => String(i?.name || "").trim())
    : [];
  // Sortiert wird nur die Anzeige (Option „Erledigte ans Ende“)
  const { pinned, others } = splitOverlayItems(items, doneToBottom);
  const progress = overallProgress(items);

  // Ändert sich, sobald sich an den Zeilen irgendetwas tut — dann wird neu gemessen
  const itemsSig = items
    .map(
      (i) =>
        `${i.id}|${i.name}|${i.useWins ? 1 : 0}|${i.progress || 0}|${i.target || 0}|${
          i.done ? 1 : 0
        }|${i.pinned ? 1 : 0}|${itemIconUrl(i)}`
    )
    .join("||");

  // Hat irgendeine Challenge ein Spielcover, halten alle Zeilen den Platz dafür frei —
  // über alle Seiten hinweg, damit die Namen beim Seitenwechsel nicht hin- und herrücken.
  // Die Leiste braucht das nicht: dort steht jede Challenge für sich nebeneinander.
  const iconSlot = layout !== "bar" && items.some((i) => itemIconUrl(i));

  const animation = doc?.animation || null;
  const animEnabled = !!animation?.enabled;
  const mode = animation?.mode === "scrolling" ? "scrolling" : "paging";

  // Die Leiste ist waagerecht: statt der senkrechten Laufschrift läuft bei ihr ein
  // Laufband von rechts nach links (Ticker in overlayParts.jsx) — die Messung und
  // die Schleife weiter unten gelten nur für die senkrechten Stile.
  const isBar = layout === "bar";
  const scrollingEnabled = animEnabled && mode === "scrolling" && !isBar;
  const tickerEnabled = animEnabled && mode === "scrolling" && isBar;
  const pagingEnabled =
    (animEnabled && mode === "paging") || (!animEnabled && !!doc?.pager?.enabled);

  const pagingPageSize = animEnabled ? animation?.paging?.pageSize : doc?.pager?.pageSize;
  const pagingIntervalSec = animEnabled
    ? animation?.paging?.intervalSec
    : doc?.pager?.intervalSec;

  const scrollVisibleRows = Math.max(1, parseInt(animation?.scrolling?.visibleRows || 2, 10));
  const scrollSpeedPxPerSec = Math.max(5, Number(animation?.scrolling?.speedPxPerSec ?? 30));
  const scrollPauseMs = Math.max(0, Number(animation?.scrolling?.pauseSec ?? 2) * 1000);

  const pageSize = Math.max(1, parseInt(pagingPageSize || 5, 10));

  // Eine Seite ist nur so hoch wie ihre Challenges: die letzte, nicht ganz volle Seite
  // wird NICHT mit leeren Zeilen aufgefüllt — das sah aus wie eine Lücke im Overlay.
  let visibleOthers = others;
  let pageCount = 1;

  if (pagingEnabled && !scrollingEnabled) {
    const slotsForOthers = Math.max(0, pageSize - pinned.length);
    if (slotsForOthers > 0) {
      pageCount = Math.max(1, Math.ceil(others.length / slotsForOthers));
      // Fällt die letzte Seite weg (Challenge gelöscht), nicht auf einer leeren stehen bleiben
      const page = Math.min(pageIndex, pageCount - 1);
      const pageStart = page * slotsForOthers;
      visibleOthers = others.slice(pageStart, pageStart + slotsForOthers);
    } else {
      visibleOthers = [];
    }
  }
  pageCountRef.current = pageCount;

  const showTimer = doc?.timer?.visible !== false;
  const showPagerDots = pagingEnabled && !scrollingEnabled && pageCount > 1;

  // Laufschrift: Ausschnitt ausmessen
  useEffect(() => {
    if (!scrollingEnabled) {
      setScrollViewportHeight(null);
      offsetRef.current = 0;
      dirRef.current = 1;
      pauseUntilRef.current = 0;
      maxOffsetRef.current = 0;
      if (scrollInnerRef.current) {
        scrollInnerRef.current.style.transform = "translate3d(0, 0px, 0)";
      }
      return;
    }

    // Die Zeilen liegen bündig (eine Trennlinie steckt in der Zeilenhöhe)
    const gap = rowGap;
    offsetRef.current = 0;
    dirRef.current = 1;
    pauseUntilRef.current = Date.now() + scrollPauseMs;
    if (scrollInnerRef.current) {
      scrollInnerRef.current.style.transform = "translate3d(0, 0px, 0)";
    }

    const measure = () => {
      const rowEl = firstScrollRowRef.current;
      const innerEl = scrollInnerRef.current;
      if (!rowEl || !innerEl) return;

      // getBoundingClientRect liefert die Größe NACH der Skalierung außen herum
      // (Overlay-Skalierung, verkleinerte Vorschau), gebraucht wird sie davor:
      // Höhe und Verschiebung werden innerhalb der Skalierung gesetzt. Ohne das
      // Zurückrechnen zeigte das Overlay bei Skalierung 1,5 auch 1,5-mal so viele
      // Zeilen wie eingestellt. offsetHeight allein wäre unskaliert, rundet aber
      // auf ganze Pixel — die Zeilenhöhen sind meist gebrochen.
      const innerRect = innerEl.getBoundingClientRect().height || 0;
      const k = innerEl.offsetHeight > 0 && innerRect > 0 ? innerRect / innerEl.offsetHeight : 1;

      const rowH = (rowEl.getBoundingClientRect().height || 0) / k;
      const wantedViewportH = Math.max(0, rowH * scrollVisibleRows + gap * (scrollVisibleRows - 1));

      const totalH = innerRect / k;
      const viewportH = Math.min(totalH || wantedViewportH, wantedViewportH);

      // Abrunden: beim Aufrunden blitzt der Trennstrich der nächsten Zeile unten
      // im Ausschnitt auf.
      setScrollViewportHeight(Math.floor(viewportH));
      maxOffsetRef.current = Math.max(0, totalH - viewportH);
    };

    measure();
    const t = setTimeout(measure, 60);
    return () => clearTimeout(t);
  }, [
    scrollingEnabled,
    scrollVisibleRows,
    scrollPauseMs,
    itemsSig,
    itemFontSize,
    // ändern Zeilenhöhe, Zeilenabstand oder welche Zeile oben steht
    layout,
    counterStyle,
    doneToBottom,
    rowGap,
    st.boxWidth,
  ]);

  // Laufschrift: Schleife
  useEffect(() => {
    if (!scrollingEnabled) return;

    let stopped = false;
    const step = (ts) => {
      if (stopped) return;
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const nowMs = Date.now();

      if (nowMs >= pauseUntilRef.current) {
        const maxOffset = maxOffsetRef.current;
        if (maxOffset > 0) {
          let next = offsetRef.current + ((scrollSpeedPxPerSec * dt) / 1000) * dirRef.current;

          if (next >= maxOffset) {
            next = maxOffset;
            dirRef.current = -1;
            pauseUntilRef.current = nowMs + scrollPauseMs;
          } else if (next <= 0) {
            next = 0;
            dirRef.current = 1;
            pauseUntilRef.current = nowMs + scrollPauseMs;
          }

          offsetRef.current = next;
          if (scrollInnerRef.current) {
            scrollInnerRef.current.style.transform = `translate3d(0, ${-next}px, 0)`;
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [scrollingEnabled, scrollSpeedPxPerSec, scrollPauseMs]);

  // Seitenwechsel — zeichnet nur neu, wenn sich die Seite wirklich ändert
  useEffect(() => {
    if (!pagingEnabled || scrollingEnabled) {
      setPageIndex(0);
      return;
    }
    const intervalMs = Math.max(2, parseInt(pagingIntervalSec || 20, 10)) * 1000;
    const iv = setInterval(() => {
      setPageIndex((prev) => {
        const pCount = pageCountRef.current;
        return pCount > 1 ? (prev + 1) % pCount : 0;
      });
    }, intervalMs);
    return () => clearInterval(iv);
  }, [pagingEnabled, scrollingEnabled, pagingIntervalSec]);

  return (
    <OverlayFrame
      st={st}
      title={doc?.title || "WinChallenge"}
      progress={progress}
      timer={showTimer ? { running: !!doc?.timer?.running, ms: timerMs, timeRef } : null}
      pager={showPagerDots ? { count: pageCount, index: Math.min(pageIndex, pageCount - 1) } : null}
      ticker={tickerEnabled ? { speed: scrollSpeedPxPerSec } : null}
    >
      {pinned.map((it) => (
        <OverlayRow key={it.id} it={it} st={st} iconSlot={iconSlot} />
      ))}

      {scrollingEnabled ? (
        <div
          style={{
            overflow: "hidden",
            height: scrollViewportHeight ?? "auto",
          }}
        >
          <div
            ref={scrollInnerRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: rowGap,
              willChange: "transform",
            }}
          >
            {others.map((it, idx) => (
              <div key={it.id} ref={idx === 0 ? firstScrollRowRef : undefined}>
                <OverlayRow it={it} st={st} iconSlot={iconSlot} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        visibleOthers.map((it) => <OverlayRow key={it.id} it={it} st={st} iconSlot={iconSlot} />)
      )}
    </OverlayFrame>
  );
}
