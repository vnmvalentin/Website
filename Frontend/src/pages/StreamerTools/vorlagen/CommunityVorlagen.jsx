// CommunityVorlagen.jsx — Abschnitt „Von Streamern“ der Overlay-Galerie (Ausbauplan „vorlagen-teilen“): Vorlagen
// anderer mit echter Vorschau, „Beliebt“/„Neu“, Übernehmen, Melden, Löschen, den eigenen Look teilen und — für den
// Betreiber — gemeldete Vorlagen prüfen. Die Vorschau zeichnet der Aufrufer (renderPreview), damit hier nichts über
// die einzelnen Overlays stehen muss. Die Galerie ist deutsch, dieser Abschnitt auch.
import React, { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, Share2, Trash2, Check, ShieldCheck, X } from "lucide-react";
import { Button, Segmented, TwitchLoginButton } from "../../../components/ui";
import { TwitchAuthContext } from "../../../components/TwitchAuthContext";
import { isOwner } from "../../../config/owner";
import {
  listVorlagen, publishVorlage, markVorlageUsed as countUse, reportVorlage, removeVorlage, moderateVorlage, reportedVorlagen,
  toolInUse, currentLook, vorlageLink, applyWinTrackerLook,
} from "./vorlagenApi";

const TOOL_NAME = { winChallenge: "Win Challenge", twitch: "Twitch-Overlays", winTracker: "Win Tracker" };
const ERRORS = {
  bad_title: "Der Name braucht 3 bis 40 Zeichen und keine Links.",
  bad_style: "Dieser Look lässt sich nicht teilen.",
  limit: "Du hast schon 10 Vorlagen für dieses Overlay geteilt — lösch eine alte, um eine neue zu teilen.",
  too_fast: "Bitte einen Moment warten, bevor du die nächste Vorlage teilst.",
  not_found: "Diese Vorlage gibt es nicht mehr.",
  own: "Die eigene Vorlage kannst du löschen statt melden.",
  login: "Bitte zuerst mit Twitch anmelden.",
  failed: "Das hat nicht geklappt — bitte gleich noch einmal versuchen.",
};
const errorText = (e) => (e instanceof TypeError ? "Keine Verbindung zum Server." : ERRORS[e?.code] || ERRORS.failed);

function Card({ v, children, preview, footer }) {
  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface/80 overflow-hidden" data-vorlage={v.id}>
      <div className="flex-1 min-h-[200px] flex items-center justify-center p-4 bg-[#08080b] border-b border-line overflow-hidden">{preview}</div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white truncate">{v.title}</span>
            <span className="block text-xs text-white/45 truncate">
              von {v.by || "jemandem"} · {v.uses === 1 ? "1× übernommen" : `${v.uses}× übernommen`}
            </span>
          </span>
          {children}
        </div>
        {footer}
      </div>
    </article>
  );
}

/**
 * @param {object} props
 * @param {"winChallenge"|"twitch"|"winTracker"} props.tool
 * @param {(style: object) => React.ReactNode} props.renderPreview
 */
