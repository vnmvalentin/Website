// PricedlePage.jsx — "Der Preisvergleich". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit den anderen -dle-Spielen) — hier steht nur, was
// Pricedle unterscheidet.
import { Tag } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import PricedleRound from './PricedleRound';

export default function PricedlePage() {
  return (
    <GuessScaleGamePage
      gameId="pricedle"
      gameName="Pricedle"
      gameSubtitle="Der Preisvergleich"
      icon={Tag}
      description="Schätze in 5 Runden den exakten Einführungspreis eines Produkts (in US-Dollar) — vom Apple I bis zur PlayStation 5. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Pricedle — Der Preisvergleich"
      seoDescription="Schätze Einführungspreise legendärer Technik-Produkte in US-Dollar: vom Apple I bis zur PlayStation 5. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/pricedle"
      seoKeywords="Pricedle, Preis raten, Technikpreise Quiz, tägliches Rätsel"
      RoundComponent={PricedleRound}
    />
  );
}
