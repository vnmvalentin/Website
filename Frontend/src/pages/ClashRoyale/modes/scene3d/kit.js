// Gemeinsamer Baukasten für die 3D-Szenen der Minigames (Pyramide, Auktion, Angel, …):
//
//   • createPostFX: Kantenglättung (MSAA im Zwischenbild), dezentes Bloom NUR für sehr helle
//     Stellen (Feuer, Sonne — Karten und Schrift liegen weit unter der Schwelle), Tonwerte,
//     Vignette. Ersetzt renderer.render(); setSize gleich danach neu zeichnen (sonst Blitz).
//   • neutralEnvironment: Umgebungsreflexe für Metall (Gold glänzt erst damit).
//   • normalFromHeight: Normal-Map aus einem gemalten Graustufen-Höhenbild — Fugen und
//     eingeritzte Zeichen fangen so echtes Licht statt nur aufgemalt zu sein.
//   • flameMaterial / beamMaterial / skyMaterial: Shader für Feuer, Lichtstrahl, Himmel.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// CC0-Assets (Poly Haven) liegen ungehasht unter public/media/cr3d/ — siehe README dort.
export const MEDIA = '/media/cr3d';

/**
 * Lädt Fototexturen, Himmel und Modelle für eine Szene. Alles wird mitgezählt: ready() löst auf,
 * sobald alles da ist (oder nach timeoutMs — die Szene läuft dann mit dem, was schon geladen ist).
 * Fehlschläge brechen nichts ab, die Oberfläche behält dann ihre Grundfarbe.
 */
