import React, { useState, useEffect, useRef } from 'react';

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
    const [showEmbedEmojiPicker, setShowEmbedEmojiPicker] = useState(false);
    const memberRef = useRef(null);
    const emojiRef = useRef(null);

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
            if (emojiRef.current && !emojiRef.current.contains(e.target))
                setShowEmbedEmojiPicker(false);
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
        setShowEmbedEmojiPicker(false);
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

    const insertEmoji = (emoji) => {
        const format = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
        setField('embedText', form.embedText + format + ' ');
        setShowEmbedEmojiPicker(false);
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
                setSaveStatus(editingId ? '✅ Aktualisiert!' : '✅ Embed erstellt!');
                loadConfigs();
                setTimeout(() => setView('list'), 1500);
            } else {
                const data = await res.json().catch(() => ({}));
                setSaveStatus(`❌ ${data.error || 'Fehler.'}`);
            }
        } catch {
            setSaveStatus('❌ Netzwerkfehler.');
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
            <div className="animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-4">
                    <button onClick={() => setView('list')} className="text-gray-500 hover:text-white transition-colors text-xl">✕</button>
                    <h2 className="text-2xl text-white font-bold">
                        {editingId ? '✏️ Genehmigung bearbeiten' : '➕ Neues Genehmigungsverfahren'}
                    </h2>
                </div>

                <div className="space-y-6 max-w-2xl">
                    {/* ① Allgemein */}
                    <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-4">
                        <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wider">① Allgemein</h3>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Interner Name (nur im Dashboard)</label>
                            <input
                                type="text"
                                value={form.title}
                                onChange={e => setField('title', e.target.value)}
                                placeholder="z.B. Mitglieder-Bewerbung"
                                className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Kanal für das Embed</label>
                            <select
                                value={form.channelId}
                                onChange={e => setField('channelId', e.target.value)}
                                disabled={!!editingId}
                                className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none disabled:opacity-50"
                            >
                                <option value="">-- Kanal wählen --</option>
                                {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                            </select>
                            {editingId && <p className="text-gray-500 text-xs mt-1">Kanal kann nach dem Erstellen nicht geändert werden.</p>}
                        </div>
                    </div>

                    {/* ② Embed Inhalt */}
                    <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-4">
                        <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wider">② Embed Inhalt</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">Embed Titel</label>
                                <input
                                    type="text"
                                    value={form.embedTitle}
                                    onChange={e => setField('embedTitle', e.target.value)}
                                    placeholder="📩 Mitgliedschaft beantragen"
                                    className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-white text-sm font-medium mb-2">Embed Farbe</label>
                                <div className="flex gap-2 items-center bg-[#1a1a20] border border-white/10 rounded-xl p-1.5 pr-4">
                                    <input
                                        type="color"
                                        value={form.embedColor}
                                        onChange={e => setField('embedColor', e.target.value)}
                                        className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                                    />
                                    <span className="text-gray-300 font-mono text-sm uppercase">{form.embedColor}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Embed Text</label>
                            <div className="relative" ref={emojiRef}>
                                <textarea
                                    value={form.embedText}
                                    onChange={e => setField('embedText', e.target.value)}
                                    rows="4"
                                    placeholder="Beschreibe hier wie der Bewerbungsprozess abläuft..."
                                    className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-4 pr-12 text-white focus:border-cyan-500 outline-none resize-y"
                                />
                                {serverEmojis.length > 0 && (
                                    <button
                                        onClick={() => setShowEmbedEmojiPicker(v => !v)}
                                        className="absolute right-3 top-3 p-2 text-gray-400 hover:text-cyan-400 bg-[#0f0f13] rounded-lg border border-white/5 transition-colors"
                                        title="Server Emoji einfügen"
                                        type="button"
                                    >
                                        😀
                                    </button>
                                )}
                                {showEmbedEmojiPicker && (
                                    <div className="absolute right-0 top-14 w-64 bg-[#1a1a20] border border-white/10 rounded-xl shadow-2xl p-3 z-50">
                                        <div className="text-xs text-gray-400 mb-2 font-medium">Server Emoji einfügen</div>
                                        <div
                                            className="grid grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1"
                                            style={{ scrollbarWidth: 'thin', scrollbarColor: '#06b6d4 transparent' }}
                                        >
                                            {serverEmojis.map(e => (
                                                <button
                                                    key={e.id}
                                                    onClick={() => insertEmoji(e)}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg flex justify-center items-center transition-colors"
                                                    title={e.name}
                                                    type="button"
                                                >
                                                    <img src={e.url} alt={e.name} className="w-7 h-7 object-contain" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ③ Genehmiger */}
                    <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-4">
                        <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wider">③ Genehmiger</h3>
                        <p className="text-gray-400 text-xs">Diese Mitglieder erhalten Zugriff auf den privaten Thread und können genehmigen/ablehnen.</p>

                        {form.approverIds.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {form.approverIds.map(id => {
                                    const m = members.find(m => m.id === id);
                                    return (
                                        <span key={id} className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs px-2 py-1.5 rounded-full">
                                            {m?.avatar
                                                ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                                : <span className="w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: 10 }}>{(m?.displayName || id).charAt(0).toUpperCase()}</span>
                                            }
                                            {getApproverName(id)}
                                            <button
                                                onClick={() => toggleApprover(id)}
                                                className="text-cyan-400/60 hover:text-red-400 ml-0.5 transition-colors"
                                                type="button"
                                            >×</button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <div className="relative" ref={memberRef}>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
                                <input
                                    type="text"
                                    value={memberSearch}
                                    onChange={e => { setMemberSearch(e.target.value); setShowMemberDropdown(true); }}
                                    onFocus={() => setShowMemberDropdown(true)}
                                    placeholder="Mitglied suchen..."
                                    className="w-full bg-[#1a1a20] border border-white/10 rounded-xl py-3 pl-9 pr-4 text-white focus:border-cyan-500 outline-none"
                                />
                                {memberSearch && (
                                    <button
                                        onClick={() => { setMemberSearch(''); setShowMemberDropdown(true); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                        type="button"
                                    >×</button>
                                )}
                            </div>

                            {showMemberDropdown && (
                                <div className="absolute z-50 w-full mt-1 bg-[#1a1a20] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                                    {filteredMembers.length === 0 ? (
                                        <div className="px-4 py-3 text-gray-500 text-sm text-center">
                                            {memberSearch ? `Kein Mitglied gefunden für "${memberSearch}"` : 'Alle Mitglieder bereits ausgewählt'}
                                        </div>
                                    ) : (
                                        <div className="max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#06b6d4 transparent' }}>
                                            {memberSearch === '' && (
                                                <div className="px-4 py-2 text-gray-600 text-xs border-b border-white/5">
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
                                                            <div className="text-gray-500 text-xs truncate">{m.username}</div>
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

                    {/* ④ Freischaltung */}
                    <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-4">
                        <h3 className="text-gray-400 font-semibold text-xs uppercase tracking-wider">④ Freischaltung bei Genehmigung</h3>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Art der Freischaltung</label>
                            <div className="flex gap-3">
                                {[['role', '🎖️ Rolle vergeben'], ['channel', '📢 Kanal freischalten']].map(([val, label]) => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => { setField('accessType', val); setField('accessId', ''); }}
                                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                                            form.accessType === val
                                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                                : 'bg-[#1a1a20] border-white/10 text-gray-400 hover:border-white/20'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">
                                {form.accessType === 'role' ? 'Rolle auswählen' : 'Kanal auswählen'}
                            </label>
                            <select
                                value={form.accessId}
                                onChange={e => setField('accessId', e.target.value)}
                                className="w-full bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none"
                            >
                                <option value="">-- {form.accessType === 'role' ? 'Rolle' : 'Kanal'} wählen --</option>
                                {form.accessType === 'role'
                                    ? serverRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                                    : channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)
                                }
                            </select>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Cooldown bei Ablehnung (Stunden)</label>
                            <input
                                type="number"
                                min="0"
                                max="8760"
                                value={form.cooldownHours}
                                onChange={e => setField('cooldownHours', parseInt(e.target.value) || 0)}
                                className="w-32 bg-[#1a1a20] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"
                            />
                            <p className="text-gray-500 text-xs mt-1">
                                {form.cooldownHours === 0
                                    ? 'Kein Cooldown — sofort erneut anfragen möglich.'
                                    : `Nutzer müssen ${form.cooldownHours}h warten bevor sie erneut anfragen können.`}
                            </p>
                        </div>
                    </div>

                    {/* Save */}
                    <div className="flex items-center justify-between pt-2">
                        <button onClick={() => setView('list')} className="text-gray-400 hover:text-white px-4 py-2 transition-colors">
                            Abbrechen
                        </button>
                        <div className="flex items-center gap-4">
                            {saveStatus && (
                                <span className={`text-sm font-medium ${saveStatus.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>
                                    {saveStatus}
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-cyan-500 text-black font-bold py-3 px-8 rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all"
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
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl text-white font-bold mb-1">Genehmigungsverfahren</h2>
                    <p className="text-gray-400 text-sm">Nutzer klicken auf den "Anfragen"-Button im Embed — ein privater Thread wird erstellt.</p>
                </div>
                <button
                    onClick={() => openEditor()}
                    className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-black font-bold py-3 px-6 rounded-xl transition-all flex items-center gap-2"
                >
                    ➕ Neues Verfahren
                </button>
            </div>

            {configs.length === 0 ? (
                <div className="text-center py-16 border border-white/5 border-dashed rounded-2xl">
                    <p className="text-gray-500 mb-2">Noch kein Genehmigungsverfahren erstellt.</p>
                    <p className="text-gray-600 text-sm">Klicke auf "Neues Verfahren" um zu starten.</p>
                </div>
            ) : (
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
                                className="bg-[#0f0f13] border-l-4 rounded-xl p-5 relative group transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                                style={{ borderLeftColor: cfg.embedColor || '#06b6d4' }}
                            >
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditor(cfg)}
                                        className="bg-white/5 hover:bg-cyan-500 hover:text-black text-gray-400 p-2 rounded-lg transition-colors"
                                        title="Bearbeiten"
                                    >✏️</button>
                                    <button
                                        onClick={() => handleDelete(cfg.id)}
                                        className="bg-white/5 hover:bg-red-500 text-gray-400 p-2 rounded-lg transition-colors"
                                        title="Löschen"
                                    >🗑️</button>
                                </div>

                                <h3 className="text-lg font-bold text-white mb-1 pr-20 truncate">{cfg.title || 'Unbenannt'}</h3>
                                <div className="text-xs text-gray-500 mb-4">
                                    #{channelName || 'Unbekannter Kanal'} • {approverIds.length} Genehmiger • {cfg.cooldownHours}h Cooldown
                                </div>

                                <div className="space-y-2 text-sm">
                                    {cfg.embedTitle && (
                                        <div className="text-gray-300 font-medium truncate">"{cfg.embedTitle}"</div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-gray-500">Freischaltung:</span>
                                        {cfg.accessType === 'role' && accessRole && (
                                            <span className="font-medium" style={{ color: accessRole.color !== '#000000' ? accessRole.color : '#9ca3af' }}>
                                                🎖️ {accessRole.name}
                                            </span>
                                        )}
                                        {cfg.accessType === 'channel' && accessChannel && (
                                            <span className="text-cyan-400">📢 #{accessChannel.name}</span>
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

            <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-5 space-y-2">
                <h3 className="text-white font-semibold text-sm">ℹ️ Ablauf</h3>
                <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
                    <li>Nutzer klickt auf "📩 Anfragen" im Embed</li>
                    <li>Bot erstellt privaten Thread mit Nutzer + Genehmigern</li>
                    <li>Genehmiger klicken auf "Genehmigen" oder "Ablehnen"</li>
                    <li>Bei Genehmigung: Rolle/Kanal wird freigeschaltet, Nutzer erhält DM</li>
                    <li>Bei Ablehnung: Nutzer erhält DM, Cooldown wird gesetzt</li>
                </ol>
            </div>
        </div>
    );
}
