// shellContext.js — was Seiten von der Spiel-Hülle (GameShell.jsx) brauchen: das Biom der Oberfläche und das Fenster „Steuerung“.
import { createContext, useContext, useEffect } from 'react';
import { BIOME_IDS } from '../gen/biomes.js';

/** Das Biom des Tages: jeden Tag ein anderes, für alle gleich */
export function biomeOfDay(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return BIOME_IDS[day % BIOME_IDS.length];
}

export const ShellContext = createContext({ biome: 'meadow', setBiome: () => {}, openControls: () => {} });
export const useGameShell = () => useContext(ShellContext);

/** Solange die Seite steht, zeigt die Hülle dieses Biom (null/‚random‘: das Biom des Tages) */
export function useShellBiome(biome) {
  const { setBiome } = useGameShell();
  useEffect(() => {
    setBiome(BIOME_IDS.includes(biome) ? biome : null);
    return () => setBiome(null);
  }, [biome, setBiome]);
}
