// WinChallengeOverlay.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  OverlayFooter,
  OverlayHeader,
  OverlayPagerDots,
  OverlayRow,
  OverlayRowPlaceholder,
  OverlayTimer,
} from "./overlayParts";
import {
  OVERLAY_FONT,
  msToClock,
  overallProgress,
  overlayBoxStyle,
  resolveOverlayStyle,
  splitOverlayItems,
} from "./overlayUtils";

export default function WinChallengeOverlay() {
  const { overlayKey } = useParams();
  const [doc, setDoc] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const scrollInnerRef = useRef(null);
  const firstScrollRowRef = useRef(null);
  const timerDisplayRef = useRef(null);   // direct DOM update — no re-render
  const docRef = useRef(null);            // always-current doc without closures

  const rafRef = useRef(null);
  const pageCountRef = useRef(1);
  const lastTsRef = useRef(null);
  const offsetRef = useRef(0);
  const dirRef = useRef(1);
  const pauseUntilRef = useRef(0);
  const maxOffsetRef = useRef(0);

  const [scrollViewportHeight, setScrollViewportHeight] = useState(null);

  // Keep docRef in sync (used by intervals that must not re-subscribe on every render)
  useEffect(() => { docRef.current = doc; }, [doc]);

  // Polling — only triggers re-render when updatedAt actually changes
  useEffect(() => {
    let alive = true;
    const lastUpdatedAt = { v: null };
    const load = async () => {
      try {
        const res = await fetch(`/api/winchallenge/overlay/${overlayKey}`);
        if (!alive) return;
        const data = await res.json();
        if (data?.updatedAt !== lastUpdatedAt.v) {
          lastUpdatedAt.v = data.updatedAt;
          setDoc(data);
        }
      } catch {
        // ignore
      }
    };
    load();
    const iv = setInterval(load, 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [overlayKey]);

  // Timer display — direct DOM writes, zero React re-renders
  useEffect(() => {
    const iv = setInterval(() => {
      const t = docRef.current?.timer;
      if (!t) return;
      const ms = t.running ? Date.now() - (t.startedAt || 0) : (t.elapsedMs || 0);
      if (timerDisplayRef.current) timerDisplayRef.current.textContent = msToClock(ms);
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // Hard reload bei refreshNonce-Änderung
  const lastRefreshRef = useRef();
  useEffect(() => {
    if (!doc) return;
    if (lastRefreshRef.current === undefined) {
      lastRefreshRef.current = doc.refreshNonce || null;
      return;
    }
    if ((doc.refreshNonce || null) !== lastRefreshRef.current) {
      lastRefreshRef.current = doc.refreshNonce || null;
      window.location.reload();
    }
  }, [doc]);

  // --- SICHERHEITS-ANPASSUNG ---
  // Wir entfernen hier das "if (!doc) return null;"
  // Stattdessen nutzen wir Optional Chaining (?.) für alle Werte.

  // Alle Rückfallwerte, Deckkräfte und Layout-Regeln stecken in
  // resolveOverlayStyle — dieselbe Funktion nutzt die Editor-Vorschau.
  const st = resolveOverlayStyle(doc?.style);
  const { layout, counterStyle, doneToBottom, itemFontSize, scale } = st;
  const rowGap = st.metrics.gap;

  // Items sicher laden — Zeilen ohne Namen (leere Editor-Zeilen) nicht anzeigen
  const items = Array.isArray(doc?.items)
    ? doc.items.filter((i) => String(i?.name || "").trim())
    : [];
  // Sortiert wird nur die Anzeige (Option „Erledigte ans Ende“)
  const { pinned, others } = splitOverlayItems(items, doneToBottom);
  const progress = overallProgress(items);

  // itemsSig Hook (verursachte den Absturz, wenn er bedingt aufgerufen wurde)
  const itemsSig = useMemo(
    () =>
      (items || [])
        .map(
          (i) =>
            `${i.id}|${i.name}|${i.useWins ? 1 : 0}|${i.progress || 0}|${
              i.target || 0
            }|${i.done ? 1 : 0}|${i.pinned ? 1 : 0}`
        )
        .join("||"),
    [items]
  );

  const animation = doc?.animation || null;
  const animEnabled = !!animation?.enabled;
  const mode = animation?.mode === "scrolling" ? "scrolling" : "paging";

  const scrollingEnabled = animEnabled && mode === "scrolling";
  const pagingEnabled =
    (animEnabled && mode === "paging") || (!animEnabled && !!doc?.pager?.enabled);

  const pagingPageSize = animEnabled
    ? animation?.paging?.pageSize
    : doc?.pager?.pageSize;

  const pagingIntervalSec = animEnabled
    ? animation?.paging?.intervalSec
    : doc?.pager?.intervalSec;

  const scrollVisibleRows = Math.max(
    1,
    parseInt(animation?.scrolling?.visibleRows || 2, 10)
  );
  const scrollSpeedPxPerSec = Math.max(
    5,
    Number(animation?.scrolling?.speedPxPerSec ?? 30)
  );
  const scrollPauseMs = Math.max(
    0,
    Number(animation?.scrolling?.pauseSec ?? 2) * 1000
  );

  const pageSize = Math.max(1, parseInt(pagingPageSize || 5, 10));

  let visibleOthers = others;
  let placeholders = 0;
  let pageCount = 1;

  if (pagingEnabled && !scrollingEnabled) {
    const slotsForOthers = Math.max(0, pageSize - pinned.length);
    const othersCount = others.length;

    if (slotsForOthers > 0) {
      pageCount = Math.max(1, Math.ceil(othersCount / slotsForOthers));

      const pageStart = pageIndex * slotsForOthers;
      visibleOthers = others.slice(pageStart, pageStart + slotsForOthers);

      placeholders = Math.max(
        0,
        pageSize - pinned.length - visibleOthers.length
      );
    } else {
      visibleOthers = [];
      placeholders = Math.max(0, pageSize - pinned.length);
    }
  } else {
    visibleOthers = others;
    placeholders = 0;
  }
  pageCountRef.current = pageCount;

  const showTimer = doc?.timer?.visible !== false;
  const showPagerDots = pagingEnabled && !scrollingEnabled && pageCount > 1;

  // Scrolling Logic Hook
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

    // Bei Liste/Kompakt liegen die Zeilen bündig (die Trennlinie steckt in der
    // Zeilenhöhe), bei „Karten“ liegt eine Lücke dazwischen.
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

      const rowH = rowEl.getBoundingClientRect().height || 0;
      const wantedViewportH = Math.max(
        0,
        rowH * scrollVisibleRows + gap * (scrollVisibleRows - 1)
      );

      const totalH = innerEl.getBoundingClientRect().height || 0;
      const viewportH = Math.min(totalH || wantedViewportH, wantedViewportH);

      // Abrunden: die Zeilenhöhen sind meist gebrochen, und beim Aufrunden
      // blitzt der Trennstrich der nächsten Zeile unten im Ausschnitt auf.
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
    scale,
    // ändern Zeilenhöhe, Zeilenabstand oder welche Zeile oben steht
    layout,
    counterStyle,
    doneToBottom,
    rowGap,
  ]);

  // Animation Loop Hook
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
          let next =
            offsetRef.current +
            ((scrollSpeedPxPerSec * dt) / 1000) * dirRef.current;

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

  // Paging interval — only re-renders when the page index actually changes
  useEffect(() => {
    if (!pagingEnabled || scrollingEnabled) { setPageIndex(0); return; }
    const intervalMs = Math.max(2, parseInt(pagingIntervalSec || 20, 10)) * 1000;
    const iv = setInterval(() => {
      setPageIndex(prev => {
        const pCount = pageCountRef.current;
        return pCount > 1 ? (prev + 1) % pCount : 0;
      });
    }, intervalMs);
    return () => clearInterval(iv);
  }, [pagingEnabled, scrollingEnabled, pagingIntervalSec]);

  // --- JETZT erst prüfen wir auf Null ---
  // Da alle Hooks oben schon deklariert wurden, ist die Reihenfolge stabil.
  if (!doc) return null;

  const timerMs = doc.timer?.running
    ? Date.now() - (doc.timer?.startedAt || 0)
    : (doc.timer?.elapsedMs || 0);

  return (
    <div
      style={{
        fontFamily: OVERLAY_FONT,
        color: st.textColor,
        background: "transparent",
        transform: `scale(${st.scale})`,
        transformOrigin: "top left",
        padding: 8,
        textShadow: st.textShadow,
      }}
    >
      <div
        style={{
          ...overlayBoxStyle(st),
          minWidth: st.boxWidth,
          maxWidth: st.boxWidth,
        }}
      >
        {/* Bewusst KEINE Hintergrundebene über die ganze Box und keine Fläche um
            die Zeilen: Header, jede Zeile und der Footer füllen nur ihre eigene
            Fläche. Dadurch lässt sich jede einzeln bis auf 0 % ziehen. */}
        <OverlayHeader
          title={doc.title || "WinChallenge"}
          st={st}
          progress={progress}
        />

        {pinned.map((it) => (
          <OverlayRow key={it.id} it={it} st={st} />
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
                <div
                  key={it.id}
                  ref={idx === 0 ? firstScrollRowRef : undefined}
                >
                  <OverlayRow it={it} st={st} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {visibleOthers.map((it) => (
              <OverlayRow key={it.id} it={it} st={st} />
            ))}
            {Array.from({ length: placeholders }).map((_, i) => (
              <OverlayRowPlaceholder key={`ph-${i}`} st={st} />
            ))}
          </>
        )}

        {(showTimer || showPagerDots) && (
          <OverlayFooter st={st}>
            {showTimer && (
              <OverlayTimer
                running={!!doc.timer?.running}
                ms={timerMs}
                timeRef={timerDisplayRef}
                fontSize={st.timerFontSize}
              />
            )}
            {showPagerDots && (
              <OverlayPagerDots count={pageCount} index={pageIndex} st={st} />
            )}
          </OverlayFooter>
        )}
      </div>
    </div>
  );
}
