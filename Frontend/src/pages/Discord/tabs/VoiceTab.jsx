
import React, { useState, useEffect } from 'react';
import { DcHelp } from '../ui';
import { isErrorStatus, useDiscordText } from '../discordI18n.js';

export default function VoiceTab({ selectedServer, voiceChannels, onDirty }) {
    const t = useDiscordText();
    const [triggerChannelId, setTriggerChannelId] = useState('');
    // Zuletzt gespeicherter Stand — der Unterschied dazu ist "ungespeichert"
    const [savedId, setSavedId] = useState('');
    const dirty = triggerChannelId !== savedId;
    useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/voice`)
            .then(r => r.json())
            .then(data => { setTriggerChannelId(data?.triggerChannelId || ''); setSavedId(data?.triggerChannelId || ''); });
    }, [selectedServer]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ triggerChannelId }),
            });
            setSaveStatus(res.ok ? t.common.saved : t.common.error);
            if (res.ok) setSavedId(triggerChannelId);
        } catch {
            setSaveStatus(t.common.networkError);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const triggerName = voiceChannels.find(c => c.id === triggerChannelId)?.name;

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.voice.title}</h2>
                <p className="text-white/50 text-sm">{t.voice.intro}</p>
            </div>

            <div className="dc-card p-6 space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2">{t.voice.trigger}</h3>
                <div>
                    <label className="dc-label">{t.voice.pick}</label>
                    <select
                        value={triggerChannelId}
                        onChange={e => setTriggerChannelId(e.target.value)}
                        className="dc-input w-full"
                    >
                        <option value="">{t.voice.off}</option>
                        {voiceChannels.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <p className="text-white/40 text-xs mt-2">
                        {triggerChannelId ? t.voice.onNote(triggerName) : t.voice.offNote}
                    </p>
                </div>
            </div>

            <DcHelp title={t.common.howItWorks} items={t.voice.how} />

            <details className="dc-help">
                <summary>{t.voice.commandsTitle}</summary>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {t.voice.commands.map(([cmd, desc]) => (
                        <div key={cmd} className="dc-inset p-3">
                            <div className="text-indigo-400 text-xs mb-1">{cmd}</div>
                            <div className="text-white/50 text-xs">{desc}</div>
                        </div>
                    ))}
                </div>
            </details>

            <div className="pt-2 flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="dc-btn"
                >
                    {isSaving ? t.common.saving : t.common.save}
                </button>
                {saveStatus
                    ? <span className={`text-sm font-medium ${isErrorStatus(saveStatus) ? 'text-red-400' : 'text-white'}`}>{saveStatus}</span>
                    : dirty && <span className="dc-unsaved">{t.common.unsaved}</span>}
            </div>
        </div>
    );
}
