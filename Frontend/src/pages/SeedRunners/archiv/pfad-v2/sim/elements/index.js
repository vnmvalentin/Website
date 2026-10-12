// Register aller Element-Typen. Ein neues Element braucht: eine Datei in diesem Ordner
// (Schnittstelle: siehe util.js), einen Eintrag hier, ggf. ein Zeichen in glyphs.js und eine
// Zeichenroutine in client/drawElements.js.
import spike from './spike.js';
import saw from './saw.js';
import laser from './laser.js';
import fallingBlock from './fallingBlock.js';
import mover from './mover.js';
import crumble from './crumble.js';
import spring from './spring.js';
import ring from './ring.js';
import crystal from './crystal.js';
import wind from './wind.js';
import gravityZone from './gravityZone.js';
import portal from './portal.js';
import toggleSwitch from './switch.js';
import colorBlock from './colorBlock.js';
import key from './key.js';
import door from './door.js';

export const ELEMENT_TYPES = Object.fromEntries(
  [spike, saw, laser, fallingBlock, mover, crumble, spring, ring, crystal, wind, gravityZone,
    portal, toggleSwitch, colorBlock, key, door].map((mod) => [mod.type, mod]),
);
