// ui/angelTon.js
// Kleine Töne fürs Angeln (11.11.), direkt erzeugt statt aus Dateien: Anbiss, Treffer auf
// einen Ring (steigt mit jedem Treffer eine Stufe), „Perfekt“, „Daneben“. Vorher liefen hier
// die Töne des Ladens (Rotation, Menü auf) — die gehören nicht an den Teich.

let ctx = null;

function hole() {
    if (ctx) return ctx;
    const Klasse = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Klasse) return null;
    try { ctx = new Klasse(); } catch { ctx = null; }
    return ctx;
}

/** Ein kurzer Ton: Wellenform, Tonhöhe (Hz), Beginn (s ab jetzt), Dauer (s), Lautstärke 0..1. */
function piep(c, form, hz, ab, dauer, laut, zielHz = null) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + ab;
    o.type = form;
    o.frequency.setValueAtTime(hz, t);
    if (zielHz) o.frequency.exponentialRampToValueAtTime(zielHz, t + dauer);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, laut), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dauer + 0.02);
}

// Fünftonleiter ab C5 — egal welche Stufe, es klingt nie schief
const LEITER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/**
 * @param {"biss"|"treffer"|"perfekt"|"daneben"|"fang"} art
 * @param {number} lautstaerke Effekt-Lautstärke des Spiels, 0..1
 * @param {number} stufe       wievielter Treffer in Folge (hebt den Ton)
 */
export function angelTon(art, lautstaerke = 0.5, stufe = 0) {
    const c = hole();
    const laut = Math.max(0, Math.min(1, Number(lautstaerke) || 0)) * 0.5;
    if (!c || laut <= 0.001) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    const hz = LEITER[Math.max(0, Math.min(LEITER.length - 1, stufe))];
    if (art === "biss") {
        // „Plopp-plopp“: zwei kurze, fallende Töne wie ein untertauchender Schwimmer
        piep(c, "sine", 620, 0, 0.09, laut, 300);
        piep(c, "sine", 760, 0.12, 0.1, laut, 340);
    } else if (art === "treffer") {
        piep(c, "triangle", hz, 0, 0.16, laut);
    } else if (art === "perfekt") {
        piep(c, "triangle", hz, 0, 0.16, laut);
        piep(c, "sine", hz * 2, 0.05, 0.2, laut * 0.6);
    } else if (art === "daneben") {
        piep(c, "sawtooth", 150, 0, 0.2, laut * 0.5, 90);
    } else if (art === "fang") {
        [0, 2, 4, 5].forEach((s, i) => piep(c, "triangle", LEITER[s], i * 0.08, 0.2, laut * 0.9));
    }
}
