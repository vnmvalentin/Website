// VelocidlePage.jsx — "Der Tacho". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit Tempdle) — hier steht nur, was Velocidle von den
// anderen "Zahl auf einer Skala raten"-Spielen unterscheidet.
import { Gauge } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import VelocidleRound from './VelocidleRound';

export default function VelocidlePage() {
  return (
    <GuessScaleGamePage
      gameId="velocidle"
      gameName="Velocidle"
      gameSubtitle="Der Tacho"
      icon={Gauge}
      description="Schätze in 5 Runden, wie schnell sich etwas bewegt — von der Weinbergschnecke bis zur Lichtgeschwindigkeit. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Velocidle — Der Tacho"
      seoDescription="Schätze Geschwindigkeiten: Tiere, Fahrzeuge, Naturphänomene und mehr, von der Schnecke bis zur Lichtgeschwindigkeit. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/velocidle"
      seoKeywords="Velocidle, Geschwindigkeit raten, Tempo Quiz, tägliches Rätsel"
      RoundComponent={VelocidleRound}
    />
  );
}
