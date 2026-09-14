// Spielanleitungen der acht Modi — der Inhalt der Tutorial-Dialoge auf der Startseite.
//
// WARUM HIER UND NICHT IN modesConfig.js:
// Dort steht der EINE Satz, der auf der Kachel und in den strukturierten Daten (jsonLd.js)
// landet. Der darf nicht wachsen: Google gleicht die ItemList-Beschreibung mit dem
// sichtbaren Text ab, und die Kachel soll knapp bleiben. Die ausführliche Anleitung ist
// etwas anderes und lebt deshalb getrennt.
//
// AUFBAU EINES EINTRAGS:
//   goal   Ein Satz: Was ist das Ziel? Steht ganz oben, größer als der Rest.
//   steps  Der Ablauf einer Runde, in der Reihenfolge, in der er passiert.
//   tips   Was man erst nach ein paar Partien merkt — der eigentliche Mehrwert.
//   host   Was der Host einstellen kann und was das bewirkt.
//
// Alle Angaben müssen zum tatsächlichen Verhalten passen. Wenn im Backend eine Regel
// geändert wird (z.B. die Pflicht-Aufdeckungen im Karussell), gehört die Änderung auch
// hierher — eine falsche Anleitung ist schlimmer als keine.

const TUTORIALS = {
  de: {
    snake: {
      goal: 'Baue in acht Runden ein 8-Karten-Deck — aber du darfst dich nur Feld für Feld durch das Raster bewegen.',
      steps: [
        'Alle Spieler ziehen reihum. Wer dran ist, hat einen Zeitlimit-Balken oben.',
        'Der erste Zug ist frei: Du darfst jedes Feld im Raster nehmen.',
        'Danach darfst du nur noch ein Feld nehmen, das direkt an das zuletzt genommene grenzt — oben, unten, links oder rechts.',
        'Ist kein Nachbarfeld mehr frei, wird die Schlange zurückgesetzt und du darfst wieder frei wählen.',
        'Nach acht Runden hat jeder acht Karten.',
      ],
      tips: [
        'Der Zug davor bestimmt deine Auswahl. Lieber eine mittelmäßige Karte nehmen, die in einer guten Gegend liegt, als die beste Karte am Rand.',
        'Genommene Felder sperren auch die Gegner aus. Man kann jemanden gezielt in eine leere Ecke drängen.',
        'Champion-Karten sind auf zwei pro Deck begrenzt — danach werden sie ausgegraut.',
      ],
      host: 'Rastergröße und Bedenkzeit pro Zug sind einstellbar. Größere Raster machen den Draft entspannter, kleinere zwingen früher zu Kompromissen.',
    },

    auction: {
      goal: 'Ersteigere die besten Karten mit einem festen Elixiervorrat, der über das ganze Spiel reichen muss.',
      steps: [
        'Jede Runde werden mehrere Karten gleichzeitig ausgelegt.',
        'Du stellst deinen Einsatz ein und klickst dann auf die Karte, die du haben willst. Alle bieten verdeckt.',
        'Haben alle geboten (oder ist die Zeit um), wird aufgelöst: Wer am meisten geboten hat, bekommt die Karte.',
        'Alle Beträge werden offengelegt — du siehst, wer wie viel gesetzt hat.',
        'Wer leer ausgeht, bekommt eine Karte, auf die niemand geboten hat, oder eine Bonuskarte von außerhalb.',
        'In der letzten Runde zählt automatisch dein gesamtes Restelixier — du wählst nur noch die Karte.',
      ],
      tips: [
        'Elixier, das am Ende übrig ist, ist verschenkt. Rechne rückwärts: Was willst du dir in den letzten Runden noch leisten können?',
        'Die aufgedeckten Gebote sind bares Geld wert. Wer eben 40 gesetzt hat, kann in der nächsten Runde nicht mehr mithalten.',
        'Auf eine Karte zu bieten, die alle wollen, kann teurer sein als eine unbeachtete Karte für 1 Elixier mitzunehmen.',
        'Ist die Mutterhexe aktiv, kann eine Runde manipuliert sein — verlass dich nicht blind auf das, was du siehst.',
      ],
      host: 'Startelixier, Karten pro Runde, Bietzeit, sichtbares Gegner-Elixier und die Mutterhexe sind einstellbar.',
    },

    bingo: {
      goal: 'Fülle deine Bingokarte: Jedes Feld verlangt eine Karten-Eigenschaft, und volle Reihen geben dir Power-Ups.',
      steps: [
        'Jeder bekommt eine eigene 4×4-Bingokarte. Jedes Feld nennt eine Eigenschaft, z.B. „Legendär" oder „Kosten: 5+".',
        'Reihum wählt ein Spieler eine der ausliegenden Karten.',
        'Die Karte muss auf ein Feld gelegt werden, dessen Eigenschaft sie erfüllt.',
        'Passt sie auf kein Feld, darfst du sie irgendwohin legen — das Feld ist dann aber blockiert.',
        'Eine volle Reihe, Spalte oder Diagonale gibt Tokens für den Power-Up-Shop.',
      ],
      tips: [
        'Eine Karte, die auf viele Felder passt, hebt man sich auf. Spezialisten legt man sofort.',
        'Blockieren ist nicht immer schlecht: Ein absichtlich verbautes Feld kann besser sein als eine Karte, die man nicht braucht.',
        'Behalte die Reihen im Blick, denen nur noch ein Feld fehlt — dafür lohnt es sich, eine gute Karte ziehen zu lassen.',
      ],
      host: 'Karten pro Runde und Bedenkzeit sind einstellbar.',
    },

    'shadow-carousel': {
      goal: 'Nimm dir Karten von einem Tisch voller verdeckter Karten — und wandere danach zum Tisch des Nächsten weiter.',
      steps: [
        'Jeder Spieler sitzt an einem eigenen Tisch mit verdeckten Karten.',
        'Zuerst musst du deine Aufdeckungen verbrauchen: In den ersten Runden zwei, später eine.',
        'Erst danach darfst du nehmen — und zwar jede Karte am Tisch, auch eine verdeckte.',
        'Am Rundenende wandern alle Tische einen Platz weiter. Was du aufgedeckt und stehen gelassen hast, sieht der Nächste nicht.',
      ],
      tips: [
        'Wer eine gute Karte aufdeckt und nicht nimmt, verschenkt sie an den Nächsten — mit dem Wissen, dass sie gut ist, ist er nicht.',
        'Eine verdeckte Karte zu nehmen ist ein echtes Risiko, aber am Rundenende manchmal die einzige Chance auf etwas Seltenes.',
        'Merke dir, was an den Tischen lag, die du schon hattest — sie kommen im Karussell wieder.',
      ],
      host: 'Tischgröße (8, 12 oder 16 Karten) und Aufdecksystem sind einstellbar.',
    },

    'elixir-rush': {
      goal: 'Kaufe Karten vom Marktplatz, bevor es jemand anders tut — Elixier lädt sich in Echtzeit nach.',
      steps: [
        'Auf dem Marktplatz liegen mehrere Karten mit Elixierkosten.',
        'Dein Elixierbalken füllt sich fortlaufend von selbst.',
        'Klick auf eine Karte, die du dir leisten kannst — sie gehört sofort dir. Wer zuerst klickt, gewinnt.',
        'Gekaufte und abgelaufene Karten werden nachgefüllt; das Angebot wechselt ständig.',
        'Ist dein Balken voll und du kaufst nichts, kauft das Spiel nach kurzer Zeit zufällig für dich.',
      ],
      tips: [
        'Voller Balken heißt verschwendete Nachfüllzeit. Lieber öfter günstig kaufen als lange auf die teure Karte sparen.',
        'Beobachte die Restzeit der Karten: Eine, die gleich abläuft, nimmt dir vielleicht niemand mehr weg.',
        'Bei teuren Karten lohnt es sich zu warten, bis der Balken fast voll ist — sonst kauft ein anderer sie dir vor der Nase weg.',
      ],
      host: 'Anzahl der Marktplätze, Wechselzeit der Karten und die Sichtbarkeit von Elixier und Timer sind einstellbar.',
    },

    'card-evolution': {
      goal: 'Starte mit Platzhaltern und würfle sie mit Tokens zu echten Karten hoch — oder sabotiere die Decks der anderen.',
      steps: [
        'Jeder startet mit acht Platzhaltern und einem Tokenvorrat.',
        'Pfeil hoch wertet einen Platz auf, Pfeil runter ab. Beides kostet Tokens und zieht zwei Kandidaten, aus denen du wählst.',
        'Jeder weitere Klick auf denselben Platz wird teurer.',
        'Ein Klick auf die Karte selbst friert sie ein — danach kann sie niemand mehr verändern, auch du nicht.',
        'In der Sabotage-Runde darfst du ungelockte Karten der anderen neu würfeln lassen.',
      ],
      tips: [
        'Einfrieren ist der einzige Schutz vor Sabotage. Was dir wirklich wichtig ist, sperrst du besser früh.',
        'Der Kartenpool ist begrenzt — oben in der Leiste steht, wie viele Karten jeder Seltenheit noch übrig sind.',
        'Tokens sind knapp. Acht Karten auf Legendär hochzuwürfeln geht nicht auf.',
      ],
      host: 'Startguthaben an Tokens und die Dauer der Auswahl- und Sabotagerunden sind einstellbar.',
    },

    'angel-royale': {
      goal: 'Angle dir acht Karten aus einem Fluss, in dem sie vorbeischwimmen — wer zu lange zögert, bekommt eine zugelost.',
      steps: [
        'Karten treiben von der einen Seite zur anderen durch den Fluss.',
        'Klick auf eine Karte, um sie zu angeln. Danach braucht deine Angel kurz, bis sie wieder bereit ist.',
        'Wer zu lange nicht angelt, bekommt automatisch eine zufällige treibende Karte.',
        'Manche Karten schießen in kurzen Schüben quer durch das Bild — die muss man treffen.',
        'Fertig ist, wer acht Karten hat.',
      ],
      tips: [
        'Alle fischen im selben Fluss. Was du liegen lässt, kann sich jemand anders holen.',
        'Der Angel-Cooldown ist der eigentliche Preis: Eine mittelmäßige Karte jetzt kann teurer sein als drei Sekunden Warten.',
        'Die Frist bis zur Zwangs-Angel läuft mit — der Balken unten zeigt sie an.',
      ],
      host: 'Wie viele Karten pro Sekunde erscheinen, der Angel-Cooldown und die Frist bis zur Zwangs-Angel sind einstellbar.',
    },

    'dark-maze': {
      goal: 'Suche im dunklen Labyrinth nach Truhen — dein Licht reicht nur ein paar Schritte weit.',
      steps: [
        'Du bewegst dich mit den Pfeiltasten (oder per Wischen) durch ein Labyrinth.',
        'Sichtbar ist nur ein kleiner Bereich um dich herum.',
        'Truhen enthalten Karten. Steh auf einer Truhe und nimm sie auf.',
        'Alle Spieler laufen im selben Labyrinth — eine geöffnete Truhe ist für die anderen weg.',
        'Das Spiel endet, wenn alle acht Karten haben oder die Zeit abläuft.',
      ],
      tips: [
        'Systematisch eine Richtung abzusuchen bringt mehr als hin- und herzulaufen.',
        'Die Lichtquellen anderer Spieler verraten, wo bereits gesucht wurde.',
        'Die Restzeit steht oben — wer am Ende weniger als acht Karten hat, behält nur die gefundenen.',
      ],
      host: 'Das Zeitlimit ist einstellbar.',
    },

    'trap-setter': {
      goal: 'Tarne eine deiner Trap-Karten als etwas Attraktives — und sei beim Wettklick schneller als alle anderen.',
      steps: [
        'Du bekommst 3 private Trap-Karten — unterdurchschnittliche Karten, aber nicht sichtbar als "schlecht" markiert. Wähle eine davon und tarne sie mit einer von 4 gezogenen Kandidaten als attraktive Karte.',
        'Alle Tarnungen landen zusammen mit echten Karten in einem gemeinsamen Raster.',
        'Nach einem kurzen Countdown ist das Raster live: Klicke so schnell wie möglich auf ein Feld.',
        'Klicken zwei Spieler dasselbe Feld, gewinnt der schnellere Klick das echte Feld.',
        'Der Langsamere wird zufällig auf ein übrig gebliebenes Feld umgeleitet — das kann wieder eine fremde Falle sein.',
        'Nach 8 Runden hat jeder acht Karten.',
      ],
      tips: [
        'Du weißt, welches Feld deine eigene Falle ist — die kannst du gezielt meiden.',
        'Eine auffällig gute Karte im Raster ist nicht unbedingt echt.',
        'Bei der Umleitung zählt reiner Zufall — auch ein verlorenes Rennen kann noch gut ausgehen.',
      ],
      host: 'Zeit zum Verschleiern, Anzahl Fallen pro Spieler und Rastergröße sind einstellbar.',
    },

    'pyramid-draft': {
      goal: 'Draftet reihum eine Kartenpyramide leer — nur die unterste Reihe liegt zu Beginn offen.',
      steps: [
        'Nur wer dran ist, kann eine offene, noch nicht vergebene Karte wählen.',
        'Eine verdeckte Karte wird erst sichtbar, wenn BEIDE Karten direkt darunter vergeben sind.',
        'Die Zugreihenfolge wechselt jede Runde, damit niemand dauerhaft zuerst dran ist.',
        'Am Ende jeder Runde wird zusätzlich eine offene, noch niemandem gehörende Karte zufällig blockiert — sie zählt für die Freilegung, aber niemand kann sie mehr nehmen.',
        'Nach acht Runden hat jeder Spieler acht Karten.',
      ],
      tips: [
        'Die Pyramidengröße richtet sich automatisch nach der Spielerzahl — mehr Spieler, mehr Reihen.',
        'Eine Karte in der Mitte freizulegen braucht oft zwei verschiedene Nachbar-Picks, nicht nur deinen eigenen.',
        'Die Blockade am Rundenende ist Zufall — plane nicht darauf, dass eine bestimmte Karte als Nächstes offen liegt.',
      ],
      host: 'Die Bedenkzeit pro Zug ist einstellbar. Die Pyramidengröße wird automatisch berechnet.',
    },
  },

  en: {
    snake: {
      goal: 'Build an 8-card deck over eight rounds — but you may only move through the grid square by square.',
      steps: [
        'Players take turns. Whoever is up has a time limit shown at the top.',
        'The first pick is free: you may take any square on the grid.',
        'After that you may only take a square directly adjacent to the last one taken — up, down, left or right.',
        'If no adjacent square is free, the snake resets and you may pick freely again.',
        'After eight rounds everyone has eight cards.',
      ],
      tips: [
        'The previous pick decides your options. A mediocre card in a good neighbourhood beats the best card in a corner.',
        'Taken squares block your opponents too. You can deliberately push someone into an empty corner.',
        'Champion cards are capped at two per deck — after that they are greyed out.',
      ],
      host: 'Grid size and thinking time per turn are configurable. Bigger grids make the draft more relaxed, smaller ones force compromises sooner.',
    },

    auction: {
      goal: 'Win the best cards with a fixed elixir budget that has to last the whole game.',
      steps: [
        'Each round several cards are put up at the same time.',
        'Set your bid, then click the card you want. Everyone bids blind.',
        'Once everyone has bid (or time runs out) it resolves: the highest bidder gets the card.',
        'All amounts are revealed — you see exactly who spent what.',
        'Anyone who comes away empty gets a card nobody bid on, or a bonus card from outside the pool.',
        'In the final round your entire remaining elixir is bid automatically — you only pick the card.',
      ],
      tips: [
        'Elixir left over at the end is wasted. Work backwards: what do you still want to afford in the last rounds?',
        'The revealed bids are worth real money. Someone who just spent 40 cannot compete next round.',
        'Bidding on a card everyone wants can cost more than quietly taking an ignored card for 1 elixir.',
        'If the Mother Witch is in play a round may be manipulated — do not blindly trust what you see.',
      ],
      host: 'Starting elixir, cards per round, bidding time, visible opponent elixir and the Mother Witch are configurable.',
    },

    bingo: {
      goal: 'Fill your bingo card: every square demands a card property, and completed lines earn you power-ups.',
      steps: [
        'Everyone gets their own 4×4 bingo card. Each square names a property, e.g. "Legendary" or "Cost: 5+".',
        'Players take turns picking one of the available cards.',
        'The card must be placed on a square whose property it satisfies.',
        'If it fits nowhere you may place it anywhere — but that square is then blocked.',
        'A completed row, column or diagonal earns tokens for the power-up shop.',
      ],
      tips: [
        'Save a card that fits many squares. Place specialists immediately.',
        'Blocking is not always bad: a deliberately spoiled square can beat a card you do not need.',
        'Watch the lines that are one square away from completion — those are worth letting a good card go for.',
      ],
      host: 'Cards per round and thinking time are configurable.',
    },

    'shadow-carousel': {
      goal: 'Take cards from a table full of face-down cards — then move on to the next player\'s table.',
      steps: [
        'Every player sits at their own table of face-down cards.',
        'First you must use up your reveals: two in the early rounds, one later on.',
        'Only then may you take a card — any card on the table, including a face-down one.',
        'At the end of the round all tables rotate one seat. Whatever you revealed and left behind, the next player cannot see.',
      ],
      tips: [
        'Revealing a good card and not taking it hands it to the next player — without them knowing it is good.',
        'Taking a face-down card is a real gamble, but late in the round it can be the only shot at something rare.',
        'Remember what was on the tables you already had — the carousel brings them back.',
      ],
      host: 'Table size (8, 12 or 16 cards) and the reveal system are configurable.',
    },

    'elixir-rush': {
      goal: 'Buy cards off the marketplace before anyone else does — elixir regenerates in real time.',
      steps: [
        'Several cards with elixir costs sit on the marketplace.',
        'Your elixir bar fills continuously on its own.',
        'Click a card you can afford — it is yours instantly. First click wins.',
        'Bought and expired cards are replaced; the offer keeps changing.',
        'If your bar is full and you buy nothing, the game buys randomly for you after a short while.',
      ],
      tips: [
        'A full bar means wasted regeneration. Buying cheap more often beats saving for the expensive card.',
        'Watch the remaining time on cards: one about to expire may be safe from other buyers.',
        'For expensive cards it pays to wait until the bar is nearly full — otherwise someone snatches it first.',
      ],
      host: 'Number of market slots, card swap time and the visibility of elixir and timer are configurable.',
    },

    'card-evolution': {
      goal: 'Start with placeholders and roll them up into real cards with tokens — or sabotage the others.',
      steps: [
        'Everyone starts with eight placeholders and a token budget.',
        'Arrow up upgrades a slot, arrow down downgrades it. Both cost tokens and draw two candidates to choose from.',
        'Every further click on the same slot costs more.',
        'Clicking the card itself freezes it — after that nobody can change it, not even you.',
        'In the sabotage round you may re-roll the others\' unlocked cards.',
      ],
      tips: [
        'Freezing is the only protection against sabotage. Lock what really matters early.',
        'The card pool is limited — the bar at the top shows how many of each rarity are left.',
        'Tokens are scarce. Rolling all eight cards up to Legendary does not add up.',
      ],
      host: 'Starting token budget and the length of the picking and sabotage rounds are configurable.',
    },

    'angel-royale': {
      goal: 'Fish eight cards out of a river they float down — hesitate too long and one gets assigned to you.',
      steps: [
        'Cards drift across the river from one side to the other.',
        'Click a card to catch it. Your rod then needs a moment before it is ready again.',
        'Wait too long without fishing and you are automatically given a random drifting card.',
        'Some cards dart across the screen in short bursts — those you have to hit.',
        'You are done once you have eight cards.',
      ],
      tips: [
        'Everyone fishes the same river. What you leave, someone else can take.',
        'The rod cooldown is the real price: a mediocre card now can cost more than waiting three seconds.',
        'The deadline for the forced catch keeps running — the bar at the bottom shows it.',
      ],
      host: 'How many cards appear per second, the rod cooldown and the forced-catch deadline are configurable.',
    },

    'dark-maze': {
      goal: 'Search a dark maze for chests — your light only reaches a few steps.',
      steps: [
        'Move through a maze with the arrow keys (or by swiping).',
        'Only a small area around you is visible.',
        'Chests contain cards. Stand on a chest and pick it up.',
        'All players run through the same maze — an opened chest is gone for everyone else.',
        'The game ends when everyone has eight cards or time runs out.',
      ],
      tips: [
        'Searching one direction systematically beats running back and forth.',
        'Other players\' light sources reveal where the maze has already been searched.',
        'The remaining time is at the top — anyone with fewer than eight cards at the end keeps only what they found.',
      ],
      host: 'The time limit is configurable.',
    },

    'trap-setter': {
      goal: 'Disguise one of your trap cards as something attractive — then be faster than everyone else in the click race.',
      steps: [
        'You get 3 private trap cards — underperforming picks, but never shown labeled as "bad". Pick one and disguise it as something attractive, choosing from 4 drawn candidates.',
        'All disguised traps land together with real cards in a shared grid.',
        'After a short countdown the grid goes live: click a cell as fast as you can.',
        'If two players click the same cell, the faster click wins the real card there.',
        'The slower one gets redirected to a random leftover cell — which can be someone else\'s trap.',
        'After 8 rounds everyone has eight cards.',
      ],
      tips: [
        'You know which cell is your own trap, so you can avoid it on purpose.',
        'A suspiciously good card on the grid is not necessarily real.',
        'Redirection is pure luck — even losing a race can still work out.',
      ],
      host: 'Disguise time, traps per player and grid size are configurable.',
    },

    'pyramid-draft': {
      goal: 'Draft a card pyramid empty in turn order — only the bottom row starts face up.',
      steps: [
        'Only the player whose turn it is can pick a face-up, unclaimed card.',
        'A face-down card only turns face up once BOTH cards directly beneath it are gone.',
        'The pick order rotates every round so nobody is always first.',
        'At the end of each round, one more face-up, unclaimed card gets randomly blocked — it still counts for revealing cards above it, but nobody can take it anymore.',
        'After eight rounds every player has eight cards.',
      ],
      tips: [
        'The pyramid size scales automatically with player count — more players, more rows.',
        'Revealing a card in the middle usually takes two different neighboring picks, not just your own.',
        'The end-of-round block is random — don\'t plan around a specific card opening up next.',
      ],
      host: 'Time per turn is configurable. Pyramid size is calculated automatically.',
    },
  },

  es: {
    snake: {
      goal: 'Construye un mazo de 8 cartas en ocho rondas — pero solo puedes moverte por la cuadrícula casilla por casilla.',
      steps: [
        'Los jugadores juegan por turnos. Quien tiene el turno ve una barra de tiempo límite arriba.',
        'La primera elección es libre: puedes tomar cualquier casilla de la cuadrícula.',
        'Después solo puedes tomar una casilla directamente adyacente a la última tomada — arriba, abajo, izquierda o derecha.',
        'Si no queda ninguna casilla adyacente libre, la serpiente se reinicia y puedes volver a elegir libremente.',
        'Tras ocho rondas todos tienen ocho cartas.',
      ],
      tips: [
        'La elección anterior determina tus opciones. Es mejor una carta mediocre en un buen sitio que la mejor carta en una esquina.',
        'Las casillas tomadas también bloquean a los rivales. Puedes empujar a alguien deliberadamente hacia una esquina vacía.',
        'Las cartas campeón están limitadas a dos por mazo — después aparecen en gris.',
      ],
      host: 'El tamaño de la cuadrícula y el tiempo de reflexión por turno son configurables. Cuadrículas más grandes hacen el draft más relajado, las más pequeñas obligan antes a hacer concesiones.',
    },

    auction: {
      goal: 'Gana las mejores cartas con un presupuesto fijo de elixir que debe alcanzar para toda la partida.',
      steps: [
        'Cada ronda se muestran varias cartas a la vez.',
        'Fija tu puja y luego haz clic en la carta que quieres. Todos pujan a ciegas.',
        'Cuando todos han pujado (o se acaba el tiempo) se resuelve: quien pujó más se lleva la carta.',
        'Todas las cantidades se revelan — ves exactamente quién apostó cuánto.',
        'Quien se queda sin nada recibe una carta por la que nadie pujó, o una carta de bonificación fuera del pool.',
        'En la última ronda todo tu elixir restante se puja automáticamente — solo eliges la carta.',
      ],
      tips: [
        'El elixir que sobra al final se pierde. Calcula al revés: ¿qué quieres poder permitirte todavía en las últimas rondas?',
        'Las pujas reveladas valen dinero real. Quien acaba de gastar 40 no podrá competir en la siguiente ronda.',
        'Pujar por una carta que todos quieren puede costar más que llevarse tranquilamente una carta ignorada por 1 de elixir.',
        'Si la Madre Bruja está en juego, una ronda puede estar manipulada — no confíes ciegamente en lo que ves.',
      ],
      host: 'El elixir inicial, las cartas por ronda, el tiempo de puja, la visibilidad del elixir rival y la Madre Bruja son configurables.',
    },

    bingo: {
      goal: 'Rellena tu cartón de bingo: cada casilla exige una propiedad de carta, y las líneas completas te dan power-ups.',
      steps: [
        'Todos reciben su propio cartón de bingo 4×4. Cada casilla indica una propiedad, por ejemplo "Legendaria" o "Coste: 5+".',
        'Por turnos, cada jugador elige una de las cartas disponibles.',
        'La carta debe colocarse en una casilla cuya propiedad cumpla.',
        'Si no encaja en ninguna, puedes colocarla donde quieras — pero esa casilla queda bloqueada.',
        'Una fila, columna o diagonal completa da fichas para la tienda de power-ups.',
      ],
      tips: [
        'Guarda una carta que encaje en muchas casillas. Coloca de inmediato a las especialistas.',
        'Bloquear no siempre es malo: una casilla sacrificada a propósito puede superar a una carta que no necesitas.',
        'Vigila las líneas a las que solo les falta una casilla — merece la pena dejar pasar una buena carta por eso.',
      ],
      host: 'Las cartas por ronda y el tiempo de reflexión son configurables.',
    },

    'shadow-carousel': {
      goal: 'Toma cartas de una mesa llena de cartas boca abajo — luego pasa a la mesa del siguiente jugador.',
      steps: [
        'Cada jugador se sienta en su propia mesa de cartas boca abajo.',
        'Primero debes agotar tus revelados: dos en las primeras rondas, uno más adelante.',
        'Solo después puedes tomar una carta — cualquiera de la mesa, incluso una boca abajo.',
        'Al final de la ronda todas las mesas rotan un asiento. Lo que revelaste y dejaste, el siguiente jugador no puede verlo.',
      ],
      tips: [
        'Revelar una buena carta y no tomarla se la regala al siguiente jugador — sin que sepa que es buena.',
        'Tomar una carta boca abajo es un verdadero riesgo, pero al final de la ronda puede ser la única oportunidad de conseguir algo raro.',
        'Recuerda qué había en las mesas que ya tuviste — el carrusel las trae de vuelta.',
      ],
      host: 'El tamaño de la mesa (8, 12 o 16 cartas) y el sistema de revelado son configurables.',
    },

    'elixir-rush': {
      goal: 'Compra cartas del mercado antes que nadie más — el elixir se recarga en tiempo real.',
      steps: [
        'En el mercado hay varias cartas con coste de elixir.',
        'Tu barra de elixir se llena continuamente sola.',
        'Haz clic en una carta que puedas permitirte — es tuya al instante. El primer clic gana.',
        'Las cartas compradas o caducadas se reponen; la oferta cambia constantemente.',
        'Si tu barra está llena y no compras nada, el juego compra algo al azar por ti tras un momento.',
      ],
      tips: [
        'Una barra llena significa tiempo de recarga desperdiciado. Comprar barato más a menudo es mejor que ahorrar para la carta cara.',
        'Vigila el tiempo restante de las cartas: una a punto de caducar puede estar a salvo de otros compradores.',
        'Para las cartas caras vale la pena esperar a que la barra esté casi llena — si no, alguien te la quitará antes.',
      ],
      host: 'El número de puestos de mercado, el tiempo de cambio de las cartas y la visibilidad del elixir y el temporizador son configurables.',
    },

    'card-evolution': {
      goal: 'Empieza con marcadores de posición y súbelos a cartas reales con fichas — o sabotea a los demás.',
      steps: [
        'Todos empiezan con ocho marcadores de posición y un presupuesto de fichas.',
        'La flecha arriba mejora una casilla, la flecha abajo la degrada. Ambas cuestan fichas y muestran dos candidatas para elegir.',
        'Cada clic adicional en la misma casilla cuesta más.',
        'Hacer clic en la propia carta la congela — después nadie puede cambiarla, ni siquiera tú.',
        'En la ronda de sabotaje puedes rerollear las cartas sin bloquear de los demás.',
      ],
      tips: [
        'Congelar es la única protección contra el sabotaje. Bloquea pronto lo que realmente te importa.',
        'El pool de cartas es limitado — la barra de arriba muestra cuántas quedan de cada rareza.',
        'Las fichas escasean. No alcanza para subir las ocho cartas a Legendaria.',
      ],
      host: 'El presupuesto inicial de fichas y la duración de las rondas de elección y sabotaje son configurables.',
    },

    'angel-royale': {
      goal: 'Pesca ocho cartas de un río por el que van flotando — si dudas demasiado, se te asigna una.',
      steps: [
        'Las cartas flotan por el río de un lado a otro.',
        'Haz clic en una carta para pescarla. Después tu caña necesita un momento antes de estar lista de nuevo.',
        'Si esperas demasiado sin pescar, recibes automáticamente una carta aleatoria que esté flotando.',
        'Algunas cartas cruzan la pantalla en ráfagas cortas — a esas hay que darles.',
        'Terminas en cuanto tienes ocho cartas.',
      ],
      tips: [
        'Todos pescan en el mismo río. Lo que dejas pasar, otro puede tomarlo.',
        'El enfriamiento de la caña es el verdadero precio: una carta mediocre ahora puede costar más que esperar tres segundos.',
        'El plazo hasta la pesca forzada sigue corriendo — la barra de abajo lo muestra.',
      ],
      host: 'Cuántas cartas aparecen por segundo, el enfriamiento de la caña y el plazo de la pesca forzada son configurables.',
    },

    'dark-maze': {
      goal: 'Busca cofres en un laberinto oscuro — tu luz solo alcanza unos pocos pasos.',
      steps: [
        'Te mueves por un laberinto con las flechas (o deslizando el dedo).',
        'Solo es visible una pequeña zona a tu alrededor.',
        'Los cofres contienen cartas. Ponte sobre un cofre y recógelo.',
        'Todos los jugadores recorren el mismo laberinto — un cofre abierto desaparece para los demás.',
        'La partida termina cuando todos tienen ocho cartas o se acaba el tiempo.',
      ],
      tips: [
        'Buscar sistemáticamente en una dirección es mejor que ir y venir sin rumbo.',
        'Las luces de los demás jugadores revelan dónde ya se ha buscado.',
        'El tiempo restante está arriba — quien tenga menos de ocho cartas al final se queda solo con lo que encontró.',
      ],
      host: 'El límite de tiempo es configurable.',
    },

    'trap-setter': {
      goal: 'Disfraza una de tus cartas trampa como algo atractivo — y sé más rápido que todos los demás en la carrera de clics.',
      steps: [
        'Recibes 3 cartas trampa privadas — elecciones por debajo de la media, pero nunca marcadas como "malas". Elige una y disfrázala de algo atractivo, escogiendo entre 4 candidatas.',
        'Todas las trampas disfrazadas acaban junto a cartas reales en una cuadrícula compartida.',
        'Tras una breve cuenta atrás la cuadrícula se activa: haz clic en una casilla lo más rápido posible.',
        'Si dos jugadores hacen clic en la misma casilla, el clic más rápido se lleva la carta real de ahí.',
        'El más lento es redirigido al azar a una casilla sobrante — que puede ser la trampa de otro.',
        'Tras 8 rondas todos tienen ocho cartas.',
      ],
      tips: [
        'Sabes cuál es tu propia trampa, así que puedes evitarla a propósito.',
        'Una carta sospechosamente buena en la cuadrícula no es necesariamente real.',
        'La redirección es pura suerte — incluso perder una carrera puede acabar bien.',
      ],
      host: 'El tiempo para disfrazar, las trampas por jugador y el tamaño de la cuadrícula son configurables.',
    },

    'pyramid-draft': {
      goal: 'Draftea una pirámide de cartas por turnos hasta vaciarla — solo la fila inferior empieza boca arriba.',
      steps: [
        'Solo el jugador en turno puede elegir una carta boca arriba sin dueño.',
        'Una carta boca abajo solo se voltea cuando las DOS cartas justo debajo han sido tomadas.',
        'El orden de turno rota cada ronda para que nadie vaya siempre primero.',
        'Al final de cada ronda, una carta más boca arriba y sin dueño se bloquea al azar — sigue contando para revelar las cartas de encima, pero ya nadie puede tomarla.',
        'Tras ocho rondas, cada jugador tiene ocho cartas.',
      ],
      tips: [
        'El tamaño de la pirámide se ajusta automáticamente al número de jugadores — más jugadores, más filas.',
        'Revelar una carta del centro suele necesitar dos elecciones vecinas distintas, no solo la tuya.',
        'El bloqueo de fin de ronda es aleatorio — no planees contando con que se abra una carta concreta a continuación.',
      ],
      host: 'El tiempo por turno es configurable. El tamaño de la pirámide se calcula automáticamente.',
    },
  },
};

/** Anleitung eines Modus in der gewünschten Sprache; Deutsch als Rückfallebene. */
export function tutorialFor(modeId, lang = 'de') {
  const dict = TUTORIALS[lang] || TUTORIALS.de;
  return dict[modeId] || TUTORIALS.de[modeId] || null;
}

export const TUTORIAL_I18N = {
  de: {
    goal: 'Ziel',
    steps: 'Ablauf',
    tips: 'Tipps',
    host: 'Was der Host einstellen kann',
    openLabel: (name) => `Anleitung zu ${name} öffnen`,
    howToPlay: 'Anleitung',
  },
  en: {
    goal: 'Goal',
    steps: 'How a round works',
    tips: 'Tips',
    host: 'What the host can configure',
    openLabel: (name) => `Open the ${name} guide`,
    howToPlay: 'How to play',
  },
  es: {
    goal: 'Objetivo',
    steps: 'Cómo funciona una ronda',
    tips: 'Consejos',
    host: 'Qué puede configurar el host',
    openLabel: (name) => `Abrir la guía de ${name}`,
    howToPlay: 'Cómo jugar',
  },
};
