// garden/world/mail.js
// Briefkasten der Virtual Farm — Gold, Nachrichten und Samen zwischen Spielern.
//
// SICHERHEITSMODELL
// Der Rest des Spiels ist client-autoritativ (der Client schickt seinen kompletten
// Farm-State per PUT). Der Briefkasten ist es bewusst NICHT: hier verschiebt sich Wert
// zwischen zwei Konten, deshalb rechnet der Server. Konkret:
//   * Beträge müssen ganzzahlig und > 0 sein  → Minusbeträge können kein Geld erzeugen
//   * Der Absender muss die Summe laut SERVER-State besitzen, nicht laut Client
//   * Abbuchung und Gutschrift passieren in einem Schritt in derselben Funktion
//   * Der Client darf `mailbox` nie selbst schreiben (siehe compactFarmState)
// Nicht gelöst (und außerhalb dieses Moduls): der Client kann seinen eigenen Goldstand
// im PUT weiterhin frei setzen. Der Briefkasten macht das nicht schlimmer — er ist nur
// kein zusätzliches Schlupfloch.

const { verkaufswert } = require("../core/economy");

const MAIL_MAX_ITEMS = 50;              // pro Briefkasten
const MAIL_MESSAGE_MAX = 200;           // Zeichen
const MAIL_GOLD_MIN = 1;
const MAIL_GOLD_MAX = 1_000_000_000_000; // 1 Billion pro Sendung
const MAIL_MAX_ANHANG = 12;             // Samen + Ernte + Tiere zusammen pro Sendung
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_SENDS = 20;

const sendLog = new Map(); // twitchId -> number[] (Zeitstempel)

/**
 * Zählt die Sendungen im Zeitfenster. Gibt bei Ablehnung mit, wie lange es noch
 * dauert — ohne diese Angabe ist ein 429 für den Spieler nur ein stummer Fehler.
 * Das Limit zählt pro ABSENDER; eingehende Post ist nie betroffen.
 */
function checkRateLimit(twitchId) {
    const now = Date.now();
    const list = (sendLog.get(twitchId) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (list.length >= RATE_MAX_SENDS) {
        sendLog.set(twitchId, list);
        const frei = Math.max(0, RATE_WINDOW_MS - (now - Math.min(...list)));
        return { ok: false, wartenMs: frei };
    }
    list.push(now);
    sendLog.set(twitchId, list);
    return { ok: true, wartenMs: 0 };
}

/** Steuerzeichen raus, Länge kappen. Kein HTML — das Frontend rendert als reinen Text. */
function sanitizeMessage(raw) {
    if (typeof raw !== "string") return "";
    // eslint-disable-next-line no-control-regex
    return raw.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, MAIL_MESSAGE_MAX);
}

/**
 * Prüft einen Goldbetrag. Genau hier wird der vom User genannte Fall abgefangen:
 * negative Beträge (die beim Absender gutschreiben statt abbuchen würden) und
 * alles, was keine saubere ganze Zahl ist (NaN, Infinity, "5e10", 1.5).
 */
function normalizeGoldAmount(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (!Number.isInteger(n)) return null;
    if (n < MAIL_GOLD_MIN) return null;
    if (n > MAIL_GOLD_MAX) return null;
    return n;
}

function findRecipient(farmStates, toLogin) {
    const wanted = String(toLogin || "").trim().toLowerCase();
    if (!wanted) return null;
    for (const [twitchId, state] of farmStates) {
        if (String(state?.twitchLogin || "").toLowerCase() === wanted) {
            return { twitchId, state };
        }
    }
    return null;
}

