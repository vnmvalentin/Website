// engine/figurAugen.js
// ERZEUGT von tools/figurAugen.mjs — nicht von Hand ändern, sondern das Werkzeug neu laufen
// lassen (nach jeder neuen oder geänderten Figur). Je Figurenbild: Bildgröße, die beiden
// Augen als [x, y, breite, hoehe] in Bildpunkten, Fellfarbe fürs Lid und Farbe des Lidstrichs.
// Figuren ohne Eintrag blinzeln nicht.
export const FIGUR_AUGEN = {
    "/garden-assets/wardrobe/astronaut.png": {
        "w": 86,
        "h": 128,
        "augen": [
            [
                32,
                36,
                12,
                12
            ],
            [
                62,
                36,
                10,
                12
            ]
        ],
        "lid": "#feb23c",
        "strich": "#614417"
    },
    "/garden-assets/wardrobe/cowboy.png": {
        "w": 84,
        "h": 128,
        "augen": [
            [
                24,
                38,
                10,
                8
            ],
            [
                50,
                38,
                10,
                8
            ]
        ],
        "lid": "#ffac39",
        "strich": "#614116"
    },
    "/garden-assets/wardrobe/detective.png": {
        "w": 88,
        "h": 128,
        "augen": [
            [
                28,
                40,
                10,
                8
            ],
            [
                58,
                40,
                10,
                8
            ]
        ],
        "lid": "#fba03a",
        "strich": "#5f3d16"
    },
    "/garden-assets/wardrobe/explorer.png": {
        "w": 88,
        "h": 128,
        "augen": [
            [
                26,
                36,
                10,
                8
            ],
            [
                58,
                36,
                8,
                8
            ]
        ],
        "lid": "#fa9419",
        "strich": "#5f380a"
    },
    "/garden-assets/wardrobe/farmer/blue.png": {
        "w": 86,
        "h": 128,
        "augen": [
            [
                24,
                40,
                10,
                8
            ],
            [
                52,
                36,
                10,
                10
            ]
        ],
        "lid": "#dddcdd",
        "strich": "#545454"
    },
    "/garden-assets/wardrobe/farmer/brown.png": {
        "w": 80,
        "h": 128,
        "augen": [
            [
                24,
                34,
                10,
                8
            ],
            [
                46,
                32,
                10,
                10
            ]
        ],
        "lid": "#da8241",
        "strich": "#533119"
    },
    "/garden-assets/wardrobe/farmer/brownmix.png": {
        "w": 82,
        "h": 128,
        "augen": [
            [
                22,
                38,
                8,
                8
            ],
            [
                46,
                38,
                10,
                8
            ]
        ],
        "lid": "#365f4e",
        "strich": "#15241e"
    },
    "/garden-assets/wardrobe/farmer/cyan.png": {
        "w": 84,
        "h": 128,
        "augen": [
            [
                24,
                38,
                8,
                10
            ],
            [
                54,
                36,
                8,
                10
            ]
        ],
        "lid": "#647574",
        "strich": "#262c2c"
    },
    "/garden-assets/wardrobe/farmer/grey.png": {
        "w": 82,
        "h": 128,
        "augen": [
            [
                22,
                40,
                12,
                10
            ],
            [
                50,
                36,
                10,
                12
            ]
        ],
        "lid": "#aeaba3",
        "strich": "#42413e"
    },
    "/garden-assets/wardrobe/farmer/normal.png": {
        "w": 82,
        "h": 128,
        "augen": [
            [
                24,
                40,
                8,
                8
            ],
            [
                50,
                40,
                8,
                8
            ]
        ],
        "lid": "#cbb88f",
        "strich": "#4d4636"
    },
    "/garden-assets/wardrobe/farmer/orange.png": {
        "w": 82,
        "h": 128,
        "augen": [
            [
                24,
                40,
                10,
                8
            ],
            [
                54,
                36,
                6,
                10
            ]
        ],
        "lid": "#c8aa7f",
        "strich": "#4c4130"
    },
    "/garden-assets/wardrobe/farmer/pink.png": {
        "w": 84,
        "h": 128,
        "augen": [
            [
                26,
                40,
                8,
                6
            ],
            [
                56,
                38,
                6,
                6
            ]
        ],
        "lid": "#f1c1b7",
        "strich": "#5c4946"
    },
    "/garden-assets/wardrobe/farmer/purple.png": {
        "w": 80,
        "h": 128,
        "augen": [
            [
                28,
                34,
                8,
                8
            ],
            [
                54,
                34,
                8,
                8
            ]
        ],
        "lid": "#b286b7",
        "strich": "#443346"
    },
    "/garden-assets/wardrobe/farmer/white.png": {
        "w": 84,
        "h": 128,
        "augen": [
            [
                26,
                40,
                8,
                8
            ],
            [
                54,
                38,
                8,
                8
            ]
        ],
        "lid": "#ffffea",
        "strich": "#616159"
    },
    "/garden-assets/wardrobe/knight.png": {
        "w": 98,
        "h": 128,
        "augen": [
            [
                32,
                44,
                10,
                12
            ],
            [
                62,
                44,
                8,
                12
            ]
        ],
        "lid": "#ffa522",
        "strich": "#613f0d"
    },
    "/garden-assets/wardrobe/musician.png": {
        "w": 108,
        "h": 128,
        "augen": [
            [
                38,
                40,
                8,
                10
            ],
            [
                66,
                44,
                6,
                6
            ]
        ],
        "lid": "#b5752b",
        "strich": "#452c10"
    },
    "/garden-assets/wardrobe/ninja.png": {
        "w": 80,
        "h": 128,
        "augen": [
            [
                36,
                42,
                6,
                8
            ],
            [
                60,
                40,
                6,
                10
            ]
        ],
        "lid": "#8f6335",
        "strich": "#362614"
    },
    "/garden-assets/wardrobe/painter.png": {
        "w": 82,
        "h": 128,
        "augen": [
            [
                24,
                38,
                12,
                14
            ],
            [
                56,
                36,
                8,
                14
            ]
        ],
        "lid": "#ffc83e",
        "strich": "#614c18"
    },
    "/garden-assets/wardrobe/wizard.png": {
        "w": 86,
        "h": 128,
        "augen": [
            [
                22,
                54,
                8,
                8
            ],
            [
                46,
                56,
                8,
                6
            ]
        ],
        "lid": "#f3e6bb",
        "strich": "#5c5747"
    }
};
