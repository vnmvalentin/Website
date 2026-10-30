// Clash-Royale-eigene Symbole als Inline-SVG.
//
// WARUM SELBST GEZEICHNET UND NICHT AUS LUCIDE:
// Für Elixier stand bisher überall `Droplets` — ein Wassertropfen. Der Modus heißt aber
// „Elixir Auction", und der Elixiertropfen ist das Symbol, das jeder aus dem Spiel kennt.
// Ein generischer Wassertropfen daneben wirkt wie ein Platzhalter.
//
// WARUM NICHT DIE ORIGINALGRAFIK:
// Supercells Artwork darf nicht als Datei mitgeliefert werden (Fan-Content-Policy) und
// wäre für ein 12px-Symbol auch viel zu schwer. Diese Formen sind eigene, stark
// vereinfachte Nachzeichnungen — sie tragen den Wiedererkennungswert, sind aber nur ein
// paar hundert Byte und skalieren verlustfrei.
//
// WARUM forwardRef UND NICHT EINFACH function:
// Nicht kosmetisch, sondern notwendig. Das Einstellungs-Schema (lobby/hostSettingsSchema.js)
// erlaubt für jedes Feld entweder einen Wert oder eine Funktion, die ihn aus dem Kontext
// berechnet; HostSettings löst das mit `typeof v === 'function' ? v(ctx) : v` auf.
// Lucide-Symbole sind forwardRef-OBJEKTE (typeof 'object') und rutschen dort unverändert
// durch. Eine schlichte Funktionskomponente wäre stattdessen als Resolver AUFGERUFEN
// worden — sie hätte den Kontext als Props bekommen und ein fertiges Element
// zurückgegeben, das React dann als Komponententyp verwenden sollte. Ergebnis: „Element
// type is invalid", der Lazy-Route-Boundary fing es ab und die ganze Lobby-Route blieb
// leer. forwardRef macht diese Symbole zu demselben Typ wie lucide — überall austauschbar.
//
// Alle Symbole verhalten sich damit wie lucide-Symbole: `size` steuert Breite und Höhe,
// `className` die Farbe drumherum. Die Füllfarben des Elixiertropfens stehen fest, weil
// genau sie ihn erkennbar machen — ein graues Elixier wäre kein Elixier mehr.

