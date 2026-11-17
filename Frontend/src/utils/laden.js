// utils/laden.js — Laden (/laden, Server Backend/laden/): Katalog, eigener Stand, Bezahlseite öffnen, Dankesliste.
// Gekauft wird immer über die Bezahlseite von Stripe; verbucht wird erst, wenn Stripe die Zahlung meldet (Webhook) —
// nach der Rückkehr (?kauf=ok) also kurz nachfragen.
//
// ANDOCKSTELLE für Spiele: holeBesitz(spiel) → IDs der gekauften Designs dieses Kontos (ohne Anmeldung leer).
// Die Artikel selbst stehen in Backend/laden/katalog.js.

async function api(pfad, { method = "GET", body } = {}) {
  const r = await fetch(`/api/laden${pfad}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(d.error || `Fehler ${r.status}`);
    e.code = d.fehler || null;
    e.status = r.status;
    throw e;
  }
  return d;
}

/**
 * { verfuegbar, unterstuetzer: { betraege: [cent] }, artikel: [{ id, spiel, name, text, preisCent, bild }],
 *   spiele: { [spielId]: { name: { de, en }, pfad, wo: { de, en } | null } } }
 */
export const holeKatalog = () => api("/katalog");

/**
 * Designs nach Spiel, in der Reihenfolge des Katalogs — für Laden und Profil.
 * @returns {{ spiel: string, info: { name: object, pfad: string, wo: object|null }, artikel: object[] }[]}
 */
export function nachSpiel(artikel = [], spiele = {}) {
  const gruppen = new Map();
  for (const a of artikel) {
    if (!gruppen.has(a.spiel)) {
      const info = spiele?.[a.spiel] || {};
      gruppen.set(a.spiel, {
        spiel: a.spiel,
        info: { name: info.name || { de: a.spiel, en: a.spiel }, pfad: info.pfad || "/", wo: info.wo || null },
        artikel: [],
      });
    }
    gruppen.get(a.spiel).artikel.push(a);
  }
  return [...gruppen.values()];
}

/** { besitz: [ids], unterstuetzer: { summeCent, anzahl, seit, aufListe } | null } — nur angemeldet */
export const holeMeinStand = () => api("/mein");

/** { namen: [{ name, seit }] } */
export const holeDankesliste = () => api("/dankesliste");

export const setzeDankesliste = (an) => api("/dankesliste", { method: "PUT", body: { an: Boolean(an) } });

/** Gekaufte Designs eines Spiels (IDs) — leer ohne Anmeldung oder bei Fehler */
export const holeBesitz = (spiel) => api(`/besitz/${encodeURIComponent(spiel)}`).then((d) => d.artikel || []).catch(() => []);

/**
 * Bezahlseite öffnen und hinwechseln. `zustimmung` = Haken zum sofortigen Beginn (das Backend prüft mit).
 * @param {{ typ: "unterstuetzer"|"artikel", betragCent?: number, artikelId?: string, aufListe?: boolean, zustimmung: boolean, lang?: string, returnPath?: string }} kauf
 */
export async function starteKauf({ typ, betragCent, artikelId, aufListe = false, zustimmung, lang = "de", returnPath = "/laden" }) {
  const d = await api("/checkout", { method: "POST", body: { typ, betragCent, artikelId, aufListe, zustimmung: zustimmung === true, lang, returnPath } });
  window.location.assign(d.url);
}

/** 500 → „5 €“, 199 → „1,99 €“ (en: „€5“, „€1.99“) */
export function euro(cent, lang = "de") {
  const n = Number(cent || 0) / 100;
  return n.toLocaleString(lang === "en" ? "en-IE" : "de-DE", {
    style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}
