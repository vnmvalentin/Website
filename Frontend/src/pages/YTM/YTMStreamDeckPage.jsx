// src/pages/YTMStreamDeckPage.jsx
import React, { useState } from "react";
import { 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  Music, 
  Grid, 
  Settings,
  Globe,
  Keyboard,
  CheckCircle2
} from "lucide-react";

const STEPS = [
  { id: "requirements", label: "Voraussetzungen", icon: Download },
  { id: "ytm_setup", label: "Setup YouTube Music", icon: Settings },
  { id: "sd_setup", label: "Setup Stream Deck", icon: Grid },
];

export default function YTMStreamDeckPage() {
  const [activeStep, setActiveStep] = useState("requirements");
  const activeIndex = STEPS.findIndex(s => s.id === activeStep);

  const goNext = () => { if (activeIndex < STEPS.length - 1) setActiveStep(STEPS[activeIndex + 1].id); };
  const goPrev = () => { if (activeIndex > 0) setActiveStep(STEPS[activeIndex - 1].id); };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-[85vh] flex flex-col gap-6 text-white">
      
      <div className="mb-4">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
           <Grid className="text-blue-500" />
           YTM Desktop App: Stream Deck Control
        </h1>
        <p className="text-white/50 text-sm mt-1">
           Steuere deine Musik professionell über API-Requests und Hotkeys.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:min-h-[500px]">
        
        {/* Menu */}
        <div className="lg:w-72 shrink-0 flex flex-col bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden shadow-xl h-fit">
           <div className="p-4 border-b border-white/5 bg-black/20 font-bold text-white/70 uppercase text-xs tracking-wider">
              Anleitung
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
                         <div className={`p-1.5 rounded-lg ${isActive ? "bg-blue-500/20 text-blue-400" : "bg-white/5"}`}>
                            <Icon size={16} />
                         </div>
                         <span className="text-sm font-medium">{idx + 1}. {step.label}</span>
                      </button>
                  );
              })}
           </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#18181b] border border-white/10 rounded-2xl p-6 md:p-10 shadow-xl flex flex-col relative">
            <div className="flex-1 space-y-6">

                {/* SCHRITT 1: VORAUSSETZUNGEN */}
                {activeStep === "requirements" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Voraussetzungen</h2>
                        <p className="text-white/70">
                            Du benötigst die YouTube Music Desktop App und die Elgato Stream Deck Software.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <a href="https://github.com/pear-devs/pear-desktop/releases/tag/v3.11.0" target="_blank" rel="noreferrer" className="flex-1 bg-black/30 p-4 rounded-xl border border-white/10 hover:border-red-500/50 flex items-center gap-4 transition-all">
                                <Music className="text-red-500" size={32} />
                                <div>
                                    <div className="font-bold">YTM Desktop App</div>
                                    <div className="text-xs text-white/50">Muss installiert sein</div>
                                </div>
                            </a>
                            <a href="https://www.elgato.com/de/de/s/stream-deck-app" target="_blank" rel="noreferrer" className="flex-1 bg-black/30 p-4 rounded-xl border border-white/10 hover:border-blue-500/50 flex items-center gap-4 transition-all">
                                <Grid className="text-blue-500" size={32} />
                                <div>
                                    <div className="font-bold">Stream Deck Software</div>
                                    <div className="text-xs text-white/50">Muss installiert sein</div>
                                </div>
                            </a>
                        </div>
                    </div>
                )}

                {/* SCHRITT 2: SETUP YTM */}
                {activeStep === "ytm_setup" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Setup YouTube Music</h2>
                        <div className="space-y-4">
                            <p className="text-white/80 text-sm leading-relaxed">
                                Damit das Stream Deck mit YouTube Music kommunizieren kann, müssen wir den internen API-Server aktivieren.
                            </p>
                            
                            <div className="bg-black/20 border border-white/10 rounded-xl p-5 space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">1</div>
                                    <div>
                                        <h3 className="font-bold text-white">Erweiterungen öffnen</h3>
                                        <p className="text-sm text-white/60">Klicke in der YTM App oben links auf <b>"Erweiterungen"</b> (Extensions).</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">2</div>
                                    <div>
                                        <h3 className="font-bold text-white">API-Server aktivieren</h3>
                                        <p className="text-sm text-white/60">Suche die Erweiterung <b>"API Server"</b> und schalte sie ein.</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">3</div>
                                    <div>
                                        <h3 className="font-bold text-white">Autorisierung ausschalten</h3>
                                        <p className="text-sm text-white/60">Stelle die <b>Autorisation-Methode</b> auf <b>"Keine Autorisierung"</b> (No Authorization).</p>
                                        <div className="mt-2 text-xs bg-yellow-500/10 text-yellow-200 p-2 rounded border border-yellow-500/20 inline-block">
                                            Wichtig, damit das Stream Deck ohne Passwort zugreifen kann.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* SCHRITT 3: SETUP STREAM DECK */}
                {activeStep === "sd_setup" && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Setup Stream Deck</h2>
                        
                        {/* 1. PLUGIN INSTALLATION */}
                        <div>
                            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                <Download size={20} className="text-blue-400" /> 1. Plugin installieren
                            </h3>
                            <div className="bg-black/30 p-4 rounded-xl border border-white/10 text-sm">
                                Öffne den Stream Deck Store und installiere das Plugin:
                                <br />
                                <span className="font-bold text-white block mt-1 text-base">"API Request" von Mike Beattie</span>
                            </div>
                        </div>

                        {/* 2. MEDIA CONTROLS */}
                        <div>
                            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                <Globe size={20} className="text-green-400" /> 2. Media Controls einrichten
                            </h3>
                            <p className="text-sm text-white/60 mb-4">
                                Ziehe für jede Funktion eine <b>"API Request"</b> Taste auf dein Deck und konfiguriere sie wie folgt:
                            </p>

                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {/* Previous */}
                                <div className="bg-[#0f0f13] border border-white/10 rounded-xl p-4 space-y-2">
                                    <div className="font-bold text-white border-b border-white/10 pb-2 mb-2">Song zurück</div>
                                    <div className="text-xs text-white/50 uppercase tracking-wider">URL</div>
                                    <code className="block bg-black/50 p-2 rounded text-xs text-blue-300 break-all select-all">
                                        http://localhost:26538/api/v1/previous
                                    </code>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Method:</span>
                                        <span className="font-mono text-green-400">POST</span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Content Type:</span>
                                        <span className="font-mono text-green-400">application/json</span>
                                    </div>
                                </div>

                                {/* Play/Pause */}
                                <div className="bg-[#0f0f13] border border-white/10 rounded-xl p-4 space-y-2">
                                    <div className="font-bold text-white border-b border-white/10 pb-2 mb-2">Play / Pause</div>
                                    <div className="text-xs text-white/50 uppercase tracking-wider">URL</div>
                                    <code className="block bg-black/50 p-2 rounded text-xs text-blue-300 break-all select-all">
                                        http://localhost:26538/api/v1/toggle-play
                                    </code>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Method:</span>
                                        <span className="font-mono text-green-400">POST</span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Content Type:</span>
                                        <span className="font-mono text-green-400">application/json</span>
                                    </div>
                                </div>

                                {/* Next */}
                                <div className="bg-[#0f0f13] border border-white/10 rounded-xl p-4 space-y-2">
                                    <div className="font-bold text-white border-b border-white/10 pb-2 mb-2">Nächster Song</div>
                                    <div className="text-xs text-white/50 uppercase tracking-wider">URL</div>
                                    <code className="block bg-black/50 p-2 rounded text-xs text-blue-300 break-all select-all">
                                        http://localhost:26538/api/v1/next
                                    </code>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Method:</span>
                                        <span className="font-mono text-green-400">POST</span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-2">
                                        <span className="text-white/50">Content Type:</span>
                                        <span className="font-mono text-green-400">application/json</span>
                                    </div>
                                </div>
                            </div>
        
                        </div>

                        {/* 3. VOLUME CONTROLS */}
                        <div>
                            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                                <Keyboard size={20} className="text-purple-400" /> 3. Lautstärke (Hotkeys)
                            </h3>
                            <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-5 space-y-4">
                                
                                <div>
                                    <h4 className="font-bold text-white mb-2">Schritt A: Stream Deck Tasten</h4>
                                    <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                                        <li>Erstelle eine Taste: <b>System {'>'} Hotkey</b> (für Lauter). Setze Hotkey auf <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">F13</kbd>.</li>
                                        <li>Erstelle eine Taste: <b>System {'>'} Hotkey</b> (für Leiser). Setze Hotkey auf <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">F14</kbd>.</li>
                                    </ul>
                                </div>

                                <div className="h-px bg-white/10" />

                                <div>
                                    <h4 className="font-bold text-white mb-2">Schritt B: YouTube Music Einstellungen</h4>
                                    <ol className="list-decimal list-inside text-sm text-white/70 space-y-2">
                                        <li>Gehe in YTM wieder zu <b>Erweiterungen</b>.</li>
                                        <li>Aktiviere die Erweiterung <b>"Genaue Lautstärke"</b> (Precise Volume).</li>
                                        <li>Aktiviere die Erweiterung, um Optionen zu sehen (z.B. Schritte pro Tastendruck einstellen).</li>
                                        <li>Gehe zu Globale Tastenkürzel in der Erweiterung.</li>
                                        <li>Klicke bei "Lauter" in das Feld und drücke deine Stream Deck Taste (F13).</li>
                                        <li>Klicke bei "Leiser" in das Feld und drücke deine Stream Deck Taste (F14).</li>
                                    </ol>
                                </div>
                                
                                <div className="flex items-center gap-2 text-green-300 text-xs font-bold bg-green-500/10 p-2 rounded border border-green-500/20">
                                    <CheckCircle2 size={14} />
                                    Fertig! Jetzt steuerst du YTM perfekt im Hintergrund.
                                </div>
                            </div>
                        </div>

                    </div>
                )}

            </div>

            <div className="flex justify-between mt-8 pt-6 border-t border-white/5">
                <button 
                    onClick={goPrev} 
                    disabled={activeIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-0 transition-all"
                >
                    <ChevronLeft size={18} /> Zurück
                </button>
                <button 
                    onClick={goNext}
                    disabled={activeIndex === STEPS.length - 1}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-0 transition-all shadow-lg"
                >
                    Weiter <ChevronRight size={18} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}