import React from 'react';
import battleSrc from '../../../assets/clashRoyale/ui/battle.png';
import cardsSrc from '../../../assets/clashRoyale/ui/cards.png';
import socialSrc from '../../../assets/clashRoyale/ui/social.png';
import friendsSrc from '../../../assets/clashRoyale/ui/icon_menu_friends.png';
import newsSrc from '../../../assets/clashRoyale/ui/icon_menu_news_royale.png';
import trophySrc from '../../../assets/clashRoyale/ui/trophy.png';
import crownSrc from '../../../assets/clashRoyale/ui/crown.png';
import blueCrownSrc from '../../../assets/clashRoyale/ui/blue_crown_1.png';
import redCrownSrc from '../../../assets/clashRoyale/ui/red_crown_1.png';
import elixirSrc from '../../../assets/clashRoyale/ui/elixir_1.png';
import elixirPairSrc from '../../../assets/clashRoyale/ui/elixir_2.png';
import boostSrc from '../../../assets/clashRoyale/ui/card_boost_potion.png';
import traderSrc from '../../../assets/clashRoyale/ui/icon_trader.png';
import tripleDraftSrc from '../../../assets/clashRoyale/ui/icon_triple_draft.png';
import telescopeSrc from '../../../assets/clashRoyale/ui/equip_icons_thrower_telescope.png';
import goblinSrc from '../../../assets/clashRoyale/ui/highres_goblin_icon.png';
import xpSrc from '../../../assets/clashRoyale/ui/experience_icon.png';
import crystalSrc from '../../../assets/clashRoyale/ui/crystal.png';
import scrollSrc from '../../../assets/clashRoyale/ui/icon_daily_task_scroll_opened.png';
import lockSrc from '../../../assets/clashRoyale/ui/lock.webp';
import settingsSrc from '../../../assets/clashRoyale/ui/settings.webp';
import infoSrc from '../../../assets/clashRoyale/ui/info.webp';
import checkSrc from '../../../assets/clashRoyale/ui/check.webp';
import closeSrc from '../../../assets/clashRoyale/ui/close.webp';
import cancelSrc from '../../../assets/clashRoyale/ui/cancel.webp';
import eyeSrc from '../../../assets/clashRoyale/ui/eye.webp';
import questionSrc from '../../../assets/clashRoyale/ui/question.webp';
import clockSrc from '../../../assets/clashRoyale/ui/clock.webp';
import stopwatchSrc from '../../../assets/clashRoyale/ui/stopwatch.webp';
import searchSrc from '../../../assets/clashRoyale/ui/search.webp';
import plusSrc from '../../../assets/clashRoyale/ui/plus.webp';
import userSrc from '../../../assets/clashRoyale/ui/user.webp';
import userAddSrc from '../../../assets/clashRoyale/ui/user_add.webp';
import userRemoveSrc from '../../../assets/clashRoyale/ui/user_remove.webp';
import upgradeSrc from '../../../assets/clashRoyale/ui/upgrade.webp';
import downgradeSrc from '../../../assets/clashRoyale/ui/downgrade.webp';
import swapSrc from '../../../assets/clashRoyale/ui/swap.webp';
import disconnectedSrc from '../../../assets/clashRoyale/ui/disconnected.webp';
import megaphoneSrc from '../../../assets/clashRoyale/ui/megaphone.webp';
import targetSrc from '../../../assets/clashRoyale/ui/target.webp';
import replaySrc from '../../../assets/clashRoyale/ui/replay.webp';
import bookSrc from '../../../assets/clashRoyale/ui/book.webp';
import shieldSrc from '../../../assets/clashRoyale/ui/shield.webp';
import starSrc from '../../../assets/clashRoyale/ui/star.webp';
import swordSrc from '../../../assets/clashRoyale/ui/sword.webp';
import heartSrc from '../../../assets/clashRoyale/ui/heart.webp';
import chatSrc from '../../../assets/clashRoyale/ui/chat.webp';
import tvSrc from '../../../assets/clashRoyale/ui/tv.webp';
import randomSrc from '../../../assets/clashRoyale/ui/random_elixir.webp';
import regionSrc from '../../../assets/clashRoyale/ui/region.webp';
import kingBlueSrc from '../../../assets/clashRoyale/ui/king_blue.webp';
import kingRedSrc from '../../../assets/clashRoyale/ui/king_red.webp';
import skullSrc from '../../../assets/clashRoyale/ui/sudden_death.webp';
import fishermanSrc from '../../../assets/clashRoyale/ui/fisherman.webp';
import motherWitchSrc from '../../../assets/clashRoyale/ui/motherwitch_icon.webp';
import doubleElixirSrc from '../../../assets/clashRoyale/ui/double_elixir.webp';
import classicDecksSrc from '../../../assets/clashRoyale/ui/classic_decks.webp';
import megaDraftSrc from '../../../assets/clashRoyale/ui/mega_draft.webp';
import tourneyTrophySrc from '../../../assets/clashRoyale/ui/tourney_trophy.webp';
import twoVsTwoSrc from '../../../assets/clashRoyale/ui/2v2.webp';
import rageSrc from '../../../assets/clashRoyale/ui/rage.webp';
import mirrorSrc from '../../../assets/clashRoyale/ui/mirror.webp';
import chestSrc from '../../../assets/clashRoyale/ui/chest.webp';

/**
 * Echte Clash-Royale-UI-Grafik als Symbol-Komponente — Drop-in-Ersatz für ein lucide-Symbol.
 *
 * Quellen: RoyaleAPI-CDN (cdns3.royaleapi.com/…/static/img/ui/<name>.png) und die aus dem
 * Spiel extrahierten UI-Sprites (github.com/smlbiobot/cr-assets-png, assets/sc/ui_out) —
 * lokal als kleine WebPs (max. 96 px) unter src/assets/clashRoyale/ui/ gespeichert, damit die
 * Seite von keinem fremden CDN abhängt. Die Kommentar-Begründung ganz oben gegen Original-
 * grafiken galt für das Elixier-SVG von damals; seit dem Arcade-Look nutzt der Bereich
 * ohnehin durchgehend RoyaleAPI-Grafiken (Kartenbilder, Ligen, Menü-Knöpfe).
 *
 * Gleiche Schnittstelle wie lucide: `size` steuert Breite und Höhe, `className` wird
 * durchgereicht. SVG-spezifische Props (strokeWidth, fill …) schluckt die Komponente, damit
 * ein bestehender Aufruf ohne Anpassung weiterläuft. forwardRef aus demselben Grund wie oben
 * (typeof 'object' — sonst hielte das Einstellungs-Schema das Symbol für einen Resolver).
 * Eine farbige Grafik ignoriert Text-Farbklassen; Abblenden geht über opacity-Klassen.
 */
