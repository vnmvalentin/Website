// WinChallengeOverlay.jsx — die OBS-Browserquelle. Holt das Dokument, hält den Timer
// am Laufen und skaliert; gezeichnet wird in OverlayView.jsx (dieselbe Komponente
// zeigt die Live-Vorschau im Editor).
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import OverlayView from "./OverlayView";
import { msToClock } from "./overlayUtils";

export default function WinChallengeOverlay() {
  const { overlayKey } = useParams();
  const [doc, setDoc] = useState(null);
  const timerDisplayRef = useRef(null);   // direct DOM update — no re-render
  const docRef = useRef(null);            // always-current doc without closures

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

  if (!doc) return null;

  const timerMs = doc.timer?.running
    ? Date.now() - (doc.timer?.startedAt || 0)
    : (doc.timer?.elapsedMs || 0);
  const scale = Number(doc.style?.scale) || 1;

  return (
    <div
      style={{
        background: "transparent",
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        padding: 8,
        // Die Leiste ist so breit wie ihr Inhalt, nicht wie die Browserquelle
        width: "max-content",
      }}
    >
      <OverlayView doc={doc} timerMs={timerMs} timeRef={timerDisplayRef} />
    </div>
  );
}
