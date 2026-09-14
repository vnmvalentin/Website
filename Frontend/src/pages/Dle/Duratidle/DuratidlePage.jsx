// DuratidlePage.jsx — "Die Stoppuhr". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit Tempdle/Velocidle/Probabildle) — hier steht nur, was
// Duratidle von den anderen "Zahl auf einer Skala raten"-Spielen unterscheidet.
import { Timer } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import DuratidleRound from './DuratidleRound';

export default function DuratidlePage() {
  return (
    <GuessScaleGamePage
      gameId="duratidle"
      gameName="Duratidle"
      gameSubtitle="Die Stoppuhr"
      icon={Timer}
      description="Schätze in 5 Runden die exakte Dauer eines Ereignisses — vom kürzesten Krieg der Geschichte bis zur Lebenszeit einer Fruchtfliege. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Duratidle — Die Stoppuhr"
      seoDescription="Schätze die exakte Dauer von Dingen: von Millisekunden-Vorgängen bis zu jahrhundertelangen Ereignissen. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/duratidle"
      seoKeywords="Duratidle, Dauer raten, Zeitspanne Quiz, tägliches Rätsel"
      RoundComponent={DuratidleRound}
    />
  );
}
