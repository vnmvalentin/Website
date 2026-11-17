// ClanCentral.jsx — Reiter „Zentrale“ der Clan-Seite (/clash/clan/:tag?reiter=zentrale): Antworten für Anführer aus
// Backend/clashRoyale/scout/clanCentral.js (Ampel, Vorschläge, Kriegsdecks und Spenden je Woche, Kommen und Gehen)
// und die Discord-Erinnerungen (clanAlerts.js, für jedes Konto). Texte: clanCentralTexts.js.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CrBattle, CrDowngrade, CrMegaphone, CrScroll, CrSocial, CrUpgrade, CrUserAdd, CrUserRemove } from '../ui/CrIcons';
import { LoadState, Panel, PlayerLink } from './parts';
import { useScout } from './scoutApi';
import { fmtDate, fmtNum, timeAgo, useScoutText } from './scoutI18n';
import { CENTRAL_TEXTS } from './clanCentralTexts';
import { oeffneAnmeldung, useKonto } from '../../../utils/konto';

const DECKS_PER_DAY = 4;
const SHOWN_WEEKS = 6;
const LIGHT_DOT = { green: 'is-fresh', yellow: 'is-stale', red: 'is-cold' };
const LIGHT_ORDER = { red: 0, yellow: 1, green: 2 };
const DAY = 86400000;

function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const reasonText = (t, r) => (t.reasons[r.k] ? t.reasons[r.k](r) : '');

