// Fähigkeit „stockwerk": Ein Stockwerk des Turms ist für den Bewegungsgraph eine Brücke von den Randzellen neben der Luke
// UNTEN zu den Randzellen neben der Luke OBEN.
//
// Sein Inneres (Bröckelblöcke, Aufzüge, Federn, Laser, Sägen) kennt der Graph nicht — und muss es nicht: Die Aussage
// „man kommt hinauf" wird für jede Stockwerksart einzeln mit dem echten Solver belegt (Fenster-Test in den Tests und im
// Prüfwerkzeug), nicht mit der Geometrie geschätzt. Der Graph soll sie nur nicht mit einer Karte verwechseln, die er nicht
// lesen kann. Die Platten selbst sind ebener Fels: Wer neben der Luke steht, kommt auf der ganzen Platte zu Fuß überall hin.

/**
 * @param {{von: {x,y}[], nach: {x,y}[], kosten: number}[]} stockwerke  Standzellen (Luft über Fels) in Rasterkoordinaten
 * @returns {(x: number, y: number) => {x: number, y: number, cost: number}[]}
 */
export function baueStockwerkBruecken(stockwerke) {
  const bruecken = new Map();
  for (const s of stockwerke || []) {
    const ziele = s.nach.map((n) => ({ x: n.x, y: n.y, cost: s.kosten }));
    for (const v of s.von) bruecken.set(`${v.x},${v.y}`, ziele);
  }
  return (x, y) => bruecken.get(`${x},${y}`) || [];
}
