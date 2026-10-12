// FlickMenu.jsx — Hauptmenü. Links Modus, Regeln und Anpfiff; rechts die Aufstellung: Feld-Vorschau und darunter die
// Auswahl, damit man auf dem Desktop nicht scrollen muss. Name und Design stehen im Profil (ui/ProfileDialog.jsx), oben
// nur als Chip. Am Handy sitzt „Anpfiff" in einer festen Leiste unten. Einstellungen: Hülle (ui/Shell.jsx → prefs.js).
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Users, Globe, ArrowRight, UserRound } from "lucide-react";
import SEO from "../../components/SEO";
import Pitch from "./components/Pitch.jsx";
import FormationPicker from "./components/FormationPicker.jsx";
import DiscPreview from "./components/DiscPreview.jsx";
import MatchOptions, { Seg } from "./components/MatchOptions.jsx";
import { FIELDS, FORMATIONS, FORMATION_IDS, kickoffState } from "./engine/index.js";
import { AI_LEVELS } from "./ai.js";
import { useFlickShell } from "./ui/shellContext.js";

const MODES = [
  { id: "ai", label: "Computer", desc: "Drei Stärken, sofort los", icon: Bot },
  { id: "hotseat", label: "Zu zweit", desc: "Abwechselnd an einem Gerät", icon: Users },
  { id: "online", label: "Online", desc: "Link schicken, gegeneinander", icon: Globe },
];

// Was über und unter der Feld-Vorschau Platz braucht (Kopfleiste, Überschrift, Kartenränder, Aufstellungs-Reihe)
const PREVIEW_OFFSET = 462;

function randomFormation() {
  return FORMATION_IDS[Math.floor(Math.random() * FORMATION_IDS.length)];
}

