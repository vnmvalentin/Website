// garden/core/weather.js
// Wetter-Effekte an Pflanzen und geernteter Ware — eine Quelle für Server und Browser.
//
// Seit v3.4 kann ein Stück MEHRERE Effekte zugleich tragen (nass UND gefroren UND
// geladen). Die Liste steht in `statusEffects`; `statusEffect` führt weiterhin den
// wertvollsten davon mit, damit alles, was nur einen einzigen darstellen kann —
// Tönung, Vitrine, Post, Admin-Menü — unverändert weiterläuft.
//
// Muss zu wetterListe()/wetterBoost() in Frontend/.../engine/PlantSystem.js passen.
// Der Browser rechnet denselben Wert für die Anzeige aus; auseinanderlaufende
// Tabellen hiessen, dass die Hover-Karte etwas anderes verspricht als die Kasse zahlt.

const WEATHER_SELL_BOOST = { wet: 1.25, frozen: 1.5, charged: 2, moonlit: 3 };

/**
 * Alle Effekte eines Trägers als Liste. Nimmt den Träger, eine fertige Liste oder
 * einen einzelnen Effekt entgegen.
 *
 * Der Rückfall auf das Einzelfeld ist nicht optional: Ware, die vor v3.4 geerntet
 * wurde, liegt teils seit Wochen in Kiste und Vitrine und kennt nur `statusEffect`.
 * Ohne ihn verlöre sie beim Verkauf ihren Aufschlag.
 */
function wetterListe(traeger) {
    if (Array.isArray(traeger)) return traeger.filter((e) => WEATHER_SELL_BOOST[e]);
    if (typeof traeger === "string") return WEATHER_SELL_BOOST[traeger] ? [traeger] : [];
    const liste = traeger?.statusEffects;
    if (Array.isArray(liste)) return liste.filter((e) => WEATHER_SELL_BOOST[e]);
    return traeger?.statusEffect && WEATHER_SELL_BOOST[traeger.statusEffect] ? [traeger.statusEffect] : [];
}

/** Der wertvollste Effekt — für alles, was nur einen einzigen darstellen kann. */
function staerksterEffekt(traeger) {
    let beste = null;
    for (const e of wetterListe(traeger)) {
        if (!beste || WEATHER_SELL_BOOST[e] > WEATHER_SELL_BOOST[beste]) beste = e;
    }
    return beste;
}

/** Aufschlag aller Effekte zusammen — sie multiplizieren sich. */
function wetterBoost(traeger) {
    let faktor = 1;
    for (const e of wetterListe(traeger)) faktor *= WEATHER_SELL_BOOST[e];
    return faktor;
}

module.exports = { WEATHER_SELL_BOOST, wetterListe, staerksterEffekt, wetterBoost };
