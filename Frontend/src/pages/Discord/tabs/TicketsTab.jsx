import React, { useState, useEffect } from 'react';
import { Trash2, Plus, ChevronUp, ChevronDown, X, ChevronRight } from 'lucide-react';
import { DcTabs } from '../ui';

function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Accordion({ title, subtitle, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-white/5 rounded-md overflow-hidden">
            <button onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 bg-[#0e0e1a]/85 hover:bg-white/5 transition-colors text-left">
                <div>
                    <p className="text-white font-semibold text-sm">{title}</p>
                    {subtitle && <p className="text-white/40 text-xs mt-0.5">{subtitle}</p>}
                </div>
                <ChevronDown size={16} className={`text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="dc-inset p-5 pt-4 space-y-4">{children}</div>}
        </div>
    );
}

export default function TicketsTab({ selectedServer, channels, serverRoles }) {
    const [setupChannelId, setSetupChannelId] = useState('');
    const [embedTitle, setEmbedTitle] = useState('Support Ticket');
    const [embedDescription, setEmbedDescription] = useState('Klicke auf den Button um ein Ticket zu erstellen.');
    const [embedColor, setEmbedColor] = useState('#5865F2');
    const [categoryId, setCategoryId] = useState('');
    const [handlerRoleIds, setHandlerRoleIds] = useState([]);
    const [categories, setCategories] = useState([]);
    const [hasConfig, setHasConfig] = useState(false);
    const [fields, setFields] = useState([
        { label: 'Name', placeholder: 'Dein Name...', required: true, style: 1 },
        { label: 'Problembeschreibung', placeholder: 'Beschreibe dein Problem...', required: true, style: 2 },
    ]);
    const [history, setHistory] = useState([]);
    const [historyDays, setHistoryDays] = useState(7);
    const [expandedTicket, setExpandedTicket] = useState(null);
    // Einrichtung und Verlauf sind zwei Reiter — vorher lag die Einrichtung hinter
    // einem Knopf und der Verlauf stand immer darunter
    const [view, setView] = useState('setup');
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [isSavingFields, setIsSavingFields] = useState(false);
    const [configStatus, setConfigStatus] = useState('');
    const [fieldsStatus, setFieldsStatus] = useState('');

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/guilds/${selectedServer.id}/channels?type=4`)
            .then(r => r.json()).then(d => setCategories(d.channels || []));
        fetch(`/api/discord/settings/${selectedServer.id}/ticket-config`)
            .then(r => r.json())
            .then(d => {
                if (d.config) {
                    setSetupChannelId(d.config.setupChannelId || '');
                    setEmbedTitle(d.config.embedTitle || 'Support Ticket');
                    setEmbedDescription(d.config.embedDescription || '');
                    setEmbedColor(d.config.embedColor || '#5865F2');
                    setCategoryId(d.config.categoryId || '');
                    setHandlerRoleIds(d.config.handlerRoleIds || []);
                    setHasConfig(true);
                    // Ist das System eingerichtet, will man meist den Verlauf sehen
                    setView('history');
                } else {
                    setView('setup');
                }
                if (d.fields?.length > 0) setFields(d.fields);
            });
    }, [selectedServer]);

    useEffect(() => {
        if (!selectedServer) return;
        fetch(`/api/discord/settings/${selectedServer.id}/ticket-history?days=${historyDays}`)
            .then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : []));
    }, [selectedServer, historyDays]);

    const handleSaveConfig = async () => {
        if (!setupChannelId) return;
        setIsSavingConfig(true); setConfigStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/ticket-config`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setupChannelId, embedTitle, embedDescription, embedColor, categoryId: categoryId || null, handlerRoleIds }),
            });
            const data = await res.json();
            if (res.ok) { setHasConfig(true); setConfigStatus('Gespeichert & Nachricht gesendet!'); }
            else setConfigStatus(`Fehler: ${data.error}`);
        } catch { setConfigStatus('Netzwerkfehler.'); }
        finally { setIsSavingConfig(false); setTimeout(() => setConfigStatus(''), 4000); }
    };

    const handleDeleteConfig = async () => {
        await fetch(`/api/discord/settings/${selectedServer.id}/ticket-config`, { method: 'DELETE' });
        setHasConfig(false); setSetupChannelId('');
        setConfigStatus('Setup entfernt.'); setView('setup');
        setTimeout(() => setConfigStatus(''), 3000);
    };

    const handleSaveFields = async () => {
        if (fields.some(f => !f.label.trim())) return;
        setIsSavingFields(true); setFieldsStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${selectedServer.id}/ticket-fields`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
            });
            const data = await res.json();
            setFieldsStatus(res.ok ? 'Felder gespeichert!' : `Fehler: ${data.error}`);
        } catch { setFieldsStatus('Netzwerkfehler.'); }
        finally { setIsSavingFields(false); setTimeout(() => setFieldsStatus(''), 3000); }
    };

    const addField = () => { if (fields.length < 5) setFields(p => [...p, { label: '', placeholder: '', required: false, style: 1 }]); };
    const removeField = i => setFields(p => p.filter((_, idx) => idx !== i));
    const moveField = (i, dir) => {
        const next = [...fields]; const swap = i + dir;
        if (swap < 0 || swap >= next.length) return;
        [next[i], next[swap]] = [next[swap], next[i]]; setFields(next);
    };
    const updateField = (i, key, val) => setFields(p => p.map((f, idx) => idx === i ? { ...f, [key]: val } : f));
    const toggleHandlerRole = id => setHandlerRoleIds(p => p.includes(id) ? p.filter(r => r !== id) : [...p, id]);

    const statusBadge = s => ({
        open:    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-md font-medium">Offen</span>,
        closed:  <span className="text-xs bg-gray-500/20 text-white/50 px-2 py-0.5 rounded-md font-medium">Geschlossen</span>,
        deleted: <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-md font-medium">Gelöscht</span>,
    }[s] || null);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="dc-h2">Ticket-System</h2>
                <p>Nutzer erstellen Tickets per Button — der Bot öffnet automatisch einen privaten Kanal.</p>
            </div>

            <DcTabs value={view} onChange={setView} tabs={[
                ['setup', 'Einrichtung'],
                ['history', 'Verlauf', history.length || undefined],
            ]} />

            {/* Einstellungen (aufklappbar) */}
            {view === 'setup' && (
                <div className="space-y-3 max-w-2xl">
                    <Accordion
                        title="Nachricht & Einrichtung"
                        subtitle="Wo der Bot die Setup-Nachricht sendet und wie sie aussieht"
                        defaultOpen={!hasConfig}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="dc-label">Kanal für Setup-Nachricht <span className="text-red-400">*</span></label>
                                <select value={setupChannelId} onChange={e => setSetupChannelId(e.target.value)}
                                    className="dc-input w-full">
                                    <option value="">-- Kanal auswählen --</option>
                                    {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="dc-label">Kategorie für Ticket-Kanäle <span className="text-white/40 font-normal">(optional)</span></label>
                                <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                                    className="dc-input w-full">
                                    <option value="">-- Keine Kategorie --</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="dc-label">Embed-Titel</label>
                                <input value={embedTitle} onChange={e => setEmbedTitle(e.target.value)}
                                    className="dc-input w-full" />
                            </div>
                            <div>
                                <label className="dc-label">Farbe</label>
                                <div className="flex gap-2">
                                    <input type="color" value={embedColor} onChange={e => setEmbedColor(e.target.value)}
                                        className="dc-card h-[46px] w-14 cursor-pointer p-1 shrink-0" />
                                    <input value={embedColor} onChange={e => setEmbedColor(e.target.value)}
                                        className="dc-input flex-1" />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="dc-label">Embed-Beschreibung</label>
                            <textarea value={embedDescription} onChange={e => setEmbedDescription(e.target.value)} rows={3}
                                className="dc-input w-full resize-none" />
                        </div>

                        <div>
                            <label className="dc-label">Bearbeiter-Rollen <span className="text-white/40 font-normal">(sehen alle Ticket-Kanäle)</span></label>
                            <div className="flex flex-wrap gap-2">
                                {serverRoles.map(r => (
                                    <button key={r.id} onClick={() => toggleHandlerRole(r.id)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                                            handlerRoleIds.includes(r.id)
                                                ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300'
                                                : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                                        }`}>
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color || '#ffffff' }} />
                                        @{r.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                            <button onClick={handleSaveConfig} disabled={isSavingConfig || !setupChannelId}
                                className="dc-btn">
                                {isSavingConfig ? 'Sende...' : hasConfig ? 'Aktualisieren & neu senden' : 'Setup senden'}
                            </button>
                            {hasConfig && (
                                <button onClick={handleDeleteConfig}
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-2.5 px-5 rounded-md transition-colors">
                                    Entfernen
                                </button>
                            )}
                            {configStatus && <span className="text-sm font-medium text-white">{configStatus}</span>}
                        </div>
                    </Accordion>

                    <Accordion
                        title="Modal-Felder"
                        subtitle="Was der User beim Erstellen eines Tickets ausfüllt (max. 5 Felder)">
                        <div className="space-y-3">
                            {fields.map((f, i) => (
                                <div key={i} className="dc-card p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white/40 text-xs">Feld {i + 1}</span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => moveField(i, -1)} disabled={i === 0} className="p-1 text-white/40 hover:text-white disabled:opacity-30"><ChevronUp size={13} /></button>
                                            <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} className="p-1 text-white/40 hover:text-white disabled:opacity-30"><ChevronDown size={13} /></button>
                                            <button onClick={() => removeField(i)} className="p-1 text-red-400 hover:text-red-300 ml-1"><X size={13} /></button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-white/50 text-xs mb-1">Label <span className="text-red-400">*</span></label>
                                            <input value={f.label} onChange={e => updateField(i, 'label', e.target.value)} placeholder="z.B. Name"
                                                className="dc-input w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-white/50 text-xs mb-1">Platzhalter</label>
                                            <input value={f.placeholder} onChange={e => updateField(i, 'placeholder', e.target.value)} placeholder="z.B. Dein Name..."
                                                className="dc-input w-full" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={f.required} onChange={e => updateField(i, 'required', e.target.checked)} className="rounded accent-indigo-500" />
                                            <span className="text-white/60 text-sm">Pflichtfeld</span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white/40 text-xs">Typ:</span>
                                            <button onClick={() => updateField(i, 'style', 1)}
                                                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${f.style === 1 ? 'bg-indigo-600 text-white font-bold' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>Kurz</button>
                                            <button onClick={() => updateField(i, 'style', 2)}
                                                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${f.style === 2 ? 'bg-indigo-600 text-white font-bold' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>Absatz</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button onClick={addField} disabled={fields.length >= 5}
                                className="flex items-center gap-1.5 text-sm bg-white/5 hover:bg-white/10 text-white/60 px-4 py-2 rounded-md transition-colors disabled:opacity-40 w-full justify-center">
                                <Plus size={14} /> Feld hinzufügen {fields.length < 5 && `(${5 - fields.length} verbleibend)`}
                            </button>
                        </div>
                        <div className="flex items-center gap-3 pt-1">
                            <button onClick={handleSaveFields} disabled={isSavingFields || fields.some(f => !f.label.trim())}
                                className="dc-btn">
                                {isSavingFields ? 'Speichere...' : 'Felder speichern'}
                            </button>
                            {fieldsStatus && <span className="text-sm font-medium text-white">{fieldsStatus}</span>}
                        </div>
                    </Accordion>
                </div>
            )}

            {/* Ticket-Verlauf */}
            {view === 'history' && (
            <div className="dc-card p-6 space-y-4 max-w-4xl">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h3 className="text-white font-semibold">Ticket-Verlauf</h3>
                        <p className="text-white/40 text-xs mt-0.5">{history.length} Ticket{history.length !== 1 ? 's' : ''} in den letzten {historyDays} Tagen</p>
                    </div>
                    <div className="flex gap-2">
                        {[7, 14, 30].map(d => (
                            <button key={d} onClick={() => setHistoryDays(d)}
                                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${historyDays === d ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                                {d} Tage
                            </button>
                        ))}
                    </div>
                </div>

                {history.length === 0 ? (
                    <div className="py-8 text-center text-white/30 text-sm">
                        Keine Tickets in diesem Zeitraum.
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {history.map(t => (
                            <div key={t.id} className="border border-white/5 rounded-md overflow-hidden">
                                <button onClick={() => setExpandedTicket(expandedTicket === t.id ? null : t.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left">
                                    <ChevronRight size={14} className={`text-white/30 shrink-0 transition-transform duration-150 ${expandedTicket === t.id ? 'rotate-90' : ''}`} />
                                    <span className="text-white/30 text-xs w-8 shrink-0">#{t.id}</span>
                                    <span className="text-white text-sm font-medium flex-1 truncate">{t.creatorName || t.creatorId}</span>
                                    {statusBadge(t.status)}
                                    <span className="text-white/30 text-xs shrink-0 hidden sm:block">{formatDate(t.createdAt)}</span>
                                </button>
                                {expandedTicket === t.id && (
                                    <div className="dc-inset border-t px-4 py-3 space-y-2.5">
                                        <div className="flex flex-wrap gap-4 text-xs text-white/40 mb-2">
                                            <span>Erstellt: {formatDate(t.createdAt)}</span>
                                            {t.closedAt && <span>Geschlossen: {formatDate(t.closedAt)}</span>}
                                        </div>
                                        {Object.entries(t.fieldData).map(([label, value]) => (
                                            <div key={label}>
                                                <p className="text-white/40 text-xs mb-0.5">{label}</p>
                                                <p className="text-white text-sm">{value || '—'}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}
        </div>
    );
}
