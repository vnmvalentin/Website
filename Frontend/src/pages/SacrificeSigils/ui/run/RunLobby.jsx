// ui/run/RunLobby.jsx — Lobby der Moorwanderung: 2–6 Plätze als Wachssiegel, Einstellungen (Host), Bereit-Knöpfe.
import React, { useState } from "react";
import { Copy, Check, Eye } from "lucide-react";
import { de } from "../../i18n/de.js";
import { sound } from "../../audio/sound.js";
import { ZIRKEL } from "../../engine/zirkel/index.js";
import { SealPortrait } from "../screens/LobbyScreen.jsx";

const OPTIONS = {
  players: [2, 3, 4, 5, 6].map((n) => [n, `${n} Zeichner`]),
  seals: [[2, "2"], [3, "3"], [4, "4"]],
  pathsPerRound: [["auto", "automatisch (2, ab 5 Spielern 1)"], [1, "1"], [2, "2"], [3, "3"]],
  pathLength: [["short", "kurz (4 Knoten)"], ["normal", "normal (6)"], ["long", "lang (8)"]],
  oddMode: [["mirror", "Spiegelgeist (Kopie eines Mitspieler-Decks)"], ["lord", "Moorfürst (starker NPC)"]],
  hardBoss: [[false, "aus"], [true, "an („Hart“)"]],
  pace: [["relaxed", "entspannt"], ["normal", "normal"], ["fast", "schnell"]],
  zirkel: Object.values(ZIRKEL).map((z) => [z.id, z.name]),
  spectators: [[true, "ja"], [false, "nein"]],
};

/** @param {{ game: any, code: string }} props */
export default function RunLobby({ game, code }) {
  const { room, you, lobby } = game;
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(/** @type {string|null} */ (null));
  const isHost = you !== null && you === room.hostSeat;
  const link = `${window.location.origin}/sacrifice-and-sigils/moorwanderung/${code}`;
  const mine = you !== null ? room.seats[you] : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      sound.play("seal");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ohne Zwischenablage */ }
  };

  const change = async (key, value) => {
    const res = await lobby.setSettings({ [key]: value });
    setErr(res?.ok === false ? (res.error === "tooManySeated" ? "Es sitzen schon mehr Zeichner am Tisch." : "Ging nicht.") : null);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
      <div className="ss-panel p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="ss-dim text-sm">{de.run.title} · Raum</p>
            <p className="ss-title text-3xl tracking-[0.25em]">{code}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ss-btn" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? de.ui.copied : de.ui.copyLink}</button>
            <span className="ss-dim text-sm flex items-center gap-1"><Eye size={15} /> {room.spectators} {de.ui.spectators}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {room.seats.map((s, i) => (
            <SealPortrait key={i} name={s?.name} ready={s?.ready} connected={s?.connected} host={room.hostSeat === i && !!s} you={you === i} empty={!s} />
          ))}
        </div>
        {you !== null && (
          <div className="mt-7 flex flex-col items-center gap-2">
            <button type="button" className="ss-seal min-w-[200px]" onClick={() => { sound.play("seal"); lobby.setReady(!mine?.ready); }}>
              {mine?.ready ? de.ui.notReady : de.ui.ready}
            </button>
            <p className="text-sm ss-dim">Der Run beginnt, sobald alle Plätze besetzt und alle bereit sind.</p>
          </div>
        )}
        {you === null && <p className="mt-6 text-center ss-dim">Du schaust zu.</p>}
      </div>

      <div className="ss-paper p-5 md:p-7">
        <p className="ss-title !text-[var(--ink)] text-xl mb-4">{de.ui.settings}{!isHost && <span className="text-sm opacity-60"> – wählt der Gastgeber</span>}</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {Object.entries(OPTIONS).map(([key, opts]) => (
            <label key={key} className="block">
              <span className="text-sm opacity-75">{de.run.settings[key]}</span>
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
        </div>
        {err && <p className="mt-3 text-[var(--wax-red)]" role="alert">{err}</p>}
        <p className="mt-4 text-sm opacity-70">
          Jeder geht allein über dieselbe Karte, kämpft gegen die Bewohner und baut sein Deck aus. Nach den Pfaden einer Runde
          treffen alle im Duell aufeinander: Wer verliert, verliert ein Lebenssiegel. Der letzte Zeichner mit Siegeln gewinnt.
        </p>
      </div>
    </div>
  );
}
