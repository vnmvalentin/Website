// ProbabildlePage.jsx — "Die Prozent-Skala". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit Tempdle & Velocidle) — hier steht nur, was
// Probabildle von den anderen "Zahl auf einer Skala raten"-Spielen unterscheidet.
import { Percent } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import ProbabildleRound from './ProbabildleRound';

export default function ProbabildlePage() {
  return (
    <GuessScaleGamePage
      gameId="probabildle"
      gameName="Probabildle"
      gameSubtitle="Die Prozent-Skala"
      icon={Percent}
      description="Schätze in 5 Runden, wie wahrscheinlich ein Ereignis ist oder wie groß ein Anteil ausfällt — vom Münzwurf bis zum Lotto-Hauptgewinn. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Probabildle — Die Prozent-Skala"
      seoDescription="Schätze Wahrscheinlichkeiten und Prozentanteile: vom fairen Münzwurf bis zum Lotto-Hauptgewinn. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/probabildle"
      seoKeywords="Probabildle, Wahrscheinlichkeit raten, Prozent Quiz, tägliches Rätsel"
      RoundComponent={ProbabildleRound}
    />
  );
}
