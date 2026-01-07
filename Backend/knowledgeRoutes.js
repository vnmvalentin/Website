const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid"); // Falls du nanoid nutzt, sonst eine andere ID-Logik

const DB_PATH = path.join(__dirname, "knowledge-db.json");

// Liste der Twitch-IDs, die Artikel erstellen/löschen dürfen
// Hier kannst du deine ID und die von Mods/Freunden eintragen
const ALLOWED_EDITORS = [
  "160224748", // Deine ID
];

function loadArticles() {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveArticles(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

module.exports = function createKnowledgeRouter({ requireAuth }) {
  const router = express.Router();

  // 1. Alle Artikel abrufen (öffentlich)
  router.get("/", (req, res) => {
    const articles = loadArticles();
    // Sortieren: Neueste zuerst (optional)
    const sorted = articles.sort((a, b) => b.createdAt - a.createdAt);
    res.json(sorted);
  });

  // 2. Artikel erstellen (Nur Editoren)
  router.post("/", requireAuth, (req, res) => {
    const userId = String(req.twitchId);

    if (!ALLOWED_EDITORS.includes(userId)) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    const { title, category, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Titel und Inhalt sind Pflicht." });
    }

    const articles = loadArticles();
    const newArticle = {
      id: nanoid(10),
      title,
      category: category || "Allgemein",
      content, // Das ist der HTML-String vom Editor
      authorId: userId,
      createdAt: Date.now(),
    };

    articles.push(newArticle);
    saveArticles(articles);

    res.json(newArticle);
  });

  // 3. Artikel löschen (Nur Editoren)
  router.delete("/:id", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    const { id } = req.params;

    if (!ALLOWED_EDITORS.includes(userId)) {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }

    let articles = loadArticles();
    const initialLen = articles.length;
    articles = articles.filter((a) => a.id !== id);

    if (articles.length === initialLen) {
      return res.status(404).json({ error: "Artikel nicht gefunden" });
    }

    saveArticles(articles);
    res.json({ success: true });
  });

  return router;
};