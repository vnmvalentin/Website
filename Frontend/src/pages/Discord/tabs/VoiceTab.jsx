import React, { useState, useEffect } from 'react';

const COMMANDS = [
    { cmd: '/voicelimit [zahl]', desc: 'Mitglieder-Limit setzen (0 = kein Limit)' },
    { cmd: '/voicelock', desc: 'Channel sperren/entsperren für neue Nutzer' },
    { cmd: '/voice_rename [name]', desc: 'Channel umbenennen' },
];

export default function VoiceTab({ selectedServer, voiceChannels }) {
    const [triggerChannelId, setTriggerChannelId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/voice`)
            .then(r => r.json())
            .then(data => setTriggerChannelId(data?.triggerChannelId || ''));
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
            setSaveStatus(res.ok ? '✅ Gespeichert!' : '❌ Fehler.');
        } catch {
            setSaveStatus('❌ Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const triggerName = voiceChannels.find(c => c.id === triggerChannelId)?.name;

    return (
        <div className="space-y-8 max-w-2xl animate-in slide-in-from-right-4 duration-300">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Custom Voice Channels</h2>
                <p className="text-gray-400 text-sm">Jeder der den Trigger-Channel betritt bekommt automatisch einen eigenen Voice-Channel.</p>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-6 space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2">🔊 Trigger Channel</h3>
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Voice Channel auswählen</label>
                    <select
                        value={triggerChannelId}
                        onChange={e => setTriggerChannelId(e.target.value)}
                        className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none"
                    >
                        <option value="">-- Deaktiviert --</option>
                        {voiceChannels.map(c => (
                            <option key={c.id} value={c.id}>🔊 {c.name}</option>
                        ))}
                    </select>
                    <p className="text-gray-500 text-xs mt-2">
                        {triggerChannelId
                            ? `Wenn jemand "🔊 ${triggerName}" beitritt, wird automatisch ein eigener Channel erstellt.`
                            : 'Custom Voice Channels sind deaktiviert.'}
                    </p>
                </div>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-3">
                <h3 className="text-white font-semibold text-sm">ℹ️ So funktioniert es</h3>
                <ul className="text-gray-400 text-sm space-y-2">
                    <li>• Bot erstellt <span className="text-cyan-400 font-mono">🔊 Usernames Kanal</span> in der gleichen Kategorie</li>
                    <li>• Ein privater Text-Channel wird erstellt (nur für Mitglieder des VCs sichtbar)</li>
                    <li>• Im Text-Channel werden die verfügbaren Commands angepinnt</li>
                    <li>• Mitglieder werden beim Beitreten/Verlassen automatisch hinzugefügt/entfernt</li>
                    <li>• Bei Besitzer-Verlassen wird Ownership auf ein anderes Mitglied übertragen</li>
                    <li>• Wenn alle den Channel verlassen, werden Voice- und Text-Channel automatisch gelöscht</li>
                </ul>
            </div>

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-3">
                <h3 className="text-white font-semibold text-sm">🎮 Commands (nur im dedizierten Text-Channel)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {COMMANDS.map(item => (
                        <div key={item.cmd} className="bg-[#1a1a20] rounded-xl p-3">
                            <div className="text-cyan-400 font-mono text-xs mb-1">{item.cmd}</div>
                            <div className="text-gray-400 text-xs">{item.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="pt-2 flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-cyan-500 text-black font-bold py-3 px-8 rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all"
                >
                    {isSaving ? 'Speichere...' : 'Speichern'}
                </button>
                {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
            </div>
        </div>
    );
}
