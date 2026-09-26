// Ereignis-Verteiler zwischen Sim und Client.
//
// Die Sim meldet Dinge wie 'jump', 'dash', 'death', 'checkpoint' über `world.emit` (siehe
// sim/world.js). Hier hängen sich die Verbraucher ein — in Phase 1 nur die Ereignisanzeige des
// Test-Panels; später Sound, Partikel, Screen Shake und Freeze-Frame, ohne dass die Sim davon
// etwas weiß.
//
// Ereignisse der Sim: jump, doubleJump, wallJump, land, dash, grappleAttach, grappleRelease,
// checkpoint, finish, death, restart.

export function createEventBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    /** Für Verbraucher, die alle Ereignisse sehen wollen (Protokoll, Debug). */
    onAny(fn) {
      return this.on('*', fn);
    },
    emit(type, data) {
      listeners.get(type)?.forEach((fn) => fn(data, type));
      listeners.get('*')?.forEach((fn) => fn(data, type));
    },
  };
}
