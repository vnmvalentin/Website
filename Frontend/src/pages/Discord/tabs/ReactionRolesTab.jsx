import React, { useState, useEffect } from 'react';

const btnStyle = n => {
    switch (Number(n)) {
        case 1: return 'bg-[#5865F2] border-transparent';
        case 3: return 'bg-[#248046] border-transparent';
        case 4: return 'bg-[#DA373C] border-transparent';
        default: return 'bg-[#2b2d31] border border-transparent';
    }
};

const renderPreview = (text) => {
    if (!text) return <span className="text-gray-500 italic">Dein Text hier...</span>;
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/&lt;a?:(.*?):(\d+)&gt;/g, (m, name, id) => {
        const ext = m.startsWith('&lt;a:') ? 'gif' : 'png';
        return `<img src="https://cdn.discordapp.com/emojis/${id}.${ext}" alt="${name}" class="inline-block w-5 h-5 align-middle mx-0.5"/>`;
    });
    html = html.replace(/\n/g, '<br/>');
    return <div dangerouslySetInnerHTML={{ __html: html }} className="text-[#dbdee1] text-[15px]"/>;
};

export default function ReactionRolesTab({ selectedServer, channels, serverRoles, serverEmojis, botNickname }) {
    const [list, setList] = useState([]);
    const [view, setView] = useState('list');
    const [editingId, setEditingId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    // Editor state
    const [title, setTitle] = useState('');
    const [rrChannel, setRrChannel] = useState('');
    const [rrColor, setRrColor] = useState('#06b6d4');
    const [embedTitle, setEmbedTitle] = useState('');
    const [embedText, setEmbedText] = useState('');
    const [embedFooter, setEmbedFooter] = useState('');
    const [rrMode, setRrMode] = useState('multi');
    const [mappings, setMappings] = useState([{ type: 'unicode', emoji: '', label: '', style: 2, roleId: '' }]);

    const [openEmojiIdx, setOpenEmojiIdx] = useState(null);
    const [openRoleIdx, setOpenRoleIdx] = useState(null);
    const [showMsgEmoji, setShowMsgEmoji] = useState(false);

    useEffect(() => { loadList(); }, [selectedServer]);

    const loadList = () => {
        fetch(`/api/discord/settings/${selectedServer.id}/reaction-roles`)
            .then(r => r.json()).then(d => setList(d || []));
    };

    const openEditor = (rr = null) => {
        setSaveStatus('');
        if (rr) {
            setEditingId(rr.id); setTitle(rr.title || ''); setRrChannel(rr.channelId);
            setRrColor(rr.color || '#06b6d4'); setEmbedTitle(rr.embedTitle || '');
            setEmbedText(rr.messageText || ''); setEmbedFooter(rr.embedFooter || '');
            setRrMode(rr.mode);
            const mapped = Array.isArray(rr.roleMapping)
                ? rr.roleMapping.map(m => ({ type: m.emoji?.match(/^\d+$/) ? 'custom' : 'unicode', emoji: m.emoji || '', label: m.label || '', style: m.style || 2, roleId: m.roleId }))
                : Object.entries(rr.roleMapping).map(([emoji, roleId]) => ({ type: emoji.match(/^\d+$/) ? 'custom' : 'unicode', emoji, label: '', style: 2, roleId }));
            setMappings(mapped.length ? mapped : [{ type: 'unicode', emoji: '', label: '', style: 2, roleId: '' }]);
        } else {
            setEditingId(null); setTitle(''); setRrChannel(''); setRrColor('#06b6d4');
            setEmbedTitle(''); setEmbedText(''); setEmbedFooter(''); setRrMode('multi');
            setMappings([{ type: 'unicode', emoji: '', label: '', style: 2, roleId: '' }]);
        }
        setView('edit');
    };

    const closeAllDropdowns = () => { setOpenEmojiIdx(null); setOpenRoleIdx(null); setShowMsgEmoji(false); };

    const handleSave = async () => {
        if (!rrChannel) return alert('Bitte wähle einen Kanal!');
        const valid = mappings.filter(m => (m.emoji.trim() || m.label.trim()) && m.roleId);
        if (!valid.length) return alert('Mindestens eine Verknüpfung mit Emoji/Text + Rolle!');
        setIsSaving(true); setSaveStatus('');
        try {
            const url = editingId
                ? `/api/discord/settings/${selectedServer.id}/reaction-roles/${editingId}`
                : `/api/discord/settings/${selectedServer.id}/reaction-roles`;
            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId: rrChannel, messageText: embedText, mode: rrMode, roleMapping: valid, title, color: rrColor, embedTitle, embedFooter }),
            });
            if (res.ok) { setSaveStatus(editingId ? '✅ Aktualisiert!' : '✅ Erstellt!'); loadList(); setTimeout(() => setView('list'), 1500); }
            else setSaveStatus('❌ Fehler. Hat der Bot Rechte?');
        } catch (e) { setSaveStatus('❌ Fehler.'); }
        finally { setIsSaving(false); setTimeout(() => setSaveStatus(''), 4000); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Wirklich löschen? Dies löscht auch die Discord-Nachricht!')) return;
        await fetch(`/api/discord/settings/${selectedServer.id}/reaction-roles/${id}`, { method: 'DELETE' });
        loadList();
    };

    const updateMapping = (i, k, v) => {
        const m = [...mappings]; m[i][k] = v;
        if (k === 'type') m[i].emoji = '';
        setMappings(m);
    };

    if (view === 'list') return (
        <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl text-white font-bold mb-1">Rollen-Buttons</h2>
                    <p className="text-gray-400 text-sm">Nutzer klicken Buttons für Rollen — nur sie sehen die Antwort.</p>
                </div>
                <button onClick={() => openEditor()} className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-black font-bold py-3 px-6 rounded-xl transition-all">➕ Neues Embed</button>
            </div>
            {list.length === 0
                ? <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl text-gray-500">Noch keine Rollen-Buttons erstellt.</div>
                : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {list.map(rr => {
                        const btns = Array.isArray(rr.roleMapping) ? rr.roleMapping : Object.entries(rr.roleMapping).map(([e, r]) => ({ emoji: e, roleId: r, label: '', style: 2 }));
                        return (
                            <div key={rr.id} className="bg-[#0f0f13] border-l-4 rounded-xl p-5 relative group hover:-translate-y-0.5 transition-all" style={{ borderLeftColor: rr.color || '#06b6d4' }}>
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditor(rr)} className="bg-white/5 hover:bg-cyan-500 hover:text-black text-gray-400 p-2 rounded-lg transition-colors">✏️</button>
                                    <button onClick={() => handleDelete(rr.id)} className="bg-white/5 hover:bg-red-500 text-gray-400 p-2 rounded-lg transition-colors">🗑️</button>
                                </div>
                                <h3 className="text-white font-bold truncate pr-20">{rr.title || 'Unbenannt'}</h3>
                                <div className="text-xs text-gray-500 mb-3">{rr.mode === 'single' ? 'Single Choice' : 'Multi Choice'} • #{channels.find(c => c.id === rr.channelId)?.name || '?'}</div>
                                <div className="space-y-1.5">
                                    {btns.slice(0, 3).map((b, i) => {
                                        const role = serverRoles.find(r => r.id === b.roleId);
                                        const ce = serverEmojis.find(e => e.id === b.emoji);
                                        return (
                                            <div key={i} className="flex items-center justify-between text-sm bg-[#1a1a20] px-3 py-1.5 rounded-lg">
                                                <div className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${btnStyle(b.style)}`}>
                                                    {ce ? <img src={ce.url} className="w-3 h-3"/> : <span>{b.emoji}</span>}
                                                    {b.label && <span>{b.label}</span>}
                                                </div>
                                                <span className="text-xs truncate ml-2" style={{ color: role?.color || '#fff' }}>{role?.name || 'Gelöschte Rolle'}</span>
                                            </div>
                                        );
                                    })}
                                    {btns.length > 3 && <div className="text-xs text-gray-500">... +{btns.length - 3} weitere</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            }
        </div>
    );

    return (
        <div onClick={closeAllDropdowns} className="animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0f0f13] border border-cyan-500/20 rounded-2xl p-6 md:p-8 shadow-inner">
                <div className="flex items-center gap-3 mb-8 pb-4 border-b border-white/5">
                    <button onClick={() => setView('list')} className="text-gray-500 hover:text-white transition-colors">✕</button>
                    <h3 className="text-xl font-bold text-white">{editingId ? '✏️ Embed bearbeiten' : '➕ Neues Embed'}</h3>
                </div>

                {/* ── SEKTION 1: Titel + Kanal ──────────────────────────── */}
                <div className="mb-8 p-5 bg-[#1a1a20] rounded-xl border border-white/5 space-y-4">
                    <h4 className="text-white font-semibold text-sm uppercase tracking-wider text-gray-400">① Allgemein</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Interner Titel</label>
                            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Spiele-Rollen"
                                className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Ziel-Kanal</label>
                            <select value={rrChannel} onChange={e => setRrChannel(e.target.value)} disabled={!!editingId}
                                className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none appearance-none disabled:opacity-50">
                                <option value="">-- Wählen --</option>
                                {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* ── SEKTION 2: Embed ──────────────────────────────────── */}
                <div className="mb-8 p-5 bg-[#1a1a20] rounded-xl border border-white/5 space-y-4">
                    <h4 className="text-white font-semibold text-sm uppercase tracking-wider text-gray-400">② Embed Inhalt</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Embed Titel</label>
                            <input value={embedTitle} onChange={e => setEmbedTitle(e.target.value)} placeholder="Wähle deine Rollen!"
                                className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Footer Text</label>
                            <input value={embedFooter} onChange={e => setEmbedFooter(e.target.value)} placeholder="Klicke auf Buttons..."
                                className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-white focus:border-cyan-500 outline-none"/>
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Farbe</label>
                            <div className="flex items-center gap-2 bg-[#0f0f13] border border-white/10 rounded-xl p-2 pr-4">
                                <input type="color" value={rrColor} onChange={e => setRrColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0"/>
                                <span className="text-gray-300 font-mono text-sm">{rrColor}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="relative z-30" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-white text-sm font-medium">Nachrichtentext</label>
                                <button onClick={() => setShowMsgEmoji(!showMsgEmoji)} className="text-gray-400 hover:text-cyan-400 bg-[#0f0f13] border border-white/10 p-1.5 rounded-lg text-sm">😀</button>
                            </div>
                            <textarea value={embedText} onChange={e => setEmbedText(e.target.value)} rows="6"
                                className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-4 text-white focus:border-cyan-500 outline-none resize-y font-mono text-sm"/>
                            {showMsgEmoji && (
                                <div className="absolute right-0 top-16 w-64 bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl p-3 z-50">
                                    <div className="text-xs text-gray-400 mb-2">Server Emojis</div>
                                    <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                                        {serverEmojis.map(e => (
                                            <button key={e.id} onClick={() => { const fmt = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`; setEmbedText(t => t + fmt + ' '); setShowMsgEmoji(false); }}
                                                className="p-1 hover:bg-white/10 rounded-lg flex justify-center">
                                                <img src={e.url} alt={e.name} className="w-7 h-7"/>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-white text-sm font-medium mb-2">Live Vorschau</label>
                            <div className="bg-[#313338] rounded-md p-4 border-l-4 shadow-md" style={{ borderLeftColor: rrColor }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-[#5865F2] rounded-full overflow-hidden shrink-0">
                                        {selectedServer.icon ? <img src={selectedServer.icon} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-white text-xs">B</div>}
                                    </div>
                                    <span className="text-white text-sm font-medium">{botNickname || 'LynxB'}</span>
                                    <span className="bg-[#5865F2] text-white text-[10px] px-1 rounded uppercase font-bold">BOT</span>
                                </div>
                                <div className="bg-[#2b2d31] rounded p-3">
                                    {embedTitle && <div className="text-white font-bold text-sm mb-1">{embedTitle}</div>}
                                    {renderPreview(embedText)}
                                    {embedFooter && <div className="text-xs text-gray-400 mt-3">{embedFooter}</div>}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {mappings.filter(m => m.emoji || m.label).map((m, i) => {
                                        const ce = serverEmojis.find(e => e.id === m.emoji);
                                        return (
                                            <div key={i} className={`text-white px-2 py-1 rounded flex items-center gap-1 text-xs ${btnStyle(m.style)}`}>
                                                {ce ? <img src={ce.url} className="w-4 h-4"/> : m.emoji ? <span>{m.emoji}</span> : null}
                                                {m.label && <span>{m.label}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── SEKTION 3: Buttons ───────────────────────────────── */}
                <div className="p-5 bg-[#1a1a20] rounded-xl border border-white/5 space-y-4">
                    <div className="flex justify-between items-center">
                        <h4 className="text-white font-semibold text-sm uppercase tracking-wider text-gray-400">③ Buttons & Rollen</h4>
                        <select value={rrMode} onChange={e => setRrMode(e.target.value)}
                            className="bg-[#0f0f13] border border-white/10 rounded-xl p-2 text-white text-sm outline-none">
                            <option value="multi">Mehrfach-Auswahl</option>
                            <option value="single">Single-Choice</option>
                        </select>
                    </div>

                    {mappings.map((m, i) => (
                        <div key={i} onClick={e => e.stopPropagation()} className="flex flex-col xl:flex-row gap-3 bg-[#0f0f13] p-4 rounded-xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <select value={m.style} onChange={e => updateMapping(i, 'style', e.target.value)}
                                    className="bg-[#1a1a20] text-white rounded-lg p-3 border border-white/10 outline-none">
                                    <option value={1}>Blau</option><option value={2}>Grau</option>
                                    <option value={3}>Grün</option><option value={4}>Rot</option>
                                </select>
                                <select value={m.type} onChange={e => updateMapping(i, 'type', e.target.value)}
                                    className="bg-[#1a1a20] text-white rounded-lg p-3 border border-white/10 outline-none">
                                    <option value="unicode">Std. Emoji</option>
                                    <option value="custom">Serv. Emoji</option>
                                </select>
                                {m.type === 'custom' ? (
                                    <div className="relative">
                                        <button onClick={() => { setOpenRoleIdx(null); setOpenEmojiIdx(openEmojiIdx === i ? null : i); }}
                                            className="w-full bg-[#1a1a20] text-white rounded-lg p-3 border border-white/10 flex items-center gap-2">
                                            {m.emoji ? <img src={serverEmojis.find(e => e.id === m.emoji)?.url} className="w-6 h-6"/> : <span className="text-gray-400 text-sm">Emoji</span>}
                                        </button>
                                        {openEmojiIdx === i && (
                                            <div className="absolute z-50 top-full mt-1 w-full bg-[#0f0f13] border border-white/10 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
                                                {serverEmojis.map(e => (
                                                    <div key={e.id} onClick={() => { updateMapping(i, 'emoji', e.id); setOpenEmojiIdx(null); }}
                                                        className="flex items-center gap-2 p-2 hover:bg-white/10 cursor-pointer">
                                                        <img src={e.url} className="w-5 h-5"/><span className="text-white text-xs">{e.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <input type="text" value={m.emoji} onChange={e => updateMapping(i, 'emoji', e.target.value)} placeholder="👍"
                                        className="bg-[#1a1a20] text-center text-xl text-white rounded-lg p-2 border border-white/10"/>
                                )}
                                <input type="text" value={m.label} onChange={e => updateMapping(i, 'label', e.target.value)} placeholder="Button Text"
                                    className="bg-[#1a1a20] text-white rounded-lg p-3 border border-white/10"/>
                            </div>
                            <div className="hidden xl:flex items-center text-gray-500">→</div>
                            <div className="flex gap-3 xl:w-56">
                                <div className="relative flex-1">
                                    <button onClick={() => { setOpenEmojiIdx(null); setOpenRoleIdx(openRoleIdx === i ? null : i); }}
                                        className="w-full bg-[#0f0f13] text-white rounded-lg p-3 border border-white/10 flex items-center gap-2">
                                        {m.roleId ? (() => { const r = serverRoles.find(r => r.id === m.roleId); return r
                                            ? <><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color !== '#000000' ? r.color : '#6b7280' }}/><span className="text-sm truncate">{r.name}</span></>
                                            : <span className="text-gray-400 text-sm">Unbekannt</span>; })()
                                            : <span className="text-gray-400 text-sm">Rolle wählen</span>}
                                    </button>
                                    {openRoleIdx === i && (
                                        <div className="absolute z-50 top-full mt-1 w-full bg-[#0f0f13] border border-white/10 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
                                            {serverRoles.map(r => (
                                                <div key={r.id} onClick={() => { updateMapping(i, 'roleId', r.id); setOpenRoleIdx(null); }}
                                                    className="flex items-center gap-2 p-2 hover:bg-white/10 cursor-pointer">
                                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color !== '#000000' ? r.color : '#6b7280' }}/>
                                                    <span className="text-white text-sm">{r.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {mappings.length > 1 && (
                                    <button onClick={() => setMappings(mappings.filter((_, j) => j !== i))}
                                        className="text-gray-500 hover:text-white hover:bg-red-500/80 px-3 rounded-lg transition-colors">✖</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {mappings.length < 25 && (
                        <button onClick={() => setMappings([...mappings, { type: 'unicode', emoji: '', label: '', style: 2, roleId: '' }])}
                            className="text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors">
                            + Weitere Verknüpfung
                        </button>
                    )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                    <button onClick={() => setView('list')} className="text-gray-400 hover:text-white px-4 py-2 transition-colors">Abbrechen</button>
                    <div className="flex items-center gap-4">
                        {saveStatus && <span className={`text-sm font-medium ${saveStatus.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</span>}
                        <button onClick={handleSave} disabled={isSaving}
                            className="bg-cyan-500 text-black py-3 px-8 rounded-xl font-bold hover:bg-cyan-400 disabled:opacity-50 transition-all">
                            {isSaving ? 'Speichere...' : editingId ? 'Änderungen senden' : 'Embed erstellen'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
