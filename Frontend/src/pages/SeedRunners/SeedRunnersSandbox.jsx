// SeedRunnersSandbox.jsx — Sandbox-Bereich, Reiter "Editor": neue Level anlegen und die eigenen Entwürfe verwalten.
// Entwürfe liegen im Browser (editor/drafts.js); veröffentlicht wird später aus dem Editor heraus.
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Pencil, Copy, Trash2, Hammer, BadgeCheck, Globe, Play } from "lucide-react";
import { RatingBadge } from "./ui/kit.jsx";
import SEO from "../../components/SEO";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import SandboxTabs from "./SandboxTabs.jsx";
import { listLevels } from "./levels/levelsApi.js";
import { levelPath } from "./levels/shareCode.js";
import { STATUS_LABELS } from "./levels/labels.js";
import { createDraftStore, browserStorage, MAX_DRAFTS } from "./editor/drafts.js";
import { emptyDoc } from "./level/index.js";
import { LIMITS } from "./level/limits.js";
import { BIOMES, BIOME_IDS } from "./gen/biomes.js";
import { SPEED_CLASSES, SPEED_CLASS_IDS } from "./sim/classes.js";
import { NumberField, SelectField, TextField, buttonClass, primaryButtonClass } from "./editor/fields.jsx";
import { formatTicks } from "./room/format.js";

const PRESETS = [
  { label: "Kurz", width: 120, height: 40 },
  { label: "Mittel", width: 250, height: 50 },
  { label: "Lang", width: 500, height: 60 },
];

const formatWhen = (t) => new Date(t).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

