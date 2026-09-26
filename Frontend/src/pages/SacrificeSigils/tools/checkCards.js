#!/usr/bin/env node
// tools/checkCards.js — Datenvalidierung aller Karten (npm run sigils:check). Fehler ⇒ Rückgabewert 1, Budget-Abweichungen als Warnung.
import { validateCards } from "../engine/validate.js";

const { errors, warnings, stats } = validateCards();
console.log(`${stats.total} Karten, davon ${stats.collectible} sammelbar, ${stats.legendary} legendär, ${stats.cursed} verflucht.`);
for (const w of warnings) console.warn(`Warnung: ${w}`);
for (const e of errors) console.error(`Fehler: ${e}`);
if (errors.length) process.exit(1);
console.log(warnings.length ? `OK mit ${warnings.length} Budget-Warnungen.` : "OK.");
