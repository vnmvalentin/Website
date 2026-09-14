// TempdlePage.jsx — "Das Thermometer". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit Velocidle & Co.) — hier steht nur, was Tempdle von
// den anderen "Zahl auf einer Skala raten"-Spielen unterscheidet.
import { Thermometer } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import TempdleRound from './TempdleRound';

export default function TempdlePage() {
  return (
    <GuessScaleGamePage
      gameId="tempdle"
      gameName="Tempdle"
      gameSubtitle="Das Thermometer"
      icon={Thermometer}
      description="Schätze in 5 Runden die exakte Temperatur eines Phänomens — vom Schmelzpunkt eines chemischen Elements bis zur Lava eines Vulkans. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Tempdle — Das Thermometer"
      seoDescription="Schätze die exakte Temperatur eines Phänomens: Schmelzpunkte, Vulkanlava, Planetentemperaturen und mehr. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/tempdle"
      seoKeywords="Tempdle, Temperatur raten, Schmelzpunkt Quiz, tägliches Rätsel"
      RoundComponent={TempdleRound}
    />
  );
}