// ── Überblick: Ampel und laufender Kampftag ──────────────────────────────────
function Overview({ data, t }) {
  const { lang } = useScoutText();
  const now = useMinuteClock();
  const day = data.warDay;
  const rest = day ? Math.max(0, day.endsAt - now) : 0;
  const restText = t.hoursMin(Math.floor(rest / 3600000), Math.floor((rest % 3600000) / 60000));
  return (
    <Panel title={t.title} sub={t.sub} icon={<CrScroll size={28} />}>
      <div className="crs-figs crs-cc-lights">
        {['green', 'yellow', 'red'].map((k) => (
          <div key={k} className="crs-fig">
            <div className="crs-fig-value"><span className={`crs-dot ${LIGHT_DOT[k]}`} />{data.counts[k]}</div>
            <div className="crs-fig-label">{t.lights[k]}</div>
          </div>
        ))}
      </div>
      {day && (
        <div className="crs-well mt-4 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <CrBattle size={22} />
          <span className="font-cr text-white">{day.type === 'colosseum' ? t.colosseum : t.warDay(day.day)}</span>
          <span className="text-sm crs-muted" title={day.resetSource === 'default' ? t.resetGuess : undefined}>
            {t.endsIn(restText)}{day.resetSource === 'default' ? ' *' : ''}
          </span>
          <span className="text-sm text-white/90 sm:ml-auto">{day.open.length ? t.openSummary(day.open.length, day.decksLeft) : t.allDone}</span>
          {day.open.length > 0 && (
            <details className="crs-details basis-full">
              <summary className="cr-chip inline-flex items-center h-8 px-3 rounded-lg font-cr text-xs text-white w-fit">{t.showOpen}</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {day.open.map((p) => (
                  <span key={p.tag} className="crs-delta"><PlayerLink tag={p.tag} name={p.name} className="text-white" /> · {t.left(p.left)}</span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      <p className="mt-3 text-xs crs-muted">
        {data.history.oldest ? t.recording(fmtDate(data.history.oldest, lang)) : t.recordingNew}
      </p>
      {data.warIgnored && <p className="mt-1 text-xs crs-muted">{t.warIgnored}</p>}
    </Panel>
  );
}

// ── Vorschläge ───────────────────────────────────────────────────────────────
const HINT_ICONS = { promote: CrUpgrade, kick: CrUserRemove, demote: CrDowngrade };

function Hints({ data, t }) {
  const { t: st } = useScoutText();
  // Am längsten offline zuerst — dort ist die Entscheidung am klarsten
  const groups = ['promote', 'kick', 'demote'].map((k) => ({
    k,
    list: data.members.filter((m) => m.hint?.k === k).sort((a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0)),
  }));
  return (
    <Panel title={t.hintsTitle} sub={t.hintsSub} icon={<CrUpgrade size={28} />}>
      <div className="flex flex-col gap-4">
        {groups.filter((g) => g.k !== 'demote' || g.list.length).map(({ k, list }) => {
          const Icon = HINT_ICONS[k];
          return (
            <div key={k}>
              <div className="cr-eyebrow mb-1.5 flex items-center gap-2"><Icon size={18} />{t.hintGroups[k]} · {list.length}</div>
              {list.length ? (
                <div className="crs-rows">
                  {list.map((m) => (
                    <div key={m.tag}>
                      <span className="min-w-0 flex-1">
                        <PlayerLink tag={m.tag} name={m.name} className="font-semibold text-white" />
                        <span className="crs-cc-why">{m.hint.why.map((r) => reasonText(t, r)).filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`crs-role crs-role--${m.role}`}>{st.roles[m.role] || m.role}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm crs-muted">{t.nobody}</p>}
            </div>
          );
        })}
        <details className="crs-details">
          <summary className="cr-chip inline-flex items-center h-8 px-3 rounded-lg font-cr text-xs text-white w-fit">{t.rulesTitle}</summary>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm crs-muted list-disc pl-5">
            {t.rules.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      </div>
    </Panel>
  );
}

// ── Kommen und Gehen ─────────────────────────────────────────────────────────
const EVENT_ICONS = { join: CrUserAdd, leave: CrUserRemove, promote: CrUpgrade, demote: CrDowngrade };

function Events({ data, t }) {
  const { t: st, lang } = useScoutText();
  const now = useMinuteClock();
  return (
    <Panel title={t.eventsTitle} sub={t.eventsSub} icon={<CrSocial size={28} />}>
      {data.events.length ? (
        <div className="crs-rows crs-cc-events">
          {data.events.slice(0, 40).map((e) => {
            const Icon = EVENT_ICONS[e.kind] || CrSocial;
            const what = e.kind === 'promote' || e.kind === 'demote' ? t.events[e.kind](st.roles[e.to] || e.to) : t.events[e.kind];
            return (
              <div key={`${e.kind}-${e.tag}-${e.t}`}>
                <span className="shrink-0 flex w-7 justify-center"><Icon size={20} /></span>
                <span className="min-w-0 flex-1 text-sm">
                  <PlayerLink tag={e.tag} name={e.name} className="font-semibold text-white" /> <span className="crs-muted">{what}</span>
                </span>
                <span className="text-xs crs-muted whitespace-nowrap">{timeAgo(e.t, lang, now)}{e.approx ? ` · ${t.approx}` : ''}</span>
              </div>
            );
          })}
        </div>
      ) : <p className="crs-empty">{t.eventsEmpty}</p>}
    </Panel>
  );
}

// ── Mitglieder im Verlauf ────────────────────────────────────────────────────
function Bars({ cells }) {
  return (
    <span className="crs-cc-bars" aria-hidden="true">
      {cells.map((c, i) => (
        <i
          key={i}
          title={c.tip}
          className={c.v === null ? 'is-none' : `is-${c.tone}`}
          style={c.v === null ? undefined : { height: c.v <= 0 ? '3px' : `${Math.max(15, Math.min(1, c.v) * 100)}%` }}
        />
      ))}
    </span>
  );
}

const SORTS = {
  light: (a, b) => LIGHT_ORDER[a.light] - LIGHT_ORDER[b.light] || (a.lastSeen ?? 0) - (b.lastSeen ?? 0),
  name: (a, b) => a.name.localeCompare(b.name),
  since: (a, b) => (a.since?.t ?? Infinity) - (b.since?.t ?? Infinity),
  lastSeen: (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0),
  war: (a, b) => (b.warRate ?? -1) - (a.warRate ?? -1),
  now: (a, b) => (b.warNow?.decks ?? -1) - (a.warNow?.decks ?? -1),
  gifts: (a, b) => b.donations - a.donations,
};

function MemberTable({ data, t }) {
  const { t: st, lang } = useScoutText();
  const now = useMinuteClock();
  const [sort, setSort] = useState({ key: 'light', flip: false });
  const list = useMemo(() => {
    const sorted = [...data.members].sort(SORTS[sort.key]);
    return sort.flip ? sorted.reverse() : sorted;
  }, [data.members, sort]);

  // Wochen: neueste zuerst geliefert → für die Balken älteste links
  const weekIdx = data.weeks.slice(0, SHOWN_WEEKS).map((w, i) => i).reverse();
  const giftIdx = data.donationWeeks.map((w, i) => i).reverse();
  const giftMax = data.donationWeeks.map((w, i) => Math.max(1, ...data.members.map((m) => m.donationWeeks[i]?.given || 0)));
  const possibleNow = data.warDay?.day ? data.warDay.day * DECKS_PER_DAY : null;

  const th = (id, label, num = false, title = undefined) => (
    <th className={num ? 'num' : ''} aria-sort={sort.key === id ? (sort.flip ? 'ascending' : 'descending') : undefined}>
      <button type="button" title={title} aria-label={title} onClick={() => setSort((s) => ({ key: id, flip: s.key === id ? !s.flip : false }))}>
        {label}{sort.key === id && (sort.flip ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  const sinceText = (s) => {
    if (!s) return '–';
    if (s.exact) return t.sinceExact(fmtDate(s.t, lang));
    return t.sinceDays(Math.max(1, Math.floor((now - s.t) / DAY)));
  };

  return (
    <Panel title={t.membersTitle} sub={t.membersSub(Math.min(SHOWN_WEEKS, data.weeks.length))} icon={<CrSocial size={28} />}>
      <div className="crs-scroll-x">
        <table className="crs-table">
          <thead>
            <tr>
              {/* Schmale Spalte: statt des Worts ein Punkt, das Wort steht im Tooltip */}
              {th('light', <span className="crs-dot is-stale" />, false, t.colLight)}
              {th('name', st.colName)}
              {th('since', t.colSince)}
              {th('lastSeen', st.colLastSeen, true)}
              {data.weeks.length > 0 && th('war', t.colWar)}
              {possibleNow && th('now', t.colNow, true)}
              {th('gifts', t.colGifts)}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.tag}>
                <td><span className={`crs-dot ${LIGHT_DOT[m.light]}`} title={t.lights[m.light]} /></td>
                <td className="name">
                  <span className="flex items-center gap-2 min-w-0">
                    <PlayerLink tag={m.tag} name={m.name} />
                    {m.role !== 'member' && <span className={`crs-role crs-role--${m.role}`}>{st.roles[m.role] || m.role}</span>}
                  </span>
                  {m.reasons.length > 0 && <span className="crs-cc-why">{m.reasons.map((r) => reasonText(t, r)).filter(Boolean).join(' · ')}</span>}
                </td>
                <td className="text-sm crs-muted whitespace-nowrap">{sinceText(m.since)}</td>
                <td className="num text-sm">{m.lastSeen ? timeAgo(m.lastSeen, lang, now) : '–'}</td>
                {data.weeks.length > 0 && (
                  <td>
                    <Bars cells={weekIdx.map((i) => {
                      const w = data.weeks[i];
                      const cell = m.war[i];
                      if (!cell) return { v: null, tip: `${t.weekTip(w.season, w.week, 0, w.possible)} · ${t.notInClan}` };
                      const v = cell.decks / w.possible;
                      return { v, tone: v >= 1 ? 'full' : v >= 0.5 ? 'half' : 'low', tip: t.weekTip(w.season, w.week, cell.decks, w.possible) };
                    })}
                    />
                  </td>
                )}
                {possibleNow && <td className="num">{m.warNow ? m.warNow.decks : 0} / {possibleNow}</td>}
                <td>
                  <span className="inline-flex items-center gap-2">
                    {data.donationWeeks.length > 1 && (
                      <Bars cells={giftIdx.map((i) => {
                        const cell = m.donationWeeks[i];
                        if (!cell) return { v: null, tip: t.notInClan };
                        return { v: cell.given / giftMax[i], tone: 'gift', tip: t.giftTip(fmtDate(data.donationWeeks[i].start, lang), fmtNum(cell.given, lang)) };
                      })}
                      />
                    )}
                    <span className="crs-num text-sm">{fmtNum(m.donations, lang)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Discord-Erinnerungen ─────────────────────────────────────────────────────
async function alertApi(tag, { method = 'GET', body, path = '' } = {}) {
  try {
    const res = await fetch(`/api/clash/scout/clan/${tag}/alerts${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) return { ok: false, key: 'loginRequired' };
    const json = await res.json().catch(() => null);
    if (json && typeof json.ok === 'boolean') return json;
    return { ok: false, key: res.status === 429 ? 'rateLimited' : 'other' };
  } catch {
    return { ok: false, key: 'other' };
  }
}

function ClanAlerts({ tag, t }) {
  const { lang } = useScoutText();
  const { geladen, konto } = useKonto();
  const [state, setState] = useState(null); // Antwort von GET
  const [form, setForm] = useState({ webhook: '', remindHours: 3, weekly: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const apply = useCallback((res) => {
    setState(res);
    if (res?.alert) setForm({ webhook: '', remindHours: res.alert.remindHours, weekly: res.alert.weekly });
  }, []);

  // Nur bei einem anderen Konto neu laden — nicht, wenn sich am Konto etwas anderes ändert (Sprache, Name)
  const kontoId = konto?.id || null;
  useEffect(() => {
    if (!kontoId) { setState(null); return undefined; }
    let gone = false;
    alertApi(tag).then((res) => { if (!gone && res.ok) apply(res); });
    return () => { gone = true; };
  }, [tag, kontoId, apply]);

  const fail = (key) => setMsg({ ok: false, text: t.errors[key] || t.errors.other });
  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const webhook = form.webhook.trim();
    if (!state?.alert && !webhook) return fail('webhookMissing');
    const res = await alertApi(tag, { method: 'PUT', body: { ...(webhook ? { webhook } : null), remindHours: Number(form.remindHours), weekly: form.weekly, lang } });
    if (!res.ok) return fail(res.key);
    apply({ ...state, alert: res.alert, used: state?.alert ? state.used : (state?.used || 0) + 1 });
    return setMsg({ ok: true, text: t.saved });
  });
  const test = () => run(async () => {
    const res = await alertApi(tag, { method: 'POST', path: '/test' });
    if (!res.ok) {
      if (res.key === 'webhookInvalid') setState((s) => (s?.alert ? { ...s, alert: { ...s.alert, broken: true } } : s));
      return fail(res.key);
    }
    return setMsg({ ok: true, text: t.testSent });
  });
  const remove = () => run(async () => {
    const res = await alertApi(tag, { method: 'DELETE' });
    if (!res.ok) return fail(res.key);
    setState((s) => ({ ...s, alert: null, used: Math.max(0, (s?.used || 1) - 1) }));
    setForm({ webhook: '', remindHours: 3, weekly: true });
    return setMsg({ ok: true, text: t.removed });
  });

  const alert = state?.alert || null;
  const hours = state?.remindHours || [0, 1, 2, 3, 4, 6, 8, 12];
  return (
    <Panel title={t.alertsTitle} sub={t.alertsSub} icon={<CrMegaphone size={28} />}>
      {!geladen ? null : !konto ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm crs-muted flex-1 min-w-[14rem]">{t.loginNeeded}</p>
          <button type="button" onClick={oeffneAnmeldung} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">{t.login}</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alert && (
            <div className="crs-well px-3 py-2.5 text-sm">
              <span className={`crs-dot ${alert.broken ? 'is-cold' : 'is-fresh'} mr-2`} />
              <span className="text-white">
                {alert.broken ? t.broken : t.active(alert.hookName)}
                {!alert.broken && alert.hookHint && <span className="whitespace-nowrap crs-muted"> ({alert.hookHint})</span>}
              </span>
              {!alert.broken && alert.lastSent && <span className="crs-muted"> · {t.lastSent(timeAgo(alert.lastSent, lang))}</span>}
            </div>
          )}
          {!alert && (
            <ol className="text-sm crs-muted list-decimal pl-5 flex flex-col gap-0.5">
              {t.howTo.map((line) => <li key={line}>{line}</li>)}
            </ol>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/85">{alert ? t.webhookNew : t.webhook}</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="cr-input h-10 px-3 text-sm w-full"
              placeholder={t.webhookPh}
              value={form.webhook}
              onChange={(e) => setForm((f) => ({ ...f, webhook: e.target.value }))}
            />
          </label>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-white/85">{t.remind}</span>
              <select className="crs-select" value={form.remindHours} onChange={(e) => setForm((f) => ({ ...f, remindHours: Number(e.target.value) }))}>
                {hours.map((h) => <option key={h} value={h}>{h ? t.remindHours(h) : t.remindOff}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-white/90 h-10">
              <input type="checkbox" className="crs-cc-check" checked={form.weekly} onChange={(e) => setForm((f) => ({ ...f, weekly: e.target.checked }))} />
              {t.weekly}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={save} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--green">{t.save}</button>
            {alert && !alert.broken && <button type="button" disabled={busy} onClick={test} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--blue">{t.test}</button>}
            {alert && <button type="button" disabled={busy} onClick={remove} className="cr-arcade-btn cr-arcade-btn--sm cr-arcade-btn--red">{t.remove}</button>}
            {state && <span className="text-xs crs-muted sm:ml-auto">{t.usage(state.used || 0, state.max || 3)}</span>}
          </div>
          {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-[#7ee79a]' : 'text-[#ff8f91]'}`}>{msg.text}</p>}
        </div>
      )}
    </Panel>
  );
}

export default function ClanCentral({ tag }) {
  const { lang } = useScoutText();
  const t = CENTRAL_TEXTS.dict(lang);
  const { data, error, loading, reload } = useScout(`/clan/${tag}/central`);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return (
    <div className="flex flex-col gap-4">
      <Overview data={data} t={t} />
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Hints data={data} t={t} />
        <Events data={data} t={t} />
      </div>
      <MemberTable data={data} t={t} />
      <ClanAlerts tag={tag} t={t} />
    </div>
  );
}
