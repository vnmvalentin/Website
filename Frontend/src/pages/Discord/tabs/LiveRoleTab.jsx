import React, { useState, useEffect } from 'react';

export default function LiveRoleTab({ selectedServer, serverRoles }) {
    const [liveRoleId, setLiveRoleId] = useState('');
    const [restrictionRoleId, setRestrictionRoleId] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/live-role`)
            .then(r => r.json())
            .then(data => {
                if (data.liveRoleId) {
                    setLiveRoleId(data.liveRoleId);
                    setRestrictionRoleId(data.restrictionRoleId || '');
                    setEnabled(data.enabled !== false);
                }
                setLoaded(true);
            });
    }, [selectedServer]);

    const roleColor = (id) => serverRoles.find(r => r.id === id)?.color || '#ffffff';

    const handleSave = async () => {
        if (!liveRoleId) return;
        setIsSaving(true);
        setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/live-role`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ liveRoleId, restrictionRoleId: restrictionRoleId || null, enabled }),
            });
            const data = await res.json();
            setSaveStatus(res.ok ? 'Gespeichert!' : `Fehler: ${data.error}`);
        } catch {
            setSaveStatus('Netzwerkfehler.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    const handleDelete = async () => {
        await fetch(`/api/discord/settings/${selectedServer.id}/live-role`, { method: 'DELETE' });
        setLiveRoleId('');
        setRestrictionRoleId('');
        setEnabled(true);
        setSaveStatus('Entfernt.');
        setTimeout(() => setSaveStatus(''), 3000);
    };

    const RoleSelect = ({ value, onChange, placeholder }) => (
        <select value={value} onChange={e => onChange(e.target.value)}
            className="w-full bg-[#0e0e1a]/85 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
            <option value="">{placeholder}</option>
            {serverRoles.map(r => (
                <option key={r.id} value={r.id}>@{r.name}</option>
            ))}
        </select>
    );

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Live-Rolle</h2>
                <p className="text-white/50 text-sm">Mitglieder erhalten automatisch eine Rolle, wenn sie auf Twitch live gehen.</p>
            </div>

            <div className="bg-[#0e0e1a]/75 border border-white/5 rounded-lg p-6 space-y-5 max-w-2xl">
                <div>
                    <label className="block text-white text-sm font-medium mb-2">Live-Rolle <span className="text-red-400">*</span></label>
                    <p className="text-white/40 text-xs mb-3">Diese Rolle wird vergeben, wenn jemand live geht.</p>
                    <RoleSelect value={liveRoleId} onChange={setLiveRoleId} placeholder="-- Rolle auswählen --" />
                    {liveRoleId && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: roleColor(liveRoleId) }} />
                            <span className="text-sm text-white/70">@{serverRoles.find(r => r.id === liveRoleId)?.name}</span>
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-white text-sm font-medium mb-2">Einschränkung <span className="text-white/40 font-normal">(optional)</span></label>
                    <p className="text-white/40 text-xs mb-3">Nur Mitglieder mit dieser Rolle erhalten die Live-Rolle. Leer = alle Mitglieder.</p>
                    <RoleSelect value={restrictionRoleId} onChange={setRestrictionRoleId} placeholder="-- Keine Einschränkung --" />
                    {restrictionRoleId && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: roleColor(restrictionRoleId) }} />
                            <span className="text-sm text-white/70">Nur @{serverRoles.find(r => r.id === restrictionRoleId)?.name} Mitglieder</span>
                        </div>
                    )}
                </div>

                {liveRoleId && restrictionRoleId && (
                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 text-violet-300 text-sm">
                        Wenn ein Mitglied mit <strong>@{serverRoles.find(r => r.id === restrictionRoleId)?.name}</strong> live geht → bekommt <strong>@{serverRoles.find(r => r.id === liveRoleId)?.name}</strong>
                    </div>
                )}
                {liveRoleId && !restrictionRoleId && (
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-white/60 text-sm">
                        Jedes Mitglied, das live geht, bekommt <strong>@{serverRoles.find(r => r.id === liveRoleId)?.name}</strong>
                    </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleSave} disabled={isSaving || !liveRoleId}
                        className="bg-violet-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors">
                        {isSaving ? 'Speichere...' : 'Speichern'}
                    </button>
                    {loaded && liveRoleId && (
                        <button onClick={handleDelete}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-2.5 px-5 rounded-lg transition-colors">
                            Entfernen
                        </button>
                    )}
                    {saveStatus && <span className="text-sm font-medium text-white">{saveStatus}</span>}
                </div>
            </div>

            <div className="bg-[#0e0e1a]/75 border border-white/5 rounded-lg p-5 max-w-2xl">
                <h3 className="text-white font-semibold text-sm mb-2">Hinweis</h3>
                <ul className="text-white/50 text-sm space-y-1">
                    <li>• Mitglieder müssen ihren Twitch-Account mit Discord verbinden</li>
                    <li>• Die Rolle wird automatisch vergeben wenn jemand live geht und wieder entzogen wenn der Stream endet</li>
                    <li>• Ohne Einschränkung gilt die Regel für alle Mitglieder des Servers</li>
                </ul>
            </div>
        </div>
    );
}
