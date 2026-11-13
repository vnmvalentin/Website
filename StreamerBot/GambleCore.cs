// ════════════════════════════════════════════════════════════════════════════
//  Gamble-System für Streamer.bot  (Aktion "Gamble Core")
//
//  Eine einzige C#-Datei. Alle anderen Aktionen rufen hier über den Unterbefehl
//  "Execute C# Method" eine Methode auf (Watchtime, Punkte, Gamble, Rakete, Topf …).
//  Dadurch teilen sich alle Befehle denselben Zustand (laufende Rakete, Murmelbahn).
//
//  Einrichtung: siehe StreamerBot/GAMBLE_EINRICHTUNG.md
//  Overlay in OBS: https://vnmvalentin.de/overlay/gamble
// ════════════════════════════════════════════════════════════════════════════
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Streamer.bot.Plugin.Interface;

public class CPHInline
{
    // ── Einstellungen ───────────────────────────────────────────────────────
    const string WAEHRUNG = "Punkte";

    // Watchtime: pro "Present Viewers"-Runde (Standard alle 5 Minuten)
    const long PUNKTE_PRO_RUNDE = 10;     // fürs Zuschauen
    const long BONUS_AKTIV = 5;           // zusätzlich, wenn seit der letzten Runde geschrieben wurde
    const double FAKTOR_SUB = 1.5;        // Subs bekommen mehr
    const long STARTGUTHABEN = 100;       // bekommt jeder beim ersten Mal

    // Wer keine Punkte bekommt und nicht mitspielt (klein geschrieben)
    static readonly HashSet<string> BOTS = new HashSet<string> {
        "nightbot", "streamelements", "vallebot_", "streamlabs", "moobot", "fossabot", "soundalerts", "sery_bot"
    };

    const long MIN_EINSATZ = 10;
    const long MAX_EINSATZ = 0;           // 0 = kein Limit
    const double TOPF_ANTEIL = 0.10;      // so viel von verlorenen Einsätzen wandert in den Topf

    // !gamble
    const int GAMBLE_COOLDOWN_S = 5;      // Wartezeit pro Person, 0 = keine
    const int GAMBLE_GEWINNCHANCE = 50;   // in Prozent; Gewinn = Einsatz doppelt zurück

    // Rakete
    const int RAKETE_WARTEZEIT_S = 30;    // Einsätze sammeln, dann Start
    const int RAKETE_PAUSE_S = 20;        // Pause nach einer Runde
    const double RAKETE_TEMPO = 0.10;     // Multiplikator = e^(TEMPO * Sekunden) -> 2x nach ~7 s, 10x nach ~23 s
    const double RAKETE_HAUSVORTEIL = 0.04;
    const double RAKETE_MAX = 100.0;

    // Murmelbahn der Website: feste Preise für die Plätze (keine Wetten)
    // Den Schlüssel findest du im Twitch-Dashboard unter "OBS-Link": .../twitch-tools/overlay/<SCHLÜSSEL>
    const string MURMEL_OVERLAY_KEY = "HIER_SCHLUESSEL_EINTRAGEN";
    const string MURMEL_API = "https://vnmvalentin.de/api/stream-tool/overlay/";
    // Platz 1 = GRUND + PRO_FAHRER × Fahrer (höchstens MAX). Beispiele: 4 Fahrer 200, 10 Fahrer 350, 30 Fahrer 850
    const long MURMEL_PREIS_GRUND = 100;
    const long MURMEL_PREIS_PRO_FAHRER = 25;
    const long MURMEL_PREIS_MAX = 2000;
    const int MURMEL_AB_PLATZ2 = 8;           // ab so vielen Fahrern gibt es auch einen Preis für Platz 2 …
    const double MURMEL_ANTEIL_PLATZ2 = 0.50; // … so viel vom Preis für Platz 1
    const int MURMEL_AB_PLATZ3 = 15;          // ab so vielen Fahrern auch für Platz 3 …
    const double MURMEL_ANTEIL_PLATZ3 = 0.25;
    const long MURMEL_TEILNAHME = 20;         // für jeden, der mitgefahren ist (0 = nichts)
    const int MURMEL_PLAETZE_WARTEN_S = 10;   // so lange nach dem Sieger auf Platz 2/3 von der Website warten

    // Einmalige Übernahme der Zuschauzeit aus StreamElements (Methode WatchtimeImport).
    // Leer = der Kanal, der in Streamer.bot als Broadcaster verbunden ist. Nur eintragen,
    // falls dein Kanal bei StreamElements anders heißt.
    const string SE_KANAL = "";
    const string SE_API = "https://api.streamelements.com/kappa/v2/";
    const string TWITCH_API = "https://api.twitch.tv/helix/";

    // Stream-Verzögerung: Chat-Ergebnisse warten so lange, damit niemand gespoilert wird
    const int STREAM_DELAY_S = 4;

    // 7TV-Emotes für die Chat-Nachrichten. Groß-/Kleinschreibung zählt, und sie müssen
    // in deinem 7TV-Emote-Set sein. Pro Nachricht wird eins zufällig gewählt.
    // Leere Liste ( new string[0] ) = kein Emote.
    static readonly string[] EMOTES_GEWONNEN = { "EZ", "PogU", "catJAM", "Clap" };
    static readonly string[] EMOTES_VERLOREN = { "Sadge", "KEKW", "OMEGALUL", "PepeLaugh" };
    static readonly string[] EMOTES_ALLIN_GEWONNEN = { "GIGACHAD", "BASED" };
    static readonly string[] EMOTES_ALLIN_VERLOREN = { "Deadge", "Aware" };
    static readonly string[] EMOTES_RAKETE_START = { "monkaS" };
    static readonly string[] EMOTES_RAKETE_BOOM = { "KEKW", "monkaW" };
    static readonly string[] EMOTES_RAKETE_ALLE_SICHER = { "EZ", "Clap" };
    static readonly string[] EMOTES_MURMEL_SIEG = { "Clap", "PogU" };
    static readonly string[] EMOTES_TOPF = { "PagMan", "POGGERS" };

    // {name} und {betrag} werden ersetzt
    static readonly string[] SAETZE_GEWONNEN = {
        "{name} gewinnt {betrag}",
        "Läuft bei {name}: +{betrag}",
        "Glück gehabt, {name}: +{betrag}",
        "{name} verdoppelt: +{betrag}",
    };
    static readonly string[] SAETZE_VERLOREN = {
        "{name} ist {betrag} los",
        "{name} verliert {betrag}",
        "Pech, {name}: −{betrag}",
        "Nicht dein Tag, {name}: −{betrag}",
    };

    // Topf
    const long TOPF_MIN = 100;            // darunter wird nicht ausgelost

    // Namen der gespeicherten Variablen
    const string VAR_PUNKTE = "gamble_punkte";
    const string VAR_MINUTEN = "gamble_minuten";
    const string VAR_TOPF = "gamble_topf";
    const string VAR_DABEI = "gamble_dabei"; // true, sobald jemand sein Startguthaben bekommen hat

    // ── Gemeinsamer Zustand (gilt für alle Aufrufe dieser Aktion) ──────────
    static readonly object Sperre = new object();
    static readonly Random Zufall = new Random();
    static IInlineInvokeProxy cph;

