import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bot, Pencil, Plus, Smile, Trash2, X } from 'lucide-react';
import { DcAddTile } from '../ui';
import EmojiTextField from '../EmojiTextField';
import { renderDiscordText } from '../discordText';

// Discords Button-Farben (ButtonStyle 1–4)
const BUTTON_COLORS = [
    { value: 1, name: 'Blau', color: '#5865f2' },
    { value: 2, name: 'Grau', color: '#4e5058' },
    { value: 3, name: 'Grün', color: '#248046' },
    { value: 4, name: 'Rot', color: '#da373c' },
];
const buttonColor = (style) => (BUTTON_COLORS.find((c) => c.value === Number(style)) || BUTTON_COLORS[1]).color;
const roleColor = (c) => (c && c !== '#000000' ? c : '#99aab5');
const emptyMapping = () => ({ emoji: '', label: '', style: 2, roleId: '' });

/** Ein Button-Emoji: Server-Emoji (ID) oder normales Emoji (Zeichen). */
function ButtonEmoji({ emoji, serverEmojis, size = 18 }) {
    if (!emoji) return null;
    const ce = /^\d+$/.test(emoji) ? serverEmojis.find((e) => e.id === emoji) : null;
    if (ce) return <img src={ce.url} alt={ce.name} style={{ width: size, height: size }} className="object-contain" />;
    if (/^\d+$/.test(emoji)) return null;
    return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{emoji}</span>;
}

/**
 * Emoji-Wahl für einen Button: ein Knopf, der das gewählte Emoji zeigt.
 * Aufgeklappt: Feld für normale Emojis und darunter die Server-Emojis.
 */
