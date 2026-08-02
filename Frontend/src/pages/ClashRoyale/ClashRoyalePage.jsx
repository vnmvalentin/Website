// Clash-Royale-Minigames — Einstiegspunkt.
//
// Diese Datei hatte 3094 Zeilen und enthielt Hub, Lobby, Spielphase, Endscreen, fünf
// Modals, die komplette Socket-Schicht und das i18n-Wörterbuch. Jetzt orchestriert sie
// nur noch: Sprache, Verbindung, Aktionen — und je nach Phase einen der drei Screens.
//
// Wo liegt was:
//   useClashSocket.js   Verbindung, Spielzustand, Sitzung
//   clashActions.js     alle Socket-Events, die der Client sendet
//   i18n.js             Texte für Hub, Lobby und Spielrahmen
//   ui/                 Slider, Toggle, Modal, Drawer, CardTile …
//   hub/ lobby/ game/   die drei Phasen
//   modes/              die acht Spielmodi (unverändert, lazy geladen)

import React, { useContext, useMemo, useState } from 'react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { useLanguage } from './useLanguage';
import { resolveError } from './i18n';
import { useClashSocket } from './useClashSocket';
import { createClashActions } from './clashActions';
import HubScreen from './hub/HubScreen';
import LobbyScreen from './lobby/LobbyScreen';
import GameScreen from './game/GameScreen';

export default function ClashRoyalePage() {
  const { user } = useContext(TwitchAuthContext);
  const { lang, t, changeLang } = useLanguage();
  const socket = useClashSocket(user);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const actions = useMemo(
    () => createClashActions(socket.emitToLobby, socket.setMyBid),
    [socket.emitToLobby, socket.setMyBid]
  );

  // Fehler tragen einen Schlüssel plus Platzhalter — erst hier werden sie in die
  // aktuelle Sprache übersetzt. Kennt diese Version den Schlüssel nicht, greift die
  // deutsche Meldung, die der Server mitgeschickt hat.
  const errorText = resolveError(t, socket.error);

  // Ein Spielabbruch wirft alle Spieler zurück in die Lobby — einmal nachfragen.
  const confirmCancelGame = () => {
    if (window.confirm(t.cancelGameConfirm)) actions.restartLobby();
  };

  const confirmTransferHost = (targetId) => {
    const target = socket.lobbyData?.players?.find(p => p.id === targetId);
    if (!target) return;
    if (window.confirm(t.transferHostConfirm(target.name, socket.effectiveIsHost))) {
      actions.transferHost(targetId);
    }
  };

  if (socket.phase === 'hub') {
    return (
      <HubScreen
        lang={lang} t={t} changeLang={changeLang}
        playerName={socket.playerName} setPlayerName={socket.setPlayerName}
        selectedAvatar={socket.selectedAvatar} setSelectedAvatar={socket.setSelectedAvatar}
        initialJoinCode={socket.initialJoinCode}
        onCreate={socket.createLobby}
        onJoin={socket.joinLobby}
        error={errorText}
      />
    );
  }

  if (socket.phase === 'lobby') {
    return (
      <LobbyScreen
        lobbyData={socket.lobbyData}
        historyData={socket.historyData}
        myId={socket.myId}
        actions={actions}
        canControlLobby={socket.canControlLobby}
        effectiveIsHost={socket.effectiveIsHost}
        isClashAdmin={socket.isClashAdmin}
        t={t} lang={lang} changeLang={changeLang}
        error={errorText}
        onLeave={socket.leaveLobby}
        onRequestHistory={socket.requestHistory}
        onTransferHost={confirmTransferHost}
      />
    );
  }

  return (
    <GameScreen
      socket={socket}
      actions={actions}
      t={t} lang={lang} changeLang={changeLang}
      error={errorText}
      canControlLobby={socket.canControlLobby}
      isClashAdmin={socket.isClashAdmin}
      showAdminPanel={showAdminPanel}
      setShowAdminPanel={setShowAdminPanel}
      onLeave={socket.leaveLobby}
      onCancelGame={confirmCancelGame}
      onTransferHost={confirmTransferHost}
    />
  );
}
