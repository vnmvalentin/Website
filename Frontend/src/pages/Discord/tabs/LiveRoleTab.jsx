import React, { useState, useEffect } from 'react';
import { DcHelp } from '../ui';
import { isErrorStatus, serverErrorText, useDiscordText } from '../discordI18n.js';

export default function LiveRoleTab({ selectedServer, serverRoles }) {
    const t = useDiscordText();
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
    const roleName = (id) => serverRoles.find(r => r.id === id)?.name;

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
            setSaveStatus(res.ok ? t.common.saved : t.common.errorWith(serverErrorText(t, data)));
        } catch {
            setSaveStatus(t.common.networkError);
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
        setSaveStatus(t.common.removed);
        setTimeout(() => setSaveStatus(''), 3000);
    };

    const RoleSelect = ({ value, onChange, placeholder }) => (
        <select value={value} onChange={e => onChange(e.target.value)}
            className="dc-input w-full">
            <option value="">{placeholder}</option>
            {serverRoles.map(r => (
                <option key={r.id} value={r.id}>@{r.name}</option>
            ))}
        </select>
    );

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{t.liveRole.title}</h2>
                <p className="text-white/50 text-sm">{t.liveRole.intro}</p>
            </div>

            <div className="dc-card p-6 space-y-5 max-w-2xl">
                <div>
                    <label className="dc-label">{t.liveRole.role} <span className="text-red-400">*</span></label>
                    <p className="text-white/40 text-xs mb-3">{t.liveRole.roleHint}</p>
                    <RoleSelect value={liveRoleId} onChange={setLiveRoleId} placeholder={t.common.pickRole} />
                    {liveRoleId && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: roleColor(liveRoleId) }} />
                            <span className="text-sm text-white/70">@{roleName(liveRoleId)}</span>
                        </div>
                    )}
                </div>

                <div>
                    <label className="dc-label">{t.liveRole.restriction} <span className="text-white/40 font-normal">{t.common.optional}</span></label>
                    <p className="text-white/40 text-xs mb-3">{t.liveRole.restrictionHint}</p>
                    <RoleSelect value={restrictionRoleId} onChange={setRestrictionRoleId} placeholder={t.liveRole.noRestriction} />
                    {restrictionRoleId && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: roleColor(restrictionRoleId) }} />
                            <span className="text-sm text-white/70">{t.liveRole.onlyMembers(roleName(restrictionRoleId))}</span>
                        </div>
                    )}
                </div>

                {liveRoleId && restrictionRoleId && (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-md p-3 text-indigo-300 text-sm">
                        {t.liveRole.ruleIf} <strong>@{roleName(restrictionRoleId)}</strong> {t.liveRole.ruleGets} <strong>@{roleName(liveRoleId)}</strong>
                    </div>
                )}
                {liveRoleId && !restrictionRoleId && (
                    <div className="bg-white/5 border border-white/10 rounded-md p-3 text-white/60 text-sm">
                        {t.liveRole.ruleAll} <strong>@{roleName(liveRoleId)}</strong>
                    </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                    <button onClick={handleSave} disabled={isSaving || !liveRoleId}
                        className="dc-btn">
                        {isSaving ? t.common.saving : t.common.save}
                    </button>
                    {loaded && liveRoleId && (
                        <button onClick={handleDelete}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-2.5 px-5 rounded-md transition-colors">
                            {t.common.remove}
                        </button>
                    )}
                    {saveStatus && <span className={`text-sm font-medium ${isErrorStatus(saveStatus) ? 'text-red-400' : 'text-white'}`}>{saveStatus}</span>}
                </div>
            </div>

            <DcHelp title={t.common.note} items={t.liveRole.notes} />
        </div>
    );
}
