// hooks/useFarmSound.js
// Klänge und Musik der Farm: Lautstärken (in localStorage gemerkt), Musiktitel (Thema oder
// Party-Titel), Audio-Freischaltung nach der ersten Nutzer-Eingabe (Autoplay-Regeln) und
// playSound für alle Effekte. Ausgelagert aus GameContainer.jsx, Code unverändert.
import { useState, useEffect, useRef, useCallback } from "react";
import { partyTrack, themeTrack } from "../engine/gameConstants";


const KETTEN_TOENE = { harvest: "/garden-assets/sounds/harvest.mp3", plant: "/garden-assets/sounds/plant.mp3" };
const KETTE_MIN_ABSTAND_MS = 55;
// Wer innerhalb dieser Zeit erneut erntet, setzt die Kette fort (Tonhöhe steigt).
const ERNTE_KETTE_MS = 900;
// Dur-Pentatonik über zwei Oktaven: klingt in jeder Länge melodisch, nie schief.
const ERNTE_KETTE_HALBTOENE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export default function useFarmSound({ showLobbyScreen, tagesInfo, themeId }) {
    const [effectVolume, setEffectVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_effect_volume");
        if (saved !== null) return parseFloat(saved);
        const old = localStorage.getItem("garden_farms_volume");
        return old !== null ? parseFloat(old) : 0.5;
    });
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem("garden_farms_music_volume");
        return saved !== null ? parseFloat(saved) : 0.1;
    });

    const effectVolumeRef = useRef(effectVolume);
    useEffect(() => {
        effectVolumeRef.current = effectVolume;
        localStorage.setItem("garden_farms_effect_volume", effectVolume.toString());
    }, [effectVolume]);

    const musicVolumeRef = useRef(musicVolume);
    useEffect(() => {
        musicVolumeRef.current = musicVolume;
        localStorage.setItem("garden_farms_music_volume", musicVolume.toString());
        if (soundsRef.current?.music) soundsRef.current.music.volume = musicVolume;
    }, [musicVolume]);

    /**
     * Welcher Titel gerade laufen soll: während der Party der Party-Titel, sonst das
     * gewählte Thema. Beides läuft über DIESELBE Audio-Instanz, damit der Musikregler
     * für beides gilt — ein zweites Audio-Objekt hätte seine eigene Lautstärke.
     */
    const laufenderPartyTitel = tagesInfo.party ? partyTrack(tagesInfo.partyBeginn || Date.now()) : null;
    const aktuellerTitel = laufenderPartyTitel ? laufenderPartyTitel.src : themeTrack(themeId).src;
    const aktuellerTitelRef = useRef(aktuellerTitel);
    useEffect(() => {
        aktuellerTitelRef.current = aktuellerTitel;
        localStorage.setItem("garden_farms_theme", themeId);
        const musik = soundsRef.current?.music;
        if (!musik) return;
        // `src` ist beim Vergleich absolut, der Katalog führt relative Pfade.
        if (musik.src.endsWith(aktuellerTitel)) return;
        musik.src = aktuellerTitel;
        musik.volume = musicVolumeRef.current;
        musik.currentTime = 0;
        if (!showLobbyScreenRef.current) musik.play().catch(() => {});
    }, [aktuellerTitel, themeId]);

    const showLobbyScreenRef = useRef(showLobbyScreen);
    useEffect(() => {
        showLobbyScreenRef.current = showLobbyScreen;
        if (soundsRef.current?.music) {
            if (showLobbyScreen) soundsRef.current.music.pause();
            else soundsRef.current.music.play().catch(() => {});
        }
    }, [showLobbyScreen]);

    const soundsRef = useRef(null); // lazy nach erster Nutzer-Interaktion (Autoplay-Policy)
    const audioUnlockedRef = useRef(false);
    const ernteTonStartenRef = useRef(null);

    const ensureGardenSounds = useCallback(() => {
        if (soundsRef.current || typeof window === "undefined") return;
        // Der Titel steht in einem Ref, nicht im State: dieser Aufbau läuft beim
        // allerersten Klick und darf nicht an einem Rendervorgang hängen.
        const musicObj = new Audio(aktuellerTitelRef.current);
        musicObj.loop = true;
        musicObj.volume = musicVolumeRef.current;
        soundsRef.current = {
            rotation: new Audio("/garden-assets/sounds/rotation.mp3"),
            open: new Audio("/garden-assets/sounds/menu_open.mp3"),
            close: new Audio("/garden-assets/sounds/menu_close.mp3"),
            buy: new Audio("/garden-assets/sounds/kaching.mp3"),
            cash: new Audio("/garden-assets/sounds/cash.mp3"),
            rain: new Audio("/garden-assets/sounds/rain.mp3"),
            thunder: new Audio("/garden-assets/sounds/thunder.mp3"),
            plant: new Audio("/garden-assets/sounds/plant.mp3"),
            harvest: new Audio("/garden-assets/sounds/harvest.mp3"),
            shotgun: new Audio("/garden-assets/sounds/shotgun.mp3"),
            music: musicObj,
        };
        if (!showLobbyScreenRef.current) {
            musicObj.play().catch(() => {});
        }
        audioUnlockedRef.current = true;
    }, []);

    useEffect(() => {
        const unlock = () => {
            ensureGardenSounds();
            // Die Audio-Engine für den Ernte-Ton gleich hier starten: Browser lassen sie
            // nur aus einem Klick/Tastendruck heraus laufen. Entstand sie erst beim
            // Drüberziehen (pointermove), blieb sie stumm geschaltet (06.11.).
            ernteTonStartenRef.current?.();
        };
        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("keydown", unlock, { passive: true });
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, [ensureGardenSounds]);

    useEffect(() => {
        return () => {
            if (soundsRef.current?.music) {
                soundsRef.current.music.pause();
                soundsRef.current.music.src = "";
            }
            soundsRef.current = null;
        };
    }, []);

    const playSound = useCallback((type, volumeScale = 1.0) => {
        if (!audioUnlockedRef.current) return;
        const audio = soundsRef.current?.[type];
        if (!audio || type === "music") return;
        audio.volume = effectVolumeRef.current * volumeScale;
        audio.currentTime = 0;
        audio.play().catch(() => {});
    }, []);

    /**
     * Ernte-Ton mit Kette (04.11., Wunsch „Schnell-Einsammeln … Sound verbessern“).
     *
     * Vorher spielte jede Ernte bzw. jedes gesammelte Bündel beim Shift-Ziehen dasselbe
     * <audio>-Element von vorn — ein neuer Ton schnitt den laufenden ab, ein langer Zug
     * klang abgehackt und unregelmäßig. Jetzt per WebAudio: jeder Ton ist eine eigene
     * Quelle (sie überlagern sich), und wer schnell hintereinander erntet, hört die
     * Tonhöhe auf einer Pentatonik steigen. Ohne WebAudio greift der alte Weg.
     */
    // 06.11. (Feedback „Sound überlappt, Steigerung nur bei Multi“): steigende Kette nur
    // beim Shift-Ziehen über mehrere Zellen; ein einzelner Klick spielt immer den Grundton.
    // Pflanzen nutzt dieselbe Technik mit eigenem Ton. Ein neuer Kettenton blendet den
    // vorigen kurz aus, statt dass sich ein Dutzend Töne zu einem Brei stapeln.
    const ernteTonRef = useRef({ ctx: null, puffer: {}, laedt: {}, aktiv: [], stufe: {}, zuletzt: {} });
    const ladeTon = (t, art) => {
        if (!t.ctx || t.puffer[art] || t.laedt[art]) return;
        t.laedt[art] = true;
        fetch(KETTEN_TOENE[art])
            .then((res) => res.arrayBuffer())
            .then((b) => t.ctx.decodeAudioData(b))
            .then((p) => { t.puffer[art] = p; })
            .catch(() => { t.laedt[art] = false; });
    };
    // Engine anlegen/fortsetzen und Töne laden — aus dem Klick heraus (siehe unlock oben)
    ernteTonStartenRef.current = () => {
        const t = ernteTonRef.current;
        if (!t.ctx) {
            const Ctx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
            try { t.ctx = Ctx ? new Ctx() : null; } catch { t.ctx = null; }
        }
        if (t.ctx && t.ctx.state === "suspended") t.ctx.resume().catch(() => {});
        for (const art of Object.keys(KETTEN_TOENE)) ladeTon(t, art);
    };
    const spieleKettenTon = useCallback((art, lautstaerke, kette) => {
        if (!audioUnlockedRef.current) return;
        const t = ernteTonRef.current;
        const jetzt = performance.now();
        const zuletzt = t.zuletzt[art] || 0;
        // Beim Ziehen höchstens alle 55 ms ein Ton — schneller verschwimmt es nur
        if (kette && jetzt - zuletzt < KETTE_MIN_ABSTAND_MS) return;
        t.stufe[art] = kette && jetzt - zuletzt < ERNTE_KETTE_MS
            ? Math.min((t.stufe[art] || 0) + 1, ERNTE_KETTE_HALBTOENE.length - 1)
            : 0;
        t.zuletzt[art] = jetzt;
        if (!t.ctx) ernteTonStartenRef.current?.();
        if (!t.ctx || !t.puffer[art] || t.ctx.state !== "running") {
            if (t.ctx) { ladeTon(t, art); if (t.ctx.state !== "running") t.ctx.resume().catch(() => {}); }
            playSound(art, lautstaerke);
            return;
        }
        const ctx = t.ctx;
        // Laufende Töne derselben Art sanft ausblenden
        for (const alt of t.aktiv) {
            if (alt.art !== art) continue;
            try {
                alt.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
                alt.quelle.stop(ctx.currentTime + 0.12);
            } catch { /* schon zu Ende */ }
        }
        const quelle = ctx.createBufferSource();
        quelle.buffer = t.puffer[art];
        quelle.playbackRate.value = Math.pow(2, ERNTE_KETTE_HALBTOENE[t.stufe[art]] / 12);
        const gain = ctx.createGain();
        gain.gain.value = effectVolumeRef.current * lautstaerke;
        quelle.connect(gain).connect(ctx.destination);
        const eintrag = { art, quelle, gain };
        quelle.onended = () => { t.aktiv = t.aktiv.filter((e) => e !== eintrag); };
        t.aktiv.push(eintrag);
        quelle.start();
    }, [playSound]);
    const spieleErnteTon = useCallback((lautstaerke = 0.45, kette = false) => spieleKettenTon("harvest", lautstaerke, kette), [spieleKettenTon]);
    const spielePflanzTon = useCallback((lautstaerke = 0.5, kette = false) => spieleKettenTon("plant", lautstaerke, kette), [spieleKettenTon]);

    useEffect(() => () => {
        const ctx = ernteTonRef.current.ctx;
        if (ctx) ctx.close().catch(() => {});
    }, []);

    return { effectVolume, setEffectVolume, musicVolume, setMusicVolume, laufenderPartyTitel, playSound, spieleErnteTon, spielePflanzTon };
}
