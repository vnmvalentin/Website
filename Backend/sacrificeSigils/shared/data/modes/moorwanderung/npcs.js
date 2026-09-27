// data/modes/moorwanderung/npcs.js — Gegner der Moorwanderung: 18 NPCs und 6 Bosse je Zirkel.
//
// NPC: { id, zirkel, biome, name, tribes (Deck-Thema), rule (engine/rules.js), silhouette (Porträt), enter, exit }
// Boss: dasselbe plus zwei Phasen: phases[0] = { rule }, phases[1] = { rule, spawn: [Karten, die beim Phasenwechsel
// auf der Bossseite erscheinen] }. Alle Namen und Texte sind eigene Erfindungen.
// Neue NPCs: Eintrag ergänzen (biome = ID aus biomes.js), Regel aus RULES wählen, Test „Moorwanderung: Daten“ läuft mit.

/** @type {any[]} */
export const NPCS = [
  // ───────── Moor: Aschemoor ─────────
  { id: "aalfaenger", zirkel: "moor", biome: "aschemoor", name: "Der Aalfänger", tribes: ["tiefe"], rule: "schlammbad", silhouette: "fish",
    enter: "Stiefel bis zur Hüfte im Moor. Er hat Geduld.", exit: "Er zieht die leere Reuse ein und geht." },
  { id: "irrlichtmutter", zirkel: "moor", biome: "aschemoor", name: "Die Irrlichtmutter", tribes: ["flatterer"], rule: "irrlichter", silhouette: "moth",
    enter: "Kleine Lichter tanzen um sie. Keines bleibt, wo es war.", exit: "Die Lichter verlöschen eins nach dem anderen." },
  { id: "schilfschneider", zirkel: "moor", biome: "aschemoor", name: "Der Schilfschneider", tribes: ["nager"], rule: "vorrat", silhouette: "rodent",
    enter: "Seine Taschen sind voller Dinge, die er gefunden hat.", exit: "Er murmelt etwas von besserem Schilf und verschwindet." },
  // ───────── Moor: Birkengrab ─────────
  { id: "kraehenweib", zirkel: "moor", biome: "birkengrab", name: "Das Krähenweib", tribes: ["nachtvoegel", "aasfresser"], rule: "kraehenzug", silhouette: "bird",
    enter: "Hundert schwarze Augen sehen dich an. Zwei davon gehören ihr.", exit: "Die Krähen fliegen auf und nehmen sie mit." },
  { id: "birkenwaechter", zirkel: "moor", biome: "birkengrab", name: "Der Birkenwächter", tribes: ["wurzelvolk"], rule: "dornenhecke", silhouette: "root",
    enter: "Die Rinde spricht, bevor er es tut.", exit: "Er wird wieder zu einem Baum unter vielen." },
  { id: "grabgraeber", zirkel: "moor", biome: "birkengrab", name: "Der Grabgräber", tribes: ["gebeine"], rule: "knochenhort", silhouette: "skeleton",
    enter: "Er stützt sich auf die Schaufel und zählt deine Karten.", exit: "Er wirft eine letzte Schaufel Erde und nickt." },
  // ───────── Moor: Die ersoffene Kapelle ─────────
  { id: "gloeckner", zirkel: "moor", biome: "kapelle", name: "Der Glöckner", tribes: ["nachtvoegel", "stammlose"], rule: "glockengelaeut", silhouette: "construct",
    enter: "Das Seil in seinen Händen ist nass. Die Glocke schweigt noch.", exit: "Ein letzter Schlag, dann ist es still." },
  { id: "wachszieherin", zirkel: "moor", biome: "kapelle", name: "Die Wachszieherin", tribes: ["kerzenwesen"], rule: "zufluss", silhouette: "candle",
    enter: "Ihre Finger sind weiß vom Wachs. Die Kerzen um sie brennen nie herunter.", exit: "Sie bläst eine Kerze aus. Eine einzige." },
  { id: "taeufer", zirkel: "moor", biome: "kapelle", name: "Der Täufer", tribes: ["tiefe", "kriecher"], rule: "vorsprung", silhouette: "serpent",
    enter: "Er steht im Taufbecken und winkt dich zu sich.", exit: "Das Wasser schließt sich über ihm." },
  // ───────── Moor: Myzelhöhlen ─────────
  { id: "sporenmutter", zirkel: "moor", biome: "myzelhoehlen", name: "Mutter der Sporen", tribes: ["myzel"], rule: "sporenregen", silhouette: "fungus",
    enter: "Wo sie atmet, wächst etwas.", exit: "Sie zerfällt zu Staub, der leise weiterwächst." },
  { id: "pilzsammler", zirkel: "moor", biome: "myzelhoehlen", name: "Der Pilzsammler", tribes: ["myzel", "schwaerme"], rule: "grabesruhe", silhouette: "insect",
    enter: "Er riecht nach Erde und nach etwas Älterem.", exit: "Er klaubt seine Pilze auf und kriecht davon." },
  { id: "schwarmstimme", zirkel: "moor", biome: "myzelhoehlen", name: "Die Schwarmstimme", tribes: ["schwaerme"], rule: "raserei", silhouette: "insect",
    enter: "Sie spricht mit tausend Flügeln.", exit: "Das Summen wird leiser und leiser." },
  // ───────── Moor: Knochenfelder ─────────
  { id: "knochenschaefer", zirkel: "moor", biome: "knochenfelder", name: "Der Knochenschäfer", tribes: ["gebeine", "gehoernte"], rule: "zaehesfleisch", silhouette: "horned",
    enter: "Seine Herde hat kein Fell mehr, nur noch Geduld.", exit: "Er pfeift seine Herde zusammen und zieht weiter." },
  { id: "aschenbraut", zirkel: "moor", biome: "knochenfelder", name: "Die Aschenbraut", tribes: ["aasfresser"], rule: "aschenregen", silhouette: "bird",
    enter: "Ihr Schleier ist aus Asche. Er rieselt, wenn sie lächelt.", exit: "Der Wind nimmt den Schleier, und sie ist fort." },
  { id: "hornbrecher", zirkel: "moor", biome: "knochenfelder", name: "Der Hornbrecher", tribes: ["gehoernte"], rule: "panzerhaut", silhouette: "horned",
    enter: "Er senkt den Kopf. Das ist seine Begrüßung.", exit: "Er schnaubt und trottet in den Staub." },
  // ───────── Moor: Das Schwarze Ufer ─────────
  { id: "faehrfrau", zirkel: "moor", biome: "schwarzesufer", name: "Die Fährfrau", tribes: ["tiefe", "kriecher"], rule: "bluternte", silhouette: "serpent",
    enter: "Sie verlangt keinen Lohn. Noch nicht.", exit: "Ihr Boot legt ab, ohne dich." },
  { id: "natternkoenig", zirkel: "moor", biome: "schwarzesufer", name: "Der Natternkönig", tribes: ["kriecher"], rule: "giftzahn", silhouette: "serpent",
    enter: "Seine Krone windet sich.", exit: "Er gleitet ins schwarze Wasser zurück." },
  { id: "schattenzeichner", zirkel: "moor", biome: "schwarzesufer", name: "Der Schattenzeichner", tribes: ["stammlose", "bestien"], rule: "hinterlist", silhouette: "construct",
    enter: "Er zeichnet mit deiner Tinte. Du hast sie ihm nicht gegeben.", exit: "Er radiert sich selbst aus." },

  // ───────── Gezeiten: Das Watt ─────────
  { id: "wattlaeuferin", zirkel: "gezeiten", biome: "watt", name: "Die Wattläuferin", tribes: ["moewen", "schnecken"], rule: "wattgang", silhouette: "bird",
    enter: "Sie geht barfuß, wo andere einsinken.", exit: "Die Flut verwischt ihre Spuren." },
  { id: "muschelsucher", zirkel: "gezeiten", biome: "watt", name: "Der Muschelsucher", tribes: ["muschelvolk"], rule: "zufluss", silhouette: "shell",
    enter: "Sein Eimer ist voll, sein Blick ist leer.", exit: "Er kippt den Eimer aus und fängt von vorn an." },
  { id: "prielwirt", zirkel: "gezeiten", biome: "watt", name: "Der Prielwirt", tribes: ["scherenvolk"], rule: "panzerhaut", silhouette: "fish",
    enter: "Er schenkt Salzwasser aus und nennt es Gastfreundschaft.", exit: "Er klappert mit den Scheren und zieht sich zurück." },
  // ───────── Gezeiten: Die Salzwiesen ─────────
  { id: "moewenmutter", zirkel: "gezeiten", biome: "salzwiesen", name: "Die Möwenmutter", tribes: ["moewen"], rule: "kraehenzug", silhouette: "bird",
    enter: "Sie schreit, und hundert Schnäbel antworten.", exit: "Der Schwarm zieht über den Deich davon." },
  { id: "deichgraf", zirkel: "gezeiten", biome: "salzwiesen", name: "Der Deichgraf", tribes: ["treibgut", "wracks"], rule: "vorsprung", silhouette: "construct",
    enter: "Er hält das Meer auf. Heute auch dich.", exit: "Er geht den Deich ab, als wärst du nie da gewesen." },
  { id: "tangweberin", zirkel: "gezeiten", biome: "salzwiesen", name: "Die Tangweberin", tribes: ["tangwesen"], rule: "schlickfeld", silhouette: "root",
    enter: "Ihr Webstuhl steht im Wasser. Das Muster bist du.", exit: "Sie schneidet den Faden ab." },
  // ───────── Gezeiten: Der versunkene Kirchturm ─────────
  { id: "tiefengloeckner", zirkel: "gezeiten", biome: "kirchturm", name: "Der Glöckner der Tiefe", tribes: ["ertrunkene"], rule: "glockengelaeut", silhouette: "skeleton",
    enter: "Unter dir läutet es. Er zieht am Seil.", exit: "Die Glocke verstummt im Schlamm." },
  { id: "chorfrau", zirkel: "gezeiten", biome: "kirchturm", name: "Die ertrunkene Chorfrau", tribes: ["ertrunkene", "quallen"], rule: "grabesruhe", silhouette: "skeleton",
    enter: "Sie singt noch. Nur hört man es nicht mehr.", exit: "Das Lied bricht mitten im Vers ab." },
  { id: "lotse", zirkel: "gezeiten", biome: "kirchturm", name: "Der Lotse", tribes: ["waerter"], rule: "vorrat", silhouette: "candle",
    enter: "Er kennt jede Untiefe. Auch deine.", exit: "Er löscht seine Laterne und ist nicht mehr zu sehen." },
  // ───────── Gezeiten: Das Korallenriff ─────────
  { id: "riffmutter", zirkel: "gezeiten", biome: "riff", name: "Die Riffmutter", tribes: ["korallen"], rule: "sporenregen", silhouette: "coral",
    enter: "Alles um sie wächst. Auch in dich hinein.", exit: "Sie versteinert, langsam und zufrieden." },
  { id: "quallenhirte", zirkel: "gezeiten", biome: "riff", name: "Der Quallenhirte", tribes: ["quallen"], rule: "dornenhecke", silhouette: "fish",
    enter: "Seine Herde brennt, wenn man sie berührt.", exit: "Die Herde treibt davon. Er folgt ihr." },
  { id: "haikoenig", zirkel: "gezeiten", biome: "riff", name: "Der Haikönig", tribes: ["raubfische"], rule: "raserei", silhouette: "fish",
    enter: "Er kreist. Einmal. Zweimal.", exit: "Eine Flosse, dann nur noch Wasser." },
  // ───────── Gezeiten: Der Schiffsfriedhof ─────────
  { id: "wrackpluenderer", zirkel: "gezeiten", biome: "schiffsfriedhof", name: "Der Wrackplünderer", tribes: ["wracks"], rule: "knochenhort", silhouette: "construct",
    enter: "Was hier liegt, gehört ihm. Du liegst hier.", exit: "Er schultert seinen Sack und klettert in ein anderes Wrack." },
  { id: "ankerschmied", zirkel: "gezeiten", biome: "schiffsfriedhof", name: "Der Ankerschmied", tribes: ["wracks", "schnecken"], rule: "zaehesfleisch", silhouette: "construct",
    enter: "Jeder Schlag seines Hammers hält etwas fest.", exit: "Das Feuer der Esse erlischt zischend." },
  { id: "robbenfrau", zirkel: "gezeiten", biome: "schiffsfriedhof", name: "Die Robbenfrau", tribes: ["robben"], rule: "schlammbad", silhouette: "seal",
    enter: "Sie trägt ihr Fell wie einen Mantel. Oder umgekehrt.", exit: "Ein Platschen, und sie ist unter Wasser." },
  // ───────── Gezeiten: Die Schwarze See ─────────
  { id: "leuchtturmgeist", zirkel: "gezeiten", biome: "schwarzesee", name: "Der Leuchtturmgeist", tribes: ["waerter", "tiefseeleuchter"], rule: "leuchtturm", silhouette: "candle",
    enter: "Sein Licht findet dich, wo du dich auch versteckst.", exit: "Das Licht dreht sich weiter, ohne dich." },
  { id: "sturmbraut", zirkel: "gezeiten", biome: "schwarzesee", name: "Die Sturmbraut", tribes: ["raubfische", "moewen"], rule: "flutzeit", silhouette: "bird",
    enter: "Sie bringt die Flut mit. Früher als gedacht.", exit: "Der Sturm legt sich. Sie auch." },
  { id: "tiefseeangler", zirkel: "gezeiten", biome: "schwarzesee", name: "Der Tiefseeangler", tribes: ["tiefseeleuchter"], rule: "bluternte", silhouette: "fish",
    enter: "Das Licht über seinem Kopf ist freundlich.", exit: "Das Licht sinkt, und mit ihm er." },
];

