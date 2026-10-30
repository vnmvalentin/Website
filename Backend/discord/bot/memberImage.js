// discord/bot/memberImage.js
// Zeichnet das Bild für Ein- und Austrittsnachrichten: Profilbild, Name, Server
// und Mitgliederzahl. Dritte Darstellung neben schlichtem Text und Karte.
// Es gibt mehrere Layouts (IMAGE_LAYOUTS); jedes ist eine eigene Zeichenfunktion.
//
// Die Schrift liegt bei (assets/fonts): auf dem Server ist nicht gesagt, dass
// überhaupt eine Schrift installiert ist — ohne käme ein Bild ohne Text heraus.
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '../assets/fonts');
// Lateinisch und Lateinisch-erweitert sind getrennte Dateien; beide stehen in
// der Schriftliste, danach fällt Skia auf Systemschriften zurück (Namen in
// anderen Schriften, Emojis).
for (const [file, family] of [
    ['Inter-latin-800.ttf', 'CardBold'], ['Inter-latin-ext-800.ttf', 'CardBoldExt'],
    ['Inter-latin-600.ttf', 'CardText'], ['Inter-latin-ext-600.ttf', 'CardTextExt'],
]) {
    try {
        GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
    } catch (e) {
        console.warn('[Discord] Schrift für Mitgliederbild fehlt:', file, e.message);
    }
}
const BOLD = 'CardBold, CardBoldExt, sans-serif';
const TEXT = 'CardText, CardTextExt, sans-serif';

const KINDS = {
    welcome: {
        accent: '#5865f2', poster: '#4752c4', kicker: 'WILLKOMMEN', hello: 'HALLO',
        line: (server) => `auf ${server}`, count: (n) => `Mitglied #${n}`,
        badgeNumber: (n) => `#${n}`, badgeLabel: 'MITGLIED',
    },
    leave: {
        accent: '#8a93a0', poster: '#3b4049', kicker: 'AUF WIEDERSEHEN', hello: 'TSCHÜSS',
        line: (server) => `hat ${server} verlassen`, count: (n) => `Noch ${n} Mitglieder`,
        badgeNumber: (n) => String(n), badgeLabel: 'NOCH ÜBRIG',
    },
};

/** Layouts in der Reihenfolge, in der das Dashboard sie anbietet. */
const IMAGE_LAYOUTS = ['classic', 'center', 'poster', 'light', 'badge'];
const imageLayout = (v) => (IMAGE_LAYOUTS.includes(v) ? v : 'classic');

const AVATAR_TIMEOUT_MS = 4000;

/** Kürzt einen Text mit "…", bis er in die Breite passt. */
function fit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
}

/** Schrift so groß wie möglich, bis der Text passt — erst darunter wird gekürzt. */
function fitFont(ctx, text, maxSize, minSize, room, family = BOLD) {
    let size = maxSize;
    do {
        ctx.font = `${size}px ${family}`;
        size -= 4;
    } while (ctx.measureText(text).width > room && size >= minSize);
    return fit(ctx, text, room);
}

/** Gesperrter Text. letterSpacing gibt es nicht in jeder Version der Bibliothek. */
function spaced(ctx, text, x, y, gap, align = 'left') {
    const chars = [...text];
    const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + gap, -gap);
    let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of chars) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + gap;
    }
    ctx.textAlign = prev;
}

async function loadAvatar(url) {
    if (!url) return null;
    try {
        return await Promise.race([
            loadImage(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), AVATAR_TIMEOUT_MS)),
        ]);
    } catch {
        // Ohne Profilbild steht der Anfangsbuchstabe in der Form
        return null;
    }
}

/**
 * Profilbild in einer Form. shape: 'circle' oder 'square' (abgerundet).
 * ring: Farbe eines Rands drumherum (oder null).
 */