export function createAssets(renderer, { timeoutMs = 9000 } = {}) {
  const owned = [];
  const manager = new THREE.LoadingManager();
  let pending = 0;
  let resolveReady;
  const readyPromise = new Promise((r) => { resolveReady = r; });
  const timer = setTimeout(() => resolveReady(false), timeoutMs);
  const track = (p) => {
    pending++;
    return p.finally(() => { pending--; if (pending === 0) { clearTimeout(timer); resolveReady(true); } });
  };
  const texLoader = new THREE.TextureLoader(manager);
  // Modelle liegen als .glb mit meshopt-Kompression und WebP-Texturen vor (gltf-transform)
  const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const gltfCache = new Map();
  const loadGltf = (id) => {
    if (!gltfCache.has(id)) {
      gltfCache.set(id, track(new Promise((res) => {
        gltfLoader.load(`${MEDIA}/models/${id}.glb`, (g) => {
          g.scene.traverse((m) => {
            if (!m.isMesh) return;
            owned.push(m.geometry);
            [].concat(m.material).forEach((mat) => {
              owned.push(mat);
              ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((k) => mat[k] && owned.push(mat[k]));
            });
          });
          res(g.scene);
        }, undefined, () => res(null));
      })));
    }
    return gltfCache.get(id);
  };
  const hdrLoader = new HDRLoader(manager);
  const texCache = new Map();
  const loadTex = (url, srgb) => {
    if (!texCache.has(url)) {
      texCache.set(url, track(new Promise((res) => {
        texLoader.load(url, (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = renderer.capabilities.getMaxAnisotropy?.() >= 8 ? 8 : 4;
          owned.push(t);
          res(t);
        }, undefined, () => res(null));
      })));
    }
    return texCache.get(url);
  };
  const variant = (t, rx, ry) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    owned.push(c);
    return c;
  };

  return {
    ready: () => readyPromise,
    get pending() { return pending; },
    /**
     * Poly-Haven-Material (diff/nor/arm) auf ein MeshStandardMaterial legen, sobald geladen.
     * arm = R: Umgebungsverdeckung, G: Rauheit, B: Metall.
     */
    pbr(material, id, rx = 1, ry = rx, { normalScale = 1, ao = 1, noMap = false, noArm = false } = {}) {
      const base = `${MEDIA}/tex/${id}`;
      Promise.all([loadTex(`${base}/diff.webp`, true), loadTex(`${base}/nor.webp`, false), loadTex(`${base}/arm.webp`, false)])
        .then(([d, n, a]) => {
          if (d && !noMap) material.map = variant(d, rx, ry);
          if (n) { material.normalMap = variant(n, rx, ry); material.normalScale.set(normalScale, normalScale); }
          // noArm: eigene Rauheit behalten (z. B. nasse Stellen aus einer gemalten Karte)
          if (a && !noArm) {
            const arm = variant(a, rx, ry);
            material.roughnessMap = arm;
            material.aoMap = arm;
            material.aoMapIntensity = ao;
            material.roughness = 1;
          }
          material.needsUpdate = true;
        });
      return material;
    },
    /** Himmel: HDR fürs Licht (PMREM), großes JPG als sichtbarer Hintergrund. */
    sky(scene, id, { onLoaded } = {}) {
      track(new Promise((res) => {
        hdrLoader.load(`${MEDIA}/hdri/${id}_1k.hdr`, (hdr) => {
          hdr.mapping = THREE.EquirectangularReflectionMapping;
          const pmrem = new THREE.PMREMGenerator(renderer);
          const rt = pmrem.fromEquirectangular(hdr);
          pmrem.dispose();
          hdr.dispose();
          owned.push(rt);
          scene.environment = rt.texture;
          onLoaded?.('env', rt.texture);
          res();
        }, undefined, () => res());
      }));
      loadTex(`${MEDIA}/hdri/${id}_4k.jpg`, true).then((t) => {
        if (!t) return;
        t.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = t;
        onLoaded?.('background', t);
      });
    },
    /**
     * GLTF-Modell laden und auf Zielhöhe skalieren (Fuß auf y=0, mittig). Liefert eine Gruppe
     * sofort (leer, bis das Modell da ist) — so kann man sie gleich platzieren und klonen.
     */
    /**
     * GLTF-Modell laden und auf Zielhöhe skalieren (Fuß auf y=0, mittig). Liefert eine Gruppe
     * sofort (leer, bis das Modell da ist) — so kann man sie gleich platzieren und klonen.
     * part: bei Sets (mehrere Varianten in einer Datei) nur den Teil, dessen Name so endet.
     * Materialien werden je Aufruf geklont, damit tweak() nur diese Verwendung betrifft.
     */
    model(id, height, { castShadow = true, receiveShadow = true, tweak, part } = {}) {
      const holder = new THREE.Group();
      loadGltf(id).then((scene) => {
        if (!scene) return;
        let src = scene;
        if (part != null) src = scene.children.find((c) => c.name.endsWith(part)) || scene;
        const root = src.clone(true);
        root.position.set(0, 0, 0);
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const s = height / (size.y || 1);
        root.scale.multiplyScalar(s);
        root.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
        root.traverse((m) => {
          if (!m.isMesh) return;
          m.castShadow = castShadow;
          m.receiveShadow = receiveShadow;
          if (tweak) {
            m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
            [].concat(m.material).forEach((mat) => { owned.push(mat); tweak(mat, m); });
          }
        });
        holder.add(root);
        holder.userData.loaded = true;
        holder.dispatchEvent({ type: 'loaded' });
      });
      return holder;
    },
    dispose() {
      clearTimeout(timer);
      owned.forEach((o) => o.dispose?.());
    },
  };
}

/**
 * Viele Kopien eines Modells als InstancedMesh (ein Zeichenaufruf je Teilnetz statt je Kopie).
 * transforms: [{ x, y, z, s, ry }]. Liefert eine Gruppe, die sich füllt, sobald das Modell da ist.
 */
export function scatter(holder, transforms, { castShadow = false, receiveShadow = true } = {}) {
  const out = new THREE.Group();
  const fill = () => {
    holder.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
    const dummy = new THREE.Object3D();
    holder.traverse((m) => {
      if (!m.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const im = new THREE.InstancedMesh(m.geometry, m.material, transforms.length);
      transforms.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.ry || 0, 0);
        dummy.scale.setScalar(t.s || 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix.clone().multiply(local));
      });
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.computeBoundingSphere();
      im.userData.sharedGeometry = true; // gehört dem Modell — beim Aufräumen nicht freigeben
      out.add(im);
    });
  };
  if (holder.userData.loaded) fill();
  else holder.addEventListener('loaded', fill);
  return out;
}

