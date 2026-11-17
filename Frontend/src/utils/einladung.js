// utils/einladung.js — Einladungslinks im Browser (Server: /api/einladung, Backend/einladung/).
// Ein Link /?einladung=<CODE>&ref=einladung wird hier gemerkt (30 Tage, nur im Browser). Sobald jemand angemeldet ist
// (auch als Gast), nimmt das Konto den Code an; der Server prüft, ob das Konto neu genug ist. Gezählt wird erst, wenn
// es an einem anderen Tag wiederkommt — dann gibt es für beide ein Abzeichen.

const KEY = "vnm_einladung_v1";
const GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_FORM = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

const normal = (roh) => {
  const c = String(roh || "").toUpperCase().replace(/[\s-]/g, "");
  return CODE_FORM.test(c) ? c : null;
};

/** Code aus der Adresse merken. @returns {string|null} */
export function merkeAusAdresse(search = globalThis.location?.search || "", storage = globalThis.localStorage, jetzt = Date.now()) {
  const code = normal(new URLSearchParams(search).get("einladung"));
  if (!code) return null;
  try { storage.setItem(KEY, JSON.stringify({ code, at: jetzt })); } catch { /* privates Fenster */ }
  return code;
}

/** Gemerkter Code oder null (abgelaufene werden vergessen) */
export function offeneEinladung(storage = globalThis.localStorage, jetzt = Date.now()) {
  try {
    const e = JSON.parse(storage.getItem(KEY) || "null");
    if (!e || !normal(e.code)) return null;
    if (jetzt - Number(e.at || 0) > GUELTIG_MS) {
      storage.removeItem(KEY);
      return null;
    }
    return e.code;
  } catch {
    return null;
  }
}

export function vergissEinladung(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* egal */ }
}

/** Der Link zum Teilen */
export const einladungsLink = (code, origin = globalThis.location?.origin || "https://vnmvalentin.de") => `${origin}/?einladung=${code}&ref=einladung`;

/**
 * Gemerkten Code mit dem angemeldeten Konto annehmen.
 * @returns {Promise<"ok"|"unbekannt"|"eigener"|"schon"|"zu-alt"|"fehler"|null>} null = nichts gemerkt
 */
export async function nimmEinladungAn({ storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
  const code = offeneEinladung(storage);
  if (!code) return null;
  try {
    const r = await fetchImpl("/api/einladung/annehmen", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) {
      vergissEinladung(storage);
      return "ok";
    }
    // Endgültige Antworten vergessen den Code; bei Server- oder Netzfehlern beim nächsten Mal wieder versuchen
    if (["unbekannt", "eigener", "schon", "zu-alt"].includes(d.fehler)) {
      vergissEinladung(storage);
      return d.fehler;
    }
    return "fehler";
  } catch {
    return "fehler";
  }
}