export default function SeedRunnersSandbox() {
  const navigate = useNavigate();
  const store = useMemo(() => createDraftStore(browserStorage()), []);
  const [drafts, setDrafts] = useState(() => store.list());
  const [form, setForm] = useState({ name: "", width: 120, height: 40, speedClass: "normal", biome: "meadow" });
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");
  const auth = useContext(TwitchAuthContext);
  const userId = auth?.user?.id ? String(auth.user.id) : null;
  const [mine, setMine] = useState(null);   // null: nicht angemeldet oder lädt; sonst die Liste der eigenen veröffentlichten Level

  // Eigene veröffentlichte Level (auch ausgeblendete und solche, die neu verifiziert werden müssen — die sieht sonst niemand)
  useEffect(() => {
    if (!userId) { setMine(null); return undefined; }
    let alive = true;
    listLevels({ mine: true, sort: "new", limit: 48 }).then((res) => { if (alive) setMine(res.items); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [userId]);

  const refresh = () => setDrafts(store.list());
  // Verifiziert heißt: Der Merker gehört zum Spielinhalt, den der Entwurf JETZT hat (gleicher Hash)
  const verifiedOf = (d) => {
    const v = store.getVerification(d.id);
    return v && d.hash && v.hash === d.hash ? v : null;
  };

  const create = () => {
    const doc = emptyDoc({
      name: form.name.trim().slice(0, LIMITS.nameMax),
      width: form.width,
      height: form.height,
      speedClass: form.speedClass,
      biome: form.biome,
    });
    const res = store.save(null, doc);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(`/seed-runners/editor/${res.id}`);
  };

  const duplicate = (id) => {
    const copy = store.duplicate(id);
    if (!copy) setError("Der Entwurf konnte nicht kopiert werden (Speicher voll oder Entwurf beschädigt).");
    else setError("");
    refresh();
  };

  const remove = (id) => {
    store.remove(id);
    setConfirmId(null);
    refresh();
  };

  return (
    <div className="page-fade w-full max-w-4xl mx-auto px-2 md:px-4 py-10 md:py-14">
      <SEO title="Sandbox — Seed Runners" description="Baue eigene Seed-Runners-Level und übe im Übungsbereich." path="/seed-runners/sandbox" noindex />

      <div className="flex items-start gap-4 mb-6">
        <span className="hidden sm:flex items-center justify-center w-12 h-12 rounded-md bg-violet-500/10 border border-violet-400/20 text-violet-300 shrink-0">
          <Hammer size={22} />
        </span>
        <div>
          <Link to="/seed-runners" className="text-xs text-white/40 hover:text-white transition-colors">Seed Runners</Link>
          <h1 className="font-display text-2xl md:text-4xl font-bold text-white tracking-tight">Sandbox</h1>
        </div>
      </div>

      <SandboxTabs />

      <div className="bg-[#0d0d14] border border-white/10 rounded-md divide-y divide-white/10">
        <section className="p-5">
          <h2 className="text-sm font-bold text-white mb-4">Neues Level</h2>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <TextField label="Name (optional)" value={form.name} maxLength={LIMITS.nameMax} placeholder="Später änderbar" onCommit={(v) => setForm((f) => ({ ...f, name: v }))} />
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-white/35 mb-1">Größe</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, width: p.width, height: p.height }))}
                    className={`${buttonClass} ${form.width === p.width && form.height === p.height ? "border-violet-400/60 bg-violet-500/15" : ""}`}
                  >
                    {p.label} <span className="text-white/40 text-xs">{p.width}×{p.height}</span>
                  </button>
                ))}
              </div>
            </div>
            <NumberField label="Breite" unit="Kacheln" value={form.width} min={LIMITS.minWidth} max={LIMITS.maxWidth} integer onCommit={(v) => setForm((f) => ({ ...f, width: v }))} />
            <NumberField label="Höhe" unit="Kacheln" value={form.height} min={LIMITS.minHeight} max={LIMITS.maxHeight} integer onCommit={(v) => setForm((f) => ({ ...f, height: v }))} />
            <SelectField
              label="Tempo-Klasse"
              value={form.speedClass}
              options={SPEED_CLASS_IDS.map((id) => ({ value: id, label: SPEED_CLASSES[id].label }))}
              onChange={(v) => setForm((f) => ({ ...f, speedClass: v }))}
            />
            <SelectField
              label="Biom"
              value={form.biome}
              options={BIOME_IDS.map((id) => ({ value: id, label: BIOMES[id].label }))}
              onChange={(v) => setForm((f) => ({ ...f, biome: v }))}
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={create} className={primaryButtonClass}><Plus size={15} />Level erstellen</button>
            <p className="text-xs text-white/40">Das Level beginnt mit ebenem Boden, Start links und Ziel rechts.</p>
          </div>
          {error && <p className="mt-3 text-sm text-amber-300">{error}</p>}
        </section>

        <section>
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-bold text-white">Deine Entwürfe</h2>
            <span className="text-xs text-white/40 tabular-nums">{drafts.length} / {MAX_DRAFTS}</span>
          </div>
          {drafts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-white/45">Noch kein Entwurf. Lege oben dein erstes Level an.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {drafts.map((d) => (
                <li key={d.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link to={`/seed-runners/editor/${d.id}`} className="min-w-0 flex-1 group">
                    <span className="block text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">{d.name || "Unbenanntes Level"}</span>
                    <span className="block text-xs text-white/40 tabular-nums">
                      {d.width} × {d.height} · {d.elements} Elemente · {SPEED_CLASSES[d.speedClass]?.label || d.speedClass} · {formatWhen(d.updatedAt)}
                    </span>
                    {verifiedOf(d) && (
                      <span className="mt-1 mr-3 inline-flex items-center gap-1.5 text-xs text-green-300">
                        <BadgeCheck size={13} />Verifiziert · {formatTicks(verifiedOf(d).ticks)}
                      </span>
                    )}
                    {store.getPublished(d.id) && (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-violet-200">
                        <Globe size={13} />Veröffentlicht · {store.getPublished(d.id).code}
                      </span>
                    )}
                  </Link>
                  {confirmId === d.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white/60">Wirklich löschen?</span>
                      <button type="button" onClick={() => remove(d.id)} className={`${buttonClass} text-red-300 hover:text-red-200`}><Trash2 size={14} />Löschen</button>
                      <button type="button" onClick={() => setConfirmId(null)} className={buttonClass}>Behalten</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link to={`/seed-runners/editor/${d.id}`} className={buttonClass}><Pencil size={14} />Öffnen</Link>
                      <button type="button" onClick={() => duplicate(d.id)} className={buttonClass} title="Kopie anlegen"><Copy size={14} /></button>
                      <button type="button" onClick={() => setConfirmId(d.id)} className={buttonClass} title="Löschen"><Trash2 size={14} /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="my-levels">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-bold text-white">Deine veröffentlichten Level</h2>
            {mine && <span className="text-xs text-white/40 tabular-nums">{mine.length}</span>}
          </div>
          {!userId ? (
            <p className="px-5 py-6 text-sm text-white/45 leading-relaxed">
              Melde dich mit Twitch an (oben in der Leiste), um deine veröffentlichten Level zu sehen. Veröffentlichen geht aus dem Editor heraus, sobald ein Level verifiziert ist.
            </p>
          ) : mine === null ? (
            <p className="px-5 py-6 text-sm text-white/45">Lädt …</p>
          ) : mine.length === 0 ? (
            <p className="px-5 py-6 text-sm text-white/45">Noch nichts veröffentlicht. Öffne einen Entwurf, verifiziere ihn und drücke „Veröffentlichen“.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {mine.map((l) => (
                <li key={l.code} className="px-5 py-3">
                  <Link to={levelPath(l.code)} className="flex flex-wrap items-center gap-x-4 gap-y-1 group">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white truncate group-hover:text-violet-200 transition-colors">{l.name}</span>
                      <span className="block text-xs text-white/40 tabular-nums">{l.code} · Ersteller-Zeit {formatTicks(l.creatorTicks)}</span>
                    </span>
                    {STATUS_LABELS[l.status] && <span className="text-xs text-amber-300">{STATUS_LABELS[l.status].label}</span>}
                    <span className="flex items-center gap-3 text-xs text-white/60 tabular-nums">
                      <RatingBadge rating={l.rating} className="!text-xs" />
                      <span className="inline-flex items-center gap-1" title="Versuche"><Play size={12} className="text-white/35" />{l.plays}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-white/35 leading-relaxed">
        Entwürfe liegen nur in diesem Browser und werden automatisch gespeichert. Auf einem anderen Gerät oder nach dem Löschen der
        Browserdaten sind sie nicht da.
      </p>
    </div>
  );
}