export default function FlickMenu() {
  const navigate = useNavigate();
  const { openRules, openProfile, prefs, updatePrefs: set } = useFlickShell();
  const [joinCode, setJoinCode] = useState("");
  const [editTeam, setEditTeam] = useState(0); // zu zweit: wessen Aufstellung gerade gewählt wird

  const hotseat = prefs.mode === "hotseat";
  const team = hotseat ? editTeam : 0;
  const preview = useMemo(
    () => kickoffState([prefs.formation, hotseat ? prefs.formation2 : prefs.formation], prefs.field),
    [prefs.formation, prefs.formation2, hotseat, prefs.field],
  );

  const settings = {
    goalsToWin: prefs.goalsToWin, turnSeconds: prefs.turnSeconds, replay: prefs.replay, field: prefs.field, chaos: prefs.chaos,
  };
  const nameMissing = prefs.mode === "online" && !prefs.name.trim();

  const start = () => {
    if (nameMissing) {
      openProfile();
      return;
    }
    if (prefs.mode === "online") {
      navigate("/flick-soccer/neu", { state: { create: { settings, formation: prefs.formation } } });
      return;
    }
    navigate("/flick-soccer/spiel", {
      state: {
        mode: prefs.mode,
        level: prefs.level,
        settings,
        formations: [prefs.formation, hotseat ? prefs.formation2 : randomFormation()],
      },
    });
  };

  const join = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 5) return;
    if (nameMissing) {
      openProfile();
      return;
    }
    navigate(`/flick-soccer/${code}`);
  };

  const formationValue = team === 0 ? prefs.formation : prefs.formation2;
  const setFormation = (id) => set(team === 0 ? { formation: id } : { formation2: id });
  const startLabel = prefs.mode === "online" ? "Raum erstellen" : "Anpfiff";

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 pt-5 pb-28 lg:pb-3">
      <SEO
        title="Flick Soccer"
        description="Flick Soccer: Scheiben-Fußball im Browser. Formation wählen, Scheibe zurückziehen und abschießen — Zug um Zug gegen den Computer, zu zweit oder online per Link."
        path="/flick-soccer"
      />

      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="fk-label fk-lime">Scheiben-Fußball · Zug um Zug</p>
          <h1 className="fk-display text-[38px] sm:text-[48px] [@media(max-height:820px)]:text-[34px] mt-1.5">Flick Soccer</h1>
          <p className="fk-dim mt-2 text-[14.5px] [@media(max-height:820px)]:mt-1">
            Fünf Scheiben, ein Ball, abwechselnd ein Schuss: zurückziehen, zielen, loslassen.{" "}
            <button type="button" className="underline underline-offset-2 hover:text-[var(--fk-text)]" onClick={openRules}>Regeln</button>
          </p>
        </div>
        <button type="button" className="fk-profile-chip" onClick={openProfile} title="Profil: Name, Design, Statistik">
          <DiscPreview skin={prefs.skin} team={0} size={40} />
          <span className="min-w-0 text-left">
            <span className="fk-label block text-[11px]">Profil</span>
            <span className="block font-bold truncate max-w-[180px]">{prefs.name.trim() || "Name eintragen"}</span>
          </span>
          <UserRound size={16} className="fk-faint ml-1" />
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr] items-start">
        <div className="fk-card fk-menu-left">
          <div className="fk-rows">
            <section className="p-5">
              <h2 className="fk-section-title mb-3">Spielmodus</h2>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(({ id, label, desc, icon: Icon }) => (
                  <button key={id} type="button" className="fk-mode" onClick={() => set({ mode: id })} aria-pressed={prefs.mode === id}>
                    <Icon size={20} />
                    <span>
                      <span className="block font-bold text-[15px] leading-tight">{label}</span>
                      <span className="block fk-faint text-[12.5px] leading-snug mt-0.5 [@media(max-height:820px)]:hidden">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {prefs.mode === "ai" && (
                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <span className="fk-label">Stärke</span>
                  <Seg
                    label="Stärke"
                    value={prefs.level}
                    onChange={(level) => set({ level })}
                    options={Object.entries(AI_LEVELS).map(([value, l]) => ({ value, label: l.label }))}
                  />
                </div>
              )}
              {prefs.mode === "online" && (
                <form onSubmit={join} className="mt-4 grid gap-1">
                  <span className="fk-label">Oder einem Raum beitreten</span>
                  <div className="flex gap-2">
                    <input
                      className="fk-input uppercase tracking-[0.25em] font-bold"
                      maxLength={5}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="CODE"
                      aria-label="Raumcode"
                    />
                    <button type="submit" className="fk-btn fk-btn-quiet" disabled={joinCode.trim().length !== 5}>
                      Beitreten
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="p-5 grid gap-3">
              <h2 className="fk-section-title [@media(max-height:820px)]:hidden">Regeln</h2>
              <MatchOptions value={settings} onChange={set} />
            </section>

            <div className="p-5 hidden lg:block">
              <button type="button" className="fk-btn fk-btn-lg w-full" onClick={start}>
                {startLabel} <ArrowRight size={20} />
              </button>
              {nameMissing && <p className="fk-faint text-[13px] mt-2">Für online brauchst du einen Namen — der Knopf öffnet dein Profil.</p>}
            </div>
          </div>
        </div>

        <div className="fk-card p-4 @container">
          <div className="hidden lg:block mb-4">
            <Pitch
              state={preview}
              maxHeightOffset={PREVIEW_OFFSET}
              skins={[prefs.skin, hotseat ? prefs.skin2 : prefs.skin]}
              look={{ turf: prefs.turf, ball: prefs.ball }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="fk-section-title">Aufstellung</h2>
              {hotseat && (
                <Seg
                  label="Aufstellung für"
                  value={editTeam}
                  onChange={setEditTeam}
                  options={[{ value: 0, label: "Rot" }, { value: 1, label: "Blau" }]}
                />
              )}
            </div>
            <span className="fk-faint text-[13px] truncate">
              {prefs.field !== "standard" ? `${FIELDS[prefs.field].name}: ${FIELDS[prefs.field].hint}` : FORMATIONS[formationValue]?.hint}
              {prefs.mode === "ai" ? " · Der Computer wählt seine selbst" : ""}
            </span>
          </div>
          <FormationPicker
            value={formationValue}
            onChange={setFormation}
            team={team}
            className="grid-cols-3 sm:grid-cols-5 @2xl:grid-cols-10"
          />
        </div>
      </div>

      {/* Handy/Tablet: Anpfiff immer erreichbar, ohne nach unten zu scrollen */}
      <div className="fk-startbar lg:hidden">
        <button type="button" className="fk-btn fk-btn-lg w-full" onClick={start}>
          {nameMissing ? "Name eintragen" : startLabel} <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