/** Kopie einer (evtl. noch leeren) Modell-Gruppe: wartet, bis das Modell geladen ist. */
export function cloneModel(holder) {
  const g = new THREE.Group();
  const fill = () => holder.children.forEach((c) => {
    const cl = c.clone(true);
    // Geometrie gehört der Vorlage — beim Aufräumen der Kopie nicht freigeben
    cl.traverse((m) => { if (m.isMesh) m.userData.sharedGeometry = true; });
    g.add(cl);
  });
  if (holder.userData.loaded) fill();
  else holder.addEventListener('loaded', fill);
  return g;
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.3 }, uWarm: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uAmount; uniform vec3 uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - uAmount * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(c.rgb * v * uWarm, c.a);
    }`,
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{bloom?: {strength:number, radius:number, threshold:number}|false, vignette?: number, warm?: number[]}} opts
 */
export function createPostFX(renderer, scene, camera, opts = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let bloom = null;
  if (opts.bloom !== false) {
    const b = opts.bloom || { strength: 0.32, radius: 0.45, threshold: 1.05 };
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), b.strength, b.radius, b.threshold);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.uAmount.value = opts.vignette ?? 0.3;
  if (opts.warm) vignette.uniforms.uWarm.value.set(...opts.warm);
  composer.addPass(vignette);
  return {
    composer, bloom, vignette, renderPass,
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    render(dt) { composer.render(dt); },
    dispose() {
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
      target.dispose();
    },
  };
}

/**
 * Alle Shader übersetzen und alle Texturen auf die Grafikkarte laden, solange die Szene noch
 * verdeckt ist. Sonst passiert das erst, wenn ein Objekt zum ersten Mal ins Bild kommt — mitten in
 * einer Kamerafahrt, und die Fahrt bleibt für einen Moment stehen. `groups` werden dafür kurz
 * sichtbar geschaltet (und danach wiederhergestellt).
 */
export function warmUp(renderer, scene, camera, post, groups = []) {
  const vis = groups.map((g) => g.visible);
  groups.forEach((g) => { g.visible = true; });
  renderer.compile(scene, camera);
  const seen = new Set();
  scene.traverse((m) => {
    [].concat(m.material || []).forEach((mat) => {
      Object.values(mat).forEach((v) => { if (v?.isTexture && !seen.has(v)) { seen.add(v); renderer.initTexture(v); } });
    });
  });
  if (scene.background?.isTexture) renderer.initTexture(scene.background);
  if (post) post.render(0); else renderer.render(scene, camera);
  groups.forEach((g, i) => { g.visible = vis[i]; });
}

/**
 * Senkt die Auflösung stufenweise (bis 1), wenn Bilder im Mittel länger als 24 ms brauchen
 * (über ~1,5 s). Aufruf je Bild mit dt; onChange() soll Zeichenfläche + Nachbearbeitung neu setzen.
 */
export function createQualityGovernor(renderer, startRatio, onChange) {
  let ratio = startRatio, slowFor = 0, avg = 1 / 60;
  renderer.setPixelRatio(ratio);
  return (dt) => {
    avg += (dt - avg) * 0.1;
    slowFor = avg > 0.024 ? slowFor + dt : 0;
    if (slowFor > 1.5 && ratio > 1) {
      ratio = Math.max(1, ratio - 0.25);
      renderer.setPixelRatio(ratio);
      onChange();
      slowFor = 0;
      avg = 1 / 60;
    }
  };
}

/** Neutrale Studio-Umgebung für Reflexe (Gold, lackiertes Holz). Liefert { texture, dispose }. */
export function neutralEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  room.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  pmrem.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

/**
 * Normal-Map aus einem Graustufen-Canvas (hell = hoch). Sobel-Filter, Ränder wiederholen sich
 * (für kachelnde Texturen). strength ≈ wie steil die Kanten wirken.
 */
export function normalFromHeight(heightCanvas, strength = 2, rx = 1, ry = rx) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      // Canvas-Zeilen laufen nach unten, Textur-v nach oben → dy mit umgekehrtem Vorzeichen
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 8;
  return tex;
}

const NOISE_GLSL = /* glsl */`
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

