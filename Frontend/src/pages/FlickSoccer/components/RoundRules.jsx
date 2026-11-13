// components/RoundRules.jsx — Regeln je Turnierrunde (nur Veranstalter): pro Runde eine Zeile mit Kurzfassung, ein Klick
// klappt die Einstellungen auf (dieselben wie im Menü: Tore, Zugzeit, Feld, Wiederholung, Chaos).
// rules: Liste nach Runden, letzte = Finale. locked[r] = Runde hat schon begonnen und lässt sich nicht mehr ändern.
import React, { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import MatchOptions from "./MatchOptions.jsx";
import { FieldThumb } from "./FieldPicker.jsx";
import { matchInfo } from "../matchInfo.js";
import { roundName } from "../tournament.js";

export default function RoundRules({ rules, locked = [], onChange }) {
  const [open, setOpen] = useState(0);
  const total = rules.length;
  const patch = (r, p) => onChange(rules.map((rule, i) => (i === r ? { ...rule, ...p } : rule)));
  const copyToAll = (r) => onChange(rules.map((rule, i) => (locked[i] ? rule : { ...rules[r] })));
  const editable = rules.filter((_, i) => !locked[i]).length;

  return (
    <div className="fk-rounds">
      {rules.map((rule, r) => {
        const isOpen = open === r && !locked[r];
        return (
          <div key={r} className={`fk-round${isOpen ? " open" : ""}`}>
            <button
              type="button"
              className="fk-round-head"
              aria-expanded={isOpen}
              disabled={locked[r]}
              onClick={() => setOpen(isOpen ? -1 : r)}
            >
              <FieldThumb id={rule.field} className="fk-round-thumb" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-bold leading-tight">{roundName(total, r)}</span>
                <span className="block fk-faint text-[12.5px] leading-snug truncate">
                  {matchInfo(rule)}{rule.turnSeconds ? ` · ${rule.turnSeconds} s Zugzeit` : " · ohne Zugzeit"}
                </span>
              </span>
              {locked[r] ? <Lock size={15} className="fk-faint shrink-0" /> : <ChevronDown size={17} className="fk-faint shrink-0 fk-round-arrow" />}
            </button>
            {isOpen && (
              <div className="fk-round-body">
                <MatchOptions value={rule} onChange={(p) => patch(r, p)} />
                {editable > 1 && (
                  <button type="button" className="fk-btn fk-btn-sm fk-btn-ghost justify-self-start" onClick={() => copyToAll(r)}>
                    Für alle Runden übernehmen
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
