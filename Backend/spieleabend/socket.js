// spieleabend/socket.js — Socket.io-Anbindung der Zimmer (zimmer.js). Eingehängt in Backend/index.js.
//
// Protokoll (Präfix `sa:`; Antworten per Ack `{ ok, error?, … }`)
//   Client → Server
//     sa:erstellen    { name, token, skin }         neues Zimmer (Ack: code); man sitzt gleich am Tisch
//     sa:beitreten    { code, name, token, skin }   Beitreten oder Wiederverbinden (Token = eigene Figur); voll → zuschauen
//     sa:profil       { name?, skin? }              Name oder Aussehen ändern
//     sa:spiel        { spiel }                     Gastgeber: Spiel wählen (nicht während einer Partie)
//     sa:platz        { platz | null }              Stuhl nehmen oder aufstehen (nicht während einer Partie)
//     sa:leer         { platz, leer }               Gastgeber: leeren Stuhl leer lassen statt Bot (Spiele ab 2, z. B. MÄDN)
//     sa:botStufe     { stufe }                     Gastgeber: leicht | mittel | schwer
//     sa:start        {}                            Gastgeber: Partie starten (auch die nächste nach dem Ende)
//     sa:beenden      {}                            Gastgeber: laufende Partie abbrechen
//     sa:zug          { aktion }                    Zug im laufenden Spiel: 4 gewinnt { spalte },
//                                                   Mensch ärgere dich nicht { art: "wuerfeln" } | { art: "ziehen", figur },
//                                                   Zeichen-Hochstapler { art: "strich", punkte, fertig } | { art: "stimme", platz }
//                                                   | { art: "raten", wort }
//     sa:ort          { x, z, r, n? }               eigene Position im Zimmer (Blob läuft; ca. 10× je Sekunde), n = Blick hoch/runter
//     sa:geste        { art, ziel?, punkt? }        chips (macht dick, zu viele: platzt) | limo (Schluckauf) | hau (Kissen,
//                                                   ziel = Person-ID) | schnee (ziel oder punkt) | winken | tanzen | jubeln |
//                                                   schmollen | klatschen | mittelfinger | zeigen (punkt {x,y,z})
//     sa:sofa         { platz | null }              aufs Sofa plumpsen (0–2) oder aufstehen
//     sa:licht        {}                            Lichtschalter umlegen
//     sa:fenster      {}                            Fenster auf/zu
//     sa:schnee       {}                            am offenen Fenster Schneebälle holen (Ack: schnee)
//     sa:katze        {}                            die Katze streicheln
//     sa:kicken       { person }                    Gastgeber: jemanden hinauswerfen (kommt nicht wieder herein)
//     sa:verlassen    {}                            Zimmer verlassen (in einer Partie übernimmt ein Bot)
//   Server → Client
//     sa:zimmer       Zustand des Zimmers aus Sicht des Empfängers (zimmer.js sichtFuer)
//     sa:hinweis      { text }
//     sa:ort          { id, x, z, r, n? }           jemand anderes ist gelaufen (nicht im ganzen Zimmerstand)
//     sa:geste        { id, art, ziel?, punkt?, bauch?, platzt?, schnee? }  dazu art "hicks" (Schluckauf, vom Server)
//                                                   und "schneeHolen"
//     sa:katze        { modus, nr, ort?, stuhl?, person?, von? }  die Katze hat etwas Neues vor (katze.js)
//     sa:rausgeworfen { von }                       man wurde vom Gastgeber hinausgeworfen
//     sa:live         Zwischenstand eines Zugs, z. B. { art: "strich", platz, nr, punkte } (Zeichen-Hochstapler)

const { createZimmer } = require("./zimmer");
const { meldeSpielAn } = require("../lib/spielStatistik");

const TICK_MS = 200;
const MAX_EVENTS_PER_SECOND = 30; // Laufen schickt ~10 Positionen je Sekunde

let zimmer = null;
meldeSpielAn("spieleabend", () => (zimmer ? zimmer.stats() : { raeume: 0, spieler: 0 }));

function getZimmer(io) {
  if (!zimmer) {
    zimmer = createZimmer({ send: (id, event, payload) => io.to(id).emit(event, payload) });
    setInterval(() => {
      try {
        zimmer.tick();
      } catch (e) {
        console.error("[spieleabend] Tick-Fehler:", e);
      }
    }, TICK_MS).unref();
  }
  return zimmer;
}

const ACTIONS = {
  "sa:erstellen": "erstellen",
  "sa:beitreten": "beitreten",
  "sa:profil": "profil",
  "sa:spiel": "spielWaehlen",
  "sa:platz": "platz",
  "sa:leer": "leerLassen",
  "sa:botStufe": "botStufe",
  "sa:start": "start",
  "sa:beenden": "beenden",
  "sa:zug": "zug",
  "sa:ort": "ort",
  "sa:geste": "geste",
  "sa:sofa": "sofa",
  "sa:licht": "licht",
  "sa:fenster": "fenster",
  "sa:schnee": "schneeHolen",
  "sa:katze": "katze",
  "sa:kicken": "kicken",
  "sa:verlassen": "verlassen",
};

function registerSpieleabendSocket(socket, io) {
  let windowStart = Date.now();
  let count = 0;
  const limited = () => {
    const t = Date.now();
    if (t - windowStart > 1000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count > MAX_EVENTS_PER_SECOND;
  };

  for (const [event, method] of Object.entries(ACTIONS)) {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      if (limited()) return reply({ ok: false, error: "Zu viele Anfragen." });
      try {
        reply(getZimmer(io)[method](socket.id, payload && typeof payload === "object" ? payload : {}));
      } catch (e) {
        console.error(`[spieleabend] ${event}:`, e);
        reply({ ok: false, error: "Serverfehler." });
      }
    });
  }

  socket.on("disconnect", () => {
    if (zimmer) zimmer.trennen(socket.id);
  });
}

module.exports = { registerSpieleabendSocket };