function imgIcon(src, displayName) {
  const Icon = React.forwardRef(function CrImgIcon(
    {
      size = 14, className = '', title, style,
      // SVG-/lucide-Props, die für ein Bild keine Bedeutung haben
      strokeWidth, absoluteStrokeWidth, color, fill, stroke, // eslint-disable-line no-unused-vars
      ...rest
    },
    ref,
  ) {
    return (
      <img
        ref={ref} src={src} alt={title || ''} title={title}
        aria-hidden={title ? undefined : true}
        width={size} height={size} draggable={false} decoding="async"
        className={`inline-block shrink-0 object-contain select-none pointer-events-none ${className}`}
        style={{ width: size, height: size, ...style }}
        {...rest}
      />
    );
  });
  Icon.displayName = displayName;
  return Icon;
}

// Menü / Navigation
export const CrBattle = imgIcon(battleSrc, 'CrBattle');
export const CrCards = imgIcon(cardsSrc, 'CrCards');
export const CrSocial = imgIcon(socialSrc, 'CrSocial');
export const CrFriends = imgIcon(friendsSrc, 'CrFriends');
export const CrNews = imgIcon(newsSrc, 'CrNews');
export const CrSettings = imgIcon(settingsSrc, 'CrSettings');
export const CrBook = imgIcon(bookSrc, 'CrBook');
export const CrScroll = imgIcon(scrollSrc, 'CrScroll');
export const CrChat = imgIcon(chatSrc, 'CrChat');
export const CrMegaphone = imgIcon(megaphoneSrc, 'CrMegaphone');
export const CrTv = imgIcon(tvSrc, 'CrTv');
export const CrRegion = imgIcon(regionSrc, 'CrRegion');
// Zustände / Aktionen
export const CrLock = imgIcon(lockSrc, 'CrLock');
export const CrInfo = imgIcon(infoSrc, 'CrInfo');
export const CrCheck = imgIcon(checkSrc, 'CrCheck');
export const CrClose = imgIcon(closeSrc, 'CrClose');
export const CrCancel = imgIcon(cancelSrc, 'CrCancel');
export const CrEye = imgIcon(eyeSrc, 'CrEye');
export const CrQuestion = imgIcon(questionSrc, 'CrQuestion');
export const CrClock = imgIcon(clockSrc, 'CrClock');
export const CrStopwatch = imgIcon(stopwatchSrc, 'CrStopwatch');
export const CrSearch = imgIcon(searchSrc, 'CrSearch');
export const CrPlus = imgIcon(plusSrc, 'CrPlus');
export const CrUpgrade = imgIcon(upgradeSrc, 'CrUpgrade');
export const CrDowngrade = imgIcon(downgradeSrc, 'CrDowngrade');
export const CrSwap = imgIcon(swapSrc, 'CrSwap');
export const CrReplay = imgIcon(replaySrc, 'CrReplay');
export const CrTarget = imgIcon(targetSrc, 'CrTarget');
export const CrDisconnected = imgIcon(disconnectedSrc, 'CrDisconnected');
export const CrRandom = imgIcon(randomSrc, 'CrRandom');
// Spieler
export const CrUser = imgIcon(userSrc, 'CrUser');
export const CrUserAdd = imgIcon(userAddSrc, 'CrUserAdd');
export const CrUserRemove = imgIcon(userRemoveSrc, 'CrUserRemove');
export const CrKingBlue = imgIcon(kingBlueSrc, 'CrKingBlue');
export const CrKingRed = imgIcon(kingRedSrc, 'CrKingRed');
export const CrGoblin = imgIcon(goblinSrc, 'CrGoblin');
export const CrShield = imgIcon(shieldSrc, 'CrShield');
export const CrTwoVsTwo = imgIcon(twoVsTwoSrc, 'CrTwoVsTwo');
export const CrCrownBlue = imgIcon(blueCrownSrc, 'CrCrownBlue');
export const CrCrownRed = imgIcon(redCrownSrc, 'CrCrownRed');
// Spielinhalte
export const CrTrophy = imgIcon(trophySrc, 'CrTrophy');
export const CrTourneyTrophy = imgIcon(tourneyTrophySrc, 'CrTourneyTrophy');
export const CrCrown = imgIcon(crownSrc, 'CrCrown');
export const CrStar = imgIcon(starSrc, 'CrStar');
export const CrXp = imgIcon(xpSrc, 'CrXp');
export const CrCrystal = imgIcon(crystalSrc, 'CrCrystal');
export const CrSword = imgIcon(swordSrc, 'CrSword');
export const CrHeart = imgIcon(heartSrc, 'CrHeart');
export const CrSkull = imgIcon(skullSrc, 'CrSkull');
export const CrChest = imgIcon(chestSrc, 'CrChest');
export const CrMirror = imgIcon(mirrorSrc, 'CrMirror');
export const CrElixir = imgIcon(elixirSrc, 'CrElixir');
export const CrElixirPair = imgIcon(elixirPairSrc, 'CrElixirPair');
export const CrDoubleElixir = imgIcon(doubleElixirSrc, 'CrDoubleElixir');
export const CrRage = imgIcon(rageSrc, 'CrRage');
export const CrBoost = imgIcon(boostSrc, 'CrBoost');
export const CrTrader = imgIcon(traderSrc, 'CrTrader');
export const CrTripleDraft = imgIcon(tripleDraftSrc, 'CrTripleDraft');
export const CrMegaDraft = imgIcon(megaDraftSrc, 'CrMegaDraft');
export const CrClassicDecks = imgIcon(classicDecksSrc, 'CrClassicDecks');
export const CrTelescope = imgIcon(telescopeSrc, 'CrTelescope');
export const CrFisherman = imgIcon(fishermanSrc, 'CrFisherman');
// Gesichtsausschnitt aus motherwitch.webp (128px) — die ganze Figur wäre als Symbol zu klein
export const CrMotherWitch = imgIcon(motherWitchSrc, 'CrMotherWitch');

