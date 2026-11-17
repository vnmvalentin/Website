// pages/Website/Laden.jsx — /laden: einmal unterstützen (fester Betrag → Abzeichen „Unterstützer“, auf Wunsch
// Dankesliste), Designs für die Spiele (Katalog in Backend/laden/katalog.js) und die Dankesliste. Gibt es erst, wenn
// verkauft werden darf (config/legal.js → salesVisible), vorher 404 wie /abo.
//
// Rechtliches, das nicht „wegdesignt“ werden darf (wie im PremiumDialog): der Knopf nennt die Zahlungspflicht, und ohne
// Haken zum sofortigen Beginn geht es nicht weiter (das Backend prüft mit). Wortlaut in ladenTexte.js ↔ /widerruf.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, Heart, Palette, Users } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Section, Button, Dialog } from "../../components/ui";
import NotFound from "./NotFound";
import { salesVisible } from "../../config/legal";
import { useLanguage } from "../../i18n/language.js";
import { useKonto, oeffneAnmeldung } from "../../utils/konto.js";
import { holeKatalog, holeMeinStand, holeDankesliste, setzeDankesliste, starteKauf, euro, nachSpiel } from "../../utils/laden.js";
import { LADEN_TEXTE } from "./ladenTexte.js";

// Was nach der Rückkehr von der Bezahlseite ankommen soll (nur dieser Tab, darf fehlen)
const ERWARTUNG = "laden-erwartung";
function merkeErwartung(e) {
  try { sessionStorage.setItem(ERWARTUNG, JSON.stringify(e)); } catch { /* ohne Speicher: nur „Danke“ ohne Nachfragen */ }
}
function leseErwartung() {
  try { return JSON.parse(sessionStorage.getItem(ERWARTUNG) || "null"); } catch { return null; }
}
function vergissErwartung() {
  try { sessionStorage.removeItem(ERWARTUNG); } catch { /* egal */ }
}
const angekommen = (stand, e) => (e.typ === "artikel"
  ? stand.besitz.includes(e.artikelId)
  : (stand.unterstuetzer?.anzahl || 0) > (e.anzahl || 0));

const datum = (ms, lang) => new Date(ms).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" });

export default function Laden() {
  if (!salesVisible()) return <NotFound />;
  return <LadenSeite />;
}

