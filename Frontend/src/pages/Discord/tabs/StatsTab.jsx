import React, { useState, useEffect, useCallback } from 'react';
import { DcTabs } from '../ui';
import { useDiscordText } from '../discordI18n.js';

const DAY_OPTIONS = [7, 14, 30, 90];

function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const count = (n, locale) => (Number(n) || 0).toLocaleString(locale);

/** Rangliste mit Balken. rows: [{ key, name, value, text, muted }] */
function Ranking({ rows, loading, empty }) {
    const t = useDiscordText();
    if (loading) return <p className="text-white/40 text-sm">{t.common.loading}</p>;
    if (!rows.length) return <p className="text-white/40 text-sm">{empty}</p>;
    const max = Math.max(...rows.map(r => r.value), 1);
    return (
        <ol className="space-y-2.5">
            {rows.map((row, i) => (
                <li key={row.key}>
                    <div className="flex items-baseline gap-2.5 text-sm">
                        <span className="w-5 shrink-0 text-white/35 tabular-nums">{i + 1}</span>
                        <span className={`flex-1 min-w-0 truncate ${row.muted ? 'text-white/40 italic' : 'text-white/80'}`}>{row.name}</span>
                        <span className="shrink-0 text-white/55 tabular-nums">{row.text}</span>
                    </div>
                    <div className="dc-inset h-1.5 overflow-hidden mt-1 ml-[30px]">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(row.value / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ol>
    );
}

export default function StatsTab({ selectedServer }) {
    const t = useDiscordText();
    const num = (n) => count(n, t.locale);
    // Wer den Server verlassen hat, heißt in der eigenen Sprache „Ehemaliges Mitglied“ (der Server meldet former)
    const memberName = (r) => (r.former ? t.common.formerMember : r.displayName);
    const [days, setDays] = useState(30);
    const [view, setView] = useState('chat');
    const [data, setData] = useState({ messageStats: [], voiceStats: [], userMessageStats: [], totals: null });
    const [loading, setLoading] = useState(false);

    const loadStats = useCallback(() => {
        if (!selectedServer) return;
        setLoading(true);
        fetch(`/api/discord/settings/${selectedServer.id}/stats?days=${days}`)
            .then(r => r.json())
            .then(d => setData({
                messageStats: d.messageStats || [],
                voiceStats: d.voiceStats || [],
                userMessageStats: d.userMessageStats || [],
                totals: d.totals || null,
            }))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [selectedServer, days]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const { messageStats, voiceStats, userMessageStats, totals } = data;
    const totalMessages = totals ? totals.messages : messageStats.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const totalVoiceSecs = voiceStats.reduce((s, r) => s + (r.totalSeconds || 0), 0);

    const cards = [
        { key: 'messages', value: num(totalMessages) },
        { key: 'chatters', value: totals ? num(totals.chatters) : '–' },
        { key: 'voiceTime', value: formatDuration(totalVoiceSecs) },
        { key: 'voiceUsers', value: voiceStats.length },
    ];

    return (
        <div className="dc-page">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="dc-h2">{t.stats.title}</h2>
                    <p>{t.stats.intro}</p>
                </div>
                <div className="dc-seg" role="group" aria-label={t.stats.period}>
                    {DAY_OPTIONS.map(d => (
                        <button key={d} type="button" onClick={() => setDays(d)} className={days === d ? 'is-active' : ''}>
                            {t.common.days(d)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cards.map(card => (
                    <div key={card.key} className="dc-card p-4">
                        <div className="text-white/45 text-xs font-semibold">{t.stats.cards[card.key]}</div>
                        <div className="text-2xl font-bold text-white tabular-nums mt-1.5">{loading ? '–' : card.value}</div>
                    </div>
                ))}
            </div>

            <div className="dc-card">
                <div className="px-4">
                    <DcTabs value={view} onChange={setView} tabs={[
                        ['chat', t.stats.views.chat],
                        ['channels', t.stats.views.channels],
                        ['voice', t.stats.views.voice],
                    ]} />
                </div>
                <div className="p-4">
                    {view === 'chat' && (
                        <>
                            <Ranking loading={loading}
                                empty={t.stats.emptyChat}
                                rows={userMessageStats.map(r => ({ key: r.userId, name: memberName(r), value: r.total, text: num(r.total), muted: !!r.former }))} />
                            <p className="text-[11.5px] text-white/35 mt-4">
                                {t.stats.chatNote}
                            </p>
                        </>
                    )}
                    {view === 'channels' && (
                        <Ranking loading={loading}
                            empty={t.stats.emptyPeriod}
                            rows={messageStats.map(r => ({ key: r.channelId, name: r.deleted ? t.stats.deletedChannels : `#${r.channelName}`, value: r.total, text: num(r.total), muted: r.deleted }))} />
                    )}
                    {view === 'voice' && (
                        <Ranking loading={loading}
                            empty={t.stats.emptyPeriod}
                            rows={voiceStats.map(r => ({ key: r.userId, name: memberName(r), value: r.totalSeconds, text: formatDuration(r.totalSeconds), muted: !!r.former }))} />
                    )}
                </div>
            </div>
        </div>
    );
}
