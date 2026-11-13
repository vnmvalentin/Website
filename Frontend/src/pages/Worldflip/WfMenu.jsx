// WfMenu.jsx — Hauptmenü von Worldflip: gegen Bots spielen, Online-Raum anlegen oder per Code beitreten.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Play, Users } from "lucide-react";
import SEO from "../../components/SEO";
import ShellLegalLinks from "../../components/shell/ShellLegalLinks";
import CardImg from "./components/CardImg.jsx";
import SkinEditor from "./components/SkinEditor.jsx";
import { RULES, WORLDS } from "./engine/index.js";
import { useWfShell } from "./ui/shellContext.js";

const FAN = [
  { w: 0, k: "n", n: 7 }, { w: 1, k: "frost" }, { w: -1, k: "zuender" }, { w: 2, k: "schild" }, { w: 3, k: "n", n: 3 },
];

export default function WfMenu() {
  const navigate = useNavigate();
  const { prefs, updatePrefs, openRules } = useWfShell();
  const [code, setCode] = useState("");
  const cleanCode = code.trim().toUpperCase();

  return (
    <div className="flex-1 flex flex-col">
      <SEO
        title="Worldflip"
        description="3D-Kartenspiel im Browser: Karten ablegen, während vier Welten um den Tisch kippen und ausbrechen. 13 Effektkarten, 12 Weltereignisse — gegen Bots, online zu viert oder 2 gegen 2."
        path="/worldflip"
        keywords="Kartenspiel, 3D, Browser, online, Multiplayer, Worldflip"
      />
      <div className="max-w-[1100px] w-full mx-auto px-4 py-8 sm:py-12 grid gap-10 lg:grid-cols-[1fr_420px] items-start">
        <div>
          <h1 className="wf-display text-5xl sm:text-7xl">Worldflip</h1>
          <p className="mt-4 text-lg wf-dim max-w-[52ch]">
            Werd deine Karten los, bevor es die anderen schaffen. Der Tisch schwebt zwischen vier Welten, und jede hat ihr
            eigenes Gesetz. Karten laden die Welten auf, bis sie ausbrechen — mit Lavabomben, Flut, Ranken oder einem
            Schwarzen Loch.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2 max-w-[560px]">
            {WORLDS.map((w) => (
              <li key={w.id} className="flex gap-3 items-start">
                <span className="wf-chip mt-1.5" style={{ background: w.color }} />
                <span><b>{w.name} · {w.law}</b> <span className="wf-dim">{w.lawText}</span></span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={openRules} className="wf-btn wf-btn-sm wf-btn-ghost mt-6"><BookOpen size={15} />Alle Regeln</button>
          <div className="wf-fan mt-10 hidden sm:block" aria-hidden="true">
            {FAN.map((c, i) => (
              <CardImg key={i} card={c} style={{ rotate: `${(i - 2) * 10}deg`, left: `calc(50% + ${(i - 2) * 62}px)`, zIndex: i }} />
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <SkinEditor skin={prefs.skin} onChange={(skin) => updatePrefs({ skin })} />

          <section className="wf-card p-5">
            <h2 className="wf-section-title mb-4">Gegen Bots</h2>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span>Modus</span>
              <div className="wf-seg">
                <button type="button" aria-pressed={!prefs.teams} onClick={() => updatePrefs({ teams: false })}>Jeder gegen jeden</button>
                <button type="button" aria-pressed={prefs.teams} onClick={() => updatePrefs({ teams: true })}>2 gegen 2</button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span>Spieler am Tisch</span>
              <div className="wf-seg">
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" disabled={prefs.teams} aria-pressed={(prefs.teams ? 4 : prefs.players) === n} onClick={() => updatePrefs({ players: n })}>{n}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mb-5">
              <span>Handkarten</span>
              <div className="wf-seg">
                {RULES.HAND_SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={prefs.handSize === n} onClick={() => updatePrefs({ handSize: n })}>{n}</button>
                ))}
              </div>
            </div>
            <button type="button" className="wf-btn wf-btn-lg w-full" onClick={() => navigate("/worldflip/spiel")}><Play size={18} />Spielen</button>
          </section>

          <section className="wf-card p-5">
            <h2 className="wf-section-title mb-4">Online mit Freunden</h2>
            <label className="wf-label block mb-1" htmlFor="wf-name">Dein Name</label>
            <input
              id="wf-name"
              className="wf-input mb-4"
              value={prefs.name}
              maxLength={20}
              placeholder="Wie heißt du am Tisch?"
              onChange={(e) => updatePrefs({ name: e.target.value })}
            />
            <button type="button" className="wf-btn w-full" onClick={() => navigate("/worldflip/neu")}><Users size={17} />Raum erstellen</button>
            <p className="wf-faint text-sm mt-2">Du bekommst einen Link zum Teilen. Freie Plätze füllen Bots auf.</p>
            <form
              className="flex gap-2 mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (cleanCode.length >= 3) navigate(`/worldflip/${cleanCode}`);
              }}
            >
              <input className="wf-input uppercase" value={code} maxLength={8} placeholder="Code" aria-label="Raum-Code" onChange={(e) => setCode(e.target.value)} />
              <button type="submit" className="wf-btn wf-btn-quiet" disabled={cleanCode.length < 3}>Beitreten</button>
            </form>
          </section>
        </div>
      </div>
      <ShellLegalLinks className="mt-auto py-4" />
    </div>
  );
}
