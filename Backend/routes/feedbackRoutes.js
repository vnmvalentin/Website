// backend/feedbackRoutes.js
const express = require("express");

// HIER DEINEN NEUEN WEBHOOK FÜR DAS ALLGEMEINE FEEDBACK EINTRAGEN:
const WEBHOOK_URL_MAIN = process.env.DISCORD_WEBHOOK_MAIN;

module.exports = function createFeedbackRouter() {
  const router = express.Router();

  // Allgemeines Feedback (sendet an Discord)
  router.post("/main", async (req, res) => {
      const { message, user } = req.body;
      const username = user || "Anonym";

      if (!message || message.trim().length === 0) {
          return res.status(400).json({ error: "Nachricht darf nicht leer sein." });
      }
      
      if (!WEBHOOK_URL_MAIN || WEBHOOK_URL_MAIN.includes("HIER")) {
          console.error("Discord Webhook URL (Main) wurde nicht konfiguriert!");
          return res.status(500).json({ error: "Server Konfigurationsfehler" });
      }

      try {
          const discordPayload = {
              username: "Website Feedback Bot",
              avatar_url: "https://cdn-icons-png.flaticon.com/512/2583/2583166.png",
              embeds: [
                  {
                      title: "📬 Allgemeines Feedback / Kontakt",
                      color: 5763719, // Grün/Türkis (z.B. #57F287)
                      fields: [
                          {
                              name: "👤 User",
                              value: username,
                              inline: true
                          },
                          {
                              name: "💬 Nachricht",
                              value: message
                          }
                      ],
                      footer: {
                          text: `Gesendet am ${new Date().toLocaleString("de-DE")}`
                      }
                  }
              ]
          };

          // Hinweis: fetch muss in deiner Node-Umgebung verfügbar sein (Node 18+ oder polyfill)
          const discordRes = await fetch(WEBHOOK_URL_MAIN, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(discordPayload)
          });

          if (discordRes.ok) {
              res.json({ success: true });
          } else {
              console.error("Discord Error:", await discordRes.text());
              res.status(500).json({ error: "Fehler beim Senden an Discord" });
          }
      } catch (e) {
          console.error("Feedback Fetch Error:", e);
          res.status(500).json({ error: "Interner Serverfehler" });
      }
  });

  return router;
};