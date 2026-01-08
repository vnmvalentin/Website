// src/components/TwitchAuthContext.jsx
import React, { createContext, useEffect, useState } from "react";

export const TwitchAuthContext = createContext();

const USER_STORAGE_KEY = "twitchUser";
const TOKEN_STORAGE_KEY = "twitchAccessToken";
const RETURN_KEY = "twitchReturnTo";

// Hilfsfunktion: Einheitliche Datenstruktur erzwingen
function normalizeUser(u) {
  if (!u) return null;
  return {
    ...u, // Behalte Originalfelder (id, login, display_name etc.)
    
    // Mappe auf CamelCase für deine Komponenten
    displayName: u.display_name || u.displayName || u.login,
    profileImageUrl: u.profile_image_url || u.profileImageUrl,
    
    // Aliases für ID und Login (manche Komponenten nutzen twitchId/twitchLogin)
    id: u.id || u.twitchId,
    twitchId: u.id || u.twitchId,
    login: u.login || u.twitchLogin,
    twitchLogin: u.login || u.twitchLogin,
  };
}

export default function TwitchAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const redirectUri = window.location.origin + "/auth/twitch";

  const clearAuth = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    setUser(null);
    setAccessToken(null);
  };

  const syncBackendSession = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        clearAuth();
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  };

  // 1. Client ID laden
  useEffect(() => {
    fetch("/api/twitch/clientid")
      .then((r) => r.json())
      .then((data) => {
        setClientId(data.clientId);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Fehler beim Laden der Twitch Client ID:", err);
        setLoading(false);
      });
  }, []);

  // 2. Login-Logik & Restore
  useEffect(() => {
    if (!clientId) return;

    const hash = window.location.hash;

    // A) Frischer Login von Twitch (Redirect zurück zur Seite)
    if (hash.includes("access_token")) {
      const token = new URLSearchParams(hash.substring(1)).get("access_token");

      if (token) {
        (async () => {
          try {
            // Session im Backend setzen
            const sessRes = await fetch("/api/auth/twitch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
              credentials: "include",
            });

            if (!sessRes.ok) throw new Error("Backend-Auth fehlgeschlagen");

            // Userdaten von Helix laden
            const userRes = await fetch("https://api.twitch.tv/helix/users", {
              headers: {
                "Client-ID": clientId,
                Authorization: `Bearer ${token}`,
              },
            });
            const data = await userRes.json();
            const rawUser = data.data?.[0];

            if (!rawUser) throw new Error("Keine Userdaten erhalten");

            // HIER: Normalisieren bevor wir speichern
            const normalized = normalizeUser(rawUser);

            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
            localStorage.setItem(TOKEN_STORAGE_KEY, token);

            setUser(normalized);
            setAccessToken(token);
            await syncBackendSession();

            // URL bereinigen
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState({}, document.title, cleanUrl);
          } catch (err) {
            console.error("Login failed:", err);
          }
        })();
        return;
      }
    }

    // B) Restore aus localStorage
    const savedUserStr = localStorage.getItem(USER_STORAGE_KEY);
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (savedUserStr && savedToken) {
      try {
        const parsed = JSON.parse(savedUserStr);
        // Auch beim Laden sicherstellen, dass Struktur stimmt
        const normalized = normalizeUser(parsed);
        if (normalized && normalized.id) {
          setUser(normalized);
          setAccessToken(savedToken);
          syncBackendSession();
        } else {
          clearAuth();
        }
      } catch (e) {
        clearAuth();
      }
    }
  }, [clientId]);

  // Session-Check bei Fokus
  useEffect(() => {
    const check = () => { if (!document.hidden) syncBackendSession(); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  const login = (force = false) => {
    if (!clientId) return;
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "user:read:email user:read:follows",
    });
    if (force) params.append("force_verify", "true");

    window.location.href = "https://id.twitch.tv/oauth2/authorize?" + params.toString();
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearAuth();
    // Optional: Reload, um UI komplett zu resetten
    // window.location.reload(); 
  };

  if (loading) return null;

  return (
    <TwitchAuthContext.Provider value={{ user, login, logout, clientId, accessToken }}>
      {children}
    </TwitchAuthContext.Provider>
  );
}