// components/BarrierefreiEinstellungen.jsx — die Schalter für Barrierefreiheit (utils/barrierefrei.js), auf der Seite
// /barrierefreiheit und im Profil. Gelten je Gerät; jede Änderung wirkt sofort auf der ganzen Website.
import React, { useId } from "react";
import { Segmented, Button } from "./ui";
import { BARRIEREFREI_TEXTE } from "./barrierefreiTexte.js";
import { SPIELE_MIT, meldeGeraeusch, useBarrierefrei } from "../utils/barrierefrei.js";
import UntertitelLeiste from "./UntertitelLeiste.jsx";

function Schalter({ an, onClick, labelId, beschreibungId, t }) {
  return (
    <button type="button" role="switch" aria-checked={an} aria-labelledby={labelId} aria-describedby={beschreibungId} onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${an ? "bg-accent border-accent" : "bg-white/[0.08] border-white/25"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${an ? "translate-x-6" : "translate-x-1"}`} />
      <span className="sr-only">{an ? t.an : t.aus}</span>
    </button>
  );
}

function Zeile({ titel, titelId, text, textId, zusatz, steuerung }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 py-4 first:pt-0 last:pb-0 border-b border-line last:border-b-0">
      <div className="min-w-0 flex-1">
        <h3 id={titelId} className="text-sm font-semibold text-white">{titel}</h3>
        <p id={textId} className="mt-1 text-sm text-white/60 leading-relaxed">{text}</p>
        {zusatz && <p className="mt-1.5 text-xs text-white/55">{zusatz}</p>}
      </div>
      <div className="shrink-0">{steuerung}</div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.lang
 */
export default function BarrierefreiEinstellungen({ lang }) {
  const t = BARRIEREFREI_TEXTE.dict(lang);
  const e = useBarrierefrei();
  const id = useId();
  const wahl = (feld) => [
    { value: "system", label: t.wieSystem },
    { value: feld === "bewegung" ? "reduziert" : "hoch", label: t.immer },
  ];
  const spiele = (art) => (SPIELE_MIT[art].length ? t.spieleMit(SPIELE_MIT[art].map((s) => s.name).join(", ")) : null);

  return (
    <div>
      <Zeile titel={t.bewegung} titelId={`${id}-b`} text={t.bewegungText} textId={`${id}-bt`}
        zusatz={e.bewegung === "system" ? (e.bewegungReduziert ? t.systemBewegungAn : t.systemBewegungAus) : null}
        steuerung={<Segmented size="sm" label={t.bewegung} options={wahl("bewegung")} value={e.bewegung} onChange={(v) => e.setze({ bewegung: v })} />} />
      <Zeile titel={t.kontrast} titelId={`${id}-k`} text={t.kontrastText} textId={`${id}-kt`}
        zusatz={e.kontrast === "system" ? (e.mehrKontrast ? t.systemKontrastAn : t.systemKontrastAus) : null}
        steuerung={<Segmented size="sm" label={t.kontrast} options={wahl("kontrast")} value={e.kontrast} onChange={(v) => e.setze({ kontrast: v })} />} />
      {/* Spiele erst erwähnen, wenn eines die Farbhilfe kann (SPIELE_MIT in utils/barrierefrei.js) */}
      <Zeile titel={t.farbhilfe} titelId={`${id}-f`} text={SPIELE_MIT.farbhilfe.length ? t.farbhilfeText : t.farbhilfeTextNurLinks}
        textId={`${id}-ft`} zusatz={spiele("farbhilfe")}
        steuerung={<Schalter an={e.farbhilfe} onClick={() => e.setze({ farbhilfe: !e.farbhilfe })} labelId={`${id}-f`} beschreibungId={`${id}-ft`} t={t} />} />
      {/* Untertitel erst anbieten, wenn ein Spiel sie liefert (SPIELE_MIT in utils/barrierefrei.js) */}
      {SPIELE_MIT.untertitel.length > 0 && (
        <Zeile titel={t.untertitel} titelId={`${id}-u`} text={t.untertitelText} textId={`${id}-ut`} zusatz={spiele("untertitel")}
          steuerung={(
            <div className="flex items-center gap-3">
              {e.untertitel && <Button size="sm" variant="secondary" onClick={() => meldeGeraeusch(t.untertitelProbeText, { schluessel: "probe" })}>{t.untertitelProbe}</Button>}
              <Schalter an={e.untertitel} onClick={() => e.setze({ untertitel: !e.untertitel })} labelId={`${id}-u`} beschreibungId={`${id}-ut`} t={t} />
            </div>
          )} />
      )}
      <UntertitelLeiste className="bottom-8 left-1/2 -translate-x-1/2" />
    </div>
  );
}
