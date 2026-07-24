// Globaler animierter Hintergrund: dunkle Basis mit langsam driftenden
// blau-lila Farbflächen (Styles in index.css unter .app-bg).
export default function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-bg__orb app-bg__orb--1" />
      <div className="app-bg__orb app-bg__orb--2" />
      <div className="app-bg__orb app-bg__orb--3" />
      <div className="app-bg__orb app-bg__orb--4" />
      <div className="app-bg__stars" />
      <div className="app-bg__vignette" />
    </div>
  );
}
