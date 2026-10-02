// Lässt den Tab-Titel blinken, solange `text` gesetzt ist UND der Tab nicht im Vordergrund ist — so sieht
// man in der Tableiste, dass das eigene Match bereit ist oder man beim Bannen dran ist. Sobald der Tab
// wieder sichtbar ist, steht der normale Titel da und onSeen() meldet, dass der Hinweis gesehen wurde.
import { useEffect, useRef } from 'react';

export function useTitleAlert(text, onSeen) {
  const onSeenRef = useRef(onSeen);
  useEffect(() => { onSeenRef.current = onSeen; }, [onSeen]);

  useEffect(() => {
    if (!text) return undefined;
    const original = document.title;
    let on = false;
    const visible = () => document.visibilityState === 'visible' && document.hasFocus();
    const tick = () => {
      if (visible()) {
        document.title = original;
        onSeenRef.current?.();
        return;
      }
      on = !on;
      document.title = on ? text : original;
    };
    const id = setInterval(tick, 1000);
    return () => { clearInterval(id); document.title = original; };
  }, [text]);
}
