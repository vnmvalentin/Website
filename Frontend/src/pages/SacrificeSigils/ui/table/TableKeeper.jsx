// ui/table/TableKeeper.jsx — hält den einen Tisch über Seitenwechsel hinweg (Rebuild „Am Tisch“, Phase 5).
//
// Bis Phase 4 baute jeder Bildschirm am Tisch (Hauptmenü, Match) seine eigene Szene — vom Menü in die Lobby und von
// der Lobby ins Match war das ein Schnitt mit „Der Tisch wird gedeckt …“. Jetzt steht die Szene in der Hülle:
// Wer am Tisch ist (TableHost), meldet sich hier an; die Szene wird beim ersten Anmelden gebaut und bleibt stehen,
// solange jemand angemeldet ist. Wechselt man von einer Seite zur nächsten (Menü → Lobby → Match), meldet sich der
// nächste Bildschirm an, bevor die Frist abläuft — derselbe Tisch, dieselben Kerzen, die Kamera fährt weiter.
// Erst wenn niemand mehr am Tisch ist (Kartenbuch, bisheriger Tisch), wird sie nach kurzer Frist abgebaut.
//
// Die Bedienelemente der Bildschirme (Meldungen, Pausenmenü …) landen per Portal im Wurzelelement des Tischs
// (.st-root) — wie früher, als TableHost dieses Element selbst besaß.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeeperContext } from "./tableKeeperContext.js";
import { sound } from "../../audio/sound.js";
import { getPrefs } from "../prefs.js";
import { meldeFehler } from "../../../../utils/fehlerMelder.js";

/** So lange bleibt der Tisch nach dem letzten Abmelden stehen (Seitenwechsel, nachladende Bildschirme). */
const KEEP_MS = 4000;

/** @param {{ children: React.ReactNode }} props */
export function TableKeeper({ children }) {
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const hostRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [room, setRoom] = useState(/** @type {any} */ (null));
  const [state, setState] = useState(/** @type {import("./tableKeeperContext.js").Keeper["state"]} */ ("aus"));
  const [claims, setClaims] = useState(0);
  const [root, setRoot] = useState(/** @type {HTMLElement|null} */ (null));
  const live = useRef({ made: /** @type {any} */ (null), loading: false, timer: /** @type {any} */ (0), count: 0, gen: 0 });

  const dispose = useCallback(() => {
    const L = live.current;
    L.gen += 1;
    L.loading = false;
    if (L.made) {
      if (import.meta.env.DEV && window.__ssRoom === L.made) delete window.__ssRoom;
      L.made.dispose();
      L.made = null;
    }
    setRoom(null);
    setState("aus");
  }, []);

  const build = useCallback(({ zirkel, seated }) => {
    const L = live.current;
    if (L.made || L.loading) return;
    L.loading = true;
    const gen = ++L.gen;
    setState("laden");
    import("./scene/tableRoom.js").then((m) => {
      if (gen !== L.gen || !hostRef.current) return;
      L.loading = false;
      const made = m.createTableRoom(hostRef.current, {
        zirkel: zirkel || "moor",
        reduced: getPrefs().reduceMotion,
        // Wer zuerst Platz nimmt, bestimmt, ob gegenüber schon jemand sitzt (Hauptmenü: niemand)
        seated,
        onSound: (key) => sound.play(key),
      });
      // Kein WebGL: der Tisch im Kerzenlicht geht hier nicht — die Bildschirme weichen auf den bisherigen aus
      if (!made) { setState("kein-webgl"); return; }
      L.made = made;
      if (import.meta.env.DEV) window.__ssRoom = made;
      made.whenReady.then(() => {
        if (gen !== L.gen) return;
        setRoom(made);
        setState("bereit");
      });
    }).catch((err) => {
      console.error(err);
      // ins Fehlerprotokoll (Admin „Fehler“): gespielt wird am bisherigen Tisch weiter. Fehlt nur WebGL, ist das
      // kein Fehler (oben „kein-webgl“) und wird nicht gemeldet.
      meldeFehler("manuell", err, "Sacrifice & Sigils: Tisch im Kerzenlicht konnte nicht laden, bisheriger Tisch");
      if (gen !== L.gen) return;
      L.loading = false;
      setState("fehler");
    });
  }, []);

  const claim = useCallback((o) => {
    const L = live.current;
    clearTimeout(L.timer);
    L.count += 1;
    setClaims(L.count);
    build(o);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      L.count -= 1;
      setClaims(L.count);
      if (L.count === 0) {
        clearTimeout(L.timer);
        L.timer = setTimeout(() => { if (live.current.count === 0) dispose(); }, KEEP_MS);
      }
    };
  }, [build, dispose]);

  useEffect(() => { setRoot(rootRef.current); }, []);
  useEffect(() => () => { clearTimeout(live.current.timer); dispose(); }, [dispose]);

  const value = useMemo(() => ({ room, state, root, claim }), [room, state, root, claim]);
  return (
    <KeeperContext.Provider value={value}>
      {children}
      {/* Der Tisch selbst: unsichtbar, solange niemand daran sitzt (während der Frist steht die Szene still dahinter) */}
      <div ref={rootRef} className="st-root" data-table={state} hidden={claims === 0} onContextMenu={(e) => e.preventDefault()}>
        <div ref={hostRef} className="st-canvas" />
      </div>
    </KeeperContext.Provider>
  );
}
