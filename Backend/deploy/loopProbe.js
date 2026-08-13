// loopProbe.js — Diagnose: Woher kommen Event-Loop-Blockaden auf diesem Server?
//
// Dieser Prozess tut NICHTS außer messen: keine Sockets, keine Physik, kein Spiel. Er stellt
// einen Timer auf alle 20 ms und schreibt auf, wie viel zu spät der wirklich feuert — exakt
// dieselbe Messung wie `sb` im Blobby-Snapshot, nur ohne Blobby.
//
// Zeigt DIESER Prozess dieselben Ausschläge wie Blobby, liegt es nicht an Blobbys Code.
// Zweimal laufen lassen: einmal ohne Partie (Grundrauschen der Maschine), einmal während
// einer echten Partie (Aufschlag durch die Last).
//
// FASSUNG 2 — beantwortet zusätzlich die Frage, WAS während einer Blockade passiert ist.
// Fassung 1 hat `iowait` fälschlich zur Leerlaufzeit gezählt; eine Maschine, die auf ihre
// Platte wartet, sah darin aus wie eine untätige Maschine. Genau diese Verwechslung steht
// bei einem VPS aber ganz oben auf der Verdächtigenliste, deshalb hier getrennt.
//
// Aufruf (Dauer in Sekunden, Standard 60):
//   node loopProbe.js 60

const fs = require("fs");
const os = require("os");

const SECONDS = Math.max(5, Math.min(600, Number(process.argv[2]) || 60));
const PROBE_MS = 20;
const STALL_MS = 40;      // ab hier wird eine Blockade einzeln aufgeschlüsselt
const NCPU = os.cpus().length;

// ── /proc/stat ──────────────────────────────────────────────────────────────
// Felder der cpu-Zeile: user nice system idle iowait irq softirq steal guest guest_nice
// Einheit sind Jiffies zu je 10 ms, summiert über ALLE Kerne.
function readStat() {
  try {
    const txt = fs.readFileSync("/proc/stat", "utf8");
    const v = txt.split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
    const blocked = Number((txt.match(/^procs_blocked (\d+)/m) || [])[1] || 0);
    return {
      user: v[0] + v[1], sys: v[2], idle: v[3], iowait: v[4] || 0,
      irq: (v[5] || 0) + (v[6] || 0), steal: v[7] || 0,
      total: v.reduce((a, b) => a + b, 0), blocked,
    };
  } catch { return null; }
}

// ── Pressure Stall Information (Linux 4.20+) ────────────────────────────────
// Sagt direkt, wie viel Prozent der Zeit Aufgaben auf CPU bzw. Platte warten mussten.
// Genau die Frage, um die es hier geht — falls der Kernel es anbietet.
function readPsi(what) {
  try {
    const line = fs.readFileSync(`/proc/pressure/${what}`, "utf8").split("\n")[0];
    return Number((line.match(/avg10=([\d.]+)/) || [])[1]);
  } catch { return null; }
}

// ── cgroup-Drosselung ───────────────────────────────────────────────────────
// Die eine Messung, die „der Host plant uns nicht ein" von „unser eigenes
// CPU-Kontingent ist aufgebraucht" unterscheidet. Eine Kontingent-Drosselung
// taucht WEDER als steal NOCH als iowait auf — die Aufgabe wird schlicht nicht
// eingeplant, und von innen sieht es aus wie eine leere Maschine.
//   throttled  = Anzahl gedrosselter Zeitfenster
//   gedrosselt = wie lange insgesamt gedrosselt wurde (ms)
function readThrottle() {
  // cgroup v2
  try {
    const t = fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf8");
    const n = Number((t.match(/^nr_throttled (\d+)/m) || [])[1]);
    const us = Number((t.match(/^throttled_usec (\d+)/m) || [])[1]);
    if (Number.isFinite(n)) return { throttled: n, gedrosselt: Math.round((us || 0) / 1000) };
  } catch { /* weiter mit v1 */ }
  // cgroup v1
  try {
    const t = fs.readFileSync("/sys/fs/cgroup/cpu/cpu.stat", "utf8");
    const n = Number((t.match(/^nr_throttled (\d+)/m) || [])[1]);
    const ns = Number((t.match(/^throttled_time (\d+)/m) || [])[1]);
    if (Number.isFinite(n)) return { throttled: n, gedrosselt: Math.round((ns || 0) / 1e6) };
  } catch { /* nicht vorhanden */ }
  return null;
}

