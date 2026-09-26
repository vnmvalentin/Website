// ShareCode.jsx — der Code eines veröffentlichten Levels mit Knöpfen zum Kopieren von Code und Link.
import React, { useEffect, useRef, useState } from "react";
import { Copy, Check, Link2 } from "lucide-react";
import { copyText } from "./clipboard.js";
import { levelUrl } from "./shareCode.js";
import { buttonClass } from "../editor/fields.jsx";

export default function ShareCode({ code, size = "md" }) {
  const [done, setDone] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (what, text) => {
    const ok = await copyText(text);
    setDone(ok ? what : "fehler");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 2200);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`font-display font-bold text-white tracking-wider tabular-nums select-all ${size === "lg" ? "text-3xl md:text-4xl" : "text-base"}`}
        data-testid="share-code"
      >
        {code}
      </span>
      <button type="button" onClick={() => copy("code", code)} className={buttonClass} title="Code kopieren">
        {done === "code" ? <Check size={14} className="text-green-300" /> : <Copy size={14} />}
        {done === "code" ? "Kopiert" : "Code"}
      </button>
      <button type="button" onClick={() => copy("link", levelUrl(code))} className={buttonClass} title="Link zum Level kopieren">
        {done === "link" ? <Check size={14} className="text-green-300" /> : <Link2 size={14} />}
        {done === "link" ? "Kopiert" : "Link"}
      </button>
      {done === "fehler" && <span className="text-xs text-amber-300">Kopieren nicht möglich — markiere den Code und kopiere ihn selbst.</span>}
    </div>
  );
}
