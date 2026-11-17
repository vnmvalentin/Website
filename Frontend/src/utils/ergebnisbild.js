// utils/ergebnisbild.js — Ergebnisbilder zum Teilen (Ausbauplan „ergebnisbilder“, Spur D, 17.11.2026).
//
// Nach einer Partie ein Bild im Hochformat 1080 × 1920 (Story-Format für TikTok und Instagram, passt auch in Discord),
// gezeichnet im Browser: kein Server, kein Paket, kein Warten. Das Spiel liefert nur die Werte (ein „Ergebnis“), das
// Aussehen je Spiel steht hier in LOOKS (Farben und Schriften der Spiel-Hülle, Spielbild aus /media/previews).
// Der Link zurück trägt ?ref=ergebnis-<spiel>; die Besucherstatistik zählt ihn als „Link: ergebnis-<spiel>“.
//
// Andockstelle für weitere Spiele (auch andere Spuren): ein Eintrag in LOOKS und am Ende der Partie
//   <ErgebnisTeilen ergebnis={{ spiel, gross, unter, kicker, marke, werte, raster, aufruf, text }} />
// (components/ErgebnisTeilen.jsx). Alles außer spiel und gross ist freiwillig.

export const BILD_W = 1080;
export const BILD_H = 1920;

const RAND = 84;
const INHALT_W = BILD_W - 2 * RAND;
const SPIELBILD_MAX_H = 760; // Spielbild in voller Breite (nichts abgeschnitten), höchstens so hoch
const INHALT_Y = 660;        // Grundlinie der Rubrik; darüber läuft das Spielbild in den Grund aus
const FUSS_Y = 1690;         // Trennlinie über Aufruf und Adresse
const ORIGIN = "https://vnmvalentin.de";

const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * Aussehen je Spiel (Schlüssel = Spiel-ID aus Backend/analytics/spiele.js). Farben und Schriften wie in der Hülle des
 * Spiels; die Schriften lädt die Hülle schon, hier wird nur gewartet, bis sie bereitstehen.
 * titel = Schrift des Spielnamens, zahl = Schrift der großen Zahl und der Werte, text = alles andere.
 */
