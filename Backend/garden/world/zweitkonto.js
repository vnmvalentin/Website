// garden/world/zweitkonto.js
// Zweit-Accounts erkennen: eine Farm je Gerät, keine Post zwischen verknüpften Accounts.
//
// WARUM (Nutzerentscheidung 03.11.2026)
// Mit einem zweiten Twitch-Account hatte man eine zweite Farm: doppelter
// Ladenvorrat je Rotation, doppelte Missionen — und per Post wanderte alles auf
// die Hauptfarm. Entschieden wurde:
//   * Gleiches GERÄT  → nur die zuerst dort gespielte Farm ist spielbar.
//   * Gleicher ANSCHLUSS (Internet-Adresse, z. B. WLAN zu Hause) → beide Farmen
//     bleiben spielbar, aber Post zwischen ihnen ist gesperrt. Geschwister und
//     Mitbewohner sollen nicht ausgesperrt werden.
//
// GRENZEN
// Die Geräte-Kennung legt der Browser an (localStorage). Wer sie löscht oder fälscht,
// gilt als neues Gerät — dann greift nur noch die Anschluss-Regel bei der Post.
// Das genügt: ohne Post bringt ein Zweit-Account der Hauptfarm nichts.
//
// DATENSCHUTZ
// Gespeichert werden nur gesalzene Prüfsummen, keine Adressen. Anschluss-Einträge
// verfallen nach 30 Tagen.

const crypto = require("crypto");

const SALZ = process.env.GARDEN_KONTO_SALT || "vf-zweitkonto-v1";
const IP_HALTBAR_MS = 30 * 24 * 60 * 60 * 1000;
const IP_NEU_SCHREIBEN_MS = 10 * 60 * 1000;
const MAX_GERAETE = 20;
const MAX_IPS = 50;
const KENNUNG_MUSTER = /^[A-Za-z0-9-]{16,64}$/;

/** Ausnahmen (Twitch-ID oder Login, kommagetrennt) — z. B. Test-Accounts des Betreibers. */
function ausnahmen() {
    return new Set(String(process.env.GARDEN_ZWEITKONTO_AUSNAHMEN || "")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function pruefsumme(art, wert) {
    return crypto.createHash("sha256").update(`${SALZ}:${art}:${wert}`).digest("hex").slice(0, 24);
}

/** Client-Adresse hinter nginx (wie analytics/analyticsRoutes.js). */
function clientIp(req) {
    const weiter = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return weiter.length ? weiter[weiter.length - 1] : (req.socket?.remoteAddress || "");
}

function geraetVon(req) {
    const roh = String(req.headers["x-vf-geraet"] || "");
    return KENNUNG_MUSTER.test(roh) ? pruefsumme("geraet", roh) : null;
}

function kennzeichen(state) {
    const k = state && typeof state.kennzeichen === "object" && state.kennzeichen ? state.kennzeichen : {};
    return {
        geraete: k.geraete && typeof k.geraete === "object" ? k.geraete : {},
        ips: k.ips && typeof k.ips === "object" ? k.ips : {},
    };
}

function istAusnahme(userId, state) {
    const a = ausnahmen();
    return a.has(String(userId).toLowerCase()) || a.has(String(state?.twitchLogin || "").toLowerCase());
}

/** Wem gehört dieses Gerät? Die Farm, die es am frühesten gesehen hat. */
function besitzerVon(farmStates, geraet) {
    let bester = null;
    for (const [uid, s] of farmStates) {
        const seit = Number(kennzeichen(s).geraete[geraet]);
        if (!Number.isFinite(seit) || seit <= 0) continue;
        if (!bester || seit < bester.seit) bester = { uid: String(uid), seit };
    }
    return bester;
}

/**
 * Prüft den Zugang und merkt Gerät/Anschluss am Spielstand.
 * @returns {{ gesperrt: boolean, geaendert: boolean }}
 */
function pruefeUndMerke(farmStates, userId, state, req, now = Date.now()) {
    if (!state) return { gesperrt: false, geaendert: false };
    const k = kennzeichen(state);
    let geaendert = false;
    const geraet = geraetVon(req);

    if (geraet && !istAusnahme(userId, state)) {
        const besitzer = besitzerVon(farmStates, geraet);
        if (besitzer && besitzer.uid !== String(userId)) {
            const fremd = farmStates.get(besitzer.uid);
            if (!istAusnahme(besitzer.uid, fremd)) return { gesperrt: true, geaendert: false };
        }
    }
    if (geraet && !k.geraete[geraet] && Object.keys(k.geraete).length < MAX_GERAETE) {
        k.geraete[geraet] = now;
        geaendert = true;
    }

    const ip = clientIp(req);
    if (ip) {
        const h = pruefsumme("ip", ip);
        if (now - (Number(k.ips[h]) || 0) > IP_NEU_SCHREIBEN_MS) {
            k.ips[h] = now;
            geaendert = true;
        }
    }
    for (const [h, t] of Object.entries(k.ips)) if (now - Number(t) > IP_HALTBAR_MS) { delete k.ips[h]; geaendert = true; }
    const ipListe = Object.entries(k.ips).sort((a, b) => b[1] - a[1]);
    if (ipListe.length > MAX_IPS) { k.ips = Object.fromEntries(ipListe.slice(0, MAX_IPS)); geaendert = true; }

    if (geaendert) state.kennzeichen = k;
    return { gesperrt: false, geaendert };
}

/** Teilen zwei Spielstände ein Gerät oder (in den letzten 30 Tagen) einen Anschluss? */
function verknuepft(a, b, now = Date.now()) {
    const ka = kennzeichen(a);
    const kb = kennzeichen(b);
    for (const g of Object.keys(ka.geraete)) if (kb.geraete[g]) return true;
    for (const [h, t] of Object.entries(ka.ips)) {
        const t2 = Number(kb.ips[h]);
        if (t2 && now - Number(t) < IP_HALTBAR_MS && now - t2 < IP_HALTBAR_MS) return true;
    }
    return false;
}

const SPERR_TEXT = "Auf diesem Gerät wird schon eine andere Farm gespielt. Pro Gerät ist nur eine Farm erlaubt.";

module.exports = { pruefeUndMerke, verknuepft, istAusnahme, geraetVon, SPERR_TEXT, _pruefsumme: pruefsumme };
