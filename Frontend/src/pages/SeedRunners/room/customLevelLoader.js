// Lädt und prüft das Custom-Level einer Serien-Runde (roomManager.js, Phase 4): Dokument vom Server holen, selbst
// nachrechnen (der Hash muss zu dem passen, den der Server mitgeschickt hat — der Client glaubt ihm nicht blind).
//
// Ein Cache je Share-Code: Eine Runde, die während der Ergebnis-Anzeige schon vorgeladen wurde (SeedRunnersRoom.jsx
// ruft `preload` dafür auf), steht beim tatsächlichen Rundenstart sofort bereit, statt erst dann zu laden.
export function createCustomLevelLoader({ getLevelDoc, validateDoc }) {
  const cache = new Map(); // code -> Promise<Level | null>

  function load(code) {
    if (!cache.has(code)) {
      cache.set(code, (async () => {
        try {
          const served = await getLevelDoc(code);
          if (!served) return null;
          const res = validateDoc(served.doc, { smoke: false });
          return res.ok && res.hash === served.hash ? res.level : null;
        } catch {
          return null;
        }
      })());
    }
    return cache.get(code);
  }

  return { load, preload: (code) => { load(code); } };
}
