// lore.js — die Geschichte von Lights Out als Notizen und Fundstücke, die in den Ebenen liegen. Ohne three.js,
// damit das Menü („Akte“) sie lesen kann, ohne die Spielwelt zu laden.
//
// Kurzfassung: Das Sanatorium Erlengrund wurde 1987 geschlossen. Dr. Vogt behandelte dort mit seiner
// „Dunkelkur“ — kein Licht, bis die Patienten keins mehr brauchten. Erfunden hat er sie für seinen eigenen Sohn
// Emil, der kein Licht vertrug. Was davon übrig ist, lebt noch dort:
//   Wald    → der Förster, der am Zaun Wache stand (Beobachter)
//   Anstalt → Schwester Agnes Reuter auf ihrer Nachtrunde (Jäger); sie hat sich als Erste des Personals zur
//             Dunkelkur gemeldet und die Station danach nie mehr verlassen
//   Keller  → Patient 12 aus dem Dunkelraum: Emil Vogt (Lauscher)
//   Garten  → Wilhelm, der Gärtner, der die Gräber aushob (Gärtner)
// Man selbst ist Lena und sucht den Bruder Jonas, der vor drei Tagen hierher aufgebrochen ist. Die Geschichte baut
// sich Ebene für Ebene auf: erst der Förster, dann wer die Nachtschwester war, dann wessen Kur das Ganze eigentlich
// war, zuletzt die Gräber — und überall Spuren von Jonas (Rucksack, Uhr, Kamera, Handy), an denen man sieht, dass
// er vor einem denselben Weg genommen hat.
//
// Jonas' Zettel erklären nebenbei, wie man das jeweilige Ding überlebt. Ausnahme Wald: Wie man dem Beobachter
// entkommt, sagt Jonas schon im Vorspann am Telefon (game.js: CUES) — die Wald-Notizen wiederholen das nicht, sie
// erzählen vom Förster und führen zu Brecheisen, Schlüssel und Code.
//
// Felder: item = Fundstück statt Blatt (pack | watch | camera | phone; game.js legt das Modell hin),
// where = wo es liegt. Wald: gate | hut | camp | pack (feste Orte). Anstalt: Zimmerart (office, doctor, dorm …),
// hall = irgendwo auf dem Flur, start = auf dem Flur gleich am Anfang, exit = Flur nahe der Treppe.
// Keller/Garten: exit = kurz vor dem Ausgang, sonst weit verteilt.

