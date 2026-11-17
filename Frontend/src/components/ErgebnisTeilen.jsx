// ErgebnisTeilen.jsx — Knopf „Ergebnis teilen“ für das Ende einer Partie, mit Vorschau-Fenster.
//
// Der Knopf übernimmt das Aussehen des Spiels (className); das Fenster ist das der Website. Erst der Klick zeichnet das
// Bild (utils/ergebnisbild.js), die Vorschau zeigt genau das, was geteilt wird. Teilen läuft über einen zweiten Klick,
// weil Safari das Teilen-Menü nur direkt nach einer Berührung öffnet — nach dem Zeichnen wäre die schon verbraucht.
//
//   <ErgebnisTeilen ergebnis={{ spiel: "lights-out", gross: "18:42", unter: "Entkommen" }} className="lo-btn" />
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Link2, Share2 } from "lucide-react";
import Dialog from "./ui/Dialog.jsx";
import Button from "./ui/Button.jsx";
import { useLanguage } from "../i18n/language.js";
import { ERGEBNIS_TEXTE } from "./ergebnisTeilenTexte.js";
import {
  alsPng, bildKopieren, dateiName, ergebnisText, kannBildKopieren, kannDateiTeilen, speichern, textKopieren,
  zeichneErgebnisbild,
} from "../utils/ergebnisbild.js";
import { meldeFehler } from "../utils/fehlerMelder.js";

/**
 * @param {object} props
 * @param {object|(() => object)} props.ergebnis  siehe utils/ergebnisbild.js (eine Funktion wird erst beim Klick gelesen)
 * @param {string} [props.className]  Klassen des Knopfs (Aussehen des Spiels)
 * @param {React.ReactNode} [props.children]  eigene Beschriftung statt „Ergebnis teilen“
 * @param {boolean} [props.mitSymbol]  Teilen-Symbol vor der Beschriftung (Standard: ja)
 */
export default function ErgebnisTeilen({ ergebnis, className = "", children, mitSymbol = true, ...rest }) {
  const { lang } = useLanguage({ supported: ERGEBNIS_TEXTE.langs });
  const t = ERGEBNIS_TEXTE.dict(lang);
  const [offen, setOffen] = useState(false);
  const [stand, setStand] = useState(null); // { phase: "laedt" | "fertig" | "fehler", blob?, url?, datei?, text, name }
  const [meldung, setMeldung] = useState(null); // { art: "ok" | "fehler", text }
  const lauf = useRef(0);
  const meldungTimer = useRef(0);

  // Vorschau-Adresse freigeben, sobald sie nicht mehr gebraucht wird
  useEffect(() => () => { if (stand?.url) URL.revokeObjectURL(stand.url); }, [stand?.url]);
  useEffect(() => () => { lauf.current += 1; clearTimeout(meldungTimer.current); }, []);

  const zeige = useCallback((art, text) => {
    setMeldung({ art, text });
    clearTimeout(meldungTimer.current);
    meldungTimer.current = setTimeout(() => setMeldung(null), 3200);
  }, []);

  const oeffnen = async () => {
    const nr = ++lauf.current;
    const e = typeof ergebnis === "function" ? ergebnis() : ergebnis;
    const text = ergebnisText(e);
    const name = dateiName(e);
    setMeldung(null);
    setOffen(true);
    setStand({ phase: "laedt", text, name });
    try {
      const canvas = await zeichneErgebnisbild(e, { aufruf: t.aufruf });
      const blob = await alsPng(canvas);
      if (nr !== lauf.current) return;
      const datei = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
      setStand({ phase: "fertig", blob, url: URL.createObjectURL(blob), datei, text, name });
    } catch (err) {
      if (nr !== lauf.current) return;
      meldeFehler("manuell", err, `Ergebnisbild (${e?.spiel || "?"}): ließ sich nicht zeichnen`);
      setStand({ phase: "fehler", text, name });
    }
  };

  const schliessen = () => {
    lauf.current += 1;
    setOffen(false);
    setStand(null);
    setMeldung(null);
  };

  const teilen = async () => {
    if (!stand?.datei) return;
    try {
      await navigator.share({ files: [stand.datei], text: stand.text });
    } catch (err) {
      if (err?.name === "AbortError") return; // selbst abgebrochen
      zeige("fehler", t.kopierFehler);
    }
  };

  const bildSpeichern = () => {
    if (!stand?.blob) return;
    speichern(stand.blob, stand.name);
    zeige("ok", t.gespeichert);
  };

  const bildInAblage = async () => {
    if (!stand?.blob) return;
    try {
      await bildKopieren(stand.blob);
      zeige("ok", t.bildKopiert);
    } catch {
      zeige("fehler", t.kopierFehler);
    }
  };

  const textInAblage = async () => {
    if (!stand?.text) return;
    zeige(...((await textKopieren(stand.text)) ? ["ok", t.textKopiert] : ["fehler", t.kopierFehler]));
  };

  const fertig = stand?.phase === "fertig";
  const teilbar = fertig && stand.datei && kannDateiTeilen(stand.datei);

  return (
    <>
      <button type="button" className={className} onClick={oeffnen} data-testid="ergebnis-teilen" {...rest}>
        {mitSymbol && <Share2 size={16} aria-hidden="true" style={{ flex: "none" }} />}
        {children ?? t.knopf}
      </button>
      <Dialog open={offen} onClose={schliessen} title={t.titel} kicker={t.kicker} width="md">
        <div className="flex flex-col gap-4">
          <div className="mx-auto w-full max-w-[min(100%,calc(52dvh*9/16))] aspect-[9/16] rounded-md overflow-hidden border border-line bg-black/40 flex items-center justify-center">
            {fertig ? (
              <img src={stand.url} alt={t.vorschau} className="block w-full h-full object-contain" data-testid="ergebnis-vorschau" />
            ) : (
              <p className="px-6 text-center text-white/60" role="status">{stand?.phase === "fehler" ? t.fehler : t.laedt}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {teilbar && (
              <Button icon={Share2} onClick={teilen} className="col-span-2">{t.teilen}</Button>
            )}
            {fertig && (
              <Button variant={teilbar ? "secondary" : "primary"} icon={Download} onClick={bildSpeichern}>{t.speichern}</Button>
            )}
            {fertig && kannBildKopieren() && (
              <Button variant="secondary" icon={Copy} onClick={bildInAblage}>{t.bildKopieren}</Button>
            )}
            <Button variant="secondary" icon={Link2} onClick={textInAblage}
              className={fertig && kannBildKopieren() ? "col-span-2" : ""}>
              {t.textKopieren}
            </Button>
          </div>
          <p className={`min-h-[1.25rem] text-xs flex items-center gap-1.5 ${meldung?.art === "fehler" ? "text-amber-300" : "text-white/55"}`} role="status" aria-live="polite">
            {meldung?.art === "ok" && <Check size={14} aria-hidden="true" />}
            {meldung ? meldung.text : t.hinweis}
          </p>
        </div>
      </Dialog>
    </>
  );
}
