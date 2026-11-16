
import React, { useState, useEffect } from 'react';
import { Globe, Hash, Trash2, Plus } from 'lucide-react';
import { DcHelp } from '../ui';
import { isErrorStatus, serverErrorText, useDiscordText } from '../discordI18n.js';

export default function SyncChatTab({ selectedServer, channels }) {
    const t = useDiscordText();
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
                setStatus(t.syncChat.activated);
            } else {
                setStatus(t.common.errorWith(serverErrorText(t, data)));
            }
        } catch {
            setStatus(t.common.networkError);
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
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.syncChat.title}</h2>
                <p className="text-white/50 text-sm">{t.syncChat.intro}</p>
            </div>

            {taverne ? (
                <div className="dc-card max-w-lg border-indigo-500/20 p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <Globe size={20} className="text-indigo-400" />
                        </div>
                        <div>
                            <div className="text-white font-semibold flex items-center gap-2">
                                <Hash size={14} className="text-white/50" />
                                {channelName(taverne.channelId)}
                            </div>
                            <div className="text-xs text-indigo-400 mt-0.5">{t.syncChat.active}</div>
                        </div>
                        <button onClick={handleRemove} title={t.common.remove} aria-label={t.common.remove}
                            className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-md transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <p className="text-white/40 text-sm">{t.syncChat.switchNote}</p>
                </div>
            ) : (
                <div className="dc-card p-6 space-y-4 max-w-lg">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <Plus size={16} /> {t.syncChat.setup}
                    </h3>
                    <div className="flex gap-3">
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="dc-input flex-1">
                            <option value="">{t.common.pickChannel}</option>
                            {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                        </select>
                        <button onClick={handleSet} disabled={isAdding || !channelId}
                            className="dc-btn whitespace-nowrap">
                            {isAdding ? '...' : t.syncChat.activate}
                        </button>
                    </div>
                    {status && <p className={`text-sm font-medium ${isErrorStatus(status) ? 'text-red-400' : 'text-white'}`}>{status}</p>}
                </div>
            )}

            <DcHelp title={t.common.howItWorks} items={t.syncChat.notes} />
        </div>
    );
}
