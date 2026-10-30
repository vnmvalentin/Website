// Gemeinsame Bausteine der Discord-Unterseiten (Aussehen in discord.css).
import React from 'react';
import { Bot, Plus } from 'lucide-react';
import { renderDiscordText } from './discordText';

/** Unterstrich-Reiter innerhalb einer Unterseite. tabs: [[id, Beschriftung, Zähler?], …] */
export function DcTabs({ tabs, value, onChange }) {
    return (
        <div className="dc-tabs" role="tablist">
            {tabs.map(([id, label, count]) => (
                <button key={id} type="button" role="tab" aria-selected={value === id}
                    className={value === id ? 'is-active' : ''} onClick={() => onChange(id)}>
                    {label}
                    {count !== undefined && count !== null && <i>{count}</i>}
                </button>
            ))}
        </div>
    );
}

/**
 * Speicherzeile. Zeigt, ob es offene Änderungen gibt — vorher merkte man erst
 * nach dem Wechsel des Bereichs, dass man das Speichern vergessen hatte.
 */
export function DcSaveBar({ onSave, isSaving, status, dirty, label = 'Speichern' }) {
    return (
        <div className="dc-savebar">
            <button type="button" onClick={onSave} disabled={isSaving} className="dc-btn">
                {isSaving ? 'Speichere…' : label}
            </button>
            {status
                ? <span className={`text-sm font-medium ${status.startsWith('Fehler') || status === 'Netzwerkfehler.' ? 'text-red-400' : 'text-green-400'}`}>{status}</span>
                : dirty && <span className="dc-unsaved">Ungespeicherte Änderungen</span>}
        </div>
    );
}

/**
 * Kachel zum Anlegen eines neuen Eintrags. Steht mittig über der Liste und
 * sieht aus wie ein leerer Platz, der gefüllt werden will — vorher war es ein
 * kleiner Knopf oben rechts in der Ecke, den man leicht übersah.
 *
 * @param {boolean} large  wenn es noch keinen Eintrag gibt: groß, mit Hinweistext
 */
export function DcAddTile({ label, hint, onClick, large = false }) {
    return (
        <button type="button" onClick={onClick} className={`dc-add${large ? ' is-large' : ''}`}>
            <span className="dc-add-plus"><Plus size={large ? 22 : 16} /></span>
            <span>
                <b>{label}</b>
                {hint && <i>{hint}</i>}
            </span>
        </button>
    );
}

/* ── Vorschau einer Bot-Nachricht, wie sie in Discord aussieht ────────────── */

const SAMPLE = { name: 'Mika', members: 128 };

/** Setzt die Platzhalter ein und zeigt Emojis als Bild. Beim Eintritt ist [USER] eine Erwähnung, beim Austritt nur der Name. */
function fill(text, kind, serverName) {
    return renderDiscordText(text, {}, (chunk) => fillPlaceholders(chunk, kind, serverName));
}

function fillPlaceholders(text, kind, serverName) {
    return String(text || '').split(/(\[USER\]|\[SERVER\]|\[MEMBER\])/).map((part, i) => {
        if (part === '[USER]') {
            return kind === 'welcome'
                ? <span key={i} className="dc-mention">@{SAMPLE.name}</span>
                : <React.Fragment key={i}>{SAMPLE.name}</React.Fragment>;
        }
        if (part === '[SERVER]') return <React.Fragment key={i}>{serverName}</React.Fragment>;
        if (part === '[MEMBER]') return <React.Fragment key={i}>{SAMPLE.members}</React.Fragment>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

/**
 * @param {'welcome'|'leave'} kind
 * @param {'text'|'card'|'image'} style  schlichte Nachricht, Karte oder gezeichnetes Bild
 * @param {string} imageUrl  Vorschau des gezeichneten Bilds (kommt aus dem Backend — dieselbe Zeichnung wie im Bot)
 */
export function DiscordPreview({ kind, style, text, serverName, botName, imageUrl, imageRatio }) {
    const card = style === 'card';
    const image = style === 'image';
    const empty = !String(text || '').trim();
    return (
        <div className="dc-preview">
            <span className="dc-preview-avatar"><Bot size={20} /></span>
            <div className="min-w-0 flex-1">
                <div className="dc-preview-head">
                    <b>{botName || 'Bot'}</b>
                    <span className="dc-preview-app">APP</span>
                    <time>heute um 20:15 Uhr</time>
                </div>

                {empty && <p className="dc-preview-text is-empty">Ohne Text sendet der Bot nichts.</p>}

                {!empty && !card && <p className="dc-preview-text">{fill(text, kind, serverName)}</p>}
                {!empty && image && <img className="dc-preview-image" src={imageUrl} alt="Vorschau des Bilds" style={imageRatio ? { aspectRatio: imageRatio } : undefined} />}

                {!empty && card && (
                    <>
                        {/* Eine Erwähnung in der Karte pingt nicht — der Bot stellt sie deshalb davor */}
                        {kind === 'welcome' && /\[USER\]/.test(text) && (
                            <p className="dc-preview-text"><span className="dc-mention">@{SAMPLE.name}</span></p>
                        )}
                        <div className={`dc-embed is-${kind}`}>
                            <div className="min-w-0 flex-1">
                                <div className="dc-embed-author">
                                    <span className="dc-embed-face">{SAMPLE.name.charAt(0)}</span>
                                    {SAMPLE.name}
                                </div>
                                <p className="dc-embed-text">{fill(text, kind, serverName)}</p>
                                <div className="dc-embed-foot">
                                    {kind === 'leave' ? `Noch ${SAMPLE.members} Mitglieder` : `Mitglied #${SAMPLE.members}`} · heute um 20:15 Uhr
                                </div>
                            </div>
                            <span className="dc-embed-thumb">{SAMPLE.name.charAt(0)}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
