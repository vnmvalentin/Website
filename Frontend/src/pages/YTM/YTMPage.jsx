import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  Copy, 
  Check, 
  Music, 
  Settings, 
  Bot, 
  Key, 
  MessageSquare, 
  Star, 
  Heart,
  Grid 
} from "lucide-react";

// HIER DEN LANGEN IMPORT STRING EINFÜGEN
const IMPORT_CODE = `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`;

const STEPS = [
  { id: "requirements", label: "Requirements", icon: Download },
  { id: "ytm-setup", label: "Setup YTM App", icon: Music },
  { id: "sb-setup", label: "Setup Streamer.bot", icon: Bot },
  { id: "spotify", label: "Spotify Credentials", icon: Key },
  { id: "feedback", label: "Feedback", icon: MessageSquare },
];

export default function YTMPage() {
  const { user } = useContext(TwitchAuthContext);
  const [activeStep, setActiveStep] = useState("requirements");
  const [copied, setCopied] = useState(false);

  // Feedback States
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [sent, setSent] = useState(false);

  const activeIndex = STEPS.findIndex(s => s.id === activeStep);

  const goNext = () => {
    if (activeIndex < STEPS.length - 1) setActiveStep(STEPS[activeIndex + 1].id);
  };
  const goPrev = () => {
    if (activeIndex > 0) setActiveStep(STEPS[activeIndex - 1].id);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(IMPORT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendFeedback = async () => {
    if (!rating) return alert("Bitte wähle eine Bewertung aus.");
    try {
      await fetch("/api/feedback/ytm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: user?.display_name || "Anonym",
          rating,
          text: feedbackText
        })
      });
      setSent(true);
    } catch (e) {
      alert("Fehler beim Senden.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-[85vh] flex flex-col gap-6 text-white">
      
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
           <Music className="text-red-500" />
           YouTube Music Songrequest
        </h1>
        <p className="text-white/50 text-sm mt-1">
           Tutorial zur Einrichtung via Streamer.bot & YTM Desktop App.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:min-h-[600px]">
        
        {/* LEFT SIDEBAR (Navigation) */}
        <div className="lg:w-72 shrink-0 flex flex-col bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden shadow-xl h-fit">
           <div className="p-4 border-b border-white/5 bg-black/20 font-bold text-white/70 uppercase text-xs tracking-wider">
              Tutorial Schritte
           </div>
           <div className="flex flex-row overflow-x-auto lg:flex-col lg:overflow-visible p-2 gap-1">
              {STEPS.map((step, idx) => {
                  const isActive = activeStep === step.id;
                  const Icon = step.icon;
                  return (
                      <button
                        key={step.id}
                        onClick={() => setActiveStep(step.id)}
                        className={`
                            shrink-0 lg:w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all
                            ${isActive ? "bg-white/10 text-white shadow-md border border-white/5" : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"}
                        `}
                      >
                         <div className={`p-1.5 rounded-lg ${isActive ? "bg-red-500/20 text-red-400" : "bg-white/5"}`}>
                            <Icon size={16} />
                         </div>
                         <span className="text-sm font-medium">{idx + 1}. {step.label}</span>
                      </button>
                  );
              })}
           </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="flex-1 bg-[#18181b] border border-white/10 rounded-2xl p-6 md:p-10 shadow-xl flex flex-col relative">
            
            <div className="flex-1 space-y-6">

                {/* 1. REQUIREMENTS */}
                {activeStep === "requirements" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Voraussetzungen</h2>
                        <p className="text-white/70 leading-relaxed">
                            Damit das Songrequest-System funktioniert, benötigst du zwei externe Programme. 
                            Bitte installiere diese zuerst, bevor du mit dem Tutorial fortfährst.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <a href="https://streamer.bot/" target="_blank" rel="noreferrer" className="group bg-black/30 hover:bg-black/50 border border-white/10 hover:border-violet-500/50 rounded-2xl p-6 transition-all">
                                <Bot size={40} className="text-violet-400 mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold mb-2">Streamer.bot</h3>
                                <p className="text-sm text-white/50">Das Herzstück für die Logik und Twitch-Anbindung.</p>
                                <div className="mt-4 text-violet-400 text-sm font-bold flex items-center gap-1">Download <ChevronRight size={14}/></div>
                            </a>

                            <a href="https://github.com/pear-devs/pear-desktop/releases/tag/v3.11.0" target="_blank" rel="noreferrer" className="group bg-black/30 hover:bg-black/50 border border-white/10 hover:border-red-500/50 rounded-2xl p-6 transition-all">
                                <Music size={40} className="text-red-400 mb-4 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold mb-2">YTM Desktop App</h3>
                                <p className="text-sm text-white/50">Der Player, der die Musik abspielt und steuert.</p>
                                <div className="mt-4 text-red-400 text-sm font-bold flex items-center gap-1">Download <ChevronRight size={14}/></div>
                            </a>
                        </div>
                    </div>
                )}

                {/* 2. SETUP YTM APP */}
                {activeStep === "ytm-setup" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Einrichtung YouTube Music Desktop</h2>
                        
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">1</div>
                                <div>
                                    <h3 className="text-lg font-bold">Login</h3>
                                    <p className="text-white/60 text-sm mt-1">Starte die App und melde dich mit deinem Google-Konto an (oben rechts).</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">2</div>
                                <div>
                                    <h3 className="text-lg font-bold">API Server aktivieren</h3>
                                    <p className="text-white/60 text-sm mt-1">Gehe oben links auf Erweiterungen {'>'} Aktiviere den API-Server.</p>
                                    <p className="text-white/60 text-sm mt-1 font-semibold text-red-300">WICHTIG: Stelle die Autorisations-Methode auf "Keine Autorisierung" (None).</p>
                                </div>
                            </div>
                            {/* PLACEHOLDER SCREENSHOT */}
                            <div className="ml-12 h-40 bg-black/40 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-white/30 text-sm">
                                [Screenshot: Remote Control Settings]
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. SETUP STREAMER.BOT */}
                {activeStep === "sb-setup" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Einrichtung Streamer.bot</h2>

                        {/* Import Code Section */}
                        <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between p-3 bg-white/5 border-b border-white/5">
                                <span className="text-xs font-bold text-white/50 uppercase">Import String</span>
                                <button 
                                    onClick={copyCode}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-bold transition-colors"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? "Kopiert!" : "Code Kopieren"}
                                </button>
                            </div>
                            <pre className="p-4 text-[10px] text-white/60 font-mono overflow-y-auto max-h-[150px] custom-scrollbar break-all whitespace-pre-wrap select-all">
                                {IMPORT_CODE}
                            </pre>
                        </div>

                        <div className="space-y-2 text-sm text-white/70">
                            <p>1. Klicke oben auf "Kopieren".</p>
                            <p>2. Öffne Streamer.bot, klicke oben auf "Import" und füge den Code ein.</p>
                            <p>3. Gehe links auf <b>Platforms {'>'} Twitch {'>'} Accounts</b> und logge dich ein (Broadcaster & Bot).</p>
                            <p>4. Aktiviere im Reiter "Commands" auf der linken Seite die hinzugefügten Commands.</p>
                        </div>

                        <div className="space-y-6 pt-4 border-t border-white/10">
                            <h3 className="text-xl font-bold text-violet-400">Actions Konfiguration</h3>
                            
                            {[
                                { title: "Action 1: SETUP IF DUAL PC", desc: "Nur anfassen, wenn Streamer.bot und YTM auf verschiedenen PCs laufen. Sonst IP bei '127.0.0.1' lassen (Nichts tun, Finger weg)." },
                                { title: "Action 2: QueueCheck", desc: "Zeigt die nächsten Songs. Tipp: Du kannst in den SubActions das Argument 'maxSongs' auf eine andere Zahl ändern die dann die Anzahl der Songs in der Antwort ausgibt. (Lasse es zwischen 3-5 damit die Antwort nicht zu lang ist." },
                                { title: "Action 3: Song Info", desc: "Gibt laufenden Song per Command aus. Gehe in den Reiter 'Commands' und stelle sicher, dass der Trigger-Command aktiv ist." },
                                { title: "Action 4: Song Request", desc: "Dies ist die Hauptfunktion. Richte hier den Trigger ein (z.B. Kanalpunkte Reward per Doppelklick). WICHTIG: Hier müssen gleich die Spotify Credentials rein damit auch Spotify-Links beim Request funktionieren. (siehe nächster Schritt)." },
                                { title: "Action 5: Song Skip", desc: "Ermöglicht das Skippen per Kanalpunkte oder Command (Mod only Standart). Trigger nach Wahl hinzufügen." },
                            ].map((action, i) => (
                                <div key={i} className="bg-white/5 border border-white/5 rounded-xl p-4">
                                    <div className="font-bold text-white mb-1">{action.title}</div>
                                    <div className="text-sm text-white/60">{action.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. SETUP SPOTIFY */}
                {activeStep === "spotify" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Spotify Credentials</h2>
                        <p className="text-white/70">
                            Damit Streamer.bot Spotify-Links in YouTube-Links umwandeln kann, brauchen wir einen API-Zugriff.
                        </p>

                        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold px-6 py-3 rounded-xl transition-colors">
                            Zum Spotify Dashboard <ChevronRight size={16} />
                        </a>

                        <div className="space-y-4 list-decimal list-inside text-white/80 text-sm leading-relaxed">
                             <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                                1. Logge dich ein und klicke auf <b>Create App</b>.<br/>
                                2. Name: z.B. "TwitchBot", Redirect URI kann leer bleiben.<br/>
                                3. Nach dem Erstellen klicke auf <b>Settings</b>.<br/>
                                4. Kopiere die <b>Client ID</b> und das <b>Client Secret</b>.
                             </div>
                             
                             <div className="bg-violet-500/10 p-4 rounded-xl border border-violet-500/20 text-violet-200">
                                5. Gehe zurück zu Streamer.bot in die Action <b>Songrequest</b>.<br/>
                                6. Öffne die Sub-Actions und suche die Felder für <b>spotifyId</b> und <b>spotifySecret</b>.<br/>
                                7. Füge deine kopierten Werte dort ein.
                             </div>
                        </div>
                    </div>
                )}

                {/* 5. FEEDBACK */}
                {activeStep === "feedback" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Feedback & Support</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Support Links */}
                            <div className="space-y-4">
                                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl">
                                    <h3 className="font-bold mb-2 flex items-center gap-2"><Settings size={18} /> Hilfe benötigt?</h3>
                                    <p className="text-sm text-white/60 mb-4">Wenn etwas nicht klappt, komm gerne auf den Discord.</p>
                                    <a href="https://discord.gg/ecRJSx2R6x" target="_blank" rel="noreferrer" className="inline-block bg-[#5865F2] hover:bg-[#4752c4] px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                                        Discord Joinen
                                    </a>
                                </div>
                                <div className="p-5 bg-gradient-to-br from-blue-900/20 to-blue-600/10 border border-blue-500/20 rounded-2xl">
                                    <h3 className="font-bold mb-2 flex items-center gap-2"><Heart size={18} className="text-blue-400" /> Supporten</h3>
                                    <p className="text-sm text-white/60 mb-4">Gefällt dir das Tutorial? Ich freue mich über jeden Support.</p>
                                    <a href="https://paypal.me/vnmlol" target="_blank" rel="noreferrer" className="inline-block bg-[#0070BA] hover:bg-[#005ea6] px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                                        PayPal
                                    </a>
                                </div>
                            </div>

                            {/* Rating Form */}
                            <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                                <h3 className="font-bold mb-4">Bewerte das Tutorial</h3>
                                {sent ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center py-10">
                                        <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-3">
                                            <Check size={24} />
                                        </div>
                                        <p className="text-lg font-bold">Danke für dein Feedback!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex gap-2 justify-center py-2">
                                            {[1,2,3,4,5].map(star => (
                                                <button 
                                                    key={star} 
                                                    onClick={() => setRating(star)}
                                                    className={`transition-transform hover:scale-110 ${rating >= star ? "text-yellow-400" : "text-white/20"}`}
                                                >
                                                    <Star size={32} fill={rating >= star ? "currentColor" : "none"} />
                                                </button>
                                            ))}
                                        </div>
                                        <textarea 
                                            className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:border-white/30 outline-none resize-none"
                                            placeholder="Was hat gut geklappt? Was hat gefehlt?"
                                            value={feedbackText}
                                            onChange={e => setFeedbackText(e.target.value)}
                                        />
                                        <button 
                                            onClick={sendFeedback}
                                            disabled={!rating}
                                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Absenden
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                        {/* NEU: RELATED CONTENT */}
                        <div className="pt-6 border-t border-white/5">
                            <h3 className="text-sm font-bold uppercase text-white/50 mb-4 tracking-wider">Das könnte dich auch interessieren</h3>
                            <Link to="/tutorial/ytm-streamdeck" className="group block bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-white/10 hover:border-blue-500/50 rounded-xl p-4 transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-black/40 rounded-lg text-blue-400 group-hover:scale-110 transition-transform">
                                            <Grid size={24} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-lg text-white group-hover:text-blue-300 transition-colors">
                                                Stream Deck Control
                                            </div>
                                            <div className="text-sm text-white/60">
                                                Steuere die YTM Desktop App direkt über dein Elgato Stream Deck.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white/10 p-2 rounded-full group-hover:bg-white/20 transition-colors">
                                        <ChevronRight size={20} />
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                )}

            </div>

            {/* Bottom Navigation */}
            <div className="flex justify-between mt-8 pt-6 border-t border-white/5">
                <button 
                    onClick={goPrev} 
                    disabled={activeIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-0 disabled:pointer-events-none transition-all"
                >
                    <ChevronLeft size={18} /> Zurück
                </button>
                <button 
                    onClick={goNext}
                    disabled={activeIndex === STEPS.length - 1}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-lg"
                >
                    Weiter <ChevronRight size={18} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}