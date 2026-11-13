// engine/welt3d.js
// 2,5D-Ansicht der Farm (Fahrplan Phase 7): echter 3D-Boden mit Licht, Schatten und
// schräger Kamera — aber keine 3D-Modelle. Was steht, steht als Bildtafel darin.
//
// Wird erst beim Einschalten geladen (import() in GameContainer), three.js kommt
// damit nur zu denen, die die Ansicht benutzen.
//
// Maßstab: eine 3D-Einheit ist eine Kachel (TILE_SIZE Weltpixel). Die Ebene des
// Bodens ist x/z, z wächst wie die 2D-Welt nach unten (Süden) — die Kamera steht
// also im Süden und schaut schräg nach Norden, genau wie die Draufsicht „oben = hinten“.
//
// Der Boden besteht aus Kacheln (06.11., Feedback „Map ruckelt beim Laufen“): je 8×8 Felder
// eine eigene kleine Textur, gemalt vom 2D-Renderer (Renderer.maleBodenAusschnitt) —
// dieselben Bilder wie in 2D, nur liegend. Vorher war es EINE große Textur, die beim
// Laufen alle paar Felder und zusätzlich alle 3 s komplett neu gemalt und hochgeladen
// wurde; das kostete mehr als ein Bild und ruckelte. Jetzt kommen beim Laufen nur die
// neuen Kacheln am Rand dazu (wenige je Bild), aufgefrischt wird eine Kachel nach der
// anderen. Weiter draußen liegt eine grobe Fern-Ebene aus großen Kacheln.

import * as THREE from "three";
import { TILE_SIZE } from "./MapConfig";
import { spielStunde } from "./Tageszeit";

/** Kameraabstand in Kacheln bei Zoom 1 — größerer Zoom kommt näher. */
const ABSTAND = 22;
/** Neigung der Kamera über dem Boden (90° wäre senkrecht von oben). */
const NEIGUNG_GRAD = 52;
/**
 * Bodenkacheln: NAH fein mit den vorgemalten Bildern, FERN grob (eine Farbe je Feld,
 * runde Teiche), nur wenn weiter herausgezoomt ist. Fern liegt minimal tiefer.
 * felder = Kantenlänge in Feldern, ppk = Bildpunkte je Feld, budget = neue Kacheln je Bild.
 */
const KACHEL_ART = {
    nah: { felder: 8, ppk: 44, radiusMax: 34, hoehe: 0, budget: 2, auffrischenMs: 120, auffrischRadius: 18, nurFarben: false },
    fern: { felder: 32, ppk: 6, radiusMax: 140, hoehe: -0.04, budget: 1, auffrischenMs: 0, auffrischRadius: 0, nurFarben: true },
};
/** Tafel der Spielfigur: Leinwandgröße und wo der Fuß darauf steht. */
const FIGUR_PX = 192;
const FIGUR_FUSS_Y = 168;

const FARBE = {
    himmel: new THREE.Color("#cfe6ff"),
    erdeLicht: new THREE.Color("#5b6b3a"),
    sonne: new THREE.Color("#fff1d6"),
    abend: new THREE.Color("#ffb36b"),
    mond: new THREE.Color("#8fa7d8"),
    nachtHimmel: new THREE.Color("#2a3a66"),
    nebelTag: new THREE.Color("#9fb98a"),
    nebelNacht: new THREE.Color("#0f1a2a"),
    waldBoden: new THREE.Color("#1f3a1c"),
};

