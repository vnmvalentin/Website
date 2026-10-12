// src/components/TwitchAuthProvider.jsx
import React, { useEffect, useRef, useState } from "react";
import { TwitchAuthContext } from "./TwitchAuthContext";

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

// Gespeicherten Login synchron lesen — ohne Netzwerk, damit er schon beim ersten Rendern da ist.
function readStoredAuth() {
  try {
    const savedUserStr = localStorage.getItem(USER_STORAGE_KEY);
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!savedUserStr || !savedToken) return null;
    const normalized = normalizeUser(JSON.parse(savedUserStr));
    if (normalized && normalized.id) return { user: normalized, token: savedToken };
  } catch { /* kaputter Eintrag — wird unten entfernt */ }
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch { /* Speicher gesperrt */ }
  return null;
}

// Token aus dem Twitch-Redirect (/auth/twitch#access_token=…). Muss SOFORT gelesen werden:
// AuthTwitch.jsx navigiert nach 500 ms weiter, danach ist der Hash aus der Adresse weg.
function readHashToken() {
  const hash = window.location.hash;
  if (!hash.includes("access_token")) return null;
  return new URLSearchParams(hash.substring(1)).get("access_token");
}

export default function TwitchAuthProvider({ children }) {
  // Früher gab der Provider `null` zurück, bis /api/twitch/clientid geantwortet hatte, und
  // stellte den Login erst danach wieder her. Folge: Die vorgerenderte Seite wurde beim Start
  // von React erst einmal LEER gewischt (createRoot ersetzt den Inhalt von #root) und blieb es
  // für die Dauer der Anfrage; danach blitzte für Angemeldete noch kurz "Mit Twitch anmelden"
  // auf. Jetzt rendert die Seite sofort, und der gespeicherte Login steht ab dem ersten Bild.
  // Die Client-ID braucht nur noch, wer sich gerade anmeldet (login() und der Redirect-Fall).
  const [pendingToken] = useState(readHashToken);
  // Bei einem frischen Redirect bewusst leer starten — sonst stünde bei "Account wechseln"
  // kurz noch der alte Account da.
  const [stored] = useState(() => (pendingToken ? null : readStoredAuth()));
  const [user, setUser] = useState(stored ? stored.user : null);
  const [clientId, setClientId] = useState(null);
  const [accessToken, setAccessToken] = useState(stored ? stored.token : null);
  const loginHandled = useRef(false);

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
        // Nur abmelden, wenn der Server die Sitzung wirklich ablehnt. Ein 502/503/504 heißt
        // bloß, dass das Backend gerade nicht antwortet (Neustart beim Deploy) — früher flog
        // dabei jeder raus, dessen Tab in dem Moment den Fokus bekam.
        if (res.status === 401 || res.status === 403) clearAuth();
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
      .then((data) => setClientId(data.clientId))
      .catch((err) => console.error("Fehler beim Laden der Twitch Client ID:", err));
  }, []);

  // 2a. Wiederhergestellten Login gegen die Backend-Sitzung prüfen
  useEffect(() => {
    if (stored) syncBackendSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2b. Frischer Login von Twitch (Redirect zurück zur Seite)
  useEffect(() => {
    if (!clientId || !pendingToken || loginHandled.current) return;
    loginHandled.current = true;
    const token = pendingToken;

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
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Session-Check bei Fokus
  useEffect(() => {
    const check = () => { if (!document.hidden) syncBackendSession(); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  // Scopes, die jeder Login anfragt — bewusst minimal.
  const BASE_SCOPES = ["user:read:email", "user:read:follows"];

  /**
   * @param {boolean}  force        force_verify — erzwingt die Twitch-Bestätigungsseite
   * @param {string[]} extraScopes  Zusatzrechte, die nur einzelne Seiten brauchen
   *                                (z.B. channel:manage:polls für das Stream-Tool).
   *                                Bewusst nicht global: sonst müsste jeder normale
   *                                Besucher beim Login zustimmen, dass wir seine
   *                                Abstimmungen verwalten dürfen.
   */
  const login = (force = false, extraScopes = []) => {
    if (!clientId) return;
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);

    const scopes = [...new Set([...BASE_SCOPES, ...(Array.isArray(extraScopes) ? extraScopes : [])])];

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: scopes.join(" "),
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

  return (
    <TwitchAuthContext.Provider value={{ user, login, logout, clientId, accessToken }}>
      {children}
    </TwitchAuthContext.Provider>
  );
}