    static readonly HashSet<string> aktivSeitRunde = new HashSet<string>();
    static readonly Dictionary<string, int> sessionMinuten = new Dictionary<string, int>();   // id -> Minuten
    static readonly Dictionary<string, string> sessionNamen = new Dictionary<string, string>(); // id -> Anzeigename
    static DateTime letzteRunde = DateTime.MinValue;
    static DateTime letztesLebenszeichen = DateTime.MinValue;
    static readonly Dictionary<string, DateTime> gambleCooldown = new Dictionary<string, DateTime>();

    class Spieler { public string Id; public string Name; }

    // Rakete
    class RaketenWette { public string Id; public string Name; public long Einsatz; public double Ziel; }
    static string raketePhase = "aus"; // aus | offen | flug | pause
    static long raketeStartUm;          // ms
    static readonly List<RaketenWette> raketenWetten = new List<RaketenWette>();

    // Murmeln
    static string murmelRunde;          // id des Rennens auf der Website
    static string murmelPhase = "aus";  // aus | join | race | done
    static long murmelSchlussUm;        // ms (lokale Zeit), wann die Anmeldung schließt; 0 = unbekannt
    static List<Spieler> murmelFahrer = new List<Spieler>();
    static readonly HashSet<string> murmelAbgerechnet = new HashSet<string>();
    static DateTime murmelSiegerGesehen = DateTime.MinValue; // Sieger da, warten auf Platz 2/3
    static Spieler murmelSieger;
    static bool murmelAnsageGemacht;
    static DateTime murmelLetzterAbruf = DateTime.MinValue;
    static Thread abfrageSchleife;

    // ── Lebenszyklus ───────────────────────────────────────────────────────
    public void Init()
    {
        cph = CPH;
        StarteSchleife();
    }

