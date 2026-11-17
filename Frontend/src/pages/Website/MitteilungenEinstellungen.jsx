// pages/Website/MitteilungenEinstellungen.jsx — „App & Mitteilungen“ im Profil: Website als App installieren und je
// Gerät Mitteilungen abonnieren (Themen vom Server, Backend/push/themen.js). Logik in utils/mitteilungen.js.
import { useState } from "react";
import { Bell, Check, Download, Smartphone, AlertTriangle } from "lucide-react";
import { Section, Button } from "../../components/ui";
import { MITTEILUNGEN_TEXTE } from "../../components/mitteilungenTexte.js";
import { installieren, useInstallation, useMitteilungen } from "../../utils/mitteilungen.js";

function Schalter({ an, onClick, disabled, label, t }) {
  return (
    <button type="button" role="switch" aria-checked={an} aria-label={label} onClick={onClick} disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${an ? "bg-accent border-accent" : "bg-white/[0.06] border-line"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${an ? "translate-x-6" : "translate-x-1"}`} />
      <span className="sr-only">{an ? t.an : t.aus}</span>
    </button>
  );
}

export default function MitteilungenEinstellungen({ lang }) {
  const t = MITTEILUNGEN_TEXTE.dict(lang);
  const inst = useInstallation();
  const m = useMitteilungen({ auffrischen: true });
  const [testStand, setTestStand] = useState("");

  const fehlerText = m.fehler === "gesperrt" ? t.gesperrt : m.fehler === "abgelehnt" ? t.abgelehnt : m.fehler ? t.fehler : "";
  const umschalten = (id) => {
    setTestStand("");
    const neu = m.themen.includes(id) ? m.themen.filter((x) => x !== id) : [...m.themen, id];
    m.setzeThemen(neu);
  };
  const probe = async () => {
    setTestStand("");
    if (await m.test()) setTestStand(t.testGesendet);
  };

  return (
    <Section className="lg:col-span-2" icon={Smartphone} title={t.titel} description={t.hinweis}>
      <div className="space-y-6">
        {/* App installieren */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-2">{t.appTitel}</h3>
          {inst.installiert ? (
            <p className="flex items-center gap-2 text-sm text-emerald-300"><Check size={15} /> {t.installiert}</p>
          ) : inst.kann ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={Download} onClick={() => installieren()}>{t.installieren}</Button>
              <span className="text-xs text-white/55">{t.installierenText}</span>
            </div>
          ) : (
            <p className="text-sm text-white/55">{inst.ios ? t.iosInstallieren : t.browserInstallieren}</p>
          )}
        </div>

        {/* Mitteilungen je Thema */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/55 mb-2">{t.mitteilungenTitel}</h3>
          {!m.unterstuetzt && !m.brauchtApp ? (
            <p className="text-sm text-white/55">{t.nichtUnterstuetzt}</p>
          ) : m.brauchtApp ? (
            <p className="text-sm text-white/55">{t.brauchtApp}</p>
          ) : (
            <>
              {m.erlaubnis === "denied" && (
                <p className="flex items-start gap-2 text-xs text-amber-200 mb-3"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {t.gesperrt}</p>
              )}
              <ul className="divide-y divide-white/5 rounded-lg border border-line bg-black/20">
                {m.verfuegbar.map((th) => {
                  const an = m.themen.includes(th.id);
                  const name = th.name?.[lang] || th.name?.de || th.id;
                  return (
                    <li key={th.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{name}</span>
                        <span className="block text-xs text-white/55 mt-0.5">{th.text?.[lang] || th.text?.de}</span>
                      </span>
                      <Schalter an={an} label={name} t={t} disabled={!m.geladen || m.busy || m.erlaubnis === "denied"} onClick={() => umschalten(th.id)} />
                    </li>
                  );
                })}
              </ul>
              {fehlerText && m.erlaubnis !== "denied" && <p className="text-xs text-red-300 mt-2" role="alert">{fehlerText}</p>}
              {m.themen.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <Button variant="secondary" size="sm" icon={Bell} onClick={probe}>{t.test}</Button>
                  {testStand && <span className="text-xs text-emerald-300">{testStand}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
