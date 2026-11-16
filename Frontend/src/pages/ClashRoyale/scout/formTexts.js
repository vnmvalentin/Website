// formTexts.js — Texte der Form-Auswertung (FormInsights.jsx: Reiter „Form“ im Profil und Saisonrückblick des
// Win Trackers). Über den gemeinsamen Sprachkern (i18n/core.js), Deutsch vollständig; ein Test prüft Englisch.
import { defineMessages } from '../../../i18n/core.js';

const pctDe = (v) => `${Math.round((v || 0) * 100)} %`;
const pctEn = (v) => `${Math.round((v || 0) * 100)}%`;
const listDe = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0] || '');
const listEn = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');
const TIME_DE = { night: 'nachts', morning: 'morgens', afternoon: 'nachmittags', evening: 'abends' };
const TIME_EN = { night: 'at night', morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening' };

export const FORM_TEXTS = defineMessages({
  de: {
    pct: pctDe,
    source: (n, sessions, from) => `Aus ${n} Kämpfen in ${sessions} ${sessions === 1 ? 'Sitzung' : 'Sitzungen'}${from ? ` seit ${from}` : ''}`,
    few: (n) => `Erst ${n} Kämpfe gespeichert — Muster werden ab etwa 20 Kämpfen sichtbar. Der Verlauf wächst, solange das Profil angesehen wird.`,
    tipsTitle: 'Was auffällt',
    noTips: 'Nichts Auffälliges — deine Form ist gleichmäßig.',
    afterTitle: 'Nach Niederlagen in Folge', afterSub: 'Siegquote im nächsten Kampf derselben Sitzung',
    after: { afterWin: 'nach einem Sieg', after1: 'nach 1 Niederlage', after2: 'nach 2 Niederlagen', after3: 'nach 3 und mehr' },
    timeTitle: 'Nach Tageszeit',
    times: { night: 'Nachts (0–6)', morning: 'Morgens (6–12)', afternoon: 'Nachmittags (12–18)', evening: 'Abends (18–24)' },
    posTitle: 'Im Lauf einer Sitzung', posSub: 'Eine Sitzung endet nach 45 Minuten Pause',
    pos: { '1-3': '1.–3. Kampf', '4-6': '4.–6. Kampf', '7-10': '7.–10. Kampf', '11+': 'ab dem 11. Kampf' },
    hardTitle: 'Gegnerkarten, gegen die es nicht läuft', weakTitle: 'Deine Karten mit schwacher Bilanz',
    games: (n) => `${n} ${n === 1 ? 'Kampf' : 'Kämpfe'}`,
    tips: {
      lossStreakNow: (p) => `${p.n} Niederlagen in Folge — eine kurze Pause hilft oft mehr als der nächste Kampf.`,
      tilt: (p) => `Nach zwei oder mehr Niederlagen in Folge gewinnst du nur ${pctDe(p.winRate)} (sonst ${pctDe(p.overall)}). Nach der zweiten Niederlage lieber kurz aufhören.`,
      resilient: (p) => `Niederlagen werfen dich nicht aus der Bahn: Nach zwei in Folge gewinnst du ${pctDe(p.winRate)}.`,
      fatigue: (p) => `Ab dem ${p.from}. Kampf einer Sitzung sinkt deine Siegquote von ${pctDe(p.early)} auf ${pctDe(p.late)} — kürzere Sitzungen lohnen sich.`,
      bestTime: (p) => `Am besten läuft es ${TIME_DE[p.best]} (${pctDe(p.bestRate)}), am schlechtesten ${TIME_DE[p.worst]} (${pctDe(p.worstRate)}).`,
      underLevel: (p) => `Gegen höhere Level gewinnst du nur ${pctDe(p.winRate)} (sonst ${pctDe(p.overall)}) — Aufwerten bringt hier am meisten.`,
      hardCards: (p) => `Am schwersten tust du dich gegen ${listDe(p.cards.map((c) => c.card.name))}.`,
      weakCards: (p) => `Mit ${listDe(p.cards.map((c) => c.card.name))} im Deck gewinnst du seltener als sonst.`,
    },
  },
  en: {
    pct: pctEn,
    source: (n, sessions, from) => `From ${n} battles in ${sessions} ${sessions === 1 ? 'session' : 'sessions'}${from ? ` since ${from}` : ''}`,
    few: (n) => `Only ${n} battles stored so far — patterns show up from around 20 battles. The history grows while the profile is being viewed.`,
    tipsTitle: 'What stands out',
    noTips: 'Nothing unusual — your form is steady.',
    afterTitle: 'After losses in a row', afterSub: 'Win rate of the next battle in the same session',
    after: { afterWin: 'after a win', after1: 'after 1 loss', after2: 'after 2 losses', after3: 'after 3 or more' },
    timeTitle: 'By time of day',
    times: { night: 'Night (0–6)', morning: 'Morning (6–12)', afternoon: 'Afternoon (12–18)', evening: 'Evening (18–24)' },
    posTitle: 'Over a session', posSub: 'A session ends after a 45-minute break',
    pos: { '1-3': 'battles 1–3', '4-6': 'battles 4–6', '7-10': 'battles 7–10', '11+': 'from battle 11' },
    hardTitle: 'Opponent cards you struggle against', weakTitle: 'Your cards with a weak record',
    games: (n) => `${n} ${n === 1 ? 'battle' : 'battles'}`,
    tips: {
      lossStreakNow: (p) => `${p.n} losses in a row — a short break often helps more than the next battle.`,
      tilt: (p) => `After two or more losses in a row you only win ${pctEn(p.winRate)} (otherwise ${pctEn(p.overall)}). Better stop for a bit after the second loss.`,
      resilient: (p) => `Losses don't throw you off: after two in a row you still win ${pctEn(p.winRate)}.`,
      fatigue: (p) => `From battle ${p.from} of a session your win rate drops from ${pctEn(p.early)} to ${pctEn(p.late)} — shorter sessions pay off.`,
      bestTime: (p) => `You play best ${TIME_EN[p.best]} (${pctEn(p.bestRate)}) and worst ${TIME_EN[p.worst]} (${pctEn(p.worstRate)}).`,
      underLevel: (p) => `Against higher levels you only win ${pctEn(p.winRate)} (otherwise ${pctEn(p.overall)}) — upgrading helps most here.`,
      hardCards: (p) => `You struggle most against ${listEn(p.cards.map((c) => c.card.name))}.`,
      weakCards: (p) => `With ${listEn(p.cards.map((c) => c.card.name))} in your deck you win less often than usual.`,
    },
  },
});
