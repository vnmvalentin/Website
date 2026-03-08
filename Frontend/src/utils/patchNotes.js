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
        image: "/assets/seasonbadges/Season1/gold1.png", 
        description: "Season 1: 1. Platz (Reichster Spieler)" 
    },
    "s1_coins_2": { 
        image: "/assets/seasonbadges/Season1/gold2.png", 
        description: "Season 1: 2. Platz (Reichster Spieler)" 
    },
    "s1_coins_3": { 
        image: "/assets/seasonbadges/Season1/gold3.png", 
        description: "Season 1: 3. Platz (Reichster Spieler)" 
    },
    "s1_cards_1": { 
        image: "/assets/seasonbadges/Season1/cards1.png", 
        description: "Season 1: 1. Platz (Meisten Karten)" 
    },
    "s1_cards_2": { 
        image: "/assets/seasonbadges/Season1/cards2.png", 
        description: "Season 1: 2. Platz (Meisten Karten)" 
    },
    "s1_cards_3": { 
        image: "/assets/seasonbadges/Season1/cards3.png", 
        description: "Season 1: 3. Platz (Meisten Karten)" 
    },
    "s1_adventure_1": { 
        image: "/assets/seasonbadges/Season1/game1.png", 
        description: "Season 1: 1. Platz (Höchstes Level)" 
    },
    "s1_adventure_2": { 
        image: "/assets/seasonbadges/Season1/game2.png", 
        description: "Season 1: 2. Platz (Höchstes Level)" 
    },
    "s1_adventure_3": { 
        image: "/assets/seasonbadges/Season1/game3.png", 
        description: "Season 1: 3. Platz (Höchstes Level)" 
    },
    
    "beta_tester": { 
        image: "/badges/beta.png", 
        description: "Website Beta Tester" 
    }
};