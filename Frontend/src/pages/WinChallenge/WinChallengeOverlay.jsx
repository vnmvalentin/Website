// WinChallengeOverlay.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

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
  const [now, setNow] = useState(Date.now());
  const scrollInnerRef = useRef(null);
  const firstScrollRowRef = useRef(null);

  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const offsetRef = useRef(0);
  const dirRef = useRef(1); // 1 = runter, -1 = hoch
  const pauseUntilRef = useRef(0);
  const maxOffsetRef = useRef(0);

  const [scrollViewportHeight, setScrollViewportHeight] = useState(null);

  // Polling
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/winchallenge/overlay/${overlayKey}`);
        if (!alive) return;
        const data = await res.json();
        setDoc(data);
      } catch {
        // ignore
      }
    };
    load();
    const iv = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [overlayKey]);

  // Timer-UI tick
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
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

  const elapsed = useMemo(() => {
    if (!doc?.timer) return 0;
    return doc.timer.running
      ? now - (doc.timer.startedAt || 0)
      : doc.timer.elapsedMs || 0;
  }, [doc, now]);

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
    borderRadius = 12,
    scale = 1,
    boxWidth = 520,
    titleAlign = "left",
    titleColor,
    titleFontSize = 20,
    itemFontSize = 16,
    itemBg,
  } = doc?.style || {}; // Fallback auf leeres Objekt

  // Opacity
  const boxAlpha = clamp01(opacity, 0.6);
  const headerAlpha = clamp01(headerOpacity ?? opacity, boxAlpha);

  const effectiveTitleColor = titleColor || textColor;

  // Items sicher laden
  const items = Array.isArray(doc?.items) ? doc.items : [];
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
  let pageIndex = 0;

  if (pagingEnabled && !scrollingEnabled) {
    const slotsForOthers = Math.max(0, pageSize - pinned.length);
    const othersCount = others.length;

    if (slotsForOthers > 0) {
      pageCount = Math.max(1, Math.ceil(othersCount / slotsForOthers));
      const intervalMs =
        Math.max(2, parseInt(pagingIntervalSec || 20, 10)) * 1000;
      pageIndex = Math.floor(now / intervalMs) % pageCount;

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
        scrollInnerRef.current.style.transform = "translateY(0px)";
      }
      return;
    }

    const gap = 8;
    offsetRef.current = 0;
    dirRef.current = 1;
    pauseUntilRef.current = Date.now() + scrollPauseMs;
    if (scrollInnerRef.current) {
      scrollInnerRef.current.style.transform = "translateY(0px)";
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
            scrollInnerRef.current.style.transform = `translateY(${-next}px)`;
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
        {/* Main Background */}
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

            <div
              style={{
                display: showTimer ? "flex" : "none",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 8,
                gridColumn: "3",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {doc.timer?.running ? "🟢" : "🔴"}
              </span>
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                {msToClock(elapsed)}
              </span>
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
          {pinned.map((it) => (
            <OverlayRow
              key={it.id}
              it={it}
              accent={accent}
              itemFontSize={itemFontSize}
              itemBg={itemBg}
              opacity={opacity}
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
                      opacity={opacity}
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
                  opacity={opacity}
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
              background: "rgba(0,0,0,0.15)",
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
            <span style={{ fontSize: "0.7em", opacity: 0.8 }}>
              {doc.timer?.running ? "🟢" : "🔴"}
            </span>
            <span>{msToClock(elapsed)}</span>
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
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                style={{
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

function OverlayRow({ it, accent, itemFontSize, itemBg, opacity }) {
  const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
  const rowAlpha = clamp01(opacity, 0.6);
  const rowBgColor = itemBg || "#ffffff";
  const rowBgOpacity = itemBg ? rowAlpha : 0.04;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        borderRadius: 10,
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
        }}
      >
        {it.pinned ? <span aria-label="pinned">📌</span> : null}
        {it.name}
      </span>

      {it.useWins ? (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            padding: "2px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,.06)",
            border: `1px solid ${hexToRgba(accent || "#9146FF", 0.5)}`,
          }}
        >
          {it.progress || 0} / {it.target || 0}
        </span>
      ) : (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            width: 16,
            height: 16,
            borderRadius: 4,
            border: "2px solid rgba(255,255,255,.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: done ? "#2ecc71" : "transparent",
            background: "rgba(0,0,0,.4)",
          }}
        >
          ✓
        </span>
      )}
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