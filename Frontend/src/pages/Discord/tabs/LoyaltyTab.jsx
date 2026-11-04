import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DcTabs, DcSaveBar } from '../ui';

// Muss zu DEFAULTS in Backend/discord/loyalty/store.js passen
const DEFAULTS = {
    enabled: false, currency: 'Punkte', emoji: '🪙',
    perMessage: 2, messageCooldown: 60, perVoiceMinute: 1,
    dailyBase: 100, dailyStreakBonus: 20, startBalance: 100,
    minBet: 10, maxBet: 0, gameChannel: '',
};

const COMMANDS = [
    ['/punkte [user]', 'Kontostand, Platz, Siege, größter Gewinn, Voice-Zeit'],
    ['/daily', 'Tagesbonus — jeder Tag in Folge gibt mehr (bis 7 Tage)'],
    ['/rangliste [seite]', 'Die reichsten Mitglieder, 10 pro Seite'],
    ['/geben @user betrag', 'Punkte verschenken'],
    ['/gamble einsatz', 'Glücksrad: Grün verdoppelt (48 %), Rot ist weg (50 %), Gold ist Jackpot x5 (2 %)'],
    ['/rakete einsatz [auto]', 'Crash-Spiel für alle im Kanal: rechtzeitig „Aussteigen“ drücken, optional automatisch bei einem Ziel'],
    ['/duell @gegner einsatz', 'Münzwurf um den doppelten Einsatz, der Gegner muss annehmen'],
    ['/punkteadmin geben|nehmen|setzen', 'Punkte anpassen (nur mit „Server verwalten“)'],
];

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('de-DE');

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
                    setLoadError(status === 403 ? 'Fehler: Du brauchst Administrator-Rechte auf diesem Server.' : (data.error || 'Fehler beim Laden.'));
                    return;
                }
                setCfg(data.config); setSaved(data.config); setSummary(data.summary || { users: 0, total: 0 });
            })
            .catch(() => setLoadError('Fehler: keine Verbindung zum Server.'));
    }, [guildId]);

    const set = (key) => (value) => setCfg(c => ({ ...c, [key]: value }));

    const handleSave = async () => {
        setIsSaving(true); setSaveStatus('');
        try {
            const res = await fetch(`/api/discord/settings/${guildId}/loyalty`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) { setCfg(data.config); setSaved(data.config); setSaveStatus('Gespeichert!'); }
            else setSaveStatus(`Fehler: ${data.error || 'Speichern fehlgeschlagen.'}`);
        } catch {
            setSaveStatus('Fehler: keine Verbindung zum Server.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    if (loadError) {
        return (
            <div className="dc-page">
                <div><h2 className="dc-h2">Punkte</h2></div>
                <p className="text-red-400 text-sm">{loadError}</p>
            </div>
        );
    }

    const daily7 = (Number(cfg.dailyBase) || 0) + (Number(cfg.dailyStreakBonus) || 0) * 6;

    return (
        <div className="dc-page">
            <div>
                <h2 className="dc-h2">Punkte</h2>
                <p className="text-white/50 text-sm">Mitglieder sammeln Punkte fürs Schreiben, für Voice-Zeit und mit /daily — und setzen sie beim Glücksrad, in der Rakete oder im Duell.</p>
            </div>

            <DcTabs value={view} onChange={setView} tabs={[['settings', 'Einstellungen'], ['board', 'Rangliste', summary.users || undefined], ['commands', 'Befehle']]} />

            {view === 'settings' && (
                <>
                    <div className="dc-card p-5 flex items-center gap-4">
                        <div className="flex-1">
                            <div className="text-white font-semibold">Punkte-System</div>
                            <p className="text-white/45 text-sm">
                                {cfg.enabled
                                    ? `Aktiv — ${fmt(summary.users)} Mitglieder haben zusammen ${fmt(summary.total)} ${cfg.currency}.`
                                    : 'Aus — die Befehle antworten mit einem Hinweis, und niemand sammelt Punkte.'}
                            </p>
                        </div>
                        <Toggle enabled={cfg.enabled} onToggle={() => set('enabled')(!cfg.enabled)} label="Punkte-System an oder aus" />
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>Währung</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="dc-label">Name</label>
                                <input value={cfg.currency} maxLength={24} onChange={e => set('currency')(e.target.value)} className="dc-input w-full" placeholder="Punkte" />
                            </div>
                            <div>
                                <label className="dc-label">Emoji (optional)</label>
                                <input value={cfg.emoji} maxLength={64} onChange={e => set('emoji')(e.target.value)} className="dc-input w-full" placeholder="🪙 oder <:name:id>" />
                                <p className="text-white/40 text-xs mt-1.5">Eigene Server-Emojis als &lt;:name:id&gt; — in Discord mit \:emoji: kopieren.</p>
                            </div>
                        </div>
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>Verdienen</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <NumberField label="Pro Nachricht" value={cfg.perMessage} onChange={set('perMessage')} />
                            <NumberField label="Höchstens alle … Sekunden" value={cfg.messageCooldown} onChange={set('messageCooldown')} hint="Gegen Spam: schnell hintereinander zählt nur eine." />
                            <NumberField label="Pro Minute im Voice" value={cfg.perVoiceMinute} onChange={set('perVoiceMinute')} hint="Nur mit mindestens einer weiteren Person, nicht taub, nicht im AFK-Kanal." />
                            <NumberField label="Tagesbonus (/daily)" value={cfg.dailyBase} onChange={set('dailyBase')} />
                            <NumberField label="Bonus je Tag in Folge" value={cfg.dailyStreakBonus} onChange={set('dailyStreakBonus')} hint={`Am 7. Tag in Folge gibt es ${fmt(daily7)}.`} />
                            <NumberField label="Startguthaben" value={cfg.startBalance} onChange={set('startBalance')} hint="Bekommt jeder beim ersten Mal." />
                        </div>
                    </div>

                    <div className="dc-card p-5 space-y-4">
                        <h3>Spiele</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <NumberField label="Mindesteinsatz" value={cfg.minBet} min={1} onChange={set('minBet')} />
                            <NumberField label="Höchsteinsatz" value={cfg.maxBet} onChange={set('maxBet')} hint="0 = ohne Grenze" />
                            <div>
                                <label className="dc-label">Spiele-Kanal</label>
                                <select value={cfg.gameChannel} onChange={e => set('gameChannel')(e.target.value)} className="dc-input w-full">
                                    <option value="">-- Überall erlaubt --</option>
                                    {channels.map(c => <option key={c.id} value={c.id}># {c.name}</option>)}
                                </select>
                                <p className="text-white/40 text-xs mt-1.5">Gilt für /daily, /gamble, /rakete und /duell. /punkte und /rangliste gehen überall.</p>
                            </div>
                        </div>
                    </div>

                    <DcSaveBar onSave={handleSave} isSaving={isSaving} status={saveStatus} dirty={dirty} />
                </>
            )}

            {view === 'board' && <Leaderboard guildId={guildId} currency={cfg.currency} onSummary={setSummary} />}

            {view === 'commands' && (
                <div className="dc-card divide-y divide-white/10">
                    {COMMANDS.map(([cmd, desc]) => (
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
            .catch(() => setStatus('Fehler: Rangliste konnte nicht geladen werden.'))
            .finally(() => setLoading(false));
    }, [guildId, onSummary]);
    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
    }, [rows, query]);

    const apply = async (userId) => {
        const n = Number(amount);
        if (!Number.isFinite(n) || n < 0 || amount === '') { setStatus('Fehler: Betrag fehlt.'); return; }
        const res = await fetch(`/api/discord/settings/${guildId}/loyalty/adjust`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode, amount: n }),
        }).catch(() => null);
        if (!res?.ok) { setStatus('Fehler: Anpassen fehlgeschlagen.'); return; }
        setEditing(null); setAmount(''); setStatus('Angepasst.');
        setTimeout(() => setStatus(''), 2500);
        load();
    };

    const reset = async () => {
        const typed = window.prompt('Alle Kontostände dieses Servers werden gelöscht. Das lässt sich nicht rückgängig machen.\n\nZum Bestätigen ZURÜCKSETZEN eintippen:');
        if (typed !== 'ZURÜCKSETZEN') return;
        const res = await fetch(`/api/discord/settings/${guildId}/loyalty/reset`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed }),
        }).catch(() => null);
        setStatus(res?.ok ? 'Alle Kontostände gelöscht.' : 'Fehler: Zurücksetzen fehlgeschlagen.');
        load();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Mitglied suchen" className="dc-input w-full sm:w-64" />
                {status && <span className={`text-sm ${status.startsWith('Fehler') ? 'text-red-400' : 'text-green-400'}`}>{status}</span>}
            </div>

            <div className="dc-card overflow-hidden">
                {loading && !rows.length && <p className="p-5 text-white/40 text-sm">Lade …</p>}
                {!loading && !rows.length && <p className="p-5 text-white/40 text-sm">Noch hat niemand {currency}. Sobald jemand schreibt, im Voice ist oder /daily nutzt, taucht er hier auf.</p>}
                <div className="divide-y divide-white/10">
                    {shown.map(r => (
                        <div key={r.userId} className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                                <span className="w-8 text-right text-white/40 text-sm tabular-nums">#{r.rank}</span>
                                {r.avatar
                                    ? <img src={r.avatar} alt="" className="w-8 h-8 rounded-full" />
                                    : <span className="w-8 h-8 rounded-full bg-white/10" />}
                                <div className="flex-1 min-w-0">
                                    <div className="text-white text-sm font-semibold truncate">{r.name}</div>
                                    <div className="text-white/40 text-xs tabular-nums">
                                        {r.wins} Siege · {r.losses} Niederlagen · {r.voiceMinutes} Min Voice · {fmt(r.messages)} Nachrichten
                                    </div>
                                </div>
                                <span className="text-white font-bold tabular-nums">{fmt(r.points)}</span>
                                <button type="button" onClick={() => { setEditing(editing === r.userId ? null : r.userId); setAmount(''); setMode('add'); }}
                                    className="text-xs text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-md px-2.5 py-1 transition-colors">
                                    Anpassen
                                </button>
                            </div>
                            {editing === r.userId && (
                                <div className="mt-2.5 ml-11 flex flex-wrap items-center gap-2">
                                    <div className="dc-seg">
                                        {[['add', 'Geben'], ['remove', 'Nehmen'], ['set', 'Setzen']].map(([id, label]) => (
                                            <button key={id} type="button" className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{label}</button>
                                        ))}
                                    </div>
                                    <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Betrag"
                                        className="dc-input w-32 tabular-nums" onKeyDown={e => { if (e.key === 'Enter') apply(r.userId); }} autoFocus />
                                    <button type="button" className="dc-btn" onClick={() => apply(r.userId)}>Anwenden</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <details className="dc-help">
                <summary>Alle Kontostände zurücksetzen</summary>
                <div className="flex flex-wrap items-center gap-4">
                    <p className="text-white/50 text-sm flex-1">Löscht alle Punkte, Serien und Statistiken auf diesem Server. Einstellungen bleiben.</p>
                    <button type="button" onClick={reset}
                        className="text-sm font-semibold text-red-300 border border-red-500/40 hover:bg-red-500/10 rounded-md px-3 py-2 transition-colors">
                        Zurücksetzen
                    </button>
                </div>
            </details>
        </div>
    );
}
