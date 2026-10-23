import React, { useState, useEffect } from 'react';

const COMMANDS = [
    { cmd: '/voicelimit [zahl]', desc: 'Mitglieder-Limit setzen (0 = kein Limit)' },
    { cmd: '/voicelock', desc: 'Channel sperren/entsperren für neue Nutzer' },
    { cmd: '/voice_rename [name]', desc: 'Channel umbenennen' },
    { cmd: '/voice_hide', desc: 'Channel für andere unsichtbar machen (aktuelle Mitglieder sehen ihn weiter)' },
    { cmd: '/voice_unhide', desc: 'Channel wieder für alle sichtbar machen' },
    { cmd: '/voice_kick [user]', desc: 'Nutzer aus dem Channel werfen' },
    { cmd: '/voice_ban [user]', desc: 'Nutzer werfen und am erneuten Beitreten hindern' },
    { cmd: '/voice_unban [user]', desc: 'Bann wieder aufheben' },
    { cmd: '/voice_transfer [user]', desc: 'Besitzer-Status übergeben (nur der Besitzer, Ziel muss im Voice sein)' },
];

export default function VoiceTab({ selectedServer, voiceChannels, onDirty }) {
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
            setSaveStatus(res.ok ? 'Gespeichert!' : 'Fehler.');
            if (res.ok) setSavedId(triggerChannelId);
        } catch {
            setSaveStatus('Fehler: keine Verbindung zum Server.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const triggerName = voiceChannels.find(c => c.id === triggerChannelId)?.name;

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">Custom Voice Channels</h2>
                <p className="text-white/50 text-sm">Jeder der den Trigger-Channel betritt bekommt automatisch einen eigenen Voice-Channel.</p>
            </div>

            <div className="dc-card p-6 space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2">Trigger Channel</h3>
                <div>
                    <label className="dc-label">Voice Channel auswählen</label>
                    <select
                        value={triggerChannelId}
                        onChange={e => setTriggerChannelId(e.target.value)}
                        className="dc-input w-full"
                    >
                        <option value="">-- Deaktiviert --</option>
                        {voiceChannels.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <p className="text-white/40 text-xs mt-2">
                        {triggerChannelId
                            ? `Wenn jemand „${triggerName}“ beitritt, wird automatisch ein eigener Channel erstellt.`
                            : 'Custom Voice Channels sind deaktiviert.'}
                    </p>
                </div>
            </div>

            <details className="dc-help">
                <summary>So funktioniert es</summary>
                <ul className="text-white/50 text-sm space-y-2">
                    <li>• Bot erstellt <span className="text-indigo-400">Usernames Kanal</span> in der gleichen Kategorie</li>
                    <li>• Ein privater Text-Channel wird erstellt (nur für Mitglieder des VCs sichtbar)</li>
                    <li>• Im Text-Channel werden die verfügbaren Commands angepinnt — inkl. aktuellem Channel-Besitzer</li>
                    <li>• Mitglieder werden beim Beitreten/Verlassen automatisch hinzugefügt/entfernt</li>
                    <li>• Bei Besitzer-Verlassen oder <span className="text-indigo-400">/voice_transfer</span> wird Ownership übertragen und die angepinnte Nachricht aktualisiert</li>
                    <li>• Wenn alle den Channel verlassen, werden Voice- und Text-Channel automatisch gelöscht</li>
                </ul>
            </details>

            <details className="dc-help">
                <summary>Commands (nur im dedizierten Text-Channel)</summary>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {COMMANDS.map(item => (
                        <div key={item.cmd} className="dc-inset p-3">
                            <div className="text-indigo-400 text-xs mb-1">{item.cmd}</div>
                            <div className="text-white/50 text-xs">{item.desc}</div>
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
                    {isSaving ? 'Speichere...' : 'Speichern'}
                </button>
                {saveStatus
                    ? <span className="text-sm font-medium text-white">{saveStatus}</span>
                    : dirty && <span className="dc-unsaved">Ungespeicherte Änderungen</span>}
            </div>
        </div>
    );
}

