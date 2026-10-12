// ui/RulesDialog.jsx — Regeln und Steuerung von Flick Soccer.
import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function RulesDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fk-dialog-backdrop" onClick={onClose}>
      <div className="fk-card fk-dialog" role="dialog" aria-modal="true" aria-labelledby="fk-rules-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 id="fk-rules-title" className="fk-display text-2xl">Regeln</h2>
          <button type="button" onClick={onClose} className="fk-icon-btn" aria-label="Schließen"><X size={17} /></button>
        </div>
        <div className="fk-rows px-5 pb-5 text-[15px]">
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Schießen</h3>
            <p className="fk-dim">
              Drück auf eine deiner Scheiben und zieh zurück wie bei einer Steinschleuder. Der Pfeil zeigt, wohin die Scheibe
              fliegt — je länger und röter, desto fester. Loslassen schießt. Zurück auf die Scheibe ziehen oder Esc bricht ab.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Ablauf</h3>
            <p className="fk-dim">
              Rot und Blau schießen abwechselnd, ein Schuss pro Zug. Der nächste Zug beginnt, wenn alles still steht. Ist die
              Zugzeit eingeschaltet und läuft ab, ist der andere dran.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Tore</h3>
            <p className="fk-dim">
              Ein Tor zählt, wenn der Ball ganz hinter der Linie liegt. Danach stellen sich beide Teams neu auf, wer das Tor
              kassiert hat, hat Anstoß. Wer zuerst die eingestellte Zahl an Toren hat, gewinnt.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Kein Tor zumauern</h3>
            <p className="fk-dim">
              Liegt eine Scheibe nach einem Zug zu mehr als der Hälfte im Tor, wird sie wieder herausgeschoben, bis sie vor
              der Linie steht. So kann niemand das Tor mit eigenen Scheiben blockieren.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Chaos-Modus</h3>
            <p className="fk-dim">
              Zuschaltbar bei den Regeln. Jeder Zug bringt automatisch ein Power-up, das auf genau diesen Schuss wirkt:
              Schwergewicht, Turbo, Riese, Gummibande, Eiszeit oder Doppelschuss. Die Reihenfolge ist zufällig und
              für beide Teams verschieden. Fair bleibt es, weil jedes Team in sechs Zügen jedes Power-up genau einmal bekommt.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Felder</h3>
            <p className="fk-dim">
              Neben dem Stadion gibt es die kleine Halle, Pfosten als Hindernisse an der Mittellinie, den Käfig mit schrägen
              Ecken und das Scheunentor mit riesigen Toren. Die Aufstellungen passen sich dem Feld an.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Physik</h3>
            <p className="fk-dim">
              Scheiben und Ball prallen von Banden, Pfosten und voneinander ab. Der Ball ist leichter als eine Scheibe und
              fliegt deshalb weiter.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
