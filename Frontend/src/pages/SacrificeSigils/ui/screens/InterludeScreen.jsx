// ui/screens/InterludeScreen.jsx — Rast nach dem Pfad: Aufdecken der besuchten Knotentypen, Verlierer wählt den Beginner.
import React from "react";
import NodeIcon from "../path/NodeIcon.jsx";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";

/** @param {{ view: any, you: 0|1|null, send: (a: any) => Promise<any>, names: string[] }} props */
export default function InterludeScreen({ view, you, send, names }) {
  const it = view.interlude;
  const chooser = it.chooser;
  const last = view.history[view.history.length - 1];
  const choose = (starter) => {
    sound.play("seal");
    send({ type: "chooseStarter", starter });
  };
  return (
    <div className="max-w-[900px] mx-auto px-4 py-8 space-y-6">
      <div className="ss-paper p-5 md:p-7">
        <p className="ss-title !text-[var(--ink)] text-2xl mb-1">Rast am Tisch</p>
        <p className="opacity-75 mb-4">Die Wege sind gegangen. Welche Orte hat jeder besucht? (Welche Karten betroffen waren, bleibt geheim.)</p>
        <div className="grid sm:grid-cols-2 gap-5">
          {[0, 1].map((p) => (
            <div key={p}>
              <p className="ss-title !text-[var(--ink)]">{p === you ? de.ui.you : names[p]}</p>
              <ul className="mt-2 space-y-1">
                {it.revealed[p].map((t, i) => (
                  <li key={i} className="flex items-center gap-2"><NodeIcon type={t} size={22} /> {de.nodes[t].name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="ss-panel p-5 text-center space-y-3">
        <p className="ss-dim">Letzter Kampf: <b>{names[last.winner]}</b> gewann{last.overkill ? ` mit ${last.overkill} Überschuss` : ""}.</p>
        {you === chooser ? (
          <>
            <p className="ss-title text-xl">{de.ui.chooseStarter}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button type="button" className="ss-seal" onClick={() => choose(you)}>{de.ui.iStart}</button>
              <button type="button" className="ss-btn" onClick={() => choose(1 - you)}>{de.ui.theyStart}</button>
            </div>
            <p className="text-sm ss-faint">Wer als Zweiter beginnt, bekommt +1 Wachs und eine zusätzliche Nebendeck-Karte.</p>
          </>
        ) : (
          <p className="ss-dim">{names[chooser]} entscheidet, wer beginnt …</p>
        )}
      </div>
    </div>
  );
}
