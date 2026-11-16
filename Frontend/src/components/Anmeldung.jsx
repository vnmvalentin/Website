// components/Anmeldung.jsx — der Anmelde-Dialog (Twitch, Discord, Gast, Wiederherstellungscode) und der kurze Hinweis
// nach einer Anmeldung. Einmal in App.jsx eingehängt; öffnen von überall mit oeffneAnmeldung() aus utils/konto.js.
import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, UserRound, Copy, Check, X } from "lucide-react";
import { TwitchAuthContext } from "./TwitchAuthContext";
import { TwitchGlyph, DiscordGlyph } from "./BrandGlyphs";
import { Dialog, Button, Input, Field } from "./ui";
import { useLanguage } from "../i18n/language.js";
import { salesVisible } from "../config/legal";
import { ANMELDUNG_TEXTE, hinweisText } from "./anmeldungTexte.js";
import {
  useKonto, schliesseAnmeldung, alsGastStarten, mitCodeAnmelden, mitDiscordAnmelden,
  zeigeKontoHinweis, leseKontoRuecksprung, ladeKonto,
} from "../utils/konto.js";

function Weg({ icon: Icon, farbe, titel, hinweis, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-lg border border-line bg-black/25 hover:bg-white/[0.05] hover:border-white/20 p-3.5 text-left transition-colors disabled:opacity-50"
    >
      <span className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${farbe}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{titel}</span>
        <span className="block text-xs text-white/45 mt-0.5">{hinweis}</span>
      </span>
    </button>
  );
}

function CodeAnzeige({ code, t, onFertig }) {
  const [kopiert, setKopiert] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* ohne Zwischenablage bleibt Abschreiben */ }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/70">{t.gastText}</p>
      <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-4 space-y-3">
        <code className="block text-center font-mono text-xl font-bold tracking-wider text-white select-all whitespace-nowrap">{code}</code>
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" icon={kopiert ? Check : Copy} onClick={kopieren}>{kopiert ? t.kopiert : t.kopieren}</Button>
        </div>
      </div>
      <p className="text-xs text-white/45">{t.gastSpaeter}</p>
      <Button block onClick={onFertig}>{t.notiert}</Button>
    </div>
  );
}

function CodeEingabe({ t, onZurueck }) {
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);
  const absenden = async (e) => {
    e.preventDefault();
    setLaedt(true);
    setFehler("");
    try {
      await mitCodeAnmelden(code);
    } catch (err) {
      setFehler(err?.message || t.fehlerAllgemein);
    }
    setLaedt(false);
  };
  return (
    <form onSubmit={absenden} className="space-y-4">
      <Field label={t.codeFeld} error={fehler}>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.codeBeispiel} autoComplete="off"
          spellCheck={false} className="font-mono tracking-wider uppercase" maxLength={40} />
      </Field>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onZurueck}>{t.zurueck}</Button>
        <Button type="submit" className="flex-1" loading={laedt} disabled={code.trim().length < 16}>{t.codeLos}</Button>
      </div>
    </form>
  );
}

