// InventiondlePage.jsx — "Der Zeitstrahl". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit den anderen -dle-Spielen) — hier steht nur, was
// Inventiondle unterscheidet.
import { History } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import InventiondleRound from './InventiondleRound';

export default function InventiondlePage() {
  return (
    <GuessScaleGamePage
      gameId="inventiondle"
      gameName="Inventiondle"
      gameSubtitle="Der Zeitstrahl"
      icon={History}
      description="Schätze in 5 Runden das exakte Jahr einer Erfindung oder Entdeckung — vom Rad bis zum ersten Touchscreen-Smartphone. Ein negatives Jahr steht für v. Chr. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Inventiondle — Der Zeitstrahl"
      seoDescription="Schätze das Erfindungsjahr: von der Keilschrift bis zum iPhone. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/inventiondle"
      seoKeywords="Inventiondle, Erfindungsjahr raten, Geschichte Quiz, tägliches Rätsel"
      RoundComponent={InventiondleRound}
    />
  );
}
