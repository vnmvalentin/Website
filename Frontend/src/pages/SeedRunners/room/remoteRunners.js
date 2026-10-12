// remoteRunners.js — Positionen der ANDEREN Läufer im Raum (Geister und Zuschauen, 27.09.2026).
//
// Der Server bündelt die Positionen aller Läufer und schickt sie etwa 10× pro Sekunde (Backend roomManager.js,
// `sr:pos`). Zwischen zwei Paketen liegen also ~100 ms, dazu kommt Schwankung im Netz. Damit eine Figur trotzdem
// flüssig läuft, zeigt die Anzeige jeden Läufer mit einer kleinen Verzögerung (DELAY_MS) und mischt zwischen den beiden
// Paketen, die diesen Zeitpunkt einrahmen. Vorausgerechnet wird nichts: Fehlt ein Paket, bleibt die Figur kurz stehen,
// statt in eine Wand zu fliegen.
//
// Außerhalb von React (10 Pakete pro Sekunde sollen keine Neuzeichnung der Seite auslösen): Die Rennansicht fragt die
// Positionen in ihrer Bildschleife ab. Kein DOM-Zugriff, damit die Tests es direkt in Node laufen lassen können.

const DELAY_MS = 200;
const KEEP = 6;
// Ein Läufer, von dem so lange nichts kam, ist nicht mehr unterwegs (im Ziel, aufgegeben, getrennt)
const STALE_MS = 3000;
// Weiter als das springt keine Figur zwischen zwei Paketen: Respawn oder Neustart — dann nicht quer durchs Level gleiten
const SNAP_PX = 160;
const TICK_HZ = 120;

export function createRemoteRunners({ delayMs = DELAY_MS } = {}) {
  const runners = new Map();   // id → [{ at, x, y, f, t, a }] (älteste zuerst)

  return {
    /** Paket vom Server: list = [[id, x, y, f, t, a], …]; at = Empfangszeit (performance.now) */
    push(list, at) {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!Array.isArray(item) || item.length < 6) continue;
        const [id, x, y, f, t, a] = item;
        if (typeof id !== 'string' || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) continue;
        const sample = { at, x, y, f: f === -1 ? -1 : 1, t, a: Number.isFinite(a) ? a : 0 };
        const buf = runners.get(id);
        const last = buf?.[buf.length - 1];
        if (!buf || !last || last.a !== sample.a || t < last.t || Math.abs(x - last.x) > SNAP_PX || Math.abs(y - last.y) > SNAP_PX) {
          // Neuer Versuch, Respawn oder erstes Paket: nicht von der alten Stelle herüberwischen
          runners.set(id, [sample]);
        } else if (t !== last.t) {
          buf.push(sample);
          if (buf.length > KEEP) buf.shift();
        }
      }
    },

    /**
     * Wo steht Läufer `id` zur Zeit `now` (performance.now)? null, wenn nichts (Aktuelles) da ist.
     * { x, y, facing, vx, tick, attempt } — tick: geschätzter Sim-Tick des Läufers JETZT (für die Welt des Zuschauers)
     */
    sample(id, now) {
      const buf = runners.get(id);
      if (!buf || !buf.length) return null;
      const last = buf[buf.length - 1];
      if (now - last.at > STALE_MS) return null;
      const renderAt = now - delayMs;
      let x = last.x;
      let y = last.y;
      let facing = last.f;
      for (let i = buf.length - 1; i > 0; i--) {
        const b = buf[i];
        const a = buf[i - 1];
        if (a.at <= renderAt && renderAt <= b.at) {
          const k = b.at > a.at ? (renderAt - a.at) / (b.at - a.at) : 1;
          x = a.x + (b.x - a.x) * k;
          y = a.y + (b.y - a.y) * k;
          facing = k < 0.5 ? a.f : b.f;
          break;
        }
        if (i === 1 && renderAt < a.at) {
          x = a.x;
          y = a.y;
          facing = a.f;
        }
      }
      const prev = buf.length > 1 ? buf[buf.length - 2] : null;
      const vx = prev && last.t > prev.t ? ((last.x - prev.x) * TICK_HZ) / (last.t - prev.t) : 0;
      return { x, y, facing, vx, tick: last.t + Math.max(0, ((now - delayMs - last.at) * TICK_HZ) / 1000), attempt: last.a };
    },

    ids() {
      return [...runners.keys()];
    },

    clear() {
      runners.clear();
    },
  };
}
