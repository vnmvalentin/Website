import React, { useCallback, useMemo } from "react";
import { hexToRgba, gridFontSize } from "./bingoUtils";

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

const BingoGrid = React.memo(function BingoGrid({
  gridSize,
  cells,
  style,
  interactive = false,
  disabled = false,
  onCellClick,
}) {
  const n = Number(gridSize) || 5;
  const safeCells = Array.isArray(cells) ? cells : [];

  const computed = useMemo(() => {
    const baseFont = gridFontSize(n);
    const textScale = clamp(style?.textScale ?? 1, 0.7, 1.8);
    const fontSize = Math.round(baseFont * textScale);

    const cardBg = hexToRgba(style?.cardBg || "#000000", style?.cardOpacity ?? 0.6);
    const textColor = style?.textColor || "#ffffff";
    const lineColor = style?.lineColor || "#ffffff";
    const lineWidth = Math.max(1, Math.min(8, Number(style?.lineWidth ?? 2)));

    const xThickness = Math.max(4, Math.round(fontSize / 5));

    return { fontSize, textScale, cardBg, textColor, lineColor, lineWidth, xThickness };
  }, [n, style]);

  const handleCellClick = useCallback(
    (idx, cell) => {
      if (!interactive || disabled) return;
      onCellClick?.(idx, cell);
    },
    [interactive, disabled, onCellClick]
  );

  return (
    <div
      className="w-full aspect-square rounded-2xl shadow-lg overflow-hidden"
      style={{ backgroundColor: computed.cardBg }}
    >
      <div
        className="grid w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${n}, 1fr)`,
        }}
      >
        {Array.from({ length: n * n }).map((_, idx) => {
          const cell = safeCells[idx] || { text: "", mark: "none", markColor: "" };
          const isColor = cell.mark === "color";
          const isX = cell.mark === "x";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleCellClick(idx, cell)}
              className={`relative flex items-center justify-center text-center p-2 select-none ${
                interactive && !disabled ? "hover:bg-white/10 cursor-pointer" : "cursor-default"
              }`}
              style={{
                borderRight: idx % n !== n - 1 ? `${computed.lineWidth}px solid ${computed.lineColor}` : "none",
                borderBottom: idx < n * (n - 1) ? `${computed.lineWidth}px solid ${computed.lineColor}` : "none",
                color: computed.textColor,
                backgroundColor: isColor ? hexToRgba(cell.markColor || "#22c55e", 0.35) : "transparent",
                fontSize: `${computed.fontSize}px`,
                lineHeight: 1.1,
              }}
            >
              <span className="px-1 break-words">{cell.text}</span>

              {isX && (
                <div className="absolute inset-0 pointer-events-none opacity-85">
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: "160%",
                      height: `${computed.xThickness}px`,
                      backgroundColor: "#ef4444",
                      transform: "translate(-50%, -50%) rotate(45deg)",
                      borderRadius: 999,
                    }}
                  />
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: "160%",
                      height: `${computed.xThickness}px`,
                      backgroundColor: "#ef4444",
                      transform: "translate(-50%, -50%) rotate(-45deg)",
                      borderRadius: 999,
                    }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default BingoGrid;