export default function CommunityVorlagen({ tool, renderPreview }) {
  const { user, login } = useContext(TwitchAuthContext);
  const navigate = useNavigate();
  const admin = isOwner(user);
  const [sort, setSort] = useState("beliebt");
  const [list, setList] = useState(null);
  const [reported, setReported] = useState([]);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState(null);
  const [share, setShare] = useState(null); // null | { loading } | { look, title, busy, error } | { blocked }
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    listVorlagen(tool, sort).then((l) => { setList(l); setFailed(false); }).catch(() => setFailed(true));
    if (admin) reportedVorlagen().then((l) => setReported(l.filter((v) => v.tool === tool))).catch(() => {});
  }, [tool, sort, admin]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShare(null); setNote(null); }, [tool]);

  const flash = (text, ok = true) => {
    setNote({ text, ok });
    setTimeout(() => setNote(null), 4000);
  };

  const openShare = async () => {
    setShare({ loading: true });
    try {
      if (!(await toolInUse(tool))) { setShare({ blocked: true }); return; }
      setShare({ look: await currentLook(tool, user.id), title: "", busy: false, error: null });
    } catch (e) {
      setShare({ look: null, title: "", busy: false, error: errorText(e) });
    }
  };

  const publish = async (e) => {
    e.preventDefault();
    setShare((s) => ({ ...s, busy: true, error: null }));
    try {
      await publishVorlage(tool, share.title, share.look);
      setShare(null);
      flash("Geteilt — deine Vorlage steht jetzt in der Galerie.");
      setSort("neu");
      load();
    } catch (err) {
      setShare((s) => ({ ...s, busy: false, error: errorText(err) }));
    }
  };

  const use = async (v) => {
    if (tool !== "winTracker") {
      navigate(vorlageLink(tool, v.id));
      return;
    }
    // Win Tracker: hier übernehmen (seine Einstellungs-Schnittstelle), dann in den Editor
    if (!user) { login(false); return; }
    setBusyId(v.id);
    try {
      await applyWinTrackerLook(v.style);
      await countUse(v.id).catch(() => {});
      navigate("/clash-royale/win-tracker");
    } catch (e) {
      flash(errorText(e), false);
    } finally {
      setBusyId(null);
    }
  };

  const act = async (v, fn, done) => {
    setBusyId(v.id);
    try {
      await fn();
      flash(done);
      load();
    } catch (e) {
      flash(errorText(e), false);
    } finally {
      setBusyId(null);
    }
  };

  const report = (v) => {
    if (!window.confirm(`„${v.title}“ melden? Gemeldete Vorlagen werden geprüft und bei Bedarf entfernt.`)) return;
    act(v, () => reportVorlage(v.id), "Danke — die Vorlage wird geprüft.");
  };
  const remove = (v) => {
    if (!window.confirm(`„${v.title}“ löschen?`)) return;
    act(v, () => removeVorlage(v.id), "Gelöscht.");
  };

  return (
    <section aria-labelledby={`cv-${tool}`} className="mt-12" data-community={tool}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <h2 id={`cv-${tool}`} className="font-display text-lg md:text-xl font-bold text-white tracking-tight">Von Streamern</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" label="Sortierung" value={sort} onChange={setSort}
            options={[{ value: "beliebt", label: "Beliebt" }, { value: "neu", label: "Neu" }]} />
          {user
            ? !share && <Button size="sm" icon={Share2} onClick={openShare} data-share-open>Deinen Look teilen</Button>
            : <TwitchLoginButton size="sm">Anmelden und teilen</TwitchLoginButton>}
        </div>
      </div>
      <p className="text-sm text-white/45 mb-5">
        Looks, die andere Streamer für {TOOL_NAME[tool]} geteilt haben. Geteilt wird nur das Aussehen — Inhalte, Texte und Größe bleiben bei jedem selbst.
      </p>
      {note && <p className={`mb-4 text-sm ${note.ok ? "text-green-300" : "text-red-300"}`} role="status">{note.text}</p>}

      {/* Eigenen Look teilen */}
      {share && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-surface p-4 md:p-5" data-share>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-semibold text-white">Deinen {TOOL_NAME[tool]}-Look teilen</h3>
            <button type="button" onClick={() => setShare(null)} aria-label="Schließen"
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-white/45 hover:text-white hover:bg-white/5"><X size={16} /></button>
          </div>
          {share.loading && <p className="text-sm text-white/50">Lade deinen Look …</p>}
          {share.blocked && <p className="text-sm text-white/60">Richte {TOOL_NAME[tool]} zuerst ein — dann gibt es einen Look zum Teilen.</p>}
          {share.look && (
            <form onSubmit={publish} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
              <div className="min-h-[180px] flex items-center justify-center rounded-md bg-[#08080b] border border-line p-3 overflow-hidden">
                {renderPreview(share.look)}
              </div>
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-white/50">
                  Name der Vorlage
                  <input value={share.title} maxLength={40} required minLength={3} autoFocus data-share-title
                    onChange={(e) => setShare((s) => ({ ...s, title: e.target.value }))}
                    className="mt-1 w-full bg-[#0b0b11] border border-line rounded-md px-3 h-10 text-sm text-white outline-none focus:border-accent" />
                </label>
                <p className="text-xs text-white/40">Geteilt werden Farben, Ecken, Deckkraft und Schrift — keine Inhalte. Dein Twitch-Name steht als Ersteller dabei.</p>
                <Button type="submit" loading={share.busy} loadingText="Teile …" icon={Share2}>Veröffentlichen</Button>
                {share.error && <p className="text-sm text-red-300" role="alert">{share.error}</p>}
              </div>
            </form>
          )}
          {!share.look && share.error && <p className="text-sm text-red-300" role="alert">{share.error}</p>}
        </div>
      )}

      {/* Betreiber: gemeldet */}
      {admin && reported.length > 0 && (
        <div className="mb-8" data-reported>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200 mb-3"><Flag size={14} /> Gemeldet — bitte prüfen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {reported.map((v) => (
              <Card key={v.id} v={v} preview={renderPreview(v.style)}
                footer={(
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-200">{v.reports}× gemeldet{v.status === "hidden" ? " · ausgeblendet" : ""}</span>
                    <Button size="sm" variant="secondary" icon={ShieldCheck} disabled={busyId === v.id}
                      onClick={() => act(v, () => moderateVorlage(v.id, "keep"), "Behalten — wieder sichtbar.")}>Behalten</Button>
                    <Button size="sm" variant="danger" icon={Trash2} disabled={busyId === v.id}
                      onClick={() => act(v, () => moderateVorlage(v.id, "remove"), "Entfernt.")}>Entfernen</Button>
                  </div>
                )} />
            ))}
          </div>
        </div>
      )}

      {failed && !list && <p className="text-sm text-white/50">Die Vorlagen ließen sich gerade nicht laden.</p>}
      {list && list.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-sm text-white/50 text-center">
          Noch keine geteilten Looks für {TOOL_NAME[tool]} — teil als Erstes deinen.
        </p>
      )}
      {list && list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((v) => (
            <Card key={v.id} v={v} preview={renderPreview(v.style)}
              footer={(
                <div className="flex flex-wrap items-center gap-2">
                  {v.status === "hidden"
                    ? <span className="text-xs text-amber-200">Gemeldet — wird geprüft und ist so lange nur für dich sichtbar.</span>
                    : <Button size="sm" icon={Check} loading={busyId === v.id} loadingText="Übernehme …" onClick={() => use(v)} data-use={v.id}>Verwenden</Button>}
                  {(v.own || admin) && (
                    <Button size="sm" variant="ghost" icon={Trash2} disabled={busyId === v.id} onClick={() => remove(v)} data-remove={v.id}>Löschen</Button>
                  )}
                  {user && !v.own && v.status !== "hidden" && (
                    <Button size="sm" variant="ghost" icon={Flag} disabled={busyId === v.id} onClick={() => report(v)} className="ml-auto" data-report={v.id}>Melden</Button>
                  )}
                </div>
              )} />
          ))}
        </div>
      )}
    </section>
  );
}