export const LOOKS = {
  "lights-out": {
    name: "Lights Out", pfad: "/lights-out", bild: "lights-out",
    grund: "#050505", tinte: "#e9e4d6", blass: "rgba(217,212,199,0.62)", linie: "rgba(217,212,199,0.16)", akzent: "#7fbf8a",
    titel: "'Special Elite', serif", zahl: "'Special Elite', serif", text: "'Special Elite', serif", zahlGewicht: 400,
  },
  "seed-runners": {
    name: "Seed Runners", pfad: "/seed-runners", bild: "seed-runners",
    grund: "#0d1620", tinte: "#eef2ea", blass: "rgba(238,242,234,0.66)", linie: "rgba(238,242,234,0.14)", akzent: "#8fd17a",
    titel: "Bungee, sans-serif", zahl: "'Barlow Condensed', sans-serif", text: `Barlow, ${SANS}`, zahlGewicht: 700,
  },
  adventures: {
    name: "adVentures", pfad: "/adventures", bild: "adventures",
    grund: "#121016", tinte: "#efe6d2", blass: "rgba(239,230,210,0.68)", linie: "rgba(239,230,210,0.14)", akzent: "#f0a33c",
    titel: "Silkscreen, monospace", zahl: "Silkscreen, monospace", text: `Tiny5, ${SANS}`, zahlGewicht: 700,
  },
  worldflip: {
    name: "Worldflip", pfad: "/worldflip", bild: "worldflip",
    grund: "#17161d", tinte: "#f4eedf", blass: "rgba(244,238,223,0.68)", linie: "rgba(244,238,223,0.14)", akzent: "#f0562b",
    titel: `Rubik, ${SANS}`, zahl: `Rubik, ${SANS}`, text: `Rubik, ${SANS}`, zahlGewicht: 800,
  },
  "flick-soccer": {
    name: "Flick Soccer", pfad: "/flick-soccer", bild: "flick-soccer",
    grund: "#0b110e", tinte: "#eef3ef", blass: "rgba(238,243,239,0.66)", linie: "rgba(238,243,239,0.14)", akzent: "#c8f03c",
    titel: `Archivo, ${SANS}`, zahl: `Archivo, ${SANS}`, text: `Archivo, ${SANS}`, zahlGewicht: 900,
  },
  blobby: {
    name: "Blobby Volley", pfad: "/blobby", bild: "blobby",
    grund: "#f2e1bd", tinte: "#12304d", blass: "rgba(18,48,77,0.7)", linie: "rgba(18,48,77,0.18)", akzent: "#e2503a",
    titel: "'Lilita One', sans-serif", zahl: "'Lilita One', sans-serif", text: `Rubik, ${SANS}`, zahlGewicht: 400, hell: true,
  },
  "sacrifice-and-sigils": {
    name: "Sacrifice & Sigils", pfad: "/sacrifice-and-sigils", bild: "sacrifice-and-sigils",
    grund: "#170f0a", tinte: "#e8dfcc", blass: "rgba(232,223,204,0.66)", linie: "rgba(232,223,204,0.16)", akzent: "#f2b54a",
    titel: "'IM Fell English SC', serif", zahl: "'EB Garamond', serif", text: "'EB Garamond', serif", zahlGewicht: 600,
  },
  spieleabend: {
    name: "Spieleabend", pfad: "/spieleabend", bild: "spieleabend",
    grund: "#161113", tinte: "#f6ecdf", blass: "rgba(246,236,223,0.7)", linie: "rgba(246,236,223,0.14)", akzent: "#e0a84a",
    titel: `Rubik, ${SANS}`, zahl: `Rubik, ${SANS}`, text: `Rubik, ${SANS}`, zahlGewicht: 800,
  },
};

const NEUTRAL = {
  name: "vnmvalentin", pfad: "/", bild: null,
  grund: "#0d0f14", tinte: "#f3f4f6", blass: "rgba(243,244,246,0.66)", linie: "rgba(255,255,255,0.12)", akzent: "#a78bfa",
  titel: SANS, zahl: SANS, text: SANS, zahlGewicht: 800,
};

/** Aussehen zu einer Spiel-ID; unbekannte Spiele bekommen ein schlichtes neutrales Bild (wirft nie). */
export function lookFuer(spiel, eigenes) {
  return { ...NEUTRAL, ...(LOOKS[spiel] || {}), ...(eigenes || {}) };
}

/** ?ref-Kürzel (passt zu TAG_RE in Backend/analytics/normalize.js: höchstens 40 Zeichen, a–z 0–9 . _ -). */
export function refKuerzel(spiel) {
  const sauber = String(spiel || "spiel").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "spiel";
  return `ergebnis-${sauber}`.slice(0, 40);
}

