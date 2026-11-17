// sw.js — Service Worker der Website (Website als App). Er zeigt nur Mitteilungen (Web-Push, Backend/push/) und
// öffnet beim Antippen die passende Seite. Bewusst OHNE fetch-Handler und ohne Zwischenspeicher: er fängt keine
// Anfrage ab, also kann er nach einem Deploy auch keine alte Fassung der Seite ausliefern, und OBS-Overlays bleiben
// unberührt. Registriert wird er in utils/mitteilungen.js.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { text: event.data ? event.data.text() : "" };
  }
  const titel = typeof d.titel === "string" && d.titel ? d.titel : "vnmvalentin";
  // Offene Fenster der Website frischen ihre Glocke auf (components/Glocke.jsx)
  const fensterMelden = self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((liste) => liste.forEach((c) => c.postMessage({ art: "mitteilung" })))
    .catch(() => {});
  event.waitUntil(Promise.all([fensterMelden, self.registration.showNotification(titel, {
    body: typeof d.text === "string" ? d.text : "",
    icon: d.icon || "/favicons/android-chrome-192x192.png",
    badge: "/favicons/android-chrome-192x192.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    data: { url: typeof d.url === "string" ? d.url : "/" },
  })]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const gleich = fenster.find((c) => c.url === ziel.href);
    if (gleich) return gleich.focus();
    // Ist die Website schon offen, dorthin wechseln statt ein zweites Fenster zu öffnen (nur eigene Seiten)
    const eigenes = ziel.origin === self.location.origin && fenster.find((c) => new URL(c.url).origin === self.location.origin);
    if (eigenes && "navigate" in eigenes) {
      try {
        const neu = await eigenes.navigate(ziel.href);
        return (neu || eigenes).focus();
      } catch { /* nicht steuerbar: neues Fenster */ }
    }
    return self.clients.openWindow(ziel.href);
  })());
});

// Der Browser hat das Abo erneuert (selten, z. B. abgelaufen): neues Abo mit denselben Themen anmelden, altes abmelden
self.addEventListener("pushsubscriptionchange", (event) => {
  const alt = event.oldSubscription;
  event.waitUntil((async () => {
    if (!alt) return;
    const post = (pfad, body, method = "POST") => fetch(pfad, {
      method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const stand = await (await post("/api/push/abo/stand", { endpoint: alt.endpoint })).json();
    if (!Array.isArray(stand?.themen) || !stand.themen.length) return;
    const neu = event.newSubscription || await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: alt.options && alt.options.applicationServerKey,
    });
    await post("/api/push/abo", { abo: neu.toJSON(), themen: stand.themen, sprache: stand.sprache || "de" }, "PUT");
    await post("/api/push/abo/abbestellen", { endpoint: alt.endpoint });
  })().catch(() => { /* beim nächsten Öffnen der Einstellungen wird neu abonniert */ }));
});
