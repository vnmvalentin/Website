// levels.js — die Ebenen von Lights Out. Ohne three.js, damit das Menü sie lesen kann, ohne die Spielwelt zu laden.

export const LEVELS = [
  {
    id: 'wald',
    title: 'Der Wald',
    theme: 'forest',
    monster: 'watcher',
    intro: 'Die Haustür hat zwei Schlösser: Der Schlüssel liegt irgendwo im Wald, der Code für das Zahlenschloss ist in die Bäume geritzt. Etwas steht zwischen den Bäumen — es bewegt sich nur, wenn du nicht hinsiehst.',
  },
  {
    id: 'anstalt',
    title: 'Die Anstalt',
    theme: 'halls',
    monster: 'hunter',
    intro: 'Der Strom ist weg. Drei Sicherungen, ein Kasten am Ausgang. Es hört dich rennen und sieht dein Licht.',
  },
  {
    id: 'keller',
    title: 'Der Keller',
    theme: 'cellar',
    monster: 'listener',
    intro: 'Das Ding hier unten ist blind, aber es hört jeden Schritt. Drei Ventile öffnen den Notausgang. Schleich.',
  },
  {
    id: 'garten',
    title: 'Der Garten',
    theme: 'garden',
    monster: 'tracker',
    intro: 'Der Notausgang führt in den alten Garten — ein Labyrinth aus Steinmauern. Vier Statuen auf drehbaren Sockeln müssen zum roten Licht in der Mitte blicken, dann öffnet sich das Tor. Der Gärtner folgt deiner Spur. Bleib nicht stehen.',
  },
];
