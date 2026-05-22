import React, { useState, useEffect } from 'react';

const VARIABLES = ['{streamer}', '{game}', '{title}', '{url}'];
const DEFAULT_MSG = '🔴 **{streamer}** ist jetzt live! Spiel: {game}\n{url}';

export default function TwitchNotifTab({ selectedServer, channels }) {
    const [notifs, setNotifs] = useState([]);
    const [twitchUsername, setTwitchUsername] = useState('');
    const [channelId, setChannelId] = useState('');
    const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MSG);
    const [editingId, setEditingId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

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
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ twitchUsername, channelId, messageTemplate, enabled: true }),
            });
            const data = await res.json();
            if (res.ok) {
                if (editingId) {
                    setNotifs(prev => prev.map(n => n.id === editingId
                        ? { ...n, twitchUsername, channelId, messageTemplate } : n));
                } else {
                    setNotifs(prev => [...prev, { id: data.id, twitchUsername, channelId, messageTemplate, enabled: 1 }]);
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
        setMessageTemplate(notif.messageTemplate || DEFAULT_MSG);
        setEditingId(notif.id);
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Twitch Benachrichtigungen</h2>
                <p className="text-gray-400 text-sm">Sende automatisch eine Nachricht wenn ein Twitch-Kanal live geht.</p>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-6 space-y-4 max-w-2xl">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    {editingId ? '✏️ Bearbeiten' : '➕ Neue Benachrichtigung'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Twitch Nutzername</label>
                        <input value={twitchUsername} onChange={e => setTwitchUsername(e.target.value)}
                            placeholder="z.B. shroud"
                            className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Discord Kanal</label>
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none">
                            <option value="">-- Kanal auswählen --</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Nachrichtenvorlage</label>
                    <textarea value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={3}
                        className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none resize-none font-mono text-sm" />
                    <div className="flex flex-wrap gap-2 mt-2">
                        {VARIABLES.map(v => (
                            <button key={v} onClick={() => setMessageTemplate(prev => prev + v)}
                                className="text-xs bg-[#1a1a20] border border-white/10 hover:border-cyan-500/40 text-cyan-400 px-2 py-1 rounded-lg transition-colors font-mono">
                                {v}
                            </button>
                        ))}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">Klicke auf eine Variable um sie einzufügen. Markdown wird unterstützt.</p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleSave} disabled={isSaving || !twitchUsername || !channelId}
                        className="bg-cyan-500 text-black font-bold py-2.5 px-6 rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all">
                        {isSaving ? 'Speichere...' : editingId ? 'Aktualisieren' : 'Hinzufügen'}
                    </button>
                    {editingId && (
                        <button onClick={resetForm}
                            className="bg-white/5 hover:bg-white/10 text-gray-400 font-bold py-2.5 px-5 rounded-xl transition-all">
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
                        <div key={n.id} className="bg-[#0f0f13] border border-white/5 rounded-xl p-4 flex items-start gap-4">
                            <div className="text-2xl shrink-0">📺</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="text-white font-bold">twitch.tv/{n.twitchUsername}</span>
                                    <span className="text-gray-500 text-xs">→</span>
                                    <span className="text-cyan-400 text-sm">#{channels.find(c => c.id === n.channelId)?.name || n.channelId}</span>
                                </div>
                                <p className="text-gray-500 text-xs font-mono truncate">{n.messageTemplate}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => startEdit(n)}
                                    className="text-gray-400 hover:text-white hover:bg-white/5 p-2 rounded-lg transition-all">
                                    ✏️
                                </button>
                                <button onClick={() => handleDelete(n.id)}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-all">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 max-w-2xl">
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
