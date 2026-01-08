// ClipQueue.jsx
import React, { useEffect, useState, useRef, useContext } from "react";
// Importieren des Contexts
import { TwitchAuthContext } from "../components/TwitchAuthContext";

// Hilfsfunktionen
function extractUrls(text) {
  const regex = /(https?:\/\/[^\s]+)/g;
  return text.match(regex) || [];
}

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("twitch.tv")) return "twitch";
  if (u.includes("kick.com")) return "kick";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return "other";
}

export default function ClipQueue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("player"); 

  // HIER: Context nutzen statt lokalem State 'me'
  const { user } = useContext(TwitchAuthContext);

  const clientRef = useRef(null);
  const configRef = useRef({
    enabled: false,
    allowedPlatforms: {},
  });

  const queue = data?.queue || [];
  const current = queue[0] || null;
  const allowed = data?.allowedPlatforms || {};

  // Queue vom Backend laden (nur wenn eingeloggt)
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clipqueue/me", {
        credentials: "include",
      });

      if (res.status === 401) {
        setError(
          "Bitte melde dich mit Twitch an, um deine Clip-Queue zu verwalten."
        );
        setData(null);
      } else if (!res.ok) {
        setError("Konnte Clip-Queue nicht laden.");
      } else {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      setError("Netzwerkfehler beim Laden der Clip-Queue.");
    } finally {
      setLoading(false);
    }
  }

  // Wenn der User über den Context verfügbar ist -> Queue laden
  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // user object as dependency

  // ConfigRef immer aktuell halten
  useEffect(() => {
    configRef.current = {
      enabled: !!data?.enabled,
      allowedPlatforms: data?.allowedPlatforms || {},
    };
  }, [data?.enabled, JSON.stringify(data?.allowedPlatforms || {})]);

  async function updateConfig(partial) {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/clipqueue/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled:
            typeof partial.enabled === "boolean"
              ? partial.enabled
              : data.enabled,
          allowedPlatforms: partial.allowedPlatforms || data.allowedPlatforms,
          maxDurationSec: data.maxDurationSec, 
        }),
      });

      if (!res.ok) {
        setError("Konnte Einstellungen nicht speichern.");
      } else {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      setError("Netzwerkfehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    await updateConfig({});
  }

  async function toggleEnabled() {
    if (!data) return;
    await updateConfig({ enabled: !data.enabled });
  }

  async function skipCurrent() {
    setSkipping(true);
    setError(null);
    try {
      const res = await fetch("/api/clipqueue/me/skip", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setError("Konnte Clip nicht überspringen.");
      } else {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      setError("Netzwerkfehler beim Überspringen.");
    } finally {
      setSkipping(false);
    }
  }

  // tmi-Client: EINMAL pro User Login
  useEffect(() => {
    if (!user?.twitchLogin) return;
    if (typeof window === "undefined") return;

    let disposed = false;
    let client;

    (async () => {
      const mod = await import("tmi.js");
      const tmi = mod.default ?? mod; 

      if (disposed) return;

      client = new tmi.Client({
        options: { debug: true },
        connection: { secure: true, reconnect: true },
        channels: [user.twitchLogin], // Zugriff über Context-User
      });

    clientRef.current = client;

    client.on("connected", (addr, port) => {
      console.log("Mit Twitch-Chat verbunden:", addr, port);
    });

    client.on("message", async (channel, tags, message, self) => {
      const cfg = configRef.current;
      if (self || !cfg.enabled) return;

      const urls = extractUrls(message);
      if (!urls.length) return;

      for (const url of urls) {
        const platform = detectPlatform(url);
        if (!cfg.allowedPlatforms[platform]) continue;

        const durationSec = 0; 

        try {
          const res = await fetch("/api/clipqueue/me/clip", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              platform,
              durationSec,
              title: "",
              submittedBy:
                tags["display-name"] || tags["username"] || "Chat",
            }),
          });

          const json = await res.json();
          if (json.added) {
            load();
          }
        } catch (e) {
          console.error("Fehler beim Senden des Clips:", e);
        }
      }
    });

      await client.connect();
    })();

    return () => {
      disposed = true;
      client?.disconnect?.().catch(() => {});
    };
  }, [user?.twitchLogin]);

  // Player Render (unverändert, nur Code-Kürzung für Übersicht)
  function renderPlayer() {
    const url = current?.url || "";
    const platform = current?.platform || "other";
    const isYoutubeShort = url.includes("youtube.com/shorts/");
    const isVertical = platform === "tiktok" || platform === "instagram" || isYoutubeShort;
    let embedSrc = null;

    if (current && typeof window !== "undefined") {
        if (platform === "youtube") {
            let videoId = null;
            const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/);
            const watchMatch = url.match(/[?&]v=([^?&/]+)/);
            const youtuMatch = url.match(/youtu\.be\/([^?&/]+)/);
            if (shortsMatch) videoId = shortsMatch[1];
            else if (watchMatch) videoId = watchMatch[1];
            else if (youtuMatch) videoId = youtuMatch[1];
            if (videoId) embedSrc = `https://www.youtube.com/embed/${videoId}`;
        } else if (platform === "twitch") {
            const match = url.match(/clip\/([^/?]+)/i);
            const slug = match ? match[1] : null;
            const parent = window.location.hostname;
            if (slug && parent) embedSrc = `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}`;
        } else if (platform === "tiktok") {
            const match = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
            const videoId = match ? match[1] : null;
            if (videoId) embedSrc = `https://www.tiktok.com/player/v1/${videoId}?controls=1`;
        } else if (platform === "instagram") {
            const match = url.match(/instagram\.com\/(?:reel|reels|p)\/([^/?]+)/);
            const shortcode = match ? match[1] : null;
            if (shortcode) embedSrc = `https://www.instagram.com/p/${shortcode}/embed`;
        } else if (platform === "kick") {
             embedSrc = url; // Vereinfacht für dieses Snippet
        }
    }

    return (
      <div className="space-y-3">
        <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
          <div className="relative w-full aspect-video bg-black flex items-center justify-center">
            {!current ? (
              <div className="flex flex-col items-center justify-center text-sm text-white/60 text-center px-4">
                <div>Noch kein Clip ausgewählt.</div>
                <div className="text-xs mt-1">Aktiviere die Clip-Queue...</div>
              </div>
            ) : embedSrc ? (
               <iframe
                  title="Clip"
                  src={embedSrc}
                  className={`absolute inset-0 w-full h-full ${isVertical ? 'max-w-[56vh] mx-auto' : ''}`} // Kleiner CSS tweak für Vertical
                  allowFullScreen
                />
            ) : (
                <div className="text-white/60 text-sm p-4 text-center">Kein Embed möglich: <a href={url} target="_blank" className="text-violet-400">{url}</a></div>
            )}
          </div>
        </div>

        {current && (
          <>
            <div className="space-y-1 text-sm">
                <div className="font-medium text-white">{current.title}</div>
                <div className="text-xs text-white/60">von {current.submittedBy}</div>
            </div>
            <button
              onClick={skipCurrent}
              disabled={skipping || queue.length === 0}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/90 px-4 py-2 text-sm font-semibold hover:bg-red-500"
            >
              {skipping ? "Überspringe…" : "Clip überspringen"}
            </button>
          </>
        )}
      </div>
    );
  }

  // Fallback für Loading ohne User
  if (loading && !data && user) {
    return <div className="text-center p-8 text-white/80">Lade Clip-Queue…</div>;
  }
  
  // Wenn nicht eingeloggt
  if (!user) {
       // Hier muss kein Button mehr hin, der ist jetzt im Header.
       // Wir zeigen einfach einen Hinweis an.
       return (
        <div className="text-center p-8 mt-10">
            <h2 className="text-2xl font-bold mb-2">Clip-Queue</h2>
            <p className="text-white/60">Bitte oben rechts einloggen, um die Queue zu nutzen.</p>
        </div>
       );
  }

  return (
    <div className="min-h-full space-y-10">
      <header className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold">Clip-Queue</h1>
          <p className="text-white/70 text-sm mt-1 max-w-xl">
            Twitch, Kick, YouTube, TikTok, Instagram Clips sammeln.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-white/5 p-1 border border-white/10">
            <button onClick={() => setTab("player")} className={`px-4 py-1.5 text-sm rounded-lg ${tab === "player" ? "bg-violet-600 text-white" : "text-white/70 hover:bg-white/10"}`}>Player</button>
            <button onClick={() => setTab("settings")} className={`px-4 py-1.5 text-sm rounded-lg ${tab === "settings" ? "bg-violet-600 text-white" : "text-white/70 hover:bg-white/10"}`}>Einstellungen</button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {data && (
        <>
          {tab === "player" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              <div className="space-y-4 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">Player</h2>
                  <button onClick={toggleEnabled} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${data.enabled ? "bg-red-600/90" : "bg-emerald-600/90"}`}>
                    {data.enabled ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </div>
                {renderPlayer()}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/60 p-5 space-y-3 md:col-span-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Warteschlange</h2>
                  <span className="text-xs text-white/60">{queue.length} Clips</span>
                </div>
                {queue.length <= 1 ? (
                    <p className="text-sm text-white/60">Warteschlange leer.</p>
                ) : (
                  <ul className="space-y-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
                    {queue.slice(1).map((clip) => (
                      <li key={clip.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                         <div className="font-medium text-white truncate">{clip.title || clip.url}</div>
                         <div className="text-xs text-white/60">{clip.platform} • {Math.round(clip.durationSec)}s</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="rounded-2xl border border-white/10 bg-black/60 p-5 space-y-4">
               {/* ... Settings Code wie gehabt ... */}
               <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {/* ... Checkboxen ... */}
                    {Object.keys(allowed).map(k => (
                        <label key={k} className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/10">
                            <input type="checkbox" checked={allowed[k]} onChange={() => setData(d => ({...d, allowedPlatforms: {...d.allowedPlatforms, [k]: !d.allowedPlatforms[k]}}))} />
                            {k}
                        </label>
                    ))}
               </div>
               <button onClick={saveConfig} disabled={saving} className="bg-violet-600 px-4 py-2 rounded-lg text-sm">{saving ? "..." : "Speichern"}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}