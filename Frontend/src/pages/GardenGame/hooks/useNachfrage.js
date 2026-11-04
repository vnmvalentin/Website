// hooks/useNachfrage.js
// Gefragte Sorten am Markt (Backend garden/core/nachfrage.js): jede volle Stunde 3–4
// Sorten mit +20 bis +50 % beim Verkauf. Geholt beim Betreten der Welt und erneut,
// sobald die Stunde vorbei ist. Rechnen tut allein der Server beim Verkauf.
import { useEffect, useState } from "react";

export default function useNachfrage({ apiCall, showLobbyScreen }) {
    const [nachfrage, setNachfrage] = useState(null);

    useEffect(() => {
        if (showLobbyScreen) return undefined;
        let aus = false;
        let timer = null;
        const holen = () => {
            apiCall("/nachfrage")
                .then((data) => {
                    if (aus || !Array.isArray(data?.sorten)) return;
                    setNachfrage(data);
                    // Kurz nach dem Wechsel neu holen (+2 s Puffer gegen Uhrenversatz).
                    const warten = Math.max(5000, Number(data.bis) - Date.now() + 2000);
                    timer = setTimeout(holen, Math.min(warten, 60 * 60 * 1000));
                })
                .catch(() => {
                    if (!aus) timer = setTimeout(holen, 60 * 1000);
                });
        };
        holen();
        return () => { aus = true; if (timer) clearTimeout(timer); };
    }, [apiCall, showLobbyScreen]);

    return nachfrage;
}
