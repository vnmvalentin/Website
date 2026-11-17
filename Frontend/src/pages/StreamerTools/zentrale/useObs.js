// useObs.js — Verbindung der Streamer-Zentrale zu OBS: verbinden, Szene wählen, Quellen anlegen/aktualisieren.
//
// Gemerkt wird im Browser nur der Port und — wenn ausdrücklich gewünscht — das Passwort (localStorage, nur dieses
// Gerät). Mit der Website hat beides nichts zu tun: die Verbindung läuft vom Browser direkt zu OBS.
import { useCallback, useEffect, useRef, useState } from "react";
import { connectObs, localAccessDenied, OBS_DEFAULT_PORT } from "./obsClient";
import { obsInfo, inspectSources, ensureSource, sourceSize } from "./obsSetup";

const STORE_KEY = "obsVerbindung";

/** Gemerkte Verbindung: { port, password?, remember } */
export function loadObsPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && typeof raw === "object") {
      return { port: Number(raw.port) || OBS_DEFAULT_PORT, password: raw.password || "", remember: !!raw.password };
    }
  } catch { /* Speicher gesperrt oder kaputt */ }
  return { port: OBS_DEFAULT_PORT, password: "", remember: false };
}

function saveObsPrefs({ port, password, remember }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(remember ? { port, password } : { port }));
  } catch { /* ohne Merken weiter */ }
}

/**
 * @returns {{ phase: "idle"|"connecting"|"connected"|"error", error: string|null, info: object|null, scene: string,
 *   setScene: Function, sources: object, connect: Function, disconnect: Function, inspect: Function, ensure: Function }}
 */
export function useObs() {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [scene, setScene] = useState("");
  const [sources, setSources] = useState({});
  const client = useRef(null);

  useEffect(() => () => { if (client.current) client.current.close(); }, []);

  const connect = useCallback(async ({ port, password, remember }) => {
    setPhase("connecting");
    setError(null);
    saveObsPrefs({ port, password, remember });
    try {
      const c = await connectObs({ port, password });
      client.current = c;
      c.onClose(() => {
        client.current = null;
        setPhase("idle");
        setInfo(null);
        setSources({});
      });
      const i = await obsInfo(c.request);
      setInfo(i);
      setScene((s) => (s && i.scenes.includes(s) ? s : i.currentScene));
      setPhase("connected");
      return true;
    } catch (e) {
      // Scheitert die Verbindung und hat der Browser den Zugriff verboten, ist das die Ursache
      const code = e.code === "unreachable" && (await localAccessDenied()) ? "blocked" : e.code || "unreachable";
      setError(code);
      setPhase("error");
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (client.current) client.current.close();
    client.current = null;
    setPhase("idle");
    setInfo(null);
    setSources({});
  }, []);

  /** Unsere Quellen in OBS mit den aktuellen Links abgleichen. expected: Werkzeug → volle Overlay-Adresse */
  const inspect = useCallback(async (expected) => {
    if (!client.current) return;
    try {
      setSources(await inspectSources(client.current.request, expected));
    } catch { /* Abgleich ist Zugabe */ }
  }, []);

  /**
   * Quelle anlegen oder aktualisieren.
   * @returns {Promise<{ ok: true, action: string } | { ok: false, error: string }>}
   */
  const ensure = useCallback(async ({ tool, url, wtSettings }) => {
    if (!client.current || !info) return { ok: false, error: "closed" };
    try {
      const r = await ensureSource(client.current.request, {
        tool, url, scene, size: sourceSize(tool, info.canvas, wtSettings),
      });
      setSources((s) => ({ ...s, [tool]: { exists: true, upToDate: true } }));
      return { ok: true, action: r.action };
    } catch (e) {
      return { ok: false, error: e.code || "failed" };
    }
  }, [info, scene]);

  return { phase, error, info, scene, setScene, sources, connect, disconnect, inspect, ensure };
}
