// Sinus und Kosinus für die Sim — ohne Math.sin/Math.cos.
//
// Deren Ergebnisse sind laut Sprachdefinition nur "implementierungsabhängig genau": Chrome,
// Firefox, Safari und Node dürfen sich in den letzten Bits unterscheiden. Für rotierende Sägen
// und Ähnliches würde das heißen, dass zwei Spieler derselben Runde eine minimal andere Welt
// sehen — und der Replay auf dem Server eine dritte. Multiplikation und Addition dagegen sind
// nach IEEE 754 exakt festgelegt, deshalb wird die Tabelle nur daraus gebaut.
//
// Aufbau: Start bei (1, 0), dann 1024-mal um den Schritt 2π/1024 weiterdrehen. Die beiden
// Schrittkonstanten sind Literale (einmalig mit Math.cos/Math.sin bestimmt und hier fest
// eingetragen), damit das Ergebnis nicht von der Plattform abhängt. Der angesammelte Fehler
// liegt bei ~1e-13 — für ein Spielobjekt völlig belanglos, aber überall gleich.

const N = 1024;
const STEP_COS = 0.9999811752826011;
const STEP_SIN = 0.006135884649154475;

const COS = new Float64Array(N + 1);
const SIN = new Float64Array(N + 1);
{
  let c = 1;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    COS[i] = c;
    SIN[i] = s;
    const nc = c * STEP_COS - s * STEP_SIN;
    s = s * STEP_COS + c * STEP_SIN;
    c = nc;
  }
}

// Winkel in UMDREHUNGEN (0..1 = ein voller Kreis), linear zwischen den Tabellenwerten
// interpoliert. Umdrehungen statt Bogenmaß, weil die Sim ohnehin mit Ticks rechnet und kein
// π braucht.
function lookup(table, turns) {
  const t = turns - Math.floor(turns);
  const f = t * N;
  const i = Math.floor(f);
  const frac = f - i;
  return table[i] + (table[i + 1] - table[i]) * frac;
}

export const cosTurns = (turns) => lookup(COS, turns);
export const sinTurns = (turns) => lookup(SIN, turns);
