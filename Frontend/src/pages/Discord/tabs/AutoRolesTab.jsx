
import React, { useState } from 'react';
import { DcHelp } from '../ui';
import { serverErrorText, useDiscordText } from '../discordI18n.js';

export default function AutoRolesTab({ selectedServer, serverRoles }) {
    const t = useDiscordText();
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
                setError(serverErrorText(t, data));
            }
        } catch {
            setError(t.shell.noConnection);
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
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.autoRoles.title}</h2>
                <p className="text-white/50 text-sm">{t.autoRoles.intro}</p>
            </div>

            <div className="dc-card p-6 space-y-5 max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="dc-label">{t.autoRoles.source} <span className="text-white/40 font-normal">{t.autoRoles.sourceHint}</span></label>
                        <select value={sourceRoleId} onChange={e => { setSourceRoleId(e.target.value); setResult(null); setError(''); }}
                            className="dc-input w-full">
                            <option value="">{t.common.pickRole}</option>
                            {serverRoles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="dc-label">{t.autoRoles.target} <span className="text-white/40 font-normal">{t.autoRoles.targetHint}</span></label>
                        <select value={assignRoleId} onChange={e => { setAssignRoleId(e.target.value); setResult(null); setError(''); }}
                            className="dc-input w-full">
                            <option value="">{t.common.pickRole}</option>
                            {serverRoles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
                        </select>
                    </div>
                </div>

                {sourceRoleId && assignRoleId && (
                    <div className="dc-inset p-4 text-sm flex flex-wrap items-center gap-2">
                        <span className="text-white/50">{t.autoRoles.giveAll}</span>
                        <span className="px-2 py-0.5 rounded-md border text-sm"
                            style={{ color: roleColor(sourceRoleId), borderColor: roleColor(sourceRoleId) + '40', background: roleColor(sourceRoleId) + '15' }}>
                            @{roleName(sourceRoleId)}
                        </span>
                        <span className="text-white/50">{t.autoRoles.membersToo}</span>
                        <span className="px-2 py-0.5 rounded-md border text-sm"
                            style={{ color: roleColor(assignRoleId), borderColor: roleColor(assignRoleId) + '40', background: roleColor(assignRoleId) + '15' }}>
                            @{roleName(assignRoleId)}
                        </span>
                    </div>
                )}

                <button
                    onClick={handleAssign}
                    disabled={isRunning || !sourceRoleId || !assignRoleId || sourceRoleId === assignRoleId}
                    className="dc-btn flex items-center gap-2"
                >
                    {isRunning ? t.autoRoles.running : t.autoRoles.run}
                </button>

                {result !== null && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-md p-4">
                        <p className="text-green-400 font-semibold">
                            {result === 0 ? t.autoRoles.allHad : t.autoRoles.assigned(result)}
                        </p>
                    </div>
                )}

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-md p-4">
                        <p className="text-red-400">{t.common.errorWith(error)}</p>
                    </div>
                )}
            </div>

            <DcHelp title={t.common.note} items={t.autoRoles.notes} />
        </div>
    );
}
