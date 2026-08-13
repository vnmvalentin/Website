// PollsPredictionsOverlay.jsx — OBS-Browserquelle für alle Twitch-Overlay-Module.
// Authentifiziert sich ausschließlich über den overlayKey; der Twitch-Token bleibt
// im Backend. Hintergrund ist transparent, Zielauflösung 1920x1080.
//
// Welche Module erscheinen, entscheiden allein die Häkchen im Dashboard — es gibt
// bewusst keine Modul-Auswahl über die URL mehr. Eine Quelle, ein Link.
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useStableState } from '../../utils/useStableState';
import { getOverlayData } from './streamToolApi';
import {
  mergeConfig, toPollView, toPredictionView, toGoalView, toRaidView, toStatsView,
  useDemoSim, useLinger, paintDemo,
} from './streamToolConfig';
import {
  PollWidget, PredictionWidget, GoalWidget, RaidClipWidget, StatsWidget, WidgetFrame, STAGE_W, STAGE_H,
} from './OverlayWidgets';

const POLL_MS = 2000;

export default function PollsPredictionsOverlay() {
  const { overlayKey } = useParams();
  const [search] = useSearchParams();
  // ?demo=1 zeigt Beispieldaten — praktisch, um die Quelle in OBS auszurichten,
  // ohne extra eine echte Abstimmung starten zu müssen.
  const demo = search.get('demo') === '1';
  // ?demoOutcomes=4 zeigt bei der Vorhersage die Listen- statt der Versus-Ansicht
  const demoOutcomes = Math.max(2, Math.min(10, Number(search.get('demoOutcomes')) || 2));

  // Läuft in OBS dauerhaft: nur neu rendern, wenn die Route wirklich etwas Neues liefert
  const [payload, setPayload] = useStableState(null);
  const [scale, setScale] = useState(1);
  // Differenz zwischen Server- und Browseruhr — sonst laufen die Timer schief,
  // wenn die Uhr des Stream-PCs ein paar Sekunden abweicht.
  const clockOffset = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getOverlayData(overlayKey)
        .then(({ serverNow, ...rest }) => {
          if (!alive) return;
          // serverNow bewusst NICHT in den State: der Zeitstempel ändert sich bei
          // jedem Abruf und würde den Änderungsvergleich in useStableState
          // wirkungslos machen. Für den Uhren-Abgleich genügt eine Ref.
          clockOffset.current = serverNow - Date.now();
          setPayload(rest);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [overlayKey, setPayload]);

  // Eigener Takt zwischen den Abrufen. Er läuft, sobald überhaupt eine Abstimmung
  // oder Vorhersage vorliegt — NICHT nur bei laufendem Countdown.
  //
  // Das ist wichtig: Ein beendetes Ergebnis bleibt bewusst noch 20 bzw. 25 Sekunden
  // stehen und blendet dann aus. Diese Entscheidung fällt beim Rendern anhand der
  // Uhr. Stünde die Uhr nach dem Ende still, käme auch kein Render mehr — und das
  // Ergebnis bliebe für immer im Bild hängen, weil die unveränderte Antwort vom
  // Server (siehe useStableState) ebenfalls keinen Render mehr auslöst.
  //
  // Läuft dagegen gar nichts, tickt auch nichts: Genau das ist im Stream der
  // Normalfall und spart das dauerhafte Neurendern in OBS.
  const clockNeeded = demo || !!payload?.poll || !!payload?.prediction || !!payload?.raid;

  useEffect(() => {
    if (!clockNeeded) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [clockNeeded]);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const config = mergeConfig(payload?.config);
  const m = config.modules;
  const sim = useDemoSim(demo, demoOutcomes);

  const now = Date.now() + clockOffset.current;
  const goals = demo ? sim.goals : payload?.goals;

  const pollView = demo ? paintDemo(sim.poll, m.poll) : toPollView(payload?.poll, m.poll, now);
  const predView = demo ? paintDemo(sim.prediction, m.prediction) : toPredictionView(payload?.prediction, m.prediction, now);
  const followerView = toGoalView('followerGoal', goals, m.followerGoal);
  const subView = toGoalView('subGoal', goals, m.subGoal);
  const raidView = toRaidView(demo ? sim.raid : payload?.raid, m.raidClip, now);
  const statsView = toStatsView(demo ? sim.stats : payload?.stats, m.streamStats);

  // Nachlaufende Kopien, damit das Ausblenden sichtbar wird
  const pollHeld = useLinger(pollView);
  const predHeld = useLinger(predView);
  const raidHeld = useLinger(raidView);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', overflow: 'hidden' }}>
      {/* OBS-Quelle gehört nicht in die Suche (zusätzlich per robots.txt gesperrt) */}
      <meta name="robots" content="noindex, nofollow" />

      {/* zoom statt transform: scale — sonst hält Twitch den Raid-Clip für
          verdeckt und startet ihn nicht von allein (siehe WidgetFrame). Bei
          einer 1920x1080-Browserquelle ist der Wert ohnehin genau 1. */}
      <div className="stw-stage" style={{ zoom: scale }}>
        <WidgetFrame id="poll" module={m.poll} visible={!!pollView && m.poll.enabled}>
          {pollHeld && <PollWidget data={pollHeld} module={m.poll} />}
        </WidgetFrame>

        <WidgetFrame id="prediction" module={m.prediction} visible={!!predView && m.prediction.enabled}>
          {predHeld && <PredictionWidget data={predHeld} module={m.prediction} />}
        </WidgetFrame>

        <WidgetFrame id="followerGoal" module={m.followerGoal} visible={!!followerView && m.followerGoal.enabled}>
          {followerView && <GoalWidget data={followerView} module={m.followerGoal} />}
        </WidgetFrame>

        <WidgetFrame id="subGoal" module={m.subGoal} visible={!!subView && m.subGoal.enabled}>
          {subView && <GoalWidget data={subView} module={m.subGoal} />}
        </WidgetFrame>

        <WidgetFrame id="streamStats" module={m.streamStats} visible={!!statsView && m.streamStats.enabled}>
          {statsView && <StatsWidget data={statsView} module={m.streamStats} />}
        </WidgetFrame>

        <WidgetFrame id="raidClip" module={m.raidClip} visible={!!raidView && m.raidClip.enabled}>
          {raidHeld && <RaidClipWidget data={raidHeld} module={m.raidClip} />}
        </WidgetFrame>
      </div>
    </div>
  );
}
