// Regressionstest für den Countdown-Anzeigefehler (Nutzer-Feedback 22.09.2026): "Gleich geht's los" blieb ab
// und zu zu lange stehen, oder der Countdown begann bei "2" statt "3" bzw. sprang direkt zu "1". Ursache: die
// angezeigte Zahl wurde bei jeder neuen (genaueren) Uhrenmessung frisch aus dem noch laufenden Start-Zeitpunkt
// abgeleitet — eine spätere, präzisere Probe konnte den Rest-Wert dadurch nach oben ODER unten verschieben.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStartPerf, freezeDisplayStart, countdownNumber, VISIBLE_WINDOW_MS } from '../countdown.js';

test('projectStartPerf: Serverzeit über den Uhrenabgleich korrekt auf die now-Skala projiziert', () => {
  const sync = { toLocal: (serverMs) => serverMs - 250 }; // Server 250 ms "voraus"
  const at = Date.now() + 4000; // Server sagt: Start in 4 s
  const now = 12345; // beliebiger performance.now()-Wert
  const startPerf = projectStartPerf(now, at, sync);
  // Erwartet: now + (Rest bis zum Start). Toleranz für den Sub-Millisekunden-Abstand zwischen den beiden Date.now()-Aufrufen.
  assert.ok(Math.abs(startPerf - (now + 4000 - 250)) < 20, `startPerf=${startPerf}`);
});

test('freezeDisplayStart: einmal gesetzt, bleibt unverändert — auch wenn startPerf sich danach weiter verschiebt', () => {
  let display = null;
  display = freezeDisplayStart(display, 0, 3000);           // 3,0 s Rest: sofort im sichtbaren Fenster (≤ 3,05 s)
  assert.equal(display, 3000);
  display = freezeDisplayStart(display, 50, 2600);           // eine genauere Probe verschiebt startPerf — displayStartPerf bleibt
  assert.equal(display, 3000, 'darf sich nach dem ersten Eintritt nicht mehr ändern');
  display = freezeDisplayStart(display, 100, 4000);          // auch eine Probe, die startPerf wieder nach HINTEN schiebt, ändert nichts
  assert.equal(display, 3000);
});

test('freezeDisplayStart: bleibt null, bis der Rest erstmals ins sichtbare Fenster (≤ 3,05 s) fällt', () => {
  let display = freezeDisplayStart(null, 0, 5000);           // 5 s Rest: noch zu früh
  assert.equal(display, null);
  display = freezeDisplayStart(display, 1000, 4200);         // 3,2 s Rest: immer noch zu früh
  assert.equal(display, null);
  display = freezeDisplayStart(display, 1200, 4000);         // jetzt im Fenster: 2,8 s Rest
  assert.equal(display, 4000);
});

test('countdownNumber: zählt exakt 3 → 2 → 1 ohne Sprung, aus einem einmal eingefrorenen displayStartPerf', () => {
  const displayStartPerf = 3000;
  const seen = [];
  for (let now = 0; now <= 3000; now += 100) {
    const n = countdownNumber(now, displayStartPerf);
    if (n !== null && seen[seen.length - 1] !== n) seen.push(n);
  }
  assert.deepEqual(seen, [3, 2, 1], `Zahlenfolge muss lückenlos absteigen, war: ${seen.join(',')}`);
});

test('countdownNumber: außerhalb des Fensters (noch zu früh oder schon vorbei) ist null', () => {
  assert.equal(countdownNumber(0, null), null);
  assert.equal(countdownNumber(0, VISIBLE_WINDOW_MS + 1), null, 'noch zu früh');
  assert.equal(countdownNumber(3100, 3000), null, 'schon vorbei (negativer Rest)');
});

// ── Das eigentliche Nutzer-Szenario: mehrere Bilder mit einer sich einpendelnden Uhrenmessung ───────────────
//
// projectStartPerf selbst braucht die echte Wanduhr (Date.now()) und lässt sich deshalb nicht sinnvoll über
// mehrere simulierte Bilder "vorspulen" (die Testschleife läuft real in < 1 ms, die Wanduhr bewegt sich also
// nicht mit). Die eigentliche Fehlerquelle liegt ohnehin nicht dort, sondern im Zusammenspiel von
// freezeDisplayStart und countdownNumber — deshalb wird hier direkt eine Folge von startPerf-SCHÄTZUNGEN
// vorgegeben, wie projectStartPerf sie über mehrere Bilder tatsächlich liefern würde: die ersten Bilder noch
// ungenau (frühe, unzuverlässige Ping-Antworten), einmal nach oben und einmal nach unten korrigiert, danach stabil.
function frames(startPerfByNow) {
  let display = null;
  const numbers = [];
  for (const [now, startPerf] of startPerfByNow) {
    display = freezeDisplayStart(display, now, startPerf);
    numbers.push(countdownNumber(now, display));
  }
  return numbers;
}

test('Regression: die angezeigte Folge bleibt lückenlos 3→2→1, auch wenn die Uhren-Schätzung erst nach oben '
  + 'und dann nach unten korrigiert wird', () => {
  const jitterySequence = [
    [0, 3000],     // 3,0 s Rest: tritt sofort ins Fenster ein, zeigt "3"
    [100, 3500],   // Korrektur nach OBEN (Start scheint sich zu verzögern) — ohne Fix würde die Zahl verschwinden
    [200, 1100],   // Korrektur nach UNTEN (Start ist eigentlich näher) — ohne Fix würde sie auf "1" springen
    [300, 3050],   // pendelt sich ein
    ...Array.from({ length: 27 }, (_, i) => [400 + i * 100, 3000]), // danach stabil beim ursprünglichen Ziel
  ];
  const numbers = frames(jitterySequence);
  const distinct = numbers.filter((n, i) => n !== numbers[i - 1]);
  assert.deepEqual(distinct, [3, 2, 1, null], `Angezeigte Stufen (inkl. Start): ${distinct.join(',')}`);
});

test('Gegenprobe: dieselbe Uhren-Einpendelung hätte OHNE das Einfrieren (naiv aus startPerf abgeleitet) '
  + 'tatsächlich eine Lücke oder einen Rückfall erzeugt', () => {
  const jitterySequence = [[0, 3000], [100, 3500], [200, 1100], [300, 3050]];
  const naive = (now, startPerf) => {
    const remaining = (startPerf - now) / 1000;
    return remaining > 0 && remaining <= VISIBLE_WINDOW_MS / 1000 ? Math.ceil(remaining - 0.05) : null;
  };
  const numbers = jitterySequence.map(([now, startPerf]) => naive(now, startPerf));
  const distinct = numbers.filter((n, i) => n !== numbers[i - 1]);
  // Erwartung: NICHT lückenlos — sonst wäre dieses Beispiel kein aussagekräftiger Beleg für den gemeldeten Fehler.
  assert.notDeepEqual(distinct, [3], 'dieser Jitter zeigt ohne Fix keinen Unterschied — Beispiel anpassen');
  assert.ok(distinct.includes(null) || distinct.some((n, i) => i > 0 && n > distinct[i - 1]),
    `erwartet einen Rückfall auf "Gleich geht's los" oder einen Sprung nach oben, war: ${distinct.join(',')}`);
});
