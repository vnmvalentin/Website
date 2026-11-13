// levels.js — die Ebenen von Lights Out. Ohne three.js, damit das Menü sie lesen kann, ohne die Spielwelt zu laden.
// Die Geschichte dahinter steht in lore.js.

export const LEVELS = [
  {
    id: 'wald',
    title: 'Der Wald',
    theme: 'forest',
    monster: 'watcher',
    intro: 'Jonas ist seit drei Tagen weg. Sein Auto stand am Tor des alten Sanatoriums. Die Haustür hat zwei Schlösser: Der Schlüssel hängt in der Hütte des Försters, der Code ist in Bäume mit rotem Band geritzt. Zwischen den Stämmen steht etwas. Du siehst es kaum. Es kommt näher, wenn du wegsiehst — nur dein Licht vertreibt es.',
  },
  {
    id: 'anstalt',
    title: 'Die Anstalt',
    theme: 'halls',
    monster: 'hunter',
    intro: 'Station 3. Der Strom ist weg, die Treppe nach unten verriegelt. Drei Sicherungen liegen irgendwo in den Zimmern — sie gehören in den Kasten an der Treppe. Die Nachtschwester macht noch ihre Runde, du hörst sie summen: Sie hört dich rennen und sieht dein Licht. In die Spinde schaut sie nicht.',
  },
  {
    id: 'keller',
    title: 'Der Keller',
    theme: 'cellar',
    monster: 'listener',
    intro: 'Hier unten lag der Dunkelraum. Was darin war, ist blind, aber es hört jeden Schritt. Drei Ventile öffnen den Notausgang. Schleich.',
  },
  {
    id: 'garten',
    title: 'Der Garten',
    theme: 'garden',
    monster: 'tracker',
    intro: 'Der Notausgang führt in den alten Garten — ein Irrgarten aus Steinmauern, unter jeder Figur ein Beet. Vier Statuen auf drehbaren Sockeln müssen zum roten Licht in der Mitte blicken, dann öffnet sich das Tor zur Straße. Der Gärtner folgt deiner Spur. Bleib nicht stehen.',
  },
];
