// ActivityStrip.jsx — "Gerade los" auf der Startseite: ein paar echte Zahlen (Backend/activity/activityRoutes.js).
// Welche Zahl erscheint, entscheidet allein der Server (Schwellen dort). Leere Liste oder Fehler: nichts anzeigen —
// auch beim Vorrendern der Startseite gibt es kein Backend, die Zeile kommt erst im Browser dazu.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const formatValue = (v) => (typeof v === "number" ? v.toLocaleString("de-DE") : String(v));

export default function ActivityStrip() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/activity", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!items.length) return null;

  return (
    <section aria-label="Gerade los">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-3">Gerade los</p>
      <div className="panel flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            className="group flex-1 min-w-0 flex flex-col justify-between gap-3 p-5 transition-colors hover:bg-white/[0.04]"
          >
            <span className="font-display text-3xl font-bold text-white tabular-nums leading-none">{formatValue(item.value)}</span>
            <span className="flex items-end justify-between gap-3 text-sm text-white/50 group-hover:text-white/80 transition-colors">
              <span className="leading-snug">{item.label}</span>
              <ArrowRight size={15} className="shrink-0 text-white/20 group-hover:text-violet-300 transition-colors" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