function AnmeldeDialog() {
  const { dialog } = useKonto();
  const { login } = useContext(TwitchAuthContext) || {};
  const { lang } = useLanguage({ supported: ANMELDUNG_TEXTE.langs });
  const t = ANMELDUNG_TEXTE.dict(lang);
  const [ansicht, setAnsicht] = useState("wahl"); // wahl | code | gast
  const [gastCode, setGastCode] = useState("");
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  useEffect(() => {
    if (dialog) {
      setAnsicht("wahl");
      setFehler("");
    }
  }, [dialog]);

  const gast = async () => {
    setLaedt(true);
    setFehler("");
    try {
      const { code } = await alsGastStarten();
      setGastCode(code);
      setAnsicht("gast");
    } catch (err) {
      setFehler(err?.message || t.fehlerAllgemein);
    }
    setLaedt(false);
  };

  // Den Code-Hinweis nicht per Klick daneben verlieren — erst „notiert“ schließt
  const schliessbar = ansicht !== "gast";
  const titel = ansicht === "gast" ? t.gastTitel : ansicht === "code" ? t.codeTitel : t.titel;

  return (
    <Dialog open={dialog} onClose={schliesseAnmeldung} title={titel} width="md" dismissible={schliessbar}>
      {ansicht === "wahl" && (
        <div className="space-y-3">
          <p className="text-sm text-white/60">{t.einleitung}</p>
          <Weg icon={TwitchGlyph} farbe="bg-twitch/15 text-[#a970ff]" titel={t.twitch} hinweis={t.twitchHinweis}
            onClick={() => { schliesseAnmeldung(); login?.(false); }} />
          <Weg icon={DiscordGlyph} farbe="bg-discord/15 text-[#7984f5]" titel={t.discord} hinweis={t.discordHinweis}
            onClick={() => mitDiscordAnmelden()} />
          <Weg icon={UserRound} farbe="bg-white/[0.06] text-white/70" titel={t.gast} hinweis={t.gastHinweis}
            onClick={gast} disabled={laedt} />
          {fehler && <p className="text-xs text-red-300">{fehler}</p>}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button type="button" onClick={() => setAnsicht("code")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-soft hover:text-white">
              <KeyRound size={13} /> {t.codeLink}
            </button>
            {/* Rechtsseiten sind live ausgeblendet, solange die Betreiber-Angaben fehlen (config/legal.js) — sonst 404 */}
            {salesVisible() && (
              <Link to="/datenschutz" onClick={schliesseAnmeldung} className="text-[11px] text-white/35 hover:text-white/60">
                {t.rechtliches}
              </Link>
            )}
          </div>
        </div>
      )}
      {ansicht === "code" && <CodeEingabe t={t} onZurueck={() => setAnsicht("wahl")} />}
      {ansicht === "gast" && <CodeAnzeige code={gastCode} t={t} onFertig={schliesseAnmeldung} />}
    </Dialog>
  );
}

function KontoHinweisLeiste() {
  const { hinweis } = useKonto();
  const { lang } = useLanguage({ supported: ANMELDUNG_TEXTE.langs });
  const t = ANMELDUNG_TEXTE.dict(lang);

  useEffect(() => {
    if (!hinweis) return undefined;
    const ms = hinweis.status === "fehler" ? 9000 : 5000;
    const timer = setTimeout(() => zeigeKontoHinweis(null), ms);
    return () => clearTimeout(timer);
  }, [hinweis]);

  if (!hinweis) return null;
  const fehler = hinweis.status === "fehler";
  return (
    <div className="fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4 pointer-events-none">
      <div role="status" aria-live="polite"
        className={`pointer-events-auto flex items-start gap-3 max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg bg-surface-raised ${
          fehler ? "border-red-500/40 text-red-100" : "border-emerald-500/30 text-white"
        }`}>
        <span className="flex-1">{hinweisText(t, hinweis)}</span>
        <button type="button" onClick={() => zeigeKontoHinweis(null)} aria-label={t.hinweise.schliessen}
          className="text-white/40 hover:text-white shrink-0"><X size={15} /></button>
      </div>
    </div>
  );
}

// OBS-Overlays und Steuer-Links brauchen kein Konto — dort keine Anfrage und kein Fokus-Abgleich
// (dasselbe Muster wie in index.html und Backend/analytics/normalize.js)
const OHNE_KONTO = /(^\/winchallengeoverlay\/)|(\/overlay\/)|(^\/winchallengecontrol(\/|$))/i;

/** Dialog + Hinweis; lädt beim Start das Konto und liest den Rücksprung von Discord */
export default function Anmeldung() {
  useEffect(() => {
    if (OHNE_KONTO.test(`${window.location.pathname}/`)) return undefined;
    const ruecksprung = leseKontoRuecksprung();
    ladeKonto().then((konto) => {
      if (!ruecksprung) return;
      zeigeKontoHinweis(ruecksprung.status === "angemeldet" ? { ...ruecksprung, name: konto?.name } : ruecksprung);
    });
    const beiFokus = () => { if (!document.hidden) ladeKonto(); };
    window.addEventListener("focus", beiFokus);
    return () => window.removeEventListener("focus", beiFokus);
  }, []);

  return (
    <>
      <AnmeldeDialog />
      <KontoHinweisLeiste />
    </>
  );
}
