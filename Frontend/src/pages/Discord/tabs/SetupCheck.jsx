// SetupCheck.jsx — oben im Bereich „Allgemein“: Einrichtungs-Check und erste Schritte (Ausbauplan „discord-verzeichnis“).
//
// Seit die Einladung nicht mehr „Administrator“ verlangt, kann einem Bereich ein Recht fehlen (Kanal in einer
// Kategorie, die der Bot nicht sieht; Rolle über der Bot-Rolle). Der Check (GET /api/discord/guilds/:id/check,
// Backend/discord/bot/setupCheck.js) nennt jede Stelle mit Bereich und führt mit einem Klick dorthin.
// „Erste Schritte“ zeigt die beliebtesten Bereiche mit Haken — aus derselben Übersicht wie die Punkte in der Leiste.
import React, { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, RefreshCw } from 'lucide-react';
import { useDiscordText } from '../discordI18n.js';

const FIRST_STEPS = ['welcome', 'reactionroles', 'twitchnotif', 'tickets', 'loyalty', 'voice'];

export default function SetupCheck({ serverId, overview = {}, onOpenTab }) {
    const t = useDiscordText();
    const s = t.setup;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        setFailed(false);
        fetch(`/api/discord/guilds/${serverId}/check`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((d) => setData(d))
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    }, [serverId]);

    useEffect(() => { load(); }, [load]);

    const permList = (names) => names.map((n) => s.perms[n] || n).join(', ');
    const issueText = (p) => {
        if (p.issue === 'gone') return s.issueGone(p.kind);
        if (p.issue === 'role_above') return s.issueRoleAbove(data?.botRole?.name);
        return s.issueMissing(permList(p.missing || []));
    };
    const targetName = (p) => (p.name ? `${p.kind === 'channel' ? '#' : '@'}${p.name}` : p.id);

    return (
        <div className="flex flex-col gap-4">
            <section className="dc-card p-4" aria-labelledby="dc-setup-check" data-setup-check>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 id="dc-setup-check" className="text-[15px] font-bold text-white">{s.title}</h3>
                        <p className="text-[13px] text-white/50 mt-0.5">{s.intro}</p>
                    </div>
                    <button type="button" onClick={load} disabled={loading}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 hover:border-white/25 text-[12.5px] font-semibold text-white/70 hover:text-white disabled:opacity-50 transition-colors">
                        <RefreshCw size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
                        {loading ? s.checking : s.recheck}
                    </button>
                </div>

                {failed && <p className="mt-3 text-[13px] text-amber-300" role="status">{s.failed}</p>}

                {data && !loading && data.ok && (
                    <p className="mt-3 text-[13px] text-emerald-300 inline-flex items-center gap-1.5" role="status" data-setup-ok>
                        <Check size={15} aria-hidden="true" /> {s.allGood}
                    </p>
                )}

                {data && data.missing?.length > 0 && (
                    <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-3" data-setup-missing>
                        <p className="text-[13px] font-bold text-white">{s.missingTitle}</p>
                        <p className="text-[12.5px] text-white/60 mt-1">{permList(data.missing)}</p>
                        <p className="text-[12.5px] text-white/45 mt-1">{s.missingText}</p>
                        {data.invite && (
                            <a href={data.invite} target="_blank" rel="noopener noreferrer" className="dc-btn mt-3 !min-h-[32px] !px-3 text-[13px]">
                                {s.regrant} <ExternalLink size={13} aria-hidden="true" />
                            </a>
                        )}
                    </div>
                )}

                {data && data.problems?.length > 0 && (
                    <div className="mt-4" data-setup-problems>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-white/40 mb-2">{s.problemsTitle(data.problems.length)}</p>
                        <ul className="divide-y divide-white/[0.07] rounded-md border border-white/10">
                            {data.problems.map((p, i) => (
                                <li key={`${p.area}-${p.kind}-${p.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                                    <span className="text-[13px] font-semibold text-white">{t.shell.tabs[p.area] || p.area}</span>
                                    <span className="text-[12.5px] text-white/50 truncate max-w-[14rem]">{targetName(p)}</span>
                                    <span className="basis-full text-[12.5px] text-white/60">{issueText(p)}</span>
                                    {onOpenTab && t.shell.tabs[p.area] && (
                                        <button type="button" onClick={() => onOpenTab(p.area)}
                                            className="text-[12.5px] font-semibold text-[#8f98f8] hover:text-white transition-colors">
                                            {s.open} →
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="dc-card p-4" aria-labelledby="dc-first-steps">
                <h3 id="dc-first-steps" className="text-[15px] font-bold text-white">{s.firstSteps}</h3>
                <p className="text-[13px] text-white/50 mt-0.5">{s.firstStepsText}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                    {FIRST_STEPS.map((id) => {
                        const done = !!overview[id];
                        return (
                            <button key={id} type="button" onClick={() => onOpenTab && onOpenTab(id)} aria-label={`${s.steps[id]}${done ? ` — ${t.shell.configured}` : ''}`}
                                className="flex items-center gap-2.5 h-10 px-3 rounded-md border border-white/10 hover:border-white/25 text-left text-[13px] font-semibold text-white/75 hover:text-white transition-colors">
                                <span aria-hidden="true" className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${done ? 'bg-[#3ba55d] border-[#3ba55d] text-white' : 'border-white/25'}`}>
                                    {done && <Check size={12} strokeWidth={3} />}
                                </span>
                                <span className="truncate">{s.steps[id]}</span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
