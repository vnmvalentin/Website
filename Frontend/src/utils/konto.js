// utils/konto.js — das Konto der Website im Browser: wer angemeldet ist (Twitch, Discord oder Gast), Anmelden ohne
// Twitch, der Anmelde-Dialog und kurze Hinweise nach einer Anmeldung. Ein Stand für alle Seiten (useKonto), geladen
// beim Start, nach einer Twitch-Anmeldung und wenn der Tab wieder in den Vordergrund kommt. Server: /api/konto
// (Backend/konto/). Die Twitch-Anmeldung selbst bleibt in components/TwitchAuthProvider.jsx.
//
// Sprache am Konto (Anschluss sprache-konto): Beim ersten Laden eines Kontos gilt seine gespeicherte Sprache, außer die
// Adresse trägt ?lang= (gilt nur für den Besuch). Hat das Konto noch keine, wird die hier gewählte übernommen. Jede
// Umstellung durch den Nutzer geht ans Konto.
import { useSyncExternalStore } from "react";
import { getLanguage, getLanguageSource, setLanguage, subscribeLanguage } from "../i18n/language.js";

/** @typedef {{ status: string, grund?: string|null, name?: string }} KontoHinweis */

let zustand = { geladen: false, konto: null, dialog: false, hinweis: null };
const hoerer = new Set();

function setze(teil) {
  zustand = { ...zustand, ...teil };
  hoerer.forEach((fn) => fn());
}

export function subscribeKonto(fn) {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}
export const getKontoZustand = () => zustand;

/** { geladen, konto, dialog, hinweis } — konto ist null, wenn niemand angemeldet ist */
export function useKonto() {
  return useSyncExternalStore(subscribeKonto, getKontoZustand, getKontoZustand);
}

async function api(pfad, { method = "GET", body } = {}) {
  const res = await fetch(`/api/konto${pfad}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, fehler: data.fehler || null, data });
  return data;
}

// ── Sprache am Konto ─────────────────────────────────────────────────────────────────────────────────────────────

let abgeglichenFuer = null; // Konto, dessen Sprache schon übernommen wurde
let spracheVomKonto = false;

function speichereSprache(lang) {
  api("/sprache", { method: "PUT", body: { sprache: lang } })
    .then(() => { if (zustand.konto) setze({ konto: { ...zustand.konto, sprache: lang } }); })
    .catch(() => { /* nächste Umstellung versucht es wieder */ });
}

function spracheAbgleichen(konto) {
  if (!konto) {
    abgeglichenFuer = null;
    return;
  }
  if (abgeglichenFuer === konto.id) return;
  abgeglichenFuer = konto.id;
  const quelle = getLanguageSource();
  if (konto.sprache) {
    if (quelle !== "url" && konto.sprache !== getLanguage()) {
      spracheVomKonto = true;
      try { setLanguage(konto.sprache); } finally { spracheVomKonto = false; }
    }
  } else if (quelle === "storage" || quelle === "user") {
    speichereSprache(getLanguage());
  }
}

if (typeof window !== "undefined") {
  subscribeLanguage((lang) => {
    if (spracheVomKonto || !zustand.konto || getLanguageSource() !== "user") return;
    if (zustand.konto.sprache !== lang) speichereSprache(lang);
  });
}

// ── Laden ────────────────────────────────────────────────────────────────────────────────────────────────────────

let laeuft = null;

/** Lädt das Konto der Sitzung neu. Bei Netzfehlern (Neustart beim Deploy) bleibt der bisherige Stand stehen. */
export function ladeKonto() {
  if (laeuft) return laeuft;
  laeuft = api("/ich")
    .then((d) => {
      const konto = d.konto || null;
      setze({ geladen: true, konto });
      spracheAbgleichen(konto);
      return konto;
    })
    .catch(() => {
      setze({ geladen: true });
      return zustand.konto;
    })
    .finally(() => { laeuft = null; });
  return laeuft;
}

/** Nach dem Abmelden (TwitchAuthProvider.logout) oder Löschen: Stand leeren, ohne den Server zu fragen */
export function kontoAbgemeldet() {
  abgeglichenFuer = null;
  setze({ konto: null, geladen: true });
}

// ── Anmelden ohne Twitch ─────────────────────────────────────────────────────────────────────────────────────────

export const oeffneAnmeldung = () => setze({ dialog: true });
export const schliesseAnmeldung = () => setze({ dialog: false });

/** Neues Gastkonto. Liefert { konto, code } — den Code gibt es nur jetzt im Klartext. */
export async function alsGastStarten() {
  const d = await api("/gast", { method: "POST", body: {} });
  setze({ geladen: true, konto: d.konto });
  spracheAbgleichen(d.konto);
  return d;
}

export async function mitCodeAnmelden(code) {
  const d = await api("/code", { method: "POST", body: { code } });
  setze({ geladen: true, konto: d.konto, dialog: false, hinweis: { status: "angemeldet", name: d.konto?.name } });
  spracheAbgleichen(d.konto);
  return d.konto;
}

/** Zu Discord und zurück auf `returnTo` (Standard: die aktuelle Seite). Angemeldet = Discord mit dem Konto verknüpfen. */
export function mitDiscordAnmelden(returnTo) {
  const ziel = returnTo || `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/konto/discord/start?returnTo=${encodeURIComponent(ziel)}`;
}

// ── Konto verwalten ──────────────────────────────────────────────────────────────────────────────────────────────

export async function erstelleNeuenCode() {
  const { code } = await api("/code/neu", { method: "POST", body: {} });
  if (zustand.konto) setze({ konto: { ...zustand.konto, hatCode: true } });
  return code;
}

export async function trenneAnmeldeweg(art) {
  const d = await api("/trennen", { method: "POST", body: { art } });
  setze({ konto: d.konto });
  return d.konto;
}

export async function setzeKontoName(name) {
  const d = await api("/name", { method: "POST", body: { name } });
  setze({ konto: d.konto });
  return d.konto;
}

export async function loescheKonto() {
  await api("", { method: "DELETE", body: { bestaetigt: true } });
  kontoAbgemeldet();
}

// ── Hinweise nach einer Anmeldung ────────────────────────────────────────────────────────────────────────────────

/** @param {KontoHinweis|null} hinweis */
export const zeigeKontoHinweis = (hinweis) => setze({ hinweis });

/**
 * Liest den Rücksprung von Discord (?konto=angemeldet|verknuepft|zusammengefuehrt|fehler&grund=…) aus der Adresse und
 * entfernt ihn dort, damit er beim Neuladen nicht erneut erscheint.
 * @returns {KontoHinweis|null}
 */
export function leseKontoRuecksprung() {
  try {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("konto");
    if (!status) return null;
    const grund = url.searchParams.get("grund");
    url.searchParams.delete("konto");
    url.searchParams.delete("grund");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return { status, grund };
  } catch {
    return null;
  }
}
