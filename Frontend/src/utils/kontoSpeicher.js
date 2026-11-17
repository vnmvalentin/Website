// utils/kontoSpeicher.js — ANDOCKSTELLE für Spiele, die heute im Browser speichern (Anschluss konto-spiele, Spur D):
// Spielstand und Abzeichen am Konto. Ohne Anmeldung bleibt alles wie bisher im Browser. Sobald jemand angemeldet ist
// (Twitch, Discord oder Gast), wird der Browser-Stand einmal mit dem Konto abgeglichen — beim ersten Login also
// übernommen — und danach gebündelt mitgespeichert. Ein zweites Gerät bekommt so denselben Stand.
//
//   import { verbindeSpielstand, meldeErfolge } from "../../utils/kontoSpeicher.js";
//
//   const speicher = verbindeSpielstand("flick-soccer", {   // ID aus Backend/analytics/spiele.js
//     lies: () => ladeLokalenStand(),                      // Browser-Stand oder null
//     schreib: (stand) => speichereLokal(stand),           // Stand vom Konto in den Browser übernehmen (+ Anzeige)
//     xp: (stand) => stand.xp ?? 0,                        // Erfahrungspunkte des Stands, Richtwert ~10 je Partie
//     zusammenfuehren: (konto, browser) => …,              // optional; Standard: der Stand mit mehr XP gewinnt
//   });
//   speicher.gespeichert(stand);    // nach jeder lokalen Änderung; geht höchstens alle 4 s ans Konto
//   await speicher.bereit;          // nach dem ersten Abgleich (oder sofort, wenn niemand angemeldet ist)
//   speicher.trennen();             // beim Verlassen des Spiels; offene Änderungen gehen noch raus
//
//   meldeErfolge("flick-soccer", ["erstes-tor"]);   // jederzeit, auch ohne Anmeldung (wird dann nachgereicht).
//                                                   // Die IDs müssen in Backend/konto/erfolge.js stehen.
//   meldeBestwerte("lights-out", { "schnellste-flucht": 83_250 });   // Wert dieses Laufs oder der lokale Bestwert;
//                                                   // das Konto behält je Wert den besten (Visitenkarte /u/). IDs,
//                                                   // Art (zeit in ms | zahl) und Richtung in Backend/konto/bestwerte.js.
//
// Der Stand ist JSON, höchstens 64 KB. Server: PUT/GET /api/konto/stand/:spiel mit Versionszähler — hat ein anderes
// Gerät inzwischen gespeichert, wird zusammengeführt statt überschrieben.
import { getKontoZustand, subscribeKonto } from "./konto.js";
import { entscheideAbgleich, sichereXp } from "./kontoAbgleich.js";

const BUENDELN_MS = 4000;
const OFFENE_ERFOLGE = "kontoErfolgeOffen";
const OFFENE_BESTWERTE = "kontoBestwerteOffen";
const BESTWERTE_JE_ID = 5; // ohne Anmeldung gemerkte Werte je Bestwert (der Server sucht den besten heraus)