/** @type {any[]} */
export const BOSSES = [
  // ───────── Moor ─────────
  { id: "moorvogt", zirkel: "moor", biome: "aschemoor", name: "Der Moorvogt", tribes: ["bestien"], silhouette: "quadruped",
    phases: [{ rule: "raserei" }, { rule: "zaehesfleisch", spawn: ["bestien_aschbaer", "bestien_hetzwolf", "bestien_hetzwolf"] }],
    enter: "Er treibt Steuern ein. In Blut.", phase2: "Er ruft sein Rudel.", exit: "Der Vogt sinkt ins Moor, das er so lange verwaltet hat." },
  { id: "birkenkoenigin", zirkel: "moor", biome: "birkengrab", name: "Die Birkenkönigin", tribes: ["wurzelvolk", "nachtvoegel"], silhouette: "root",
    phases: [{ rule: "dornenhecke" }, { rule: "kraehenzug", spawn: ["nachtvoegel_uhu", "wurzelvolk_wurzelwacht", "nachtvoegel_schleiereule"] }],
    enter: "Ihre Krone ist aus weißer Rinde.", phase2: "Die Krähen lassen sich auf ihren Ästen nieder.", exit: "Die Königin wird zu einem Hain aus bleichen Stämmen." },
  { id: "kapellenwaechter", zirkel: "moor", biome: "kapelle", name: "Der Kapellenwächter", tribes: ["kerzenwesen", "tiefe"], silhouette: "candle",
    phases: [{ rule: "glockengelaeut" }, { rule: "schlammbad", spawn: ["tiefe_moorwels", "tiefe_hechtschatten", "kerzenwesen_kerzengeist"] }],
    enter: "Er hütet die letzte Kerze, die nicht unter Wasser brennt.", phase2: "Das Wasser steigt bis zum Altar.", exit: "Die Kerze erlischt. Er mit ihr." },
  { id: "myzelkoenigin", zirkel: "moor", biome: "myzelhoehlen", name: "Die Myzelkönigin", tribes: ["myzel"], silhouette: "fungus",
    phases: [{ rule: "sporenregen" }, { rule: "grabesruhe", spawn: ["myzel_sporenmutter", "myzel_fliegenpilz"] }],
    enter: "Die Höhle ist ihr Körper. Du bist schon drin.", phase2: "Sie wächst aus den Wänden nach.", exit: "Das Leuchten der Pilze wird matt." },
  { id: "beinernerhirte", zirkel: "moor", biome: "knochenfelder", name: "Der Beinerne Hirte", tribes: ["gebeine", "gehoernte"], silhouette: "skeleton",
    phases: [{ rule: "knochenhort" }, { rule: "panzerhaut", spawn: ["gebeine_sargwaechter", "gehoernte_kronenhirsch"] }],
    enter: "Er hat jeden Knochen auf diesem Feld gezählt.", phase2: "Seine Herde steht wieder auf.", exit: "Er legt sich zu seiner Herde." },
  { id: "letzterzeichner", zirkel: "moor", biome: "schwarzesufer", name: "Der Letzte Zeichner", tribes: ["stammlose", "bestien"], silhouette: "construct",
    phases: [{ rule: "vorsprung" }, { rule: "raserei", spawn: ["stammlose_tintengolem", "stammlose_glasgolem", "bestien_mondluchs"] }],
    enter: "Er sitzt an einem Tisch wie deinem. Sein Stift ist schon nass.", phase2: "Er schlägt eine neue Seite auf.", exit: "Er legt den Stift nieder. Zum ersten Mal." },
  // ───────── Gezeiten ─────────
  { id: "wattkoenig", zirkel: "gezeiten", biome: "watt", name: "Der Wattkönig", tribes: ["scherenvolk", "schnecken"], silhouette: "fish",
    phases: [{ rule: "panzerhaut" }, { rule: "raserei", spawn: ["scherenvolk_hummer", "scherenvolk_scherenkoenigin"] }],
    enter: "Sein Thron ist ein umgedrehtes Boot.", phase2: "Er klappert mit allen Scheren zugleich.", exit: "Die Flut holt sich ihren König." },
  { id: "salzmutter", zirkel: "gezeiten", biome: "salzwiesen", name: "Die Salzmutter", tribes: ["muschelvolk", "tangwesen"], silhouette: "shell",
    phases: [{ rule: "zufluss" }, { rule: "dornenhecke", spawn: ["muschelvolk_riesenmuschel", "tangwesen_netztang"] }],
    enter: "Alles Salz dieser Küste ist durch ihre Hände gegangen.", phase2: "Sie schließt ihre Schalen.", exit: "Sie zerfällt zu einem Hügel weißer Kristalle." },
  { id: "versunkenerpfarrer", zirkel: "gezeiten", biome: "kirchturm", name: "Der versunkene Pfarrer", tribes: ["ertrunkene"], silhouette: "skeleton",
    phases: [{ rule: "glockengelaeut" }, { rule: "grabesruhe", spawn: ["ertrunkene_glockentaucher", "ertrunkene_kielholer"] }],
    enter: "Er predigt noch immer. Die Gemeinde liegt um ihn herum.", phase2: "Die Gemeinde erhebt sich.", exit: "Das letzte Amen geht in Blasen auf." },
  { id: "riffherz", zirkel: "gezeiten", biome: "riff", name: "Das Riffherz", tribes: ["korallen", "quallen"], silhouette: "coral",
    phases: [{ rule: "sporenregen" }, { rule: "hinterlist", spawn: ["korallen_hornkoralle", "quallen_staatsqualle"] }],
    enter: "Es schlägt. Das ganze Riff schlägt mit.", phase2: "Das Riff öffnet sich.", exit: "Das Herz wird still, und die Farben mit ihm." },
  { id: "kapitaenohneschiff", zirkel: "gezeiten", biome: "schiffsfriedhof", name: "Der Kapitän ohne Schiff", tribes: ["wracks", "robben"], silhouette: "construct",
    phases: [{ rule: "vorsprung" }, { rule: "zaehesfleisch", spawn: ["wracks_wrackgolem", "robben_walross"] }],
    enter: "Er sucht eine Mannschaft. Du wirst gebraucht.", phase2: "Er ruft alle Mann an Deck.", exit: "Er salutiert und sinkt mit dem Wrack." },
  { id: "schwarzeflut", zirkel: "gezeiten", biome: "schwarzesee", name: "Die Schwarze Flut", tribes: ["raubfische", "tiefseeleuchter"], silhouette: "fish",
    phases: [{ rule: "flutzeit" }, { rule: "raserei", spawn: ["raubfische_weisserhai", "raubfische_hammerhai", "tiefseeleuchter_drachenfisch"] }],
    enter: "Das Wasser selbst hat ein Gesicht bekommen.", phase2: "Die Tiefe kommt nach oben.", exit: "Die See wird glatt und schwarz." },
];

/** @type {Record<string, any>} */
export const NPC_BY_ID = Object.fromEntries([...NPCS, ...BOSSES].map((n) => [n.id, n]));

/** NPCs eines Bioms. @param {string} biome */
export function npcsOf(biome) {
  return NPCS.filter((n) => n.biome === biome);
}

/** Boss eines Bioms. @param {string} biome */
export function bossOf(biome) {
  return BOSSES.find((b) => b.biome === biome) || null;
}
