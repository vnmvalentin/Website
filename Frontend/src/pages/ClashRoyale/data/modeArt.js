// modeArt.js — Symbol je Spielmodus für die Kampfverläufe (Stats: Kämpfe-Reiter, Übersicht). Alle Modus-Bilder liegen in
// assets/clashRoyale/modes/; neue Bilder dort ablegen und hier einem Modus zuordnen.
//
// Ein Kampf kennt zwei Angaben: den internen Modusnamen (battle.mode, z. B. "Chaos_1v1_MegaDraft_S3") und den
// Symbol-Schlüssel aus dem Modus-Index des Servers (battle.modeIcon, Backend lib/gameModes.js). Der Schlüssel ist oft zu
// grob — der Index führt etwa Dragon Hunt und Chess Royale unter „1v1“ und die C.H.A.O.S-Draft-Modi unter „mega_draft“.
// Deshalb zuerst der Modusname, dann der Schlüssel.
import chaosImg from '../../../assets/clashRoyale/modes/chaos-icon.webp';
import chessImg from '../../../assets/clashRoyale/modes/chess-royale.webp';
import darkElixirImg from '../../../assets/clashRoyale/modes/dark-elixir.webp';
import elixirCaptureImg from '../../../assets/clashRoyale/modes/elixir-capture.webp';
import berserkImg from '../../../assets/clashRoyale/modes/gm-berserk-mode.webp';
import bossBanditImg from '../../../assets/clashRoyale/modes/gm-boss-bandit-blitz.webp';
import dragonHuntImg from '../../../assets/clashRoyale/modes/gm-dragon-hunt-a.webp';
import evoMayhemImg from '../../../assets/clashRoyale/modes/gm-evolutions-mayhem.webp';
import fourCardImg from '../../../assets/clashRoyale/modes/gm-four-card-mayhem-2.webp';
import infiniteElixirImg from '../../../assets/clashRoyale/modes/infinite-elixir.webp';
import twoVsTwoImg from '../../../assets/clashRoyale/modes/2v2.webp';
import friendlyImg from '../../../assets/clashRoyale/modes/friendly.webp';
import draftImg from '../../../assets/clashRoyale/modes/draft.webp';
import megaDraftImg from '../../../assets/clashRoyale/modes/mega_draft.webp';
import tripleDraftImg from '../../../assets/clashRoyale/modes/icon_triple_draft.webp';
import doubleElixirImg from '../../../assets/clashRoyale/modes/double_elixir.webp';
import suddenDeathImg from '../../../assets/clashRoyale/modes/sudden_death.webp';
import mirrorImg from '../../../assets/clashRoyale/modes/mirror.webp';
import rageImg from '../../../assets/clashRoyale/modes/rage.webp';
import classicDecksImg from '../../../assets/clashRoyale/modes/classic_decks.webp';
import league2v2Img from '../../../assets/clashRoyale/modes/league2v2.webp';
import elixirBarrelImg from '../../../assets/clashRoyale/modes/elixir-barrel.webp';
import heistImg from '../../../assets/clashRoyale/modes/heist.webp';
import touchdownImg from '../../../assets/clashRoyale/modes/touchdown.webp';
import tripleElixirImg from '../../../assets/clashRoyale/modes/triple-elixir.webp';
import levelOneImg from '../../../assets/clashRoyale/modes/level-one.webp';
import triwizardImg from '../../../assets/clashRoyale/modes/gm-triwizard.webp';
import globalLightningImg from '../../../assets/clashRoyale/modes/gm-global-lightning.webp';

export { twoVsTwoImg, friendlyImg, chaosImg, league2v2Img };

/** Interner Modusname → Bild (vor dem Symbol-Schlüssel geprüft). Muster nach den Modusnamen in gameModes.json; Level One,
 *  Triwizard und Global Lightning sind neuer als der Index (Okt. 2023) — die Muster raten den Namen und greifen erst,
 *  wenn ein solcher Kampf auftaucht. */
const BY_MODE = [
  [/^Chaos_/i, chaosImg], // C.H.A.O.S Mega Draft, Chaos Draft League
  [/Chess/i, chessImg], // Event_Chess_Board (Chess Royale), 202610_Event_Spooky_Chess
  [/DarkElixir/i, darkElixirImg],
  [/Berserk/i, berserkImg],
  [/Boss_?Bandit/i, bossBanditImg],
  [/CaptureTheEgg|DragonHunt/i, dragonHuntImg], // Dragon Hunt
  [/^Event_Evo_All$|Evo(lution)?s?_?Mayhem/i, evoMayhemImg], // Evolutions Free-for-all
  [/4orLess|FourCard/i, fourCardImg], // EventDeck_4orLess_TripleElixir (Cycle Mayhem) — vor TripleElixir
  [/Heist/i, heistImg], // Heist, Heist Draft, 3v3 Heist
  [/Touchdown/i, touchdownImg], // Touchdown, 2v2 Touchdown (Draft)
  [/TripleElixir/i, tripleElixirImg],
  [/Level_?One|Level_?1(?!\d)/i, levelOneImg],
  [/Tri_?Wizard/i, triwizardImg],
  [/Global_?Lightning/i, globalLightningImg],
  [/Elixir_?Barrel/i, elixirBarrelImg], // Modus unbekannt (Bild vom Nutzer provisorisch abgelegt), Name geraten
];

/** Symbol-Schlüssel des Modus-Index (battle.modeIcon) → Bild */
const BY_ICON = {
  draft: draftImg, mega_draft: megaDraftImg, triple_draft: tripleDraftImg, '2x_elixir': doubleElixirImg, '7x_elixir': infiniteElixirImg,
  '3x_elixir': tripleElixirImg, suddendeath: suddenDeathImg, mirror: mirrorImg, rage: rageImg, popdeck: classicDecksImg,
  elixir_storage: elixirCaptureImg, touchdown: touchdownImg, tournament_heist: heistImg,
};

/**
 * 2v2-Liga statt gewöhnlichem 2v2. Neuere Kämpfe tragen league2v2 vom Server (Arena-Kennung „2v2League_…“); ältere
 * gespeicherte nur den Anzeigenamen der Arena — in der 2v2-Liga hieß sie „Competitive“ (Sept. 2026, Kampftyp trail),
 * gewöhnliches 2v2 läuft in Trophäen-Arenen wie „Legendary Arena“.
 */
export const isLeague2v2 = (battle) => Boolean(battle?.league2v2) || (battle?.group === '2v2' && battle.type === 'trail' && battle.arena === 'Competitive');

/** Bild des Modus eines Kampfes, null = keins bekannt (dann entscheidet die Kampfgruppe) */
export function modeArt(battle) {
  if (!battle) return null;
  if (isLeague2v2(battle)) return league2v2Img;
  const mode = String(battle.mode || '');
  const hit = mode && BY_MODE.find(([re]) => re.test(mode));
  if (hit) return hit[1];
  return BY_ICON[battle.modeIcon] || null;
}