/**
 * Lebendige Flamme auf einer Fläche (Fläche jedes Bild zur Kamera drehen). Additiv, HDR-hell —
 * genau das, was das Bloom aufgreift. uniforms.uTime je Bild setzen.
 */
export function flameMaterial(intensity = 2.6, seed = Math.random() * 10) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uSeed; uniform float uIntensity;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float t = uTime * 1.5 + uSeed;
        float y = vUv.y;
        float n = fbm(vec2(vUv.x * 3.2 + uSeed, y * 2.6 - t * 2.2));
        float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * y;
        float width = mix(0.85, 0.05, pow(y, 0.8));
        float shape = 1.0 - smoothstep(width * 0.45, width, abs(x));
        shape *= smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.45, 0.95, y + (n - 0.5) * 0.45));
        float core = clamp(shape * (1.15 - y), 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.1, 0.5, core));
        col = mix(col, vec3(1.0, 0.93, 0.75), smoothstep(0.55, 0.95, core));
        gl_FragColor = vec4(col * shape * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Weicher Lichtstrahl auf einem offenen Zylinder/Kegel: hell, wo man quer durch das Volumen
 * schaut, unsichtbar an den Rändern — von jeder Seite ohne Kanten (die alten gekreuzten
 * Flächen sah man von oben als X).
 */
export function beamMaterial(color = 0xfff0cc, opacity = 0.5) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        // Kern weich, Ränder weg: höherer Exponent + Ausblenden an beiden Enden
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 3.5);
        float fade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.85, vUv.y) * (0.5 + 0.5 * vUv.y);
        float n = 0.75 + 0.25 * fbm(vec2(vUv.x * 18.0, vUv.y * 3.0 - uTime * 0.05));
        gl_FragColor = vec4(uColor * f * fade * n * uOpacity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Himmelskugel (innen gesehen): Verlauf Horizont → Zenit, Sonnenscheibe mit Hof. Ohne Nebel. */
export function skyMaterial({ top, horizon, ground, sunDir, sunColor }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uGround: { value: new THREE.Color(ground) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(sunColor) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.55, h), 0.7));
        col = mix(col, uGround, smoothstep(0.0, -0.15, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.55 + pow(s, 6.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/**
 * Monotone kubische Interpolation (Fritsch–Carlson) durch Stützstellen (xs aufsteigend).
 * Für Kamerafahrten: Zeit → Bahnparameter, ohne Überschwingen und mit Ruhe an Start und Ende.
 */
export function monotoneSpline(xs, ys) {
  const n = xs.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const hgt = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / hgt;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hgt * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hgt * m[i + 1];
  };
}

/**
 * Kritisch gedämpfte Feder (wie Unitys SmoothDamp) für Vektoren: beschleunigt weich, kommt weich
 * an, ohne Überschwingen — statt lerp(k), das sofort mit voller Geschwindigkeit losschießt und
 * dann lange ausrollt. vel wird mitgeführt (gleiches Objekt bei jedem Aufruf übergeben).
 */
export function springTo(cur, vel, target, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  ['x', 'y', 'z'].forEach((k) => {
    const change = cur[k] - target[k];
    const temp = (vel[k] + omega * change) * dt;
    vel[k] = (vel[k] - omega * temp) * exp;
    cur[k] = target[k] + (change + temp) * exp;
  });
  return cur;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fester Zufall (für Texturen und Deko: jedes Laden gleich). */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
