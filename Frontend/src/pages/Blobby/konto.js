// konto.js — Blobby Volley am Konto; Regeln in kontoStand.js, Anbindung in ui/Shell.jsx, gezählt in BlobbyRoom.jsx.
import { spielKonto } from "../../utils/spielKonto.js";
import { BLOBBY_KONTO } from "./kontoStand.js";

export const blobbyKonto = spielKonto("blobby", BLOBBY_KONTO);
