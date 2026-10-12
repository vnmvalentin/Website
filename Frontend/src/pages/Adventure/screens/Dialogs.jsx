// screens/Dialogs.jsx — kleine Fenster über dem Menü: Handbuch, Feedback, Rückfrage.

import React, { useState } from "react";
import { X, Send, CheckCircle2, BookOpen } from "lucide-react";
import { api } from "../api.js";

function Frame({ title, icon: Icon, onClose, children, width = 640 }) {
  return (
    <div className="av-overlay z-[60]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="av-block p-6 md:p-8 w-full max-h-[86vh] av-scroll relative" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        {onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 av-faint hover:text-[var(--av-ink)]" aria-label="Schließen"><X size={20} /></button>
        )}
        <h2 className="av-title text-[26px] mb-5 flex items-center gap-3 pr-8">{Icon && <Icon size={22} className="av-torch" />}{title}</h2>
        {children}
      </div>
    </div>
  );
}

const CONTROLS = [
  ["W A S D", "Laufen"],
  ["Linke Maustaste", "Hauptangriff (gedrückt halten)"],
  ["Rechte Maustaste", "Zweitangriff"],
  ["Leertaste / Shift", "Bewegungsfähigkeit"],
  ["R", "Spezialfähigkeit"],
  ["Q", "Ausrüstung benutzen"],
  ["E", "Kisten, Schreine, Teleporter, Ausrüstung aufheben"],
  ["1 / 2 / 3", "Karte beim Stufenaufstieg wählen"],
  ["Tab", "Werte anzeigen"],
  ["Esc", "Pause"],
];

const RULES = [
  "Jede Welt ist eine große Karte. Besiegte Gegner lassen Gold fallen, das automatisch zu dir fliegt, und geben Erfahrung.",
  "Bei jeder neuen Stufe hält das Spiel an und du wählst aus drei Karten: eine neue Waffe, eine Waffe verbessern oder ein Talent. Waffen feuern von selbst (bis zu 4, je bis Stufe 5), Talente verbessern deine Werte (bis zu 4). Gefällt dir keine Karte, kannst du gegen Gold neu würfeln.",
  "Evolution: Ist eine Waffe auf Stufe 5 und du hast das passende Talent, wird sie beim nächsten Aufstieg zur Evolution angeboten — eine deutlich stärkere Fassung (siehe Kodex → Waffen & Talente).",
  "Horde-Momente: Beim Blutmond kommen 30 Sekunden lang dreimal so viele Gegner (danach gibt es ein Item), bei einer Einkreisung schließt sich ein Ring aus Gegnern um dich, und Champions — große Elite mit zwei Eigenschaften — lassen ein seltenes Item fallen.",
  "Kisten kosten Gold und geben Items. Items stapeln sich und verbessern deine Werte oder lösen Effekte aus. Große Kisten geben seltene Items, Ausrüstungstruhen eine Fähigkeit für die Taste Q.",
  "Schreine: Glücksschrein (Chance auf ein Item), Kampfschrein (Elite-Gegner, die ein seltenes Item hüten), Heilquelle, Schicksalsschrein (1 von 3 Items wählen), Opferaltar (Leben gegen ein legendäres Item), Fluchschrein (stärkere Gegner, dafür +50 % Beute bis zur nächsten Welt) und Würfelschrein (tauscht ein Item gegen eins der nächsten Seltenheit).",
  "Die Schwierigkeit steigt mit der Zeit — oben rechts siehst du, wie gefährlich es gerade ist. Wer trödelt, trifft auf stärkere Gegner.",
  "Findest du den Teleporter und aktivierst ihn, erscheint der Boss der Welt. Besiege ihn und bleib im roten Kreis, bis der Teleporter geladen ist — dann geht es mit E weiter.",
  "Rote Flächen am Boden kündigen Angriffe an. Wer rechtzeitig herausläuft, nimmt keinen Schaden.",
  "Nach fünf Welten wartet Thunderwing. Wer ihn besiegt, gewinnt — oder spielt im nächsten Zyklus weiter.",
  "Jeder Lauf gibt Account-XP. Mit neuen Stufen werden Kits, weitere Items und Boni frei. Erfolge schalten Farbvarianten der Kits frei.",
  "Tageslauf: jeden Tag eine Welt für alle, mit eigener Bestenliste. Wer auf Albtraum gewinnt, schaltet Albtraum+ frei — fünf Stufen mit jeweils einem zusätzlichen Nachteil und mehr Punkten.",
  "Im Pausenmenü (Esc) stellst du Lautstärke, Schadenszahlen, Bildschirmwackeln und die kurze Pause beim Aufheben von Items ein.",
];

export function HelpDialog({ onClose }) {
  return (
    <Frame title="Handbuch" icon={BookOpen} onClose={onClose} width={720}>
      <h3 className="av-label mb-2">Steuerung</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 mb-6">
        {CONTROLS.map(([k, v]) => (
          <React.Fragment key={k}><dt className="av-torch whitespace-nowrap">{k}</dt><dd className="av-dim">{v}</dd></React.Fragment>
        ))}
      </dl>
      <h3 className="av-label mb-2">So läuft ein Lauf</h3>
      <ol className="flex flex-col gap-2.5 av-dim leading-relaxed list-decimal pl-5">
        {RULES.map((r) => <li key={r}>{r}</li>)}
      </ol>
    </Frame>
  );
}

export function FeedbackDialog({ onClose }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const send = async () => {
    setState("sending");
    try { await api.feedback(text); setState("done"); } catch (e) { setError(e.message); setState("idle"); }
  };
  return (
    <Frame title="Feedback" onClose={onClose}>
      {state === "done" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={36} className="av-moss" />
          <p>Danke! Dein Feedback ist angekommen.</p>
          <button className="av-btn av-btn-stone mt-2" onClick={onClose}>Schließen</button>
        </div>
      ) : (
        <>
          <p className="av-dim mb-3">Bug gefunden, Item zu stark, Boss zu leicht? Schreib es hier rein.</p>
          <textarea className="av-input min-h-[140px]" maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Was ist dir aufgefallen?" />
          {error && <p className="mt-2 av-blood">{error}</p>}
          <button className="av-btn mt-4" disabled={!text.trim() || state === "sending"} onClick={send}><Send size={16} /> Senden</button>
        </>
      )}
    </Frame>
  );
}

export function ConfirmDialog({ title, text, confirmLabel, onConfirm, onClose }) {
  return (
    <Frame title={title} onClose={onClose} width={480}>
      <p className="av-dim leading-relaxed">{text}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="av-btn av-btn-stone" onClick={onClose}>Abbrechen</button>
        <button className="av-btn av-btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Frame>
  );
}
