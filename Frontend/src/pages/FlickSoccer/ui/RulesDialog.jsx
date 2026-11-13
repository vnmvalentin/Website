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
              Zuschaltbar bei den Regeln. Jedes Team hält drei Karten auf der Hand und darf pro Zug eine davon ausspielen —
              oder keine und sie für später aufheben. Karte antippen, dann schießen: Sie wirkt auf genau diesen Schuss, danach
              ziehst du eine neue. Es gibt zwölf Karten, darunter Sprengsatz, Geisterscheibe, Schrumpfstrahl, Eiszeit, Alle Mann
              und Doppelschuss. Beide Hände liegen offen. Fair bleibt es, weil jedes Team aus einem eigenen Stapel zieht, in dem
              jede Karte genau einmal steckt.
            </p>
            <p className="fk-dim mt-2">
              Dazu kommen Ereignisse, die das ganze Feld treffen: Nach zwei ruhigen Zügen gilt zwei Züge lang eine
              Sonderregel für beide — Blitzeis, Bleikugel, Flummi, Vollgas, Winzlinge, Murmel, Erdbeben oder Stromausfall.
              Oben steht, was gerade gilt und was als Nächstes kommt.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Felder</h3>
            <p className="fk-dim">
              Elf Felder, jedes mit eigenem Boden und eigener Besonderheit: die kleine Halle, der Trainingsplatz mit Pfosten,
              der Käfig mit schrägen Ecken, das Scheunentor mit riesigen Toren, die Eisbahn (alles rutscht weiter), der Flipper
              (Bumper schießen zurück), das Wurmloch (zwei Portale), der Strand (Sand bremst), der Burghof (Mauern an der
              Mittellinie) und die Rundbahn mit runden Ecken. Die Aufstellungen passen sich dem Feld an.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Eigene Aufstellung</h3>
            <p className="fk-dim">
              Bei den Aufstellungen öffnet „Eigene bauen“ einen Editor: Schieb deine fünf Scheiben auf der eigenen Hälfte
              dorthin, wo du sie haben willst. Der Mittelkreis bleibt frei. Bis zu fünf eigene Aufstellungen werden gemerkt
              und gelten auch online.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Tour</h3>
            <p className="fk-dim">
              20 Gegner in vier Pokalen, jeder mit eigenem Feld und eigenen Regeln. Ein Sieg schaltet den nächsten frei und
              bringt bis zu drei Sterne: drei ohne Gegentor, zwei mit einem, sonst einen. Sterne schalten neue Scheiben frei.
              Der letzte Gegner jedes Pokals hat eine Sonderregel, zum Beispiel einen Vorsprung oder schwerere Scheiben.
            </p>
          </section>
          <section className="py-3">
            <h3 className="fk-section-title mb-1">Trickschüsse</h3>
            <p className="fk-dim">
              Feste Stellungen, ein Schuss: Der Ball muss ins rechte Tor. Daneben geschossen, steht alles wieder da. Drei
              Sterne für einen Treffer beim ersten Versuch, zwei bis zum dritten. Nach fünf Fehlversuchen kannst du dir die
              Lösung zeigen lassen.
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