    public bool Execute()
    {
        // Wird nur beim Kompilieren/Testen direkt aufgerufen
        cph = CPH;
        StarteSchleife();
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  Watchtime  (Trigger: Twitch > General > Present Viewers)
    // ════════════════════════════════════════════════════════════════════
    public bool Watchtime()
    {
        Vorbereiten();
        object roh;
        if (!args.TryGetValue("users", out roh) || roh == null) return true;

        JArray users;
        try { users = JArray.FromObject(roh); } catch { return true; }

        DateTime jetzt = DateTime.UtcNow;
        int minuten;
        lock (Sperre)
        {
            // Tatsächlich vergangene Zeit statt fester Annahme (1–15 Minuten)
            minuten = letzteRunde == DateTime.MinValue ? 5 : (int)Math.Round((jetzt - letzteRunde).TotalMinutes);
            minuten = Math.Max(1, Math.Min(15, minuten));
            letzteRunde = jetzt;
            letztesLebenszeichen = jetzt;
        }

        foreach (var u in users)
        {
            string id = Feld(u, "id", "userId", "user_id");
            string login = Feld(u, "login", "userName", "userLogin", "username");
            string name = Feld(u, "display", "displayName", "userDisplayName", "name");
            if (string.IsNullOrEmpty(id)) continue;
            if (string.IsNullOrEmpty(name)) name = login;
            if (IstBot(login) || IstBot(name)) continue;

            bool sub = Wahr(u, "subscribed", "isSubscribed", "subscriber");
            bool aktiv;
            lock (Sperre)
            {
                aktiv = aktivSeitRunde.Contains(id);
                int vorher;
                sessionMinuten.TryGetValue(id, out vorher);
                sessionMinuten[id] = vorher + minuten;
                sessionNamen[id] = name;
            }

            long plus = PUNKTE_PRO_RUNDE + (aktiv ? BONUS_AKTIV : 0);
            if (sub) plus = (long)Math.Round(plus * FAKTOR_SUB);
            Gutschrift(id, plus);

            long min = CPH.GetTwitchUserVarById<long>(id, VAR_MINUTEN, true);
            CPH.SetTwitchUserVarById(id, VAR_MINUTEN, min + minuten, true);
        }
        lock (Sperre) aktivSeitRunde.Clear();
        return true;
    }

    // Trigger: Twitch > Chat > Chat Message  — merkt sich, wer aktiv schreibt
    public bool ChatAktiv()
    {
        Vorbereiten();
        string id = Arg("userId");
        if (string.IsNullOrEmpty(id) || IstBot(Arg("userName"))) return true;
        lock (Sperre) aktivSeitRunde.Add(id);
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  !watchtime [name]  — Zuschauzeit, die die Watchtime-Runde oben mitzählt
    // ════════════════════════════════════════════════════════════════════
    public bool WatchtimeBefehl()
    {
        Vorbereiten();
        string[] teile = Eingabe();
        string name = Arg("user");

        if (teile.Length >= 1)
        {
            string gesucht = teile[0].TrimStart('@');
            var anderer = FindeNutzer(gesucht, VAR_MINUTEN);
            // Aus StreamElements übernommene Zuschauer kennt Streamer.bot evtl. noch nicht beim Namen
            if (anderer == null) anderer = TwitchNutzer(gesucht);
            long minA = anderer == null ? 0 : CPH.GetTwitchUserVarById<long>(anderer.Id, VAR_MINUTEN, true);
            if (minA <= 0) { Sagen("@" + name + " " + gesucht + " hat noch keine Zuschauzeit."); return true; }
            Sagen(anderer.Name + " hat " + Dauer(minA) + " zugeschaut.");
            return true;
        }

        long minuten = CPH.GetTwitchUserVarById<long>(Arg("userId"), VAR_MINUTEN, true);
        if (minuten <= 0) { Sagen("@" + name + " du hast noch keine Zuschauzeit. Gezählt wird alle paar Minuten, solange der Stream läuft."); return true; }
        Sagen("@" + name + " du hast " + Dauer(minuten) + " zugeschaut.");
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  !followage [name]  — seit wann jemand dem Kanal folgt (fragt Twitch direkt)
    // ════════════════════════════════════════════════════════════════════
    public bool Followage()
    {
        Vorbereiten();
        string[] teile = Eingabe();
        string name = Arg("user");
        string zielId = Arg("userId");
        string zielName = name;
        bool selbst = true;

        if (teile.Length >= 1)
        {
            string gesucht = teile[0].TrimStart('@');
            var anderer = TwitchNutzer(gesucht);
            if (anderer == null) { Sagen("@" + name + " " + gesucht + " finde ich auf Twitch nicht."); return true; }
            selbst = anderer.Id == zielId;
            zielId = anderer.Id;
            zielName = anderer.Name;
        }
        if (zielId == "") return true;

        string kanal = Arg("broadcastUserId");
        if (kanal == "")
        {
            try { kanal = CPH.TwitchGetBroadcaster().UserId; } catch { }
        }
        if (string.IsNullOrEmpty(kanal)) { LogFehler("Followage: Kanal unbekannt (Twitch-Konto in Streamer.bot verbunden?)"); return true; }
        if (zielId == kanal) { Sagen("@" + name + " dem eigenen Kanal kann man nicht folgen."); return true; }

        JToken eintrag;
        try
        {
            string json = Hole(TWITCH_API + "channels/followers?broadcaster_id=" + Uri.EscapeDataString(kanal) + "&user_id=" + Uri.EscapeDataString(zielId),
                CPH.TwitchOAuthToken, CPH.TwitchClientId);
            var daten = JObject.Parse(json)["data"] as JArray;
            eintrag = daten != null && daten.Count > 0 ? daten[0] : null;
        }
        catch (Exception e)
        {
            LogFehler("Followage: Twitch antwortet nicht: " + e.Message);
            Sagen("@" + name + " das kann ich gerade nicht nachsehen.");
            return true;
        }

        if (eintrag == null || eintrag["followed_at"] == null)
        {
            Sagen(selbst ? "@" + name + " du folgst dem Kanal noch nicht." : zielName + " folgt dem Kanal nicht.");
            return true;
        }

        DateTime seit = eintrag.Value<DateTime>("followed_at").ToUniversalTime();
        string text = Zeitraum(seit, DateTime.UtcNow) + " (seit dem " + seit.ToLocalTime().ToString("dd.MM.yyyy") + ")";
        Sagen(selbst ? "@" + name + " du folgst seit " + text + "." : zielName + " folgt seit " + text + ".");
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  Zuschauzeit aus StreamElements übernehmen  (einmalig, Aktion ohne Trigger, per "Test" starten)
    //  Nimmt pro Zuschauer den größeren Wert aus StreamElements und Streamer.bot. Da
    //  StreamElements die ganze Zeit mitgezählt hat, zählt nichts doppelt — auch nicht
    //  bei einem zweiten Durchlauf.
    // ════════════════════════════════════════════════════════════════════
    public bool WatchtimeImport()
    {
        Vorbereiten();
        if (Arg("userId") != "" && !IstMod()) return true;

        // 1. Alle Zuschauzeiten bei StreamElements abholen (login -> Minuten).
        //    Die Liste ist öffentlich, es braucht keinen Token.
        var seMinuten = new Dictionary<string, long>();
        try
        {
            string kanal = SE_KANAL;
            if (kanal == "") kanal = CPH.TwitchGetBroadcaster().UserLogin;
            string kanalId = Feld(JObject.Parse(Hole(SE_API + "channels/" + Uri.EscapeDataString(kanal), null, null)), "_id");
            if (kanalId == "") { Melden("Übernahme: StreamElements kennt den Kanal " + kanal + " nicht."); return true; }

            const int SEITE = 100;
            for (int offset = 0; offset < 200000; offset += SEITE)
            {
                string json = Hole(SE_API + "points/" + Uri.EscapeDataString(kanalId) + "/watchtime?limit=" + SEITE + "&offset=" + offset, null, null);
                JObject wurzel = JObject.Parse(json);
                if (wurzel["users"] == null)
                {
                    Melden("Übernahme: unerwartete Antwort von StreamElements, nichts geändert. Details im Streamer.bot-Log.");
                    LogFehler("StreamElements-Antwort: " + (json.Length > 300 ? json.Substring(0, 300) : json));
                    return true;
                }
                // Am Ende der Liste schickt StreamElements "users": null
                JArray users = wurzel["users"] as JArray;
                if (users == null || users.Count == 0) break;
                foreach (var u in users)
                {
                    string login = Feld(u, "username", "login", "user").ToLowerInvariant();
                    long min;
                    if (!long.TryParse(Feld(u, "minutes", "watchtime"), out min) || min <= 0) continue;
                    if (!GueltigerLogin(login) || IstBot(login)) continue;
                    long schon;
                    if (!seMinuten.TryGetValue(login, out schon) || min > schon) seMinuten[login] = min;
                }
                if (users.Count < SEITE) break;
            }
        }
        catch (Exception e) { Melden("Übernahme: StreamElements nicht erreichbar, nichts geändert (" + e.Message + ")."); return true; }

        if (seMinuten.Count == 0) { Melden("Übernahme: StreamElements hat keine Zuschauzeiten geliefert."); return true; }

        // 2. Namen in Twitch-IDs übersetzen (100 pro Anfrage) und eintragen
        var logins = seMinuten.Keys.ToList();
        int gefunden = 0, geaendert = 0, fehler = 0;
        for (int i = 0; i < logins.Count; i += 100)
        {
            var teil = logins.Skip(i).Take(100).ToList();
            JArray daten;
            try
            {
                string json = Hole(TWITCH_API + "users?login=" + string.Join("&login=", teil), CPH.TwitchOAuthToken, CPH.TwitchClientId);
                daten = JObject.Parse(json)["data"] as JArray;
            }
            catch (Exception e) { fehler += teil.Count; LogFehler("Übernahme: Twitch-Abfrage fehlgeschlagen: " + e.Message); continue; }
            if (daten == null) continue;

            foreach (var d in daten)
            {
                string id = Feld(d, "id");
                long se;
                if (id == "" || !seMinuten.TryGetValue(Feld(d, "login").ToLowerInvariant(), out se)) continue;
                gefunden++;
                long alt = CPH.GetTwitchUserVarById<long>(id, VAR_MINUTEN, true);
                if (se <= alt) continue;
                CPH.SetTwitchUserVarById(id, VAR_MINUTEN, se, true);
                geaendert++;
            }
        }

        int weg = logins.Count - gefunden - fehler;
        Melden("Zuschauzeit übernommen: " + Zahl(geaendert) + " von " + Zahl(logins.Count) + " Zuschauern aktualisiert"
            + (weg > 0 ? ", " + Zahl(weg) + " gibt es auf Twitch nicht mehr" : "")
            + (fehler > 0 ? ", " + Zahl(fehler) + " wegen Fehlern übersprungen (einfach nochmal starten)" : "") + ".");
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  !punkte [name]   |   Mods: !punkte add|remove|set <name> <betrag>
    // ════════════════════════════════════════════════════════════════════
    public bool Punkte()
    {
        Vorbereiten();
        string[] teile = Eingabe();
        string id = Arg("userId");
        string name = Arg("user");

        string ersterTeil = teile.Length > 0 ? teile[0].ToLowerInvariant() : "";
        bool istAdmin = ersterTeil == "add" || ersterTeil == "remove" || ersterTeil == "set" || ersterTeil == "geben" || ersterTeil == "nehmen";
        if (istAdmin && !IstMod()) { Sagen("@" + name + " das dürfen nur Mods."); return true; }

        if (istAdmin && teile.Length >= 3)
        {
            string modus = ersterTeil;
            var ziel = FindeNutzer(teile[1]);
            long betrag;
            if (ziel == null) { Sagen("@" + name + " " + teile[1] + " kenne ich noch nicht (war noch nie im Stream)."); return true; }
            if (!long.TryParse(teile[2], out betrag) || betrag < 0) { Sagen("@" + name + " Betrag ungültig."); return true; }

            long neu;
            lock (Sperre)
            {
                long alt = Kontostand(ziel.Id);
                if (modus == "add" || modus == "geben") neu = alt + betrag;
                else if (modus == "remove" || modus == "nehmen") neu = Math.Max(0, alt - betrag);
                else if (modus == "set") neu = betrag;
                else { Sagen("@" + name + " Benutze add, remove oder set."); return true; }
                CPH.SetTwitchUserVarById(ziel.Id, VAR_PUNKTE, neu, true);
            }
            Sagen(ziel.Name + " hat jetzt " + Zahl(neu) + " " + WAEHRUNG + ".");
            return true;
        }

        if (teile.Length >= 1)
        {
            var anderer = FindeNutzer(teile[0]);
            if (anderer == null) { Sagen("@" + name + " " + teile[0].TrimStart('@') + " hat noch keine " + WAEHRUNG + "."); return true; }
            long minA = CPH.GetTwitchUserVarById<long>(anderer.Id, VAR_MINUTEN, true);
            Sagen(anderer.Name + " hat " + Zahl(Kontostand(anderer.Id)) + " " + WAEHRUNG + " (" + Dauer(minA) + " zugeschaut).");
            return true;
        }

        long minuten = CPH.GetTwitchUserVarById<long>(id, VAR_MINUTEN, true);
        Sagen("@" + name + " du hast " + Zahl(Kontostand(id)) + " " + WAEHRUNG + " und " + Dauer(minuten) + " zugeschaut. Platz " + Platz(id) + ".");
        return true;
    }

    // !top
    public bool Bestenliste()
    {
        Vorbereiten();
        var liste = AlleKonten().Take(5).ToList();
        if (liste.Count == 0) { Sagen("Noch hat niemand " + WAEHRUNG + "."); return true; }
        var teile = liste.Select((e, i) => (i + 1) + ". " + e.Item2 + " (" + Zahl(e.Item3) + ")");
        Sagen("Reichste Zuschauer: " + string.Join(" · ", teile));
        return true;
    }

    // !geben <name> <betrag>
    public bool Geben()
    {
        Vorbereiten();
        string[] teile = Eingabe();
        string id = Arg("userId");
        string name = Arg("user");
        if (teile.Length < 2) { Sagen("@" + name + " So geht's: !geben <name> <betrag>"); return true; }

        var ziel = FindeNutzer(teile[0]);
        if (ziel == null) { Sagen("@" + name + " " + teile[0].TrimStart('@') + " kenne ich noch nicht."); return true; }
        if (ziel.Id == id) { Sagen("@" + name + " an dich selbst geht nicht."); return true; }

        long betrag = LiesBetrag(teile[1], Kontostand(id));
        if (betrag <= 0) { Sagen("@" + name + " Betrag ungültig."); return true; }
        if (!Abbuchen(id, betrag)) { Sagen("@" + name + " so viele " + WAEHRUNG + " hast du nicht."); return true; }
        Gutschrift(ziel.Id, betrag);
        Sagen(name + " schenkt " + ziel.Name + " " + Zahl(betrag) + " " + WAEHRUNG + ".");
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  !gamble <betrag|all|half|50%|1k>  — gewonnen oder verloren, Antwort sofort im Chat
    //  Gewonnen = Einsatz doppelt zurück, verloren = weg (10 % davon in den Topf)
    //  Bewusst ohne Overlay: bei vielen gleichzeitigen Spielern staut sich sonst alles.
    // ════════════════════════════════════════════════════════════════════
    public bool Gamble()
    {
        Vorbereiten();
        string id = Arg("userId");
        string name = Arg("user");
        string[] teile = Eingabe();
        if (teile.Length < 1) { Sagen("@" + name + " So geht's: !gamble <betrag> (oder all, half, 50%)"); return true; }

        lock (Sperre)
        {
            DateTime bis;
            if (gambleCooldown.TryGetValue(id, out bis) && bis > DateTime.UtcNow)
            {
                Sagen("@" + name + " kurz durchatmen — noch " + (int)Math.Ceiling((bis - DateTime.UtcNow).TotalSeconds) + " s.");
                return true;
            }
        }

        long einsatz = LiesBetrag(teile[0], Kontostand(id));
        string fehler = PruefeEinsatz(einsatz);
        if (fehler != null) { Sagen("@" + name + " " + fehler); return true; }

        // all-in erkennen, bevor abgebucht ist
        bool allIn = einsatz >= Kontostand(id);
        if (!Abbuchen(id, einsatz)) { Sagen("@" + name + " du hast nur " + Zahl(Kontostand(id)) + " " + WAEHRUNG + "."); return true; }
        lock (Sperre) gambleCooldown[id] = DateTime.UtcNow.AddSeconds(GAMBLE_COOLDOWN_S);

        bool gewonnen;
        lock (Sperre) gewonnen = Zufall.Next(0, 100) < GAMBLE_GEWINNCHANCE;
        if (gewonnen) Gutschrift(id, einsatz * 2);
        else InDenTopf((long)Math.Round(einsatz * TOPF_ANTEIL));
        long stand = Kontostand(id);

        string text;
        if (gewonnen && allIn)
            text = "ALL IN … gewonnen! " + name + " verdoppelt auf " + Zahl(stand) + " " + WAEHRUNG + " " + Emote(EMOTES_ALLIN_GEWONNEN);
        else if (gewonnen)
            text = Zufallssatz(SAETZE_GEWONNEN, name, einsatz) + " (jetzt " + Zahl(stand) + ") " + Emote(EMOTES_GEWONNEN);
        else if (allIn)
            text = "ALL IN … verloren. " + name + " ist pleite. " + Emote(EMOTES_ALLIN_VERLOREN);
        else
            text = Zufallssatz(SAETZE_VERLOREN, name, einsatz) + " (jetzt " + Zahl(stand) + ") " + Emote(EMOTES_VERLOREN);

        Sagen(text);
        return true;
    }

    static string Zufallssatz(string[] saetze, string name, long betrag)
    {
        string s;
        lock (Sperre) s = saetze[Zufall.Next(saetze.Length)];
        return s.Replace("{name}", name).Replace("{betrag}", Zahl(betrag) + " " + WAEHRUNG);
    }

    // ════════════════════════════════════════════════════════════════════
    //  !rakete <betrag> [ziel]   z. B. !rakete 100 2.5
    //  Wer sein Ziel erreicht, bevor die Rakete explodiert, bekommt Einsatz x Ziel.
    //  Ziel statt "!raus": die Stream-Verzögerung macht Live-Aussteigen unfair.
    // ════════════════════════════════════════════════════════════════════
    public bool Rakete()
    {
        Vorbereiten();
        string id = Arg("userId");
        string name = Arg("user");
        string[] teile = Eingabe();
        if (teile.Length < 1) { Sagen("@" + name + " So geht's: !rakete <betrag> <ziel>, z. B. !rakete 100 2.5"); return true; }

        double ziel = 2.0;
        if (teile.Length >= 2)
        {
            string z = teile[1].ToLowerInvariant().TrimEnd('x').Replace(',', '.');
            if (!double.TryParse(z, NumberStyles.Float, CultureInfo.InvariantCulture, out ziel) || ziel < 1.1 || ziel > RAKETE_MAX)
            {
                Sagen("@" + name + " das Ziel muss zwischen 1.1 und " + RAKETE_MAX.ToString("0", CultureInfo.InvariantCulture) + " liegen.");
                return true;
            }
            ziel = Math.Round(ziel, 2);
        }

        long einsatz = LiesBetrag(teile[0], Kontostand(id));
        string fehler = PruefeEinsatz(einsatz);
        if (fehler != null) { Sagen("@" + name + " " + fehler); return true; }

        bool neueRunde = false;
        lock (Sperre)
        {
            if (raketePhase == "flug" || raketePhase == "pause")
            {
                Sagen("@" + name + " die Rakete fliegt gerade — gleich geht die nächste Runde auf.");
                return true;
            }
            if (raketenWetten.Any(w => w.Id == id)) { Sagen("@" + name + " du bist in dieser Runde schon dabei."); return true; }
            if (!Abbuchen(id, einsatz)) { Sagen("@" + name + " du hast nur " + Zahl(Kontostand(id)) + " " + WAEHRUNG + "."); return true; }

            if (raketePhase == "aus")
            {
                raketePhase = "offen";
                raketeStartUm = JetztMs() + RAKETE_WARTEZEIT_S * 1000;
                neueRunde = true;
            }
            raketenWetten.Add(new RaketenWette { Id = id, Name = name, Einsatz = einsatz, Ziel = ziel });
        }

        if (neueRunde)
        {
            Sagen("Die Rakete startet in " + RAKETE_WARTEZEIT_S + " Sekunden! Steig ein mit !rakete <betrag> <ziel>, z. B. !rakete 100 2.5 " + Emote(EMOTES_RAKETE_START));
            Task.Run(() => RaketenRunde());
        }
        SendeRaketenStand("open", 0);
        return true;
    }

    void RaketenRunde()
    {
        try
        {
            Thread.Sleep(RAKETE_WARTEZEIT_S * 1000);

            double absturz;
            List<RaketenWette> wetten;
            lock (Sperre)
            {
                raketePhase = "flug";
                // Gleichverteilte Absturzstelle mit Hausvorteil; ab und zu explodiert sie sofort
                double u = Zufall.NextDouble();
                absturz = (1.0 - RAKETE_HAUSVORTEIL) / (1.0 - u);
                absturz = Math.Max(1.0, Math.Min(RAKETE_MAX, Math.Floor(absturz * 100) / 100));
                wetten = raketenWetten.ToList();
            }

            long flugMs = (long)(Math.Log(absturz) / RAKETE_TEMPO * 1000);
            SendeRaketenStand("launch", absturz);

            // Animation + Explosion + Stream-Verzögerung abwarten, dann Ergebnis in den Chat
            Thread.Sleep((int)flugMs + 2500 + STREAM_DELAY_S * 1000);

            var gewinner = new List<string>();
            var verlierer = new List<string>();
            long verloren = 0;
            foreach (var w in wetten)
            {
                if (w.Ziel <= absturz)
                {
                    long g = (long)Math.Floor(w.Einsatz * w.Ziel);
                    Gutschrift(w.Id, g);
                    gewinner.Add(w.Name + " (+" + Zahl(g - w.Einsatz) + ")");
                }
                else { verlierer.Add(w.Name); verloren += w.Einsatz; }
            }
            InDenTopf((long)Math.Round(verloren * TOPF_ANTEIL));

            string text = "Die Rakete explodiert bei " + Mult(absturz) + "!";
            if (gewinner.Count > 0) text += " Sicher gelandet: " + string.Join(", ", gewinner) + ".";
            if (verlierer.Count > 0) text += " Mit in die Luft: " + string.Join(", ", verlierer) + ".";
            text += " " + (verlierer.Count == 0 && gewinner.Count > 0 ? Emote(EMOTES_RAKETE_ALLE_SICHER) : Emote(EMOTES_RAKETE_BOOM));
            Sagen(text);

            lock (Sperre) raketePhase = "pause";
            Thread.Sleep(RAKETE_PAUSE_S * 1000);
        }
        catch (Exception e)
        {
            LogFehler("Rakete: " + e.Message);
            // Im Fehlerfall alle Einsätze zurück
            lock (Sperre) foreach (var w in raketenWetten) Gutschrift(w.Id, w.Einsatz);
        }
        finally
        {
            lock (Sperre) { raketenWetten.Clear(); raketePhase = "aus"; }
            SendeRaketenStand("idle", 0);
        }
    }

    void SendeRaketenStand(string phase, double absturz)
    {
        var o = Ereignis("rocket");
        o["phase"] = phase;
        lock (Sperre)
        {
            o["startsAt"] = raketeStartUm;
            o["growth"] = RAKETE_TEMPO;
            if (phase == "launch") { o["crash"] = absturz; o["launchedAt"] = JetztMs(); }
            var arr = new JArray();
            foreach (var w in raketenWetten) arr.Add(new JObject { ["user"] = w.Name, ["bet"] = w.Einsatz, ["target"] = w.Ziel });
            o["bets"] = arr;
        }
        Senden(o);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Murmelbahn der Website — keine Wetten, feste Preise für die Plätze.
    //  Platz 1 bekommt mehr, je mehr Fahrer dabei sind; bei vielen Fahrern gibt es
    //  auch etwas für Platz 2 und 3. Die Website meldet zuerst den Sieger und ein
    //  paar Sekunden später Platz 1–3.
    // ════════════════════════════════════════════════════════════════════

    /// <summary>Preise für Platz 1, 2, 3 bei so vielen Fahrern (0 = kein Preis).</summary>
    static long[] MurmelPreise(int fahrer)
    {
        long p1 = Math.Min(MURMEL_PREIS_MAX, MURMEL_PREIS_GRUND + MURMEL_PREIS_PRO_FAHRER * Math.Max(0, fahrer));
        long p2 = fahrer >= MURMEL_AB_PLATZ2 ? (long)Math.Round(p1 * MURMEL_ANTEIL_PLATZ2) : 0;
        long p3 = fahrer >= MURMEL_AB_PLATZ3 ? (long)Math.Round(p1 * MURMEL_ANTEIL_PLATZ3) : 0;
        return new[] { p1, p2, p3 };
    }

    /// <summary>Testmurmeln aus dem Dashboard der Website bekommen keine Punkte.</summary>
    static bool KeinePunkte(Spieler p)
    {
        return p == null || string.IsNullOrEmpty(p.Id) || p.Id.StartsWith("bot-") || IstBot(p.Name);
    }

    // Alter Befehl: falls in Streamer.bot noch eine !wette-Aktion hierher zeigt
    public bool Wette()
    {
        Vorbereiten();
        Sagen("@" + Arg("user") + " Auf die Murmelbahn wird nicht mehr gewettet — einfach mitfahren! Platz 1 bekommt " +
              Zahl(MURMEL_PREIS_GRUND) + " + " + Zahl(MURMEL_PREIS_PRO_FAHRER) + " " + WAEHRUNG + " pro Fahrer.");
        return true;
    }

    void SendeMurmelStand(string phase)
    {
        var o = Ereignis("marbles");
        o["phase"] = phase;
        lock (Sperre)
        {
            int n = murmelFahrer.Count;
            var preise = MurmelPreise(n);
            var arr = new JArray();
            foreach (var p in preise) if (p > 0) arr.Add(p);
            o["prizes"] = arr;
            o["riders"] = n;
            o["participation"] = MURMEL_TEILNAHME;
            o["closesAt"] = murmelSchlussUm;
            // Wie viele Fahrer noch fehlen, bis es auch für den nächsten Platz etwas gibt
            if (n < MURMEL_AB_PLATZ2) o["next"] = new JObject { ["place"] = 2, ["missing"] = MURMEL_AB_PLATZ2 - n };
            else if (n < MURMEL_AB_PLATZ3) o["next"] = new JObject { ["place"] = 3, ["missing"] = MURMEL_AB_PLATZ3 - n };
            var namen = new JArray();
            foreach (var p in murmelFahrer) namen.Add(p.Name);
            o["players"] = namen;
        }
        Senden(o);
    }

    // Läuft im Hintergrund und fragt die Murmelbahn der Website ab
    void StarteSchleife()
    {
        lock (Sperre)
        {
            if (abfrageSchleife != null && abfrageSchleife.IsAlive) return;
            abfrageSchleife = new Thread(() =>
            {
                while (true)
                {
                    try
                    {
                        bool live = (DateTime.UtcNow - letztesLebenszeichen).TotalMinutes < 15;
                        bool rundeAktiv;
                        lock (Sperre) rundeAktiv = murmelPhase != "aus";
                        if (live || rundeAktiv) MurmelAbfragen();
                    }
                    catch (Exception e) { LogFehler("Murmel-Abfrage: " + e.Message); }
                    Thread.Sleep(2500);
                }
            });
            abfrageSchleife.IsBackground = true;
            abfrageSchleife.Start();
        }
    }

    static int murmelGesendeteFahrer = -1;

    void MurmelAbfragen(bool erzwingen = false)
    {
        if (MURMEL_OVERLAY_KEY.StartsWith("HIER_")) return;
        lock (Sperre)
        {
            // Höchstens alle 1,5 s
            if (!erzwingen && (DateTime.UtcNow - murmelLetzterAbruf).TotalMilliseconds < 1500) return;
            murmelLetzterAbruf = DateTime.UtcNow;
        }

        string json;
        try
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            using (var wc = new WebClient())
            {
                wc.Encoding = Encoding.UTF8;
                wc.Proxy = null; // keine Proxy-Suche: die kostet unter Windows sonst Sekunden
                wc.Headers.Add("User-Agent", "StreamerBot-Gamble");
                json = wc.DownloadString(MURMEL_API + Uri.EscapeDataString(MURMEL_OVERLAY_KEY));
            }
        }
        catch (Exception e) { LogFehler("Website nicht erreichbar: " + e.Message); return; }

        JObject daten = JObject.Parse(json);
        long serverJetzt = daten.Value<long?>("serverNow") ?? JetztMs();
        long versatz = JetztMs() - serverJetzt; // Serverzeit -> lokale Zeit
        JToken m = daten["scenes"] != null ? daten["scenes"]["marbles"] : null;

        string ansage = null;
        string senden = null;
        MurmelErgebnis abrechnen = null;

        lock (Sperre)
        {
            if (m == null || m.Type == JTokenType.Null)
            {
                // Rennen weg: abgebrochen oder schon vorbei
                if (murmelPhase != "aus")
                {
                    // Sieger war schon da, aber Platz 2/3 kamen nicht mehr: nur den Sieger auszahlen
                    if (murmelSieger != null && murmelRunde != null && !murmelAbgerechnet.Contains(murmelRunde))
                    {
                        murmelAbgerechnet.Add(murmelRunde);
                        abrechnen = new MurmelErgebnis { Plaetze = new List<Spieler> { murmelSieger }, Fahrer = murmelFahrer.ToList(), SiegerGesehen = murmelSiegerGesehen };
                    }
                    murmelPhase = "aus";
                    murmelSieger = null;
                    senden = "idle";
                }
            }
            else
            {
                string rid = m.Value<string>("id");
                string phase = m.Value<string>("phase");

                if (rid != murmelRunde)
                {
                    murmelRunde = rid;
                    murmelAnsageGemacht = false;
                    murmelSieger = null;
                    murmelGesendeteFahrer = -1;
                }

                murmelFahrer = (m["players"] as JArray ?? new JArray())
                    .Select(p => new Spieler { Id = p.Value<string>("id"), Name = p.Value<string>("name") })
                    .Where(p => !string.IsNullOrEmpty(p.Id)).ToList();

                long joinEnds = m.Value<long?>("joinEndsAt") ?? 0;
                murmelSchlussUm = joinEnds > 0 ? joinEnds + versatz : 0;

                string alt = murmelPhase;
                murmelPhase = phase;

                if (phase == "join")
                {
                    if (!murmelAnsageGemacht)
                    {
                        murmelAnsageGemacht = true;
                        ansage = "Murmelbahn! Platz 1 bekommt " + Zahl(MURMEL_PREIS_GRUND) + " + " + Zahl(MURMEL_PREIS_PRO_FAHRER) +
                                 " " + WAEHRUNG + " pro Fahrer, ab " + MURMEL_AB_PLATZ2 + " Fahrern gibt es auch etwas für Platz 2, ab " +
                                 MURMEL_AB_PLATZ3 + " für Platz 3.";
                    }
                    // Nur bei neuen Fahrern neu senden
                    if (murmelFahrer.Count != murmelGesendeteFahrer)
                    {
                        murmelGesendeteFahrer = murmelFahrer.Count;
                        senden = "open";
                    }
                }
                else if (alt == "join" || alt == "aus")
                {
                    senden = "closed";
                }

                JToken sieger = m["winner"];
                if (sieger != null && sieger.Type == JTokenType.Object && !murmelAbgerechnet.Contains(rid))
                {
                    if (murmelSieger == null)
                    {
                        murmelSieger = new Spieler { Id = sieger.Value<string>("id"), Name = sieger.Value<string>("name") };
                        murmelSiegerGesehen = DateTime.UtcNow;
                    }
                    // Platz 1–3 kommen ein paar Sekunden nach dem Sieger; zu lange warten wir nicht
                    var plaetze = (m["placings"] as JArray ?? new JArray())
                        .Select(p => new Spieler { Id = p.Value<string>("id"), Name = p.Value<string>("name") })
                        .Where(p => !string.IsNullOrEmpty(p.Id)).ToList();
                    bool zuLange = (DateTime.UtcNow - murmelSiegerGesehen).TotalSeconds >= MURMEL_PLAETZE_WARTEN_S;
                    if (plaetze.Count > 0 || zuLange)
                    {
                        murmelAbgerechnet.Add(rid);
                        abrechnen = new MurmelErgebnis
                        {
                            Plaetze = plaetze.Count > 0 ? plaetze : new List<Spieler> { murmelSieger },
                            Fahrer = murmelFahrer.ToList(),
                            SiegerGesehen = murmelSiegerGesehen
                        };
                    }
                }
            }
        }

        if (ansage != null) Sagen(ansage);
        if (senden != null) SendeMurmelStand(senden);
        if (abrechnen != null)
        {
            var e = abrechnen;
            // Der Sieger steht fest, sobald OBS ihn sieht — der Stream zeigt es später.
            // Gezählt ab dem Moment, in dem wir den Sieger gesehen haben.
            int warten = (int)Math.Max(0, (6 + STREAM_DELAY_S) * 1000 - (DateTime.UtcNow - e.SiegerGesehen).TotalMilliseconds);
            Task.Run(() => { Thread.Sleep(warten); MurmelAuszahlen(e); });
        }
    }

    class MurmelErgebnis { public List<Spieler> Plaetze; public List<Spieler> Fahrer; public DateTime SiegerGesehen; }

    void MurmelAuszahlen(MurmelErgebnis e)
    {
        try
        {
            int n = e.Fahrer.Count;
            var preise = MurmelPreise(n);

            if (MURMEL_TEILNAHME > 0)
                foreach (var p in e.Fahrer) if (!KeinePunkte(p)) Gutschrift(p.Id, MURMEL_TEILNAHME);

            var plaetze = new JArray();
            var text = new List<string>();
            for (int i = 0; i < e.Plaetze.Count && i < 3; i++)
            {
                var p = e.Plaetze[i];
                long preis = preise[i];
                if (preis <= 0) continue;
                bool zahlt = !KeinePunkte(p);
                if (zahlt) Gutschrift(p.Id, preis);
                plaetze.Add(new JObject { ["place"] = i + 1, ["user"] = p.Name, ["win"] = zahlt ? preis : 0 });
                text.Add((i + 1) + ". " + p.Name + (zahlt ? " (+" + Zahl(preis) + ")" : ""));
            }

            string satz;
            if (text.Count <= 1)
                satz = e.Plaetze[0].Name + " gewinnt die Murmelbahn und bekommt " + Zahl(preise[0]) + " " + WAEHRUNG + ".";
            else
                satz = "Murmelbahn mit " + n + " Fahrern: " + string.Join(", ", text) + ".";
            if (MURMEL_TEILNAHME > 0 && n > 1) satz += " Jeder Fahrer bekommt dazu " + Zahl(MURMEL_TEILNAHME) + " fürs Mitfahren.";
            Sagen(satz + " " + Emote(EMOTES_MURMEL_SIEG));

            var o = Ereignis("marblesResult");
            o["winner"] = e.Plaetze[0].Name;
            o["placings"] = plaetze;
            o["riders"] = n;
            o["participation"] = MURMEL_TEILNAHME;
            Senden(o);
        }
        catch (Exception ex) { LogFehler("Murmel-Auszahlung: " + ex.Message); }
    }

    // ════════════════════════════════════════════════════════════════════
    //  !topf   |   Mods: !topf ziehen    (auch als Unteraktion in End_Stream)
    //  Gewinner: zufälliger Zuschauer, gewichtet nach Zuschauzeit in diesem Stream
    // ════════════════════════════════════════════════════════════════════
    public bool Topf()
    {
        Vorbereiten();
        string[] teile = Eingabe();
        if (teile.Length >= 1 && (teile[0].ToLowerInvariant() == "ziehen" || teile[0].ToLowerInvariant() == "draw") && IstMod())
            return TopfZiehen();
        long topf = CPH.GetGlobalVar<long>(VAR_TOPF, true);
        Sagen("Im Topf liegen " + Zahl(topf) + " " + WAEHRUNG + ". Am Ende des Streams gewinnt ihn ein Zuschauer — je länger du dabei bist, desto besser deine Chance.");
        return true;
    }

    public bool TopfZiehen()
    {
        Vorbereiten();
        long topf = CPH.GetGlobalVar<long>(VAR_TOPF, true);
        List<KeyValuePair<string, int>> lose;
        lock (Sperre) lose = sessionMinuten.Where(kv => kv.Value > 0).ToList();

        if (topf < TOPF_MIN || lose.Count == 0)
        {
            Sagen(topf < TOPF_MIN ? "Der Topf ist noch zu klein für eine Ziehung." : "Niemand hat heute lange genug zugeschaut für den Topf.");
            return true;
        }

        int summe = lose.Sum(kv => kv.Value);
        int treffer;
        lock (Sperre) treffer = Zufall.Next(0, summe);
        string gewinnerId = lose[0].Key;
        foreach (var kv in lose) { if (treffer < kv.Value) { gewinnerId = kv.Key; break; } treffer -= kv.Value; }

        string name;
        lock (Sperre)
        {
            name = sessionNamen.ContainsKey(gewinnerId) ? sessionNamen[gewinnerId] : "?";
            sessionMinuten.Clear();
        }
        Gutschrift(gewinnerId, topf);
        CPH.SetGlobalVar(VAR_TOPF, 0L, true);
        CPH.SetGlobalVar("session_topf_gewinner", name + " (" + Zahl(topf) + " " + WAEHRUNG + ")", false);

        Sagen(name + " gewinnt den Topf: " + Zahl(topf) + " " + WAEHRUNG + "! " + Emote(EMOTES_TOPF));
        var o = Ereignis("potWinner");
        o["user"] = name; o["amount"] = topf; o["entrants"] = lose.Count;
        Senden(o);
        return true;
    }

    // ════════════════════════════════════════════════════════════════════
    //  Hilfsfunktionen
    // ════════════════════════════════════════════════════════════════════
    void Vorbereiten()
    {
        cph = CPH;
        StarteSchleife();
        if (Arg("userId") != "") lock (Sperre) letztesLebenszeichen = DateTime.UtcNow;
    }

    // Statisch, damit auch Hintergrund-Aufgaben (Rakete, Murmeln) sie benutzen können
    static long Kontostand(string id)
    {
        if (string.IsNullOrEmpty(id)) return 0;
        lock (Sperre)
        {
            // Wer noch nie da war, bekommt das Startguthaben
            if (!cph.GetTwitchUserVarById<bool>(id, VAR_DABEI, true))
            {
                long bisher = cph.GetTwitchUserVarById<long>(id, VAR_PUNKTE, true);
                cph.SetTwitchUserVarById(id, VAR_PUNKTE, bisher + STARTGUTHABEN, true);
                cph.SetTwitchUserVarById(id, VAR_DABEI, true, true);
                return bisher + STARTGUTHABEN;
            }
            return cph.GetTwitchUserVarById<long>(id, VAR_PUNKTE, true);
        }
    }

    static void Gutschrift(string id, long betrag)
    {
        if (string.IsNullOrEmpty(id) || betrag == 0) return;
        lock (Sperre) cph.SetTwitchUserVarById(id, VAR_PUNKTE, Math.Max(0, Kontostand(id) + betrag), true);
    }

    static bool Abbuchen(string id, long betrag)
    {
        lock (Sperre)
        {
            long stand = Kontostand(id);
            if (betrag <= 0 || stand < betrag) return false;
            cph.SetTwitchUserVarById(id, VAR_PUNKTE, stand - betrag, true);
            return true;
        }
    }

    void InDenTopf(long betrag)
    {
        if (betrag <= 0) return;
        long neu;
        lock (Sperre)
        {
            neu = cph.GetGlobalVar<long>(VAR_TOPF, true) + betrag;
            cph.SetGlobalVar(VAR_TOPF, neu, true);
        }
        var o = Ereignis("pot");
        o["amount"] = neu;
        o["added"] = betrag;
        Senden(o);
    }

    // (id, name, punkte), absteigend
    List<Tuple<string, string, long>> AlleKonten()
    {
        var liste = CPH.GetTwitchUsersVar<long>(VAR_PUNKTE, true);
        if (liste == null) return new List<Tuple<string, string, long>>();
        return liste
            .Where(v => !IstBot(v.UserLogin))
            .OrderByDescending(v => v.Value)
            .Select(v => Tuple.Create(v.UserId, string.IsNullOrEmpty(v.UserName) ? v.UserLogin : v.UserName, v.Value))
            .ToList();
    }

    int Platz(string id)
    {
        var liste = AlleKonten();
        int i = liste.FindIndex(e => e.Item1 == id);
        return i < 0 ? liste.Count + 1 : i + 1;
    }

    Spieler FindeNutzer(string eingabe, string variable = VAR_PUNKTE)
    {
        string login = (eingabe ?? "").TrimStart('@').ToLowerInvariant();
        if (login == "") return null;
        var liste = CPH.GetTwitchUsersVar<long>(variable, true);
        if (liste == null) return null;
        var v = liste.FirstOrDefault(x => (x.UserLogin ?? "").ToLowerInvariant() == login || (x.UserName ?? "").ToLowerInvariant() == login);
        return v == null ? null : new Spieler { Id = v.UserId, Name = string.IsNullOrEmpty(v.UserName) ? v.UserLogin : v.UserName };
    }

    // Fragt Twitch nach einem Namen — findet auch Leute, die noch nie im Chat waren
    Spieler TwitchNutzer(string eingabe)
    {
        string login = (eingabe ?? "").TrimStart('@').ToLowerInvariant();
        if (!GueltigerLogin(login)) return null;
        try
        {
            var info = CPH.TwitchGetUserInfoByLogin(login);
            if (info == null || string.IsNullOrEmpty(info.UserId)) return null;
            return new Spieler { Id = info.UserId, Name = string.IsNullOrEmpty(info.UserName) ? login : info.UserName };
        }
        catch { return null; }
    }

    static bool GueltigerLogin(string login)
    {
        if (string.IsNullOrEmpty(login) || login.Length > 25) return false;
        foreach (char c in login)
            if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) return false;
        return true;
    }

    // GET mit Anmeldung; wirft bei Fehlern (der Aufrufer fängt ab)
    static string Hole(string url, string bearer, string clientId)
    {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        using (var wc = new WebClient())
        {
            wc.Encoding = Encoding.UTF8;
            wc.Proxy = null; // keine Proxy-Suche: die kostet unter Windows sonst Sekunden
            wc.Headers.Add("User-Agent", "StreamerBot-Gamble");
            wc.Headers.Add("Accept", "application/json");
            if (!string.IsNullOrEmpty(bearer)) wc.Headers.Add("Authorization", "Bearer " + bearer);
            if (!string.IsNullOrEmpty(clientId)) wc.Headers.Add("Client-Id", clientId);
            return wc.DownloadString(url);
        }
    }

    // "2 Jahren, 3 Monaten und 5 Tagen" — passend hinter "seit"
    static string Zeitraum(DateTime von, DateTime bis)
    {
        if (bis < von) bis = von;
        int jahre = bis.Year - von.Year, monate = bis.Month - von.Month, tage = bis.Day - von.Day;
        if (bis.TimeOfDay < von.TimeOfDay) tage--;
        if (tage < 0) { monate--; tage += DateTime.DaysInMonth(bis.AddMonths(-1).Year, bis.AddMonths(-1).Month); }
        if (monate < 0) { jahre--; monate += 12; }

        var teile = new List<string>();
        if (jahre > 0) teile.Add(jahre + (jahre == 1 ? " Jahr" : " Jahren"));
        if (monate > 0) teile.Add(monate + (monate == 1 ? " Monat" : " Monaten"));
        if (tage > 0) teile.Add(tage + (tage == 1 ? " Tag" : " Tagen"));
        if (teile.Count == 0) return "weniger als einem Tag";
        if (teile.Count == 1) return teile[0];
        return string.Join(", ", teile.Take(teile.Count - 1)) + " und " + teile[teile.Count - 1];
    }

    // Für Dinge, die der Streamer selbst anstößt: ins Log und in den Chat
    static void Melden(string text)
    {
        LogFehler(text);
        Sagen(text);
    }

    // Erlaubt: 500, 1k, 2.5k, all/alles, half/hälfte, 25%
    long LiesBetrag(string text, long stand)
    {
        string t = (text ?? "").Trim().ToLowerInvariant().Replace(".", "").Replace(",", ".");
        if (t == "all" || t == "alles" || t == "allin") return stand;
        if (t == "half" || t == "hälfte" || t == "haelfte") return stand / 2;
        double wert;
        if (t.EndsWith("%") && double.TryParse(t.TrimEnd('%'), NumberStyles.Float, CultureInfo.InvariantCulture, out wert))
            return (long)Math.Floor(stand * Math.Max(0, Math.Min(100, wert)) / 100.0);
        // "2.5k": der Punkt wurde oben entfernt, also mit Original nochmal versuchen
        string k = (text ?? "").Trim().ToLowerInvariant().Replace(",", ".");
        if (k.EndsWith("k") && double.TryParse(k.TrimEnd('k'), NumberStyles.Float, CultureInfo.InvariantCulture, out wert))
            return (long)Math.Floor(wert * 1000);
        long ganz;
        return long.TryParse(t, out ganz) ? ganz : -1;
    }

    string PruefeEinsatz(long einsatz)
    {
        if (einsatz < 0) return "Betrag ungültig — z. B. 100, 1k, half, all oder 25%.";
        if (einsatz < MIN_EINSATZ) return "Mindesteinsatz sind " + MIN_EINSATZ + " " + WAEHRUNG + ".";
        if (MAX_EINSATZ > 0 && einsatz > MAX_EINSATZ) return "Höchsteinsatz sind " + Zahl(MAX_EINSATZ) + " " + WAEHRUNG + ".";
        return null;
    }

    string[] Eingabe()
    {
        return Arg("rawInput").Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
    }

    string Arg(string schluessel)
    {
        object v;
        return args != null && args.TryGetValue(schluessel, out v) && v != null ? v.ToString() : "";
    }

    bool IstMod()
    {
        string b = Arg("broadcastUserId");
        if (b != "" && b == Arg("userId")) return true;
        return Arg("isModerator").ToLowerInvariant() == "true" || Arg("isBroadcaster").ToLowerInvariant() == "true";
    }

    static bool IstBot(string login) { return !string.IsNullOrEmpty(login) && BOTS.Contains(login.ToLowerInvariant()); }

    static string Feld(JToken t, params string[] namen)
    {
        foreach (var n in namen) { var v = t[n]; if (v != null && v.Type != JTokenType.Null && v.ToString() != "") return v.ToString(); }
        return "";
    }

    static bool Wahr(JToken t, params string[] namen)
    {
        foreach (var n in namen) { var v = t[n]; if (v != null && v.ToString().ToLowerInvariant() == "true") return true; }
        return false;
    }

    static long JetztMs() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }

    static string Zahl(long n) { return n.ToString("N0", CultureInfo.GetCultureInfo("de-DE")); }

    static string Mult(double m) { return m.ToString("0.00", CultureInfo.GetCultureInfo("de-DE")) + "x"; }

    // "2 Monate 5 Tage 3 Std 12 Min" — ein Monat zählt als 30 Tage, leere Teile fallen weg
    static string Dauer(long minuten)
    {
        if (minuten < 60) return Math.Max(0, minuten) + " Min";
        long monate = minuten / (30 * 24 * 60); minuten %= 30 * 24 * 60;
        long tage = minuten / (24 * 60); minuten %= 24 * 60;
        long stunden = minuten / 60; minuten %= 60;

        var teile = new List<string>();
        if (monate > 0) teile.Add(monate + (monate == 1 ? " Monat" : " Monate"));
        if (tage > 0) teile.Add(tage + (tage == 1 ? " Tag" : " Tage"));
        if (stunden > 0) teile.Add(stunden + " Std");
        if (minuten > 0) teile.Add(minuten + " Min");
        return string.Join(" ", teile);
    }

    static JObject Ereignis(string typ)
    {
        return new JObject { ["event"] = "Gamble", ["type"] = typ, ["at"] = JetztMs() };
    }

    static void Senden(JObject o)
    {
        try { cph.WebsocketBroadcastString(o.ToString(Newtonsoft.Json.Formatting.None)); } catch { }
    }

    static string Emote(string[] liste)
    {
        if (liste == null || liste.Length == 0) return "";
        lock (Sperre) return liste[Zufall.Next(liste.Length)];
    }

    static void Sagen(string text)
    {
        try { cph.SendMessage(text, true, true); } catch { }
    }

    static void LogFehler(string text)
    {
        try { cph.LogWarn("[Gamble] " + text); } catch { }
    }
}
