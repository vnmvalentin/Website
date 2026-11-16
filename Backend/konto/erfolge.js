// konto/erfolge.js — Katalog der Abzeichen je Spiel. Ein Spiel kann nur Abzeichen melden, die hier stehen
// (POST /api/konto/erfolge/:spiel bzw. meldeErfolge() in Frontend/src/utils/kontoSpeicher.js); Namen und Texte zeigen
// das Profil und das öffentliche Profil /u/. Spiel-IDs wie in analytics/spiele.js.
//
// Eintrag: { id: "kurz-kebab", name: { de, en }, text: { de, en } }
//   - IDs nie umbenennen oder neu vergeben: gespeicherte Freischaltungen hängen an der ID. Neue Abzeichen anhängen.
//   - Belohnt wird nur mit Abzeichen und Freischaltungen, nie mit Währung (Ausbauplan, ein-konto).
// Die Spiele tragen ihre Abzeichen selbst ein, wenn sie ans Konto angebunden werden (Anschluss konto-spiele, Spur D).

const KATALOG = {
  // "flick-soccer": [
  //   { id: "erstes-tor", name: { de: "Erstes Tor", en: "First goal" }, text: { de: "…", en: "…" } },
  // ],
};

const ID_FORM = /^[a-z0-9][a-z0-9_-]{0,47}$/;

function erfolgInfo(spiel, id) {
  const liste = Object.prototype.hasOwnProperty.call(KATALOG, spiel) ? KATALOG[spiel] : null;
  return (liste || []).find((e) => e.id === id) || null;
}

const erfolgErlaubt = (spiel, id) => typeof id === "string" && ID_FORM.test(id) && Boolean(erfolgInfo(spiel, id));

module.exports = { KATALOG, erfolgErlaubt, erfolgInfo, ID_FORM };
