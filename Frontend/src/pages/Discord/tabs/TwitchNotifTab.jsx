import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

const VARIABLES = ['{streamer}', '{game}', '{title}', '{url}'];
const DEFAULT_MSG = '🔴 **{streamer}** ist jetzt live! Spiel: {game}\n{url}';

// Findet ein "@wort" direkt vor der Cursor-Position (ohne Leerzeichen dazwischen)
function findMentionQuery(value, cursorPos) {
    const before = value.slice(0, cursorPos);
    const match = before.match(/@([^\s@]*)$/);
    if (!match) return null;
    return { query: match[1], start: match.index };
}

export default function TwitchNotifTab({ selectedServer, channels, serverRoles = [] }) {
    const [notifs, setNotifs] = useState([]);
    const [twitchUsername, setTwitchUsername] = useState('');
    const [channelId, setChannelId] = useState('');
    const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MSG);
    const [editingId, setEditingId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    // @-Rollen-Mention-Dropdown
    const textareaRef = useRef(null);
    const pendingCursorRef = useRef(null);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionHighlight, setMentionHighlight] = useState(0);

    const mentionMatches = mentionOpen
        ? serverRoles.filter(r => r.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
        : [];

    // Cursor nach Einfügen einer Mention an die richtige Stelle setzen
    useLayoutEffect(() => {
        if (pendingCursorRef.current == null) return;
        const pos = pendingCursorRef.current;
        pendingCursorRef.current = null;
        const el = textareaRef.current;
        if (el) {
            el.focus();
            el.setSelectionRange(pos, pos);
        }
    }, [messageTemplate]);

    const updateMentionState = (value, cursorPos) => {
        const found = findMentionQuery(value, cursorPos);
        if (found) {
            setMentionOpen(true);
            setMentionQuery(found.query);
            setMentionHighlight(0);
        } else {
            setMentionOpen(false);
        }
    };

    const handleTemplateChange = (e) => {
        const value = e.target.value;
        setMessageTemplate(value);
        updateMentionState(value, e.target.selectionStart);
    };

    const insertRoleMention = (role) => {
        const el = textareaRef.current;
        const cursorPos = el ? el.selectionStart : messageTemplate.length;
        const found = findMentionQuery(messageTemplate, cursorPos);
        const start = found ? found.start : cursorPos;
        // Im Eingabefeld erscheint direkt der Rollenname — die eigentliche <@&id>-Syntax
        // wird erst beim Speichern eingesetzt (siehe resolveMentionsForStorage)
        const mention = `@${role.name} `;
        const newValue = messageTemplate.slice(0, start) + mention + messageTemplate.slice(cursorPos);
        pendingCursorRef.current = start + mention.length;
        setMessageTemplate(newValue);
        setMentionOpen(false);
    };

    const handleTemplateKeyDown = (e) => {
        if (!mentionOpen || mentionMatches.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionHighlight(i => (i + 1) % mentionMatches.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionHighlight(i => (i - 1 + mentionMatches.length) % mentionMatches.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertRoleMention(mentionMatches[mentionHighlight]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setMentionOpen(false);
        }
    };

    // Zeigt Rollen-Mentions im Eingabefeld/in der Vorschau als "@Rollenname" statt der rohen <@&id>-Syntax
    const formatMentionsForDisplay = (text) => text.replace(/<@&(\d+)>/g, (m, id) => {
        const role = serverRoles.find(r => r.id === id);
        return role ? `@${role.name}` : m;
    });

    // Wandelt "@Rollenname" beim Speichern zurück in die von Discord benötigte <@&id>-Syntax um.
    // Zeichenweiser Scan (statt einfachem String-Replace), damit z.B. Rolle "Al" nicht versehentlich
    // in "@Alpha" matched — nur wenn nach dem Namen kein weiteres Wortzeichen folgt, wird ersetzt.
    const resolveMentionsForStorage = (text) => {
        const namedRoles = serverRoles.filter(r => r.name).sort((a, b) => b.name.length - a.name.length);
        if (!namedRoles.length) return text;
        let result = '';
        let i = 0;
        outer: while (i < text.length) {
            if (text[i] === '@') {
                for (const r of namedRoles) {
                    const token = '@' + r.name;
                    if (text.startsWith(token, i)) {
                        const nextChar = text[i + token.length];
                        if (!nextChar || !/[A-Za-z0-9_]/.test(nextChar)) {
                            result += `<@&${r.id}>`;
                            i += token.length;
                            continue outer;
                        }
                    }
                }
            }
            result += text[i];
            i++;
        }
        return result;
    };

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/twitch-notifications`)
            .then(r => r.json())
            .then(data => setNotifs(Array.isArray(data) ? data : []));
    }, [selectedServer]);

    const resetForm = () => {
        setTwitchUsername('');
        setChannelId('');
        setMessageTemplate(DEFAULT_MSG);
        setEditingId(null);
    };

    const handleSave = async () => {
        if (!twitchUsername || !channelId) return;
        setIsSaving(true);
        setSaveStatus('');
        try {
            const url = editingId
                ? `/api/discord/settings/${selectedServer.id}/twitch-notifications/${editingId}`
                : `/api/discord/settings/${selectedServer.id}/twitch-notifications`;
            const method = editingId ? 'PUT' : 'POST';
            // Discord braucht beim Senden die <@&id>-Syntax, nicht den im Eingabefeld sichtbaren Rollennamen
            const templateForStorage = resolveMentionsForStorage(messageTemplate);
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ twitchUsername, channelId, messageTemplate: templateForStorage, enabled: true }),
            });
            const data = await res.json();
            if (res.ok) {
                if (editingId) {
                    setNotifs(prev => prev.map(n => n.id === editingId
                        ? { ...n, twitchUsername, channelId, messageTemplate: templateForStorage } : n));
                } else {
                    setNotifs(prev => [...prev, { id: data.id, twitchUsername, channelId, messageTemplate: templateForStorage, enabled: 1 }]);
                }
                resetForm();
                setSaveStatus('✅ Gespeichert!');
            } else {
                setSaveStatus(`❌ ${data.error}`);
            }
        } catch {
            setSaveStatus('❌ Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const handleDelete = async (id) => {
        await fetch(`/api/discord/settings/${selectedServer.id}/twitch-notifications/${id}`, { method: 'DELETE' });
        setNotifs(prev => prev.filter(n => n.id !== id));
    };

    const startEdit = (notif) => {
        setTwitchUsername(notif.twitchUsername);
        setChannelId(notif.channelId);
        // Gespeicherte <@&id>-Mentions beim Öffnen zum Bearbeiten wieder in lesbare Rollennamen umwandeln
        setMessageTemplate(formatMentionsForDisplay(notif.messageTemplate || DEFAULT_MSG));
        setEditingId(notif.id);
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Twitch Benachrichtigungen</h2>
                <p className="text-gray-400 text-sm">Sende automatisch eine Nachricht wenn ein Twitch-Kanal live geht.</p>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-6 space-y-4 max-w-2xl">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    {editingId ? '✏️ Bearbeiten' : '➕ Neue Benachrichtigung'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Twitch Nutzername</label>
                        <input value={twitchUsername} onChange={e => setTwitchUsername(e.target.value)}
                            placeholder="z.B. shroud"
                            className="w-full bg-[#1a1a20] border border-white/10 rounded-sm p-3 text-white focus:border-cyan-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Discord Kanal</label>
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="w-full bg-[#1a1a20] border border-white/10 rounded-sm p-3 text-white focus:border-cyan-500 outline-none appearance-none">
                            <option value="">-- Kanal auswählen --</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="relative">
                    <label className="block text-white text-sm font-medium mb-2">Nachrichtenvorlage</label>
                    <textarea ref={textareaRef} value={messageTemplate} onChange={handleTemplateChange}
                        onKeyDown={handleTemplateKeyDown}
                        onClick={e => updateMentionState(e.target.value, e.target.selectionStart)}
                        onBlur={() => setMentionOpen(false)}
                        rows={3}
                        className="w-full bg-[#1a1a20] border border-white/10 rounded-sm p-3 text-white focus:border-cyan-500 outline-none resize-none font-mono text-sm" />
                    {mentionOpen && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#16161a] border border-white/10 rounded-sm shadow-2xl max-h-48 overflow-y-auto">
                            {mentionMatches.length > 0 ? mentionMatches.map((r, i) => (
                                <div key={r.id}
                                    onMouseDown={e => { e.preventDefault(); insertRoleMention(r); }}
                                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${i === mentionHighlight ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color && r.color !== '#000000' ? r.color : '#6b7280' }} />
                                    <span className="text-white text-sm truncate">{r.name}</span>
                                </div>
                            )) : (
                                <div className="px-3 py-2 text-gray-500 text-xs">Keine passende Rolle gefunden</div>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                        {VARIABLES.map(v => (
                            <button key={v} onClick={() => setMessageTemplate(prev => prev + v)}
                                className="text-xs bg-[#1a1a20] border border-white/10 hover:border-cyan-500/40 text-cyan-400 px-2 py-1 rounded-sm transition-colors font-mono">
                                {v}
                            </button>
                        ))}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">Klicke auf eine Variable um sie einzufügen. Tippe <span className="font-mono text-gray-400">@</span> um eine Rolle zu markieren. Markdown wird unterstützt.</p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleSave} disabled={isSaving || !twitchUsername || !channelId}
                        className="bg-cyan-500 text-black font-bold py-2.5 px-6 rounded-sm hover:bg-cyan-400 disabled:opacity-50 transition-colors">
                        {isSaving ? 'Speichere...' : editingId ? 'Aktualisieren' : 'Hinzufügen'}
                    </button>
                    {editingId && (
                        <button onClick={resetForm}
                            className="bg-white/5 hover:bg-white/10 text-gray-400 font-bold py-2.5 px-5 rounded-sm transition-colors">
                            Abbrechen
                        </button>
                    )}
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>

            {notifs.length > 0 && (
                <div className="max-w-2xl space-y-3">
                    <h3 className="text-white font-semibold text-lg">Aktive Benachrichtigungen</h3>
                    {notifs.map(n => (
                        <div key={n.id} className="bg-[#0f0f13] border border-white/5 rounded-sm p-4 flex items-start gap-4">
                            <div className="text-2xl shrink-0">📺</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-white font-bold">twitch.tv/{n.twitchUsername}</span>
                                    <span className="text-gray-500 text-xs">→</span>
                                    <span className="text-cyan-400 text-sm">#{channels.find(c => c.id === n.channelId)?.name || n.channelId}</span>
                                </div>
                                <p className="text-gray-500 text-xs font-mono truncate">{formatMentionsForDisplay(n.messageTemplate)}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => startEdit(n)}
                                    className="text-gray-400 hover:text-white hover:bg-white/5 p-2 rounded-sm transition-colors">
                                    ✏️
                                </button>
                                <button onClick={() => handleDelete(n.id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-sm transition-colors">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-[#0f0f13] border border-white/5 rounded-sm p-5 max-w-2xl">
                <h3 className="text-white font-semibold text-sm mb-2">ℹ️ Hinweis</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                    <li>• Der Bot prüft alle 2 Minuten ob neue Streams live sind</li>
                    <li>• Eine Benachrichtigung wird nur einmal pro Stream-Session gesendet</li>
                    <li>• Mehrere Twitch-Kanäle können gleichzeitig überwacht werden</li>
                </ul>
            </div>
        </div>
    );
}

