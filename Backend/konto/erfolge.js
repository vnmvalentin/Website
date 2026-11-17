// konto/erfolge.js — Katalog der Abzeichen je Spiel. Ein Spiel kann nur Abzeichen melden, die hier stehen
// (POST /api/konto/erfolge/:spiel bzw. meldeErfolge() in Frontend/src/utils/kontoSpeicher.js); Namen und Texte zeigen
// das Profil und das öffentliche Profil /u/. Spiel-IDs wie in analytics/spiele.js.
//
// Eintrag: { id: "kurz-kebab", name: { de, en }, text: { de, en } }
//   - IDs nie umbenennen oder neu vergeben: gespeicherte Freischaltungen hängen an der ID. Neue Abzeichen anhängen.
//   - Belohnt wird nur mit Abzeichen und Freischaltungen, nie mit Währung (Ausbauplan, ein-konto).
// Die Spiele tragen ihre Abzeichen selbst ein, wenn sie ans Konto angebunden werden (Anschluss konto-spiele, Spur D).

const KATALOG = {
  // Abzeichen der Website selbst — vergibt nur der Server (einladung/einladungDienst.js), nie ein Spiel
  website: [
    { id: "eingeladen", name: { de: "Eingeladen", en: "Invited" }, text: { de: "Über eine Einladung dazugekommen und geblieben", en: "Joined through an invite and stayed" } },
    { id: "gastgeber", name: { de: "Gastgeber", en: "Host" }, text: { de: "Einen Freund eingeladen, der dabeigeblieben ist", en: "Invited a friend who stayed" } },
    { id: "netzwerker", name: { de: "Netzwerker", en: "Connector" }, text: { de: "Drei Freunde eingeladen, die dabeigeblieben sind", en: "Invited three friends who stayed" } },
    { id: "botschafter", name: { de: "Botschafter", en: "Ambassador" }, text: { de: "Zehn Freunde eingeladen, die dabeigeblieben sind", en: "Invited ten friends who stayed" } },
    // Vergibt nur der Server nach einer bezahlten Unterstützung (laden/ladenDienst.js)
    { id: "unterstuetzer", name: { de: "Unterstützer", en: "Supporter" }, text: { de: "Hat die Website mit einem Beitrag unterstützt", en: "Supported the website with a contribution" } },
  ],
  // ── Spiele (Spur D, 17.11.2026). Die Browser-Spiele leiten sie aus ihrem Stand ab (Frontend/src/pages/<Spiel>/kontoStand.js).
  // Flick Soccer: IDs = die Erfolge im Spiel (progress.js), daher mit Unterstrich
  "flick-soccer": [
    { id: "anpfiff", name: { de: "Anpfiff", en: "Kick-off" }, text: { de: "Die erste Partie Flick Soccer gespielt", en: "Played your first match of Flick Soccer" } },
    { id: "hattrick", name: { de: "Hattrick", en: "Hat-trick" }, text: { de: "Drei Tore in einer Partie", en: "Three goals in one match" } },
    { id: "weisse_weste", name: { de: "Weiße Weste", en: "Clean sheet" }, text: { de: "Ohne Gegentor gewonnen", en: "Won without conceding a goal" } },
    { id: "profi", name: { de: "Profi-Bezwinger", en: "Pro slayer" }, text: { de: "Den Computer auf Profi besiegt", en: "Beat the computer on Pro" } },
    { id: "online", name: { de: "Auswärtssieg", en: "Away win" }, text: { de: "Ein Online-Spiel gewonnen", en: "Won an online match" } },
    { id: "tour_ganz", name: { de: "Tour-Sieger", en: "Tour champion" }, text: { de: "Alle Gegner der Tour besiegt", en: "Beat every opponent on the tour" } },
    { id: "trick_ganz", name: { de: "Zauberfuß", en: "Magic boot" }, text: { de: "Alle Trickschüsse gelöst", en: "Solved every trick shot" } },
    { id: "dauerbrenner", name: { de: "Dauerbrenner", en: "Regular" }, text: { de: "50 Partien Flick Soccer gespielt", en: "Played 50 matches of Flick Soccer" } },
  ],
  "lights-out": [
    { id: "erste-ebene", name: { de: "Aus dem Wald", en: "Out of the woods" }, text: { de: "Die erste Ebene von Lights Out überstanden", en: "Survived the first level of Lights Out" } },
    { id: "entkommen", name: { de: "Entkommen", en: "Escaped" }, text: { de: "Aus dem Sanatorium Erlengrund entkommen", en: "Escaped the Erlengrund sanatorium" } },
    { id: "akte", name: { de: "Akte vollständig", en: "Case file complete" }, text: { de: "Alle Notizen in Lights Out gefunden", en: "Found every note in Lights Out" } },
    { id: "gemeinsam", name: { de: "Nicht allein", en: "Not alone" }, text: { de: "Im Koop gemeinsam entkommen", en: "Escaped together in co-op" } },
  ],
  blobby: [
    { id: "erster-sieg", name: { de: "Erster Aufschlag", en: "First serve" }, text: { de: "Die erste Partie Blobby Volley gewonnen", en: "Won your first match of Blobby Volley" } },
    { id: "zu-null", name: { de: "Zu null", en: "Shutout" }, text: { de: "Eine Partie ohne Gegenpunkt gewonnen", en: "Won a match without conceding a point" } },
    { id: "koenig", name: { de: "König des Strandes", en: "King of the beach" }, text: { de: "Dreimal in Folge König geblieben", en: "Stayed king three times in a row" } },
    { id: "stammgast", name: { de: "Stammgast am Strand", en: "Beach regular" }, text: { de: "50 Partien Blobby Volley gespielt", en: "Played 50 matches of Blobby Volley" } },
  ],
  worldflip: [
    { id: "erster-sieg", name: { de: "Erste Welt gedreht", en: "First flip" }, text: { de: "Eine Runde Worldflip gewonnen", en: "Won a round of Worldflip" } },
    { id: "voller-tisch", name: { de: "Voller Tisch", en: "Full table" }, text: { de: "In Worldflip gegen andere Menschen gewonnen", en: "Won Worldflip against other people" } },
    { id: "teamgeist", name: { de: "Teamgeist", en: "Team spirit" }, text: { de: "Im 2 gegen 2 gewonnen", en: "Won a 2 vs 2 round" } },
    { id: "weltenwender", name: { de: "Weltenwender", en: "World turner" }, text: { de: "10 Runden Worldflip gewonnen", en: "Won 10 rounds of Worldflip" } },
  ],
  "sacrifice-and-sigils": [
    { id: "erster-duellsieg", name: { de: "Erstes Siegel", en: "First sigil" }, text: { de: "Ein Duell in Sacrifice & Sigils gewonnen", en: "Won a duel in Sacrifice & Sigils" } },
    { id: "siegelmeister", name: { de: "Siegelmeister", en: "Sigil master" }, text: { de: "10 Duelle gewonnen", en: "Won 10 duels" } },
    { id: "podest", name: { de: "Aufs Podest", en: "On the podium" }, text: { de: "In der Moorwanderung unter die ersten drei gekommen", en: "Finished in the top three of the Moor Walk" } },
    { id: "durchs-moor", name: { de: "Durchs Moor", en: "Through the moor" }, text: { de: "Eine Moorwanderung gewonnen", en: "Won a Moor Walk" } },
  ],
  spieleabend: [
    { id: "vier-in-reihe", name: { de: "Vier in einer Reihe", en: "Four in a row" }, text: { de: "4 gewinnt am Spieleabend gewonnen", en: "Won Connect Four at game night" } },
    { id: "alle-im-haus", name: { de: "Alle im Haus", en: "All home" }, text: { de: "Mensch ärgere dich nicht gewonnen", en: "Won Ludo" } },
    { id: "hochstapler", name: { de: "Hochstapler", en: "Impostor" }, text: { de: "Als Hochstapler nicht erwischt worden", en: "Wasn't caught as the impostor" } },
    { id: "spuernase", name: { de: "Spürnase", en: "Sleuth" }, text: { de: "Den Hochstapler entlarvt", en: "Exposed the impostor" } },
  ],
  "seed-runners": [
    { id: "erstes-rennen", name: { de: "An der Startlinie", en: "On the start line" }, text: { de: "Das erste Rennen in Seed Runners gelaufen", en: "Ran your first race in Seed Runners" } },
    { id: "rennsieg", name: { de: "Rennsieg", en: "Race win" }, text: { de: "Ein Rennen gegen andere gewonnen", en: "Won a race against others" } },
    { id: "zehn-siege", name: { de: "Seriensieger", en: "Serial winner" }, text: { de: "10 Rennen gewonnen", en: "Won 10 races" } },
    { id: "tagesrennen", name: { de: "Tagesrennen", en: "Daily race" }, text: { de: "Eine Zeit im Tagesrennen gesetzt", en: "Set a time in the daily race" } },
    { id: "tagesform", name: { de: "In Tagesform", en: "In daily form" }, text: { de: "An 7 Tagen im Tagesrennen gelaufen", en: "Ran the daily race on 7 days" } },
  ],
  // adVentures: Auswahl der Erfolge im Spiel (Backend/adventure/meta.js), gespiegelt vom Browser
  adventures: [
    { id: "erster-boss", name: { de: "Erster Boss", en: "First boss" }, text: { de: "In adVentures einen Boss besiegt", en: "Defeated a boss in adVentures" } },
    { id: "drachentoeter", name: { de: "Drachentöter", en: "Dragon slayer" }, text: { de: "Thunderwing besiegt", en: "Defeated Thunderwing" } },
    { id: "albtraum", name: { de: "Albtraumbezwinger", en: "Nightmare conqueror" }, text: { de: "Auf Albtraum gewonnen", en: "Won on Nightmare" } },
    { id: "unmoeglich", name: { de: "Unmöglich, wirklich", en: "Truly impossible" }, text: { de: "Auf Albtraum+ 5 gewonnen", en: "Won on Nightmare+ 5" } },
    { id: "weltenbrand", name: { de: "Weltenbrand", en: "World ablaze" }, text: { de: "30.000 Gegner in einem Lauf besiegt", en: "Defeated 30,000 enemies in one run" } },
    { id: "dritter-zyklus", name: { de: "Dritter Zyklus", en: "Third cycle" }, text: { de: "Zyklus 3 erreicht", en: "Reached cycle 3" } },
    { id: "bodenlos", name: { de: "Bodenlos", en: "Bottomless" }, text: { de: "Tiefe 20 erreicht", en: "Reached depth 20" } },
  ],
};

const ID_FORM = /^[a-z0-9][a-z0-9_-]{0,47}$/;

function erfolgInfo(spiel, id) {
  const liste = Object.prototype.hasOwnProperty.call(KATALOG, spiel) ? KATALOG[spiel] : null;
  return (liste || []).find((e) => e.id === id) || null;
}

const erfolgErlaubt = (spiel, id) => typeof id === "string" && ID_FORM.test(id) && Boolean(erfolgInfo(spiel, id));

module.exports = { KATALOG, erfolgErlaubt, erfolgInfo, ID_FORM };