/** Link zurück zum Spiel mit ?ref=ergebnis-<spiel>; vorhandene Angaben in der Adresse bleiben erhalten. */
export function ergebnisLink(ergebnis, origin = globalThis.location?.origin || ORIGIN) {
  const look = lookFuer(ergebnis?.spiel, ergebnis?.look);
  const pfad = typeof ergebnis?.pfad === "string" && ergebnis.pfad.startsWith("/") ? ergebnis.pfad : look.pfad;
  const url = new URL(pfad, /^https?:\/\//.test(origin) ? origin : ORIGIN);
  url.searchParams.set("ref", refKuerzel(ergebnis?.spiel));
  return url.toString();
}

/** Die Adresse, die unten im Bild steht: ohne https:// und ohne ?ref (zum Abtippen). */
export function anzeigeAdresse(ergebnis) {
  const look = lookFuer(ergebnis?.spiel, ergebnis?.look);
  const pfad = typeof ergebnis?.pfad === "string" && ergebnis.pfad.startsWith("/") ? ergebnis.pfad.split("?")[0] : look.pfad;
  return `vnmvalentin.de${pfad === "/" ? "" : pfad}`;
}

/** Text für Messenger und Zwischenablage: eigene Zeile des Spiels (oder Name · große Zahl · Unterzeile) plus Link. */
export function ergebnisText(ergebnis, origin) {
  const look = lookFuer(ergebnis?.spiel, ergebnis?.look);
  const zeile = typeof ergebnis?.text === "string" && ergebnis.text.trim()
    ? ergebnis.text.trim()
    : [look.name, ergebnis?.gross, ergebnis?.unter].filter((t) => t != null && String(t).trim()).join(" · ");
  return `${zeile}\n${ergebnisLink(ergebnis, origin)}`;
}

/** Dateiname für „Bild speichern“: vnmvalentin-<spiel>-<JJJJ-MM-TT>.png */
export function dateiName(ergebnis, jetzt = new Date()) {
  const d = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
  return `vnmvalentin-${refKuerzel(ergebnis?.spiel).replace(/^ergebnis-/, "")}-${d}.png`;
}

/** Werte säubern: höchstens 4, nur Paare mit Name und Wert, alles als Text. */
export function saubereWerte(werte) {
  if (!Array.isArray(werte)) return [];
  return werte
    .filter((w) => w && w.name != null && w.wert != null && String(w.name).trim() && String(w.wert).trim())
    .slice(0, 4)
    .map((w) => ({ name: String(w.name), wert: String(w.wert) }));
}

/**
 * Raster säubern: Liste von Zeilen mit Farben, höchstens 3 Zeilen à 12. Eine flache Liste wird auf Zeilen zu 12
 * umgebrochen.
 */
export function saubereRaster(raster) {
  if (!Array.isArray(raster) || !raster.length) return [];
  let zeilen = raster;
  if (!Array.isArray(raster[0])) {
    zeilen = [];
    for (let i = 0; i < raster.length; i += 12) zeilen.push(raster.slice(i, i + 12));
  }
  return zeilen
    .slice(0, 3)
    .map((z) => (Array.isArray(z) ? z.filter((f) => typeof f === "string" && f).slice(0, 12) : []))
    .filter((z) => z.length);
}

// ---------------------------------------------------------------------------------------------------------- Zeichnen

/** Kürzt einen Text mit „…“, bis er in die Breite passt */
function passend(ctx, text, maxW) {
  const t = String(text ?? "");
  if (ctx.measureText(t).width <= maxW) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Größte Schriftgröße zwischen max und min, bei der der Text in die Breite passt */
function groesseFuer(ctx, text, schrift, gewicht, maxW, max, min) {
  for (let px = max; px > min; px -= 6) {
    ctx.font = `${gewicht} ${px}px ${schrift}`;
    if (ctx.measureText(text).width <= maxW) return px;
  }
  return min;
}

/** Zeichnet ein Bild so, dass es das Rechteck ganz füllt (Ränder werden abgeschnitten) */
function zeichneDeckend(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** Hex-Farbe (#rrggbb) mit Deckkraft als rgba() */
function mitAlpha(hex, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function abgerundet(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Wartet (höchstens ms) auf die Schriften der Karte; fehlt eine, nimmt der Browser die nächste aus der Liste. */
async function schriftenBereit(look, ms = 1500) {
  const fonts = globalThis.document?.fonts;
  if (!fonts?.load) return;
  const familien = [
    `${look.zahlGewicht} 100px ${look.zahl}`,
    `400 100px ${look.titel}`,
    `600 40px ${look.text}`,
    `400 40px ${look.text}`,
  ];
  const laden = Promise.all(familien.map((f) => fonts.load(f).catch(() => null)));
  await Promise.race([laden, new Promise((r) => setTimeout(r, ms))]);
}

/** Lädt das Spielbild (höchstens ms); null, wenn es fehlt oder zu lange dauert. */
function ladeSpielbild(name, ms = 3000) {
  if (!name || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), ms);
    img.onload = async () => {
      clearTimeout(t);
      try { await img.decode?.(); } catch { /* onload reicht */ }
      resolve(img);
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = `/media/previews/${name}.webp`;
  });
}

/**
 * Zeichnet das Ergebnisbild.
 * @param {object} ergebnis  { spiel, gross, unter?, kicker?, marke?, werte?, raster?, aufruf?, pfad?, look? }
 * @param {object} [opts]    canvas (sonst ein neues), spielbild (fertiges Bild statt /media/previews), ohneWarten,
 *                           aufruf (Rückfall für die Zeile unten, wenn das Spiel keine eigene mitgibt)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function zeichneErgebnisbild(ergebnis, opts = {}) {
  const look = lookFuer(ergebnis?.spiel, ergebnis?.look);
  const canvas = opts.canvas || document.createElement("canvas");
  canvas.width = BILD_W;
  canvas.height = BILD_H;
  const ctx = canvas.getContext("2d");

  const [img] = await Promise.all([
    opts.spielbild !== undefined ? Promise.resolve(opts.spielbild) : ladeSpielbild(look.bild),
    opts.ohneWarten ? null : schriftenBereit(look),
  ]);

  // Grund
  ctx.fillStyle = look.grund;
  ctx.fillRect(0, 0, BILD_W, BILD_H);

  // Spielbild oben in voller Breite (die Vorschaubilder sind Bildschirmfotos — beschnitten stünden halbe Wörter da),
  // läuft nach unten in den Grund aus
  if (img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const h = iw && ih ? Math.min(SPIELBILD_MAX_H, Math.round((BILD_W * ih) / iw)) : SPIELBILD_MAX_H;
    zeichneDeckend(ctx, img, 0, 0, BILD_W, h);
    if (!look.hell) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, BILD_W, h);
    }
    const g = ctx.createLinearGradient(0, h * 0.42, 0, h);
    g.addColorStop(0, mitAlpha(look.grund, 0));
    g.addColorStop(0.72, mitAlpha(look.grund, 0.88));
    g.addColorStop(1, mitAlpha(look.grund, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BILD_W, h + 1);
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  // Rubrik (klein, Akzentfarbe) und Spielname
  let y = INHALT_Y;
  if (ergebnis?.kicker) {
    ctx.font = `600 38px ${look.text}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillStyle = look.akzent;
    ctx.fillText(passend(ctx, String(ergebnis.kicker).toUpperCase(), INHALT_W), RAND, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  y += 104;
  const titelPx = groesseFuer(ctx, look.name, look.titel, 400, INHALT_W, 104, 60);
  ctx.font = `400 ${titelPx}px ${look.titel}`;
  ctx.fillStyle = look.tinte;
  ctx.fillText(passend(ctx, look.name, INHALT_W), RAND, y);

  y += 38;
  ctx.fillStyle = look.akzent;
  ctx.fillRect(RAND, y, 96, 8);

  // Marke (z. B. „Neue Bestzeit“) als Schild über der großen Zahl
  y += 58;
  if (ergebnis?.marke) {
    ctx.font = `700 34px ${look.text}`;
    const t = passend(ctx, String(ergebnis.marke), INHALT_W - 48);
    const w = ctx.measureText(t).width + 48;
    ctx.fillStyle = look.akzent;
    abgerundet(ctx, RAND, y, w, 62, 8);
    ctx.fill();
    ctx.fillStyle = look.hell ? "#ffffff" : look.grund;
    ctx.fillText(t, RAND + 24, y + 43);
    y += 62;
  }

  // Die große Zahl
  const gross = String(ergebnis?.gross ?? "");
  const grossPx = groesseFuer(ctx, gross, look.zahl, look.zahlGewicht, INHALT_W, 236, 104);
  y += Math.round(grossPx * 0.92);
  ctx.font = `${look.zahlGewicht} ${grossPx}px ${look.zahl}`;
  ctx.fillStyle = look.tinte;
  ctx.fillText(passend(ctx, gross, INHALT_W), RAND - Math.round(grossPx * 0.04), y);

  if (ergebnis?.unter) {
    y += 78;
    ctx.font = `600 52px ${look.text}`;
    ctx.fillStyle = look.blass;
    ctx.fillText(passend(ctx, String(ergebnis.unter), INHALT_W), RAND, y);
  }

  // Raster (wie bei Wordle: ein Feld je Abschnitt, Runde oder Zug)
  const raster = saubereRaster(ergebnis?.raster);
  if (raster.length) {
    y += 44;
    const feld = 60;
    const luecke = 12;
    for (const zeile of raster) {
      zeile.forEach((farbe, i) => {
        ctx.fillStyle = farbe;
        abgerundet(ctx, RAND + i * (feld + luecke), y, feld, feld, 8);
        ctx.fill();
      });
      y += feld + luecke;
    }
    y -= luecke;
  }

  // Werte in zwei Spalten; was unten nicht mehr passt, entfällt
  const werte = saubereWerte(ergebnis?.werte);
  if (werte.length) {
    y += 36;
    const zeileH = 138;
    const platz = Math.max(0, Math.floor((FUSS_Y - 20 - y) / zeileH));
    const sichtbar = werte.slice(0, platz * 2);
    const spalteW = (INHALT_W - 40) / 2;
    sichtbar.forEach((w, i) => {
      const x = RAND + (i % 2) * (spalteW + 40);
      const oben = y + Math.floor(i / 2) * zeileH;
      ctx.fillStyle = look.linie;
      ctx.fillRect(x, oben, spalteW, 2);
      ctx.font = `500 34px ${look.text}`;
      ctx.fillStyle = look.blass;
      ctx.fillText(passend(ctx, w.name, spalteW), x, oben + 50);
      const px = groesseFuer(ctx, w.wert, look.zahl, look.zahlGewicht, spalteW, 66, 36);
      ctx.font = `${look.zahlGewicht} ${px}px ${look.zahl}`;
      ctx.fillStyle = look.tinte;
      ctx.fillText(passend(ctx, w.wert, spalteW), x, oben + 122);
    });
  }

  // Fuß: Aufruf und Adresse
  ctx.fillStyle = look.linie;
  ctx.fillRect(RAND, FUSS_Y, INHALT_W, 2);
  const aufruf = String(ergebnis?.aufruf || opts.aufruf || "Spielst du mit?");
  const aufrufPx = groesseFuer(ctx, aufruf, look.text, 600, INHALT_W, 46, 34);
  ctx.font = `600 ${aufrufPx}px ${look.text}`;
  ctx.fillStyle = look.tinte;
  ctx.fillText(passend(ctx, aufruf, INHALT_W), RAND, FUSS_Y + 82);
  ctx.font = `700 40px ${look.text}`;
  ctx.fillStyle = look.akzent;
  ctx.fillText(passend(ctx, anzeigeAdresse(ergebnis), INHALT_W), RAND, FUSS_Y + 142);

  return canvas;
}

/** Canvas → PNG-Blob */
export function alsPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht erzeugt werden"))), "image/png");
  });
}

// ---------------------------------------------------------------------------------------------------------- Teilen

/** Kann das Gerät eine Bilddatei über das Teilen-Menü weitergeben? (Handys, Safari, Edge unter Windows) */
export function kannDateiTeilen(datei) {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function"
      && typeof navigator.canShare === "function" && navigator.canShare({ files: [datei] });
  } catch {
    return false;
  }
}

/** Kann der Browser ein Bild in die Zwischenablage legen? */
export function kannBildKopieren() {
  return typeof window !== "undefined" && typeof window.ClipboardItem === "function"
    && typeof navigator?.clipboard?.write === "function";
}

export async function bildKopieren(blob) {
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
}

/** Text in die Zwischenablage; ältere Browser über ein verstecktes Textfeld. true = geklappt */
export async function textKopieren(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* weiter mit dem Rückweg */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Startet den Download einer Datei */
export function speichern(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
