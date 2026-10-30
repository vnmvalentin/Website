// Discords Rohtext (<:name:id>, <@&id>, <#id>) lesbar machen — gemeinsam für das
// Nachrichtenfeld (EmojiTextField.jsx) und die Vorschauen.
import React from 'react';

const TOKEN_RE = /<(a?):(\w{2,32}):(\d{5,25})>|<@&(\d{5,25})>|<#(\d{5,25})>/g;

export const emojiUrl = (id, animated) => `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
const roleColor = (c) => (c && c !== '#000000' ? c : '#c9cdfb');

/**
 * Zerlegt einen Rohtext in Text- und Sonderteile. Unbekannte Rollen/Kanäle
 * bleiben Text, damit nichts unsichtbar verschwindet.
 */
export function tokenize(text, { roles = [], channels = [] } = {}) {
    const parts = [];
    let last = 0;
    String(text || '').replace(TOKEN_RE, (raw, anim, name, emojiId, roleId, channelId, at) => {
        let part = null;
        if (emojiId) part = { type: 'emoji', raw, name, url: emojiUrl(emojiId, anim === 'a') };
        else if (roleId) {
            const r = roles.find((x) => x.id === roleId);
            if (r) part = { type: 'role', raw, label: `@${r.name}`, color: roleColor(r.color) };
        } else if (channelId) {
            const c = channels.find((x) => x.id === channelId);
            if (c) part = { type: 'channel', raw, label: `#${c.name}` };
        }
        if (!part) return raw;
        if (at > last) parts.push({ type: 'text', value: text.slice(last, at) });
        parts.push(part);
        last = at + raw.length;
        return raw;
    });
    if (last < String(text || '').length) parts.push({ type: 'text', value: String(text).slice(last) });
    return parts;
}

/**
 * Rohtext als React-Knoten (für Vorschauen): Emojis als Bild, Erwähnungen als
 * Discord-Hervorhebung. renderText erlaubt, Textstücke weiter zu bearbeiten
 * (z. B. Platzhalter wie [USER]).
 */
export function renderDiscordText(text, ctx = {}, renderText = (s) => s) {
    return tokenize(text, ctx).map((p, i) => {
        if (p.type === 'text') return <React.Fragment key={i}>{renderText(p.value, i)}</React.Fragment>;
        if (p.type === 'emoji') return <img key={i} src={p.url} alt={`:${p.name}:`} title={`:${p.name}:`} className="dc-emoji" draggable={false} />;
        return <span key={i} className="dc-mention">{p.label}</span>;
    });
}
