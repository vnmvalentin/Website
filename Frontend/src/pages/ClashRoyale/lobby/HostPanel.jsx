// Einstellungsfenster des Hosts — ausschließlich die Regler des GEWÄHLTEN Spielmodus.
//
// Hier lagen anfangs auch Spielmodus, Kartenpool und die Lobby-Sperre. Das war falsch
// herum: Modus und Kartenpool wechselt man häufig und in Absprache mit der Runde, die
// Sperre gehört neben den Einladungscode. Beides steht jetzt dauerhaft in der Lobby
// (LobbyControls.jsx bzw. LobbyCodeCard.jsx). Übrig bleibt hier genau das, was ohne
// gewählten Modus gar keine Bedeutung hätte.
//
// MITTIG STATT RECHTS:
// Vorher fuhr das Fenster als Offcanvas von rechts ein. Der Blick musste dafür quer über
// den Bildschirm springen, und auf einem breiten Schirm klebte es am äußersten Rand,
// während die Lobby links weiterlief. Jetzt ist es ein zentrierter Dialog — dieselbe
// Hülle, die auch Kartenpool, Verlauf und Accountverknüpfung benutzen (ui/Modal.jsx).
// Auf dem Handy sitzt der Dialog weiterhin am unteren Rand, damit die Kopfzeile in
// Daumenreichweite bleibt; das macht Modal von sich aus.

import React from 'react';
import { Sliders } from 'lucide-react';
import Modal from '../ui/Modal';
import HostSettings from './HostSettings';
import { modeNameFor } from '../modesConfig';

export default function HostPanel({
  open, onClose,
  lobbyData, actions, t, lang,
  isClashAdmin, effectiveIsHost,
  poolSize, activeCount,
  carouselMaxPlayers, carouselTooMany,
}) {
  // Modal kennt kein `open` — es hängt seine Fokusklammer beim Einhängen auf und
  // erwartet, dass es im geschlossenen Zustand gar nicht erst gerendert wird.
  if (!open) return null;

  const mode = lobbyData?.mode || 'snake';

  // Kein Start-Knopf mehr im Fuß: Er stand hier UND in der Lobby, und aus einem
  // Einstellungsfenster heraus ein Spiel zu starten ist eine Aktion, die man dort
  // nicht erwartet. Gestartet wird in der Lobby.
  return (
    <Modal
      onClose={onClose}
      title={t.hostPanelTitle}
      icon={<Sliders size={15} className="text-violet-400 shrink-0" />}
      // md (max-w-2xl) statt lg: Regler brauchen keine 4xl-Breite, und ein zu breiter
      // Dialog lässt Beschriftung und Wert weit auseinanderdriften.
      size="md">

      {/* Die Abstände kamen vorher vom Drawer; Modal überlässt sie dem Inhalt. */}
      <div className="px-5 py-5 space-y-5">
        {/* Welcher Modus gerade eingestellt wird — die Auswahl selbst steht in der Lobby */}
        <p className="text-white/40 text-xs uppercase tracking-wider">{modeNameFor(mode, lang)}</p>

        <HostSettings
          lobbyData={lobbyData}
          actions={actions}
          t={t}
          lang={lang}
          isClashAdmin={isClashAdmin}
          effectiveIsHost={effectiveIsHost}
          poolSize={poolSize}
          activeCount={activeCount}
          carouselMaxPlayers={carouselMaxPlayers}
          carouselTooMany={carouselTooMany}
        />
      </div>
    </Modal>
  );
}
