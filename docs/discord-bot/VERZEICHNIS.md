# Discord-Bot ins Verzeichnis — Eintragstexte und Schritte

Ausbauplan „discord-verzeichnis“ (Spur C), Stand 17.11.2026. Was gebaut ist, steht im Code; hier steht, was nur du
selbst erledigen kannst (Developer Portal, Bot-Listen) und welche Texte du dort einträgst.

## Wo der Bot gelistet werden kann

| Ort | Voraussetzung | Stand |
|---|---|---|
| Discords App-Verzeichnis (App Directory) | App muss **verifiziert** sein. Verifizieren lässt sie sich ab 76 Servern, ab 100 Servern ist es Pflicht. Danach im Developer Portal unter *Discovery* die Checkliste abarbeiten. | erst ab 76 Servern möglich |
| top.gg | Konto, Bot-ID, Texte unten. Prüfung durch Moderatoren (einige Tage). NSFW nur in altersbeschränkten Kanälen — ist umgesetzt. | sofort möglich |
| discordbotlist.com | wie top.gg | sofort möglich |
| discord.bots.gg | wie top.gg, Bot muss online sein, wenn sie prüfen | sofort möglich |

Die Server-Zahl steht im Admin unter „Discord-Bot“ und öffentlich auf `/tools/discord-bot`.

## Einstellungen im Discord Developer Portal

1. **Installation → Install Link:** „Discord Provided Link“, Scopes `bot` und `applications.commands`,
   Rechte-Zahl **`2252161481698320`** (dieselbe wie `PERMISSION_BITS` in `Backend/discord/bot/permissions.js` — ändert
   sich die Liste dort, hier nachziehen). Dann führt auch der „App hinzufügen“-Knopf in Discords Profil zur richtigen
   Einladung.
2. **General Information:**
   - Privacy Policy URL: `https://vnmvalentin.de/discord-bot/privacy`
   - Terms of Service URL: `https://vnmvalentin.de/discord-bot/terms`
   - Description: Kurztext unten (EN)
   - Tags (bis 5): `welcome`, `roles`, `tickets`, `twitch`, `economy`
3. **Bot → Public Bot** muss an sein (sonst kann niemand außer dir einladen).
4. **Privileged Gateway Intents** (unter 100 Servern selbst schaltbar, danach mit Begründung bei der Verifizierung):
   - *Server Members* — Begrüßung und Abschied, Auto-Rollen, Booster-Rollen, Statistik je Mitglied
   - *Message Content* — Text-Befehle mit Prefix (`!ship` …), Image-Only-Kanäle (Anhänge), Taverne (leitet Nachrichten weiter)
   - *Presence* — wird heute **nicht** angefragt. Die Live-Rolle hängt aber davon ab und kann deshalb derzeit nicht
     funktionieren (siehe „Offen“).
5. Für die Konto-Anmeldung per Discord muss außerdem der Redirect `https://vnmvalentin.de/api/konto/discord/callback`
   eingetragen sein (steht schon als Vor-dem-Deploy-Punkt bei Spur A).

## Texte

### Kurzbeschreibung (max. 200 Zeichen; App-Verzeichnis „Summary“, top.gg „Short description“)

EN: Free all-in-one community bot with a web dashboard: welcome images, role buttons, tickets, Twitch live alerts, personal voice channels, points & mini games. German + English.

DE: Kostenloser Community-Bot mit Web-Dashboard: Begrüßungsbilder, Rollen-Buttons, Tickets, Twitch-Livemeldungen, eigene Voice-Kanäle, Punkte und Mini-Spiele. Deutsch und Englisch.

### Langbeschreibung (Markdown, für top.gg/discordbotlist; EN zuerst, viele Listen sind englisch)

