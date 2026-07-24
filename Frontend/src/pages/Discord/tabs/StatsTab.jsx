import React, { useState, useEffect, useCallback } from 'react';

const DAY_OPTIONS = [7, 14, 30, 90];

function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export default function StatsTab({ selectedServer }) {
    const [days, setDays] = useState(30);
    const [messageStats, setMessageStats] = useState([]);
    const [voiceStats, setVoiceStats] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadStats = useCallback(() => {
        if (!selectedServer) return;
        setLoading(true);
        fetch(`/api/discord/settings/${selectedServer.id}/stats?days=${days}`)
            .then(r => r.json())
            .then(data => {
                setMessageStats(data.messageStats || []);
                setVoiceStats(data.voiceStats || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [selectedServer, days]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const totalMessages = messageStats.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const totalVoiceSecs = voiceStats.reduce((s, r) => s + (r.totalSeconds || 0), 0);
    const topChannel = messageStats.length > 0 ? messageStats[0] : null;
    const topVoiceUser = voiceStats.length > 0 ? voiceStats[0] : null;

    const maxMessages = messageStats.length > 0 ? Math.max(...messageStats.map(r => r.total)) : 1;
    const maxVoice = voiceStats.length > 0 ? Math.max(...voiceStats.map(r => r.totalSeconds)) : 1;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl text-white font-bold mb-1">Server Statistiken</h2>
                    <p className="text-white/50 text-sm">Aktivitäts-Übersicht für den ausgewählten Zeitraum.</p>
                </div>
                <div className="flex gap-2">
                    {DAY_OPTIONS.map(d => (
                        <button key={d} onClick={() => setDays(d)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                days === d ? 'bg-violet-600 text-white' : 'bg-black/30 text-white/50 hover:text-white border border-white/5'
                            }`}>
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Nachrichten gesamt', value: totalMessages.toLocaleString('de'), icon: '💬' },
                    { label: 'Aktive Kanäle', value: messageStats.length, icon: '📢' },
                    { label: 'Voice-Zeit gesamt', value: formatDuration(totalVoiceSecs), icon: '🎙️' },
                    { label: 'Voice-Nutzer', value: voiceStats.length, icon: '👥' },
                ].map(card => (
                    <div key={card.label} className="bg-black/20 border border-white/5 rounded-lg p-5">
                        <div className="text-2xl mb-2">{card.icon}</div>
                        <div className="text-2xl font-bold text-white">{loading ? '–' : card.value}</div>
                        <div className="text-white/40 text-xs mt-1">{card.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Message stats by channel */}
                <div className="bg-black/20 border border-white/5 rounded-lg p-6">
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2">💬 Nachrichten nach Kanal</h3>
                    {loading ? (
                        <p className="text-white/40 text-sm">Lade...</p>
                    ) : messageStats.length === 0 ? (
                        <p className="text-white/40 text-sm">Keine Daten im gewählten Zeitraum.</p>
                    ) : (
                        <div className="space-y-3">
                            {messageStats.slice(0, 10).map(row => (
                                <div key={row.channelId} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60 truncate">#{row.channelName}</span>
                                        <span className="text-white/50 shrink-0 ml-2">{(row.total ?? 0).toLocaleString('de')}</span>
                                    </div>
                                    <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(row.total / maxMessages) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Voice activity by user */}
                <div className="bg-black/20 border border-white/5 rounded-lg p-6">
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2">🎙️ Voice-Zeit nach Nutzer</h3>
                    {loading ? (
                        <p className="text-white/40 text-sm">Lade...</p>
                    ) : voiceStats.length === 0 ? (
                        <p className="text-white/40 text-sm">Keine Daten im gewählten Zeitraum.</p>
                    ) : (
                        <div className="space-y-3">
                            {voiceStats.slice(0, 10).map(row => (
                                <div key={row.userId} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/60 truncate">{row.displayName}</span>
                                        <span className="text-white/50 shrink-0 ml-2">{formatDuration(row.totalSeconds)}</span>
                                    </div>
                                    <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                                        <div className="h-full bg-violet-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(row.totalSeconds / maxVoice) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!loading && (topChannel || topVoiceUser) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {topChannel && (
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-5">
                            <div className="text-violet-400 text-xs font-semibold uppercase tracking-wide mb-1">Aktivster Kanal</div>
                            <div className="text-white font-bold text-lg">#{topChannel.channelName}</div>
                            <div className="text-white/50 text-sm">{(topChannel.total ?? 0).toLocaleString('de')} Nachrichten</div>
                        </div>
                    )}
                    {topVoiceUser && (
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-5">
                            <div className="text-violet-400 text-xs font-semibold uppercase tracking-wide mb-1">Meiste Voice-Zeit</div>
                            <div className="text-white font-bold text-lg">{topVoiceUser.displayName}</div>
                            <div className="text-white/50 text-sm">{formatDuration(topVoiceUser.totalSeconds)}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

