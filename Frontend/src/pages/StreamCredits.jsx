import React, { useEffect, useState, useRef } from "react";

export default function StreamCredits() {
    const [credits, setCredits] = useState(null);
    const [phase, setPhase] = useState("idle"); // idle, scrolling, clips, end
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const ws = useRef(null);

    const CLIP_DURATION = 32000;

    useEffect(() => {
        const connect = () => {
            ws.current = new WebSocket("ws://127.0.0.1:8080/");
            ws.current.onopen = () => {
                ws.current.send(JSON.stringify({ request: "Subscribe", id: "credits-sub", events: { "General": ["Custom"] } }));
            };
            ws.current.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.event && msg.event.source === "General" && msg.event.type === "Custom") {
                        let payload = msg.data;
                        if (payload.data && typeof payload.data === 'string') payload = JSON.parse(payload.data);

                        if (payload.event === "StreamCredits") {
                            setCredits(payload);
                            setPhase("scrolling");
                            setActiveClipIndex(0);
                        }
                    }
                } catch (err) {}
            };
            ws.current.onclose = () => setTimeout(connect, 3000);
        };
        connect();
        return () => ws.current && ws.current.close();
    }, []);

    useEffect(() => {
        if (phase === "clips" && credits.clips) {
            const timer = setTimeout(() => {
                if (activeClipIndex + 1 < credits.clips.length) {
                    setActiveClipIndex(prev => prev + 1);
                } else {
                    setPhase("end");
                }
            }, CLIP_DURATION);
            return () => clearTimeout(timer);
        }
    }, [phase, activeClipIndex, credits]);

    if (phase === "idle" || !credits) return null;

    const CreditSection = ({ title, items, emptyMsg = "Niemand dieses Mal!" }) => (
        <div className="mb-24 text-center w-full">
            <h2 className="text-4xl font-black text-cyan-400 mb-8 uppercase tracking-widest border-b-2 border-cyan-500/30 pb-4 inline-block">
                {title}
            </h2>
            <div className="flex flex-col gap-3 text-2xl font-bold text-white drop-shadow-md">
                {items && items.length > 0 
                    ? items.map((item, idx) => <span key={idx}>{item}</span>)
                    : <span className="text-white/50">{emptyMsg}</span>
                }
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 w-full h-full bg-black z-50 overflow-hidden flex justify-center">
            
            {/* PHASE 1: SCROLLENDE CREDITS */}
            {phase === "scrolling" && (
                <div 
                    className="w-full max-w-4xl absolute flex flex-col items-center animate-scroll-credits"
                    onAnimationEnd={() => {
                        setTimeout(() => {
                            if (credits.clips && credits.clips.length > 0) {
                                setPhase("clips");
                            } else {
                                setPhase("end");
                            }
                        }, 2500);
                    }}
                >
                    {/* Der Hollywood-Start */}
                    <div className="text-center mb-32 w-full pt-10">
                        <h3 className="text-5xl text-cyan-400 font-black tracking-[0.3em] uppercase mb-4">Stream-Credits</h3>
                        <p className="text-2xl text-white/70 font-bold tracking-widest uppercase mb-12">Presented by vnmvalentin</p>

                        <div className="flex flex-col gap-4 text-xl text-white/60 font-mono mb-20 bg-white/5 p-8 rounded-2xl border border-white/10 w-fit mx-auto text-left">
                            <p>Starring ............... Valentin als vnmvalentin</p>
                            <p>Director ............... vnmvalentin</p>
                            <p>Kamera & Ton ........... vnmvalentin</p>
                            <p>Catering ............... Valentins Kühlschrank</p>
                        </div>

                        <CreditSection title="Moderatoren" items={credits.mods} />
                    </div>

                    <div className="mb-24 text-center">
                        <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 drop-shadow-lg mb-4">
                            VIELEN DANK
                        </h1>
                        <p className="text-2xl text-white/70 font-bold tracking-widest uppercase">Fürs Zuschauen!</p>
                    </div>

                    <CreditSection title="Top Chatter" items={credits.chatters} />
                    <CreditSection title="Neue Follows" items={credits.follows} />
                    <CreditSection title="Subs & Gift Subs" items={credits.subs} />
                    <CreditSection title="Bits" items={credits.bits} />
                    <CreditSection title="Kanalpunkte-Belohnungen" items={credits.rewards} />
                    <CreditSection title="Raids" items={credits.raids} />
                    
                    {/* NEU: Die Liste der Schande */}
                    <div className="mt-10 mb-20 text-center w-full">
                        <h2 className="text-4xl font-black text-red-500 mb-8 uppercase tracking-widest border-b-2 border-red-500/30 pb-4 inline-block">
                            Liste der Schande
                        </h2>
                        <div className="flex flex-col gap-3 text-2xl font-bold text-white/70 drop-shadow-md">
                            {credits.shame && credits.shame.length > 0 
                                ? credits.shame.map((item, idx) => <span key={idx}>{item}</span>)
                                : <span className="text-white/30">Niemand!</span>
                            }
                        </div>
                    </div>

                    <div className="mt-10 mb-[50vh] text-center">
                        <p className="text-2xl text-white/40 font-mono">Wir sehen uns beim nächsten Mal!</p>
                    </div>
                </div>
            )}

            {/* PHASE 2: CLIP KINO */}
            {phase === "clips" && credits.clips[activeClipIndex] && (
                <div className="flex flex-col items-center justify-center w-full h-full animate-in fade-in duration-1000 bg-black px-10">
                    
                    {/* Wrapper für linksbündige Ausrichtung von Video & Titel */}
                    <div className="w-full max-w-6xl">
                        
                        <h2 className="text-3xl font-black text-purple-400 mb-6 uppercase tracking-widest animate-pulse text-center">
                            🎬 Honorable Mention by {credits.clips[activeClipIndex].user}
                        </h2>
                        
                        {/* Das Video */}
                        <div className="w-full aspect-video bg-black/50 border-4 border-white/10 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.3)] mb-6">
                            <iframe
                                src={`https://clips.twitch.tv/embed?clip=${credits.clips[activeClipIndex].id}&parent=localhost&parent=vnmvalentin.de&parent=www.vnmvalentin.de&autoplay=true&muted=false`}
                                width="100%"
                                height="100%"
                                allowFullScreen
                                frameBorder="0"
                            />
                        </div>

                        {/* NEU: Der Clip Titel darunter (linksbündig mit dem Video) */}
                        <div className="w-full text-left">
                            <p className="text-3xl font-bold text-white/90 truncate">
                                "{credits.clips[activeClipIndex].title}"
                            </p>
                        </div>

                    </div>

                </div>
            )}

            {/* PHASE 3: ENDE */}
            {phase === "end" && (
                <div className="flex flex-col items-center justify-center w-full h-full text-center animate-in fade-in duration-1000 zoom-in bg-black">
                    <h1 className="text-6xl font-black text-white mb-6">Danke fürs Einschalten!</h1>
                    <p className="text-4xl font-black text-white mb-6">Bis zum nächsten Mal</p>
                </div>
            )}

        </div>
    );
}