function newMailId() {
    return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Verschickt eine Sendung. Gibt { ok: true, mail } oder { ok: false, error, status }.
 * Mutiert Absender- und Empfänger-State; der Aufrufer muss beide als dirty markieren.
 */
/**
 * Register über frisch verschenkte Gegenstände.
 *
 * WARUM DAS NÖTIG IST: Inventar, Tiere und Deko gehören weiterhin dem Browser —
 * er schickt sie im Farm-State-PUT. Ein Speichervorgang, der beim Absenden schon
 * unterwegs war, trug den verschenkten Samen noch bei sich und trug ihn dem
 * Absender wieder ein, während er längst im fremden Briefkasten lag. Ergebnis:
 * derselbe Samen zweimal auf der Welt. Nachgestellt und bestätigt.
 *
 * Deshalb merkt sich der Server, was er gerade weggegeben hat, und wirft es aus
 * jedem eingehenden Spielstand heraus — lange genug, dass kein verspäteter PUT
 * mehr durchkommt.
 */
const VERSCHENKT_TTL_MS = 5 * 60 * 1000;
const verschenkt = new Map(); // twitchId -> Map<instanceId, verfallsZeit>

function merkeVerschenkt(twitchId, ids) {
    const id = String(twitchId);
    let liste = verschenkt.get(id);
    if (!liste) { liste = new Map(); verschenkt.set(id, liste); }
    const bis = Date.now() + VERSCHENKT_TTL_MS;
    for (const einzeln of ids) if (einzeln) liste.set(String(einzeln), bis);
}

/** Entfernt frisch Verschenktes aus einer Liste, die vom Client kam. */
function filtereVerschenkte(twitchId, liste) {
    if (!Array.isArray(liste) || liste.length === 0) return liste;
    const nutzer = String(twitchId);
    const gemerkt = verschenkt.get(nutzer);
    if (!gemerkt || gemerkt.size === 0) { verschenkt.delete(nutzer); return liste; }
    const jetzt = Date.now();
    for (const [id, bis] of gemerkt) if (bis <= jetzt) gemerkt.delete(id);
    // Leere Untertabellen mit entfernen — sie blieben sonst für immer stehen.
    if (gemerkt.size === 0) { verschenkt.delete(nutzer); return liste; }
    return liste.filter((eintrag) => {
        const id = eintrag?.instanceId || eintrag?.id;
        return !(id && gemerkt.has(String(id)));
    });
}

/**
 * Aufräumer für `verschenkt` und `sendLog`.
 *
 * `filtereVerschenkte` mistet nur aus, wenn derselbe Spieler noch einmal speichert.
 * Wer einmal etwas verschenkt und danach nie wieder online geht, hinterliess einen
 * Eintrag für die gesamte Serverlaufzeit; bei `sendLog` blieb der Schlüssel selbst
 * dann stehen, wenn alle Zeitstempel längst abgelaufen waren.
 */
const _mailPutz = setInterval(() => {
    const jetzt = Date.now();
    for (const [id, gemerkt] of verschenkt) {
        for (const [einzeln, bis] of gemerkt) if (bis <= jetzt) gemerkt.delete(einzeln);
        if (gemerkt.size === 0) verschenkt.delete(id);
    }
    for (const [id, liste] of sendLog) {
        if (liste.every((t) => jetzt - t >= RATE_WINDOW_MS)) sendLog.delete(id);
    }
}, 10 * 60 * 1000);
if (typeof _mailPutz.unref === "function") _mailPutz.unref();

/**
 * Nimmt Einzelwert und Liste entgegen und macht daraus eine saubere ID-Liste.
 * Der Einzelwert bleibt erhalten, damit ein Browser mit altem Bundle weiter senden kann.
 */
function sammleIds(einzeln, liste) {
    const roh = [];
    if (einzeln !== undefined && einzeln !== null && einzeln !== "") roh.push(einzeln);
    if (Array.isArray(liste)) roh.push(...liste);
    const gesehen = new Set();
    const ids = [];
    for (const eintrag of roh) {
        const id = String(eintrag ?? "").trim();
        if (!id || gesehen.has(id)) continue;   // doppelte IDs würden denselben Gegenstand zweimal verschicken
        gesehen.add(id);
        ids.push(id);
    }
    return ids;
}

function sendMail(farmStates, {
    fromTwitchId, fromLogin, toLogin, gold, message,
    seedInstanceId, seedInstanceIds, itemId, itemIds, petId, petIds,
}) {
    const senderState = farmStates.get(String(fromTwitchId));
    if (!senderState) return { ok: false, status: 400, error: "Du hast noch keine Farm." };

    const recipient = findRecipient(farmStates, toLogin);
    if (!recipient) return { ok: false, status: 404, error: "Diesen Farmer gibt es nicht." };
    if (String(recipient.twitchId) === String(fromTwitchId)) {
        return { ok: false, status: 400, error: "Du kannst dir nicht selbst schreiben." };
    }

    const cleanMessage = sanitizeMessage(message);
    let goldAmount = 0;
    if (gold !== undefined && gold !== null && gold !== "") {
        goldAmount = normalizeGoldAmount(gold);
        if (goldAmount === null) {
            return { ok: false, status: 400, error: "Ungültiger Betrag. Nur ganze Zahlen über 0." };
        }
        const senderGold = Number(senderState.gold || 0);
        if (!Number.isFinite(senderGold) || senderGold < goldAmount) {
            return { ok: false, status: 400, error: "Du hast nicht genug Gold." };
        }
    }

    const seedIds = sammleIds(seedInstanceId, seedInstanceIds);
    const ernteIds = sammleIds(itemId, itemIds);
    const tierIds = sammleIds(petId, petIds);
    if (seedIds.length + ernteIds.length + tierIds.length > MAIL_MAX_ANHANG) {
        return { ok: false, status: 400, error: `Höchstens ${MAIL_MAX_ANHANG} Gegenstände pro Sendung.` };
    }

    // ── Prüfen, noch nichts ändern ────────────────────────────────────────────
    // Erst wenn ALLES gültig ist, wird abgebucht. Sonst verliert der Absender die
    // schon abgezogenen Samen, wenn weiter unten ein Tier nicht gefunden wird.

    // Samen: müssen wirklich im SERVER-Inventar des Absenders liegen
    const inv = Array.isArray(senderState.inventory) ? senderState.inventory : [];
    const seedPayloads = [];
    for (const id of seedIds) {
        const seed = inv.find((s) => s && String(s.instanceId) === id);
        if (!seed) return { ok: false, status: 400, error: "Diesen Samen hast du nicht." };
        seedPayloads.push({
            seedId: seed.seedId,
            name: seed.name,
            rarity: seed.rarity,
            singleUse: seed.singleUse !== false,
            shopPrice: Number(seed.shopPrice) || 0,
        });
    }

    // Ernte: liegt im serverseitigen Lager, also ist die Herkunft ohnehin sicher.
    // Gerechnet wird nichts — der Wert steckt in den Eigenschaften und wird beim
    // Verkaufen beim Empfänger neu berechnet.
    const lager = Array.isArray(senderState.harvestedItems) ? senderState.harvestedItems : [];
    const itemPayloads = [];
    for (const id of ernteIds) {
        const item = lager.find((i) => i && String(i.id) === id);
        if (!item) return { ok: false, status: 400, error: "Diese Ernte hast du nicht." };
        itemPayloads.push({
            seedId: item.seedId, name: item.name, rarity: item.rarity,
            singleUse: item.singleUse !== false, size: Number(item.size) || 1,
            specialData: item.specialData || undefined, statusEffect: item.statusEffect || null,
        });
    }

    // Tier: nur aus dem Rucksack. Ein platziertes Tier muss man erst einsammeln —
    // sonst müsste hier auch noch das fremde Grundstück nachgeführt werden.
    const tiere = Array.isArray(senderState.petInventory) ? senderState.petInventory : [];
    const petPayloads = [];
    for (const id of tierIds) {
        const pet = tiere.find((p) => p && String(p.id || p.instanceId) === id);
        if (!pet) return { ok: false, status: 400, error: "Dieses Tier hast du nicht im Rucksack." };
        // `name` ist die ART (Hund, Katze …) — daraus baut der Empfänger sein Bild
        // selbst (hydratePet in GameContainer.jsx). Bildpfade des Absenders werden
        // BEWUSST nicht durchgereicht: sie kämen aus einem fremden Browser und
        // landeten ungeprüft in einem <img src>.
        petPayloads.push({
            name: pet.name, customName: pet.customName || null, rarity: pet.rarity || "COMMON",
            specialType: pet.specialType || null, emoji: pet.emoji || null,
            ability: pet.ability || null,
        });
    }

    if (!goldAmount && !cleanMessage && !seedPayloads.length && !itemPayloads.length && !petPayloads.length) {
        return { ok: false, status: 400, error: "Leere Sendung." };
    }

    const box = Array.isArray(recipient.state.mailbox) ? recipient.state.mailbox : [];
    if (box.length >= MAIL_MAX_ITEMS) {
        return { ok: false, status: 400, error: "Der Briefkasten ist voll." };
    }

    // ── Ab hier wird geändert ─────────────────────────────────────────────────
    if (goldAmount) {
        senderState.gold = Math.max(0, Number(senderState.gold || 0) - goldAmount);
    }
    if (seedIds.length) {
        const weg = new Set(seedIds);
        senderState.inventory = inv.filter((s) => !weg.has(String(s?.instanceId)));
    }
    if (ernteIds.length) {
        const weg = new Set(ernteIds);
        senderState.harvestedItems = lager.filter((i) => !weg.has(String(i?.id)));
    }
    if (tierIds.length) {
        const weg = new Set(tierIds);
        senderState.petInventory = tiere.filter((p) => !weg.has(String(p?.id || p?.instanceId)));
    }

    const mail = {
        id: newMailId(),
        from: String(fromLogin || "unbekannt").toLowerCase(),
        sentAt: Date.now(),
        gold: goldAmount || 0,
        message: cleanMessage,
        seeds: seedPayloads,
        items: itemPayloads,
        pets: petPayloads,
        // Einzelfelder bleiben gesetzt, damit ein noch nicht neu geladener Browser
        // die Sendung wenigstens anzeigt. claimMail liest immer die Listen zuerst.
        seed: seedPayloads[0] || null,
        item: itemPayloads[0] || null,
        pet: petPayloads[0] || null,
        claimed: false,
    };
    recipient.state.mailbox = [mail, ...box].slice(0, MAIL_MAX_ITEMS);

    // Gegen den Wettlauf mit einem noch laufenden Speichervorgang beim Absender
    merkeVerschenkt(fromTwitchId, [...seedIds, ...ernteIds, ...tierIds]);

    return { ok: true, mail, recipientTwitchId: recipient.twitchId };
}

/** Liste bevorzugt, Einzelfeld als Rückfall für Sendungen aus der Zeit davor. */
function anhaenge(liste, einzeln) {
    if (Array.isArray(liste)) return liste.filter(Boolean);
    return einzeln ? [einzeln] : [];
}

let anhangZaehler = 0;
/** Eindeutig auch dann, wenn mehrere Anhänge in derselben Millisekunde landen. */
function neueAnhangId() {
    anhangZaehler = (anhangZaehler + 1) % 1e6;
    return `mail_${Date.now().toString(36)}_${anhangZaehler.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Hebt eine Sendung ab. Gold/Samen wandern in den Server-State des Empfängers,
 * die Sendung verschwindet aus dem Briefkasten.
 */
function claimMail(farmStates, twitchId, mailId) {
    const state = farmStates.get(String(twitchId));
    if (!state) return { ok: false, status: 400, error: "Keine Farm gefunden." };
    const box = Array.isArray(state.mailbox) ? state.mailbox : [];
    const idx = box.findIndex((m) => m && m.id === mailId);
    if (idx === -1) return { ok: false, status: 404, error: "Sendung nicht gefunden." };

    const mail = box[idx];
    // Listen zuerst, Einzelfelder nur als Rückfall — im Briefkasten können noch
    // Sendungen von vor der Mehrfach-Umstellung liegen.
    const seeds = anhaenge(mail.seeds, mail.seed);
    const items = anhaenge(mail.items, mail.item);
    const pets = anhaenge(mail.pets, mail.pet);
    const credited = { gold: 0, seeds: [], items: [], pets: [], seed: null, item: null, pet: null };

    // Rucksackgrenze: Samen und Ernte teilen sich die Plätze. Passt es nicht,
    // bleibt die Sendung liegen — sie darf nicht verfallen.
    const maxSlots = Math.max(1, Number(state.inventoryMaxSlots) || 50);
    const belegt = (state.inventory?.length || 0) + (state.harvestedItems?.length || 0);
    const brauchtPlatz = seeds.length + items.length;
    if (brauchtPlatz > 0 && belegt + brauchtPlatz > maxSlots) {
        return {
            ok: false,
            status: 400,
            error: brauchtPlatz === 1
                ? "Rucksack voll — mach erst Platz."
                : `Rucksack voll — die Sendung braucht ${brauchtPlatz} freie Plätze.`,
        };
    }

    if (mail.gold > 0) {
        const amount = normalizeGoldAmount(mail.gold);
        if (amount !== null) {
            state.gold = Number(state.gold || 0) + amount;
            credited.gold = amount;
        }
    }
    for (const seed of seeds) {
        if (!seed.seedId) continue;
        const inv = Array.isArray(state.inventory) ? state.inventory : [];
        const instance = {
            ...seed,
            instanceId: `mail_${Math.random().toString(36).slice(2, 10)}`,
        };
        state.inventory = [...inv, instance];
        credited.seeds.push(instance);
    }
    for (const item of items) {
        if (!item.seedId) continue;
        const lager = Array.isArray(state.harvestedItems) ? state.harvestedItems : [];
        const frucht = {
            ...item,
            id: neueAnhangId(),
            harvestedAt: Date.now(),
            // Der Wert reist NICHT mit der Sendung (den dürfte sonst der Absender
            // bestimmen) — er wird hier neu gerechnet. Ohne ihn stand jede
            // verschenkte Frucht beim Empfänger mit „0 Gold" da.
            sellValue: verkaufswert(item),
        };
        state.harvestedItems = [frucht, ...lager];
        credited.items.push(frucht);
    }
    for (const pet of pets) {
        if (!pet.name) continue;
        const tiere = Array.isArray(state.petInventory) ? state.petInventory : [];
        const tier = { ...pet, id: neueAnhangId() };
        state.petInventory = [...tiere, tier];
        credited.pets.push(tier);
    }

    // Einzelfelder für ein Frontend, das noch die alte Antwort erwartet
    credited.seed = credited.seeds[0] || null;
    credited.item = credited.items[0] || null;
    credited.pet = credited.pets[0] || null;

    state.mailbox = [...box.slice(0, idx), ...box.slice(idx + 1)];
    return { ok: true, credited, mailbox: state.mailbox };
}

function getMailbox(farmStates, twitchId) {
    const state = farmStates.get(String(twitchId));
    return Array.isArray(state?.mailbox) ? state.mailbox : [];
}

module.exports = {
    sendMail,
    claimMail,
    getMailbox,
    checkRateLimit,
    filtereVerschenkte,
    // exportiert für die Tests
    normalizeGoldAmount,
    sanitizeMessage,
    MAIL_MAX_ITEMS,
    MAIL_MESSAGE_MAX,
    MAIL_GOLD_MAX,
    MAIL_MAX_ANHANG,
};