```markdown
**Set everything up in your browser — no commands to learn.**
Pick your server on vnmvalentin.de/discord-bot, switch on what you need, done. A setup check tells you
when the bot is missing a permission somewhere and takes you straight there.

### Features
- **Welcome & goodbye** — plain message, card with profile picture or a drawn image in five layouts
- **Role buttons** — members pick their own roles (several or exactly one), plus auto roles and booster-only roles
- **Support tickets** — a button opens a short form and a private channel for the member and your team
- **Twitch live alerts** — your own message when a Twitch channel goes live, for as many channels as you like
- **Personal voice channels** — join the trigger channel, get your own; limit, lock, rename, hide, kick by command
- **Points & mini games** — points for chatting, voice time and /daily; wheel, rocket and duel; leaderboard
- **Server stats** — messages and voice time per member and channel, also via /serverstats
- **Approvals** — members request access, your team votes in a private thread
- **Also:** image-only channels, a cross-server tavern chat, fun commands like /ship and /coinflip

### Good to know
- Free, no premium tier, no ads in your server
- Asks only for the permissions its features use — never administrator
- German and English: picks up your server language when you add it, switchable any time
- Dashboard sign-in with Discord (Twitch or guest work too)

Website: https://vnmvalentin.de/tools/discord-bot?lang=en
```

Deutsche Fassung für deutschsprachige Listen: die Texte von `/tools/discord-bot` (Frontend/src/pages/Discord/landingTexts.js)
— Funktionen und Fragen dort sind im Code nachgesehen.

### Weitere Felder

- Prefix: `/` (Slash-Befehle); Text-Befehle mit `!` (je Server einstellbar)
- Website: `https://vnmvalentin.de/tools/discord-bot`
- Einladung: Knopf auf der Website oder der Install Link aus dem Portal
- Support-Server: **fehlt noch** — die meisten Listen fragen danach. Vorschlag: ein Kanal auf deinem eigenen Server
  mit dauerhaftem Einladungslink.
- Bilder: `Frontend/public/media/previews/discord-bot.webp` (Dashboard); für Listen helfen 2–3 Bildschirmfotos aus
  einem Testserver (Begrüßungsbild, Rollen-Buttons, Ticket).

## Was schon gebaut ist (wartet auf Deploy)

- Einstiegsseite `/tools/discord-bot` (DE/EN, vorgerendert, Sitemap, Schnellsuche) mit Einladen-Knopf und Server-Zahl
- Einladung ohne Administrator (18 Rechte, Liste mit Grund je Recht in `permissions.js`)
- Begrüßung beim Hinzufügen (Sprache aus der Server-Sprache, Knopf öffnet das Dashboard mit dem Server)
- Dashboard mit Discord- oder Gastkonto; Einrichtungs-Check + „Erste Schritte“ unter „Allgemein“
- Befehle mit englischen Beschreibungen und englischen Namen in englischen Discord-Apps; Spaß-Befehle auf Englisch
- Schlüpfrige Sätze von /superkraft und /ausrede nur in altersbeschränkten Kanälen (Pflicht für top.gg und Discord)
- Unterstützer-Rolle auf dem eigenen Server — braucht `DISCORD_UNTERSTUETZER_GUILD_ID` und
  `DISCORD_UNTERSTUETZER_ROLE_ID` in der Server-.env (Bot-Rolle muss über der Unterstützer-Rolle stehen)

## Offen

- **Live-Rolle:** hört auf Präsenz-Ereignisse, der Bot fragt die *Presence*-Berechtigung aber nicht an → die Rolle
  wird nie vergeben. Lösung: im Portal *Presence Intent* einschalten UND in `Backend/discord/bot/index.js`
  `GatewayIntentBits.GuildPresences` ergänzen — in genau dieser Reihenfolge, sonst startet der Bot nicht
  („disallowed intents“). Kostet etwas mehr Last (Präsenz-Meldungen aller Mitglieder).
- Datenschutz und Nutzungsbedingungen des Bots gibt es nur auf Deutsch; englische Listen verlinken trotzdem darauf.
- Clan-Erinnerungen über den Bot (Anschluss `clan-erinnerungen-bot` von Spur B) — wäre ein gutes Argument für
  Clash-Royale-Clans, noch nicht gebaut.