function LadenSeite() {
  const { lang } = useLanguage({ supported: LADEN_TEXTE.langs });
  const t = LADEN_TEXTE.dict(lang);
  const { konto } = useKonto();
  const kontoId = konto?.id || null;
  const [katalog, setKatalog] = useState(null);
  const [mein, setMein] = useState(null);
  const [liste, setListe] = useState([]);
  const [betrag, setBetrag] = useState(500);
  const [aufListe, setAufListe] = useState(false);
  const [kauf, setKauf] = useState(null); // { typ, betragCent, aufListe } | { typ: "artikel", artikel }
  const [hinweis, setHinweis] = useState(null); // Schlüssel in t: danke | dankeFertig | dankeSpaet | abbruch
  const rueckkehr = useRef(null);

  const ladeListe = useCallback(() => holeDankesliste().then((d) => setListe(d.namen || [])).catch(() => {}), []);

  // Zurück von der Bezahlseite? (?kauf=ok|abbruch) — vor dem ersten Laden des eigenen Stands lesen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get("kauf");
    if (!k) return;
    params.delete("kauf");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    if (k === "ok") { rueckkehr.current = leseErwartung() || {}; setHinweis("danke"); } else { vergissErwartung(); setHinweis("abbruch"); }
  }, []);

  useEffect(() => {
    holeKatalog().then(setKatalog).catch(() => setKatalog({ verfuegbar: false, unterstuetzer: { betraege: [] }, artikel: [] }));
    ladeListe();
  }, [ladeListe]);

  // /laden#designs: die Designs stehen erst nach dem Katalog da — dann selbst hinscrollen
  const anzahlArtikel = katalog?.artikel?.length || 0;
  useEffect(() => {
    if (anzahlArtikel && window.location.hash === "#designs") document.getElementById("designs")?.scrollIntoView({ block: "start" });
  }, [anzahlArtikel]);

  // Eigener Stand; nach einem Kauf kurz nachfragen, bis Stripe ihn gemeldet hat
  useEffect(() => {
    if (!kontoId) { setMein(null); return undefined; }
    let alive = true;
    let timer = 0;
    let versuche = 0;
    const lauf = () => holeMeinStand().then((d) => {
      if (!alive) return;
      setMein(d);
      const e = rueckkehr.current;
      if (!e || !e.typ) return;
      if (angekommen(d, e)) {
        rueckkehr.current = null;
        vergissErwartung();
        setHinweis("dankeFertig");
        ladeListe();
      } else if (versuche < 10) {
        versuche += 1;
        timer = setTimeout(lauf, 2000);
      } else {
        rueckkehr.current = null;
        vergissErwartung();
        setHinweis("dankeSpaet");
      }
    }).catch(() => {});
    lauf();
    return () => { alive = false; clearTimeout(timer); };
  }, [kontoId, ladeListe]);

  const schalteListe = async (an) => {
    try {
      setMein(await setzeDankesliste(an));
      ladeListe();
    } catch { /* bleibt wie es war */ }
  };

  const verfuegbar = katalog?.verfuegbar !== false;
  const betraege = katalog?.unterstuetzer?.betraege || [];
  const artikel = katalog?.artikel || [];
  const gruppen = nachSpiel(artikel, katalog?.spiele);
  const unterstuetzer = mein?.unterstuetzer || null;
  const hinweisGut = hinweis === "danke" || hinweis === "dankeFertig";

  return (
    <Page width="default" className="py-6 md:py-10">
      <SEO title={t.metaTitel} description={t.metaBeschreibung} path="/laden" lang={lang} />
      <PageHeader kicker={t.kicker} title={t.titel} description={t.einleitung}
        actions={artikel.length > 0 ? (
          <a href="#designs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-soft hover:text-white transition-colors">
            {t.zuDenDesigns} <ArrowDown size={14} aria-hidden="true" />
          </a>
        ) : null} />

      {hinweis && (
        <p role="status" className={`mb-5 rounded-md border px-4 py-3 text-sm ${hinweisGut ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-line bg-white/[0.03] text-white/70"}`}>
          {t[hinweis]}
        </p>
      )}

      <div className="space-y-5">
        {/* Unterstützen: links wofür und was man bekommt, rechts Betrag wählen und weiter */}
        <section aria-labelledby="laden-unterstuetzen" className="rounded-xl border border-rose-300/20 bg-surface/80 overflow-hidden grid md:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="p-5 sm:p-6">
            <h2 id="laden-unterstuetzen" className="font-display text-xl font-bold text-white flex items-center gap-2.5">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-400/15 border border-rose-300/30 text-rose-300 shrink-0"><Heart size={18} /></span>
              {t.unterstuetzenTitel}
            </h2>
            <p className="mt-3 text-sm text-white/65 leading-relaxed max-w-md">{t.unterstuetzenText}</p>
            <ul className="mt-4 space-y-2">
              {t.vorteile.map((v) => (
                <li key={v} className="flex items-start gap-2.5 text-sm text-white/80">
                  <Check size={15} className="text-emerald-300 shrink-0 mt-0.5" aria-hidden="true" /> {v}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 sm:p-6 bg-black/25 border-t md:border-t-0 md:border-l border-line">
            {!konto ? (
              <div>
                <p className="text-sm text-white/70">{t.anmeldenText}</p>
                <Button className="mt-4" block onClick={oeffneAnmeldung}>{t.anmelden}</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {unterstuetzer && (
                  <div className="rounded-md bg-white/[0.04] p-3 space-y-2">
                    <p className="text-sm text-white/85">{t.duUnterstuetzt(datum(unterstuetzer.seit, lang))}</p>
                    <label className="flex items-center gap-2.5 text-sm text-white/70 cursor-pointer select-none">
                      <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={unterstuetzer.aufListe} onChange={(e) => schalteListe(e.target.checked)} />
                      {t.listeSchalter}
                    </label>
                    <p className="text-xs text-white/55">{t.nochmal}</p>
                  </div>
                )}
                {betraege.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-white/55 mb-2">{t.betragWaehlen}</p>
                    <div role="group" aria-label={t.betragWaehlen} className="grid grid-cols-2 gap-2">
                      {betraege.map((c) => {
                        const aktiv = c === betrag;
                        return (
                          <button key={c} type="button" aria-pressed={aktiv} onClick={() => setBetrag(c)}
                            className={`h-12 rounded-lg border font-display text-lg font-bold tabular-nums transition-colors ${aktiv
                              ? "border-accent bg-accent/20 text-white"
                              : "border-line bg-white/[0.03] text-white/70 hover:text-white hover:border-white/25"}`}>
                            {euro(c, lang)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!unterstuetzer?.aufListe && (
                  <label className="flex items-center gap-2.5 text-sm text-white/70 cursor-pointer select-none">
                    <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={aufListe} onChange={(e) => setAufListe(e.target.checked)} />
                    {t.aufListe}
                  </label>
                )}
                <Button block disabled={!verfuegbar || !betraege.includes(betrag)} onClick={() => setKauf({ typ: "unterstuetzer", betragCent: betrag, aufListe })}>
                  {t.weiter}
                </Button>
                {!verfuegbar && <p className="text-xs text-amber-300">{t.nichtEingerichtet}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Designs je Spiel: wohin „Spiel öffnen“ führt und wo man sie auswählt, kommt vom Server (katalog.js SPIEL_INFO).
            Sprungziel #designs — die Hinweise in den Spielen führen auf den Laden. */}
        <div id="designs" className="scroll-mt-6">
          <Section icon={Palette} title={t.designsTitel} description={artikel.length ? t.designsText : null}>
            {artikel.length === 0 ? (
              <p className="text-sm text-white/55">{t.designsLeer}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {gruppen.map((g) => (
                  <div key={g.spiel} className="rounded-lg border border-line bg-black/20 p-3.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="font-display text-base font-bold text-white">{g.info.name[lang] || g.info.name.de}</h3>
                      <Link to={g.info.pfad} className="group inline-flex items-center gap-1 text-xs font-semibold text-accent-soft hover:text-white transition-colors">
                        {t.spielOeffnen} <ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                    {g.info.wo && <p className="mt-0.5 text-xs text-white/55">{g.info.wo[lang] || g.info.wo.de}</p>}
                    <ul className="mt-3 grid grid-cols-2 gap-3">
                      {g.artikel.map((a) => {
                        const hat = Boolean(mein?.besitz?.includes(a.id));
                        const name = a.name[lang] || a.name.de;
                        const preis = euro(a.preisCent, lang);
                        return (
                          <li key={a.id} className={`group/karte rounded-lg border bg-surface overflow-hidden flex flex-col transition-colors ${hat ? "border-emerald-400/40" : "border-line hover:border-white/25"}`}>
                            <div className="relative aspect-[4/3] bg-black/30 overflow-hidden">
                              {a.bild && <img src={a.bild} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover/karte:scale-105" />}
                              {hat ? (
                                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-emerald-950/90 border border-emerald-400/40 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                                  <Check size={12} aria-hidden="true" /> {t.gehoertDir}
                                </span>
                              ) : (
                                <span className="absolute top-2 right-2 rounded-md bg-black/75 border border-white/15 px-2 py-0.5 text-xs font-bold text-white tabular-nums">{preis}</span>
                              )}
                            </div>
                            <div className="p-3 flex flex-col gap-1 flex-1">
                              <p className="text-sm font-semibold text-white">{name}</p>
                              {a.text && <p className="text-xs text-white/60 leading-relaxed">{a.text[lang] || a.text.de}</p>}
                              {!hat && (
                                <div className="mt-auto pt-2.5">
                                  <Button size="sm" block disabled={!verfuegbar} aria-label={t.kaufenAria(name, preis)}
                                    onClick={() => (konto ? setKauf({ typ: "artikel", artikel: a }) : oeffneAnmeldung())}>
                                    {t.kaufen}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <Section icon={Users} title={t.listeTitel} description={t.listeText}>
          {liste.length === 0 ? (
            <p className="text-sm text-white/50">{t.listeLeer}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {liste.map((n) => (
                <li key={`${n.name}-${n.seit}`} className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/[0.07] border border-rose-300/20 px-3 py-1 text-sm text-white/85"><Heart size={12} className="text-rose-300" aria-hidden="true" /> {n.name}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <KaufFenster kauf={kauf} onClose={() => setKauf(null)} t={t} lang={lang} anzahlVorher={unterstuetzer?.anzahl || 0} />
    </Page>
  );
}

function KaufFenster({ kauf, onClose, t, lang, anzahlVorher }) {
  const [zustimmung, setZustimmung] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const offen = Boolean(kauf);

  useEffect(() => {
    if (!offen) return;
    setZustimmung(false);
    setBusy(false);
    setFehler("");
  }, [offen]);

  const istArtikel = kauf?.typ === "artikel";
  const name = istArtikel ? (kauf.artikel.name[lang] || kauf.artikel.name.de) : t.unterstuetzungName;
  const preis = istArtikel ? kauf?.artikel.preisCent : kauf?.betragCent;

  const kaufen = async () => {
    setBusy(true);
    setFehler("");
    merkeErwartung(istArtikel ? { typ: "artikel", artikelId: kauf.artikel.id } : { typ: "unterstuetzer", anzahl: anzahlVorher });
    try {
      await starteKauf(istArtikel
        ? { typ: "artikel", artikelId: kauf.artikel.id, zustimmung, lang }
        : { typ: "unterstuetzer", betragCent: kauf.betragCent, aufListe: kauf.aufListe, zustimmung, lang });
    } catch {
      vergissErwartung();
      setFehler(t.fehler);
      setBusy(false);
    }
  };

  const link = "text-accent-soft hover:text-white underline-offset-2 hover:underline";
  return (
    <Dialog
      open={offen}
      onClose={onClose}
      dismissible={!busy}
      kicker={t.kicker}
      title={t.kaufTitel}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t.abbrechen}</Button>
          <Button onClick={kaufen} disabled={!zustimmung} loading={busy} loadingText={t.oeffne}>{t.zahlungspflichtig}</Button>
        </>
      )}
    >
      {kauf && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-semibold text-white">{name}</p>
            <p className="text-lg font-bold text-white tabular-nums whitespace-nowrap">
              {euro(preis, lang)} <span className="text-xs font-semibold text-white/55">{t.einmalig}</span>
            </p>
          </div>
          <p className="text-xs text-white/50">{t.hinweisEu}</p>
          <label className="flex items-start gap-3 p-3 rounded-md bg-white/[0.04] cursor-pointer select-none">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-violet-500 shrink-0" checked={zustimmung} onChange={(e) => setZustimmung(e.target.checked)} />
            <span className="text-xs text-white/75">{t.zustimmung}</span>
          </label>
          <p className="text-xs text-white/55">
            {t.rechtsTexte.vor}
            <Link to="/agb" target="_blank" className={link}>{t.rechtsTexte.agb}</Link>
            {t.rechtsTexte.mitte}
            <Link to="/widerruf" target="_blank" className={link}>{t.rechtsTexte.widerruf}</Link>
            {t.rechtsTexte.nach}
          </p>
          {fehler && <p className="text-xs text-red-300">{fehler}</p>}
        </div>
      )}
    </Dialog>
  );
}
