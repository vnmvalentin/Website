// Fähigkeit „baustein": Ein eingesetzter Chunk ist für den Bewegungsgraph eine Brücke von seinem
// Eingang zu seinem Ausgang.
//
// Sein Inneres (Gruben, Schächte, Mover, Bröckelbrücken, Portale …) kennt der Graph nicht — und
// muss es auch nicht: Der Chunk ist einzeln vom Solver gelöst (396/396, alle Tempo-Klassen), und
// seine Ränder sind nach Regel ebener Boden auf definierter Höhe (gen/builder.js). Die Aussage
// „man kommt von links nach rechts" steht damit vor dem Bau fest; der Graph soll sie nur nicht
// mit einer Karte verwechseln, die er nicht lesen kann.
//
// Gilt nur für die beiden Randspalten-Paare, nicht für das Innere: Wer mitten in einem Chunk steht,
// bekommt aus dieser Fähigkeit nichts.

/**
 * @param {{x0: number, w: number, entryRow: number, exitRow: number}[]} bausteine  Boden-Oberkanten (Fels-Zeilen), wie stempeln() sie liefert
 * @returns {(x: number, y: number) => {x: number, y: number, cost: number}[]}
 */
export function baueBausteinBruecken(bausteine) {
  const links = new Map();
  for (const b of bausteine || []) {
    const yEin = b.entryRow - 1;                    // Standfläche = Luftkachel über dem Fels
    const yAus = b.exitRow - 1;
    const ziele = [b.x0 + b.w - 2, b.x0 + b.w - 1].map((x) => ({ x, y: yAus, cost: b.w }));
    for (const x of [b.x0, b.x0 + 1]) links.set(`${x},${yEin}`, ziele);
  }
  return (x, y) => links.get(`${x},${y}`) || [];
}
