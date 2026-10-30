// partyDj.js — der Streamer steht selbst hinter dem DJ-Pult (Stream Starting).
//
// Comic-Figur wie die Tänzer (peopleFigure.js), aber fest am Pult: Hände auf dem Mischpult, kleine
// Dreh- und Schiebebewegungen, Kopfnicken im Takt, ab und zu eine Faust hoch (Clip „djdesk“ aus
// raveMoves.js, taktgekoppelt). Hat der Streamer unter /tanzfigur eine eigene Figur gebaut, trägt er
// die. Schreibt er selbst im Chat, erscheint die Nachricht als Sprechblase über ihm — er geht dann
// nicht auf die Tanzfläche.
//
// Die Figur ist 1,25× so groß wie die Tänzer und steht auf einem Podest hinter dem Pult (von vorn
// verdeckt) — sonst reichten die kurzen Comic-Arme nicht auf das 1,1 m hohe Pult.
import * as THREE from 'three';
import { loadPeopleKit, buildPersonFigure, personSeed } from './peopleFigure';
import { requestLook, cachedLook } from './sceneLink';
import { requestChatAvatar } from './chatAvatars';
import { buildLabel, fillBubble } from './partyDancers';

const DJ_SCALE = 1.25;
/** Podest hinter dem Pult (Pult-Koordinaten): Höhe und wie weit hinter der Pultmitte die Figur steht. */
const RISER_H = 0.36;
const STAND_Z = -0.66;
const BUBBLE_MS = 8000;

/**
 * @param {THREE.Object3D} desk  Gruppe des DJ-Pults (Ursprung: Boden unter der Pultmitte, Blick nach +z)
 * @param {HTMLElement} overlay  Ebene für Namensschild und Sprechblase
 * @param {{ envMap?: THREE.Texture|null, riserMat: THREE.Material }} opts
 */
export function createDj(desk, overlay, { envMap = null, riserMat }) {
  const riser = new THREE.Mesh(new THREE.BoxGeometry(1.6, RISER_H, 0.8), riserMat);
  riser.position.set(0, RISER_H / 2, STAND_Z - 0.05);
  desk.add(riser);

  let channel = '';
  let fig = null;
  let kit = null;
  let visible = true;
  let disposed = false;
  let bubbleAt = 0;
  let label = null;
  let lookSeq = 0;
  const tmp = new THREE.Vector3();

  const buildFor = (ch) => {
    if (!kit || disposed) return;
    if (fig) { desk.remove(fig.group); fig.dispose(); fig = null; }
    label?.el.remove();
    label = null;
    if (!ch) return;
    fig = buildPersonFigure(kit, { seed: personSeed(ch), envMap, look: cachedLook(null, ch) });
    fig.group.scale.setScalar(DJ_SCALE);
    fig.group.position.set(0, RISER_H, STAND_Z);
    fig.group.visible = visible;
    fig.play('djdesk', { fade: 0 });
    desk.add(fig.group);
    // Eigene Figur aus dem Figurbaukasten (gesucht über den Kanalnamen)
    const seq = ++lookSeq;
    const mine = fig;
    requestLook(null, (look) => { if (look && seq === lookSeq && fig === mine) fig.setOutfit(look); }, ch);

    label = buildLabel(ch, '#ffffff', true);
    label.el.classList.add('sp-tag--dj');
    label.el.hidden = !visible;
    overlay.append(label.el);
    const lb = label;
    requestChatAvatar({ login: ch }, (img) => {
      if (img && lb.avatar) { lb.avatar.src = img.src; lb.avatar.hidden = false; }
    });
  };

  const ready = loadPeopleKit().then((k) => {
    kit = k;
    if (channel) buildFor(channel);
  });

  return {
    ready,
    /** Kanal (= Streamer). Neuer Kanal → neue Figur. */
    setChannel(ch) {
      const c = String(ch || '').toLowerCase();
      if (c === channel) return;
      channel = c;
      buildFor(c);
    },
    /** Neue Figur aus dem Figurbaukasten (Cache hat partyScene geleert): gilt sie dem Kanal, sofort umbauen. */
    refreshLook(login) {
      if (!fig || String(login || '').toLowerCase() !== channel) return;
      const mine = fig;
      requestLook(null, (look) => { if (fig === mine) fig.setOutfit(look); }, channel);
    },
    setVisible(on) {
      visible = !!on;
      if (fig) fig.group.visible = visible;
      if (label) label.el.hidden = !visible;
    },
    get visible() { return visible && !!fig; },
    /** Nachricht des Streamers: Sprechblase über ihm; der Anzeigename (Groß/klein) kommt aus dem Chat. */
    onMessage(msg) {
      if (!label) return;
      // Testmodus: simulierte Nachrichten zeigen nur die Blase, der Name bleibt der des Kanals
      const nameNode = [...label.el.querySelector('.sp-name').childNodes].find((n) => n.nodeType === 3);
      if (nameNode && msg.name && !String(msg.userId).startsWith('demo-')) nameNode.textContent = msg.name;
      fillBubble(label.bubble, msg.parts);
      label.bubble.classList.add('is-on');
      bubbleAt = performance.now();
    },
    update(beat, dt, camera, w, h) {
      if (!fig || !visible) return;
      fig.update(dt, beat);
      if (bubbleAt && performance.now() - bubbleAt > BUBBLE_MS) { bubbleAt = 0; label.bubble.classList.remove('is-on'); }
      // Namensschild über dem Kopf
      tmp.set(0, fig.headTop() + 0.12, 0);
      fig.group.localToWorld(tmp);
      const dist = camera.position.distanceTo(tmp);
      tmp.project(camera);
      const el = label.el;
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) { el.style.display = 'none'; return; }
      const scale = Math.min(1.1, Math.max(0.55, 11 / dist));
      el.style.display = '';
      el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(bubbleAt ? 2500 : 900);
    },
    dispose() {
      disposed = true;
      if (fig) { desk.remove(fig.group); fig.dispose(); }
      label?.el.remove();
      desk.remove(riser);
      riser.geometry.dispose();
    },
  };
}
