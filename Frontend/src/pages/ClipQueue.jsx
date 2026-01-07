import React, { useEffect, useState, useRef } from "react";

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
  const [loading, setLoading] = useState(false); // nur für Queue-Load
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("player"); // "player" | "settings"

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

  // Eingeloggten Twitch-User holen
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          setMe(json); // { twitchId, twitchLogin }
        } else if (res.status === 401) {
          setMe(null);
          setError(
            "Bitte melde dich mit Twitch an, um deine Clip-Queue zu nutzen."
          );
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Wenn wir eingeloggt sind -> Queue laden (fix für „nach Login noch mal reloaden“)
  useEffect(() => {
    if (!me?.twitchId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.twitchId]);

  // ConfigRef immer aktuell halten (ohne Client neu zu starten)
  useEffect(() => {
    configRef.current = {
      enabled: !!data?.enabled,
      allowedPlatforms: data?.allowedPlatforms || {},
    };
  }, [data?.enabled, JSON.stringify(data?.allowedPlatforms || {})]);

  // Settings ins Backend schreiben (PUT)
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
          maxDurationSec: data.maxDurationSec, // behält alten Wert im Backend
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

  // tmi-Client: EINMAL pro me.twitchLogin
  useEffect(() => {
    if (!me?.twitchLogin) return;
    if (typeof window === "undefined") return;

    let disposed = false;
    let client;

    (async () => {
      const mod = await import("tmi.js");
      const tmi = mod.default ?? mod; // CJS/ESM-safe

      if (disposed) return;

      client = new tmi.Client({
        options: { debug: true },
        connection: { secure: true, reconnect: true },
        channels: [me.twitchLogin],
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

      console.log("Chat-Nachricht:", {
        channel,
        user: tags["display-name"],
        message,
      });
      console.log("Gefundene URLs:", urls);

      for (const url of urls) {
        const platform = detectPlatform(url);
        if (!cfg.allowedPlatforms[platform]) {
          console.log("Plattform deaktiviert:", platform);
          continue;
        }

        const durationSec = 0; // zu lange Clips einfach manuell skippen

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
          console.log("Antwort vom Clip-Endpoint:", json);

          if (json.added) {
            // Queue im UI neu laden
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
  }, [me?.twitchLogin]);

  // Player-Embed für aktuellen Clip – leerer und voller Player sehen gleich aus
  function renderPlayer() {
    const url = current?.url || "";
    const platform = current?.platform || "other";

    // Shorts als "vertical" erkennen
    const isYoutubeShort = url.includes("youtube.com/shorts/");
    const isVertical =
      platform === "tiktok" || platform === "instagram" || isYoutubeShort;

    let embedSrc = null;

    if (current && typeof window !== "undefined") {
      if (platform === "youtube") {
        // YouTube: normal + Shorts
        let videoId = null;

        const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&/]+)/);
        const watchMatch = url.match(/[?&]v=([^?&/]+)/);
        const youtuMatch = url.match(/youtu\.be\/([^?&/]+)/);

        if (shortsMatch) videoId = shortsMatch[1];
        else if (watchMatch) videoId = watchMatch[1];
        else if (youtuMatch) videoId = youtuMatch[1];

        if (videoId) {
          embedSrc = `https://www.youtube.com/embed/${videoId}`;
        }
      } else if (platform === "twitch") {
        const match = url.match(/clip\/([^/?]+)/i);
        const slug = match ? match[1] : null;
        const parent = window.location.hostname;
        if (slug && parent) {
          embedSrc = `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}`;
        }
      } else if (platform === "tiktok") {
        const match = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
        const videoId = match ? match[1] : null;
        if (videoId) {
          // Offizieller TikTok-Player mit Controls
          embedSrc = `https://www.tiktok.com/player/v1/${videoId}?controls=1`;
        }
      } else if (platform === "instagram") {
        // Reels / Reels-Links auf Shortcode reduzieren
        const match = url.match(/instagram\.com\/(?:reel|reels|p)\/([^/?]+)/);
        const shortcode = match ? match[1] : null;
        if (shortcode) {
            // /p/<shortcode>/embed wird oft wie ein normaler Post mit Video gerendert
            embedSrc = `https://www.instagram.com/p/${shortcode}/embed`;
        }
      } else if (platform === "kick") {
        // Kick-Clip:
        // 1) https://kick.com/<user>?clip=<clip_id>
        // 2) https://kick.com/<user>/clips/<clip_id>
        const qMatch = url.match(/kick\.com\/([^\/\?]+)\?clip=([^&]+)/);
        const clipsMatch = url.match(
          /kick\.com\/([^\/\?]+)\/clips\/([^\/\?]+)/
        );

        if (qMatch) {
          const user = qMatch[1];
          const clipId = qMatch[2];
          embedSrc = `https://kick.com/${user}?clip=${clipId}`;
        } else if (clipsMatch) {
          const user = clipsMatch[1];
          const clipId = clipsMatch[2];
          embedSrc = `https://kick.com/${user}?clip=${clipId}`;
        } else {
          // Fallback: komplette URL einbetten
          embedSrc = url;
        }
      }
    }

    return (
      <div className="space-y-3">
        {/* IMMER dieselbe 16:9-Card – egal ob Clip vorhanden oder nicht */}
        <div className="rounded-2xl overflow-hidden bg-black border border-white/10">
          <div className="relative w-full aspect-video bg-black flex items-center justify-center">
            {!current ? (
              <div className="flex flex-col items-center justify-center text-sm text-white/60 text-center px-4">
                <div>Noch kein Clip ausgewählt.</div>
                <div className="text-xs mt-1">
                  Aktiviere die Clip-Queue und lass deinen Chat Clip-Links posten –
                  sie erscheinen automatisch hier im Player.
                </div>
              </div>
            ) : embedSrc ? (
              isVertical ? (
                // Vertical: 9:16-Container mittig -> schwarze Ränder links/rechts, kein Gap oben/unten
                <div className="relative h-full aspect-[9/16]">
                  <iframe
                    title={current.title || `${platform} Clip`}
                    src={embedSrc}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              ) : (
                // Normal 16:9
                <iframe
                  title={current.title || `${platform} Clip`}
                  src={embedSrc}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-sm text-white/60 text-center">
                {platform === "kick" ? (
                  <>
                    Kick-Clip konnte nicht als Embed geladen werden.
                    <br />
                    <span className="text-xs opacity-80">
                      Öffne den Clip im neuen Tab:
                    </span>
                  </>
                ) : (
                  <>
                    Für diese Plattform konnte kein Embed geladen werden.
                    <br />
                    <span className="text-xs opacity-80">
                      Öffne den Clip im neuen Tab.
                    </span>
                  </>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-violet-300 hover:underline break-all"
                >
                  {url}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Meta + Skip-Button nur anzeigen, wenn wir wirklich einen aktuellen Clip haben */}
        {current && (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className="px-2 py-0.5 rounded-full bg-white/10">
                  {platform}
                </span>
                {current.durationSec ? (
                  <span>{Math.round(current.durationSec)}s</span>
                ) : null}
              </div>
              {current.title ? (
                <div className="font-medium text-white">{current.title}</div>
              ) : null}
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-violet-300 hover:underline break-all"
              >
                {url}
              </a>
              {current.submittedBy ? (
                <div className="text-xs text-white/60">
                  von{" "}
                  <span className="font-medium">{current.submittedBy}</span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={skipCurrent}
              disabled={skipping || queue.length === 0}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/90 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {skipping ? "Überspringe…" : "Clip überspringen"}
            </button>
          </>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return <div className="text-center p-8 text-white/80">Lade Clip-Queue…</div>;
  }

  return (
    <div className="min-h-full space-y-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold">Clip-Queue</h1>
          <p className="text-white/70 text-sm mt-1 max-w-xl">
            Filtert Clip-Links aus deinem Twitch-Chat (Twitch, Kick, YouTube,
            TikTok, Instagram) und sammelt sie in einer Queue, die du im Stream
            abarbeiten kannst.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="inline-flex rounded-xl bg-white/5 p-1 border border-white/10">
            {[
              ["player", "Player"],
              ["settings", "Einstellungen"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 text-sm rounded-lg ${
                  tab === id
                    ? "bg-violet-600 text-white"
                    : "text-white/70 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {!data ? null : (
        <>
          {tab === "player" && (
            // Player 2/3, Queue 1/3 → Player breiter, Queue schmaler
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              {/* Player + Haupt-Button */}
              <div className="space-y-4 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Player</h2>
                    <p className="text-xs text-white/60">
                      Spiele Clips direkt auf der Website ab.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleEnabled}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                      data.enabled
                        ? "bg-red-600/90 hover:bg-red-500"
                        : "bg-emerald-600/90 hover:bg-emerald-500"
                    }`}
                  >
                    {data.enabled
                      ? "Clip-Queue deaktivieren"
                      : "Clip-Queue aktivieren"}
                  </button>
                </div>

                {renderPlayer()}
              </div>

              {/* Warteschlange rechts */}
              <div className="rounded-2xl border border-white/10 bg-black/60 p-5 space-y-3 md:col-span-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Warteschlange</h2>
                  <span className="text-xs text-white/60">
                    {queue.length} Clips
                  </span>
                </div>

                {queue.length === 0 ? (
                  <p className="text-sm text-white/60">
                    Noch keine Clips in der Warteschlange.
                  </p>
                ) : queue.length === 1 ? (
                  <p className="text-sm text-white/60">
                    Nur der aktuelle Clip ist in der Queue.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
                    {queue.slice(1).map((clip) => (
                      <li
                        key={clip.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <span className="px-2 py-0.5 rounded-full bg-white/10">
                              {clip.platform}
                            </span>
                            {clip.durationSec ? (
                              <span>{Math.round(clip.durationSec)}s</span>
                            ) : null}
                          </div>
                          {clip.title ? (
                            <div className="font-medium text-white">
                              {clip.title}
                            </div>
                          ) : null}
                          <a
                            href={clip.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-violet-300 hover:underline break-all"
                          >
                            {clip.url}
                          </a>
                          {clip.submittedBy ? (
                            <div className="text-xs text-white/60">
                              von{" "}
                              <span className="font-medium">
                                {clip.submittedBy}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="rounded-2xl border border-white/10 bg-black/60 p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Einstellungen</h2>
                  <p className="text-xs text-white/60">
                    Bestimme, welche Plattformen Clips in deine Queue
                    einspeisen. Die Aktivierung machst du über den Button im
                    Player-Tab.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-white/80">
                    Erlaubte Plattformen
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {[
                      ["twitch", "Twitch"],
                      ["kick", "Kick"],
                      ["youtube", "YouTube / Shorts"],
                      ["tiktok", "TikTok"],
                      ["instagram", "Instagram Reels"],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-violet-500"
                          checked={!!allowed[key]}
                          onChange={() =>
                            setData((prev) => ({
                              ...prev,
                              allowedPlatforms: {
                                ...prev.allowedPlatforms,
                                [key]: !prev.allowedPlatforms?.[key],
                              },
                            }))
                          }
                        />
                        <span className="text-xs text-white/80">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveConfig}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Speichere…" : "Einstellungen speichern"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
