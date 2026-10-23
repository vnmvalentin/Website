// Eigene Bewegung im Dunklen Labyrinth: lokale Vorhersage + Abgleich mit dem Server.
// Geteilt von der Draufsicht (DarkMaze.jsx → MazeCanvas) und der Ego-Perspektive
// (maze/Maze3D.jsx) — beide schicken dieselben Schritte (oben/unten/links/rechts) an den
// Server, nur die Eingabe und die Darstellung unterscheiden sich.
import { useCallback, useEffect, useRef } from 'react';

export const MOVE_DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Ein bestätigter Zug ist nach spätestens dieser Zeit durch — was dann noch offen ist,
// ist unterwegs verloren gegangen und darf die Vorhersage nicht weiter verschieben.
const MOVE_ACK_TIMEOUT_MS = 2000;

export const isWalkable = (s, x, y) => x >= 0 && y >= 0 && x < s.W && y < s.H && s.walls[y][x] !== '1';

/**
 * @returns {{ predRef, pendingRef, tryStep(s, dir, nowPerf, onMove): 'moved'|'wall'|'wait' }}
 *   predRef.current = { x, y, dir } — vorhergesagte eigene Position (dir: 1/-1 Blickrichtung
 *   der Draufsicht-Figur)
 */
export function useMazeStepper({ state, myPlayerId, frozen }) {
  const predRef = useRef(null);         // lokale Vorhersage der eigenen Position
  const pendingRef = useRef([]);        // gesendete, vom Server noch nicht quittierte Schritte
  const seqRef = useRef(0);             // fortlaufende Nummer je gesendetem Schritt
  const lastStepRef = useRef(0);

  // Eigene Vorhersage gegen den Server abgleichen. Der Server quittiert mit positions[me].seq
  // JEDEN empfangenen Zug — auch abgelehnte. Alles bis dahin ist damit erledigt; die eigene
  // Position ist deshalb exakt "Serverposition + die danach gesendeten Schritte". Eine
  // Toleranzschwelle braucht es dafür nicht mehr: früher galt jede Abweichung unter zwei
  // Kacheln als Latenz und wurde geschluckt, bis sie größer wurde — dann sprang die Figur
  // sichtbar mehrere Kacheln zurück. Jetzt wird ein verworfener Schritt sofort und einzeln
  // korrigiert, und die Interpolation im Renderer gleitet die Kachel weich zurück.
  useEffect(() => {
    const sp = state?.positions?.[myPlayerId];
    if (!sp) { predRef.current = null; pendingRef.current = []; return; }
    if (frozen) {
      pendingRef.current = [];
      predRef.current = { x: sp.x, y: sp.y, dir: sp.dir || 1 };
      return;
    }
    if (sp.seq === undefined) {
      // Server ohne Zug-Quittung (z.B. eine ältere Instanz während eines Deploys):
      // wie früher nur bei grober Abweichung nachziehen, statt blind neu zu rechnen.
      pendingRef.current = [];
      const prev = predRef.current;
      if (!prev || Math.abs(prev.x - sp.x) + Math.abs(prev.y - sp.y) > 1.5) {
        predRef.current = { x: sp.x, y: sp.y, dir: sp.dir || 1 };
      }
      return;
    }
    const ack = sp.seq || 0;
    const cutoff = performance.now() - MOVE_ACK_TIMEOUT_MS;
    pendingRef.current = pendingRef.current.filter(m => m.seq > ack && m.at > cutoff);
    let x = sp.x, y = sp.y, dir = sp.dir || 1;
    for (const m of pendingRef.current) {
      const D = MOVE_DIRS[m.dir];
      const nx = x + D[0], ny = y + D[1];
      if (!isWalkable(state, nx, ny)) continue;
      x = nx; y = ny;
      if (D[0] !== 0) dir = D[0];
    }
    predRef.current = { x, y, dir };
  }, [state?.positions, state?.walls, state?.W, state?.H, myPlayerId, frozen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Einen Schritt versuchen: höchstens einer je s.stepMs, an der Wand schneller neu probieren.
  const tryStep = useCallback((s, dir, nowPerf, onMove) => {
    const pred = predRef.current;
    if (!pred || nowPerf - lastStepRef.current < s.stepMs) return 'wait';
    const D = MOVE_DIRS[dir];
    const nx = pred.x + D[0], ny = pred.y + D[1];
    if (!isWalkable(s, nx, ny)) {
      lastStepRef.current = nowPerf - s.stepMs * 0.5;
      return 'wall';
    }
    pred.x = nx; pred.y = ny;
    if (D[0] !== 0) pred.dir = D[0];
    lastStepRef.current = nowPerf;
    const seq = ++seqRef.current;
    pendingRef.current.push({ seq, dir, at: nowPerf });
    onMove(dir, seq);
    return 'moved';
  }, []);

  return { predRef, pendingRef, tryStep };
}
