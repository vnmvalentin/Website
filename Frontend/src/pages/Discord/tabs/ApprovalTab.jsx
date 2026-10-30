import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Pencil, Trash2 } from 'lucide-react';
import { DcAddTile } from '../ui';
import EmojiTextField from '../EmojiTextField';

const EMPTY_FORM = {
    title: '',
    channelId: '',
    embedTitle: '',
    embedText: '',
    embedColor: '#06b6d4',
    approverIds: [],
    accessType: 'role',
    accessId: '',
    cooldownHours: 24,
};

export default function ApprovalTab({ selectedServer, channels, serverRoles, serverEmojis }) {
    const [configs, setConfigs] = useState([]);
    const [members, setMembers] = useState([]);
    const [view, setView] = useState('list');
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [memberSearch, setMemberSearch] = useState('');
    const [showMemberDropdown, setShowMemberDropdown] = useState(false);
    const memberRef = useRef(null);

    useEffect(() => {
        if (!selectedServer) return;
        loadConfigs();
        fetch(`/api/discord/guilds/${selectedServer.id}/members`)
            .then(r => r.json())
            .then(data => setMembers(data.members || []));
    }, [selectedServer]);

    useEffect(() => {
        const handler = (e) => {
            if (memberRef.current && !memberRef.current.contains(e.target))
                setShowMemberDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const loadConfigs = () => {
        fetch(`/api/discord/settings/${selectedServer.id}/approvals`)
            .then(r => r.json())
            .then(data => setConfigs(Array.isArray(data) ? data : []));
    };

    const openEditor = (config = null) => {
        setSaveStatus('');
        setMemberSearch('');
        setShowMemberDropdown(false);
        if (config) {
            setEditingId(config.id);
            const approverIds = Array.isArray(config.approverIds)
                ? config.approverIds
                : JSON.parse(config.approverIds || '[]');
            setForm({
                title: config.title || '',
                channelId: config.channelId || '',
                embedTitle: config.embedTitle || '',
                embedText: config.embedText || '',
                embedColor: config.embedColor || '#06b6d4',
                approverIds,
                accessType: config.accessType || 'role',
                accessId: config.accessId || '',
                cooldownHours: config.cooldownHours ?? 24,
            });
        } else {
            setEditingId(null);
            setForm(EMPTY_FORM);
        }
        setView('edit');
    };

    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const toggleApprover = (memberId) => {
        setForm(f => ({
            ...f,
            approverIds: f.approverIds.includes(memberId)
                ? f.approverIds.filter(id => id !== memberId)
                : [...f.approverIds, memberId],
        }));
    };


    const handleSave = async () => {
        if (!form.channelId) return alert('Bitte einen Kanal auswählen!');
        if (form.approverIds.length === 0) return alert('Mindestens einen Genehmiger auswählen!');
        if (!form.accessId) return alert('Bitte Rolle oder Kanal für die Freischaltung auswählen!');

        setIsSaving(true);
        setSaveStatus('');
        try {
            const url = editingId
                ? `/api/discord/settings/${selectedServer.id}/approvals/${editingId}`
                : `/api/discord/settings/${selectedServer.id}/approvals`;
            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setSaveStatus(editingId ? 'Aktualisiert!' : 'Embed erstellt!');
                loadConfigs();
                setTimeout(() => setView('list'), 1500);
            } else {
                const data = await res.json().catch(() => ({}));
                setSaveStatus(`Fehler: ${data.error || 'Fehler.'}`);
            }
        } catch {
            setSaveStatus('Fehler: keine Verbindung zum Server.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 4000);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Wirklich löschen? Die Discord-Nachricht wird ebenfalls entfernt!')) return;
        await fetch(`/api/discord/settings/${selectedServer.id}/approvals/${id}`, { method: 'DELETE' });
        loadConfigs();
    };

    const filteredMembers = members.filter(m =>
        !form.approverIds.includes(m.id) && (
            memberSearch === '' ||
            m.displayName.toLowerCase().includes(memberSearch.toLowerCase()) ||
            m.username.toLowerCase().includes(memberSearch.toLowerCase())
        )
    );

    const getApproverName = (id) => {
        const m = members.find(m => m.id === id);
        return m ? (m.displayName !== m.username ? `${m.displayName} (${m.username})` : m.username) : id;
    };

    if (view === 'edit') {
        return (
            <div className="">
                <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                    <button onClick={() => setView('list')} className="text-white/40 hover:text-white transition-colors text-xl"><X size={14} /></button>
                    <h2 className="dc-h2">
                        {editingId ? 'Genehmigung bearbeiten' : 'Neues Genehmigungsverfahren'}
                    </h2>
                </div>

                <div className="space-y-6 max-w-2xl">
                    {/* 1. Allgemein */}
                    <div className="dc-card p-5 space-y-4">
                        <h3 className="text-white/50 font-semibold text-xs uppercase tracking-wider">1. Allgemein</h3>
                        <div>
                            <label className="dc-label">Interner Name (nur im Dashboard)</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={e => setField('title', e.target.value)}
                                placeholder="z.B. Mitglieder-Bewerbung"
                                className="dc-input w-full"
                            />
                        </div>
                        <div>
                            <label className="dc-label">Kanal für das Embed</label>
                            <select
                                value={form.channelId}
                                onChange={e => setField('channelId', e.target.value)}
                                disabled={!!editingId}
                                className="dc-input w-full"
                            >
                                <option value="">-- Kanal wählen --</option>
                                {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                            </select>
                            {editingId && <p className="text-white/40 text-xs mt-1">Kanal kann nach dem Erstellen nicht geändert werden.</p>}
                        </div>
                    </div>

                    {/* 2. Embed Inhalt */}
                    <div className="dc-card p-5 space-y-4">
                        <h3 className="text-white/50 font-semibold text-xs uppercase tracking-wider">2. Embed Inhalt</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="dc-label">Embed Titel</label>
                                <input
                                    type="text"
                                    value={form.embedTitle}
                                    onChange={e => setField('embedTitle', e.target.value)}
                                    placeholder="📩 Mitgliedschaft beantragen"
                                    className="dc-input w-full"
                                />
                            </div>
                            <div>
                                <label className="dc-label">Embed Farbe</label>
                                <div className="dc-card flex gap-2 items-center p-1.5 pr-4">
                                    <input
                                        type="color"
                                        value={form.embedColor}
                                        onChange={e => setField('embedColor', e.target.value)}
                                        className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                                    />
                                    <span className="text-white/60 text-sm uppercase">{form.embedColor}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="dc-label">Embed Text</label>
                            <EmojiTextField
                                value={form.embedText}
                                onChange={v => setField('embedText', v)}
                                rows={4}
                                emojis={serverEmojis}
                                roles={serverRoles}
                                channels={channels}
                                placeholder="Beschreibe hier wie der Bewerbungsprozess abläuft..."
                            />
                        </div>
                    </div>

                    {/* 3. Genehmiger */}
                    <div className="dc-card p-5 space-y-4">
                        <h3 className="text-white/50 font-semibold text-xs uppercase tracking-wider">3. Genehmiger</h3>
                        <p className="text-white/50 text-xs">Diese Mitglieder erhalten Zugriff auf den privaten Thread und können genehmigen/ablehnen.</p>

                        {form.approverIds.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {form.approverIds.map(id => {
                                    const m = members.find(m => m.id === id);
                                    return (
                                        <span key={id} className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs px-2 py-1.5 rounded-full">
                                            {m?.avatar
                                                ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                                : <span className="w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: 10 }}>{(m?.displayName || id).charAt(0).toUpperCase()}</span>
                                            }
                                            {getApproverName(id)}
                                            <button
                                                onClick={() => toggleApprover(id)}
                                                className="text-indigo-400/60 hover:text-red-400 ml-0.5 transition-colors"
                                                type="button"
                                            >×</button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <div className="relative" ref={memberRef}>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none"><Search size={14} /></span>
                                <input
                                    type="text"
                                    value={memberSearch}
                                    onChange={e => { setMemberSearch(e.target.value); setShowMemberDropdown(true); }}
                                    onFocus={() => setShowMemberDropdown(true)}
                                    placeholder="Mitglied suchen..."
                                    className="dc-input w-full pl-9 pr-4"
                                />
                                {memberSearch && (
                                    <button
                                        onClick={() => { setMemberSearch(''); setShowMemberDropdown(true); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                                        type="button"
                                    >×</button>
                                )}
                            </div>

                            {showMemberDropdown && (
                                <div className="dc-popover absolute z-50 w-full mt-1 overflow-hidden">
                                    {filteredMembers.length === 0 ? (
                                        <div className="px-4 py-3 text-white/40 text-sm text-center">
                                            {memberSearch ? `Kein Mitglied gefunden für "${memberSearch}"` : 'Alle Mitglieder bereits ausgewählt'}
                                        </div>
                                    ) : (
                                        <div className="max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#06b6d4 transparent' }}>
                                            {memberSearch === '' && (
                                                <div className="px-4 py-2 text-white/30 text-xs border-b border-white/5">
                                                    {filteredMembers.length} Mitglieder verfügbar
                                                </div>
                                            )}
                                            {filteredMembers.map(m => (
                                                <div
                                                    key={m.id}
                                                    onClick={() => { toggleApprover(m.id); setMemberSearch(''); setShowMemberDropdown(false); }}
                                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors"
                                                >
                                                    {m.avatar
                                                        ? <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                        : <span className="w-8 h-8 bg-[#5865F2] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{m.displayName.charAt(0).toUpperCase()}</span>
                                                    }
                                                    <div className="min-w-0">
                                                        <div className="text-white text-sm font-medium truncate">{m.displayName}</div>
                                                        {m.displayName !== m.username && (
                                                            <div className="text-white/40 text-xs truncate">{m.username}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 4. Freischaltung */}
                    <div className="dc-card p-5 space-y-4">
                        <h3 className="text-white/50 font-semibold text-xs uppercase tracking-wider">4. Freischaltung bei Genehmigung</h3>
                        <div>
                            <label className="dc-label">Art der Freischaltung</label>
                            <div className="flex gap-3">
                                {[['role', 'Rolle vergeben'], ['channel', 'Kanal freischalten']].map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => { setField('accessType', val); setField('accessId', ''); }}
                                        className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors border ${
                                            form.accessType === val
                                                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                                                : 'bg-[#0e0e1a]/85 border-white/10 text-white/50 hover:border-white/20'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="dc-label">
                                {form.accessType === 'role' ? 'Rolle auswählen' : 'Kanal auswählen'}
                            </label>
                            <select
                                value={form.accessId}
                                onChange={e => setField('accessId', e.target.value)}
                                className="dc-input w-full"
                            >
                                <option value="">-- {form.accessType === 'role' ? 'Rolle' : 'Kanal'} wählen --</option>
                                {form.accessType === 'role'
                                    ? serverRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                                    : channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)
                                }
                            </select>
                        </div>
                        <div>
                            <label className="dc-label">Cooldown bei Ablehnung (Stunden)</label>
                            <input
                                type="number"
                                min="0"
                                max="8760"
                                value={form.cooldownHours}
                                onChange={e => setField('cooldownHours', parseInt(e.target.value) || 0)}
                                className="dc-input w-32"
                            />
                            <p className="text-white/40 text-xs mt-1">
                                {form.cooldownHours === 0
                                    ? 'Kein Cooldown — sofort erneut anfragen möglich.'
                                    : `Nutzer müssen ${form.cooldownHours}h warten bevor sie erneut anfragen können.`}
                            </p>
                        </div>
                    </div>

                    {/* Save */}
                    <div className="flex items-center justify-between pt-2">
                        <button onClick={() => setView('list')} className="text-white/50 hover:text-white px-4 py-2 transition-colors">
                            Abbrechen
                        </button>
                        <div className="flex items-center gap-4">
                            {saveStatus && (
                                <span className={`text-sm font-medium ${saveStatus.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>
                                    {saveStatus}
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="dc-btn"
                            >
                                {isSaving ? 'Speichere...' : (editingId ? 'Änderungen speichern' : 'Embed erstellen')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // List view
    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">Genehmigungsverfahren</h2>
                <p className="text-white/50 text-sm">Nutzer klicken auf den "Anfragen"-Button im Embed — ein privater Thread wird erstellt.</p>
            </div>

            <DcAddTile label="Neues Verfahren" onClick={() => openEditor()} large={configs.length === 0}
                hint={configs.length === 0 ? 'Noch kein Genehmigungsverfahren erstellt. Lege das erste an.' : undefined} />

            {configs.length === 0 ? null : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {configs.map(cfg => {
                        const approverIds = Array.isArray(cfg.approverIds)
                            ? cfg.approverIds
                            : JSON.parse(cfg.approverIds || '[]');
                        const channelName = channels.find(c => c.id === cfg.channelId)?.name;
                        const accessRole = cfg.accessType === 'role' ? serverRoles.find(r => r.id === cfg.accessId) : null;
                        const accessChannel = cfg.accessType === 'channel' ? channels.find(c => c.id === cfg.accessId) : null;

                        return (
                            <div
                                key={cfg.id}
                                className="dc-inset border-l-4 p-5 relative group transition-colors"
                                style={{ borderLeftColor: cfg.embedColor || '#06b6d4' }}
                            >
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditor(cfg)}
                                        className="bg-white/5 hover:bg-indigo-500 hover:text-white text-white/50 p-2 rounded-md transition-colors"
                                        title="Bearbeiten"
                                    ><Pencil size={14} /></button>
                                    <button
                                        onClick={() => handleDelete(cfg.id)}
                                        className="bg-white/5 hover:bg-red-500 text-white/50 p-2 rounded-md transition-colors"
                                        title="Löschen"
                                    ><Trash2 size={14} /></button>
                                </div>

                                <h3 className="text-lg font-bold text-white mb-1 pr-20 truncate">{cfg.title || 'Unbenannt'}</h3>
                                <div className="text-xs text-white/40 mb-4">
                                    #{channelName || 'Unbekannter Kanal'} • {approverIds.length} Genehmiger • {cfg.cooldownHours}h Cooldown
                                </div>

                                <div className="space-y-2 text-sm">
                                    {cfg.embedTitle && (
                                        <div className="text-white/60 font-medium truncate">"{cfg.embedTitle}"</div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-white/40">Freischaltung:</span>
                                        {cfg.accessType === 'role' && accessRole && (
                                            <span className="font-medium" style={{ color: accessRole.color !== '#000000' ? accessRole.color : '#9ca3af' }}>
                                                @{accessRole.name}
                                            </span>
                                        )}
                                        {cfg.accessType === 'channel' && accessChannel && (
                                            <span className="text-indigo-400">#{accessChannel.name}</span>
                                        )}
                                        {!accessRole && !accessChannel && (
                                            <span className="text-red-400">Nicht konfiguriert</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <details className="dc-help">
                <summary>Ablauf</summary>
                <ol className="text-white/50 text-sm space-y-1 list-decimal list-inside">
                    <li>Nutzer klickt auf "📩 Anfragen" im Embed</li>
                    <li>Bot erstellt privaten Thread mit Nutzer + Genehmigern</li>
                    <li>Genehmiger klicken auf "Genehmigen" oder "Ablehnen"</li>
                    <li>Bei Genehmigung: Rolle/Kanal wird freigeschaltet, Nutzer erhält DM</li>
                    <li>Bei Ablehnung: Nutzer erhält DM, Cooldown wird gesetzt</li>
                </ol>
            </details>
        </div>
    );
}

