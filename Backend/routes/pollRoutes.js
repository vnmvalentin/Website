const express = require("express");
const fs = require("fs");
const path = require("path");

// Pfad zur polls.json (relativ zum routes-Ordner)
const POLLS_FILE = path.join(__dirname, "../data/polls.json");

// --- Hilfsfunktionen zum Laden und Speichern ---
function loadPolls() {
    try {
        if (!fs.existsSync(POLLS_FILE)) return [];
        const data = fs.readFileSync(POLLS_FILE, "utf8");
        return JSON.parse(data);
    } catch (e) {
        console.error("Fehler beim Laden der polls.json:", e);
        return [];
    }
}

function savePolls(data) {
    try {
        fs.writeFileSync(POLLS_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Fehler beim Speichern der polls.json:", e);
    }
}

module.exports = function createPollRouter({ requireAuth, STREAMER_TWITCH_ID, io }) {
    const router = express.Router();

    // 1. GET / -> Alle Abstimmungen abrufen (Für die Übersicht)
    router.get("/", (req, res) => {
        const polls = loadPolls();
        res.json(polls);
    });

    // 2. GET /:id -> Spezifische Abstimmung abrufen (Für die Detailseite)
    router.get("/:id", (req, res) => {
        const polls = loadPolls();
        const poll = polls.find(p => String(p.id) === String(req.params.id));
        
        if (!poll) {
            return res.status(404).json({ error: "Poll not found" });
        }
        res.json(poll);
    });

    // 3. POST / -> Neue Abstimmung erstellen (Nur Admin)
    router.post("/", requireAuth, (req, res) => {
        // Sicherheitscheck: Ist der User der Streamer?
        if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
            return res.status(403).json({ error: "Keine Berechtigung" });
        }

        const newPoll = {
            id: Date.now(),
            title: req.body.title || "Ohne Titel",
            background: req.body.background || "",
            endDate: req.body.endDate,
            questions: req.body.questions || [],
            votes: {} // Leeres Objekt für die Stimmen
        };

        const polls = loadPolls();
        polls.push(newPoll);
        savePolls(polls);

        // Allen verbundenen Clients Bescheid geben
        if (io) io.emit("polls_update", polls);
        
        res.status(201).json(newPoll);
    });

    // 4. DELETE /:id -> Abstimmung löschen (Nur Admin)
    router.delete("/:id", requireAuth, (req, res) => {
        if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
            return res.status(403).json({ error: "Keine Berechtigung" });
        }

        let polls = loadPolls();
        polls = polls.filter(p => String(p.id) !== String(req.params.id));
        savePolls(polls);

        if (io) io.emit("polls_update", polls);
        
        res.json({ success: true });
    });

    // 5. PUT /:id -> Abstimmen / Stimme speichern oder aktualisieren
    router.put("/:id", requireAuth, (req, res) => {
        const userId = String(req.twitchId);
        // Frontend sendet: { votes: { "userid": { antworten } }, replace: boolean }
        const { votes, replace } = req.body; 

        const polls = loadPolls();
        const pollIndex = polls.findIndex(p => String(p.id) === String(req.params.id));

        if (pollIndex === -1) {
            return res.status(404).json({ error: "Poll not found" });
        }

        const poll = polls[pollIndex];

        // Prüfen, ob die Abstimmung bereits beendet ist
        if (new Date(poll.endDate) <= new Date()) {
            return res.status(400).json({ error: "Abstimmung ist bereits beendet" });
        }

        if (!poll.votes) poll.votes = {};

        // Wenn der User schon abgestimmt hat und er NICHT im Edit-Modus ("replace") ist
        if (poll.votes[userId] && !replace) {
            // Wichtig: Genau dieser String "User hat bereits abgestimmt" wird vom
            // PollRenderer.jsx (Zeile 77) gesucht, um in den Results-Modus zu wechseln!
            return res.status(400).json({ error: "User hat bereits abgestimmt" });
        }

        // Neue Antworten aus dem Body extrahieren
        const userAnswers = votes[userId];
        if (!userAnswers) {
            return res.status(400).json({ error: "Ungültige Abstimmungsdaten" });
        }

        // Vote eintragen / überschreiben
        poll.votes[userId] = userAnswers;
        polls[pollIndex] = poll;

        savePolls(polls);

        // Allen anderen Clients mitteilen, dass sich die Balken verschoben haben
        if (io) io.emit("polls_update", polls);
        
        // Frontend erwartet das aktualisierte Poll-Objekt zurück
        res.json(poll); 
    });

    return router;
};