function drawAvatar(ctx, { avatar, name, cx, cy, r, shape = 'circle', ring = null, ringWidth = 8, empty = '#23252f', letter = '#ffffff' }) {
    const outline = (pad) => {
        ctx.beginPath();
        if (shape === 'square') ctx.roundRect(cx - r - pad, cy - r - pad, (r + pad) * 2, (r + pad) * 2, r * 0.28 + pad);
        else ctx.arc(cx, cy, r + pad, 0, Math.PI * 2);
    };
    if (ring) {
        ctx.fillStyle = ring;
        outline(ringWidth);
        ctx.fill();
    }
    ctx.save();
    outline(0);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = empty;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = letter;
        ctx.font = `${Math.round(r * 0.92)}px ${BOLD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(name || '?').trim().charAt(0).toUpperCase() || '?', cx, cy + r * 0.06);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
}

/** Fläche mit runden Ecken; alles danach wird darauf beschnitten. */
function base(ctx, w, h, color) {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 22);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
}

/* ── Layouts ──────────────────────────────────────────────────────────────── */

/** Klassisch: Profilbild links, Text rechts, schräge Bahnen. */
function drawClassic(ctx, d) {
    const W = 1000, H = 320;
    base(ctx, W, H, '#15161d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = -H; x < W; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.lineTo(x + H + 56, 0);
        ctx.lineTo(x + 56, H);
        ctx.closePath();
        ctx.fill();
    }
    ctx.fillStyle = d.look.accent;
    ctx.fillRect(0, 0, 12, H);

    drawAvatar(ctx, { ...d, cx: 190, cy: H / 2, r: 100, ring: d.look.accent });

    const left = 340;
    const room = W - left - 48;
    ctx.textAlign = 'left';
    ctx.fillStyle = d.look.accent;
    ctx.font = `24px ${BOLD}`;
    spaced(ctx, d.look.kicker, left, 104, 5);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitFont(ctx, d.name, 66, 38, room), left, 178);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = `30px ${TEXT}`;
    ctx.fillText(fit(ctx, d.look.line(d.serverName), room), left, 226);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.font = `24px ${TEXT}`;
    ctx.fillText(d.look.count(d.memberCount), left, 268);
}

/** Zentriert: Profilbild oben in der Mitte, alles darunter mittig. */
function drawCenter(ctx, d) {
    const W = 1000, H = 420;
    base(ctx, W, H, '#121319');
    // Farbband oben, das Profilbild sitzt auf seiner Kante
    ctx.fillStyle = d.look.accent;
    ctx.fillRect(0, 0, W, 130);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let x = 0; x < W; x += 48) ctx.fillRect(x, 0, 24, 130);

    drawAvatar(ctx, { ...d, cx: W / 2, cy: 130, r: 86, ring: '#121319', ringWidth: 10 });

    ctx.textAlign = 'center';
    ctx.fillStyle = d.look.accent;
    ctx.font = `22px ${BOLD}`;
    spaced(ctx, d.look.kicker, W / 2, 268, 6, 'center');

    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitFont(ctx, d.name, 60, 34, W - 120), W / 2, 330);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = `26px ${TEXT}`;
    ctx.fillText(fit(ctx, `${d.look.line(d.serverName)}  ·  ${d.look.count(d.memberCount)}`, W - 120), W / 2, 378);
}

/** Plakat: ganze Fläche in Farbe, großes Wort, Profilbild als Kachel rechts. */
function drawPoster(ctx, d) {
    const W = 1000, H = 320;
    base(ctx, W, H, d.look.poster);
    // Großes Wort im Hintergrund, nur als Fläche
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.font = `210px ${BOLD}`;
    ctx.textAlign = 'left';
    ctx.fillText(d.look.hello, -12, H + 62);
    // Dunkler Keil rechts hinter dem Profilbild
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(700, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H);
    ctx.lineTo(620, H);
    ctx.closePath();
    ctx.fill();

    drawAvatar(ctx, { ...d, cx: 820, cy: H / 2, r: 112, shape: 'square', ring: '#ffffff', ringWidth: 7, empty: 'rgba(0,0,0,0.28)', letter: '#ffffff' });

    const left = 56;
    const room = 560;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = `22px ${BOLD}`;
    spaced(ctx, d.look.kicker, left, 92, 6);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitFont(ctx, d.name, 74, 38, room), left, 172);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `28px ${TEXT}`;
    ctx.fillText(fit(ctx, d.look.line(d.serverName), room), left, 222);

    // Mitgliederzahl als heller Block
    ctx.font = `22px ${BOLD}`;
    const label = d.look.count(d.memberCount);
    const lw = ctx.measureText(label).width + 32;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(left, 246, lw, 40, 6);
    ctx.fill();
    ctx.fillStyle = d.look.poster;
    ctx.fillText(label, left + 16, 274);
}

/** Hell: heller Grund, dunkle Schrift, ruhig. */
function drawLight(ctx, d) {
    const W = 1000, H = 320;
    base(ctx, W, H, '#f4f3ef');
    // Feines Punktraster rechts
    ctx.fillStyle = 'rgba(21, 22, 29, 0.09)';
    for (let x = 640; x < W; x += 22) {
        for (let y = 18; y < H; y += 22) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawAvatar(ctx, { ...d, cx: 170, cy: H / 2, r: 96, ring: '#ffffff', ringWidth: 8, empty: '#d9d7d0', letter: '#15161d' });

    const left = 310;
    const room = W - left - 60;
    ctx.textAlign = 'left';
    ctx.fillStyle = d.look.accent;
    ctx.fillRect(left, 84, 44, 6);
    ctx.fillStyle = '#6b6a66';
    ctx.font = `22px ${BOLD}`;
    spaced(ctx, d.look.kicker, left + 60, 94, 5);

    ctx.fillStyle = '#15161d';
    ctx.fillText(fitFont(ctx, d.name, 66, 38, room), left, 172);

    ctx.fillStyle = '#4a4a48';
    ctx.font = `29px ${TEXT}`;
    ctx.fillText(fit(ctx, d.look.line(d.serverName), room), left, 220);

    ctx.fillStyle = '#8b8a85';
    ctx.font = `23px ${TEXT}`;
    ctx.fillText(d.look.count(d.memberCount), left, 262);
}

/** Ausweis: große Zahl links im Farbfeld, rechts Profilbild und Name. */
function drawBadge(ctx, d) {
    const W = 1000, H = 320;
    base(ctx, W, H, '#17181f');
    const split = 330;
    ctx.fillStyle = d.look.accent;
    ctx.fillRect(0, 0, split, H);
    // Lochung wie bei einer Eintrittskarte
    ctx.fillStyle = '#17181f';
    for (let y = 16; y < H; y += 32) {
        ctx.beginPath();
        ctx.arc(split, y + 8, 7, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `20px ${BOLD}`;
    spaced(ctx, d.look.badgeLabel, split / 2, 112, 6, 'center');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitFont(ctx, d.look.badgeNumber(d.memberCount), 110, 48, split - 50), split / 2, 214);

    drawAvatar(ctx, { ...d, cx: split + 120, cy: H / 2, r: 74, shape: 'square', ring: 'rgba(255,255,255,0.12)', ringWidth: 6 });

    const left = split + 230;
    const room = W - left - 44;
    ctx.textAlign = 'left';
    ctx.fillStyle = d.look.accent;
    ctx.font = `20px ${BOLD}`;
    spaced(ctx, d.look.kicker, left, 122, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fitFont(ctx, d.name, 54, 30, room), left, 182);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `24px ${TEXT}`;
    ctx.fillText(fit(ctx, d.look.line(d.serverName), room), left, 224);
}

const DRAW = { classic: drawClassic, center: drawCenter, poster: drawPoster, light: drawLight, badge: drawBadge };
const SIZE = { center: [1000, 420] };

/**
 * @param {object} p
 * @param {string} p.name         Anzeigename des Mitglieds
 * @param {string} p.serverName
 * @param {number} p.memberCount
 * @param {string} [p.avatarUrl]  PNG/JPG/WebP — GIFs kann die Bibliothek nicht
 * @param {'welcome'|'leave'} p.kind
 * @param {string} [p.layout]     eines aus IMAGE_LAYOUTS
 * @returns {Promise<Buffer>} PNG
 */
async function renderMemberImage({ name, serverName, memberCount, avatarUrl, kind, layout }) {
    const id = imageLayout(layout);
    const [w, h] = SIZE[id] || [1000, 320];
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    DRAW[id](ctx, {
        look: KINDS[kind] || KINDS.welcome,
        name: String(name || 'Unbekannt'),
        serverName: serverName || 'dem Server',
        memberCount: Number(memberCount) || 0,
        avatar: await loadAvatar(avatarUrl),
    });
    return canvas.toBuffer('image/png');
}

/** Bild für ein echtes Mitglied, fertig als Discord-Anhang. */
async function memberImageFile(member, kind, layout) {
    const url = typeof member.displayAvatarURL === 'function'
        ? member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })
        : member.user?.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
    const buffer = await renderMemberImage({
        name: member.displayName || member.user?.globalName || member.user?.username,
        serverName: member.guild.name,
        memberCount: member.guild.memberCount,
        avatarUrl: url,
        kind,
        layout,
    });
    return { attachment: buffer, name: kind === 'leave' ? 'abschied.png' : 'willkommen.png' };
}

module.exports = { renderMemberImage, memberImageFile, IMAGE_LAYOUTS, imageLayout };
