// push/themen.js — die Themen, die man als Mitteilung abonnieren kann. Die Website zeigt sie in dieser Reihenfolge
// (Profil → Mitteilungen; „live“ zusätzlich als Glocke am Stream der Startseite).
//
//   persoenlich: false   geht an alle Geräte mit dem Thema (Stream live, neue Updates)
//   persoenlich: true    geht nur an die Geräte bestimmter Konten (lib/mitteilungen.js mit `konten`); abonnieren
//                        geht nur angemeldet
//
// Neues Thema (z. B. „Turnier startet gleich“, Spur B): Eintrag hier anhängen, dann aus dem eigenen Bereich
// meldeMitteilung({ thema, konten, … }) aufrufen (Backend/lib/mitteilungen.js). IDs nie umbenennen — Abos hängen daran.

const THEMEN = [
  {
    id: 'live',
    persoenlich: false,
    name: { de: 'Stream ist live', en: 'Stream is live' },
    text: { de: 'Wenn vnmvalentin auf Twitch live geht', en: 'When vnmvalentin goes live on Twitch' },
  },
  {
    id: 'updates',
    persoenlich: false,
    name: { de: 'Neue Updates', en: 'New updates' },
    text: { de: 'Wenn es auf der Website etwas Neues gibt', en: 'When there is something new on the website' },
  },
  {
    // Antworten des Betreibers auf Feedback (routes/feedbackRoutes.js) — stehen immer auch in der Glocke
    id: 'antworten',
    persoenlich: true,
    name: { de: 'Antworten auf dein Feedback', en: 'Replies to your feedback' },
    text: { de: 'Wenn ich auf eine Nachricht von dir antworte', en: 'When I reply to a message from you' },
  },
  {
    // Freund über den eigenen Einladungslink dabei (einladung/einladungDienst.js) — steht immer auch in der Glocke
    id: 'einladungen',
    persoenlich: true,
    name: { de: 'Einladungen', en: 'Invites' },
    text: { de: 'Wenn ein Freund über deinen Link dazukommt', en: 'When a friend joins through your link' },
  },
  {
    // „Jetzt mitspielen“: in der Warteschlange aufgerufen (mitspielen/) — steht immer auch in der Glocke
    id: 'mitspielen',
    persoenlich: true,
    name: { de: 'Mitspielen im Stream', en: 'Playing along on stream' },
    text: { de: 'Wenn du in der Warteschlange dran bist', en: "When it's your turn in the queue" },
  },
  {
    // Bei einem Giveaway gezogen (giveaways/dienst.js) — steht immer auch in der Glocke
    id: 'giveaways',
    persoenlich: true,
    name: { de: 'Giveaway gewonnen', en: 'Giveaway won' },
    text: { de: 'Wenn du bei einem Giveaway gezogen wirst', en: 'When you are drawn in a giveaway' },
  },
];

const THEMA_IDS = new Set(THEMEN.map((t) => t.id));
const themaInfo = (id) => THEMEN.find((t) => t.id === id) || null;

module.exports = { THEMEN, THEMA_IDS, themaInfo };
