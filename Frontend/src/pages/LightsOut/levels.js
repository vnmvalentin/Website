// levels.js — die Ebenen von Lights Out. Ohne three.js, damit das Menü sie lesen kann, ohne die Spielwelt zu laden.

export const LEVELS = [
  {
    id: 'wald',
    title: 'Der Wald',
    theme: 'forest',
    monster: 'watcher',
    intro: 'Das Haus ist abgeschlossen. Irgendwo im Wald liegt der Schlüssel. Etwas steht zwischen den Bäumen — es bewegt sich nur, wenn du nicht hinsiehst.',
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
];
