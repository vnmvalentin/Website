// src/components/TwitchAuthContext.jsx
import React, { createContext, useEffect, useState } from "react";

export const TwitchAuthContext = createContext();

const USER_STORAGE_KEY = "twitchUser";
const TOKEN_STORAGE_KEY = "twitchAccessToken";
const RETURN_KEY = "twitchReturnTo";

export default function TwitchAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const redirectUri = window.location.origin + "/auth/twitch";
  // helper
  const clearAuth = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    setUser(null);
    setAccessToken(null);
  };

  // ✅ Backend-Session check (Cookie)
  const syncBackendSession = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        // Cookie-Session ist weg/ungültig -> Frontend auch ausloggen
        clearAuth();
        return null;
      }
      return await res.json(); // { twitchId, twitchLogin }
    } catch {
      return null;
    }
  };


  // Twitch Client ID vom Backend holen
  useEffect(() => {
    console.log("[TwitchAuth] Hole Twitch Client ID…");
    fetch("/api/twitch/clientid")
      .then((r) => r.json())
      .then((data) => {
        console.log("[TwitchAuth] Client ID vom Backend:", data.clientId);
        setClientId(data.clientId);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Fehler beim Laden der Twitch Client ID:", err);
        setLoading(false);
      });
  }, []);

  // Login-Flow + Restore aus localStorage
  useEffect(() => {
    if (!clientId) return;

    const hash = window.location.hash;
    console.log("[TwitchAuth] Aktueller Hash:", hash);

    // 1) Gerade von Twitch zurückgekommen
    if (hash.includes("access_token")) {
      const token = new URLSearchParams(hash.substring(1)).get("access_token");
      console.log("[TwitchAuth] Access Token gefunden:", !!token);

      if (!token) return;

      (async () => {
        try {
          // Session im Backend setzen
          const sessRes = await fetch("/api/auth/twitch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
            credentials: "include",
          });

          console.log("[TwitchAuth] /api/auth/twitch Antwort:", sessRes.status);
          if (!sessRes.ok) {
            throw new Error("Backend-Authentifizierung fehlgeschlagen");
          }

          // Userdaten von Twitch holen
          const userRes = await fetch("https://api.twitch.tv/helix/users", {
            headers: {
              "Client-ID": clientId,
              Authorization: `Bearer ${token}`,
            },
          });
          const data = await userRes.json();
          console.log("[TwitchAuth] Helix /users Antwort:", data);

          const u = data.data?.[0];
          if (!u) throw new Error("Kein User von Twitch erhalten");

          try {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
            localStorage.setItem(TOKEN_STORAGE_KEY, token);
            console.log(
              "[TwitchAuth] User + Token in localStorage gespeichert",
              USER_STORAGE_KEY,
              TOKEN_STORAGE_KEY
            );
          } catch (e) {
            console.error(
              "[TwitchAuth] Konnte Daten nicht in localStorage speichern:",
              e
            );
          }

          setUser(u);
          setAccessToken(token);
          await syncBackendSession();
          console.log("[TwitchAuth] Login erfolgreich, User gesetzt:", u);

          // Hash aus URL entfernen
          const cleanUrl = window.location.pathname + window.location.search;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (err) {
          console.error("Login-Flow fehlgeschlagen:", err);
        }
      })();

      return; // danach nicht mehr weiter im else-Zweig
    }

    // 2) Kein frischer Token: User + Token aus localStorage wiederherstellen
    const savedUserStr = localStorage.getItem(USER_STORAGE_KEY);
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    console.log("[TwitchAuth] savedUser aus localStorage:", savedUserStr);
    console.log("[TwitchAuth] savedToken aus localStorage:", !!savedToken);

    if (savedUserStr && savedToken) {
      try {
        const u = JSON.parse(savedUserStr);
        if (u && u.id) {
          console.log(
            "[TwitchAuth] Stelle User + Token aus localStorage wieder her:",
            u
          );
          setUser(u);
          setAccessToken(savedToken);
          syncBackendSession();
        } else {
          console.warn(
            "[TwitchAuth] Gespeicherter User ungültig, lösche Storage."
          );
          localStorage.removeItem(USER_STORAGE_KEY);
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      } catch (e) {
        console.error(
          "[TwitchAuth] Fehler beim Lesen von twitchUser aus localStorage:",
          e
        );
        localStorage.removeItem(USER_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } else {
      console.log(
        "[TwitchAuth] Kein twitchUser oder kein Token in localStorage gefunden."
      );
    }
  }, [clientId]);

  useEffect(() => {
    const onFocus = () => syncBackendSession();
    const onVis = () => { if (!document.hidden) syncBackendSession(); };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Login starten
  const login = (force = false) => {
    if (!clientId) {
      alert("Twitch Client ID noch nicht geladen.");
      return;
    }

    const currentPath = window.location.pathname + window.location.search;
    sessionStorage.setItem(RETURN_KEY, currentPath);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      // ⬇️ NEU: Follows-Scopes dazu
      scope: "user:read:email user:read:follows",
    });

    if (force) params.append("force_verify", "true");

    const url =
      "https://id.twitch.tv/oauth2/authorize?" + params.toString();

    console.log("[TwitchAuth] Leite zu Twitch weiter:", url);
    window.location.href = url;
  };

  // Logout
  const logout = () => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearAuth();
    alert("Du wurdest ausgeloggt. Beim nächsten Login kannst du einen anderen Twitch-Account wählen.");
  };

  if (loading) {
    console.log("[TwitchAuth] Noch am Laden, rendere nichts.");
    return null;
  }

  console.log("[TwitchAuth] Render mit user:", user);

  return (
    <TwitchAuthContext.Provider
      value={{ user, login, logout, clientId, accessToken }}
    >
      {children}
    </TwitchAuthContext.Provider>
  );
}