/**
 * Elixiertropfen — rund unten, spitz oben, mit Glanzpunkt.
 * Genutzt überall dort, wo es um Elixier geht (Auktion, Elixir Rush).
 */
export const ElixirDrop = React.forwardRef(function ElixirDrop(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" {...rest}>
      {title && <title>{title}</title>}
      <path d="M12 1.6c0 0 7.6 8.9 7.6 13.4a7.6 7.6 0 1 1-15.2 0C4.4 10.5 12 1.6 12 1.6z"
        fill="#c026d3" stroke="#7e1d8f" strokeWidth="1.1" strokeLinejoin="round" />
      {/* Glanzpunkt oben links — ohne ihn wirkt der Tropfen flach */}
      <ellipse cx="9.4" cy="13.6" rx="1.9" ry="2.8" fill="#f5b8ff" opacity="0.75"
        transform="rotate(-18 9.4 13.6)" />
    </svg>
  );
});

/**
 * Kartenstapel — für „Karten pro Runde", Deckgrößen, Marktplatz.
 * Zwei angeschnittene Karten hinter einer vorderen.
 */
export const CardStack = React.forwardRef(function CardStack(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {title && <title>{title}</title>}
      <rect x="8" y="3" width="12" height="16" rx="2" />
      <path d="M5 6v13a2 2 0 0 0 2 2h9" />
    </svg>
  );
});

/**
 * Königsturm — steht für die Arena/den Spielmodus selbst.
 * Zinnen oben, schmaler Sockel unten.
 */
export const KingTower = React.forwardRef(function KingTower(
  { size = 14, className = '', title, ...rest }, ref,
) {
  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 24 24" className={className}
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {title && <title>{title}</title>}
      <path d="M4 9V5l3 2 5-4 5 4 3-2v4" />
      <path d="M5 9h14v11H5z" />
      <path d="M10 20v-4h4v4" />
    </svg>
  );
});
