// ui/screens/HomeScreen.jsx — Titel-Szene mit Kerzen: Spiel erstellen / beitreten / Übung / Kartenbuch / Anleitung / Tutorial.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Swords, DoorOpen, Bot, BookOpen, ScrollText, GraduationCap } from "lucide-react";
import SEO from "../../../../components/SEO";
import Card from "../card/Card.jsx";
import { COLLECTIBLE, resolveCard } from "../../engine/cards.js";
import { usePrefs, setPrefs } from "../prefs.js";
import { sound } from "../../audio/sound.js";
import { de } from "../../i18n/de.js";

export default function HomeScreen() {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name || "");
  const [mode, setMode] = useState(/** @type {null|"create"|"join"} */ (null));
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  // Ein paar Karten liegen verstreut auf dem Tisch (jeden Tag andere)
  const scattered = useMemo(() => {
    const day = Math.floor(Date.now() / 86400000);
    const legends = COLLECTIBLE.filter((c) => c.rarity !== "common");
    return [0, 1, 2].map((i) => resolveCard(legends[(day * 7 + i * 13) % legends.length].id, [], `deko${i}`));
  }, []);

  const needName = () => {
    const n = name.trim();
    if (!n) {
      setErr("Wie heißt du, Zeichner?");
      sound.play("error");
      return null;
    }
    setPrefs({ name: n.slice(0, 24) });
    return n;
  };

  const create = () => {
    if (!needName()) return;
    sound.play("seal");
    navigate("/sacrifice-and-sigils/raum/neu");
  };

  const join = (e) => {
    e.preventDefault();
    if (!needName()) return;
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(c)) {
      setErr("Der Code hat fünf Zeichen.");
      return;
    }
    sound.play("seal");
    navigate(`/sacrifice-and-sigils/raum/${c}`);
  };

  const items = [
    { key: "create", icon: Swords, label: de.ui.create, sub: "Raum öffnen und Link teilen", onClick: () => setMode("create") },
    { key: "join", icon: DoorOpen, label: de.ui.join, sub: "Mit einem Code an einen Tisch setzen", onClick: () => setMode("join") },
    { key: "practice", icon: Bot, label: de.ui.practice, sub: "Drei Stufen, oder Hotseat zu zweit", onClick: () => navigate("/sacrifice-and-sigils/uebung") },
    { key: "tutorial", icon: GraduationCap, label: de.ui.tutorial, sub: "Geführter Übungskampf", onClick: () => navigate("/sacrifice-and-sigils/tutorial") },
    { key: "codex", icon: BookOpen, label: de.ui.codex, sub: "Alle Karten und Sigils", onClick: () => navigate("/sacrifice-and-sigils/kartenbuch") },
    { key: "guide", icon: ScrollText, label: de.ui.guide, sub: "Regeln in Ruhe nachlesen", onClick: () => navigate("/sacrifice-and-sigils/anleitung") },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-14">
      <SEO
        title="Sacrifice & Sigils – Kartenspiel im Browser"
        description="Düsteres 1v1-Kartenspiel im Browser: Draft, Opfer, Knochen und Wachs, eine Messingwaage und ein Pfad durchs Aschemoor. Online gegen Freunde oder gegen die KI."
        path="/sacrifice-and-sigils"
      />
      <div className="grid md:grid-cols-[1.15fr_1fr] gap-10 items-center">
        <div className="relative">
          <p className="ss-dim italic mb-3">Eine versunkene Kapelle im Aschemoor. Zwei Zeichner, ein Tisch, eine Waage.</p>
          <h1 className="ss-hero-title">Sacrifice<br /><em>&amp;</em> Sigils</h1>
          <p className="mt-5 max-w-md ss-dim text-lg">
            Was ihr mit Tusche auf Pergament zeichnet, wird lebendig und kämpft. Opfert, sammelt Knochen, lasst Wachs tropfen –
            wer die Waage um fünf Gewichte zu sich neigt, gewinnt.
          </p>
          <div className="relative h-[260px] mt-16 hidden sm:block" aria-hidden>
            <div className="ss-candle absolute left-2 bottom-4 h-24" />
            <div className="ss-candle absolute left-12 bottom-4 h-16" />
            {scattered.map((c, i) => (
              <div key={c.uid} className="absolute" style={{ left: 110 + i * 105, top: 20 + (i % 2) * 26, transform: `rotate(${[-9, 4, 12][i]}deg)` }}>
                <Card card={c} width={128} />
              </div>
            ))}
          </div>
        </div>
        <div className="ss-paper p-5 md:p-7">
          <label className="block mb-4">
            <span className="ss-title !text-[var(--ink)] text-sm">{de.ui.yourName}</span>
            <input className="ss-input mt-1" value={name} maxLength={24} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Zeichner" autoComplete="nickname" />
          </label>
          {mode === null && (
            <nav aria-label="Hauptmenü">
              {items.map((it) => (
                <button key={it.key} type="button" className="ss-menu-item" onClick={() => { sound.play("seal"); it.onClick(); }}>
                  <it.icon size={22} aria-hidden />
                  <span>{it.label}<small>{it.sub}</small></span>
                </button>
              ))}
            </nav>
          )}
          {mode === "create" && (
            <div className="space-y-4 ss-fade-in">
              <p className="text-[var(--ink)]">Du bist Gastgeber: Einstellungen legst du im Raum fest, dann teilst du den Link.</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="ss-seal" onClick={create}>{de.ui.create}</button>
                <button type="button" className="ss-btn" onClick={() => setMode(null)}>{de.ui.back}</button>
              </div>
            </div>
          )}
          {mode === "join" && (
            <form className="space-y-4 ss-fade-in" onSubmit={join}>
              <label className="block">
                <span className="ss-title !text-[var(--ink)] text-sm">{de.ui.code}</span>
                <input className="ss-input mt-1 uppercase tracking-[0.3em] ss-num" value={code} maxLength={5} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }} placeholder="ABCDE" autoFocus />
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="ss-seal">{de.ui.join}</button>
                <button type="button" className="ss-btn" onClick={() => setMode(null)}>{de.ui.back}</button>
              </div>
            </form>
          )}
          {err && <p className="mt-3 text-[var(--wax-red)]" role="alert">{err}</p>}
        </div>
      </div>
    </div>
  );
}
