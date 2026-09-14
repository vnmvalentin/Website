// BalancdlePage.jsx — "Die Waage". Der eigentliche Spielablauf steckt in
// GuessScaleGamePage.jsx (gemeinsam mit den anderen -dle-Spielen) — hier steht nur, was
// Balancdle unterscheidet.
import { Scale } from 'lucide-react';
import GuessScaleGamePage from '../GuessScaleGamePage';
import BalancdleRound from './BalancdleRound';

export default function BalancdlePage() {
  return (
    <GuessScaleGamePage
      gameId="balancdle"
      gameName="Balancdle"
      gameSubtitle="Die Waage"
      icon={Scale}
      description="Schätze in 5 Runden das exakte Gewicht eines Gegenstands — von der Büroklammer bis zum Konzertflügel. Je näher deine Schätzung, desto mehr Punkte."
      seoTitle="Balancdle — Die Waage"
      seoDescription="Schätze das Gewicht von Alltagsgegenständen, Tieren und mehr in Gramm: von der Büroklammer bis zum Konzertflügel. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/balancdle"
      seoKeywords="Balancdle, Gewicht raten, Wiegen Quiz, tägliches Rätsel"
      RoundComponent={BalancdleRound}
    />
  );
}
