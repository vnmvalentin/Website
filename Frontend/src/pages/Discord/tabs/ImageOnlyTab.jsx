
import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { DcHelp } from '../ui';
import { isErrorStatus, serverErrorText, useDiscordText } from '../discordI18n.js';

// Sekunden; die Beschriftungen stehen in discordI18n.js (imageOnly.slowmodes)
const SLOWMODE_OPTIONS = [0, 5, 10, 30, 60, 300, 900, 3600];

export default function ImageOnlyTab({ selectedServer, channels }) {
    const t = useDiscordText();
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
                setSaveStatus(t.common.saved);
            } else {
                setSaveStatus(t.common.errorWith(serverErrorText(t, data)));
            }
        } catch {
            setSaveStatus(t.common.networkError);
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
    const slowmodeLabel = (secs) => t.imageOnly.slowmodes[secs] || `${secs}s`;

    const usedChannelIds = configs.map(c => c.channelId);

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.imageOnly.title}</h2>
                <p className="text-white/50 text-sm">{t.imageOnly.intro}</p>
            </div>

            <div className="dc-card p-6 space-y-4 max-w-2xl">
                <h3 className="text-white font-semibold flex items-center gap-2">{t.imageOnly.addTitle}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="dc-label">{t.common.channel}</label>
                        <select value={channelId} onChange={e => setChannelId(e.target.value)}
                            className="dc-input w-full">
                            <option value="">{t.common.pickChannel}</option>
                            {channels.filter(c => !usedChannelIds.includes(c.id)).map(c => (
                                <option key={c.id} value={c.id}># {c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="dc-label">{t.imageOnly.slowmode}</label>
                        <select value={slowmode} onChange={e => setSlowmode(Number(e.target.value))}
                            className="dc-input w-full">
                            {SLOWMODE_OPTIONS.map(secs => (
                                <option key={secs} value={secs}>{slowmodeLabel(secs)}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                    <button onClick={handleAdd} disabled={isSaving || !channelId}
                        className="dc-btn">
                        {isSaving ? t.common.saving : t.common.add}
                    </button>
                    {saveStatus && <span className={`text-sm font-medium ${isErrorStatus(saveStatus) ? 'text-red-400' : 'text-white'}`}>{saveStatus}</span>}
                </div>
            </div>

            {configs.length > 0 && (
                <div className="max-w-2xl space-y-3">
                    <h3 className="text-white font-semibold text-lg">{t.imageOnly.active}</h3>
                    {configs.map(cfg => (
                        <div key={cfg.channelId} className="dc-card p-4 flex items-center gap-4">
                            <ImageIcon size={18} className="text-white/40 shrink-0" />
                            <div className="flex-1">
                                <div className="text-white font-semibold">#{channelName(cfg.channelId)}</div>
                                <div className="text-white/40 text-xs mt-0.5">
                                    {t.imageOnly.slowmodeLine(slowmodeLabel(cfg.slowmode || 0))}
                                </div>
                            </div>
                            <button onClick={() => handleDelete(cfg.channelId)} title={t.common.delete} aria-label={t.common.delete}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-md transition-colors shrink-0"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            )}

            <DcHelp title={t.common.howItWorks} items={t.imageOnly.notes} />
        </div>
    );
}
