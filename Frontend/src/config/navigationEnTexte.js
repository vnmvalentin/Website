// config/navigationEnTexte.js — englische Texte der Seitenliste (navigation.js), reine Daten ohne Importe (auch in
// node --test lesbar). Kennung je Eintrag: id, sonst href bzw. action. Verwendet von navigationEn.js.

export const NAV_EN = {
  kategorien: {
    fun: {
      label: "Fun",
      tagline: "Games & pastime",
      description: "Browser games from the stream — play right away, no download.",
    },
    community: {
      label: "Community",
      tagline: "Join in & win",
      description: "Everything where the community gets a say or can win something.",
    },
    "clash-royale": {
      label: "Clash Royale",
      tagline: "Challenges & formats",
      description: "Every Clash Royale format from the stream in one place.",
      seoTitle: "Clash Royale Minigames, Nuzlocke & Overlays",
      seoDescription: "Every Clash Royale format in one place: multiplayer minigames for 2–8 players in your browser, the Nuzlocke challenge and a free Win Tracker overlay for OBS with league, medals and daily stats.",
    },
    tools: {
      label: "Streamer tools",
      tagline: "Free tools for streamers",
      description: "Overlays, bots and helpers — free for every streamer.",
    },
    contact: {
      label: "Contact",
      tagline: "Say hello",
      description: "Questions, ideas or just a chat? Here's how to reach me.",
    },
  },
  links: {
    adventures: { label: "adVentures", description: "Horde roguelite in 3D: your weapons fire on their own, thousands of enemies fall per run — five worlds up to the dragon." },
    garden: { label: "Virtual Farm", description: "Your own farm: plant, harvest and expand." },
    spieleabend: { label: "Game night", description: "A room with a table: invite friends by link, walk around as a blob and play Connect Four, Ludo or a drawing impostor game." },
    blobby: { label: "Blobby Volley", description: "Beach volleyball in your browser — 1v1 or 2v2, with power-ups. Share the link and play." },
    "seed-runners": { label: "Seed Runners", description: "Speedrun races in your browser: everyone runs the same random level, first to the finish wins." },
    "sacrifice-and-sigils": { label: "Sacrifice & Sigils", description: "Dark 1v1 card game: draft, sacrifice, tip the scales. Online or against the AI." },
    "flick-soccer": { label: "Flick Soccer", description: "Turn-based disc football: pick a formation, pull back the bottle cap and shoot. Against the AI, two on one device or online." },
    worldflip: { label: "Worldflip", description: "3D card game: play cards while four worlds tilt and erupt around the table. Against bots, online with four or 2 vs 2." },
    "lights-out": { label: "Lights Out", description: "Horror across four levels: forest, asylum, cellar, garden. Ration your flashlight, solve puzzles and escape four monsters — alone or in co-op with up to four people." },

    abstimmungen: { label: "Polls", description: "Vote on current questions and have your say." },
    giveaways: { label: "Giveaways", description: "Current giveaways — joining pays off." },
    tanzfigur: { label: "Dance figure", description: "Build your figure — it dances on the dance floor when the stream starts." },

    "cr-stats": { label: "Player stats", description: "Profile with ranked deck, battles, collection and upgrade calculator — plus clans." },
    "cr-rankings": { label: "Rankings & decks", description: "The best players and clans and the decks they play." },
    "cr-minigames": { label: "Mini Games", description: "Bingo Royale, Elixir Auction, Snake Royale and more." },
    nuzlocke: { label: "Nuzlocke", description: "The Nuzlocke challenge: lost cards are gone." },
    "win-tracker": { label: "Win Tracker overlay", description: "OBS overlay with league, trophies, daily stats and your latest matches." },
    "cr-viewer-games": { label: "Viewer Games", description: "Chat quiz as an OBS overlay: your chat guesses cards with !tipp." },
    "cr-wordle": { label: "Card Wordle", description: "Guess the card of the day — every attribute shows how close you are." },
    "cr-kartenraten": { label: "Card guessing", description: "24 cards, one hint per round — flip down what it can't be." },
    "cr-wer-bin-ich": { label: "Guess Who?", description: "The flip-board game for two with Clash Royale cards." },
    "cr-stats-duell": { label: "Stats duel", description: "Higher or lower with real battle stats: hitpoints, damage, speed, range." },
    "cr-zoom": { label: "Zoom guessing", description: "Can you tell the card from a tiny, heavily zoomed-in detail?" },
    "cr-pixel": { label: "Pixel guessing", description: "The card is heavily pixelated — it gets sharper every two tries." },
    "cr-farbe": { label: "Color guessing", description: "The card is missing a color — mix it from memory with three sliders." },

    "win-challenge": { label: "Win Challenge overlay", description: "Custom OBS overlay with timer, counters and chat commands." },
    "twitch-tools": { label: "Twitch overlay tools", description: "Polls, predictions, goals and stream stats as OBS overlays." },
    bingo: { label: "Bingo card generator", description: "Create bingo cards for your stream — overlay included." },
    "ytm-bot": { label: "YTM song request (bot)", description: "Song requests via YouTube Music — guide & setup." },
    "discord-bot": { label: "Discord bot", description: "The bot for your server: roles, tickets, live pings and more." },

    "https://discord.gg/ecRJSx2R6x": { label: "Discord", description: "The community server — the fastest way to reach me." },
    "https://instagram.com/vnmvalentin": { label: "Instagram", description: "Pictures & stories away from the stream." },
    feedback: { label: "Feedback", description: "Direct feedback on the website — ideas and bug reports." },
  },
};
