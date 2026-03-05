// src/data/patchNotes.js

export const patchNotes = [
    {
        version: "Season 1",
        date: "2026-03-15",
        title: "Balance Updates",
        categories: [
            {
                name: "💰 Casino",
                changes: [
                    "Slots sind jetzt keine Gelddruckmaschine mehr",
                ]
            },
            {
                name: "Packs",
                changes: [
                    "Boss-HP in Stage 10 um 15% erhöht."
                ]
            }
        ]
    }
];

// Definition aller möglichen Badges für die Tooltips (Das ist unser Flex-System!)
export const BADGE_DICTIONARY = {
    "s1_coins_1": { 
        image: "/badges/s1_coins_1.png", 
        description: "Season 1: 1. Platz (Reichster Spieler)" 
    },
    "s1_coins_2": { 
        image: "/badges/s1_coins_2.png", 
        description: "Season 1: 2. Platz (Reichster Spieler)" 
    },
    
    "beta_tester": { 
        image: "/badges/beta.png", 
        description: "Website Beta Tester" 
    }
};