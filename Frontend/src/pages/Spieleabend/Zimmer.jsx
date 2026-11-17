// Zimmer.jsx — der Spieleabend: ein 3D-Zimmer mit Tisch, das Menü steckt in der Szene.
//
// /spieleabend öffnet ein neues Zimmer (die Adresse wird gleich zu /spieleabend/CODE — das ist der Einladungslink),
// /spieleabend/CODE tritt bei. Wer kommt, steht als Blob im Zimmer und läuft herum (WASD, Pfeile oder Klick auf den
// Boden; Ich-Sicht oder von oben), Spielkartons im Regal wählen das Spiel, am Couchtisch gibt es Chips (machen dick),
// in der Umkleide zieht man sich um, andere Blobs bekommen auf Klick ein Kissen ab. Knöpfe hängen als Schilder an Stühlen und Brett:
// freier Stuhl → „Hier sitzen“, Bot-Stärke, leer lassen, Einladen; am Brett Spielwahl, „Spiel starten“ bzw. „Nochmal“.
// Würfeln (Mensch ärgere dich nicht): Würfel anklicken, Knopf in der Statuszeile oder Leertaste.
// Zeichen-Hochstapler: oben steht das eigene Wort (oder die Rolle), gezeichnet wird auf dem Blatt in der Tischmitte,
// abgestimmt über die Schilder an den Köpfen, geraten in einem Feld in der Mitte.
// Im Zimmer: Gesten-Rad (Taste G, 1–7 oder Knopf „Gesten“, ui/GestenRad.jsx), Sofa, Lichtschalter, Fenster mit Schnee,
// Limo, die Katze (Minka) — alles per Klick in der Szene, die Seite schickt es an den Server.
// Der Server entscheidet alles (Backend/spieleabend/zimmer.js); die Szene (scene/zimmerSzene.js) zeigt nur.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { Bot, Camera, Check, Crown, Dices, Eye, Hand, Link2, Loader2, Menu, Play, RotateCcw, Snowflake, Square, Users, ArrowDownToLine, ArrowUpFromLine, CircleOff } from "lucide-react";
import SEO from "../../components/SEO";
import { isLowGfx } from "../../utils/lowGfx.js";
import { meldeFehler } from "../../utils/fehlerMelder.js";
import { createZimmerSzene } from "./scene/zimmerSzene.js";
import { BOT_STUFEN, SPIELE, sitzende } from "./spiele.js";
import { cleanName, getToken, ladeMausTempo, loadPrefs, savePrefs, speichereMausTempo } from "./prefs.js";
import Umkleide from "./ui/Umkleide.jsx";
import GestenRad from "./ui/GestenRad.jsx";
import Menue from "./ui/Menue.jsx";
import ErgebnisTeilen from "../../components/ErgebnisTeilen.jsx";
import { spieleabendErgebnis } from "./ergebnis.js";
import { zaehleSpieleabendPartie } from "./kontoStand.js";
import * as sound from "./sound.js";
import { normalizeSkin, skinColor } from "../Worldflip/skins.js";

const istTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export default function Zimmer() {
  const { code: rawCode } = useParams();
  const code = rawCode ? String(rawCode).toUpperCase() : null;
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState(null);
  const [status, setStatus] = useState("verbinde"); // verbinde | da | getrennt | fehlt | fehler
  const [fehler, setFehler] = useState("");
  const [hinweise, setHinweise] = useState([]);
  const [umkleide, setUmkleide] = useState(null); // Entwurf { name, skin } während der Anprobe
  const ansichtRef = useRef("ich");
  const umkleideOffen = !!umkleide;
  const [ansicht, setAnsicht] = useState(() => {
    try {
      return localStorage.getItem("spieleabend.ansicht") === "folge" ? "folge" : "ich";
    } catch {
      return "ich";
    }
  });
  const [kopiert, setKopiert] = useState(false);
  const [gesperrt, setGesperrt] = useState(false); // Maus gefangen: Fadenkreuz
  const [fadenZiel, setFadenZiel] = useState(null); // was im Fadenkreuz liegt
  const [rad, setRad] = useState(null); // Gesten-Rad offen: { wahl }
  const [schneeZahl, setSchneeZahl] = useState(0); // Schneebälle in der Hand
  const [katzePlan, setKatzePlan] = useState(null); // was die Katze vorhat (sa:katze oder Zimmerstand)
  const [menueOffen, setMenueOffen] = useState(false); // Menü (Esc): Ton, Maus, Leute, Einladen
  const [mausTempo, setMausTempo] = useState(ladeMausTempo);
  const [ohne3d, setOhne3d] = useState(false);

  ansichtRef.current = ansicht;
  const socketRef = useRef(null);
  const szeneRef = useRef(null);
  const canvasRef = useRef(null);
  const tagRefs = useRef(new Map());
  const prefsRef = useRef(prefs);
  const codeRef = useRef(code);
  const viewRef = useRef(null);
  const tokenRef = useRef(null);
  const zeitVersatz = useRef(0);
  const [rateText, setRateText] = useState("");
  if (!tokenRef.current) tokenRef.current = getToken();
  prefsRef.current = prefs;

  const hinweis = useCallback((text) => {
    const id = Math.random().toString(36).slice(2);
    setHinweise((h) => [...h.slice(-2), { id, text }]);
    setTimeout(() => setHinweise((h) => h.filter((x) => x.id !== id)), 3600);
  }, []);

  // ── Verbindung ─────────────────────────────────────────────────────────────────────────
  // navigate ändert sich bei jedem Adresswechsel — über eine Ref, sonst baute der Socket-Effekt nach dem Anlegen des
  // Zimmers (Adresse wird /spieleabend/CODE) die Verbindung neu auf und verließe dabei das eigene Zimmer.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const betreten = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const p = prefsRef.current;
    const daten = { name: p.name, token: tokenRef.current, skin: p.skin };
    const c = codeRef.current;
    if (c) {
      socket.emit("sa:beitreten", { ...daten, code: c }, (res) => {
        if (res?.ok) setStatus("da");
        else if (res?.fehlt) setStatus("fehlt");
        else if (res?.raus) setStatus("raus");
        else {
          setFehler(res?.error || "Beitreten hat nicht geklappt.");
          setStatus("fehler");
        }
      });
    } else {
      socket.emit("sa:erstellen", daten, (res) => {
        if (!res?.ok) {
          setFehler(res?.error || "Das Zimmer konnte nicht geöffnet werden.");
          setStatus("fehler");
          return;
        }
        codeRef.current = res.code;
        setStatus("da");
        navigateRef.current(`/spieleabend/${res.code}`, { replace: true });
      });
    }
  }, []);

  useEffect(() => {
    const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"], reconnection: true, reconnectionDelay: 1000 });
    socketRef.current = socket;
    socket.on("connect", betreten);
    socket.on("disconnect", () => setStatus((s) => (s === "da" ? "getrennt" : s)));
    socket.on("sa:zimmer", (v) => {
      // Uhr des Servers: Fristen (Zeichen-Hochstapler) zählen damit herunter
      if (typeof v?.serverNow === "number") zeitVersatz.current = v.serverNow - Date.now();
      viewRef.current = v;
      setView(v);
    });
    socket.on("sa:hinweis", (m) => m?.text && hinweis(m.text));
    // vom Gastgeber hinausgeworfen: Zimmer ist weg, nur noch „Neues Zimmer öffnen“
    socket.on("sa:rausgeworfen", () => {
      setStatus("raus");
      setView(null);
      viewRef.current = null;
      setMenueOffen(false);
    });
    // Laufen und Gesten der anderen gehen an der React-Ansicht vorbei direkt in die Szene
    socket.on("sa:ort", (o) => o && szeneRef.current?.ortVon(o.id, o));
    socket.on("sa:geste", (g) => g && szeneRef.current?.geste(g.id, g.art, g));
    // die Katze hat etwas Neues vor: direkt in die Szene, das Schild („will gestreichelt werden“) über einen eigenen
    // Stand — nicht über den Zimmerstand, sonst setzte die Szene alle Blobs auf dessen ältere Positionen zurück
    socket.on("sa:katze", (k) => {
      if (!k) return;
      szeneRef.current?.katze(k);
      setKatzePlan(k);
    });
    socket.on("sa:live", (d) => szeneRef.current?.live(d));
    return () => {
      socket.emit("sa:verlassen");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [betreten, hinweis]);

  // Adresse gewechselt (Logo → neues Zimmer, anderer Einladungslink): altes Zimmer verlassen, neues betreten
  useEffect(() => {
    if (code === codeRef.current) return;
    codeRef.current = code;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("sa:verlassen", {}, () => {
      setView(null);
      viewRef.current = null;
      setStatus("verbinde");
      betreten();
    });
  }, [code, betreten]);

  const senden = useCallback(
    (ereignis, daten = {}) => {
      socketRef.current?.emit(ereignis, daten, (res) => {
        if (res && !res.ok && res.error) hinweis(res.error);
      });
    },
    [hinweis],
  );

  // ── 3D-Szene ───────────────────────────────────────────────────────────────────────────
  const cb = useRef({});
  cb.current.aktion = (aktion) => senden("sa:zug", { aktion });
  cb.current.stuhl = (platz) => senden("sa:platz", { platz });
  cb.current.spielWahl = (id) => {
    const v = viewRef.current;
    if (!v) return;
    if (v.phase !== "lobby") hinweis("Erst die Partie zu Ende spielen.");
    else if (v.host) senden("sa:spiel", { spiel: id });
    else hinweis(`Das Spiel wählt ${v.leute.find((p) => p.id === v.hostId)?.name || "der Gastgeber"}.`);
  };
  // Position nur „flüchtig“ senden: kommt eine nicht an, ersetzt sie die nächste
  cb.current.ort = (o) => socketRef.current?.volatile.emit("sa:ort", o);
  // Antwort zurück an die Szene: Bauch (platzt?), Schneebälle
  cb.current.geste = (art, extra = {}) =>
    socketRef.current?.emit("sa:geste", { art, ...extra }, (res) => {
      if (res?.ok) szeneRef.current?.eigenesErgebnis(art, res);
      else if (res?.error) hinweis(res.error);
    });
  cb.current.sofa = (platz) => senden("sa:sofa", { platz });
  cb.current.licht = () => senden("sa:licht");
  cb.current.fenster = () => senden("sa:fenster");
  cb.current.schnee = () => senden("sa:schnee");
  cb.current.katze = () => senden("sa:katze");
  // Menü: true = auf (Esc hat die Maus gelöst), ohne Wert = umschalten (Esc mit freier Maus)
  cb.current.menue = (auf) => setMenueOffen((m) => (auf === true ? true : !m));
  cb.current.umkleide = () => {
    const p = prefsRef.current;
    setUmkleide({ name: p.name, skin: p.skin });
    szeneRef.current?.anprobieren(p.skin);
  };
  cb.current.ansicht = (a) => {
    setAnsicht(a);
    try {
      localStorage.setItem("spieleabend.ansicht", a);
    } catch {
      /* nicht gemerkt */
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let szene = null;
    const schilderSetzen = () => {
      const s = szeneRef.current;
      if (!s) return;
      const breite = canvas.clientWidth;
      const hoehe = canvas.clientHeight;
      for (const [key, el] of tagRefs.current) {
        const p = s.bildschirm(key);
        if (!p) {
          el.style.visibility = "hidden";
          continue;
        }
        // knapp außerhalb: Schild bleibt ganz im Bild; weit außerhalb (Figur nicht zu sehen): ausblenden
        if (p.x < -60 || p.x > breite + 60) {
          el.style.visibility = "hidden";
          continue;
        }
        const halb = el.offsetWidth / 2;
        const x = Math.min(breite - halb - 8, Math.max(halb + 8, p.x));
        const art = el.dataset.anker || "oben";
        const h = el.offsetHeight;
        // oben bleibt Platz für die Leiste, unten für die Statuszeile
        const y = art === "unten" ? Math.min(hoehe - h - 70, p.y) : art === "mitte" ? Math.min(hoehe - h / 2 - 70, Math.max(h / 2 + 58, p.y)) : Math.max(h + 58, p.y);
        const ty = art === "unten" ? "10px" : art === "mitte" ? "-50%" : "-100%";
        el.style.visibility = "";
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, ${ty})`;
      }
    };
    try {
      szene = createZimmerSzene(canvas, {
        low: isLowGfx(),
        onAktion: (a) => cb.current.aktion(a),
        onStuhl: (i) => cb.current.stuhl(i),
        onSpielWahl: (id) => cb.current.spielWahl(id),
        onOrt: (o) => cb.current.ort(o),
        onGeste: (art, extra) => cb.current.geste(art, extra),
        onUmkleide: () => cb.current.umkleide(),
        onAnsicht: (a) => cb.current.ansicht(a),
        onSperre: (an) => setGesperrt(an),
        onZiel: (z) => setFadenZiel(z),
        onSofa: (i) => cb.current.sofa(i),
        onLicht: () => cb.current.licht(),
        onFenster: () => cb.current.fenster(),
        onSchnee: () => cb.current.schnee(),
        onKatze: () => cb.current.katze(),
        onRad: (r) => setRad(r.offen ? { wahl: r.wahl } : null),
        onSchneeZahl: (n) => setSchneeZahl(n),
        onMenue: (auf) => cb.current.menue(auf),
        mausTempo: ladeMausTempo(),
        ansicht: ansichtRef.current,
        onFrame: schilderSetzen,
      });
    } catch (e) {
      console.error("[spieleabend] 3D-Szene:", e);
      if (!/webgl/i.test(String(e?.message))) meldeFehler("manuell", e, "Spieleabend: 3D-Zimmer konnte nicht starten");
      setOhne3d(true);
      return undefined;
    }
    szeneRef.current = szene;
    sound.vorladen();
    if (viewRef.current) szene.setze(viewRef.current, viewRef.current.du);
    // Prüfstand (nur im Dev-Server): Bildschirmpunkte von Ankern (Brettspalte, Spielfigur) und der Zimmer-Stand
    if (import.meta.env.DEV) {
      window.__saSpalte = (c) => szeneRef.current?.bildschirm(`spalte:${c}`) || null;
      window.__saAnker = (key) => szeneRef.current?.bildschirm(key) || null;
      window.__saView = () => viewRef.current;
      window.__saSzene = szene;
    }
    return () => {
      szeneRef.current = null;
      szene.dispose();
    };
  }, []);

  useEffect(() => {
    if (view) szeneRef.current?.setze(view, view.du);
    if (view?.katze) setKatzePlan(view.katze);
  }, [view]);

  // Menü offen: das Zimmer nimmt keine Tasten (WASD, Gesten) an
  useEffect(() => {
    szeneRef.current?.setPause(menueOffen);
  }, [menueOffen]);
  const mausTempoAendern = (v) => {
    setMausTempo(v);
    speichereMausTempo(v);
    szeneRef.current?.setMausTempo(v);
  };
  const menueWeiter = () => {
    setMenueOffen(false);
    szeneRef.current?.mausFangen();
  };

  // ── Abgeleitetes ───────────────────────────────────────────────────────────────────────
  const spiel = view ? SPIELE[view.spiel] || SPIELE.vierGewinnt : SPIELE.vierGewinnt;
  const ich = view?.du ?? null;
  const person = (id) => view?.leute.find((p) => p.id === id) || null;
  const host = view ? person(view.hostId) : null;
  const sitz = view ? sitzende(view) : [];
  const meinPlatz = sitz.findIndex((s) => s.person !== null && s.person === ich);
  const partie = view?.partie || null;
  const sicht = partie?.sicht || null;
  const laeuft = !!partie?.laeuft;
  const nameAmPlatz = (i) => {
    const b = partie?.besetzung[i];
    if (!b) return "";
    if (b.bot) return b.bot.name;
    if (b.weg) return b.weg;
    return person(b.person)?.name || "Jemand";
  };
  const dran = laeuft ? sicht.amZug : null;
  const binDran = dran !== null && meinPlatz === dran;

  // Würfelzahl erst nennen, wenn der Würfel liegt (die Szene lässt ihn knapp eine Sekunde rollen)
  const wurfSeq = sicht?.letzterWurf?.seq ?? 0;
  const [wurfGelandet, setWurfGelandet] = useState(0);
  useEffect(() => {
    if (!wurfSeq) return undefined;
    const t = setTimeout(() => setWurfGelandet(wurfSeq), 900);
    return () => clearTimeout(t);
  }, [wurfSeq]);
  const wurfRollt = view?.spiel === "maedn" && wurfSeq > 0 && wurfGelandet < wurfSeq;
  const kannWuerfeln = laeuft && view?.spiel === "maedn" && binDran && sicht.phase === "wuerfeln" && !wurfRollt;
  const wuerfeln = useCallback(() => senden("sa:zug", { aktion: { art: "wuerfeln" } }), [senden]);
  useEffect(() => {
    if (!kannWuerfeln) return undefined;
    const onKey = (e) => {
      if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, button, [role=dialog], form")) return;
      e.preventDefault();
      wuerfeln();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kannWuerfeln, wuerfeln]);

  // Fristen (Zeichen-Hochstapler): Sekunden herunterzählen
  const [, setTakt] = useState(0);
  const frist = laeuft ? sicht?.frist ?? null : null;
  useEffect(() => {
    if (!frist) return undefined;
    const i = setInterval(() => setTakt((t) => t + 1), 500);
    return () => clearInterval(i);
  }, [frist]);
  const rest = frist ? Math.max(0, Math.ceil((frist - (Date.now() + zeitVersatz.current)) / 1000)) : null;
  useEffect(() => {
    if (sicht?.phase !== "raten") setRateText("");
  }, [sicht?.phase]);

  // Klang, wenn man dran ist
  const warDran = useRef(false);
  useEffect(() => {
    if (binDran && !warDran.current) sound.dran();
    warDran.current = binDran;
  }, [binDran]);

  const link = view ? `${window.location.origin}/spieleabend/${view.code}` : "";
  const einladen = async () => {
    try {
      if (navigator.share && istTouch()) {
        await navigator.share({ title: "Spieleabend", text: "Komm an den Tisch!", url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
    } catch {
      window.prompt("Link zum Zimmer:", link);
    }
  };

  const blobSpeichern = (neu) => {
    const next = { ...prefs, name: cleanName(neu.name) || prefs.name, skin: normalizeSkin(neu.skin, 0) };
    setPrefs(next);
    savePrefs(next);
    senden("sa:profil", { name: next.name, skin: next.skin });
  };
  const umkleideFertig = () => {
    blobSpeichern(umkleide);
    szeneRef.current?.anprobieren(null);
    setUmkleide(null);
  };
  const umkleideAbbrechen = useCallback(() => {
    szeneRef.current?.anprobieren(null);
    setUmkleide(null);
  }, []);
  const umkleideAendern = (d) => {
    setUmkleide(d);
    szeneRef.current?.anprobieren(d.skin);
  };
  // Hinweis am Fadenkreuz (nur für Dinge in Reichweite): Taste und was sie tut; Klick tut dasselbe wie E
  const zielText = (() => {
    const z = fadenZiel;
    if (!z || !view) return null;
    if (z.stuhl !== undefined) return `Platz nehmen (${spiel.farben[z.stuhl]?.name || ""})`;
    if (z.karton) return view.host ? `${SPIELE[z.karton]?.name || "Spiel"} wählen` : `${SPIELE[z.karton]?.name || "Spiel"} — wählt der Gastgeber`;
    if (z.chips) return "Chips essen";
    if (z.limo) return "Limo trinken";
    if (z.umkleide) return "Umziehen";
    if (z.blob !== undefined) return z.schnee ? `Schneeball auf ${person(z.blob)?.name || "jemanden"}` : `Kissen für ${person(z.blob)?.name || "jemanden"}`;
    if (z.sofa) return "Aufs Sofa plumpsen";
    if (z.licht) return view.licht === false ? "Licht anmachen" : "Licht ausmachen";
    if (z.fenster) return view.fenster ? "Fenster schließen" : "Fenster öffnen";
    if (z.schneeHolen) return "Schnee holen";
    if (z.katze) return "Minka streicheln";
    if (z.werfen) return `Schneeball werfen (${z.werfen})`;
    return null;
  })();
  const zielTaste = fadenZiel?.werfen ? "Klick" : "E";
  const aufSofa = ich !== null && (view?.sofa || []).includes(ich);

  const ansichtWechseln = () => {
    const neu = ansicht === "ich" ? "folge" : "ich";
    szeneRef.current?.setAnsicht(neu);
    cb.current.ansicht(neu);
  };

  const spielInfo = view?.spiele.find((x) => x.id === view.spiel) || null;
  const leerMoeglich = !!spielInfo && !spielInfo.ohneBots && spielInfo.minSpieler < spielInfo.plaetze;


  // ── Schilder (Position setzt die Szene in jedem Bild) ───────────────────────────────────
  const tagRef = (key) => (el) => {
    if (el) tagRefs.current.set(key, el);
    else tagRefs.current.delete(key);
  };

  const schilder = useMemo(() => {
    if (!view) return [];
    const out = [];
    const spiel = SPIELE[view.spiel] || SPIELE.vierGewinnt;
    const partie = view.partie;
    const ich = view.du;
    const amStuhl = new Map();
    sitzende(view).forEach((s, i) => s.person !== null && amStuhl.set(s.person, i));
    // Zeichen-Hochstapler, Abstimmung: an jedem Mitspieler ein „Verdächtigen“-Schild
    const s = partie?.sicht;
    const abstimmen = view.phase === "spiel" && partie?.spiel === "zeichnen" && s?.phase === "abstimmen" && amStuhl.has(ich);
    // in der Umkleide nur die Leiste, keine Schilder im Bild
    if (umkleideOffen) return out;
    for (const p of view.leute) {
      const stuhl = amStuhl.get(p.id);
      // sitze ich selbst oder schaue aus meinen Augen, ist die Kamera dort — dann kein eigenes Schild
      if (p.id === ich && (stuhl !== undefined || ansicht === "ich")) continue;
      const farbe = stuhl !== undefined ? spiel.farben[stuhl].hex : skinColor(normalizeSkin(p.skin, p.id));
      if (abstimmen && stuhl !== undefined && !s.weg.includes(stuhl)) {
        out.push({ key: `person:${p.id}`, art: "stimme", name: p.name, farbe, platz: stuhl, gewaehlt: s.meineStimme === stuhl, hatGestimmt: s.gestimmt.includes(stuhl) });
        continue;
      }
      out.push({ key: `person:${p.id}`, art: "name", name: p.name, farbe, host: p.id === view.hostId, weg: !p.connected, du: p.id === ich });
    }
    if (view.phase === "spiel" && partie) {
      partie.besetzung.forEach((b, i) => {
        if (b.bot) out.push({ key: `bot:${i}`, art: "name", name: b.bot.name, farbe: spiel.farben[i].hex, bot: true });
      });
    }
    // Wer steht (oder auf dem Sofa sitzt), sieht keine Schilder im Zimmer: Stühle, Regal, Chips, Sofa … zeigt das
    // Fadenkreuz in Reichweite. Will Minka gestreichelt werden, sagt sie es aber.
    const steht = ich !== null && !amStuhl.has(ich);
    if (katzePlan?.modus === "betteln" && katzePlan.person === ich) out.push({ key: "katze", art: "ort", text: "Minka will gestreichelt werden" });
    if (steht) return out;
    if (view.phase === "lobby") {
      view.stuehle.forEach((s, i) => {
        if (s !== null) return;
        const rest = partie?.besetzung[i]?.bot || null; // Bot der letzten Partie sitzt noch
        out.push({ key: `stuhl:${i}`, art: "stuhl", platz: i, bot: rest });
      });
      out.push({ key: "brett", art: "brett" });
    }
    return out;
  }, [view, ansicht, umkleideOffen, katzePlan]);

  const ergebnis = sicht?.fertig
    ? sicht.sieger === null
      ? { text: "Unentschieden" }
      : { text: sicht.sieger === meinPlatz ? "Du gewinnst!" : `${nameAmPlatz(sicht.sieger)} gewinnt`, farbe: spiel.farben[sicht.sieger].hex, mit: spiel.farben[sicht.sieger].name }
    : null;

  // Ergebnis beim Zeichen-Hochstapler (mehrere Sieger, Wort aufdecken)
  const ergebnisZeichnen =
    view?.spiel === "zeichnen" && partie?.spiel === "zeichnen" && sicht?.fertig
      ? (() => {
          const h = sicht.hochstapler;
          const hName = nameAmPlatz(h);
          const hFarbe = spiel.farben[h]?.hex;
          const gewonnen = meinPlatz >= 0 && sicht.siegerListe.includes(meinPlatz);
          const wort = `Das Wort war „${sicht.wort}“`;
          if (sicht.grund === "weg") return { text: "Der Hochstapler ist gegangen", zeilen: [wort] };
          if (!sicht.erwischt) return { text: gewonnen ? "Du hast alle reingelegt!" : `${hName} hat euch reingelegt`, farbe: hFarbe, zeilen: [`${hName} war der Hochstapler`, wort] };
          if (sicht.richtig) return { text: gewonnen ? "Erwischt, aber richtig geraten!" : `${hName} rät richtig!`, farbe: hFarbe, zeilen: [`Erwischt, aber „${sicht.geraten}“ stimmt`] };
          return { text: gewonnen ? "Gewonnen, erwischt!" : `Erwischt! ${hName} war's`, zeilen: [sicht.geraten ? `${hName} riet „${sicht.geraten}“` : `${hName} hat nicht geraten`, wort] };
        })()
      : null;

  // Ergebnisbild: nur wer selbst gewonnen hat (beim Zeichen-Hochstapler auch die Künstler, die ihn entlarvt haben)
  const meinSieg = meinPlatz >= 0 && !!sicht?.fertig && (
    partie?.spiel === "zeichnen" ? sicht.grund !== "weg" && !!sicht.siegerListe?.includes(meinPlatz) : sicht.sieger === meinPlatz
  );

  // Statistik am Konto: jede beendete Partie, an der man selbst saß, einmal zählen (Zimmer + Partienummer)
  const gezaehltNr = meinPlatz >= 0 && sicht?.fertig && view?.code && partie ? `${view.code}:${partie.nr}` : null;
  useEffect(() => {
    if (!gezaehltNr) return;
    zaehleSpieleabendPartie({
      partie: gezaehltNr, spiel: partie.spiel, gewonnen: meinSieg,
      warHochstapler: partie.spiel === "zeichnen" && sicht.hochstapler === meinPlatz,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gezaehltNr]);

  // Wer nicht am Tisch sitzt, sieht die Karte am Brett nicht: das Ergebnis kommt als Hinweis
  const ergebnisGemeldet = useRef(undefined); // undefined: noch keinen Stand gesehen (beim Betreten nichts melden)
  const ergebnisKurz = ergebnisZeichnen ? `${ergebnisZeichnen.text} · ${ergebnisZeichnen.zeilen.at(-1)}` : ergebnis?.text || null;
  const fertigeNr = partie && sicht?.fertig ? partie.nr : null;
  useEffect(() => {
    if (status !== "da" || !view) return;
    if (ergebnisGemeldet.current === undefined) {
      ergebnisGemeldet.current = fertigeNr;
      return;
    }
    if (fertigeNr === null || fertigeNr === ergebnisGemeldet.current) return;
    ergebnisGemeldet.current = fertigeNr;
    if (meinPlatz < 0 && ich !== null && ergebnisKurz) hinweis(ergebnisKurz);
  }, [fertigeNr, view, ergebnisKurz, status, meinPlatz, ich, hinweis]);

  function schild(t) {
    if (t.art === "stimme") {
      return (
        <div className={`sa-panel sa-stuhl sa-stimme${t.gewaehlt ? " sa-an" : ""}`}>
          <span className="sa-chip" style={{ background: t.farbe }} />
          <span>{t.name}</span>
          {t.hatGestimmt && <Check size={13} aria-label="hat abgestimmt" className="text-[var(--sa-dim)]" />}
          <button type="button" className="sa-btn sa-btn-sm" aria-pressed={t.gewaehlt} onClick={() => senden("sa:zug", { aktion: { art: "stimme", platz: t.platz } })}>
            {t.gewaehlt ? "Dein Verdacht" : "Verdächtigen"}
          </button>
        </div>
      );
    }
    if (t.art === "name") {
      return (
        <div className={`sa-name${t.weg ? " sa-off" : ""}`}>
          <span className="sa-chip" style={{ background: t.farbe }} />
          {t.name}
          {t.du && <small>du</small>}
          {t.host && <Crown size={12} aria-label="Gastgeber" className="text-[var(--sa-messing)]" />}
          {t.bot && <small>Bot</small>}
          {t.weg && <small>weg</small>}
        </div>
      );
    }
    if (t.art === "ort") return <div className="sa-name sa-hint">{t.text}</div>;
    if (t.art === "stuhl") {
      const farbe = spiel.farben[t.platz];
      const leer = !!view.leer?.[t.platz];
      return (
        <div className="sa-panel sa-stuhl">
          <span className="sa-chip" style={{ background: farbe.hex }} />
          <span title={t.bot ? "Bleibt sitzen, bis sich jemand hinsetzt" : leer ? "Bleibt in der Partie leer" : "Beim Start spielt hier ein Bot"}>
            {t.bot ? `${t.bot.name} (Bot)` : leer ? `${farbe.name}: bleibt leer` : `${farbe.name} frei`}
          </span>
          {ich !== null && meinPlatz < 0 && (
            <button type="button" className="sa-btn sa-btn-sm" onClick={() => szeneRef.current?.geheZuStuhl(t.platz)}>
              <ArrowDownToLine size={14} />Platz nehmen
            </button>
          )}
          {view.host && leerMoeglich && (
            <button type="button" className="sa-icon-btn sa-icon-sm" onClick={() => senden("sa:leer", { platz: t.platz, leer: !leer })} title={leer ? "Bot hinsetzen" : "Leer lassen"} aria-label={leer ? "Bot hinsetzen" : "Leer lassen"}>
              {leer ? <Bot size={15} /> : <CircleOff size={15} />}
            </button>
          )}
        </div>
      );
    }
    if (t.art === "brett") {
      return (
        <div className="sa-panel sa-card">
          {ergebnisZeichnen ? (
            <>
              <div className="sa-result" style={ergebnisZeichnen.farbe ? { color: ergebnisZeichnen.farbe } : undefined}>{ergebnisZeichnen.text}</div>
              {ergebnisZeichnen.zeilen.map((z) => (
                <div key={z} className="sa-card-sub">{z}</div>
              ))}
            </>
          ) : ergebnis && partie?.spiel !== "zeichnen" ? (
            <>
              <div className="sa-result" style={ergebnis.farbe ? { color: ergebnis.farbe } : undefined}>{ergebnis.text}</div>
              {ergebnis.mit && <div className="sa-card-sub">mit {ergebnis.mit}</div>}
            </>
          ) : (
            !(view.host && view.spiele.length > 1) && <div className="sa-card-title">{spiel.name}</div>
          )}
          {meinSieg && (
            <ErgebnisTeilen className="sa-btn sa-btn-sm sa-btn-ghost"
              ergebnis={() => {
                const info = SPIELE[partie.spiel] || spiel;
                const bots = partie.besetzung.filter((b) => b.bot).length;
                return spieleabendErgebnis({
                  spielId: partie.spiel, spielName: info.name, menschen: partie.besetzung.length - bots, bots,
                  farbe: partie.spiel === "zeichnen" ? "" : info.farben?.[meinPlatz]?.name || "",
                  zeichnen: partie.spiel === "zeichnen"
                    ? { hochstapler: sicht.hochstapler === meinPlatz, erwischt: !!sicht.erwischt, richtig: !!sicht.richtig, wort: sicht.wort }
                    : null,
                });
              }} />
          )}
          {view.host && view.spiele.length > 1 && (
            <div className="sa-seg" role="group" aria-label="Spiel wählen">
              {view.spiele.map((s) => (
                <button key={s.id} type="button" aria-pressed={s.id === view.spiel} onClick={() => senden("sa:spiel", { spiel: s.id })}>
                  {SPIELE[s.id]?.kurz || s.name}
                </button>
              ))}
            </div>
          )}
          {view.host && !spielInfo?.ohneBots && view.stuehle.some((s, i) => s === null && !view.leer?.[i]) && (
            <div className="sa-seg" role="group" aria-label="Stärke der Bots">
              {BOT_STUFEN.map((s) => (
                <button key={s.id} type="button" aria-pressed={view.botStufe === s.id} onClick={() => senden("sa:botStufe", { stufe: s.id })}>
                  <Bot size={13} className="inline -mt-0.5 mr-1" />{s.name}
                </button>
              ))}
            </div>
          )}
          {view.host && view.leute.length === 1 && (
            <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={einladen}>
              {kopiert ? <Check size={14} /> : <Link2 size={14} />}{kopiert ? "Link kopiert" : "Freunde einladen"}
            </button>
          )}
          {view.host ? (
            <button type="button" className="sa-btn sa-btn-lg" onClick={() => senden("sa:start")}>
              {partie ? <RotateCcw size={17} /> : <Play size={17} />}
              {partie ? "Nochmal" : "Spiel starten"}
            </button>
          ) : (
            <div className="sa-card-sub" style={{ marginTop: 0 }}>{host ? `${host.name} startet ${spielInfo?.ohneBots ? "die nächste Runde" : "die Partie"}` : "Warte auf den Gastgeber"}</div>
          )}
        </div>
      );
    }
    return null;
  }

  // ── Statuszeile ────────────────────────────────────────────────────────────────────────
  let statusText = null;
  let statusFarbe = null;
  if (view && laeuft && view.spiel === "zeichnen") {
    const s = sicht;
    const zeit = rest !== null ? ` · ${rest} s` : "";
    if (s.phase === "wort") statusText = (s.rolle === "hochstapler" ? "Pst, lass dir nichts anmerken" : s.rolle ? "Merk dir das Wort" : "Gleich wird gezeichnet") + zeit;
    else if (s.phase === "zeichnen") {
      statusFarbe = spiel.farben[s.amZug]?.hex;
      const runde = Math.floor(s.zugNr / s.reihenfolge.length) + 1;
      statusText = `${binDran ? "Du bist dran: ein Strich, ohne abzusetzen" : `${nameAmPlatz(s.amZug)} zeichnet …`}${zeit} · Runde ${runde}/${s.runden}`;
    } else if (s.phase === "abstimmen") {
      const n = s.reihenfolge.filter((p) => !s.weg.includes(p)).length;
      if (meinPlatz < 0) statusText = `Abstimmung läuft (${s.gestimmt.length}/${n})${zeit}`;
      else if (s.meineStimme !== null) statusText = `Warte auf die anderen (${s.gestimmt.length}/${n})${zeit}`;
      else statusText = `Wer ist der Hochstapler? Verdächtige jemanden${zeit}`;
    } else if (s.phase === "raten") statusText = s.hochstapler === meinPlatz ? `Erwischt! Rate das Wort${zeit}` : `${nameAmPlatz(s.hochstapler)} wurde erwischt und rät das Wort …${zeit}`;
  } else if (view && laeuft && view.spiel === "maedn") {
    statusFarbe = spiel.farben[dran].hex;
    const name = nameAmPlatz(dran);
    const v = sicht.versuche;
    if (wurfRollt) statusText = binDran ? "Der Würfel rollt …" : `${name} würfelt …`;
    else if (binDran && sicht.phase === "ziehen") statusText = `Du hast eine ${sicht.wurf} — ${istTouch() ? "Figur zweimal antippen" : "wähle eine Figur"}`;
    else if (binDran && sicht.nochmal && sicht.wurf === 6) statusText = "Eine 6 — nochmal würfeln";
    else if (binDran && sicht.nochmal) statusText = `Eine ${sicht.wurf} — noch ${v} ${v === 1 ? "Versuch" : "Versuche"}`;
    else if (binDran) statusText = v === 3 ? "Du bist dran — drei Versuche für eine 6" : "Du bist dran — würfeln";
    else if (sicht.phase === "ziehen") statusText = `${name} hat eine ${sicht.wurf} und zieht …`;
    else statusText = partie.besetzung[dran]?.bot ? `${name} würfelt gleich …` : `${name} ist dran`;
  } else if (view && laeuft) {
    statusFarbe = spiel.farben[dran].hex;
    if (binDran) statusText = istTouch() ? "Du bist dran — Spalte zweimal antippen" : "Du bist dran — klick auf eine Spalte";
    else statusText = partie.besetzung[dran]?.bot ? `${nameAmPlatz(dran)} überlegt …` : `${nameAmPlatz(dran)} ist dran`;
  } else if (view && view.phase === "lobby") {
    if (ich === null) statusText = "Du schaust zu — am Tisch ist kein Platz mehr frei";
    else if (aufSofa) statusText = istTouch() ? "Auf dem Sofa" : "Auf dem Sofa · Mausrad: näher an den Tisch · Leertaste: aufstehen";
    else if (meinPlatz < 0) {
      const wurf = schneeZahl > 0 ? ` · F: Schneeball (${schneeZahl})` : " · F: Kissen";
      if (istTouch()) statusText = ansicht === "ich" ? "Wischen zum Umschauen, tippen zum Laufen · Stuhl antippen zum Mitspielen" : "Tippe auf den Boden zum Laufen · Stuhl antippen zum Mitspielen";
      else if (ansicht === "ich" && gesperrt) statusText = `WASD laufen · E oder Klick: benutzen · G: Gesten${wurf} · Esc: Menü`;
      else if (ansicht === "ich") statusText = "Klick ins Bild, dann schaust du mit der Maus umher · Esc: Menü";
      else statusText = `WASD oder Klick auf den Boden · G: Gesten${wurf} · Esc: Menü`;
    }
    else if (!partie && spielInfo?.ohneBots) {
      const sitzen = view.stuehle.filter((x) => x !== null).length;
      statusText = sitzen < spielInfo.minSpieler ? `Zum Zeichnen braucht es mindestens ${spielInfo.minSpieler} am Tisch (${sitzen} sitzen)` : view.host ? "Alle bereit? Dann starte die Runde" : `${host?.name || "Der Gastgeber"} startet die Runde`;
    } else if (!partie) statusText = view.host ? "Lade Freunde ein oder starte gegen einen Bot" : `${host?.name || "Der Gastgeber"} startet die Partie`;
  }

  const seo = <SEO title="Spieleabend" description="Spieleabend im 3D-Zimmer: Freunde per Link an den Tisch holen und zusammen 4 gewinnt oder Mensch ärgere dich nicht spielen — oder gegen Bots. Ohne Anmeldung, direkt im Browser." path="/spieleabend" />;

  if (ohne3d) {
    return (
      <div className="flex-1 grid place-items-center p-6 text-center">
        {seo}
        <div className="sa-panel p-6 max-w-md grid gap-3">
          <h1 className="font-extrabold text-xl">Das Zimmer braucht 3D</h1>
          <p className="text-[var(--sa-dim)]">Dein Browser kann die 3D-Ansicht gerade nicht zeigen. Mit eingeschalteter Hardwarebeschleunigung klappt es meistens.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`sa-stage${view && meinPlatz < 0 && ich !== null ? " sa-steht" : ""}`}>
      {seo}
      <canvas ref={canvasRef} aria-label="Spielzimmer mit Tisch" />
      <div className="sa-tags" aria-live="polite">
        {status === "da" &&
          schilder.map((t) => (
            <div key={t.key} ref={tagRef(t.key)} className="sa-tag" data-anker={t.art === "brett" ? spiel.brettSchild || "unten" : undefined} style={{ visibility: "hidden" }}>
              {schild(t)}
            </div>
          ))}
      </div>

      <div className="sa-hud">
        {view && (
          <div className="sa-panel sa-roombar">
            <span className="sa-code" title="Zimmer-Code">{view.code}</span>
            <button type="button" className="sa-btn sa-btn-sm" onClick={einladen} title="Link zum Zimmer kopieren">
              {kopiert ? <Check size={14} /> : <Link2 size={14} />}<span>{kopiert ? "Kopiert" : "Einladen"}</span>
            </button>
            {meinPlatz < 0 && ich !== null && (
              <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={ansichtWechseln} title="Ansicht wechseln (Taste V)">
                {ansicht === "ich" ? <Eye size={14} /> : <Camera size={14} />}
                <span>{ansicht === "ich" ? "Ich-Sicht" : "Von oben"}</span>
              </button>
            )}
            <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => setMenueOffen(true)} title="Menü: Ton, Maus, Leute, Einladen (Esc)">
              <Menu size={14} /><span>Menü</span>
            </button>
            {ich !== null && (
              <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => (rad ? szeneRef.current?.radZu(false) : szeneRef.current?.radAuf())} title="Gesten (Taste G halten oder 1–7)" aria-expanded={!!rad}>
                <Hand size={14} /><span>Gesten</span>
              </button>
            )}
            {schneeZahl > 0 && (
              <span className="sa-schnee" title="Schneebälle in der Hand">
                <Snowflake size={14} aria-hidden="true" />{schneeZahl}
              </span>
            )}
            <span className="sa-sep" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5 px-1 text-sm text-[var(--sa-dim)]" title="Im Zimmer">
              <Users size={14} />{view.leute.length}{view.zuschauer ? ` + ${view.zuschauer}` : ""}
            </span>
          </div>
        )}

        {!umkleide && (statusText || (view?.phase === "lobby" && meinPlatz >= 0) || (laeuft && view?.host)) && (
          <div className="sa-panel sa-status">
            {statusFarbe && <span className="sa-chip" style={{ background: statusFarbe }} />}
            {statusText && <span>{statusText}</span>}
            {kannWuerfeln && (
              <button type="button" className="sa-btn" onClick={wuerfeln} title="Würfeln (Leertaste)">
                <Dices size={16} />Würfeln
              </button>
            )}
            {view?.phase === "lobby" && meinPlatz >= 0 && (
              <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => senden("sa:platz", { platz: null })} title="Vom Spielstuhl aufstehen und zuschauen">
                <ArrowUpFromLine size={14} />Aufstehen
              </button>
            )}
            {aufSofa && (
              <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => senden("sa:sofa", { platz: null })} title="Vom Sofa aufstehen (Leertaste)">
                <ArrowUpFromLine size={14} />Aufstehen
              </button>
            )}
            {laeuft && view.host && (
              <button type="button" className="sa-btn sa-btn-sm sa-btn-ghost" onClick={() => senden("sa:beenden")} title="Partie abbrechen">
                <Square size={13} />Beenden
              </button>
            )}
          </div>
        )}

        {view && laeuft && view.spiel === "zeichnen" && sicht && (
          <div className="sa-panel sa-rolle" aria-live="polite">
            {sicht.rolle === "hochstapler" ? (
              <>
                <span className="sa-label">Deine Rolle</span>
                <b>Du bist der Hochstapler</b>
                <span>Kategorie: {sicht.kategorie} · zeichne, als wüsstest du das Wort</span>
              </>
            ) : sicht.rolle === "kuenstler" ? (
              <>
                <span className="sa-label">Dein Wort</span>
                <b>{sicht.wort}</b>
                <span>Kategorie: {sicht.kategorie}</span>
              </>
            ) : (
              <span>Kategorie: {sicht.kategorie}</span>
            )}
          </div>
        )}

        {view && laeuft && view.spiel === "zeichnen" && sicht?.phase === "raten" && sicht.hochstapler === meinPlatz && (
          <div className="absolute inset-0 grid place-items-center p-4 pointer-events-none">
            <form
              className="sa-panel p-5 grid gap-3 w-full max-w-sm pointer-events-auto"
              onSubmit={(e) => {
                e.preventDefault();
                senden("sa:zug", { aktion: { art: "raten", wort: rateText } });
              }}
            >
              <div className="font-extrabold text-lg">Erwischt! Welches Wort war es?</div>
              <div className="text-sm text-[var(--sa-dim)]">Kategorie: {sicht.kategorie}{rest !== null ? ` · noch ${rest} s` : ""}. Triffst du, gewinnst du trotzdem.</div>
              <input className="sa-input" value={rateText} onChange={(e) => setRateText(e.target.value)} maxLength={40} autoFocus aria-label="Dein Tipp" />
              <button type="submit" className="sa-btn" disabled={!rateText.trim()}>Raten</button>
            </form>
          </div>
        )}

        {gesperrt && !rad && !menueOffen && (
          <div className={`sa-faden${zielText ? " sa-faden-ziel" : ""}`} aria-hidden="true">
            <i />
            {zielText && (
              <span>
                <kbd>{zielTaste}</kbd>
                {zielText}
              </span>
            )}
          </div>
        )}

        {menueOffen && view && (
          <Menue
            view={view}
            link={link}
            kopiert={kopiert}
            mausTempo={mausTempo}
            onMausTempo={mausTempoAendern}
            onEinladen={einladen}
            onKicken={(id) => senden("sa:kicken", { person: id })}
            onWeiter={menueWeiter}
            onZu={() => setMenueOffen(false)}
          />
        )}

        {rad && (
          <GestenRad
            wahl={rad.wahl}
            klein={istTouch()}
            onWahl={(i) => szeneRef.current?.radWahl(i)}
            onMachen={(id) => {
              szeneRef.current?.radZu(false);
              szeneRef.current?.machGeste(id);
            }}
            onZu={() => szeneRef.current?.radZu(false)}
          />
        )}

        <div className="sa-toasts">
          {hinweise.map((h) => (
            <div key={h.id} className="sa-panel sa-toast">{h.text}</div>
          ))}
          {status === "getrennt" && <div className="sa-panel sa-toast">Verbindung weg — verbinde neu …</div>}
        </div>

        {(status === "verbinde" || status === "fehlt" || status === "fehler" || status === "raus") && (
          <div className="absolute inset-0 grid place-items-center p-4" style={{ pointerEvents: status === "verbinde" ? "none" : "auto" }}>
            <div className="sa-panel p-5 grid gap-3 justify-items-center text-center max-w-sm">
              {status === "verbinde" && (
                <div className="inline-flex items-center gap-2 font-semibold"><Loader2 size={18} className="animate-spin" />{code ? "Du kommst an den Tisch …" : "Das Zimmer wird hergerichtet …"}</div>
              )}
              {status === "fehlt" && (
                <>
                  <div className="font-extrabold text-lg">Dieses Zimmer gibt es nicht mehr</div>
                  <p className="text-[var(--sa-dim)] text-sm">Vielleicht sind alle gegangen. Öffne einfach ein neues und schick den Link herum.</p>
                  <button type="button" className="sa-btn" onClick={() => navigate("/spieleabend")}>Neues Zimmer öffnen</button>
                </>
              )}
              {status === "raus" && (
                <>
                  <div className="font-extrabold text-lg">Du wurdest hinausgeworfen</div>
                  <p className="text-[var(--sa-dim)] text-sm">In dieses Zimmer kommst du nicht mehr hinein. Öffne einfach ein eigenes und lade deine Leute ein.</p>
                  <button type="button" className="sa-btn" onClick={() => navigate("/spieleabend")}>Neues Zimmer öffnen</button>
                </>
              )}
              {status === "fehler" && (
                <>
                  <div className="font-extrabold text-lg">Das hat nicht geklappt</div>
                  <p className="text-[var(--sa-dim)] text-sm">{fehler}</p>
                  <button type="button" className="sa-btn" onClick={() => { setStatus("verbinde"); betreten(); }}>Nochmal versuchen</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {umkleide && <Umkleide entwurf={umkleide} onAendern={umkleideAendern} onFertig={umkleideFertig} onAbbrechen={umkleideAbbrechen} />}
    </div>
  );
}
