// useProfile.js — dauerhaftes Clash-Royale-Profil: Anzeigename, Avatar-Wahl (fester Avatar
// oder Twitch-Bild) und verknüpfte Clash-Royale-Accounts (mehrere möglich, einer davon aktiv).
//
// Zwei Speicherorte, eine Oberfläche für die Screens:
//   - mit Twitch-Login  → Backend (Backend/lib/crProfileStore.js) über /api/clash/profile
//   - ohne Login (Gast) → localStorage unter clash_profile
// ProfileModal & Co. fragen nur `profile` / `updateProfile` / `linkCr` / `unlinkCr` /
// `switchActiveCr` ab und müssen nie wissen, WOHER das Profil kommt — das entscheidet einzig,
// ob `user` gesetzt ist. Der Tag-Check läuft in BEIDEN Fällen über den öffentlichen
// /verify-cr-tag-Endpunkt (keine Duplizierung der Prüf-Logik gegen die offizielle API); nur
// das Speichern unterscheidet sich.
//
// profile.crAccounts ist die Liste aller verknüpften Accounts ({tag, name}), profile.crTag/
// crName bleiben der "gerade aktive" Zeiger — bestehende Leser (Auto-Link in
// ClashRoyalePage.jsx, die Kurzanzeige im Profil) brauchen dadurch keine Änderung.

import { useCallback, useEffect, useState } from 'react';

const LOCAL_KEY = 'clash_profile';
const MAX_CR_ACCOUNTS = 6;

const DEFAULT_PROFILE = {
  displayName: '', avatarId: '', useTwitchAvatar: false, crAccounts: [], crTag: null, crName: null,
};

const readLocal = () => {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') }; }
  catch { return { ...DEFAULT_PROFILE }; }
};
const writeLocal = (profile) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(profile)); }
  catch { /* privater Modus o.ä. — Profil bleibt dann nur für die Sitzung erhalten */ }
};

export function useProfile(user) {
  const [profile, setProfile] = useState(() => (user ? DEFAULT_PROFILE : readLocal()));
  const [loading, setLoading] = useState(!!user);

  // Login/Logout wechselt die Quelle — bei Twitch-Verbindung neu vom Server laden,
  // beim Trennen zurück auf das lokale Geräte-Profil.
  useEffect(() => {
    if (!user) { setProfile(readLocal()); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch('/api/clash/profile', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data) setProfile(data); })
      .catch(() => { /* Profil bleibt leer, Screens fallen auf Eingabefelder zurück */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const updateProfile = useCallback(async (patch) => {
    if (user) {
      const res = await fetch('/api/clash/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setProfile(data);
      return data;
    }
    const next = { ...profile, ...patch };
    setProfile(next);
    writeLocal(next);
    return next;
  }, [user, profile]);

  /** Tag gegen die offizielle API prüfen, dann der Account-Liste hinzufügen und aktiv setzen. */
  const linkCr = useCallback(async (tag) => {
    if (user) {
      const res = await fetch('/api/clash/profile/link-cr', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const data = await res.json();
      if (data.ok && data.profile) setProfile(data.profile);
      return data;
    }
    const res = await fetch('/api/clash/profile/verify-cr-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    const data = await res.json();
    if (data.ok) {
      const rest = profile.crAccounts.filter(a => a.tag !== data.tag);
      const crAccounts = [...rest, { tag: data.tag, name: data.name }].slice(-MAX_CR_ACCOUNTS);
      const next = { ...profile, crAccounts, crTag: data.tag, crName: data.name };
      setProfile(next);
      writeLocal(next);
    }
    return data;
  }, [user, profile]);

  /** Nur den aktiven Account wechseln (bereits verifiziert, kein erneuter API-Call nötig). */
  const switchActiveCr = useCallback(async (tag) => {
    const found = profile.crAccounts.find(a => a.tag === tag);
    if (!found) return;
    if (user) {
      const res = await fetch('/api/clash/profile/switch-cr', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      const data = await res.json();
      if (data.ok && data.profile) setProfile(data.profile);
      return;
    }
    const next = { ...profile, crTag: found.tag, crName: found.name };
    setProfile(next);
    writeLocal(next);
  }, [user, profile]);

  /** Ohne tag: den aktiven Account entfernen (Rückwärtskompatibilität). Mit tag: gezielt einen. */
  const unlinkCr = useCallback(async (tag) => {
    const target = tag || profile.crTag;
    if (user) {
      const res = await fetch('/api/clash/profile/unlink-cr', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: target }),
      });
      if (res.ok) setProfile(await res.json());
      return;
    }
    const crAccounts = target ? profile.crAccounts.filter(a => a.tag !== target) : profile.crAccounts;
    const wasActive = target && profile.crTag === target;
    const fallback = wasActive ? (crAccounts[0] || null) : null;
    const next = {
      ...profile,
      crAccounts,
      crTag: wasActive ? (fallback?.tag ?? null) : profile.crTag,
      crName: wasActive ? (fallback?.name ?? null) : profile.crName,
    };
    setProfile(next);
    writeLocal(next);
  }, [user, profile]);

  return { profile, loading, updateProfile, linkCr, unlinkCr, switchActiveCr };
}
