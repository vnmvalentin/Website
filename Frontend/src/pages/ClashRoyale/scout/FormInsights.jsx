// FormInsights.jsx — Muster in den eigenen Kämpfen (Ausbauplan „cr-form“): erst die Tipps, dann je eine Liste
// „nach Niederlagen in Folge“, „nach Tageszeit“, „im Lauf einer Sitzung“ und die Karten mit schwacher Bilanz.
// Die Zahlen rechnet der Server (Backend/clashRoyale/lib/formPatterns.js). Genutzt im Reiter „Form“ des Profils
// (PlayerPage.jsx) und im Saisonrückblick des Win Trackers (WinTrackerRecapPage.jsx) — deshalb mit eigener Wurzel
// .crs (Farben der Balken aus scout.css) und eigenen Texten (formTexts.js).
import React from 'react';
import { Bar, Panel, ScoutCard } from './parts';
import { FORM_TEXTS } from './formTexts';
import './scout.css';

const GOOD = '#7ee79a';
const BAD = '#ff8f91';
const TONE = { warn: '#ff6b6d', bad: '#ff8f91', good: '#7ee79a', info: '#8fc0ff' };
/** Unter so vielen Kämpfen zeigt eine Zeile ihre Quote nur blass (zu wenig, um etwas daraus zu lesen). */
const MIN_ROW = 5;
/** Grün/rot erst ab so vielen Kämpfen und so viel Abstand zum Schnitt — sonst färbt der Zufall. */
const MIN_COLOR_N = 10;
const MIN_COLOR_GAP = 0.1;

function Rows({ rows, labels, overall, t }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const thin = r.n < MIN_ROW;
        const clear = !thin && overall !== null && r.n >= MIN_COLOR_N;
        const color = !clear ? undefined : r.winRate >= overall + MIN_COLOR_GAP ? GOOD : r.winRate <= overall - MIN_COLOR_GAP ? BAD : undefined;
        return (
          <div key={r.key} className={`grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_3.2rem] items-center gap-3 text-sm ${thin ? 'opacity-50' : ''}`}>
            <span className="text-white/85 truncate" title={t.games(r.n)}>{labels[r.key]}<span className="crs-muted text-xs"> · {r.n}</span></span>
            <Bar value={r.winRate ?? 0} color={color} />
            <span className="font-cr text-right crs-num" style={color ? { color } : undefined}>{r.n ? t.pct(r.winRate) : '–'}</span>
          </div>
        );
      })}
    </div>
  );
}

function Cards({ list, t }) {
  return (
    <div className="crs-cardrecs">
      {list.map((e) => (
        <span key={e.card.id || e.card.name}>
          <ScoutCard card={e.card} level={false} link={!!e.card.id} />
          <b style={{ color: BAD }}>{t.pct(e.winRate)}</b>
          <small className="crs-num">{e.wins}–{e.n - e.wins}</small>
        </span>
      ))}
    </div>
  );
}

/**
 * @param {object} patterns  Antwort von formPatterns (Server)
 * @param {string} lang      'de' | 'en'
 * @param {string} [fromText] Datum des ältesten Kampfs, schon formatiert (für die Quellenzeile)
 * @param {number} [minBattles] darunter nur ein Hinweis statt der Auswertung
 */
export default function FormInsights({ patterns: p, lang, fromText, minBattles = 15 }) {
  const t = FORM_TEXTS.dict(lang);
  if (!p) return null;
  if (p.n < minBattles) return <Panel><p className="crs-empty">{t.few(p.n)}</p></Panel>;
  // Ohne Kartenfläche (Saisonrückblick: der Tracker kennt die Gegnerkarten nicht) zieht sich die Sitzungs-Fläche über
  // die volle Breite — drei schmale Flächen nebeneinander ließen den Balken neben der Beschriftung keinen Platz
  const withCards = p.hardCards?.length > 0 || p.weakCards?.length > 0;
  return (
    <div className="crs flex flex-col gap-4">
      <Panel title={t.tipsTitle} sub={t.source(p.n, p.sessions, fromText)}>
        {p.tips.length ? (
          <ul className="flex flex-col divide-y divide-white/10">
            {p.tips.map((tip) => (
              <li key={tip.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE[tip.tone] || TONE.info }} />
                <span className="text-sm text-white/90 leading-snug">{t.tips[tip.key]?.(tip)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm crs-muted">{t.noTips}</p>}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={t.afterTitle} sub={t.afterSub}>
          <Rows rows={p.afterLosses} labels={t.after} overall={p.winRate} t={t} />
        </Panel>
        <Panel title={t.timeTitle}>
          <Rows rows={p.timeOfDay} labels={t.times} overall={p.winRate} t={t} />
        </Panel>
        <Panel title={t.posTitle} sub={t.posSub} className={withCards ? '' : 'lg:col-span-2'}>
          <Rows rows={p.sessionPos} labels={t.pos} overall={p.winRate} t={t} />
        </Panel>
        {withCards && (
          <Panel title={p.hardCards?.length ? t.hardTitle : t.weakTitle}>
            {p.hardCards?.length > 0 && <Cards list={p.hardCards} t={t} />}
            {p.hardCards?.length > 0 && p.weakCards?.length > 0 && <p className="cr-eyebrow mt-4 mb-2">{t.weakTitle}</p>}
            {p.weakCards?.length > 0 && <Cards list={p.weakCards} t={t} />}
          </Panel>
        )}
      </div>
    </div>
  );
}
