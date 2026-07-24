import React, { useState, useEffect } from 'react';

const SLOWMODE_OPTIONS = [
    { value: 0, label: 'Kein Slowmode' },
    { value: 5, label: '5 Sekunden' },
    { value: 10, label: '10 Sekunden' },
    { value: 30, label: '30 Sekunden' },
    { value: 60, label: '1 Minute' },
    { value: 300, label: '5 Minuten' },
    { value: 900, label: '15 Minuten' },
    { value: 3600, label: '1 Stunde' },
];

export default function ImageOnlyTab({ selectedServer, channels }) {
    const [configs, setConfigs] = useState([]);
    const [channelId, setChannelId] = useState('');
    const [slowmode, setSlowmode] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/image-only`)
            .then(r => r.json())
            .then(data => setConfigs(Array.isArray(data) ? data : []));
    }, [selectedServer]);

    const handleAdd = async () => {
        if (!channelId) return;
        setIsSaving(true);
        setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/image-only`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId, slowmode, enabled: true }),
            });
            const data = await res.json();
            if (res.ok) {
                setConfigs(prev => [...prev, { channelId, slowmode, enabled: 1 }]);
                setChannelId('');
                setSlowmode(0);
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

    const handleDelete = async (cId) => {
        await fetch(`/api/discord/settings/${selectedServer.id}/image-only/${cId}`, { method: 'DELETE' });
        setConfigs(prev => prev.filter(c => c.channelId !== cId));
    };

    const channelName = (id) => channels.find(c => c.id === id)?.name || id;
    const slowmodeLabel = (secs) => SLOWMODE_OPTIONS.find(o => o.value === secs)?.label || `${secs}s`;

    const usedChannelIds = configs.map(c => c.channelId);

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Image-Only Kanäle</h2>
                <p className="text-white/50 text-sm">Nachrichten ohne Bild werden in diesen Kanälen automatisch gelöscht.</p>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-lg p-6 space-y-4 max-w-2xl">
                <h3 className="text-white font-semibold flex items-center gap-2">➕ Kanal hinzufügen</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Kanal</label>
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                            <option value="">-- Kanal auswählen --</option>
                            {channels.filter(c => !usedChannelIds.includes(c.id)).map(c => (
                                <option key={c.id} value={c.id}># {c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Slowmode</label>
                        <select value={slowmode} onChange={e => setSlowmode(Number(e.target.value))}
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                            {SLOWMODE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                    <button onClick={handleAdd} disabled={isSaving || !channelId}
                        className="bg-violet-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors">
                        {isSaving ? 'Speichere...' : 'Hinzufügen'}
                    </button>
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>

            {configs.length > 0 && (
                <div className="max-w-2xl space-y-3">
                    <h3 className="text-white font-semibold text-lg">Aktive Kanäle</h3>
                    {configs.map(cfg => (
                        <div key={cfg.channelId} className="bg-black/20 border border-white/5 rounded-lg p-4 flex items-center gap-4">
                            <div className="text-xl shrink-0">🖼️</div>
                            <div className="flex-1">
                                <div className="text-white font-semibold">#{channelName(cfg.channelId)}</div>
                                <div className="text-white/40 text-xs mt-0.5">
                                    Slowmode: {slowmodeLabel(cfg.slowmode || 0)}
                                </div>
                            </div>
                            <button onClick={() => handleDelete(cfg.channelId)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-colors shrink-0">
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="bg-black/20 border border-white/5 rounded-lg p-5 max-w-2xl space-y-2">
                <h3 className="text-white font-semibold text-sm">ℹ️ So funktioniert es</h3>
                <ul className="text-white/50 text-sm space-y-1">
                    <li>• Nachrichten ohne Bild/GIF werden sofort gelöscht</li>
                    <li>• Der User bekommt eine kurze Warnung (verschwindet nach 5 Sek.)</li>
                    <li>• Bilder als Link oder Embed werden ebenfalls erkannt</li>
                    <li>• Der Bot benötigt <span className="text-violet-400">Nachrichten verwalten</span> Berechtigung im Kanal</li>
                </ul>
            </div>
        </div>
    );
}

