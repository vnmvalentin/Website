// WinChallengeOverlay.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Pin, Check } from "lucide-react";

function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function clamp01(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export default function WinChallengeOverlay() {
  const { overlayKey } = useParams();
  const [doc, setDoc] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const scrollInnerRef = useRef(null);
  const firstScrollRowRef = useRef(null);
  const timerDisplayRef = useRef(null);   // direct DOM update — no re-render
  const timerDotRef = useRef(null);       // running indicator dot
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
      if (timerDotRef.current) timerDotRef.current.style.background = t.running ? '#22c55e' : '#ef4444';
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

  const {
    boxBg = "#0B0F1A",
    headerBg,
    textColor = "#ffffff",
    accent = "#9146FF",
    opacity = 0.6,
    headerOpacity,
    itemOpacity,
    counterOpacity,
    timerOpacity,
    borderRadius = 0,
    scale = 1,
    boxWidth = 520,
    titleAlign = "left",
    titleColor,
    titleFontSize = 20,
    itemFontSize = 16,
    itemBg,
  } = doc?.style || {}; // Fallback auf leeres Objekt

  // Deckkraft je Fläche. boxAlpha deckt nur den Bereich um die Zeilen herum ab;
  // Zeilen, Zähler und Timer haben eigene Werte. Fehlen sie (Bestandsdaten),
  // gilt für die Zeilen weiterhin die Box-Deckkraft — dadurch ändert sich für
  // vorhandene Overlays nichts.
  const boxAlpha = clamp01(opacity, 0.6);
  const headerAlpha = clamp01(headerOpacity ?? opacity, boxAlpha);
  const itemAlpha = clamp01(itemOpacity ?? opacity, boxAlpha);
  const counterAlpha = clamp01(counterOpacity ?? 0.06, 0.06);
  const timerAlpha = clamp01(timerOpacity ?? 0.15, 0.15);
  // Innenradien folgen dem Box-Radius, damit bei 0px wirklich alles kantig ist
  const rowRadius = Math.min(10, Math.max(0, Number(borderRadius) || 0));
  const badgeRadius = Math.min(8, Math.max(0, Number(borderRadius) || 0));

  const effectiveTitleColor = titleColor || textColor;

  // Items sicher laden — Zeilen ohne Namen (leere Editor-Zeilen) nicht anzeigen
  const items = Array.isArray(doc?.items)
    ? doc.items.filter((i) => String(i?.name || "").trim())
    : [];
  const pinned = items.filter((i) => !!i.pinned);
  const others = items.filter((i) => !i.pinned);

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
  const isCenter = titleAlign === "center";

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

    const gap = 8;
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

      setScrollViewportHeight(Math.round(viewportH));
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

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
        color: textColor,
        background: "transparent",
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        padding: 8,
        textShadow: "0 2px 6px rgba(0,0,0,.65)",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius,
          minWidth: boxWidth,
          maxWidth: boxWidth,
          boxShadow: "0 8px 24px rgba(0,0,0,.35)",
          overflow: "hidden",
        }}
      >
        {/* Bewusst KEINE Hintergrundebene über die ganze Box: die lag sonst
            unter Header und Timer und war durch deren eigene Deckkraft nicht
            wegzubekommen — ein Timer auf 0 % blieb sichtbar, weil boxBg
            durchschien. Jeder Abschnitt füllt jetzt nur seine eigene Fläche. */}

        {/* Header Wrapper */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            borderBottom: "1px solid rgba(255,255,255,.08)",
          }}
        >
          {/* Header Background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: headerBg || boxBg,
              opacity: headerAlpha,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Header Content */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              gridTemplateColumns: isCenter ? "1fr auto 1fr" : "auto 1fr auto",
              alignItems: "center",
              padding: "10px 14px",
              columnGap: 8,
            }}
          >
            <div
              style={{
                visibility: isCenter ? "visible" : "hidden",
                width: isCenter ? "auto" : 0,
                gridColumn: "1",
              }}
            />
            <div
              style={{
                fontWeight: 800,
                textAlign: isCenter ? "center" : "left",
                gridColumn: isCenter ? "2" : "1",
                color: effectiveTitleColor,
                fontSize: `${titleFontSize}px`,
              }}
            >
              {doc.title || "WinChallenge"}
            </div>
          </div>
        </div>

        {/* Items */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* „Hintergrund"-Deckkraft wirkt genau hier: die Fläche um die
              Zeilen herum. Header und Timer regeln ihre eigene. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: boxBg,
              opacity: boxAlpha,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {pinned.map((it) => (
            <OverlayRow
              key={it.id}
              it={it}
              accent={accent}
              itemFontSize={itemFontSize}
              itemBg={itemBg}
              itemAlpha={itemAlpha}
              counterAlpha={counterAlpha}
              rowRadius={rowRadius}
              badgeRadius={badgeRadius}
            />
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
                  gap: 8,
                  willChange: "transform",
                }}
              >
                {others.map((it, idx) => (
                  <div
                    key={it.id}
                    ref={idx === 0 ? firstScrollRowRef : undefined}
                  >
                    <OverlayRow
                      it={it}
                      accent={accent}
                      itemFontSize={itemFontSize}
                      itemBg={itemBg}
                      itemAlpha={itemAlpha}
              counterAlpha={counterAlpha}
              rowRadius={rowRadius}
              badgeRadius={badgeRadius}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {visibleOthers.map((it) => (
                <OverlayRow
                  key={it.id}
                  it={it}
                  accent={accent}
                  itemFontSize={itemFontSize}
                  itemBg={itemBg}
                  itemAlpha={itemAlpha}
              counterAlpha={counterAlpha}
              rowRadius={rowRadius}
              badgeRadius={badgeRadius}
                />
              ))}
              {Array.from({ length: placeholders }).map((_, i) => (
                <OverlayRowPlaceholder key={`ph-${i}`} />
              ))}
            </>
          )}
        </div>
        {showTimer && (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              borderTop: "1px solid rgba(255,255,255,.08)",
              padding: "6px 12px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: itemFontSize ? `${itemFontSize}px` : 16,
            }}
          >
            {/* Eigene Füllung, damit die Timer-Deckkraft die Uhrzeit nicht
                mitfärbt. Gefüllt wird mit der Box-Farbe: dadurch sieht die
                Leiste bei gleicher Deckkraft aus wie zuvor, lässt sich aber
                bis auf 0 herunterziehen. */}
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: boxBg,
                opacity: timerAlpha,
                pointerEvents: "none",
              }}
            />
            <span
              ref={timerDotRef}
              style={{
                position: "relative",
                display: "inline-block",
                width: "0.7em",
                height: "0.7em",
                borderRadius: "50%",
                background: doc.timer?.running ? "#22c55e" : "#ef4444",
                opacity: 0.8,
                flexShrink: 0,
              }}
            />
            <span ref={timerDisplayRef} style={{ position: "relative" }}>
              {msToClock(doc.timer?.running
                ? Date.now() - (doc.timer?.startedAt || 0)
                : (doc.timer?.elapsedMs || 0))}
            </span>
          </div>
        )}

        {/* Pager Dots */}
        {pagingEnabled && !scrollingEnabled && pageCount > 1 && (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              padding: "6px 0 10px",
            }}
          >
            {/* Gehört zur Fläche um die Zeilen, also dieselbe Deckkraft */}
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: boxBg,
                opacity: boxAlpha,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                style={{
                  position: "relative",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background:
                    i === pageIndex ? accent : "rgba(255,255,255,.28)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OverlayRow({ it, accent, itemFontSize, itemBg, itemAlpha, counterAlpha, rowRadius = 10, badgeRadius = 8 }) {
  const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
  const rowAlpha = clamp01(itemAlpha, 0.6);
  const rowBgColor = itemBg || "#ffffff";
  const rowBgOpacity = itemBg ? rowAlpha : 0.04;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 10px",
        borderRadius: rowRadius,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: rowBgColor,
          opacity: rowBgOpacity,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: done ? "#2ecc71" : "inherit",
          fontSize: itemFontSize ? `${itemFontSize}px` : undefined,
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
            style={{ color: accent || "#9146FF", flexShrink: 0 }}
          />
        ) : null}
        {it.name}
      </span>

      {it.useWins ? (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            padding: "2px 10px",
            borderRadius: badgeRadius,
            border: `1px solid ${hexToRgba(accent || "#9146FF", 0.5)}`,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            overflow: "hidden",
            // Nie schrumpfen und nie umbrechen: dadurch bricht der Name früher
            // um und die Zähler-Anzeige bleibt einzeilig und mittig.
            flexShrink: 0,
            alignSelf: "center",
          }}
        >
          {/* Eigene Füllung, damit die Zähler-Deckkraft die Zahlen nicht
              mitfärbt. Gefüllt wird mit der Zeilenfarbe, nicht mit Weiß:
              sonst wird der Text bei hoher Deckkraft unlesbar. */}
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: itemBg || "#ffffff",
              opacity: clamp01(counterAlpha, 0.06),
              pointerEvents: "none",
            }}
          />
          <span style={{ position: "relative" }}>
            {it.progress || 0} / {it.target || 0}
          </span>
        </span>
      ) : null}

      {/* Ein einziger Haken für beide Arten von Challenges — mit und ohne
          Zähler sehen erledigte Einträge dadurch gleich aus. Der Platz wird
          immer reserviert (unsichtbar, wenn offen), damit die Zeile beim
          Abhaken nicht springt und nicht neu umbricht. */}
      <Check
        size="1em"
        strokeWidth={3.5}
        aria-label={done ? "erledigt" : undefined}
        style={{
          position: "relative",
          zIndex: 1,
          color: "#2ecc71",
          flexShrink: 0,
          alignSelf: "center",
          visibility: done ? "visible" : "hidden",
        }}
      />
    </div>
  );
}

function OverlayRowPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(255,255,255,.04)",
        padding: "8px 10px",
        borderRadius: 10,
        visibility: "hidden",
      }}
    >
      <span>placeholder</span>
      <span>0 / 0</span>
    </div>
  );
}

function hexToRgba(hex, alpha = 1) {
  let c = (hex || "#000000").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}