/** Notizen und Fundstücke je Welt (theme aus levels.js), in Lesereihenfolge. */
export const NOTES = {
  forest: [
    {
      id: 'w1',
      where: 'gate',
      title: 'Zettel am Tor',
      text: 'Lena, falls du mich suchst: Ich bin im Sanatorium Erlengrund. Steht seit 1987 leer. Eine Nacht, ein paar Fotos, morgen bin ich zurück. Der Förster hatte einen Schlüssel fürs Haus. Seine Hütte steht im Wald, an der Wand brennt noch eine Laterne. — Jonas',
    },
    {
      id: 'w3',
      where: 'camp',
      title: 'Jonas, erste Nacht',
      text: 'Die Hütte des Försters war vernagelt. Ich habe die Bretter mit einem Brecheisen abgehebelt, drinnen lag der Hausschlüssel. Am Morgen war die Tür wieder zugenagelt. Von außen. Das Brecheisen habe ich am Seil in den Brunnen gehängt, falls ich es noch einmal brauche. Der Türcode steht an den Bäumen mit dem roten Band — einer davon gehört nicht dazu.',
    },
    {
      id: 'w4',
      where: 'pack',
      item: 'pack',
      title: 'Jonas’ Rucksack',
      text: 'Schlafsack, Gaskocher, drei leere Filmdosen. Im Seitenfach ein Foto von euch beiden am See. Auf der Rückseite, in seiner Schrift: „Erlengrund. Eine Nacht, dann erzähle ich dir alles.“ Die Kamera fehlt.',
    },
    {
      id: 'w2',
      where: 'hut',
      title: 'Dienstbuch des Försters, Oktober 1987',
      text: 'Doktor Vogt hat die Fenster vernageln lassen. Er nennt es Dunkelkur: Wer lange genug ohne Licht lebt, braucht keins mehr. Ich soll nachts am Zaun stehen und melden, wer das Haus verlässt. Ich stehe jetzt jede Nacht. Ich schlafe nicht mehr. Das Licht tut mir weh. Den Hausschlüssel lege ich auf den Tisch — ich gehe nicht mehr hinein.',
    },
  ],
  halls: [
    {
      id: 'a7',
      where: 'start',
      item: 'watch',
      title: 'Jonas’ Armbanduhr',
      text: 'Das Glas ist gesprungen, das Band gerissen. Auf der Rückseite die Gravur: „Für Jonas, von Lena“. Sie läuft noch. Er ist hier durchgekommen — und er hätte sie nicht liegen lassen, wenn er Zeit gehabt hätte, sie aufzuheben.',
    },
    {
      id: 'a1',
      where: 'hall',
      title: 'Aufnahmebogen, Station 3',
      text: 'Sanatorium Erlengrund. Behandlung: Dunkelkur nach Dr. Vogt. Kein Tageslicht, keine Lampen, kein Besuch. Dauer: bis zur Besserung. Entlassungen im Jahr 1987: keine.',
    },
    {
      id: 'a4',
      where: 'office',
      title: 'Personalakte',
      text: 'Agnes Reuter, geboren 1931. Stationsschwester der Station 3 seit 1962, Nachtdienst auf eigenen Wunsch. Keine Angehörigen. Vermerk Dr. Vogt, 1986: „Schwester Agnes erkennt jeden Patienten am Schritt. Von uns allen braucht sie das Licht am wenigsten.“',
    },
    {
      id: 'a5',
      where: 'doctor',
      title: 'Dr. Vogt, Behandlungsnotiz',
      text: 'Schwester Agnes hat sich als Erste des Personals zur Dunkelkur gemeldet — sie wollte wissen, was wir den Patienten zumuten. Nach vierzig Tagen wollte sie die Station nicht mehr verlassen. Sie macht ihre Runde wie immer und summt dabei das Wiegenlied, mit dem sie früher die Unruhigen in den Schlaf gebracht hat. Ich habe ihr die Lampe abgenommen. Sie hat es nicht bemerkt.',
    },
    {
      id: 'a6',
      where: 'dorm',
      title: 'Zettel unter einer Matratze',
      text: 'Wenn sie summt, ist alles gut. Wenn sie aufhört, hat sie dich gehört. Dann nicht rennen. Kein Licht. In den Schrank. Sie macht keinen Schrank auf: Was den Patienten gehört, bleibt zu — das hat sie uns selbst beigebracht, als sie noch mit uns gesprochen hat.',
    },
    {
      id: 'a2',
      where: 'hall',
      title: 'Schwester Agnes, Nachtwache',
      text: 'Der Doktor hat mir die Lampe abgenommen. Ich mache die Runde jetzt ohne. Ich finde sie trotzdem alle: Wer rennt, den höre ich. Wer Licht macht, den sehe ich. In die Zimmer gehe ich nur noch, wenn ich etwas höre. In die Spinde schaue ich nie. Das gehört sich nicht.',
    },
    {
      id: 'a3',
      where: 'exit',
      title: 'Jonas, zweiter Tag',
      text: 'Kein Strom, die Treppe nach unten ist verriegelt. Im Kasten fehlen die Sicherungen, sie liegen in den Zimmern. Sie macht immer noch ihre Runde. Ich stand im Spind, als sie vorbeikam. Sie ist davor stehen geblieben. Lange. Dann hat sie weitergesummt.',
    },
  ],
  cellar: [
    {
      id: 'k1',
      title: 'Krankenakte, Patient 12',
      text: 'Seit 400 Tagen im Dunkelraum. Die Augen reagieren nicht mehr. Das Gehör dafür auf jeden Tropfen. Der Patient ortet uns durch Schnalzen mit der Zunge. Dr. Vogt nennt es einen Erfolg. Name des Patienten: geschwärzt.',
    },
    {
      id: 'k4',
      title: 'Brief, nie abgeschickt',
      text: 'Margarete, Emil erkennt mich nicht mehr an der Stimme, nur noch am Schritt. Er hat das Licht nie vertragen, schon als Kind nicht. Ich habe ihm versprochen, dass es nicht mehr wehtut, wenn es ganz weg ist. Er ist Patient 12, weil ich an elf anderen geübt habe. Verzeih mir das nicht.',
    },
    {
      id: 'k5',
      item: 'camera',
      title: 'Jonas’ Kamera',
      text: 'Der Blitz ist zersplittert, das Gehäuse nass. Das Zählwerk steht auf 36 von 36: Er hat hier unten den ganzen Film verschossen. Ein Blitz nach dem anderen — und dann hat er sie fallen lassen.',
    },
    {
      id: 'k2',
      title: 'Dr. Vogt, letzter Eintrag',
      text: 'Sie brauchen kein Licht mehr. Sie brauchen auch uns nicht mehr. Ich habe die drei Ventile zugedreht und den Notausgang verriegelt. Was hier unten ist, bleibt hier unten. Mein Sohn auch. Ich auch.',
    },
    {
      id: 'k3',
      title: 'Jonas, zweite Nacht',
      text: 'Es ist blind. Es klickt und horcht. Licht ist ihm egal, Schritte nicht. Ich bin auf Glas getreten und es war sofort da. Ich schreibe das im Stehen. Ich atme nicht.',
    },
  ],
  garden: [
    {
      id: 'g1',
      title: 'Arbeitsbuch des Gärtners',
      text: 'Der Doktor sagt: Wer nicht besser wird, kommt in den Garten. Ich grabe nachts. Über jedes Beet stelle ich eine Figur, damit ich weiß, wo ich schon war. Den Rest finde ich mit der Nase.',
    },
    {
      id: 'g4',
      title: 'Liste, mit Erde verschmiert',
      text: 'Beet 1 bis 11: die vom Doktor. Beet 12 musste ich für seinen Jungen ausheben und wieder zuschütten, leer. Beet 13 ist für die Schwester, sagt er. Sie kommt aber nicht herunter. Beet 14 habe ich für mich gemacht. Es ist das einzige, das ich nicht zuschütten kann.',
    },
    {
      id: 'g2',
      title: 'Zettel am Brunnen',
      text: 'Die Figuren sollen zum roten Licht sehen, hat der Doktor gesagt. Dann geht das Tor auf und alle dürfen heim. Wilhelm dreht sie jede Nacht wieder weg.',
    },
    {
      id: 'g5',
      where: 'exit',
      item: 'phone',
      title: 'Jonas’ Handy',
      text: 'Das Display ist gesprungen, ein Balken Akku. Letzter Anruf: „Lena“, zwei Minuten elf, abgebrochen. Darunter eine Nachricht, nicht gesendet: „Bin am Tor. Dreh um. Bitte dreh um.“',
    },
    {
      id: 'g3',
      title: 'Jonas, dritter Tag',
      text: 'Lena, falls du das liest: Ich bin durchs Tor. Folge nicht seiner Spur, er folgt deiner. Bleib nicht stehen. Ich warte an der Straße.',
    },
  ],
};

/** Alle Notizen in Lesereihenfolge (für die Akte im Menü). */
export const ALL_NOTES = Object.values(NOTES).flat();
