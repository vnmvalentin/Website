// ui/table/cards/cardMesh.js — Karten als Körper in der 3D-Szene.
//
// Eine Karte ist eine dünne Platte mit Vorder- und Rückseite; runde Ecken kommen aus dem Alpha der Textur (alphaTest).
// Die Karte selbst kennt keinen Ort: die Szene setzt Position, Drehung und Größe jedes Bild neu (tableRoom.js).
// Dazu gehören ein weicher Kontaktschatten (eigene Fläche auf dem Tisch) und eine Opfermarke (roter Wachsklecks).
import * as THREE from "three";

export const CARD_W = 12;
export const CARD_H = 16.8;
/** Papierton, solange das Kartenbild noch gezeichnet wird. */
const BLANK = 0xd9c9a3;

/** Weicher Schatten in Kartenform (dunkler Kern, nach außen auslaufend). */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 176;
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.fillRect(22, 22, 84, 132);
  return new THREE.CanvasTexture(c);
}

/** Opfermarke: roter Wachsklecks mit eingeritztem Schnitt. */
function markTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(54, 50, 6, 64, 64, 56);
  g.addColorStop(0, "#c23a2e");
  g.addColorStop(1, "#6e1414");
  ctx.fillStyle = g;
  ctx.beginPath();
  // unregelmäßiger Klecks
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 46 + Math.sin(a * 3 + 1) * 5 + Math.sin(a * 7) * 3;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40,6,6,0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#f3d9c0";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(42, 84);
  ctx.lineTo(86, 44);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {{ maxAniso?: number }} [opt]
 */
export function createCardKit(opt = {}) {
  const aniso = Math.min(8, opt.maxAniso || 1);
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * 1.34, CARD_H * 1.3);
  const markGeo = new THREE.PlaneGeometry(7, 7);
  const shadowTex = shadowTexture();
  const markTex = markTexture();
  const markMat = new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false });
  // Kartenhälften für das Zerreißen: linke und rechte Hälfte mit dem passenden Ausschnitt des Kartenbilds
  const halfGeo = (side) => {
    const g = new THREE.PlaneGeometry(CARD_W / 2, CARD_H);
    g.translate((side * CARD_W) / 4, 0, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
    return g;
  };
  const halfL = halfGeo(-1);
  const halfR = halfGeo(1);
  const shared = [geo, shadowGeo, markGeo, shadowTex, markTex, markMat, halfL, halfR];

  return {
    /** Canvas → Textur mit Mipmaps (für schräg liegende Karten). @param {HTMLCanvasElement} canvas */
    texture(canvas) {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    },
    /**
     * Karte bauen. Ursprung = Kartenmitte, die Karte steht in der xy-Ebene (Vorderseite nach +z).
     * @param {{ back: THREE.Texture }} o
     */
    make({ back }) {
      const group = new THREE.Group();
      const frontMat = new THREE.MeshStandardMaterial({ color: BLANK, roughness: 0.88, metalness: 0, alphaTest: 0.5 });
      const front = new THREE.Mesh(geo, frontMat);
      front.receiveShadow = true;
      const rearMat = new THREE.MeshStandardMaterial({ map: back, roughness: 0.88, metalness: 0, alphaTest: 0.5 });
      const rear = new THREE.Mesh(geo, rearMat);
      rear.rotation.y = Math.PI;
      rear.position.z = -0.03;
      rear.receiveShadow = true;
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.position.set(0, 1.5, 0.06);
      mark.visible = false;
      mark.renderOrder = 2;
      group.add(front, rear, mark);
      // Schatten: liegt nicht in der Gruppe, sondern flach auf dem Tisch (die Szene führt ihn nach)
      const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.62, depthWrite: false });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 1;
      let faceTex = /** @type {THREE.Texture | null} */ (null);
      /** @type {THREE.Mesh[] | null} */
      let halves = null;
      return {
        group, front, rear, mark, shadow, frontMat,
        /**
         * Karte in zwei Hälften teilen (einmalig). Die Szene bewegt die Hälften danach auseinander.
         * @returns {THREE.Mesh[]} [links, rechts]
         */
        tear() {
          if (!halves) {
            halves = [new THREE.Mesh(halfL, frontMat), new THREE.Mesh(halfR, frontMat)];
            group.add(halves[0], halves[1]);
            front.visible = false;
            rear.visible = false;
            mark.visible = false;
          }
          return halves;
        },
        /** Kartenbild setzen (die alte Textur wird entsorgt). @param {THREE.Texture} tex */
        setFace(tex) {
          faceTex?.dispose();
          faceTex = tex;
          frontMat.map = tex;
          frontMat.color.set(0xffffff);
          frontMat.needsUpdate = true;
        },
        dispose() {
          faceTex?.dispose();
          frontMat.dispose();
          rearMat.dispose();
          shadowMat.dispose();
        },
      };
    },
    dispose() {
      for (const o of shared) o.dispose();
    },
  };
}
