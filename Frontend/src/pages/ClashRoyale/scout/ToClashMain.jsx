// ToClashMain.jsx — /clash/spieler leitet auf die Hauptseite /clash um (dort liegt seit Nov. 2026 die
// Stats-Startseite). Sprache und Reiter in der Adresse bleiben erhalten.
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ToClashMain() {
  const { search } = useLocation();
  return <Navigate to={`/clash${search}`} replace />;
}
