// engine/InputHandler.js
// Tastatur-Zustand plus Kachel-Sprung-Auslösung (siehe consumeHop). Kein
// Diagonal-Movement mehr — ein Sprung geht immer genau in eine der vier
// Richtungen, damit die Figur wirklich von Kachelmitte zu Kachelmitte hüpft.

/**
 * Tippt der Spieler gerade in ein Eingabefeld?
 * Ohne diese Pruefung laeuft die Figur beim Schreiben einer Nachricht los —
 * jedes "w" im Text war zugleich ein Schritt nach oben.
 */
// Modul-Konstante statt Objektliteral in consumeHop: die läuft jeden Frame,
// vier kleine Objekte pro Aufruf neu anzulegen ist unnötiger Druck auf den GC.
const HOP_DIRS = [
    { keys: ["w", "arrowup"], id: "w", dx: 0, dy: -1 },
    { keys: ["s", "arrowdown"], id: "s", dx: 0, dy: 1 },
    { keys: ["a", "arrowleft"], id: "a", dx: -1, dy: 0 },
    { keys: ["d", "arrowright"], id: "d", dx: 1, dy: 0 },
];

function schreibtGerade(e) {
    const el = e.target;
    if (!el || el === window || el === document) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

export default class InputHandler {
    constructor() {
        this.keys = new Set();
        this.justPressed = new Set(); // Tracks newly pressed keys this frame
        this._pendingAdd = new Set();
        this._pendingRemove = new Set();
        // Letzter Sprung-Zeitpunkt je Richtungstaste — für die Wiederholung beim
        // Halten (siehe consumeHop). Eigene Map statt eines einzelnen Timers, damit
        // ein Tastenwechsel mitten im Halten (a → d) sofort den frischen Druck zählt.
        this._hopLastFire = new Map();

        this._onKeyDown = (e) => {
            if (schreibtGerade(e)) return;
            if (!this.keys.has(e.key.toLowerCase())) {
                this._pendingAdd.add(e.key.toLowerCase());
            }
        };
        this._onKeyUp = (e) => {
            // Losgelassen wird IMMER verarbeitet: sonst bleibt eine Taste haengen,
            // die vor dem Klick ins Feld gedrueckt wurde, und die Figur laeuft ewig.
            this._pendingRemove.add(e.key.toLowerCase());
        };
        // Fokus in ein Eingabefeld: alles loslassen, was noch gedrueckt ist.
        this._onFocusIn = (e) => {
            if (schreibtGerade(e)) this._onBlur();
        };
        this._onBlur = () => {
            this._pendingAdd.clear();
            this._pendingRemove.clear();
            this.keys.clear();
            this.justPressed.clear();
            this._hopLastFire.clear();
        };
        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup", this._onKeyUp);
        window.addEventListener("blur", this._onBlur);
        window.addEventListener("focusin", this._onFocusIn);
    }

    destroy() {
        if (this._onKeyDown) {
            window.removeEventListener("keydown", this._onKeyDown);
            window.removeEventListener("keyup", this._onKeyUp);
            window.removeEventListener("blur", this._onBlur);
            window.removeEventListener("focusin", this._onFocusIn);
            this._onKeyDown = null;
            this._onKeyUp = null;
            this._onBlur = null;
            this._onFocusIn = null;
        }
        this.keys.clear();
        this.justPressed.clear();
        this._pendingAdd.clear();
        this._pendingRemove.clear();
        this._hopLastFire.clear();
    }

    // Call once per frame to flush input state
    update() {
        this.justPressed.clear();
        for (const key of this._pendingAdd) {
            this.keys.add(key);
            this.justPressed.add(key);
        }
        for (const key of this._pendingRemove) {
            this.keys.delete(key);
        }
        this._pendingAdd.clear();
        this._pendingRemove.clear();
    }

    /**
     * Liefert höchstens EINEN Kachel-Sprung für dieses Frame — oder null. Ein
     * frischer Tastendruck feuert sofort; wird die Taste gehalten, wiederholt
     * sich der Sprung erst wieder nach `repeatMs` (siehe MAP_CONFIG.hopRepeatMs).
     * Kein Dauerlauf mehr: jede Bewegung ist ein diskreter Schritt.
     *
     * Absichtlich nur 4-Wege, keine Diagonalen — sonst müsste jede Sprung-Kachel
     * gegen zwei Nachbarn statt einen geprüft werden, und der Geist stünde nie
     * wirklich mittig auf dem Weg zwischen zwei Feldern.
     *
     * Werden mehrere Richtungstasten gleichzeitig gehalten, gewinnt die zuletzt
     * GEDRÜCKTE — sonst "kämpfen" z. B. A und D sichtbar miteinander, sobald
     * beide schon eine Weile unten sind.
     */
    consumeHop(repeatMs = 150) {
        const now = performance.now();

        let fresh = null;
        let due = null;
        for (const dir of HOP_DIRS) {
            const pressed = dir.keys.some((k) => this.keys.has(k));
            if (!pressed) { this._hopLastFire.delete(dir.id); continue; }
            const justPressed = dir.keys.some((k) => this.justPressed.has(k));
            if (justPressed) {
                fresh = dir; // letzter frischer Druck gewinnt immer
                continue;
            }
            if (!due) {
                const last = this._hopLastFire.get(dir.id) || 0;
                if (now - last >= repeatMs) due = dir;
            }
        }

        const chosen = fresh || due;
        if (!chosen) return null;
        this._hopLastFire.set(chosen.id, now);
        return { dx: chosen.dx, dy: chosen.dy };
    }

    /**
     * Wie consumeHop, aber nur für eine FRISCH gedrückte Richtungstaste in
     * diesem Frame — und ohne die Wiederholungs-Uhr (_hopLastFire) zu berühren.
     * Für das frühe Abbiegen mitten in einem laufenden Sprung (siehe
     * GameContainer, Feedback 28.08.: Richtungswechsel sollen "flüssiger"
     * wirken). Ein bloß GEHALTENER Zweitschlüssel liefert hier absichtlich
     * nichts — sonst würde ein Sprung jedes Mal neu angestoßen, sobald sein
     * eigenes Wiederhol-Intervall zufällig während eines fremden Sprungs abläuft.
     */
    peekFreshDirection() {
        for (const dir of HOP_DIRS) {
            if (dir.keys.some((k) => this.justPressed.has(k))) return { dx: dir.dx, dy: dir.dy };
        }
        return null;
    }

    isPressed(key) {
        return this.keys.has(key.toLowerCase());
    }

    wasJustPressed(key) {
        return this.justPressed.has(key.toLowerCase());
    }
}
