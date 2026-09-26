// Schaltet den Ton beim ersten Tastendruck oder Klick frei: Browser lassen einen AudioContext erst
// nach einer Nutzeraktion laufen (Autoplay-Regel).
import { useEffect } from "react";
import { sharedSound } from "./sound.js";

export function useSoundUnlock() {
  useEffect(() => {
    const unlock = () => sharedSound.resume();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);
}
