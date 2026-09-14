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

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TwitchAuthContext } from '../../components/TwitchAuthContext';
import { useLanguage } from './useLanguage';
import { resolveError } from './i18n';
import { useClashSocket } from './useClashSocket';
import { useProfile } from './useProfile';
import { createClashActions } from './clashActions';
import HubScreen from './hub/HubScreen';
import LobbyScreen from './lobby/LobbyScreen';
import GameScreen from './game/GameScreen';

export default function ClashRoyalePage() {
  const { user } = useContext(TwitchAuthContext);
  const { lang, t, changeLang } = useLanguage();
  const socket = useClashSocket(user);
  const profileState = useProfile(user);
  const { profile, loading: profileLoading } = profileState;
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const actions = useMemo(
    () => createClashActions(socket.emitToLobby, socket.setMyBid),
    [socket.emitToLobby, socket.setMyBid]
  );

  // Twitch-Bild als Avatar zeigen, sobald die Profil-Option aktiv ist und eine
  // Twitch-Sitzung mit Profilbild besteht — sonst der normale feste Avatar.
  useEffect(() => {
    socket.setSelectedAvatarUrl(
      profile.useTwitchAvatar && user?.profileImageUrl ? user.profileImageUrl : null
    );
  }, [profile.useTwitchAvatar, user?.profileImageUrl, socket.setSelectedAvatarUrl]);

  // Name/Avatar aus dem Profil übernehmen — beim ersten Laden UND wann immer sich der
  // Profilwert später ändert (z.B. gerade eben im Profil-Fenster gesetzt), aber nie über
  // eine Eingabe hinweg, die der Nutzer selbst im Hub gemacht hat. Je ein Ref merkt sich
  // den zuletzt AUS DEM PROFIL übernommenen Wert — weicht das Hub-Feld davon ab, hat der
  // Nutzer selbst getippt/gewählt, und die Synchronisierung hält sich fortan raus.
  const lastSyncedNameRef = useRef(null);
  useEffect(() => {
    if (profileLoading || !profile.displayName) return;
    const untouched = lastSyncedNameRef.current === null
      ? socket.playerName === ''
      : socket.playerName === lastSyncedNameRef.current;
    if (untouched && profile.displayName !== lastSyncedNameRef.current) socket.setPlayerName(profile.displayName);
    lastSyncedNameRef.current = profile.displayName;
  }, [profileLoading, profile.displayName, socket.playerName, socket.setPlayerName]);

  const lastSyncedAvatarRef = useRef(null);
  useEffect(() => {
    if (profileLoading || profile.useTwitchAvatar || !profile.avatarId) return;
    const untouched = lastSyncedAvatarRef.current === null
      ? true // erster Lauf: der bisherige Wert war nur der Hook-Default, darf übernommen werden
      : socket.selectedAvatar === lastSyncedAvatarRef.current;
    if (untouched && profile.avatarId !== lastSyncedAvatarRef.current) socket.setSelectedAvatar(profile.avatarId);
    lastSyncedAvatarRef.current = profile.avatarId;
  }, [profileLoading, profile.avatarId, profile.useTwitchAvatar, socket.selectedAvatar, socket.setSelectedAvatar]);

  // Lobby beigetreten/erstellt + im Profil ein CR-Tag hinterlegt → automatisch verknüpfen,
  // sofern dieser Spieler in DIESER Lobby noch keinen hat. Ref hält den zuletzt behandelten
  // Lobby-Code fest, damit ein manuelles Lösen der Verknüpfung nicht sofort wieder
  // automatisch rückgängig gemacht wird.
  const autoLinkedCodeRef = useRef(null);
  useEffect(() => {
    if (socket.phase !== 'lobby' || !socket.lobbyData || !profile.crTag) return;
    if (autoLinkedCodeRef.current === socket.lobbyData.code) return;
    autoLinkedCodeRef.current = socket.lobbyData.code;
    const me = socket.lobbyData.players?.find(p => p.id === socket.myId);
    if (!me || me.crTag) return; // schon verknüpft oder kein regulärer Spieler (Admin)
    actions.linkCrAccount(socket.myId, profile.crTag);
  }, [socket.phase, socket.lobbyData, socket.myId, profile.crTag, actions]);

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
        selectedAvatarUrl={socket.selectedAvatarUrl} setSelectedAvatarUrl={socket.setSelectedAvatarUrl}
        initialJoinCode={socket.initialJoinCode}
        onCreate={socket.createLobby}
        onJoin={socket.joinLobby}
        error={errorText}
        publicLobbies={socket.publicLobbies}
        profile={profile}
        updateProfile={profileState.updateProfile}
        linkCr={profileState.linkCr}
        unlinkCr={profileState.unlinkCr}
        switchActiveCr={profileState.switchActiveCr}
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
        profile={profile}
        switchActiveCr={profileState.switchActiveCr}
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
