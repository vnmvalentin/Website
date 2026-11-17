// pages/Website/VisitenkarteEditor.jsx — Einstellungen der Visitenkarte /u/<adresse> im Profil: an/aus, Adresse,
// Lieblingsspiel, Abzeichen-Vitrine, Clash-Royale-Konto, Reihenfolge und Ausblenden der Abschnitte. Für jedes Konto
// (Twitch, Discord, Gast). Server: GET/PUT /api/public-profile/me (Backend/profile/profileRoutes.js); jede Änderung
// wird sofort gespeichert.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Globe, Loader2 } from "lucide-react";
import { Section, Button, Input, Select, Field } from "../../components/ui";
import { VISITENKARTE_TEXTE } from "../PublicProfile/visitenkarteTexte.js";
import { VITRINE_MAX, nameIn, schalteVitrine, verschiebe } from "../PublicProfile/visitenkarte.js";

const ANDERER = "__anderer__";

async function anfrage(method, body) {
  const r = await fetch("/api/public-profile/me", {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) {
    const e = new Error(d?.error || "Fehler");
    e.fehler = d?.fehler || "allgemein";
    throw e;
  }
  return d;
}

export default function VisitenkarteEditor({ lang, kontoId }) {
  const t = VISITENKARTE_TEXTE.dict(lang);
  const [data, setData] = useState(null);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [busy, setBusy] = useState("");
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [crEingabe, setCrEingabe] = useState(null); // null = Auswahlliste, sonst Text des Eingabefelds
  const [kopiert, setKopiert] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    let lebt = true;
    setLadeFehler(false);
    anfrage("GET")
      .then((d) => {
        if (!lebt) return;
        setData(d);
        setAdresse(d.adresse || d.vorschlag || "");
      })
      .catch(() => { if (lebt) setLadeFehler(true); });
    return () => { lebt = false; };
  }, [kontoId]);

  const kurzMelden = (text) => {
    setHinweis(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHinweis(""), 2000);
  };

  // Ohne gespeicherte Karte braucht jede Änderung eine Adresse — dann die aus dem Feld bzw. den Vorschlag mitschicken
  async function speichern(was, patch) {
    setBusy(was);
    setFehler("");
    try {
      const body = data?.adresse ? patch : { adresse: adresse.trim().toLowerCase() || data?.vorschlag || "", ...patch };
      const d = await anfrage("PUT", body);
      setData(d);
      if (was === "adresse" || !data?.adresse) setAdresse(d.adresse);
      kurzMelden(t.gespeichert);
      return true;
    } catch (e) {
      setFehler(t.fehler[e.fehler] || t.fehler.allgemein);
      return false;
    } finally {
      setBusy("");
    }
  }

  if (ladeFehler) {
    return (
      <Section className="lg:col-span-2" icon={Globe} title={t.editorTitel} description={t.editorHinweis}>
        <p className="text-sm text-red-300">{t.ladeFehler}</p>
      </Section>
    );
  }
  if (!data) {
    return (
      <Section className="lg:col-span-2" icon={Globe} title={t.editorTitel} description={t.editorHinweis}>
        <p className="flex items-center gap-2 text-sm text-white/55"><Loader2 size={14} className="animate-spin" /> …</p>
      </Section>
    );
  }

  const e = data.einstellungen;
  const host = typeof window !== "undefined" ? window.location.host : "vnmvalentin.de";
  const link = data.adresse ? `${typeof window !== "undefined" ? window.location.origin : "https://vnmvalentin.de"}/u/${data.adresse}` : "";
  const adresseGeaendert = adresse.trim().toLowerCase() !== (data.adresse || "");
  const keys = data.abschnitte.map((a) => a.key);
  const versteckt = new Set(e.versteckt);
  const crImListe = data.cr && data.crKonten.some((c) => c.tag === data.cr.tag);
  const crAuswahl = crEingabe !== null ? ANDERER : (data.cr?.tag || "");

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* Link steht daneben */ }
  };

  const reihenfolgeSpeichern = (neu, neuVersteckt = e.versteckt) => speichern("reihenfolge", { einstellungen: { reihenfolge: neu, versteckt: neuVersteckt } });

  return (
    <Section className="lg:col-span-2" icon={Globe} title={t.editorTitel} description={t.editorHinweis}
      actions={hinweis ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300"><Check size={13} /> {hinweis}</span> : null}>
      <div className="space-y-6">
        {/* An/aus und Link */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-sm font-semibold ${data.an ? "text-emerald-300" : "text-white/55"}`}>{data.an ? t.an : t.aus}</span>
          <Button variant={data.an ? "secondary" : "primary"} onClick={() => speichern("an", { an: !data.an })} loading={busy === "an"} disabled={busy !== ""}>
            {data.an ? t.ausschalten : t.einschalten}
          </Button>
          {data.an && data.adresse && (
            <>
              <Link to={`/u/${data.adresse}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-soft hover:text-white">
                {t.ansehen} <ArrowRight size={14} />
              </Link>
              <Button variant="ghost" size="sm" icon={kopiert ? Check : Copy} onClick={kopieren}>{kopiert ? t.kopiert : t.kopieren}</Button>
            </>
          )}
        </div>

        {/* Adresse */}
        <form onSubmit={(ev) => { ev.preventDefault(); speichern("adresse", { adresse: adresse.trim().toLowerCase() }); }}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t.adresse} className="flex-1 min-w-[14rem]">
              <Input value={adresse} maxLength={25} autoComplete="off" spellCheck={false}
                onChange={(ev) => setAdresse(ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
            </Field>
            <Button type="submit" variant="secondary" loading={busy === "adresse"}
              disabled={busy !== "" || !adresseGeaendert || adresse.trim().length < 2}>
              {t.adresseSpeichern}
            </Button>
          </div>
          <p className="text-xs text-white/55 mt-1.5">
            <span className="text-white/60">{host}/u/{adresse || "…"}</span> · {t.adresseHinweis}
          </p>
        </form>

        {fehler && <p className="text-xs text-red-300" role="alert">{fehler}</p>}

        {/* Lieblingsspiel und CR-Konto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label={t.lieblingsspielFeld}>
            <Select value={e.lieblingsspiel} disabled={busy !== ""}
              onChange={(ev) => speichern("lieblingsspiel", { einstellungen: { lieblingsspiel: ev.target.value } })}>
              <option value="">{t.keinLieblingsspiel}</option>
              {data.spiele.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          <div className="space-y-2">
            <Field label={t.crTitel} hint={crEingabe === null ? t.crHinweis : undefined}>
              <Select value={crAuswahl} disabled={busy !== ""}
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (v === ANDERER) { setCrEingabe(""); return; }
                  setCrEingabe(null);
                  speichern("cr", { crTag: v });
                }}>
                <option value="">{t.crKeins}</option>
                {data.cr && !crImListe && <option value={data.cr.tag}>{data.cr.name ? `${data.cr.name} (#${data.cr.tag})` : `#${data.cr.tag}`}</option>}
                {data.crKonten.map((c) => <option key={c.tag} value={c.tag}>{c.name ? `${c.name} (#${c.tag})` : `#${c.tag}`}</option>)}
                <option value={ANDERER}>{t.crAnderes}</option>
              </Select>
            </Field>
            {crEingabe !== null && (
              <form className="flex gap-2" onSubmit={async (ev) => {
                ev.preventDefault();
                if (await speichern("cr", { crTag: crEingabe })) setCrEingabe(null);
              }}>
                <Input value={crEingabe} placeholder="#2PP…" aria-label={t.crTagFeld} maxLength={14} autoComplete="off" spellCheck={false}
                  onChange={(ev) => setCrEingabe(ev.target.value.toUpperCase())} />
                <Button type="submit" variant="secondary" loading={busy === "cr"} disabled={busy !== "" || crEingabe.replace("#", "").trim().length < 3}>
                  {t.crUebernehmen}
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Abzeichen-Vitrine */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-1">{t.vitrineTitel(e.vitrine.length, VITRINE_MAX)}</h3>
          {data.erfolge.length === 0 ? (
            <p className="text-sm text-white/55">{t.vitrineLeer}</p>
          ) : (
            <>
              <p className="text-xs text-white/55 mb-2">{t.vitrineHinweis}</p>
              <ul className="flex flex-wrap gap-2">
                {data.erfolge.map((x) => {
                  const drin = e.vitrine.includes(x.key);
                  return (
                    <li key={x.key}>
                      <button type="button" aria-pressed={drin} disabled={busy !== ""}
                        onClick={() => {
                          const r = schalteVitrine(e.vitrine, x.key);
                          if (r.voll) { setFehler(t.vitrineVoll(VITRINE_MAX)); return; }
                          speichern("vitrine", { einstellungen: { vitrine: r.vitrine } });
                        }}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${drin
                          ? "border-amber-400/40 bg-amber-400/15 text-amber-50"
                          : "border-line bg-white/[0.03] text-white/60 hover:text-white hover:border-white/20"}`}>
                        <Award size={12} className={drin ? "text-amber-300" : "text-white/50"} /> {nameIn(x.name, lang, x.key)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Reihenfolge und Ausblenden */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-1">{t.reihenfolgeTitel}</h3>
          {keys.length === 0 ? (
            <p className="text-sm text-white/55">{t.reihenfolgeLeer}</p>
          ) : (
            <>
              <p className="text-xs text-white/55 mb-2">{t.reihenfolgeHinweis}</p>
              <ol className="divide-y divide-white/5 rounded-lg border border-line bg-black/20">
                {keys.map((k, i) => {
                  const name = t.abschnitt[k] || k;
                  const aus = versteckt.has(k);
                  return (
                    <li key={k} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-5 text-xs text-white/50 tabular-nums">{i + 1}</span>
                      <span className={`flex-1 min-w-0 truncate text-sm ${aus ? "text-white/50 line-through" : "text-white/85"}`}>{name}</span>
                      {aus && <span className="text-[11px] text-white/50">{t.versteckt}</span>}
                      <Button variant="ghost" size="sm" icon={aus ? EyeOff : Eye} aria-label={aus ? t.zeigen(name) : t.verstecken(name)}
                        title={aus ? t.zeigen(name) : t.verstecken(name)} disabled={busy !== ""}
                        onClick={() => reihenfolgeSpeichern(keys, aus ? e.versteckt.filter((x) => x !== k) : [...e.versteckt, k])} />
                      <Button variant="ghost" size="sm" icon={ChevronUp} aria-label={t.hoch(name)} title={t.hoch(name)}
                        disabled={busy !== "" || i === 0} onClick={() => reihenfolgeSpeichern(verschiebe(keys, i, -1))} />
                      <Button variant="ghost" size="sm" icon={ChevronDown} aria-label={t.runter(name)} title={t.runter(name)}
                        disabled={busy !== "" || i === keys.length - 1} onClick={() => reihenfolgeSpeichern(verschiebe(keys, i, 1))} />
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