export default class Welt3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.aktiv = true;
        // Leistung (06.11.): ohne Kantenglättung und in CSS-Auflösung — der Boden ist
        // Pixelkunst, da sieht man keinen Unterschied, die Grafikkarte spart viel.
        const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
        r.setPixelRatio(1);
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFShadowMap;
        this.r = r;

        const scene = new THREE.Scene();
        scene.background = FARBE.nebelTag.clone();
        scene.fog = new THREE.Fog(FARBE.nebelTag.clone(), 40, 90);
        this.scene = scene;

        this.kamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 400);

        // Licht: Himmel/Boden als Grundhelligkeit, dazu eine Sonne mit Schatten, die
        // mit der Spieluhr über den Himmel wandert. Werte für three ab r155: Licht ist
        // physikalisch gerechnet, volle Helligkeit auf weißem Grund entspricht ~π.
        this.himmelLicht = new THREE.HemisphereLight(FARBE.himmel, FARBE.erdeLicht, 1.9);
        scene.add(this.himmelLicht);
        const sonne = new THREE.DirectionalLight(FARBE.sonne, 1.6);
        sonne.castShadow = true;
        sonne.shadow.mapSize.set(1024, 1024);
        const sk = sonne.shadow.camera;
        sk.left = -28; sk.right = 28; sk.top = 28; sk.bottom = -28; sk.near = 1; sk.far = 120;
        sonne.shadow.bias = -0.0008;
        sonne.shadow.normalBias = 0.02;
        scene.add(sonne);
        scene.add(sonne.target);
        this.sonne = sonne;

        // Außerhalb der Bodentextur: Waldboden bis zum Horizont, im Nebel verschwindend.
        const rand = new THREE.Mesh(
            new THREE.PlaneGeometry(1200, 1200),
            new THREE.MeshLambertMaterial({ color: FARBE.waldBoden }),
        );
        rand.rotation.x = -Math.PI / 2;
        rand.position.y = -0.1;
        rand.receiveShadow = true;
        scene.add(rand);
        this.rand = rand;

        // Boden: Kacheln je Art (siehe _kachelnAktualisieren)
        this._kacheln = {};
        for (const [name, art] of Object.entries(KACHEL_ART)) {
            this._kacheln[name] = { art, karte: new Map(), vorrat: [], geo: new THREE.PlaneGeometry(art.felder, art.felder), zuletztAufgefrischt: 0 };
        }

        // Spielfigur als Bildtafel: jedes Bild frisch vom 2D-Renderer gemalt
        // (Skin, Werkzeug, Namensschild — alles wie in 2D).
        this.figurLeinwand = document.createElement("canvas");
        this.figurLeinwand.width = FIGUR_PX;
        this.figurLeinwand.height = FIGUR_PX;
        this.figurTextur = new THREE.CanvasTexture(this.figurLeinwand);
        this.figurTextur.colorSpace = THREE.SRGBColorSpace;
        this.figur = this._tafel(this.figurTextur, FIGUR_PX, FIGUR_FUSS_Y);
        scene.add(this.figur);

        this._strahl = new THREE.Raycaster();
        this._ndc = new THREE.Vector2();
        this._ziel = new THREE.Vector3();
        this._groesse = { w: 0, h: 0 };
    }

    /**
     * Stehende Bildtafel mit Fußpunkt am Ursprung. Sie dreht sich mit der Kamera
     * (immer frontal), wirft aber einen Schatten — dafür die eigene Tiefen-Hülle
     * mit derselben Transparenz, sonst wäre der Schatten ein volles Rechteck.
     */
    _tafel(textur, px, fussPx) {
        const breite = px / TILE_SIZE;
        const geo = new THREE.PlaneGeometry(breite, breite);
        geo.translate(0, breite / 2 - (px - fussPx) / TILE_SIZE, 0);
        // Unsichtbar (colorWrite aus): die Figur selbst malt der 2D-Renderer obenauf,
        // die Tafel ist nur dafür da, dass die Sonne einen echten Schatten wirft.
        const mat = new THREE.MeshLambertMaterial({ map: textur, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: textur, alphaTest: 0.35 });
        return mesh;
    }

    _passeGroesseAn() {
        const w = this.canvas.clientWidth || 1;
        const h = this.canvas.clientHeight || 1;
        if (w === this._groesse.w && h === this._groesse.h) return;
        this._groesse = { w, h };
        this.r.setSize(w, h, false);
        this.kamera.aspect = w / h;
        this.kamera.updateProjectionMatrix();
    }

    _abstand(zoom) {
        return ABSTAND / Math.max(0.2, zoom || 1);
    }

    /** Bodenkacheln für den sichtbaren Bereich nachziehen. */
    _boden(state, renderer2d, fx, fz) {
        const abstand = this._abstand(state.zoom);
        const halb = Math.ceil(abstand * 1.2 + 4);
        const nahR = Math.min(halb, KACHEL_ART.nah.radiusMax);
        this._kachelnAktualisieren("nah", state, renderer2d, fx, fz, nahR);
        if (halb > KACHEL_ART.nah.radiusMax) this._kachelnAktualisieren("fern", state, renderer2d, fx, fz, Math.min(halb + 10, KACHEL_ART.fern.radiusMax));
        else this._kachelnAusblenden("fern");
    }

    _kachelnAusblenden(name) {
        const k = this._kacheln[name];
        for (const e of k.karte.values()) { e.mesh.visible = false; k.vorrat.push(e); }
        k.karte.clear();
    }

    _neueKachel(k) {
        const { art } = k;
        const leinwand = document.createElement("canvas");
        leinwand.width = art.felder * art.ppk;
        leinwand.height = art.felder * art.ppk;
        const textur = new THREE.CanvasTexture(leinwand);
        textur.colorSpace = THREE.SRGBColorSpace;
        textur.anisotropy = this.r.capabilities.getMaxAnisotropy();
        const mesh = new THREE.Mesh(k.geo, new THREE.MeshLambertMaterial({ map: textur }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        return { mesh, leinwand, textur, zeit: 0, cx: 0, cy: 0 };
    }

    _maleKachel(k, e, cx, cy, state, renderer2d) {
        const { art } = k;
        const T = TILE_SIZE;
        const kante = art.felder * T;
        // Knapp unter der vollen Kante: sonst zählt der Nachbar-Ausschnitt mit
        renderer2d.maleBodenAusschnitt(e.leinwand.getContext("2d"), state.layout, cx * kante, cy * kante, kante - 0.5, kante - 0.5, art.ppk / T, state.decoPlacements, true, art.nurFarben);
        e.textur.needsUpdate = true;
        e.mesh.position.set(cx * art.felder + art.felder / 2, art.hoehe, cy * art.felder + art.felder / 2);
        e.mesh.visible = true;
        e.cx = cx; e.cy = cy;
        e.zeit = performance.now();
    }

    /**
     * Fehlende Kacheln im Umkreis malen (nächste zuerst, höchstens budget je Bild —
     * beim allerersten Bild alle, das liegt noch unter dem Ladeschirm), zu weit
     * entfernte zurück in den Vorrat, und in Ruhe eine nahe Kachel auffrischen
     * (frische Felder, neue Beläge).
     */
    _kachelnAktualisieren(name, state, renderer2d, fx, fz, radius) {
        const k = this._kacheln[name];
        const { art } = k;
        const F = art.felder;
        const erstes = k.karte.size === 0;
        const cx0 = Math.floor((fx - radius) / F), cx1 = Math.floor((fx + radius) / F);
        const cy0 = Math.floor((fz - radius) / F), cy1 = Math.floor((fz + radius) / F);
        const gebraucht = new Set();
        const fehlend = [];
        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = cx + "," + cy;
                gebraucht.add(key);
                if (!k.karte.has(key)) {
                    const dx = cx * F + F / 2 - fx, dz = cy * F + F / 2 - fz;
                    fehlend.push([cx, cy, dx * dx + dz * dz]);
                }
            }
        }
        for (const [key, e] of k.karte) {
            if (gebraucht.has(key)) continue;
            e.mesh.visible = false;
            k.vorrat.push(e);
            k.karte.delete(key);
        }
        fehlend.sort((a, b) => a[2] - b[2]);
        const n = erstes ? fehlend.length : Math.min(art.budget, fehlend.length);
        for (let i = 0; i < n; i++) {
            const [cx, cy] = fehlend[i];
            const e = k.vorrat.pop() || this._neueKachel(k);
            this._maleKachel(k, e, cx, cy, state, renderer2d);
            k.karte.set(cx + "," + cy, e);
        }
        const jetzt = performance.now();
        if (art.auffrischenMs && fehlend.length === 0 && jetzt - k.zuletztAufgefrischt > art.auffrischenMs) {
            k.zuletztAufgefrischt = jetzt;
            let aelteste = null;
            const r2 = art.auffrischRadius * art.auffrischRadius;
            for (const e of k.karte.values()) {
                const dx = e.cx * F + F / 2 - fx, dz = e.cy * F + F / 2 - fz;
                if (dx * dx + dz * dz > r2) continue;
                if (!aelteste || e.zeit < aelteste.zeit) aelteste = e;
            }
            if (aelteste) this._maleKachel(k, aelteste, aelteste.cx, aelteste.cy, state, renderer2d);
        }
    }

    /** Sonne und Himmel nach Spieluhr und Dunkelheit (0 Tag … ~0,7 tiefe Nacht). */
    _licht(nacht, mitte) {
        const n = Math.max(0, Math.min(1, (Number(nacht) || 0) / 0.7));
        const stunde = spielStunde(Date.now());
        // Sonne von Ost (6 Uhr) über Süd (12) nach West (18); nachts steht der Mond fest.
        const tag = Math.max(0, Math.min(1, (stunde - 6) / 12));
        const winkel = Math.PI * tag;
        const hoehe = n > 0.6 ? 0.9 : 0.35 + Math.sin(winkel) * 0.75;
        const richtung = new THREE.Vector3(
            n > 0.6 ? -0.4 : Math.cos(winkel) * 0.9,
            hoehe,
            n > 0.6 ? -0.3 : 0.55,
        ).normalize();
        this.sonne.position.copy(mitte).addScaledVector(richtung, 50);
        this.sonne.target.position.copy(mitte);
        // Morgens und abends wärmer, nachts kühles Mondlicht
        const warm = Math.max(0, 1 - Math.sin(winkel) * 1.6);
        this.sonne.color.copy(FARBE.sonne).lerp(FARBE.abend, warm * 0.6).lerp(FARBE.mond, n);
        this.sonne.intensity = 1.6 * (1 - n) + 0.35 * n;
        this.himmelLicht.color.copy(FARBE.himmel).lerp(FARBE.nachtHimmel, n);
        this.himmelLicht.intensity = 1.9 * (1 - n) + 0.55 * n;
        const nebel = FARBE.nebelTag.clone().lerp(FARBE.nebelNacht, n);
        this.scene.fog.color.copy(nebel);
        this.scene.background.copy(nebel);
    }

    _figur(state, player, renderer2d) {
        const ctx = this.figurLeinwand.getContext("2d");
        ctx.clearRect(0, 0, FIGUR_PX, FIGUR_PX);
        // Der 2D-Renderer malt immer in this.ctx — kurz auf die Tafel umlenken.
        // Fuß der Figur liegt 20 px unter player.y (siehe drawPlayer).
        const altCtx = renderer2d.ctx;
        const stellvertreter = Object.create(player);
        stellvertreter.x = FIGUR_PX / 2;
        stellvertreter.y = FIGUR_FUSS_Y - 20;
        try {
            renderer2d.ctx = ctx;
            renderer2d.drawPlayer(
                stellvertreter, state.selectedTool, state.heldItem, state.localPlayerName,
                state.playerAppearance || {}, state.playerBadge, "local", state.playerNameplate,
            );
        } finally {
            renderer2d.ctx = altCtx;
        }
        this.figurTextur.needsUpdate = true;
        this.figur.position.set(player.x / TILE_SIZE, 0, (player.y + 20) / TILE_SIZE);
        this.figur.quaternion.copy(this.kamera.quaternion);
    }

    /** Ein Bild der 3D-Welt. Wird statt renderer.draw aus der Spielschleife gerufen. */
    zeichne(state, player, renderer2d) {
        if (!this.aktiv || !state?.layout) return;
        this._passeGroesseAn();
        const fx = player.x / TILE_SIZE;
        const fz = player.y / TILE_SIZE;
        const abstand = this._abstand(state.zoom);
        const neigung = THREE.MathUtils.degToRad(NEIGUNG_GRAD);
        this._ziel.set(fx, 0.6, fz);
        this.kamera.position.set(fx, 0.6 + Math.sin(neigung) * abstand, fz + Math.cos(neigung) * abstand);
        this.kamera.lookAt(this._ziel);
        this.scene.fog.near = abstand * 1.6;
        this.scene.fog.far = abstand * 3.4 + 20;

        this._boden(state, renderer2d, fx, fz);
        this._licht(state.nacht, this._ziel);
        this._figur(state, player, renderer2d);
        this.r.render(this.scene, this.kamera);
    }

    /**
     * Weltpixel am Boden → Punkt auf der 2D-Leinwand (breite × hoehe Pixel), dazu
     * `s` = Bildschirmpixel je Weltpixel an dieser Stelle und `nebel` 0..1. Gibt
     * false zurück, wenn der Punkt hinter der Kamera liegt.
     */
    projiziere(wx, wy, out, breite, hoehe) {
        const v = this._pv || (this._pv = new THREE.Vector3());
        v.set(wx / TILE_SIZE, 0, wy / TILE_SIZE);
        const d = v.distanceTo(this.kamera.position);
        v.project(this.kamera);
        if (v.z > 1) return false;
        const sx = (v.x + 1) * 0.5 * breite;
        const sy = (1 - v.y) * 0.5 * hoehe;
        v.set(wx / TILE_SIZE + 1, 0, wy / TILE_SIZE).project(this.kamera);
        out.sx = sx;
        out.sy = sy;
        out.s = (((v.x + 1) * 0.5 * breite) - sx) / TILE_SIZE;
        const nah = this.scene.fog.near, fern = this.scene.fog.far;
        const t = Math.max(0, Math.min(1, (d - nah) / Math.max(1, fern - nah)));
        out.nebel = t * t * (3 - 2 * t);
        return out.s > 0;
    }

    /**
     * Welcher Teil des Bodens ist zu sehen? Strahlen durch die vier Bildschirmecken,
     * nach hinten auf die Nebelweite gekappt, unten etwas zugegeben — ein hoher Baum
     * kann mit dem Fuß unter dem Bildrand stehen und trotzdem hineinragen.
     */
    sichtGrenzen() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const p = this.bildschirmZuWelt(rect.left + fx * rect.width, rect.top + fy * rect.height);
            if (!p) continue;
            x0 = Math.min(x0, p.worldX); x1 = Math.max(x1, p.worldX);
            y0 = Math.min(y0, p.worldY); y1 = Math.max(y1, p.worldY);
        }
        if (!Number.isFinite(x0)) return null;
        const T = TILE_SIZE;
        const weit = this.scene.fog.far * T;
        const zx = this._ziel.x * T, zy = this._ziel.z * T;
        return {
            x0: Math.max(x0, zx - weit) - 2 * T,
            x1: Math.min(x1, zx + weit) + 2 * T,
            y0: Math.max(y0, zy - weit) - 2 * T,
            y1: y1 + 5 * T,
        };
    }

    /**
     * Bildschirmpunkt → Weltpixel auf dem Boden (Strahl gegen die Ebene y = 0).
     * Gegenstück zu toWorld in hooks/useSpielflaecheMaus.js für die 2D-Ansicht.
     */
    bildschirmZuWelt(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this._strahl.setFromCamera(this._ndc, this.kamera);
        const { origin, direction } = this._strahl.ray;
        if (direction.y >= -1e-4) return null;
        const t = -origin.y / direction.y;
        return {
            worldX: (origin.x + direction.x * t) * TILE_SIZE,
            worldY: (origin.z + direction.z * t) * TILE_SIZE,
        };
    }

    dispose() {
        this.aktiv = false;
        this.scene.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                o.material.map?.dispose?.();
                o.material.dispose();
            }
            o.customDepthMaterial?.dispose?.();
        });
        for (const k of Object.values(this._kacheln)) {
            for (const e of [...k.karte.values(), ...k.vorrat]) {
                e.textur.dispose();
                // Leinwand-Speicher sofort freigeben
                e.leinwand.width = 0;
                e.leinwand.height = 0;
            }
            k.geo.dispose();
        }
        this.figurTextur?.dispose();
        this.r.dispose();
    }
}
