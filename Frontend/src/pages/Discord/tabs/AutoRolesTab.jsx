import React, { useState } from 'react';

export default function AutoRolesTab({ selectedServer, serverRoles }) {
    const [sourceRoleId, setSourceRoleId] = useState('');
    const [assignRoleId, setAssignRoleId] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleAssign = async () => {
        if (!sourceRoleId || !assignRoleId) return;
        setIsRunning(true);
        setResult(null);
        setError('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/assign-roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceRoleId, assignRoleId }),
            });
            const data = await res.json();
            if (res.ok) {
                setResult(data.count);
            } else {
                setError(data.error || 'Unbekannter Fehler.');
            }
        } catch {
            setError('Netzwerkfehler.');
        } finally {
            setIsRunning(false);
        }
    };

    const roleName = (id) => serverRoles.find(r => r.id === id)?.name || id;
    const roleColor = (id) => {
        const role = serverRoles.find(r => r.id === id);
        if (!role?.color || role.color === 0) return '#6b7280';
        return `#${role.color.toString(16).padStart(6, '0')}`;
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl text-white font-bold mb-1">Rollen zuweisen</h2>
                <p className="text-white/50 text-sm">
                    Wähle eine Quell-Rolle und eine Ziel-Rolle. Alle Mitglieder mit der Quell-Rolle erhalten sofort die Ziel-Rolle.
                </p>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-lg p-6 space-y-5 max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Quell-Rolle <span className="text-white/40 font-normal">(haben diese Rolle)</span></label>
                        <select value={sourceRoleId} onChange={e => { setSourceRoleId(e.target.value); setResult(null); setError(''); }}
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                            <option value="">-- Rolle auswählen --</option>
                            {serverRoles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">Ziel-Rolle <span className="text-white/40 font-normal">(sollen diese erhalten)</span></label>
                        <select value={assignRoleId} onChange={e => { setAssignRoleId(e.target.value); setResult(null); setError(''); }}
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 outline-none appearance-none">
                            <option value="">-- Rolle auswählen --</option>
                            {serverRoles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
                        </select>
                    </div>
                </div>

                {sourceRoleId && assignRoleId && (
                    <div className="bg-black/30 rounded-lg p-4 text-sm flex flex-wrap items-center gap-2">
                        <span className="text-white/50">Gib allen</span>
                        <span className="font-mono px-2 py-0.5 rounded-lg border text-sm"
                            style={{ color: roleColor(sourceRoleId), borderColor: roleColor(sourceRoleId) + '40', background: roleColor(sourceRoleId) + '15' }}>
                            @{roleName(sourceRoleId)}
                        </span>
                        <span className="text-white/50">Mitgliedern auch</span>
                        <span className="font-mono px-2 py-0.5 rounded-lg border text-sm"
                            style={{ color: roleColor(assignRoleId), borderColor: roleColor(assignRoleId) + '40', background: roleColor(assignRoleId) + '15' }}>
                            @{roleName(assignRoleId)}
                        </span>
                    </div>
                )}

                <button
                    onClick={handleAssign}
                    disabled={isRunning || !sourceRoleId || !assignRoleId || sourceRoleId === assignRoleId}
                    className="bg-violet-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-violet-500 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                    {isRunning ? (
                        <><span className="animate-spin">⏳</span> Wird ausgeführt...</>
                    ) : '▶ Rollen jetzt vergeben'}
                </button>

                {result !== null && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                        <p className="text-green-400 font-semibold">
                            ✅ {result === 0
                                ? 'Alle passenden Mitglieder hatten die Rolle bereits.'
                                : `${result} Mitglied${result !== 1 ? 'er' : ''} ${result !== 1 ? 'haben' : 'hat'} die Rolle erhalten.`}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-red-400">❌ {error}</p>
                    </div>
                )}
            </div>

            <div className="bg-black/20 border border-white/5 rounded-lg p-5 space-y-2 max-w-2xl">
                <h3 className="text-white font-semibold text-sm">ℹ️ Hinweis</h3>
                <ul className="text-white/50 text-sm space-y-1">
                    <li>• Die Aktion wird sofort ausgeführt und kann nicht rückgängig gemacht werden</li>
                    <li>• Mitglieder die die Ziel-Rolle bereits haben werden übersprungen</li>
                    <li>• Die Bot-Rolle muss über der Ziel-Rolle in der Rollenhierarchie stehen</li>
                    <li>• Bei sehr großen Servern kann die Ausführung etwas dauern</li>
                </ul>
            </div>
        </div>
    );
}

