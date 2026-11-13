// ui/chatEmojis.js
// Eigene Pixel-Emojis für den Weltchat (07.11.) — im Code gezeichnet wie die Fische
// (ui/fische.js), 12 × 12 Bildpunkte. Im Text stehen sie als Kürzel („:herz:“), der
// Server reicht den Text unverändert weiter; erst der Chat ersetzt die Kürzel durch Bilder.
// Wer ein Emoji ergänzt: Name nur a–z/_, jede Zeile genau 12 Zeichen, Farben aus FARBEN.

const FARBEN = {
    k: "#3b2516", // Kontur
    y: "#ffd84a", o: "#e8a83a", O: "#f2803a",
    w: "#ffffff", l: "#fff3c4", s: "#c8c8d0", S: "#6a6a72",
    r: "#e8403a", R: "#a8302a",
    b: "#60a5fa", B: "#2a6ac8",
    g: "#7fc25a", G: "#3a8a3a",
    p: "#f4a8c0", P: "#e07090",
    n: "#8a5a32", N: "#5a3a1a",
};

/** Grundgesicht; die Gesichter unten legen nur ihre Züge darüber (Leerzeichen = Grund bleibt). */
const GESICHT = [
    "....kkkk....",
    "..kkyyyykk..",
    ".kyyyyyyyyk.",
    ".kyyyyyyyyk.",
    "kyyyyyyyyyyk",
    "kyyyyyyyyyyk",
    "kyyyyyyyyyyk",
    "kyyyyyyyyyyk",
    ".kyyyyyyyyk.",
    ".kyyyyyyyyk.",
    "..kkyyyykk..",
    "....kkkk....",
];
function gesicht(zuege, fuellung = "y") {
    return GESICHT.map((zeile, y) => {
        const z = zuege[y];
        return [...zeile].map((c, x) => {
            const neu = z?.[x];
            if (neu && neu !== " ") return neu;
            return c === "y" ? fuellung : c;
        }).join("");
    });
}

