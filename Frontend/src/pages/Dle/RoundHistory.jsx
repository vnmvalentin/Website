// RoundHistory.jsx — Verlauf an der Seite: eine Zeile pro Runde mit Punktzahl, sobald
// gespielt, plus laufende Gesamtsumme. Zukünftige (noch nicht erreichte) Runden zeigen
// bewusst nur "Runde N" statt des echten Labels — sonst würde der Verlauf selbst schon
// verraten, was als Nächstes drankommt.
//
// Spielunabhängig (kein Bezug zu Temperatur/Geschwindigkeit/…) — von allen -dle-Spielen
// gemeinsam genutzt, deshalb hier auf Dle-Ebene statt in einem einzelnen Spielordner.
export default function RoundHistory({ rounds, playedRounds, currentIndex }) {
  const total = playedRounds.reduce((sum, r) => sum + r.score, 0);

  return (
    <div className="panel p-5 lg:sticky lg:top-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-4">Verlauf</h3>
      <div className="space-y-2 mb-4">
        {rounds.map((r, i) => {
          const played = playedRounds[i];
          const isCurrent = i === currentIndex && !played;
          return (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border transition-colors ${
                isCurrent
                  ? 'bg-violet-500/10 border-violet-400/30'
                  : 'bg-white/[0.03] border-white/5'
              }`}
            >
              <span className={`truncate pr-2 ${played ? 'text-white/70' : isCurrent ? 'text-white' : 'text-white/30'}`}>
                {played ? played.label : isCurrent ? r.label : `Runde ${i + 1}`}
              </span>
              <span className={`shrink-0 font-bold tabular-nums ${played ? 'text-white' : 'text-white/20'}`}>
                {played ? played.score : '–'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <span className="text-xs uppercase tracking-wider text-white/40">Gesamt</span>
        <span className="text-white font-bold tabular-nums">{total} / {rounds.length * 100}</span>
      </div>
    </div>
  );
}
