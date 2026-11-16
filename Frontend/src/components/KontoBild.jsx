// components/KontoBild.jsx — Bild eines Kontos (Twitch- oder Discord-Bild), sonst der Anfangsbuchstabe des Namens.
import React from "react";

/**
 * @param {object} props
 * @param {{ name?: string, avatar?: string|null }} props.konto
 * @param {string} [props.className]  Größe und Rundung, z. B. "w-8 h-8 rounded-lg"
 * @param {string} [props.schrift]    Schriftgröße des Buchstabens (zur Größe passend, z. B. "text-3xl" bei w-20)
 */
export default function KontoBild({ konto, className = "w-8 h-8 rounded-lg", schrift = "text-sm" }) {
  if (konto?.avatar) return <img src={konto.avatar} alt="" className={`${className} object-cover`} />;
  const buchstabe = String(konto?.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden="true"
      className={`${className} ${schrift} flex items-center justify-center bg-accent/20 border border-accent/30 text-accent-soft font-bold select-none`}>
      {buchstabe}
    </span>
  );
}