const BILDER = {
    grinsen: gesicht({
        3: "    k  k    ",
        4: "    k  k    ",
        6: "  kkkkkkkk  ",
        7: "  kwwwwwwk  ",
        8: "   kwwwwk   ",
        9: "    kkkk    ",
    }),
    lachen: gesicht({
        3: "   k    k   ",
        4: "  k k  k k  ",
        5: " b        b ",
        6: " bkkkkkkkkb ",
        7: " b kwwwwk b ",
        8: "    krrk    ",
        9: "    kkkk    ",
    }),
    verliebt: gesicht({
        3: "  r r  r r  ",
        4: "  rrr  rrr  ",
        5: "   r    r   ",
        7: "   k    k   ",
        8: "    kkkk    ",
    }),
    cool: gesicht({
        3: "kkkkkkkkkkkk",
        4: " kwkk  kwkk ",
        5: "  kk    kk  ",
        7: "        k   ",
        8: "    kkkk    ",
    }),
    denken: gesicht({
        2: "      kk    ",
        3: "    k  k    ",
        4: "    k  k    ",
        7: "     kkk    ",
        8: " ooo        ",
        9: "ooooo       ",
        10: " oo         ",
    }),
    traurig: gesicht({
        3: "    k  k    ",
        4: "    k  k    ",
        5: "       b    ",
        6: "       b    ",
        7: "    kkkk    ",
        8: "   k    k   ",
    }),
    wut: gesicht({
        2: "   k    k   ",
        3: "    k  k    ",
        4: "    k  k    ",
        7: "    kkkk    ",
        8: "   k    k   ",
    }, "r"),
    staunen: gesicht({
        3: "   kk  kk   ",
        4: "   kk  kk   ",
        6: "     kk     ",
        7: "    kNNk    ",
        8: "    kNNk    ",
        9: "     kk     ",
    }),
    daumen_hoch: [
        "....kk......",
        "...kyyk.....",
        "...kyyk.....",
        "..kyyyk.....",
        "kkkkyyyykkk.",
        "kbbkyyyyyyyk",
        "kbbkyyyykkk.",
        "kbbkyyyyyyyk",
        "kbbkyyyykkk.",
        "kbbkyyyyyyyk",
        "kkkkkkkkkkk.",
        "............",
    ],
    herz: [
        "............",
        "..kk....kk..",
        ".krrk..krrk.",
        "krwrrkkrrrrk",
        "krrrrrrrrrrk",
        "krrrrrrrrrrk",
        ".krrrrrrrRk.",
        "..krrrrrRk..",
        "...krrrRk...",
        "....krRk....",
        ".....kk.....",
        "............",
    ],
    feuer: [
        "......k.....",
        ".....kOk....",
        ".....kOk.k..",
        "..k.kOOOkOk.",
        ".kOkOOyOOOk.",
        ".kOOOyyyOOk.",
        "kOOOyyyyOOOk",
        "kOOyyyyyyOOk",
        "kOOyywwyyOOk",
        ".kOyywwyyOk.",
        "..kkyyyykk..",
        "....kkkk....",
    ],
    glitzer: [
        "....k.......",
        "...kyk......",
        "...kyk......",
        ".kkyyykk....",
        "kyyywyyyk...",
        ".kkyyykk....",
        "...kyk......",
        "...kyk...k..",
        "....k...kyk.",
        ".......kyyyk",
        "........kyk.",
        ".........k..",
    ],
    stern: [
        ".....kk.....",
        "....kyyk....",
        "....kyyk....",
        "kkkkyyyykkkk",
        ".kyyyywyyyk.",
        "..kyyyyyyk..",
        "...kyyyyk...",
        "..kyyyyyyk..",
        "..kyykkyyk..",
        ".kyyk..kyyk.",
        ".kkk....kkk.",
        "............",
    ],
    totenkopf: [
        "...kkkkkk...",
        "..kwwwwwwk..",
        ".kwwwwwwwwk.",
        ".kwwwwwwwwk.",
        ".kwkkwwkkwk.",
        ".kwkkwwkkwk.",
        ".kwwwwwwwwk.",
        "..kwwkkwwk..",
        "...kwwwwk...",
        "...kwkkwk...",
        "....kkkk....",
        "............",
    ],
    augen: [
        "............",
        "............",
        "............",
        ".kkk...kkk..",
        "kwwwk.kwwwk.",
        "kwwkk.kwwkk.",
        "kwwkk.kwwkk.",
        "kwwwk.kwwwk.",
        ".kkk...kkk..",
        "............",
        "............",
        "............",
    ],
    keimling: [
        "............",
        "..kk....kk..",
        ".kggk..kggk.",
        "kgggGkkGgggk",
        ".kgGGkkGGgk.",
        "..kkkGGkkk..",
        "....kGGk....",
        "....kGGk....",
        "..kkkkkkkk..",
        ".knnnnnnnnk.",
        "knnNnnnnNnnk",
        "kkkkkkkkkkkk",
    ],
    sonnenblume: [
        "....kkkk....",
        "..kkyyyykk..",
        ".kyyoyyoyyk.",
        ".kyykkkkyyk.",
        "kyykNnnNkyyk",
        "koykNnnNkyok",
        ".kyykkkkyyk.",
        ".kyyoyyoyyk.",
        "..kkyGGykk..",
        "....kGGk....",
        "..kggGGk....",
        "...kkkkk....",
    ],
    tomate: [
        ".....kk.....",
        "...kkGGkk...",
        "..kGGGGGGk..",
        ".krrkGGkrrk.",
        "krrrrkkrrrrk",
        "krwrrrrrrrrk",
        "krwrrrrrrrrk",
        "krrrrrrrrrRk",
        "krrrrrrrrRRk",
        ".krrrrrrRRk.",
        "..kkRRRRkk..",
        "....kkkk....",
    ],
    karotte: [
        "...k.kk.k...",
        "..kGkGGkGk..",
        "...kGGGGk...",
        "..kOOOOOOk..",
        "..kOOOOOOk..",
        "..kOkOOOOk..",
        "...kOOOOk...",
        "...kOOkOk...",
        "....kOOk....",
        "....kOOk....",
        ".....kk.....",
        "............",
    ],
    huhn: [
        "...rr.......",
        "..krrk......",
        ".kwwwwk.....",
        ".kwkwwk.....",
        "OOkwwwk.....",
        ".rkwwwkkkk..",
        ".rkwwwwwwwk.",
        "..kwwwwwwwwk",
        "..kwwwswwwk.",
        "...kwwwwwk..",
        "....O..O....",
        "...OO.OO....",
    ],
    schwein: [
        ".kk......kk.",
        "kppk....kppk",
        "kpppkkkkpppk",
        ".kppppppppk.",
        "kppkppppkppk",
        "kppppppppppk",
        "kpppPPPPpppk",
        "kppPkPPkPppk",
        "kpppPPPPpppk",
        ".kppppppppk.",
        "..kkppppkk..",
        "....kkkk....",
    ],
    katze: [
        ".k........k.",
        "kOk......kOk",
        "kOOkkkkkkOOk",
        "kOOOOOOOOOOk",
        "kOOkOOOOkOOk",
        "kOOkOOOOkOOk",
        "kOOOOppOOOOk",
        "kOOOkOOkOOOk",
        ".kOOOkkOOOk.",
        "..kkOOOOkk..",
        "....kkkk....",
        "............",
    ],
    fisch: [
        "............",
        "............",
        "...kkkkk....",
        "..kbbbbbk..k",
        ".kwkbbbbbkbk",
        "kbbbbbbbbbbk",
        ".kbBBBBBbkbk",
        "..kBBBBBk..k",
        "...kkkkk....",
        "............",
        "............",
        "............",
    ],
    ei: [
        "....kkkk....",
        "...kwwwwk...",
        "..kwwwwwwk..",
        "..kwlwwwwk..",
        ".kwlwwwwwwk.",
        ".kwwwwwwwwk.",
        ".kwwwwwwwsk.",
        ".kwwwwwwwsk.",
        ".kwwwwwwssk.",
        "..kwwwwssk..",
        "...kkkkkk...",
        "............",
    ],
    sonne: [
        ".....OO.....",
        ".O...OO...O.",
        "..O......O..",
        "....kkkk....",
        "...kywyyk...",
        "OO.kyyyyk.OO",
        "OO.kyyyok.OO",
        "...kyyook...",
        "....kkkk....",
        "..O......O..",
        ".O...OO...O.",
        ".....OO.....",
    ],
    regen: [
        "............",
        "....kkk.....",
        "...kwwwkkk..",
        ".kkwwwwwwwk.",
        "kwwwwwwwwwwk",
        "kwwwwwwwwwsk",
        ".ksssssssskk",
        "..kkkkkkkk..",
        "..b...b...b.",
        ".b...b...b..",
        "..b...b.....",
        ".b...b......",
    ],
    muenze: [
        "....kkkk....",
        "..kkyyyykk..",
        ".kywyyyyyok.",
        ".kwyyooyyok.",
        "kyyyoyyoyyok",
        "kyyyoyyyyyok",
        "kyyyoyooyyok",
        "kyyyoyyoyyok",
        ".kyyyooyyok.",
        ".kyyyyyyook.",
        "..kkooookk..",
        "....kkkk....",
    ],
    pokal: [
        "..kkkkkkkk..",
        "..kywyyyok..",
        "kkkywyyyokkk",
        "k.kywyyyok.k",
        "k.kyyyyyok.k",
        ".kkyyyyyokk.",
        "...kyyyok...",
        "....kyok....",
        "....kyok....",
        "...kkkkkk...",
        "...knnnnk...",
        "...kkkkkk...",
    ],
};
// Daumen runter = Daumen hoch kopfüber
BILDER.daumen_runter = [...BILDER.daumen_hoch].reverse();

