// useFavorites.js — Favoriten-Sterne im -dle-Hub, rein im Browser gespeichert.
//
// Bewusst ohne Server/Account-Anbindung: Favoriten sind eine kleine persönliche Bequemlichkeit
// (oben im Hub sortiert), kein Feature mit Anspruch auf Geräte-Übergreifendheit — dafür wäre
// eine Kopplung ans Twitch-Profil nötig, die hier den Rahmen sprengen würde.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dle:favorites';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Privater Modus o.ä. — Favoriten gelten dann nur für die laufende Sitzung.
    }
  }, [favorites]);

  const isFavorite = useCallback((gameId) => favorites.includes(gameId), [favorites]);

  const toggleFavorite = useCallback((gameId) => {
    setFavorites((prev) => (prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]));
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}
