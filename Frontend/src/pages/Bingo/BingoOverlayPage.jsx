import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import BingoGrid from "../../components/bingo/BingoGrid";
import { getOverlay, markOverlayCell } from "../../utils/bingoApi";

export default function BingoOverlayPage() {
  const { overlayKey } = useParams();

  const [state, setState] = useState({
    loading: true,
    error: "",
    gridSize: 5,
    style: { cardBg: "#000000", cardOpacity: 0.0, textColor: "#ffffff", lineColor: "#ffffff", lineWidth: 2 },
    cells: [],
    locked: false,
  });

  const refreshNonceRef = useRef(0);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const json = await getOverlay(overlayKey, refreshNonceRef.current);

        if (!alive) return;

        if (json.unchanged) {
          refreshNonceRef.current = json.refreshNonce || refreshNonceRef.current;
          return;
        }

        refreshNonceRef.current = json.refreshNonce || 0;
        setState({
          loading: false,
          error: "",
          gridSize: json.gridSize || 5,
          style: json.style || {},
          cells: json.cells || [],
          locked: !!json.locked,
        });
      } catch (e) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: e.message || "Overlay nicht gefunden",
        }));
      }
    };

    tick();
    const t = setInterval(tick, 800);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [overlayKey]);

  const handleCellClick = async (idx, cell) => {
    // Wenn nicht gesperrt/gestartet (bei Group) oder generell erlaubt:
    // Wir senden einfach den Request. Backend prüft Permission.
    // Toggle: Wenn X -> None, sonst -> X
    const nextMark = cell.mark === "x" ? "none" : "x";
    
    // Optimistic Update für sofortiges Feedback
    const newCells = [...state.cells];
    newCells[idx] = { ...newCells[idx], mark: nextMark };
    setState(s => ({ ...s, cells: newCells }));

    try {
      await markOverlayCell(overlayKey, idx, nextMark);
    } catch (e) {
      console.error(e);
      // Revert theoretisch hier nötig, aber nächste Poll korrigiert es eh
    }
  };

  return (
    <div className="w-screen h-screen p-0 m-0 bg-transparent">
      {state.error ? (
        <div className="text-white/70 p-4">{state.error}</div>
      ) : (
        <div className="w-screen h-screen flex items-center justify-center">
          <div className="w-[92vmin] h-[92vmin]">
            <BingoGrid
              gridSize={state.gridSize}
              cells={state.cells}
              style={state.style}
              interactive={true} // Immer interaktiv für Browserquellen
              onCellClick={handleCellClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}