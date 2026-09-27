// ui/screens/LobbyScreen.jsx — Lobby: Einstellungen (Host wählt, beide sehen sie), Wachssiegel-Porträts, Bereit-Knöpfe.
import React, { useState } from "react";
import { Copy, Check, Eye, Crown } from "lucide-react";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { CheckMark } from "../icons/GameIcons.jsx";

const OPTIONS = {
  draftMode: [["shared", "Gemeinsamer Pool (Snake-Draft)"], ["separate", "Getrennte Pools (gespiegelt)"]],
  winsNeeded: [[1, "1 (Best-of-1)"], [2, "2 Siege (Best-of-3)"], [3, "3 Siege (Best-of-5)"]],
  turnTimer: [[45, "45 s"], [60, "60 s"], [90, "90 s"], [0, "aus"]],
  pathLength: [[2, "kurz (2 Knoten)"], [3, "normal (3)"], [4, "lang (4)"]],
  spectators: [[true, "ja"], [false, "nein"]],
};
const LABELS = { draftMode: "Draft-Modus", winsNeeded: "Siege nötig", turnTimer: "Zug-Timer", pathLength: "Pfad-Länge", spectators: "Zuschauer erlauben" };

/** Wachssiegel-Porträt. */
export function SealPortrait({ name, ready, connected, host, you, empty }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className={`flex flex-col items-center gap-2 ${empty ? "opacity-40" : ""}`}>
      <div className="relative">
        <div
          className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center ss-title text-3xl md:text-4xl"
          style={{
            color: "#f7e6d0",
            background: empty
              ? "radial-gradient(circle, #3a2d20, #1e140d)"
              : "radial-gradient(ellipse at 35% 30%, rgb(255 255 255 / 0.25), transparent 45%), radial-gradient(circle, #b3302a, #8e1b1b 60%, #5c0f0f)",
            borderRadius: "47% 53% 50% 50% / 52% 48% 52% 48%",
            boxShadow: "inset 0 -5px 10px rgb(0 0 0 / 0.35), 0 8px 18px rgb(0 0 0 / 0.5)",
            filter: connected === false ? "grayscale(0.8) brightness(0.6)" : undefined,
          }}
        >
          {empty ? "?" : initial}
        </div>
        {host && <Crown size={18} className="absolute -top-2 -right-1 text-[var(--brass-light)]" aria-label={de.ui.host} />}
      </div>
      <div className="text-center">
        <p className="ss-title text-lg leading-tight">{empty ? de.ui.waitingOpponent : name}{you && <span className="ss-faint text-sm"> ({de.ui.you})</span>}</p>
        {!empty && (
          <p className={`text-sm ${ready ? "text-[var(--candle)]" : "ss-faint"}`}>
            {connected === false ? de.ui.connectionLost : ready ? <span className="inline-flex items-center gap-1"><CheckMark size={14} />{de.ui.ready}</span> : de.ui.notReady}
          </p>
        )}
      </div>
    </div>
  );
}

/** @param {{ game: any, code: string }} props */
export default function LobbyScreen({ game, code }) {
  const { room, you, lobby } = game;
  const [copied, setCopied] = useState(false);
  const [seedDraft, setSeedDraft] = useState(room.seedInput || "");
  const isHost = you !== null && you === room.hostSeat;
  const link = `${window.location.origin}/sacrifice-and-sigils/raum/${code}`;
  const mine = you !== null ? room.seats[you] : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      sound.play("seal");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ohne Zwischenablage */ }
  };

  const change = (key, value) => lobby.setSettings({ [key]: value });

  return (
    <div className="max-w-[980px] mx-auto px-4 py-8 space-y-6">
      <div className="ss-panel p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="ss-dim text-sm">Raum</p>
            <p className="ss-title text-3xl tracking-[0.25em]">{code}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ss-btn" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? de.ui.copied : de.ui.copyLink}</button>
            <span className="ss-dim text-sm flex items-center gap-1"><Eye size={15} /> {room.spectators} {de.ui.spectators}</span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {[0, 1].map((i) => (
            <React.Fragment key={i}>
              {i === 1 && <span className="ss-title text-2xl ss-faint">gegen</span>}
              <SealPortrait
                name={room.seats[i]?.name}
                ready={room.seats[i]?.ready}
                connected={room.seats[i]?.connected}
                host={room.hostSeat === i && !!room.seats[i]}
                you={you === i}
                empty={!room.seats[i]}
              />
            </React.Fragment>
          ))}
        </div>
        {you !== null && (
          <div className="mt-7 flex justify-center">
            <button type="button" className="ss-seal min-w-[200px]" onClick={() => { sound.play("seal"); lobby.setReady(!mine?.ready); }}>
              {mine?.ready ? de.ui.notReady : de.ui.ready}
            </button>
          </div>
        )}
        {you === null && <p className="mt-6 text-center ss-dim">Du schaust zu. Das Match beginnt, sobald beide Zeichner bereit sind.</p>}
      </div>

      <div className="ss-paper p-5 md:p-7">
        <p className="ss-title !text-[var(--ink)] text-xl mb-4">{de.ui.settings}{!isHost && <span className="text-sm ss-ink opacity-60"> – wählt der Gastgeber</span>}</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {Object.entries(OPTIONS).map(([key, opts]) => (
            <label key={key} className="block">
              <span className="text-sm opacity-75">{LABELS[key]}</span>
              <select
                className="ss-select w-full mt-1"
                value={String(room.settings[key])}
                disabled={!isHost}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === "true" ? true : raw === "false" ? false : Number.isNaN(Number(raw)) ? raw : Number(raw);
                  change(key, val);
                }}
              >
                {opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
              </select>
            </label>
          ))}
          <label className="block">
            <span className="text-sm opacity-75">{de.ui.seed}</span>
            <div className="flex gap-2 mt-1">
              <input
                className="ss-input uppercase ss-num"
                value={isHost ? seedDraft : room.seedInput || ""}
                placeholder={de.ui.randomSeed}
                disabled={!isHost}
                maxLength={24}
                onChange={(e) => setSeedDraft(e.target.value.toUpperCase())}
                onBlur={() => isHost && lobby.setSettings({}, seedDraft)}
              />
              {isHost && <button type="button" className="ss-btn ss-btn-sm" onClick={() => { setSeedDraft(""); lobby.setSettings({}, ""); }}>{de.ui.randomSeed}</button>}
            </div>
          </label>
        </div>
        <p className="mt-4 text-sm opacity-70">Ändert der Gastgeber etwas, müssen beide erneut „Bereit“ drücken.</p>
      </div>
    </div>
  );
}