/** Reihenfolge im Auswahlfeld (7 Spalten). */
export const CHAT_EMOJI_NAMEN = [
    "grinsen", "lachen", "verliebt", "cool", "denken", "traurig", "wut",
    "staunen", "daumen_hoch", "daumen_runter", "herz", "feuer", "glitzer", "totenkopf",
    "augen", "keimling", "sonnenblume", "tomate", "karotte", "ei", "huhn",
    "schwein", "katze", "fisch", "sonne", "regen", "muenze", "pokal",
];

export const CHAT_EMOJI_KUERZEL = (name) => `:${name}:`;

const cache = new Map();
/** Bild als data-URL (einmal gezeichnet, danach gemerkt). Null, wenn es den Namen nicht gibt. */
export function chatEmojiBild(name) {
    if (cache.has(name)) return cache.get(name);
    const raster = BILDER[name];
    if (!raster || typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = 12; c.height = 12;
    const ctx = c.getContext("2d");
    raster.forEach((zeile, y) => {
        [...zeile].forEach((ch, x) => {
            const f = FARBEN[ch];
            if (!f) return;
            ctx.fillStyle = f;
            ctx.fillRect(x, y, 1, 1);
        });
    });
    const url = c.toDataURL("image/png");
    cache.set(name, url);
    return url;
}

/**
 * Text in Stücke zerlegen: Strings bleiben Text, bekannte „:name:“ werden
 * { emoji: name }. Unbekannte Kürzel bleiben, wie sie getippt wurden.
 */
export function zerlegeChatText(text) {
    const teile = [];
    const muster = /:([a-z_]+):/g;
    let rest = 0;
    let m;
    while ((m = muster.exec(text)) !== null) {
        if (!BILDER[m[1]]) continue;
        if (m.index > rest) teile.push(text.slice(rest, m.index));
        teile.push({ emoji: m[1] });
        rest = m.index + m[0].length;
    }
    if (rest < text.length) teile.push(text.slice(rest));
    return teile;
}

/** Nur für Prüfungen: alle Raster mit ihren Namen. */
export const _CHAT_EMOJI_RASTER = BILDER;
