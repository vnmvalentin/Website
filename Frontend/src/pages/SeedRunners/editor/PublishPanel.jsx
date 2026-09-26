// PublishPanel.jsx — Veröffentlichen aus dem Editor. Voraussetzungen (der Server prüft sie alle noch einmal selbst):
// gültiges Level, Name, Anmeldung mit Twitch, und ein Verifizierungslauf für GENAU diesen Spielinhalt.
//
// Eine Veröffentlichung ist eine Momentaufnahme: Was danach im Entwurf geändert wird, berührt das veröffentlichte Level nicht.
// Ein geänderter Spielinhalt hat einen anderen Hash, braucht eine neue Verifizierung und wird ein NEUES Level mit eigenem Code.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Loader2, Upload, ExternalLink, AlertTriangle } from "lucide-react";
import ShareCode from "../levels/ShareCode.jsx";
import { publishLevel } from "../levels/levelsApi.js";
import { levelPath } from "../levels/shareCode.js";
import { reasonOf } from "../levels/labels.js";
import { validateDoc } from "../level/index.js";
import { formatTicks } from "../room/format.js";
import { buttonClass, primaryButtonClass } from "./fields.jsx";

function Requirement({ ok, children, hint }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 shrink-0 ${ok ? "text-green-300" : "text-white/30"}`}>{ok ? <Check size={15} /> : <X size={15} />}</span>
      <span className="min-w-0">
        <span className={`text-sm ${ok ? "text-white/80" : "text-white/55"}`}>{children}</span>
        {!ok && hint && <span className="block text-xs text-white/40 leading-snug mt-0.5">{hint}</span>}
      </span>
    </li>
  );
}

/**
 * @param doc         das Dokument des Entwurfs
 * @param verState    Ergebnis von verificationState()
 * @param user        angemeldeter Twitch-Nutzer oder null
 * @param published   Merker { code, hash } der letzten Veröffentlichung dieses Entwurfs oder null
 * @param currentHash Inhalts-Hash des Entwurfs (null: ungültig)
 * @param onLogin     startet die Twitch-Anmeldung
 * @param onPublished Callback { code, hash } nach erfolgreicher Veröffentlichung
 * @param onClose     Panel schließen
 */
export default function PublishPanel({ doc, verState, user, published, currentHash, onLogin, onPublished, onClose }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const nameOk = doc.meta.name.trim().length >= 3;
  const verified = verState.kind === "verified";
  const ready = !!currentHash && nameOk && verified && !!user;
  const alreadyThis = published && published.hash === currentHash;

  const publish = async () => {
    setResult(null);
    // Frisch und vollständig prüfen (mit Rauchtest, Name Pflicht): Gesendet wird das kanonische Dokument, nicht der Editor-Stand
    const res = validateDoc(doc, { smoke: true, requireName: true });
    if (!res.ok) {
      setResult({ status: "ungueltig", reason: "Das Level ist noch nicht gültig.", errors: res.errors });
      return;
    }
    setBusy(true);
    const answer = await publishLevel({ doc: res.doc, hash: res.hash });
    setBusy(false);
    setResult(answer);
    if (answer.status === "ok") onPublished({ code: answer.code, hash: res.hash });
    else if (answer.status === "doppelt" && answer.existing) onPublished({ code: answer.existing, hash: res.hash });
  };

  const done = result?.status === "ok" ? result.code : null;

  return (
    <div className="px-4 py-4 border-b border-white/10 bg-violet-500/5" data-testid="publish-panel">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-white">Veröffentlichen</h2>
        <button type="button" onClick={onClose} className="text-xs text-white/45 hover:text-white underline underline-offset-2">Schließen</button>
      </div>

      {done ? (
        <div className="py-2" data-testid="published-scene">
          <p className="text-xs font-bold uppercase tracking-widest text-green-300/80 mb-2">Veröffentlicht</p>
          <p className="text-sm text-white/70 mb-3">Dein Level ist online. Teile den Code oder den Link:</p>
          <ShareCode code={done} size="lg" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={levelPath(done)} className={primaryButtonClass}><ExternalLink size={14} />Level ansehen</Link>
            <button type="button" onClick={onClose} className={buttonClass}>Weiterbauen</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2 mb-4">
            <Requirement ok={!!currentHash} hint="Beheben, was rechts unter „Prüfung“ steht.">Das Level ist gültig</Requirement>
            <Requirement ok={nameOk} hint="Gib deinem Level rechts unter „Level“ einen Namen (mindestens 3 Zeichen).">Das Level hat einen Namen</Requirement>
            <Requirement ok={!!user} hint="Dein Twitch-Name steht als Ersteller am Level.">
              {user ? `Angemeldet als ${user.displayName || user.login}` : "Angemeldet mit Twitch"}
            </Requirement>
            <Requirement ok={verified} hint="Spiele das Level einmal komplett durch („Verifizieren“). Änderst du Gelände, Elemente oder Tempo-Klasse, gilt das für den neuen Stand erneut.">
              {verified ? `Verifiziert · Ersteller-Zeit ${formatTicks(verState.ticks)}` : "Das Level ist verifiziert"}
            </Requirement>
          </ul>

          {published && (
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              {alreadyThis ? (
                <>Diese Fassung ist bereits veröffentlicht: <Link to={levelPath(published.code)} className="text-violet-200 hover:text-white underline underline-offset-2">{published.code}</Link>.</>
              ) : (
                <>Deine letzte Veröffentlichung <Link to={levelPath(published.code)} className="text-violet-200 hover:text-white underline underline-offset-2">{published.code}</Link> bleibt, wie sie ist. Was du jetzt veröffentlichst, wird ein neues Level mit eigenem Code.</>
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!user && <button type="button" onClick={onLogin} className={primaryButtonClass}>Mit Twitch anmelden</button>}
            <button type="button" onClick={publish} disabled={!ready || busy || alreadyThis} className={user ? primaryButtonClass : buttonClass}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Veröffentlichen
            </button>
          </div>
          <p className="text-xs text-white/35 mt-3 leading-relaxed">
            Veröffentlichte Level sind für alle spielbar und mit Namen, Beschreibung und Tags sichtbar. Du kannst pro Stunde 3 Level veröffentlichen und
            höchstens 20 aktiv haben. Anstößige Inhalte werden entfernt.
          </p>

          {result && result.status !== "ok" && (
            <div className="mt-3 border border-amber-400/30 bg-amber-500/8 rounded-md px-3 py-2.5 text-sm text-white/85 flex items-start gap-2.5" role="alert">
              <AlertTriangle size={15} className="text-amber-300 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p>{reasonOf(result)}</p>
                {result.status === "doppelt" && result.existing && (
                  <Link to={levelPath(result.existing)} className="text-violet-200 hover:text-white underline underline-offset-2 text-sm">Zu deinem Level {result.existing}</Link>
                )}
                {result.errors?.length > 1 && (
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-white/65">
                    {result.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
