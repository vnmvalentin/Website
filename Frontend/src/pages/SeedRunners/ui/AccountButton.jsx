// AccountButton.jsx — Anmelden mit Twitch in der Spielleiste (die Website-Kopfzeile mit ihrem Login fehlt in der Spiel-Hülle).
// Angemeldet braucht man es fürs Veröffentlichen, Melden und Moderieren; Sterne und Favoriten gehen dann aufs Konto über und
// gelten auf jedem Gerät (Backend/seedRunners/levelService.js voterOf). Ohne Anmeldung ist alles andere spielbar.
import React, { useContext, useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { TwitchAuthContext } from "../../../components/TwitchAuthContext";

export default function AccountButton() {
  const auth = useContext(TwitchAuthContext);
  const user = auth?.user || null;
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!auth) return null;
  if (!user) {
    return (
      <button type="button" onClick={() => auth.login?.()} className="sr-btn sr-btn-sm sr-btn-ghost" title="Mit Twitch anmelden — für Veröffentlichen und Favoriten auf jedem Gerät">
        <LogIn size={15} /><span className="hidden lg:inline">Anmelden</span>
      </button>
    );
  }
  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="sr-btn sr-btn-sm sr-btn-ghost !pl-1.5" title={user.display_name}>
        {user.profile_image_url
          ? <img src={user.profile_image_url} alt="" className="w-6 h-6 rounded-[2px]" />
          : <span className="w-6 h-6 rounded-[2px] bg-white/10" />}
        <span className="hidden lg:inline max-w-[120px] truncate normal-case tracking-normal">{user.display_name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 sr-panel px-4 py-3">
          <p className="sr-label mb-1">Angemeldet</p>
          <p className="sr-ink font-semibold truncate mb-2">{user.display_name}</p>
          <p className="text-xs sr-faint leading-relaxed mb-3">Deine Sterne und Favoriten gelten auf jedem Gerät.</p>
          <button type="button" onClick={() => { setOpen(false); auth.logout?.(); }} className="sr-btn sr-btn-sm sr-btn-ghost w-full">
            <LogOut size={14} />Abmelden
          </button>
        </div>
      )}
    </div>
  );
}
