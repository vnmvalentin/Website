// engine/InputHandler.js
// Smooth movement with diagonal support and input buffering

/**
 * Tippt der Spieler gerade in ein Eingabefeld?
 * Ohne diese Pruefung laeuft die Figur beim Schreiben einer Nachricht los —
 * jedes "w" im Text war zugleich ein Schritt nach oben.
 */
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

    // Returns normalized movement vector (smooth, diagonal-safe)
    getMovement() {
        let dx = 0;
        let dy = 0;
        if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
        if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;
        if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
        if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;

        if (dx !== 0 && dy !== 0) {
            const len = Math.SQRT2;
            dx /= len;
            dy /= len;
        }
        return { dx, dy };
    }

    isPressed(key) {
        return this.keys.has(key.toLowerCase());
    }

    wasJustPressed(key) {
        return this.justPressed.has(key.toLowerCase());
    }
}
