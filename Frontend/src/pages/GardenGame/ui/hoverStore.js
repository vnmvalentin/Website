// ui/hoverStore.js
// Winziger externer Store für die Pflanzen-Hover-Karte.
//
// Zweck: Mausbewegungen über dem Acker sollen NICHT den React-Baum von GameContainer
// anfassen. Vorher erzeugte onCanvasMove bei jeder Bewegung ein neues hoverInfo-Objekt
// und rerenderte damit die gesamte Komponente.
//
// `set` meldet sich nur bei einem ZELLWECHSEL — Bewegung innerhalb derselben Pflanze
// kostet gar nichts mehr, und die Karte steht ruhig statt am Zeiger zu kleben.
export function createHoverStore() {
    let value = null; // { key, x, y } | null
    const listeners = new Set();
    return {
        set(next) {
            if ((value?.key ?? null) === (next?.key ?? null)) return false;
            value = next;
            for (const l of listeners) l();
            return true;
        },
        clear() {
            if (value === null) return false;
            value = null;
            for (const l of listeners) l();
            return true;
        },
        getSnapshot: () => value,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
