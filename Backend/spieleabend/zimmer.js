// spieleabend/zimmer.js — die Räume des Spieleabends: ein Zimmer mit Tisch, bis zu sechs Figuren daran, weitere schauen zu.
//
// Ablauf: Wer das Zimmer öffnet oder per Link dazukommt, landet stehend im Zimmer und läuft als Blob herum (Position
// meldet der eigene Browser, sa:ort; der Server prüft nur die Grenzen und reicht sie weiter). Wer mitspielen will,
// setzt sich auf einen freien Stuhl. Der Gastgeber (wer am längsten da ist) wählt das Spiel und startet; leere
// Stühle übernehmen Bots — bei Spielen, die auch mit weniger Plätzen gehen (Mensch ärgere dich nicht ab 2), kann der
// Gastgeber einen leeren Stuhl auch leer lassen. Nach dem Ende bleibt das Brett stehen, bis wieder gestartet wird.
//
// Spaß im Zimmer: Gesten (winken, tanzen, jubeln, schmollen, klatschen, Mittelfinger, zeigen), Chips machen dick (wer
// über MAX_BAUCH isst, platzt wie ein Luftballon und ist wieder schlank), Limo macht Schluckauf (der Server schickt die
// Hickser, damit alle sie gleichzeitig sehen), Kissenschlacht, Lichtschalter, Fenster auf → Schnee holen und werfen,
// Sofa mit drei Plätzen, die Zimmerkatze (katze.js).
//
// Server-autoritativ und ohne Netz testbar: createZimmer({ send, now, random }) — send(socketId, ereignis, daten).
// Die Regeln je Spiel liegen in spiele/*.js (Schnittstelle oben in spiele/vierGewinnt.js; Fristen, geheime Rollen und
// Spiele ohne Bots: spiele/zeichnen.js). Personen tragen eine
// kleine öffentliche ID; der Token (Wiedererkennen nach Neuladen) verlässt den Server nie.

const { zaehlePartie } = require("../lib/spielStatistik");
const { katzeTick, streicheln, katzeSicht, neueKatze } = require("./katze");

const SPIELE = {
  vierGewinnt: require("./spiele/vierGewinnt"),
  maedn: require("./spiele/maedn"),
  zeichnen: require("./spiele/zeichnen"),
};
const SPIEL_IDS = Object.keys(SPIELE);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne I/O/0/1
const MAX_AM_TISCH = 6; // Figuren im Zimmer; wer danach kommt, schaut zu
const GNADE_MS = 2 * 60 * 1000; // Verbindung weg: so lange bleibt der Platz reserviert
const WEG_MS = 15 * 1000; // getrennt und am Zug: so lange warten, dann zieht ein Bot für ihn
const LEER_NACH_MS = 10 * 60 * 1000; // niemand verbunden: Zimmer wird danach aufgeräumt
const ANIM_MS = 700; // so lange fällt ein Stein im Browser — erst danach denkt ein Bot
const BOT_DENK_MS = [500, 1100];
const BOT_NAMEN = ["Kiesel", "Funke", "Moos", "Nebel", "Qualle", "Komet"];
const STUFEN = ["leicht", "mittel", "schwer"];
const RAND = 7.4; // halbe Zimmergröße, in der Blobs laufen dürfen (Zimmer halb 8)
// Gesten aus dem Gesten-Rad (Frontend: ui/GestenRad.jsx) und was man im Zimmer anstellen kann
const RAD = ["winken", "tanzen", "jubeln", "schmollen", "klatschen", "mittelfinger", "zeigen"];
const GESTEN = ["chips", "limo", "hau", "schnee", ...RAD];
const GESTE_MS = 1200; // höchstens eine Geste je Person in dieser Zeit …
const HAU_MS = 650; // … Kissenhiebe und Schneebälle dürfen schneller kommen
const SCHNEE_MS = 450;
const SCHNEE_HAND = 3; // so viele Schneebälle holt man auf einmal vom Fensterbrett
// Chips machen dick: je Chip ein Bauch-Punkt; wer bei MAX_BAUCH noch einen isst, platzt (Bauch wieder 0). Nach der
// letzten Portion baut der Bauch langsam ab.
const MAX_BAUCH = 40;
const BAUCH_ERST_MS = 60 * 1000;
const BAUCH_DANN_MS = 6 * 1000;
// Limo: Schluckauf für eine Weile (jede weitere Flasche verlängert ihn), die Hickser kommen unregelmäßig
const HICKS_MS = 20 * 1000;
const HICKS_MAX_MS = 60 * 1000;
const HICKS_ABSTAND = [2200, 5200];
const LICHT_MS = 1200; // Lichtschalter und Fenster nicht als Stroboskop
const FENSTER_MS = 900;
const SOFA_PLAETZE = 3;
// Fenster in der Rückwand (Mitte; Frontend raum.js FENSTER): Schnee holt nur, wer davor steht
const FENSTER = { x: 0, z: -7.4 };
const FENSTER_NAH = 3.2;
// Wer kommt, steht in der Tür (vorne rechts, wie TUER in Frontend/src/pages/Spieleabend/scene/raum.js) und schaut ins
// Zimmer; mehrere nebeneinander, damit niemand im anderen steht
const TUER = { x: 5.2, z: 6.3 };

