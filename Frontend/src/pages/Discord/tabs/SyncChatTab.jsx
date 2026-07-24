import React, { useState, useEffect } from 'react';
import { Globe, Hash, Trash2, Plus } from 'lucide-react';

export default function SyncChatTab({ selectedServer, channels }) {
    const [taverne, setTaverne] = useState(null); // at most one entry
    const [channelId, setChannelId] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/sync-chat`)
            .then(r => r.json())
            .then(data => setTaverne(Array.isArray(data) && data.length > 0 ? data[0] : null));
    }, [selectedServer]);

    const handleSet = async () => {
        if (!channelId) return;
        setIsAdding(true);
        setStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/sync-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId }),
            });
            const data = await res.json();
            if (res.ok) {
                setTaverne({ id: data.id, channelId });
                setChannelId('');
                setStatus('✅ Taverne aktiviert!');
            } else {
                setStatus(`❌ ${data.error}`);
            }
        } catch {
            setStatus('❌ Netzwerkfehler.');
        } finally {
            setIsAdding(false);
            setTimeout(() => setStatus(''), 4000);
        }
    };

    const handleRemove = async () => {
        if (!taverne) return;
        try {
            await fetch(`/api/discord/settings/${selectedServer.id}/sync-chat/${taverne.id}`, { method: 'DELETE' });
            setTaverne(null);
        } catch { /* ignore */ }
    };

    const channelName = (id) => channels.find(c => c.id === id)?.name || id;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Taverne</h2>
                <p className="text-white/50 text-sm">
                    Wähle einen Kanal als Taverne. Alle Server mit dem Bot sind automatisch verbunden —
                    Mitglieder können serverübergreifend miteinander schreiben.
                </p>
            </div>

            {taverne ? (
                <div className="max-w-lg bg-black/20 border border-violet-500/20 rounded-lg p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                            <Globe size={20} className="text-violet-400" />
                        </div>
                        <div>
                            <div className="text-white font-semibold flex items-center gap-2">
                                <Hash size={14} className="text-white/50" />
                                {channelName(taverne.channelId)}
                            </div>
                            <div className="text-xs text-violet-400 mt-0.5">Taverne aktiv</div>
                        </div>
                        <button onClick={handleRemove}
                            className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <p className="text-white/40 text-sm">
                        Um die Taverne zu wechseln, entferne zuerst den aktuellen Kanal und wähle dann einen neuen.
                    </p>
                </div>
            ) : (
                <div className="bg-black/20 border border-white/5 rounded-lg p-6 space-y-4 max-w-lg">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <Plus size={16} /> Taverne einrichten
                    </h3>
                    <div className="flex gap-3">
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="flex-1 bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                            <option value="">-- Kanal auswählen --</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                        <button onClick={handleSet} disabled={isAdding || !channelId}
                            className="bg-violet-600 text-white font-bold py-3 px-5 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors whitespace-nowrap">
                            {isAdding ? '...' : 'Aktivieren'}
                        </button>
                    </div>
                    {status && <p className="text-sm font-medium text-white">{status}</p>}
                </div>
            )}

            <div className="bg-black/20 border border-white/5 rounded-lg p-5 max-w-lg space-y-2">
                <h3 className="text-white font-semibold text-sm">ℹ️ So funktioniert es</h3>
                <ul className="text-white/50 text-sm space-y-1">
                    <li>• Jeder Server hat genau einen Taverne-Kanal</li>
                    <li>• Alle Taverne-Kanäle aller Server sind miteinander verbunden</li>
                    <li>• Nachrichten erscheinen als <span className="text-white font-mono text-xs">Nutzername (Servername)</span></li>
                    <li>• @everyone / @here und Befehle werden blockiert</li>
                    <li>• Der Bot benötigt <span className="text-violet-400">Webhooks verwalten</span> im Kanal</li>
                </ul>
            </div>
        </div>
    );
}

