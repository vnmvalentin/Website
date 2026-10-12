// Farben und Beschriftung der bis zu vier 2er-Teams (Backend: core/teams.js, TEAM_IDS).
// An einer Stelle, weil Lobby, beide 2v2-Modi und der Endbildschirm dieselben Farben zeigen
// müssen — Team A ist überall blau, B rot, C grün, D gelb. Tailwind braucht die Klassen als
// feste Zeichenketten, deshalb keine zusammengesetzten Klassennamen.

export const TEAM_IDS = ['A', 'B', 'C', 'D'];

export const TEAM_STYLE = {
  A: { hex: '#3b82f6', text: 'text-blue-300', panel: 'bg-blue-500/10 border-blue-500/30', chip: 'bg-blue-500 text-white' },
  B: { hex: '#ef4444', text: 'text-red-300', panel: 'bg-red-500/10 border-red-500/30', chip: 'bg-red-500 text-white' },
  C: { hex: '#22c55e', text: 'text-green-300', panel: 'bg-green-500/10 border-green-500/30', chip: 'bg-green-500 text-[#052e14]' },
  D: { hex: '#f59e0b', text: 'text-amber-300', panel: 'bg-amber-500/10 border-amber-500/30', chip: 'bg-amber-400 text-[#3a2500]' },
};

export const teamStyle = (letter) => TEAM_STYLE[letter] || TEAM_STYLE.A;

/** Die Teams, die es in dieser Lobby gibt (lobbyData.teamCount, Standard 2). */
export const activeTeams = (teamCount) => TEAM_IDS.slice(0, Math.max(2, Math.min(4, Number(teamCount) || 2)));

/** Kleines Buchstaben-Abzeichen in Teamfarbe — für alle vier Teams gleich gebaut. */
export function teamChipClass(letter) {
  return `inline-flex items-center justify-center rounded-md font-cr leading-none ${teamStyle(letter).chip}`;
}
