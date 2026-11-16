import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DcTabs, DcSaveBar } from '../ui';
import { isErrorStatus, serverErrorText, useDiscordText } from '../discordI18n.js';

// Muss zu DEFAULTS in Backend/discord/loyalty/store.js passen
const DEFAULTS = {
    enabled: false, currency: 'Punkte', emoji: '🪙',
    perMessage: 2, messageCooldown: 60, perVoiceMinute: 1,
    dailyBase: 100, dailyStreakBonus: 20, startBalance: 100,
    minBet: 10, maxBet: 0, gameChannel: '',
};

// Das Wort, das der Server zum Zurücksetzen erwartet (Backend/discord/api/loyalty.js). Getippt wird das Wort der
// eigenen Sprache (loyalty.resetWord); geschickt wird immer dieses.
const RESET_CONFIRM = 'ZURÜCKSETZEN';

const fmt = (n, locale) => Math.round(Number(n) || 0).toLocaleString(locale);

function Toggle({ enabled, onToggle, label }) {
    return (
        <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={onToggle}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${enabled ? 'bg-indigo-500' : 'bg-[#2a2a32]'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

function NumberField({ label, value, onChange, hint, min = 0 }) {
    return (
        <div>
            <label className="dc-label">{label}</label>
            <input type="number" min={min} value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
                className="dc-input w-full tabular-nums" />
            {hint && <p className="text-white/40 text-xs mt-1.5">{hint}</p>}
        </div>
    );
}

export default function LoyaltyTab({ selectedServer, channels, onDirty }) {
    const t = useDiscordText();
    const tl = t.loyalty;
    const num = (n) => fmt(n, t.locale);
    const [view, setView] = useState('settings');
    const [cfg, setCfg] = useState(DEFAULTS);
    const [saved, setSaved] = useState(null);
    const [summary, setSummary] = useState({ users: 0, total: 0 });
    const [loadError, setLoadError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');

    const dirty = !!saved && JSON.stringify(cfg) !== JSON.stringify(saved);
    useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);

    const guildId = selectedServer?.id;
    useEffect(() => {
        if (!guildId) return;
        setLoadError('');
        fetch(`/api/discord/settings/${guildId}/loyalty`)
            .then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }))
            .then(({ ok, status, data }) => {
                if (!ok) {
                    setLoadError(status === 403 ? tl.adminNeeded : serverErrorText(t, data, tl.loadFailed));
                    return;
                }
                setCfg(data.config); setSaved(data.config); setSummary(data.summary || { users: 0, total: 0 });
            })
            .catch(() => setLoadError(t.common.networkError));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guildId]);

    const set = (key) => (value) => setCfg(c => ({ ...c, [key]: value }));

    const handleSave = async () => {
        setIsSaving(true); setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${guildId}/loyalty`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { setCfg(data.config); setSaved(data.config); setSaveStatus(t.common.saved); }
            else setSaveStatus(t.common.errorWith(serverErrorText(t, data, tl.saveFailed)));
        } catch {
            setSaveStatus(t.common.networkError);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    if (loadError) {
        return (
            <div className="dc-page">
                <div><h2 className="dc-h2">{tl.title}</h2></div>
                <p className="text-red-400 text-sm">{loadError}</p>
            </div>
        );
    }

    const daily7 = (Number(cfg.dailyBase) || 0) + (Number(cfg.dailyStreakBonus) || 0) * 6;

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">{tl.title}</h2>
                <p className="text-white/50 text-sm">{tl.intro}</p>
            </div>

            <DcTabs value={view} onChange={setView} tabs={[['settings', tl.tabs.settings], ['board', tl.tabs.board, summary.users || undefined], ['commands', tl.tabs.commands]]} />

            {view === 'settings' && (
                <>
                    <div className="dc-card p-5 flex items-center gap-4">
                        <div className="flex-1">
                            <div className="text-white font-semibold">{tl.system}</div>
                            <p className="text-white/45 text-sm">
                                {cfg.enabled ? tl.active(num(summary.users), num(summary.total), cfg.currency) : tl.off}
                            </p>
                        </div>
                        <Toggle enabled={cfg.enabled} onToggle={() => set('enabled')(!cfg.enabled)} label={tl.toggle} />
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>{tl.currencyTitle}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="dc-label">{tl.name}</label>
                                <input value={cfg.currency} maxLength={24} onChange={e => set('currency')(e.target.value)} className="dc-input w-full" placeholder={tl.currencyPh} />
                            </div>
                            <div>
                                <label className="dc-label">{tl.emoji}</label>
                                <input value={cfg.emoji} maxLength={64} onChange={e => set('emoji')(e.target.value)} className="dc-input w-full" placeholder={tl.emojiPh} />
                                <p className="text-white/40 text-xs mt-1.5">{tl.emojiHint}</p>
                            </div>
                        </div>
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>{tl.earn}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <NumberField label={tl.perMessage} value={cfg.perMessage} onChange={set('perMessage')} />
                            <NumberField label={tl.cooldown} value={cfg.messageCooldown} onChange={set('messageCooldown')} hint={tl.cooldownHint} />
                            <NumberField label={tl.perVoice} value={cfg.perVoiceMinute} onChange={set('perVoiceMinute')} hint={tl.perVoiceHint} />
                            <NumberField label={tl.daily} value={cfg.dailyBase} onChange={set('dailyBase')} />
                            <NumberField label={tl.streak} value={cfg.dailyStreakBonus} onChange={set('dailyStreakBonus')} hint={tl.streakHint(num(daily7))} />
                            <NumberField label={tl.start} value={cfg.startBalance} onChange={set('startBalance')} hint={tl.startHint} />
                        </div>
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>{tl.games}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <NumberField label={tl.minBet} value={cfg.minBet} min={1} onChange={set('minBet')} />
                            <NumberField label={tl.maxBet} value={cfg.maxBet} onChange={set('maxBet')} hint={tl.maxBetHint} />
                            <div>
                                <label className="dc-label">{tl.gameChannel}</label>
                                <select value={cfg.gameChannel} onChange={e => set('gameChannel')(e.target.value)} className="dc-input w-full">
                                    <option value="">{t.common.everywhere}</option>
                                    {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                                </select>
                                <p className="text-white/40 text-xs mt-1.5">{tl.gameChannelHint}</p>
                            </div>
                        </div>
                    </div>

                    <DcSaveBar onSave={handleSave} isSaving={isSaving} status={saveStatus} dirty={dirty} />
                </>
            )}

            {view === 'board' && <Leaderboard guildId={guildId} currency={cfg.currency} onSummary={setSummary} />}

            {view === 'commands' && (
                <div className="dc-card divide-y divide-white/10">
                    {tl.commands.map(([cmd, desc]) => (
                        <div key={cmd} className="px-5 py-3 flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6">
                            <span className="text-indigo-300 text-sm font-semibold md:w-64 shrink-0">{cmd}</span>
                            <span className="text-white/55 text-sm">{desc}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Rangliste mit Anpassen ─────────────────────────────────────────────── */

function Leaderboard({ guildId, currency, onSummary }) {
    const t = useDiscordText();
    const tl = t.loyalty;
    const num = (n) => fmt(n, t.locale);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState(null); // userId
    const [mode, setMode] = useState('add');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('');

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/discord/settings/${guildId}/loyalty/leaderboard?limit=100`)
            .then(r => r.json())
            .then(d => { setRows(d.rows || []); if (d.summary) onSummary(d.summary); })
            .catch(() => setStatus(tl.boardFailed))
            .finally(() => setLoading(false));
    }, [guildId, onSummary, tl]);
    useEffect(() => { load(); }, [load]);

    // Wer den Server verlassen hat, heißt in der eigenen Sprache „Ehemaliges Mitglied“ (der Server meldet former)
    const nameOf = useCallback((r) => (r.former ? t.common.formerMember : r.name), [t]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter(r => nameOf(r).toLowerCase().includes(q)) : rows;
    }, [rows, query, nameOf]);

    const apply = async (userId) => {
        const n = Number(amount);
        if (!Number.isFinite(n) || n < 0 || amount === '') { setStatus(tl.amountMissing); return; }
        const res = await fetch(`/api/discord/settings/${guildId}/loyalty/adjust`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode, amount: n }),
        }).catch(() => null);
        if (!res?.ok) { setStatus(tl.adjustFailed); return; }
        setEditing(null); setAmount(''); setStatus(tl.adjusted);
        setTimeout(() => setStatus(''), 2500);
        load();
    };

    const reset = async () => {
        const typed = window.prompt(tl.resetPrompt(tl.resetWord));
        if (typed?.trim() !== tl.resetWord) return;
        const res = await fetch(`/api/discord/settings/${guildId}/loyalty/reset`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: RESET_CONFIRM }),
        }).catch(() => null);
        setStatus(res?.ok ? tl.resetDone : tl.resetFailed);
        load();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={tl.search} aria-label={tl.search} className="dc-input w-full sm:w-64" />
                {status && <span className={`text-sm ${isErrorStatus(status) ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
            </div>

            <div className="dc-card overflow-hidden">
                {loading && !rows.length && <p className="p-5 text-white/40 text-sm">{t.common.loading}</p>}
                {!loading && !rows.length && <p className="p-5 text-white/40 text-sm">{tl.empty(currency)}</p>}
                <div className="divide-y divide-white/10">
                    {shown.map(r => (
                        <div key={r.userId} className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                                <span className="w-8 text-right text-white/40 text-sm tabular-nums">#{r.rank}</span>
                                {r.avatar
                                    ? <img src={r.avatar} alt="" className="w-8 h-8 rounded-full" />
                                    : <span className="w-8 h-8 rounded-full bg-white/10" />}
                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-semibold truncate ${r.former ? 'text-white/50 italic' : 'text-white'}`}>{nameOf(r)}</div>
                                    <div className="text-white/40 text-xs tabular-nums">
                                        {tl.rowStats(r, num)}
                                    </div>
                                </div>
                                <span className="text-white font-bold tabular-nums">{num(r.points)}</span>
                                <button type="button" onClick={() => { setEditing(editing === r.userId ? null : r.userId); setAmount(''); setMode('add'); }}
                                    aria-expanded={editing === r.userId}
                                    className="text-xs text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-md px-2.5 py-1 transition-colors">
                                    {tl.adjust}
                                </button>
                            </div>
                            {editing === r.userId && (
                                <div className="mt-2.5 ml-11 flex flex-wrap items-center gap-2">
                                    <div className="dc-seg">
                                        {['add', 'remove', 'set'].map((id) => (
                                            <button key={id} type="button" className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{tl.modes[id]}</button>
                                        ))}
                                    </div>
                                    <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder={tl.amount} aria-label={tl.amount}
                                        className="dc-input w-32 tabular-nums" onKeyDown={e => { if (e.key === 'Enter') apply(r.userId); }} autoFocus />
                                    <button type="button" className="dc-btn" onClick={() => apply(r.userId)}>{tl.apply}</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <details className="dc-help">
                <summary>{tl.resetTitle}</summary>
                <div className="flex flex-wrap items-center gap-4">
                    <p className="text-white/50 text-sm flex-1">{tl.resetText}</p>
                    <button type="button" onClick={reset}
                        className="text-sm font-semibold text-red-300 border border-red-500/40 hover:bg-red-500/10 rounded-md px-3 py-2 transition-colors">
                        {tl.resetButton}
                    </button>
                </div>
            </details>
        </div>
    );
}