const psiAvailable = readPsi("cpu") !== null;
const statAvailable = readStat() !== null;
const throttleAvailable = readThrottle() !== null;
let throttlePrev = readThrottle();
let throttleStart = throttlePrev;

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
const j2ms = (jiffies) => jiffies * 10;

let bucket = [];
const perSecond = [];
const stalls = [];
let last = process.hrtime.bigint();
let statPrev = readStat();
let statSec = statPrev;
let secStart = Date.now();

console.log(`Messe ${SECONDS} s auf ${NCPU} Kernen.`);
if (!statAvailable) console.log("Hinweis: /proc/stat nicht lesbar (kein Linux) — CPU-Spalten bleiben leer.");
if (statAvailable && !psiAvailable) console.log("Hinweis: /proc/pressure fehlt (Kernel < 4.20 oder abgeschaltet) — PSI-Spalten bleiben leer.");
console.log("\nEinzelne Blockaden über " + STALL_MS + " ms werden sofort aufgeschlüsselt:\n");

const probe = setInterval(() => {
  const now = process.hrtime.bigint();
  const late = Number(now - last) / 1e6 - PROBE_MS;
  last = now;
  const statNow = readStat();

  if (late > 0) bucket.push(late);

  // ── Einzelne Blockade aufschlüsseln ───────────────────────────────────────
  // Was hat die Maschine getan, während unser Timer nicht dran kam? Verbrauchte CPU-Zeit
  // in ms, aufgeteilt nach Art. Zusammen können die Werte bis NCPU × Dauer ergeben.
  if (late > STALL_MS && statNow && statPrev) {
    const d = {
      user: j2ms(statNow.user - statPrev.user),
      sys: j2ms(statNow.sys - statPrev.sys),
      iowait: j2ms(statNow.iowait - statPrev.iowait),
      irq: j2ms(statNow.irq - statPrev.irq),
      steal: j2ms(statNow.steal - statPrev.steal),
      idle: j2ms(statNow.idle - statPrev.idle),
    };
    const th = readThrottle();
    const gedrosselt = th && throttlePrev
      ? { fenster: th.throttled - throttlePrev.throttled, ms: th.gedrosselt - throttlePrev.gedrosselt }
      : null;
    if (th) throttlePrev = th;
    stalls.push({ late, ...d, blocked: statNow.blocked, gedrosselt });
    // Uhrzeit mit Millisekunden, damit sich zwei gleichzeitig laufende Probes vergleichen
    // lassen: Frieren BEIDE im selben Moment ein, stand die ganze VM still (Host). Stolpern
    // sie unabhängig voneinander, liegt es an der Planung innerhalb des Gasts.
    const ts = new Date().toISOString().slice(11, 23);
    console.log(
      `  ⏱ ${ts}  ${late.toFixed(0).padStart(4)} ms blockiert  →  ` +
      `user ${String(d.user).padStart(4)}  sys ${String(d.sys).padStart(4)}  ` +
      `iowait ${String(d.iowait).padStart(4)}  irq ${String(d.irq).padStart(3)}  ` +
      `steal ${String(d.steal).padStart(3)}  idle ${String(d.idle).padStart(5)}  ` +
      `(ms CPU-Zeit) · blockierte Tasks: ${statNow.blocked}` +
      (gedrosselt && gedrosselt.fenster > 0
        ? `  ⚠ GEDROSSELT ${gedrosselt.fenster}× / ${gedrosselt.ms} ms`
        : "")
    );
  }
  statPrev = statNow;

  if (Date.now() - secStart < 1000) return;

  const sorted = bucket.slice().sort((a, b) => a - b);
  const row = {
    p50: pct(sorted, 0.5), p99: pct(sorted, 0.99),
    max: sorted[sorted.length - 1] || 0,
    outliers: bucket.filter((x) => x > 50).length,
  };
  perSecond.push(row);

  let cols = "";
  if (statNow && statSec) {
    const dTot = statNow.total - statSec.total;
    const p = (k) => (dTot > 0 ? `${(100 * (statNow[k] - statSec[k]) / dTot).toFixed(1)}%` : "");
    cols = `${p("user").padStart(7)}${p("sys").padStart(6)}${p("iowait").padStart(8)}${p("steal").padStart(7)}`;
    if (psiAvailable) {
      cols += `${String(readPsi("cpu")).padStart(7)}${String(readPsi("io")).padStart(6)}`;
    }
  }
  statSec = statNow;

  if (perSecond.length === 1) {
    console.log("\n  s |  p50 |  p99 |  max | >50ms |   user   sys  iowait  steal" + (psiAvailable ? " psiCPU psiIO" : ""));
    console.log("----+------+------+------+-------+" + "-".repeat(psiAvailable ? 41 : 28));
  }
  console.log(
    `${String(perSecond.length).padStart(3)} |${row.p50.toFixed(1).padStart(5)} |` +
    `${row.p99.toFixed(1).padStart(5)} |${row.max.toFixed(1).padStart(5)} |` +
    `${String(row.outliers).padStart(6)} |${cols}`
  );

  bucket = [];
  secStart = Date.now();

  if (perSecond.length >= SECONDS) {
    clearInterval(probe);
    const maxima = perSecond.map((r) => r.max).sort((a, b) => a - b);
    const sum = (k) => stalls.reduce((a, s) => a + s[k], 0);
    console.log("\n── Zusammenfassung ──");
    console.log(`schlimmste Sekunde : ${maxima[maxima.length - 1].toFixed(1)} ms`);
    console.log(`typische Sekunde   : ${pct(maxima, 0.5).toFixed(1)} ms (Median der Maxima)`);
    console.log(`Blockaden > ${STALL_MS} ms  : ${stalls.length} in ${SECONDS} s`);
    if (stalls.length) {
      console.log(
        `davon CPU-Zeit     : user ${sum("user")} ms · sys ${sum("sys")} ms · ` +
        `iowait ${sum("iowait")} ms · irq ${sum("irq")} ms · steal ${sum("steal")} ms · idle ${sum("idle")} ms`
      );
      const thEnde = readThrottle();
      if (thEnde && throttleStart) {
        const fenster = thEnde.throttled - throttleStart.throttled;
        const ms = thEnde.gedrosselt - throttleStart.gedrosselt;
        console.log(`CPU-Kontingent     : ${fenster} Drosselungen · ${ms} ms gedrosselt in ${SECONDS} s`);
      } else if (!throttleAvailable) {
        console.log("CPU-Kontingent     : nicht lesbar (keine cgroup-Datei) — Drosselung unbekannt");
      }
      console.log("\nDeutung der Aufschlüsselung:");
      console.log("  · viel `steal`          → der Hypervisor entzieht die vCPU. Nur Tarif/Anbieter hilft.");
      console.log("  · viel `iowait`/blocked → die Maschine wartet auf Speicher. Platte oder Nachbar.");
      console.log("  · viel `user`/`sys`     → ein anderer Prozess rechnet. `top` zeigt welcher.");
      console.log("  · Drosselungen > 0      → das eigene CPU-Kontingent ist aufgebraucht. Sieht von");
      console.log("                            innen aus wie eine leere Maschine, ist aber der Tarif.");
      console.log("                            Mehr vCPU oder höheres Kontingent hilft sofort.");
      console.log("  · fast nur `idle`, KEINE Drosselung");
      console.log("                          → niemand rechnet, unser Kontingent ist nicht erschöpft,");
      console.log("                            trotzdem kam der Timer nicht dran: der Host plant die");
      console.log("                            vCPU nicht ein, ohne es als steal auszuweisen.");
      console.log("                            Typisch für überbuchte VPS — nur der Anbieter hilft.");
    }
    process.exit(0);
  }
}, PROBE_MS);