function createZimmer({ send, now = Date.now, random = Math.random }) {
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // socketId -> { code, token }

  const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 20) || "Gast";
  const cleanToken = (t) => (typeof t === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : null);
  // Aussehen der Worldflip-Blobs: Farbe, Hut, Gesicht als kleine Zahlen; was sie bedeuten, weiß nur der Browser
  const part = (v) => (Number.isInteger(v) && v >= 0 && v < 32 ? v : 0);
  const cleanSkin = (k) => (k && typeof k === "object" ? { c: part(k.c), h: part(k.h), f: part(k.f) } : null);
  // Anzahlen wie SKIN_COLORS / SKIN_HATS / SKIN_FACES in Frontend/src/pages/Worldflip/skins.js
  function botSkin(vermeide) {
    const frei = Array.from({ length: 10 }, (_, i) => i).filter((c) => !vermeide.includes(c));
    const pool = frei.length ? frei : [0];
    return { c: pool[Math.floor(random() * pool.length)], h: Math.floor(random() * 26), f: Math.floor(random() * 15) };
  }

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join("");
    } while (rooms.has(code));
    return code;
  }

  // ── Nachschlagen ─────────────────────────────────────────────────────────────────────────

  const personVon = (room, token) => room.leute.find((p) => p.token === token) || null;
  const hostVon = (room) => room.leute[0] || null;
  const spielVon = (room) => SPIELE[room.spiel];

  function eintrag(socketId) {
    const e = sockets.get(socketId);
    if (!e) return null;
    const room = rooms.get(e.code);
    if (!room) return null;
    return { room, token: e.token, person: personVon(room, e.token) };
  }

  /** Platz einer Person in der laufenden Partie oder null. */
  function platzInPartie(room, personId) {
    if (!room.partie) return null;
    const i = room.partie.besetzung.findIndex((b) => b.person === personId);
    return i < 0 ? null : i;
  }

  // ── Senden ───────────────────────────────────────────────────────────────────────────────

  function sichtFuer(room, token) {
    const ich = token ? personVon(room, token) : null;
    const host = hostVon(room);
    const p = room.partie;
    return {
      code: room.code,
      phase: room.phase,
      spiel: room.spiel,
      spiele: SPIEL_IDS.map((id) => ({ id, name: SPIELE[id].name, plaetze: SPIELE[id].plaetze, minSpieler: SPIELE[id].minSpieler || SPIELE[id].plaetze, ohneBots: !!SPIELE[id].ohneBots })),
      du: ich ? ich.id : null,
      host: !!ich && ich === host,
      hostId: host ? host.id : null,
      leute: room.leute.map((x) => ({ id: x.id, name: x.name, skin: x.skin, connected: x.connected, ort: x.ort, bauch: x.bauch, schnee: x.schnee })),
      zuschauer: room.zuschauer.size,
      licht: room.licht,
      fenster: room.fenster,
      sofa: room.sofa.slice(),
      katze: katzeSicht(room.katze),
      stuehle: room.stuehle.slice(),
      leer: room.leer.slice(),
      botStufe: room.botStufe,
      partie: p
        ? {
            spiel: p.spiel,
            nr: p.nr,
            besetzung: p.besetzung.map((b) => ({ person: b.person, bot: b.bot, weg: b.weg || null })),
            // jede Person sieht nur, was ihr Platz sehen darf (Zeichen-Hochstapler: Wort, Rolle)
            sicht: SPIELE[p.spiel].sicht(p.z, ich ? platzInPartie(room, ich.id) : null),
            laeuft: !SPIELE[p.spiel].ende(p.z) && room.phase === "spiel",
          }
        : null,
      serverNow: now(),
    };
  }

  function empfaenger(room) {
    const out = [];
    for (const p of room.leute) if (p.connected && p.socketId) out.push({ id: p.socketId, token: p.token });
    for (const [id, z] of room.zuschauer) out.push({ id, token: z.token });
    return out;
  }

  function senden(room) {
    room.updatedAt = now();
    for (const m of empfaenger(room)) send(m.id, "sa:zimmer", sichtFuer(room, m.token));
  }

  function hinweis(room, text) {
    for (const m of empfaenger(room)) send(m.id, "sa:hinweis", { text });
  }

  // ── Plätze ───────────────────────────────────────────────────────────────────────────────

  function neuePerson(room, daten, token, socketId) {
    room.naechsteId += 1;
    const id = room.naechsteId;
    const platzImEingang = (id - 1) % 6;
    const ort = { x: TUER.x - (platzImEingang % 3) * 1.25, z: TUER.z - Math.floor(platzImEingang / 3) * 1.2, r: Math.PI };
    return {
      id, token, socketId, connected: true, timer: null, wegSeit: 0, gesteAb: 0, hauAb: 0, bauch: 0, bauchAb: 0,
      schnee: 0, schneeAb: 0, hicksBis: 0, hicksNaechst: 0,
      ort, name: cleanName(daten.name), skin: cleanSkin(daten.skin),
    };
  }

  /** Im Wartestand auf den ersten freien Stuhl setzen (beim Start, wenn noch niemand sitzt). */
  function hinsetzen(room, person) {
    if (room.phase !== "lobby" || room.stuehle.includes(person.id)) return;
    const frei = room.stuehle.indexOf(null);
    if (frei >= 0) {
      room.stuehle[frei] = person.id;
      room.leer[frei] = false;
    }
  }

  // Zuschauer rücken nach, wenn am Tisch Platz wird
  function nachruecken(room) {
    for (const [id, z] of [...room.zuschauer]) {
      if (room.leute.length >= MAX_AM_TISCH) break;
      room.zuschauer.delete(id);
      room.leute.push(neuePerson(room, z, z.token, id));
    }
  }

  /** Person verlässt das Zimmer endgültig (gegangen oder Gnadenfrist vorbei). */
  function entfernen(room, person) {
    if (person.timer) clearTimeout(person.timer);
    room.leute = room.leute.filter((p) => p !== person);
    room.stuehle = room.stuehle.map((s) => (s === person.id ? null : s));
    room.sofa = room.sofa.map((s) => (s === person.id ? null : s));
    const platz = platzInPartie(room, person.id);
    if (platz !== null) {
      const p = room.partie;
      if (room.phase === "spiel") {
        const menschen = p.besetzung.filter((b, i) => i !== platz && b.person !== null);
        const spiel = SPIELE[p.spiel];
        if (!menschen.length) {
          // niemand mehr da, der mitspielt: Partie abbrechen
          room.phase = "lobby";
          room.partie = null;
        } else if (spiel.ohneBots) {
          // Spiele ohne Bots: der Platz wird übersprungen
          p.besetzung[platz] = { person: null, bot: null, weg: person.name };
          spiel.verlassen?.(p.z, platz, now());
          if (spiel.ende(p.z)) room.phase = "lobby";
          hinweis(room, `${person.name} ist gegangen.`);
        } else {
          p.besetzung[platz] = { person: null, bot: { name: botName(room, p.besetzung), skin: person.skin || botSkin([]) } };
          hinweis(room, `${person.name} ist gegangen — ein Bot spielt weiter.`);
        }
      }
      // nach dem Ende bleibt die Besetzung, wie sie war: das stehende Brett zeigt die Partie, die gespielt wurde
    }
    if (hostVon(room) && person === room.hostVorher) hinweis(room, `${hostVon(room).name} ist jetzt Gastgeber.`);
    room.hostVorher = hostVon(room);
    nachruecken(room);
  }

  function aufraeumen(room) {
    if (room.leute.length || room.zuschauer.size) return false;
    rooms.delete(room.code);
    return true;
  }

  function botName(room, besetzung = []) {
    const vergeben = new Set(room.leute.map((p) => p.name));
    for (const b of besetzung) if (b.bot) vergeben.add(b.bot.name);
    const frei = BOT_NAMEN.filter((n) => !vergeben.has(n));
    return frei.length ? frei[Math.floor(random() * frei.length)] : `Bot ${Math.floor(random() * 90) + 10}`;
  }

  // ── Aktionen (alle geben { ok, error? } zurück) ───────────────────────────────────────────

  function verlasseAltes(socketId) {
    const e = eintrag(socketId);
    if (!e) return;
    sockets.delete(socketId);
    e.room.zuschauer.delete(socketId);
    if (e.person && e.person.socketId === socketId) entfernen(e.room, e.person);
    if (!aufraeumen(e.room)) senden(e.room);
  }

  function erstellen(socketId, daten = {}) {
    const token = cleanToken(daten.token);
    if (!token) return { ok: false, error: "Ungültige Sitzung — bitte neu laden." };
    verlasseAltes(socketId);
    const code = newCode();
    const room = {
      code,
      naechsteId: 0,
      leute: [],
      zuschauer: new Map(),
      spiel: SPIEL_IDS.includes(daten.spiel) ? daten.spiel : SPIEL_IDS[0],
      stuehle: [],
      botStufe: "mittel",
      phase: "lobby",
      partie: null,
      partieNr: 0,
      hostVorher: null,
      licht: true,
      lichtAb: 0,
      fenster: false,
      fensterAb: 0,
      sofa: Array(SOFA_PLAETZE).fill(null),
      katze: neueKatze(now(), random),
      rausgeworfen: new Set(), // Tokens, die der Gastgeber hinausgeworfen hat (kommen nicht wieder herein)
      updatedAt: now(),
    };
    room.stuehle = Array(SPIELE[room.spiel].plaetze).fill(null);
    room.leer = Array(SPIELE[room.spiel].plaetze).fill(false);
    const p = neuePerson(room, daten, token, socketId);
    room.leute.push(p);
    room.hostVorher = p;
    rooms.set(code, room);
    sockets.set(socketId, { code, token });
    senden(room);
    return { ok: true, code };
  }

  function beitreten(socketId, daten = {}) {
    const token = cleanToken(daten.token);
    if (!token) return { ok: false, error: "Ungültige Sitzung — bitte neu laden." };
    const code = String(daten.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return { ok: false, error: "Dieses Zimmer gibt es nicht mehr.", fehlt: true };
    if (room.rausgeworfen.has(token)) return { ok: false, error: "Du wurdest aus diesem Zimmer geworfen.", raus: true };
    const alt = sockets.get(socketId);
    if (alt && alt.code !== code) verlasseAltes(socketId);

    // Wiedererkannt (Neuladen, Verbindungsabbruch): eigener Platz, eigene Figur
    const bekannt = personVon(room, token);
    if (bekannt) {
      if (bekannt.timer) clearTimeout(bekannt.timer);
      bekannt.timer = null;
      bekannt.connected = true;
      bekannt.wegSeit = 0;
      bekannt.socketId = socketId;
      if (daten.name) bekannt.name = cleanName(daten.name);
      if (daten.skin) bekannt.skin = cleanSkin(daten.skin);
      sockets.set(socketId, { code, token });
      senden(room);
      return { ok: true, code };
    }

    sockets.set(socketId, { code, token });
    if (room.leute.length < MAX_AM_TISCH) {
      const p = neuePerson(room, daten, token, socketId);
      room.leute.push(p);
      hinweis(room, `${p.name} ist da.`);
    } else {
      room.zuschauer.set(socketId, { token, name: cleanName(daten.name), skin: cleanSkin(daten.skin) });
    }
    senden(room);
    return { ok: true, code };
  }

  function mitPerson(socketId, fn) {
    const e = eintrag(socketId);
    if (!e) return { ok: false, error: "Du bist in keinem Zimmer." };
    if (!e.person) return { ok: false, error: "Zuschauer können das nicht." };
    const r = fn(e.room, e.person);
    if (r.ok && !r.still) senden(e.room);
    return r.still ? { ok: true } : r;
  }

  function profil(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      if (daten.name !== undefined) person.name = cleanName(daten.name);
      if (daten.skin !== undefined) person.skin = cleanSkin(daten.skin);
      return { ok: true };
    });
  }

  const nurHost = (room, person) => (hostVon(room) === person ? null : { ok: false, error: "Das macht der Gastgeber." });

  function spielWaehlen(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      const nein = nurHost(room, person);
      if (nein) return nein;
      if (room.phase !== "lobby") return { ok: false, error: "Erst die Partie beenden." };
      if (!SPIEL_IDS.includes(daten.spiel)) return { ok: false, error: "Unbekanntes Spiel." };
      if (daten.spiel === room.spiel) return { ok: true };
      const sitzend = room.stuehle.filter((s) => s !== null);
      room.spiel = daten.spiel;
      room.stuehle = Array(SPIELE[room.spiel].plaetze).fill(null);
      room.leer = Array(SPIELE[room.spiel].plaetze).fill(false);
      sitzend.slice(0, room.stuehle.length).forEach((id, i) => {
        room.stuehle[i] = id;
      });
      room.partie = null;
      return { ok: true };
    });
  }

  function platz(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      if (room.phase !== "lobby") return { ok: false, error: "Während der Partie bleiben alle sitzen." };
      const ziel = daten.platz;
      const alt = room.stuehle.indexOf(person.id);
      if (ziel === null || ziel === undefined) {
        if (alt >= 0) room.stuehle[alt] = null;
        return { ok: true };
      }
      if (!Number.isInteger(ziel) || ziel < 0 || ziel >= room.stuehle.length) return { ok: false, error: "Diesen Platz gibt es nicht." };
      if (room.stuehle[ziel] !== null && room.stuehle[ziel] !== person.id) return { ok: false, error: "Der Platz ist besetzt." };
      if (alt >= 0) room.stuehle[alt] = null;
      room.stuehle[ziel] = person.id;
      room.leer[ziel] = false;
      room.sofa = room.sofa.map((s) => (s === person.id ? null : s));
      return { ok: true };
    });
  }

  /** Aufs Sofa plumpsen (platz 0 … SOFA_PLAETZE-1) oder aufstehen (null). Nicht vom Spielstuhl aus. */
  function sofa(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      const ziel = daten.platz;
      const alt = room.sofa.indexOf(person.id);
      if (ziel === null || ziel === undefined) {
        if (alt < 0) return { ok: true, still: true };
        room.sofa[alt] = null;
        return { ok: true };
      }
      if (!Number.isInteger(ziel) || ziel < 0 || ziel >= SOFA_PLAETZE) return { ok: false, error: "Diesen Platz gibt es nicht." };
      if (room.stuehle.includes(person.id) || platzInPartie(room, person.id) !== null) return { ok: false, error: "Erst vom Spielstuhl aufstehen." };
      if (room.sofa[ziel] !== null && room.sofa[ziel] !== person.id) return { ok: false, error: "Da sitzt schon jemand." };
      if (alt >= 0) room.sofa[alt] = null;
      room.sofa[ziel] = person.id;
      return { ok: true };
    });
  }

  /** Lichtschalter neben der Tür: Licht aus (dann Taschenlampen) oder an. */
  function licht(socketId) {
    return mitPerson(socketId, (room, person) => {
      const t = now();
      if (t < room.lichtAb) return { ok: true, still: true };
      room.lichtAb = t + LICHT_MS;
      room.licht = !room.licht;
      hinweis(room, room.licht ? `${person.name} macht das Licht an.` : `${person.name} macht das Licht aus …`);
      return { ok: true };
    });
  }

  /** Fenster auf oder zu (offen: Schnee holen). */
  function fenster(socketId) {
    return mitPerson(socketId, (room) => {
      const t = now();
      if (t < room.fensterAb) return { ok: true, still: true };
      room.fensterAb = t + FENSTER_MS;
      room.fenster = !room.fenster;
      katzeTick(room, t, random); // sitzt sie auf der Fensterbank, springt sie herunter (geht mit dem Zimmerstand raus)
      return { ok: true };
    });
  }

  /** Am offenen Fenster Schnee vom Fensterbrett holen: SCHNEE_HAND Bälle. */
  function schneeHolen(socketId) {
    return mitPerson(socketId, (room, person) => {
      if (!room.fenster) return { ok: false, error: "Erst das Fenster öffnen." };
      if (room.stuehle.includes(person.id) || room.sofa.includes(person.id)) return { ok: false, error: "Erst aufstehen." };
      if (Math.hypot(person.ort.x - FENSTER.x, person.ort.z - FENSTER.z) > FENSTER_NAH) return { ok: false, error: "Geh näher ans Fenster." };
      const t = now();
      if (t < person.gesteAb) return { ok: true, still: true };
      person.gesteAb = t + GESTE_MS;
      person.schnee = SCHNEE_HAND;
      for (const m of empfaenger(room)) if (m.id !== socketId) send(m.id, "sa:geste", { id: person.id, art: "schneeHolen", schnee: person.schnee });
      return { ok: true, schnee: person.schnee };
    });
  }

  /** Gastgeber wirft jemanden hinaus: verschwindet sofort (in einer Partie übernimmt ein Bot) und kommt nicht wieder. */
  function kicken(socketId, daten = {}) {
    const e = eintrag(socketId);
    if (!e?.person) return { ok: false, error: "Du bist in keinem Zimmer." };
    const { room, person } = e;
    if (hostVon(room) !== person) return { ok: false, error: "Das macht der Gastgeber." };
    const ziel = room.leute.find((x) => x.id === daten.person);
    if (!ziel) return { ok: false, error: "Diese Person ist nicht mehr da." };
    if (ziel === person) return { ok: false, error: "Dich selbst kannst du nicht hinauswerfen." };
    room.rausgeworfen.add(ziel.token);
    if (ziel.socketId) {
      send(ziel.socketId, "sa:rausgeworfen", { von: person.name });
      sockets.delete(ziel.socketId);
    }
    entfernen(room, ziel);
    hinweis(room, `${ziel.name} wurde hinausgeworfen.`);
    senden(room);
    return { ok: true };
  }

  /** Die Katze streicheln. */
  function katze(socketId) {
    return mitPerson(socketId, (room, person) => {
      if (!streicheln(room, person, now(), random)) return { ok: true, still: true };
      for (const m of empfaenger(room)) send(m.id, "sa:katze", katzeSicht(room.katze));
      return { ok: true, still: true };
    });
  }

  /** Eigene Position im Zimmer (der Browser läuft selbst; hier nur Grenzen prüfen und an die anderen weiterreichen). */
  function ort(socketId, daten = {}) {
    const e = eintrag(socketId);
    if (!e?.person) return { ok: false };
    const zahl = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const x = zahl(daten.x);
    const z = zahl(daten.z);
    const r = zahl(daten.r);
    if (x === null || z === null || r === null) return { ok: false, error: "Ungültige Position." };
    const p = e.person;
    p.ort = {
      x: Math.round(Math.max(-RAND, Math.min(RAND, x)) * 100) / 100,
      z: Math.round(Math.max(-RAND, Math.min(RAND, z)) * 100) / 100,
      r: Math.round((((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 100) / 100,
    };
    // Blick nach oben/unten (Taschenlampe im Dunkeln), wenn mitgeschickt
    const n = zahl(daten.n);
    if (n !== null) p.ort.n = Math.round(Math.max(-1.2, Math.min(0.8, n)) * 100) / 100;
    for (const m of empfaenger(e.room)) if (m.id !== socketId) send(m.id, "sa:ort", { id: p.id, ...p.ort });
    return { ok: true };
  }

  /** Punkt im Zimmer (zeigen, Schneeball ins Leere) auf das Zimmer begrenzen; null, wenn ungültig. */
  function punktIm(d) {
    const zahl = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    if (!d || typeof d !== "object") return null;
    const x = zahl(d.x);
    const y = zahl(d.y);
    const z = zahl(d.z);
    if (x === null || y === null || z === null) return null;
    const r = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100;
    return { x: r(x, -8, 8), y: r(y, -1.6, 5), z: r(z, -8, 8) };
  }

  /**
   * Geste für alle: chips (macht dick, bei MAX_BAUCH platzt man), limo (Schluckauf), hau (Kissen, ziel = Person),
   * schnee (Schneeball auf ziel = Person oder an punkt), dazu die Gesten aus dem Rad (zeigen mit punkt).
   */
  function geste(socketId, daten = {}) {
    const e = eintrag(socketId);
    if (!e?.person) return { ok: false };
    if (!GESTEN.includes(daten.art)) return { ok: false, error: "Unbekannte Geste." };
    const t = now();
    const p = e.person;
    const nachricht = { id: p.id, art: daten.art };
    if (daten.art === "hau") {
      if (t < p.hauAb) return { ok: false };
      const ziel = e.room.leute.find((x) => x.id === daten.ziel && x !== p);
      if (!ziel) return { ok: false, error: "Da ist niemand." };
      p.hauAb = t + HAU_MS;
      nachricht.ziel = ziel.id;
    } else if (daten.art === "schnee") {
      if (p.schnee <= 0) return { ok: false, error: "Keine Schneebälle mehr — hol neuen am Fenster." };
      if (t < p.schneeAb) return { ok: false };
      const ziel = daten.ziel !== undefined ? e.room.leute.find((x) => x.id === daten.ziel && x !== p) : null;
      const punkt = punktIm(daten.punkt);
      if (!ziel && !punkt) return { ok: false, error: "Wohin?" };
      p.schneeAb = t + SCHNEE_MS;
      p.schnee -= 1;
      if (ziel) nachricht.ziel = ziel.id;
      else nachricht.punkt = punkt;
      nachricht.schnee = p.schnee;
    } else {
      if (t < p.gesteAb) return { ok: false };
      if (daten.art === "zeigen") {
        const punkt = punktIm(daten.punkt);
        if (!punkt) return { ok: false, error: "Wohin?" };
        nachricht.punkt = punkt;
      }
      p.gesteAb = t + GESTE_MS;
      if (daten.art === "chips") {
        p.bauchAb = t + BAUCH_ERST_MS;
        if (p.bauch >= MAX_BAUCH) {
          // einer zu viel: platzt wie ein Luftballon
          p.bauch = 0;
          nachricht.platzt = true;
        } else p.bauch += 1;
        nachricht.bauch = p.bauch;
      }
      if (daten.art === "limo") {
        p.hicksBis = Math.min(t + HICKS_MAX_MS, Math.max(p.hicksBis, t) + HICKS_MS);
        if (p.hicksNaechst < t) p.hicksNaechst = t + 2500 + random() * 1500;
      }
    }
    for (const m of empfaenger(e.room)) if (m.id !== socketId) send(m.id, "sa:geste", nachricht);
    // Bauch steht im Zimmerstand (für alle, die später kommen); bei jedem Chip den ganzen Stand zu schicken lohnt nicht
    return { ok: true, bauch: p.bauch, schnee: p.schnee, platzt: !!nachricht.platzt };
  }

  /** Gastgeber: leeren Stuhl leer lassen (statt Bot) — nur bei Spielen, die mit weniger Plätzen gehen. */
  function leerLassen(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      const nein = nurHost(room, person);
      if (nein) return nein;
      if (room.phase !== "lobby") return { ok: false, error: "Erst die Partie beenden." };
      const spiel = spielVon(room);
      if (!spiel.minSpieler || spiel.minSpieler >= spiel.plaetze) return { ok: false, error: "Hier spielen immer alle Plätze." };
      const i = daten.platz;
      if (!Number.isInteger(i) || i < 0 || i >= room.stuehle.length) return { ok: false, error: "Diesen Platz gibt es nicht." };
      room.leer[i] = !!daten.leer;
      return { ok: true };
    });
  }

  function botStufe(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      const nein = nurHost(room, person);
      if (nein) return nein;
      if (!STUFEN.includes(daten.stufe)) return { ok: false, error: "Unbekannte Stufe." };
      room.botStufe = daten.stufe;
      return { ok: true };
    });
  }

  function start(socketId) {
    return mitPerson(socketId, (room, person) => {
      const nein = nurHost(room, person);
      if (nein) return nein;
      if (room.phase !== "lobby") return { ok: false, error: "Es läuft schon eine Partie." };
      const spiel = spielVon(room);
      // niemand sitzt: der Gastgeber setzt sich auf den ersten freien Stuhl
      if (room.stuehle.every((s) => s === null)) hinsetzen(room, person);
      if (spiel.ohneBots) {
        const menschen = room.stuehle.filter((s) => s !== null).length;
        if (menschen < spiel.minSpieler) return { ok: false, error: `Dafür braucht es mindestens ${spiel.minSpieler} am Tisch.` };
      }
      const farben = room.leute.filter((p) => room.stuehle.includes(p.id)).map((p) => p.skin?.c);
      const besetzung = room.stuehle.map((id) => (id !== null ? { person: id, bot: null } : { person: null, bot: null }));
      besetzung.forEach((b, i) => {
        if (b.person !== null || room.leer[i] || spiel.ohneBots) return;
        const skin = botSkin(farben);
        farben.push(skin.c);
        b.bot = { name: botName(room, besetzung), skin };
      });
      const aktiv = besetzung.map((b) => b.person !== null || !!b.bot);
      const mindestens = spiel.minSpieler || spiel.plaetze;
      if (aktiv.filter(Boolean).length < mindestens) return { ok: false, error: `Dafür braucht es mindestens ${mindestens} am Tisch.` };
      room.partieNr += 1;
      room.partie = {
        spiel: room.spiel,
        nr: room.partieNr,
        besetzung,
        // abwechselnd beginnen: Partie 1 Platz 0, Partie 2 Platz 1 … (leere Plätze überspringt das Spiel)
        z: spiel.neu({ beginner: (room.partieNr - 1) % spiel.plaetze, aktiv, random, jetzt: now() }),
        botAb: now() + 900,
      };
      room.phase = "spiel";
      zaehlePartie("spieleabend");
      return { ok: true };
    });
  }

  function beenden(socketId) {
    return mitPerson(socketId, (room, person) => {
      const nein = nurHost(room, person);
      if (nein) return nein;
      if (room.phase !== "spiel") return { ok: true };
      room.phase = "lobby";
      room.partie = null;
      hinweis(room, "Der Gastgeber hat die Partie beendet.");
      return { ok: true };
    });
  }

  /** Zug ausführen (Mensch oder Bot); danach Ende prüfen. */
  function ausfuehren(room, platzNr, aktion) {
    const p = room.partie;
    const spiel = SPIELE[p.spiel];
    const r = spiel.zug(p.z, platzNr, aktion, { random, jetzt: now() });
    if (!r.ok) return r;
    if (r.live) {
      // Zwischenstand (z. B. Strich-Stück): nur an die anderen, kein ganzer Zimmerstand
      for (const m of empfaenger(room)) if (m.token !== (room.leute.find((x) => x.id === p.besetzung[platzNr]?.person)?.token)) send(m.id, "sa:live", r.live);
      return { ok: true, still: true };
    }
    // erst wenn der Browser fertig gezeigt hat (Stein fällt, Würfel rollt, Figur hüpft), denkt ein Bot
    const anim = spiel.animMs ? spiel.animMs(p.z) : ANIM_MS;
    p.botAb = now() + anim + BOT_DENK_MS[0] + random() * (BOT_DENK_MS[1] - BOT_DENK_MS[0]);
    if (spiel.ende(p.z)) room.phase = "lobby"; // Brett bleibt stehen, bis der Gastgeber wieder startet
    return { ok: true };
  }

  function zug(socketId, daten = {}) {
    return mitPerson(socketId, (room, person) => {
      if (room.phase !== "spiel" || !room.partie) return { ok: false, error: "Es läuft keine Partie." };
      const platzNr = platzInPartie(room, person.id);
      if (platzNr === null) return { ok: false, error: "Du spielst nicht mit." };
      return ausfuehren(room, platzNr, daten.aktion);
    });
  }

  function verlassen(socketId) {
    const e = eintrag(socketId);
    sockets.delete(socketId);
    if (!e) return { ok: true };
    e.room.zuschauer.delete(socketId);
    if (e.person && e.person.socketId === socketId) entfernen(e.room, e.person);
    if (!aufraeumen(e.room)) senden(e.room);
    return { ok: true };
  }

  function trennen(socketId) {
    const e = eintrag(socketId);
    sockets.delete(socketId);
    if (!e) return;
    if (e.room.zuschauer.delete(socketId)) {
      if (!aufraeumen(e.room)) senden(e.room);
      return;
    }
    const person = e.person;
    if (!person || person.socketId !== socketId) return;
    person.connected = false;
    person.socketId = null;
    person.wegSeit = now();
    if (person.timer) clearTimeout(person.timer);
    person.timer = setTimeout(() => {
      const room = rooms.get(e.code);
      if (!room || person.connected || !room.leute.includes(person)) return;
      entfernen(room, person);
      if (!aufraeumen(room)) senden(room);
    }, GNADE_MS);
    person.timer.unref?.();
    senden(e.room);
  }

  /** Regelmäßig aufrufen: Bots ziehen, Getrennte am Zug werden vertreten, leere Zimmer verschwinden. */
  function tick() {
    const t = now();
    for (const room of [...rooms.values()]) {
      // Chips-Bauch baut langsam ab
      let duenner = false;
      for (const p of room.leute) {
        if (p.bauch > 0 && t >= p.bauchAb) {
          p.bauch -= 1;
          p.bauchAb = t + BAUCH_DANN_MS;
          duenner = true;
        }
      }
      if (duenner && room.phase !== "spiel") senden(room);
      // Schluckauf: der Server gibt den Takt vor, damit alle denselben Hickser sehen (auch der Trinker selbst)
      for (const p of room.leute) {
        if (p.hicksBis <= t || t < p.hicksNaechst) continue;
        p.hicksNaechst = t + HICKS_ABSTAND[0] + random() * (HICKS_ABSTAND[1] - HICKS_ABSTAND[0]);
        for (const m of empfaenger(room)) send(m.id, "sa:geste", { id: p.id, art: "hicks" });
      }
      // die Katze überlegt sich etwas Neues
      if (katzeTick(room, t, random)) for (const m of empfaenger(room)) send(m.id, "sa:katze", katzeSicht(room.katze));
      if (!room.leute.some((p) => p.connected) && !room.zuschauer.size && t - room.updatedAt > LEER_NACH_MS) {
        for (const p of room.leute) if (p.timer) clearTimeout(p.timer);
        rooms.delete(room.code);
        continue;
      }
      if (room.phase !== "spiel" || !room.partie) continue;
      const p = room.partie;
      const spiel = SPIELE[p.spiel];
      // Fristen des Spiels (Zeichen-Hochstapler: Strich, Abstimmung, Raten)
      if (spiel.tick?.(p.z, t)) {
        if (spiel.ende(p.z)) room.phase = "lobby";
        senden(room);
        continue;
      }
      const dran = spiel.amZug(p.z);
      if (dran === null || t < p.botAb) continue;
      const b = p.besetzung[dran];
      let vertreten = !!b.bot;
      if (!vertreten && b.person !== null) {
        const mensch = room.leute.find((x) => x.id === b.person);
        vertreten = !mensch || (!mensch.connected && t - mensch.wegSeit > WEG_MS);
      }
      if (!vertreten) continue;
      const aktion = spiel.botZug(p.z, dran, room.botStufe, random);
      if (!aktion) continue;
      ausfuehren(room, dran, aktion);
      senden(room);
    }
  }

  function stats() {
    let spieler = 0;
    for (const room of rooms.values()) spieler += room.leute.filter((p) => p.connected).length + room.zuschauer.size;
    return { raeume: rooms.size, spieler };
  }

  return { erstellen, beitreten, profil, spielWaehlen, platz, sofa, leerLassen, botStufe, start, beenden, zug, ort, geste, licht, fenster, schneeHolen, katze, kicken, verlassen, trennen, tick, stats, _rooms: rooms };
}

module.exports = { createZimmer, SPIELE, MAX_AM_TISCH, GNADE_MS, WEG_MS, MAX_BAUCH, BAUCH_ERST_MS, BAUCH_DANN_MS, HICKS_MS, SCHNEE_HAND, RAD };
