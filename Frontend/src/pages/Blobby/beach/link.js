// Beach 3D — Leitung zwischen Host und Mitspielern.
//
// Bevorzugt: WebRTC-Datenkanal direkt zwischen den Browsern, unzuverlässig und ungeordnet
// (wie UDP). Ein verlorener Schnappschuss wird nicht nachgeschickt — der nächste ist
// ohnehin schon unterwegs und aktueller. Genau das spart das Ruckeln, das TCP bei einem
// verlorenen Paket erzeugt (alles Folgende wartet, bis das alte nachgeliefert ist).
//
// Rückfall: Solange der Datenkanal nicht offen ist — oder nie aufgeht, weil ein Netz
// direkte Verbindungen blockt —, gehen dieselben Nachrichten über den Blobby-Server
// (bb:relay). Der Spieler merkt davon nur die Anzeige "über Server".
//
// Aufbau: Der Host bietet jedem Mitspieler eine Verbindung an (bb:signal). Verbindet sich
// ein Mitspieler neu (anderer `conn`-Zähler in der Lobby), wird sie neu aufgebaut.

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
// Staut sich mehr als das im Kanal, wird ein Schnappschuss ausgelassen statt angehängt
const MAX_BUFFERED = 64 * 1024;

export function createBeachLink({ socket, mySlot, onMessage, onStatus }) {
  const peers = new Map();   // slot → { pc, dc, conn, open }
  let hostSlot = 0;
  let closed = false;

  const report = () => {
    if (closed) return;
    const status = {};
    for (const [slot, p] of peers) status[slot] = p.open ? "direct" : "relay";
    onStatus?.(status);
  };

  function closePeer(slot) {
    const p = peers.get(slot);
    if (!p) return;
    peers.delete(slot);
    try { p.dc?.close(); } catch { /* schon zu */ }
    try { p.pc.close(); } catch { /* schon zu */ }
  }

  function wireChannel(slot, p, dc) {
    p.dc = dc;
    dc.onopen = () => { p.open = true; report(); };
    dc.onclose = () => { p.open = false; report(); };
    dc.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      onMessage?.(slot, msg, "direct");
    };
  }

  function newPeer(slot, conn) {
    closePeer(slot);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p = { pc, dc: null, conn, open: false, pending: [] };
    peers.set(slot, p);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) socket.emit("bb:signal", { to: slot, data: { candidate: ev.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        p.open = false;
        report();
      }
    };
    report();
    return p;
  }

  // Kandidaten können vor der Gegenbeschreibung eintreffen (Signale laufen asynchron).
  // addIceCandidate wirft dann — also bis dahin zurücklegen.
  async function remoteSetzen(p, sdp) {
    await p.pc.setRemoteDescription(sdp);
    for (const c of p.pending.splice(0)) {
      try { await p.pc.addIceCandidate(c); } catch { /* veraltet */ }
    }
  }

  // ── Host: jedem Mitspieler eine Verbindung anbieten ───────────────────────
  async function offerTo(slot, conn) {
    const p = newPeer(slot, conn);
    const dc = p.pc.createDataChannel("bb", { ordered: false, maxRetransmits: 0 });
    wireChannel(slot, p, dc);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      socket.emit("bb:signal", { to: slot, data: { sdp: p.pc.localDescription.toJSON() } });
    } catch {
      // Ohne Angebot bleibt es beim Server-Umweg — kein Fehler für den Spieler
    }
  }

  /**
   * Mit dem Lobby-Stand abgleichen: wer ist Host, wer ist (neu) verbunden.
   * Nur der Host baut aktiv auf; Mitspieler warten auf sein Angebot.
   */
  function sync(game) {
    if (closed || !game) return;
    hostSlot = game.hostSlot;
    const amHost = mySlot && mySlot === hostSlot;
    const wanted = new Set();
    if (amHost) {
      for (const slot of game.slots || []) {
        const pl = game.players?.[slot];
        if (slot === mySlot || !pl?.connected) continue;
        wanted.add(slot);
        const p = peers.get(slot);
        if (!p || p.conn !== pl.conn) offerTo(slot, pl.conn);
      }
    } else if (hostSlot) {
      wanted.add(hostSlot);
    }
    for (const slot of [...peers.keys()]) if (!wanted.has(slot)) closePeer(slot);
    report();
  }

  // ── Signale vom Gegenüber ─────────────────────────────────────────────────
  async function onSignal({ from, data } = {}) {
    if (closed || !data) return;
    try {
      if (data.sdp?.type === "offer") {
        // Nur der Host bietet an. Ein neues Angebot ersetzt die alte Verbindung.
        const p = newPeer(from, 0);
        p.pc.ondatachannel = (ev) => wireChannel(from, p, ev.channel);
        await remoteSetzen(p, data.sdp);
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        socket.emit("bb:signal", { to: from, data: { sdp: p.pc.localDescription.toJSON() } });
      } else if (data.sdp?.type === "answer") {
        const p = peers.get(from);
        if (p) await remoteSetzen(p, data.sdp);
      } else if (data.candidate) {
        const p = peers.get(from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate);
        else p.pending.push(data.candidate);
      }
    } catch {
      // Verbindungsaufbau gescheitert — der Server-Umweg bleibt bestehen
    }
  }
  const onRelay = ({ from, msg } = {}) => {
    if (!closed && msg) onMessage?.(from, msg, "relay");
  };
  socket.on("bb:signal", onSignal);
  socket.on("bb:relay", onRelay);

  // ── Senden ────────────────────────────────────────────────────────────────
  function sendTo(slot, msg, text) {
    const p = peers.get(slot);
    if (p?.open && p.dc?.readyState === "open") {
      if (p.dc.bufferedAmount > MAX_BUFFERED) return;
      try { p.dc.send(text ?? JSON.stringify(msg)); return; } catch { /* auf Server ausweichen */ }
    }
    socket.emit("bb:relay", { to: slot === hostSlot && mySlot !== hostSlot ? "host" : slot, msg });
  }

  return {
    sync,
    /** Mitspieler → Host */
    toHost(msg) {
      if (hostSlot && hostSlot !== mySlot) sendTo(hostSlot, msg);
    },
    /** Host → bestimmter Mitspieler */
    toSlot(slot, msg) { sendTo(slot, msg); },
    /** Host → alle Mitspieler (direkt, wo möglich) und Zuschauer (immer über Server) */
    broadcast(msg, slots, spectators) {
      const text = JSON.stringify(msg);
      for (const slot of slots) if (slot !== mySlot) sendTo(slot, msg, text);
      if (spectators) socket.emit("bb:relay", { to: "spectators", msg });
    },
    close() {
      closed = true;
      socket.off("bb:signal", onSignal);
      socket.off("bb:relay", onRelay);
      for (const slot of [...peers.keys()]) closePeer(slot);
    },
  };
}
