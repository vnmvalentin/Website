// Vite-Plugin (nur `vite build`): Im ausgelieferten dist/ sollen keine Quelltext-Kommentare und keine internen
// Notizen landen. Den gebündelten Code minifiziert Vite/esbuild ohnehin kommentarfrei — dieses Plugin kümmert sich um
// alles, was am Bundler vorbeiläuft:
//   - index.html: HTML-Kommentare raus, klassische Inline-Skripte minifiziert (Vite lässt beide unangetastet).
//     prerender.js baut jede vorgerenderte Seite aus dieser Datei, damit gilt es für alle Seiten.
//   - Chunks: Vites Platzhalter `/* empty css */` für reine CSS-Imports.
//   - Kopien aus public/: .js minifiziert (sw.js), Kommentare in .xml/.svg/.html, `#`-Zeilen in robots.txt,
//     .md-Dateien (Entwickler-Notizen neben den Medien) gar nicht erst ausliefern.
// Im Dev-Server bleibt alles wie es ist. Lizenztexte (.txt außer robots.txt) bleiben unverändert.
// Prüfen: Build in einen Probeordner (`npx vite build --outDir <ordner>`) und dort nach Kommentaren suchen.
import fs from "node:fs";
import path from "node:path";
import { transformWithEsbuild } from "vite";

// Skript- und Style-Blöcke werden übersprungen, damit ein "<!--" in JS/CSS nicht als HTML-Kommentar gilt
const HTML_KOMMENTAR = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|[ \t]*<!--[\s\S]*?-->[ \t]*(?:\r?\n)?/gi;
const INLINE_SKRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LEERE_CSS_MARKE = /\/\*\s*empty css\s*\*\//g;

function htmlKommentareEntfernen(text) {
  return text.replace(HTML_KOMMENTAR, (_, behalten) => behalten ?? "");
}

async function jsMinifizieren(code, dateiname) {
  const { code: klein } = await transformWithEsbuild(code, dateiname, {
    loader: "js",
    minify: true,
    legalComments: "none",
  });
  return klein.trim();
}

// Nur klassische Skripte ohne src: Modul-Skripte bündelt Vite selbst, andere Typen (z. B. JSON-LD) sind kein JS
function istKlassischesInlineSkript(attribute) {
  if (/\bsrc\s*=/i.test(attribute)) return false;
  const typ = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attribute)?.[1]?.toLowerCase();
  return !typ || typ === "text/javascript" || typ === "application/javascript";
}

async function inlineSkripteMinifizieren(html) {
  const ersetzungen = await Promise.all(
    [...html.matchAll(INLINE_SKRIPT)].map(async ([ganz, attribute, inhalt]) => {
      if (!istKlassischesInlineSkript(attribute) || !inhalt.trim()) return [ganz, ganz];
      return [ganz, `<script${attribute}>${await jsMinifizieren(inhalt, "index-inline.js")}</script>`];
    }),
  );
  let ergebnis = html;
  for (const [alt, neu] of ersetzungen) ergebnis = ergebnis.replace(alt, () => neu);
  return ergebnis;
}

function dateienUnter(ordner, basis = ordner, liste = []) {
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) dateienUnter(voll, basis, liste);
    else if (eintrag.isFile()) liste.push(path.relative(basis, voll));
  }
  return liste;
}

async function publicKopieBereinigen(ziel, relativ) {
  const endung = path.extname(relativ).toLowerCase();
  if (endung === ".md") {
    fs.rmSync(ziel);
    return "entfernt";
  }
  const alt = fs.readFileSync(ziel, "utf8");
  let neu = alt;
  if (endung === ".js" || endung === ".mjs") neu = await jsMinifizieren(alt, path.basename(relativ)) + "\n";
  else if (endung === ".xml" || endung === ".svg" || endung === ".html") neu = htmlKommentareEntfernen(alt);
  else if (relativ.replaceAll("\\", "/") === "robots.txt") {
    neu = alt.replace(/^[ \t]*#.*(?:\r?\n|$)/gm, "").replace(/(\r?\n){3,}/g, "\n\n").trimStart();
  }
  if (neu === alt) return null;
  fs.writeFileSync(ziel, neu);
  return "bereinigt";
}

export default function kommentareEntfernen() {
  let publicDir = "";
  let publicKopieren = true;
  return {
    name: "kommentare-entfernen",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      publicDir = config.publicDir;
      publicKopieren = config.build.copyPublicDir !== false;
    },
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        return htmlKommentareEntfernen(await inlineSkripteMinifizieren(html));
      },
    },
    // Erst nach dem Schreiben: so ist sicher, dass Vite seine Platzhalter schon eingesetzt und public/ kopiert hat
    async writeBundle(ausgabe, bundle) {
      const outDir = ausgabe.dir;
      if (!outDir) return;

      for (const teil of Object.values(bundle)) {
        if (teil.type !== "chunk") continue;
        const ohneMarke = teil.code.replace(LEERE_CSS_MARKE, "");
        if (ohneMarke === teil.code) continue;
        teil.code = ohneMarke;
        fs.writeFileSync(path.join(outDir, teil.fileName), ohneMarke);
      }

      if (!publicKopieren || !publicDir || !fs.existsSync(publicDir)) return;
      const geaendert = { bereinigt: 0, entfernt: 0 };
      for (const relativ of dateienUnter(publicDir)) {
        if (!/\.(m?js|xml|svg|html|md|txt)$/i.test(relativ)) continue;
        const ziel = path.join(outDir, relativ);
        if (!fs.existsSync(ziel)) continue;
        const ergebnis = await publicKopieBereinigen(ziel, relativ);
        if (ergebnis) geaendert[ergebnis] += 1;
      }
      this.info?.(`public/: ${geaendert.bereinigt} Dateien ohne Kommentare, ${geaendert.entfernt} Notizen nicht ausgeliefert`);
    },
  };
}
