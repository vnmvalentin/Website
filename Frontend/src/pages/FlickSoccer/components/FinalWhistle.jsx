// components/FinalWhistle.jsx — Abpfiff: zwei dunkle Vorhänge schließen sich über dem Feld, „ABPFIFF" knallt groß
// herein (langer Pfiff) und rückt nach oben, darunter fahren Ergebnis, Neu-Freigeschaltetes und die Knöpfe ein.
// Endet im stehenden Ergebnisbildschirm. Die Abfolge steht in theme.css (fk-final-*).
import React, { useEffect } from "react";
import { Award } from "lucide-react";
import { CATALOG_LABEL } from "../progress.js";
import { playWhistle } from "../sound.js";
import DiscPreview from "./DiscPreview.jsx";
import { LookPreview } from "./LookPicker.jsx";

function UnlockChip({ item, myTeam }) {
  let preview;
  if (item.kind === "skin") preview = <DiscPreview skin={item.id} team={myTeam} size={34} />;
  else if (item.kind === "achievement") preview = <span className="fk-look-icon fk-lime" style={{ width: 34, height: 34 }}><Award size={18} /></span>;
  else preview = <LookPreview kind={item.kind} id={item.id} size={34} />;
  return (
    <div className="fk-unlock-chip">
      {preview}
      <span className="text-left leading-tight">
        <span className="fk-label block text-[10.5px]">{CATALOG_LABEL[item.kind]}</span>
        <span className="font-bold text-[14px]">{item.name}</span>
      </span>
    </div>
  );
}

// unlocked: [{ kind, id, name }] aus recordMatch (stats.js)
// extra: zusätzlicher Bereich über den Knöpfen (Revanche-Status, Aufstellung für die Revanche)
export default function FinalWhistle({ label = "Abpfiff", resultText, team, score, unlocked = [], myTeam = 0, extra = null, children }) {
  useEffect(() => {
    const id = setTimeout(() => playWhistle(true), 300);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="fk-final" role="dialog" aria-label={`${label}: ${resultText}`}>
      <div className="fk-final-curtain top" />
      <div className="fk-final-curtain bottom" />
      <div className="fk-final-content">
        <div className="fk-final-word">{label}</div>
        <div className="fk-final-result">
          <p className="fk-display text-[clamp(30px,5vw,52px)]" style={{ color: team === 0 ? "var(--fk-red)" : "var(--fk-blue)" }}>
            {resultText}
          </p>
          <p className="fk-display fk-num text-[clamp(24px,3.4vw,36px)] mt-2">
            <span className="fk-red">{score[0]}</span> : <span className="fk-blue">{score[1]}</span>
          </p>
        </div>
        {unlocked.length > 0 && (
          <div className="fk-final-unlock">
            <p className="fk-label fk-lime mb-2">Neu freigeschaltet</p>
            <div className="flex flex-wrap justify-center gap-2">
              {unlocked.map((item) => <UnlockChip key={`${item.kind}:${item.id}`} item={item} myTeam={myTeam} />)}
            </div>
            <p className="fk-faint text-[12.5px] mt-2">Ansehen und auswählen im Profil (oben rechts).</p>
          </div>
        )}
        {extra && <div className="fk-final-extra">{extra}</div>}
        <div className="fk-final-actions">{children}</div>
      </div>
    </div>
  );
}