function EmojiPick({ value, onChange, serverEmojis }) {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const wrap = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const pick = (v) => { onChange(v); setOpen(false); setTyped(''); };

    return (
        <div ref={wrap} className="relative shrink-0">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
                title="Emoji wählen" aria-label="Emoji wählen"
                className={`dc-input w-10 h-[38px] !p-0 flex items-center justify-center ${open ? '!border-[var(--dc-accent)]' : ''}`}>
                {value ? <ButtonEmoji emoji={value} serverEmojis={serverEmojis} size={20} /> : <Smile size={16} className="text-white/35" />}
            </button>
            {open && (
                <div className="dc-popover absolute left-0 top-full mt-1 z-50 w-72 p-2.5">
                    <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) pick(typed.trim()); }}>
                        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Emoji eintippen, z. B. 🎮"
                            className="dc-input flex-1 min-w-0 !py-1.5" />
                        <button type="submit" className="dc-btn !min-h-0 !px-3" disabled={!typed.trim()}>OK</button>
                    </form>
                    {serverEmojis.length > 0 && (
                        <>
                            <div className="text-[11px] font-semibold text-white/40 mt-2.5 mb-1 px-0.5">Server-Emojis</div>
                            <div className="grid grid-cols-7 gap-0.5 max-h-44 overflow-y-auto custom-scrollbar">
                                {serverEmojis.map((e) => (
                                    <button key={e.id} type="button" title={`:${e.name}:`} onClick={() => pick(e.id)}
                                        className={`p-1.5 rounded flex items-center justify-center hover:bg-white/10 ${value === e.id ? 'bg-white/10' : ''}`}>
                                        <img src={e.url} alt={e.name} className="w-6 h-6 object-contain" />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {value && (
                        <button type="button" onClick={() => pick('')} className="mt-2 w-full text-left px-1 text-xs text-white/45 hover:text-red-400">
                            Kein Emoji
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ReactionRolesTab({ selectedServer, channels, serverRoles, serverEmojis, botNickname }) {
    const [list, setList] = useState([]);
    const [view, setView] = useState('list');
    const [editingId, setEditingId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    // Editor
    const [title, setTitle] = useState('');
    const [rrChannel, setRrChannel] = useState('');
    const [rrColor, setRrColor] = useState('#06b6d4');
    const [embedTitle, setEmbedTitle] = useState('');
    const [embedText, setEmbedText] = useState('');
    const [embedFooter, setEmbedFooter] = useState('');
    const [rrMode, setRrMode] = useState('multi');
    const [mappings, setMappings] = useState([emptyMapping()]);

    useEffect(() => { loadList(); }, [selectedServer]);

    const loadList = () => {
        fetch(`/api/discord/settings/${selectedServer.id}/reaction-roles`)
            .then(r => r.json()).then(d => setList(d || [])).catch(() => setList([]));
    };

    const openEditor = (rr = null) => {
        setSaveStatus('');
        if (rr) {
            setEditingId(rr.id); setTitle(rr.title || ''); setRrChannel(rr.channelId);
            setRrColor(rr.color || '#06b6d4'); setEmbedTitle(rr.embedTitle || '');
            setEmbedText(rr.messageText || ''); setEmbedFooter(rr.embedFooter || '');
            setRrMode(rr.mode === 'single' ? 'single' : 'multi');
            const mapped = Array.isArray(rr.roleMapping)
                ? rr.roleMapping.map(m => ({ emoji: m.emoji || '', label: m.label || '', style: Number(m.style) || 2, roleId: m.roleId }))
                : Object.entries(rr.roleMapping || {}).map(([emoji, roleId]) => ({ emoji, label: '', style: 2, roleId }));
            setMappings(mapped.length ? mapped : [emptyMapping()]);
        } else {
            setEditingId(null); setTitle(''); setRrChannel(''); setRrColor('#06b6d4');
            setEmbedTitle(''); setEmbedText(''); setEmbedFooter(''); setRrMode('multi');
            setMappings([emptyMapping()]);
        }
        setView('edit');
    };

    const handleSave = async () => {
        if (!rrChannel) return alert('Bitte wähle einen Kanal!');
        const valid = mappings.filter(m => (m.emoji.trim() || m.label.trim()) && m.roleId);
        if (!valid.length) return alert('Mindestens ein Button braucht Emoji oder Text und eine Rolle.');
        setIsSaving(true); setSaveStatus('');
        try {
            const url = editingId
                ? `/api/discord/settings/${selectedServer.id}/reaction-roles/${editingId}`
                : `/api/discord/settings/${selectedServer.id}/reaction-roles`;
            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId: rrChannel, messageText: embedText, mode: rrMode, roleMapping: valid, title, color: rrColor, embedTitle, embedFooter }),
            });
            if (res.ok) { setSaveStatus(editingId ? 'Aktualisiert!' : 'Erstellt!'); loadList(); setTimeout(() => setView('list'), 1200); }
            else setSaveStatus('Fehler. Hat der Bot Rechte?');
        } catch { setSaveStatus('Fehler.'); }
        finally { setIsSaving(false); setTimeout(() => setSaveStatus(''), 4000); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Wirklich löschen? Dies löscht auch die Discord-Nachricht!')) return;
        await fetch(`/api/discord/settings/${selectedServer.id}/reaction-roles/${id}`, { method: 'DELETE' });
        loadList();
    };

    const updateMapping = (i, patch) => setMappings(ms => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

    /* ── Liste ─────────────────────────────────────────────────────────── */
    if (view === 'list') return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">Rollen-Buttons</h2>
                <p>Mitglieder klicken auf Buttons und bekommen die Rolle — nur sie sehen die Antwort.</p>
            </div>
            <DcAddTile label="Neue Nachricht mit Buttons" onClick={() => openEditor()} large={list.length === 0}
                hint={list.length === 0 ? 'Noch keine Rollen-Buttons. Lege die erste Nachricht an.' : undefined} />
            {list.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {list.map(rr => {
                        const btns = Array.isArray(rr.roleMapping) ? rr.roleMapping : Object.entries(rr.roleMapping || {}).map(([e, r]) => ({ emoji: e, roleId: r, label: '', style: 2 }));
                        return (
                            <div key={rr.id} className="dc-card border-l-4 p-4 flex flex-col gap-3" style={{ borderLeftColor: rr.color || '#06b6d4' }}>
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-white font-bold truncate">{rr.title || 'Unbenannt'}</h3>
                                        <div className="text-xs text-white/40 mt-0.5">
                                            #{channels.find(c => c.id === rr.channelId)?.name || '?'} · {rr.mode === 'single' ? 'nur eine Rolle' : 'mehrere Rollen'} · {btns.length} Button{btns.length === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                    <button onClick={() => openEditor(rr)} title="Bearbeiten" aria-label="Bearbeiten"
                                        className="p-2 rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={15} /></button>
                                    <button onClick={() => handleDelete(rr.id)} title="Löschen" aria-label="Löschen"
                                        className="p-2 rounded text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={15} /></button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {btns.map((b, i) => {
                                        const role = serverRoles.find(r => r.id === b.roleId);
                                        return (
                                            <span key={i} title={role ? `Rolle: ${role.name}` : 'Rolle gelöscht'}
                                                className="dc-dbtn !h-7 !text-xs" style={{ background: buttonColor(b.style) }}>
                                                <ButtonEmoji emoji={b.emoji} serverEmojis={serverEmojis} size={14} />
                                                {b.label || role?.name || ''}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    /* ── Editor ────────────────────────────────────────────────────────── */
    const shownButtons = mappings.filter(m => m.emoji || m.label);
    return (
        <div className="dc-page" style={{ maxWidth: 1120 }}>
            <div className="flex items-center gap-2">
                <button onClick={() => setView('list')} title="Zurück zur Liste" aria-label="Zurück zur Liste"
                    className="p-2 -ml-2 rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors"><ArrowLeft size={18} /></button>
                <h2 className="dc-h2 !m-0">{editingId ? 'Rollen-Buttons bearbeiten' : 'Neue Rollen-Buttons'}</h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
                <div className="dc-card divide-y divide-white/[0.07]">
                    {/* Wohin */}
                    <section className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="dc-label" htmlFor="rr-channel">Kanal</label>
                            <select id="rr-channel" value={rrChannel} onChange={e => setRrChannel(e.target.value)} disabled={!!editingId}
                                className="dc-input w-full disabled:opacity-60">
                                <option value="">Kanal wählen …</option>
                                {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="dc-label" htmlFor="rr-title">Name in deiner Liste</label>
                            <input id="rr-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Spiele-Rollen"
                                className="dc-input w-full" />
                        </div>
                    </section>

                    {/* Nachricht */}
                    <section className="p-4 space-y-3">
                        <div className="flex items-end gap-2">
                            <div className="flex-1 min-w-0">
                                <label className="dc-label" htmlFor="rr-embed-title">Überschrift</label>
                                <input id="rr-embed-title" value={embedTitle} onChange={e => setEmbedTitle(e.target.value)} placeholder="Wähle deine Rollen!"
                                    className="dc-input w-full" />
                            </div>
                            <label title="Farbe des Rands" className="shrink-0 w-[38px] h-[38px] rounded-[5px] border border-white/10 cursor-pointer overflow-hidden relative" style={{ background: rrColor }}>
                                <span className="sr-only">Farbe</span>
                                <input type="color" value={rrColor} onChange={e => setRrColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                            </label>
                        </div>
                        <div>
                            <label className="dc-label" htmlFor="rr-text">Text</label>
                            <EmojiTextField id="rr-text" value={embedText} onChange={setEmbedText} rows={4}
                                emojis={serverEmojis} roles={serverRoles} channels={channels}
                                placeholder="Klicke auf einen Button, um dir eine Rolle zu holen." />
                        </div>
                        <div>
                            <label className="dc-label" htmlFor="rr-footer">Fußzeile <span className="font-normal text-white/35">(optional)</span></label>
                            <input id="rr-footer" value={embedFooter} onChange={e => setEmbedFooter(e.target.value)} placeholder="Erneut klicken entfernt die Rolle."
                                className="dc-input w-full" />
                        </div>
                    </section>

                    {/* Buttons */}
                    <section className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="dc-label !m-0">Buttons</span>
                            <div className="dc-seg" role="group" aria-label="Wie viele Rollen pro Mitglied">
                                <button type="button" className={rrMode === 'multi' ? 'is-active' : ''} onClick={() => setRrMode('multi')}>Mehrere Rollen</button>
                                <button type="button" className={rrMode === 'single' ? 'is-active' : ''} onClick={() => setRrMode('single')}>Nur eine Rolle</button>
                            </div>
                        </div>
                        <p className="text-[12px] text-white/40 -mt-1">
                            {rrMode === 'single'
                                ? 'Ein neuer Klick tauscht die alte Rolle aus diesen Buttons gegen die neue.'
                                : 'Mitglieder können beliebig viele Rollen nehmen; erneut klicken entfernt sie.'}
                        </p>

                        <div className="space-y-2">
                            {mappings.map((m, i) => {
                                const role = serverRoles.find(r => r.id === m.roleId);
                                return (
                                    <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                        <EmojiPick value={m.emoji} onChange={v => updateMapping(i, { emoji: v })} serverEmojis={serverEmojis} />
                                        <input value={m.label} onChange={e => updateMapping(i, { label: e.target.value })} placeholder="Button-Text"
                                            aria-label="Button-Text" className="dc-input flex-1 min-w-[8rem]" />
                                        <div className="relative w-full sm:w-48 shrink-0 order-last sm:order-none">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
                                                style={{ background: role ? roleColor(role.color) : 'rgba(255,255,255,0.2)' }} />
                                            <select value={m.roleId} onChange={e => updateMapping(i, { roleId: e.target.value })} aria-label="Rolle"
                                                className={`dc-input w-full !pl-7 ${m.roleId ? '' : 'text-white/45'}`}>
                                                <option value="">Rolle wählen …</option>
                                                {serverRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0" role="radiogroup" aria-label="Button-Farbe">
                                            {BUTTON_COLORS.map(c => (
                                                <button key={c.value} type="button" role="radio" aria-checked={Number(m.style) === c.value}
                                                    title={c.name} aria-label={c.name} onClick={() => updateMapping(i, { style: c.value })}
                                                    className={`w-5 h-5 rounded-[4px] transition-shadow ${Number(m.style) === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#15161f]' : 'opacity-70 hover:opacity-100'}`}
                                                    style={{ background: c.color }} />
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => setMappings(ms => ms.length > 1 ? ms.filter((_, j) => j !== i) : [emptyMapping()])}
                                            title="Button entfernen" aria-label="Button entfernen"
                                            className="shrink-0 p-2 rounded text-white/35 hover:text-red-400 hover:bg-red-500/10 transition-colors"><X size={15} /></button>
                                    </div>
                                );
                            })}
                        </div>
                        {mappings.length < 25 && (
                            <button type="button" onClick={() => setMappings(ms => [...ms, emptyMapping()])}
                                className="flex items-center gap-1.5 text-sm font-semibold text-[#aab1fa] hover:text-white transition-colors">
                                <Plus size={15} /> Button hinzufügen
                            </button>
                        )}
                    </section>
                </div>

                {/* Vorschau */}
                <div className="xl:sticky xl:top-0">
                    <span className="dc-label">Vorschau</span>
                    <div className="dc-preview">
                        <span className="dc-preview-avatar overflow-hidden">
                            {selectedServer.icon ? <img src={selectedServer.icon} alt="" className="w-full h-full object-cover" /> : <Bot size={20} />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="dc-preview-head">
                                <b>{botNickname || 'Bot'}</b>
                                <span className="dc-preview-app">APP</span>
                                <time>heute um 20:15 Uhr</time>
                            </div>
                            <div className="dc-embed" style={{ borderLeftColor: rrColor }}>
                                <div className="min-w-0 flex-1">
                                    {embedTitle && <div className="text-white font-bold text-[15px] mb-1">{embedTitle}</div>}
                                    {embedText.trim()
                                        ? <p className="dc-embed-text">{renderDiscordText(embedText, { roles: serverRoles, channels })}</p>
                                        : <p className="dc-embed-text !text-[#949ba4] italic">Noch kein Text</p>}
                                    {embedFooter && <div className="dc-embed-foot">{embedFooter}</div>}
                                </div>
                            </div>
                            {shownButtons.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {shownButtons.map((m, i) => (
                                        <span key={i} className="dc-dbtn" style={{ background: buttonColor(m.style) }}>
                                            <ButtonEmoji emoji={m.emoji} serverEmojis={serverEmojis} />
                                            {m.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="dc-savebar">
                <button onClick={handleSave} disabled={isSaving} className="dc-btn">
                    {isSaving ? 'Speichere…' : editingId ? 'Änderungen senden' : 'Nachricht erstellen'}
                </button>
                <button onClick={() => setView('list')} className="text-sm text-white/50 hover:text-white px-2 transition-colors">Abbrechen</button>
                {saveStatus && <span className={`text-sm font-medium ${saveStatus.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{saveStatus}</span>}
            </div>
        </div>
    );
}