async function anfrage(pfad, { method = "GET", body, keepalive = false } = {}) {
  const res = await fetch(`/api/konto${pfad}`, {
    method,
    credentials: "include",
    keepalive,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

/**
 * @param {string} spiel
 * @param {{ lies: () => any, schreib: (stand: any) => void, xp?: (stand: any) => number,
 *           zusammenfuehren?: (konto: any, browser: any) => any }} opt
 */
export function verbindeSpielstand(spiel, { lies, schreib, xp = () => 0, zusammenfuehren } = {}) {
  if (typeof lies !== "function" || typeof schreib !== "function") throw new Error("verbindeSpielstand: lies und schreib fehlen");
  let kontoId = null;
  let version = 0;
  let offen; // undefined = nichts offen
  let timer = null;
  let aktiv = true;
  let laeuft = Promise.resolve();
  let bereitAufloesen;
  const bereit = new Promise((r) => { bereitAufloesen = r; });

  const leseLokal = () => {
    try { return lies(); } catch { return null; }
  };
  const schreibeLokal = (stand) => {
    try { schreib(stand); } catch (e) { console.error(`[kontoSpeicher] ${spiel}: Browser-Stand nicht geschrieben`, e); }
  };

  async function hochladen(stand, { keepalive = false, versuche = 2 } = {}) {
    const r = await anfrage(`/stand/${spiel}`, { method: "PUT", body: { daten: stand, xp: sichereXp(xp, stand), version }, keepalive });
    if (r.ok) {
      version = r.data.version;
      return;
    }
    if (r.status === 409 && r.data?.stand && versuche > 0) {
      // Ein anderes Gerät war schneller: zusammenführen statt überschreiben
      const e = entscheideAbgleich({ server: r.data.stand, lokal: stand, xp, zusammenfuehren });
      version = r.data.stand.version;
      if (e.aktion === "uebernehmen" || e.aktion === "beides") schreibeLokal(e.stand);
      if (e.aktion === "hochladen" || e.aktion === "beides") await hochladen(e.stand, { versuche: versuche - 1 });
    }
  }

  async function abgleichen() {
    const r = await anfrage(`/stand/${spiel}`);
    if (!r.ok) return;
    const server = r.data.stand || null;
    version = server?.version || 0;
    const e = entscheideAbgleich({ server, lokal: leseLokal(), xp, zusammenfuehren });
    if (e.aktion === "uebernehmen" || e.aktion === "beides") schreibeLokal(e.stand);
    if (e.aktion === "hochladen" || e.aktion === "beides") await hochladen(e.stand);
  }

  // Abgleich nacheinander, nie zwei gleichzeitig
  const hintereinander = (fn) => {
    laeuft = laeuft.then(fn).catch((e) => console.error(`[kontoSpeicher] ${spiel}:`, e));
    return laeuft;
  };

  function kontoGeaendert() {
    const { konto, geladen } = getKontoZustand();
    const neu = konto?.id || null;
    if (!geladen || !aktiv) return;
    if (neu === kontoId) {
      bereitAufloesen();
      return;
    }
    kontoId = neu;
    version = 0;
    if (!neu) {
      bereitAufloesen();
      return;
    }
    hintereinander(abgleichen).then(() => bereitAufloesen());
  }

  function senden({ keepalive = false } = {}) {
    clearTimeout(timer);
    timer = null;
    if (offen === undefined || !kontoId) return;
    const stand = offen;
    offen = undefined;
    hintereinander(() => hochladen(stand, { keepalive }));
  }

  const beimVerlassen = () => senden({ keepalive: true });
  const abmelden = subscribeKonto(kontoGeaendert);
  window.addEventListener("pagehide", beimVerlassen);
  kontoGeaendert();

  return {
    bereit,
    /** Nach jeder Änderung im Browser aufrufen — gebündelt ans Konto */
    gespeichert(stand) {
      if (!aktiv || !kontoId) return;
      offen = stand;
      if (!timer) timer = setTimeout(senden, BUENDELN_MS);
    },
    /** Offene Änderung sofort senden (z. B. nach einem Partieende) */
    jetztSenden: () => senden(),
    trennen() {
      senden({ keepalive: true });
      aktiv = false;
      abmelden();
      window.removeEventListener("pagehide", beimVerlassen);
    },
  };
}

// ── Abzeichen ────────────────────────────────────────────────────────────────────────────────────────────────────

function offeneErfolge() {
  try {
    const o = JSON.parse(localStorage.getItem(OFFENE_ERFOLGE) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function merkeOffen(spiel, ids) {
  try {
    const o = offeneErfolge();
    o[spiel] = [...new Set([...(o[spiel] || []), ...ids])].slice(-200);
    localStorage.setItem(OFFENE_ERFOLGE, JSON.stringify(o));
  } catch { /* ohne Speicher gehen sie beim nächsten Melden mit */ }
}

/**
 * Meldet freigeschaltete Abzeichen. Ohne Anmeldung werden sie im Browser gemerkt und nach der nächsten Anmeldung
 * nachgereicht. Bereits bekannte werden am Server ignoriert — alle Freigeschalteten erneut zu melden schadet nicht.
 * @returns {Promise<string[]>} die neu gespeicherten IDs (leer ohne Anmeldung)
 */
export async function meldeErfolge(spiel, ids) {
  const liste = (Array.isArray(ids) ? ids : [ids]).filter((x) => typeof x === "string" && x);
  if (!liste.length) return [];
  if (!getKontoZustand().konto) {
    merkeOffen(spiel, liste);
    return [];
  }
  const r = await anfrage(`/erfolge/${spiel}`, { method: "POST", body: { ids: liste } }).catch(() => null);
  if (!r?.ok) {
    merkeOffen(spiel, liste);
    return [];
  }
  return r.data.neu || [];
}

// ── Bestwerte ────────────────────────────────────────────────────────────────────────────────────────────────────

function liesOffen(schluessel) {
  try {
    const o = JSON.parse(localStorage.getItem(schluessel) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function merkeBestwerteOffen(spiel, werte) {
  try {
    const o = liesOffen(OFFENE_BESTWERTE);
    const s = o[spiel] && typeof o[spiel] === "object" ? o[spiel] : {};
    for (const [id, wert] of Object.entries(werte)) s[id] = [...(Array.isArray(s[id]) ? s[id] : []), wert].slice(-BESTWERTE_JE_ID);
    o[spiel] = s;
    localStorage.setItem(OFFENE_BESTWERTE, JSON.stringify(o));
  } catch { /* ohne Speicher gehen sie beim nächsten Melden mit */ }
}

/**
 * Meldet Bestwerte als { id: zahl } (Zeiten in Millisekunden). Ohne Anmeldung werden sie im Browser gemerkt und nach
 * der nächsten Anmeldung nachgereicht. Schlechtere Werte als der gespeicherte ignoriert der Server.
 * @returns {Promise<string[]>} die IDs, die ein neuer Bestwert wurden (leer ohne Anmeldung)
 */
export async function meldeBestwerte(spiel, werte) {
  const sauber = Object.fromEntries(Object.entries(werte && typeof werte === "object" ? werte : {})
    .filter(([id, w]) => typeof id === "string" && id && Number.isFinite(Number(w))));
  if (!Object.keys(sauber).length) return [];
  if (!getKontoZustand().konto) {
    merkeBestwerteOffen(spiel, sauber);
    return [];
  }
  const r = await anfrage(`/bestwerte/${spiel}`, { method: "POST", body: { werte: sauber } }).catch(() => null);
  if (!r?.ok) {
    if (!r || r.status >= 500 || r.status === 401 || r.status === 429) merkeBestwerteOffen(spiel, sauber);
    return [];
  }
  return r.data.neu || [];
}

/** Gemerkte Bestwerte in Runden senden: Runde i trägt je ID den i-ten gemerkten Wert */
async function bestwerteNachreichen(offen) {
  for (const [spiel, ids] of Object.entries(offen)) {
    const listen = Object.entries(ids || {}).filter(([, l]) => Array.isArray(l));
    const runden = Math.max(0, ...listen.map(([, l]) => l.length));
    for (let i = 0; i < runden; i++) {
      const werte = Object.fromEntries(listen.filter(([, l]) => i < l.length).map(([id, l]) => [id, l[i]]));
      await meldeBestwerte(spiel, werte);
    }
  }
}

// Nach einer Anmeldung: gemerkte Abzeichen und Bestwerte nachreichen
if (typeof window !== "undefined") {
  let gesendetFuer = null;
  subscribeKonto(() => {
    const { konto } = getKontoZustand();
    if (!konto || konto.id === gesendetFuer) return;
    gesendetFuer = konto.id;
    const offen = offeneErfolge();
    if (Object.keys(offen).length) {
      try { localStorage.removeItem(OFFENE_ERFOLGE); } catch { /* egal */ }
      for (const [spiel, ids] of Object.entries(offen)) meldeErfolge(spiel, ids);
    }
    const bestwerte = liesOffen(OFFENE_BESTWERTE);
    if (Object.keys(bestwerte).length) {
      try { localStorage.removeItem(OFFENE_BESTWERTE); } catch { /* egal */ }
      bestwerteNachreichen(bestwerte).catch(() => { /* beim nächsten Melden wieder */ });
    }
  });
}
