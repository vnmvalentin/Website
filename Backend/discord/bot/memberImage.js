// discord/bot/memberImage.js
// Zeichnet das Bild für Ein- und Austrittsnachrichten: Profilbild, Name, Server
// und Mitgliederzahl. Dritte Darstellung neben schlichtem Text und Karte.
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

const W = 1000;
const H = 320;
const KINDS = {
    welcome: { accent: '#5865f2', kicker: 'WILLKOMMEN', line: (server) => `auf ${server}`, count: (n) => `Mitglied #${n}` },
    leave: { accent: '#8a93a0', kicker: 'AUF WIEDERSEHEN', line: (server) => `hat ${server} verlassen`, count: (n) => `Noch ${n} Mitglieder` },
};
const AVATAR_TIMEOUT_MS = 4000;

/** Kürzt einen Text mit "…", bis er in die Breite passt. */
function fit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
}

async function loadAvatar(url) {
    if (!url) return null;
    try {
        return await Promise.race([
            loadImage(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), AVATAR_TIMEOUT_MS)),
        ]);
    } catch {
        // Ohne Profilbild steht der Anfangsbuchstabe im Kreis
        return null;
    }
}

/**
 * @param {object} p
 * @param {string} p.name         Anzeigename des Mitglieds
 * @param {string} p.serverName
 * @param {number} p.memberCount
 * @param {string} [p.avatarUrl]  PNG/JPG/WebP — GIFs kann die Bibliothek nicht
 * @param {'welcome'|'leave'} p.kind
 * @returns {Promise<Buffer>} PNG
 */
async function renderMemberImage({ name, serverName, memberCount, avatarUrl, kind }) {
    const look = KINDS[kind] || KINDS.welcome;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fläche mit runden Ecken, links ein Farbstreifen
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 22);
    ctx.clip();
    ctx.fillStyle = '#15161d';
    ctx.fillRect(0, 0, W, H);
    // Schräge Bahnen als ruhiger Hintergrund
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
    ctx.fillStyle = look.accent;
    ctx.fillRect(0, 0, 12, H);

    // Profilbild im Kreis mit Ring
    const cx = 190;
    const cy = H / 2;
    const r = 100;
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fill();
    const avatar = await loadAvatar(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = '#23252f';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `92px ${BOLD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(name || '?').trim().charAt(0).toUpperCase() || '?', cx, cy + 6);
    }
    ctx.restore();

    // Text rechts daneben
    const left = 340;
    const room = W - left - 48;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = look.accent;
    ctx.font = `24px ${BOLD}`;
    // Sperrung von Hand: letterSpacing gibt es nicht in jeder Version der Bibliothek
    let x = left;
    for (const ch of look.kicker) {
        ctx.fillText(ch, x, 104);
        x += ctx.measureText(ch).width + 5;
    }

    // Der Name schrumpft, bis er passt — erst darunter wird gekürzt
    ctx.fillStyle = '#ffffff';
    let size = 66;
    const shown = String(name || 'Unbekannt');
    do {
        ctx.font = `${size}px ${BOLD}`;
        size -= 4;
    } while (ctx.measureText(shown).width > room && size >= 38);
    ctx.fillText(fit(ctx, shown, room), left, 178);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = `30px ${TEXT}`;
    ctx.fillText(fit(ctx, look.line(serverName || 'dem Server'), room), left, 226);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.font = `24px ${TEXT}`;
    ctx.fillText(look.count(Number(memberCount) || 0), left, 268);

    return canvas.toBuffer('image/png');
}

/** Bild für ein echtes Mitglied, fertig als Discord-Anhang. */
async function memberImageFile(member, kind) {
    const url = typeof member.displayAvatarURL === 'function'
        ? member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })
        : member.user?.displayAvatarURL?.({ extension: 'png', size: 256, forceStatic: true });
    const buffer = await renderMemberImage({
        name: member.displayName || member.user?.globalName || member.user?.username,
        serverName: member.guild.name,
        memberCount: member.guild.memberCount,
        avatarUrl: url,
        kind,
    });
    return { attachment: buffer, name: kind === 'leave' ? 'abschied.png' : 'willkommen.png' };
}

module.exports = { renderMemberImage, memberImageFile };
