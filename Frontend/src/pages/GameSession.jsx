import React, { useContext, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { socket } from "../utils/socket";
import { 
  Gamepad2, Calendar, Users, Plus, Trash2, X, Link as LinkIcon, 
  Clock, Lock, Unlock, Copy, Check, Edit2, ExternalLink, Save, Share2, Search, Loader2,
  UserMinus, Sparkles, CalendarDays
} from "lucide-react";
import SEO from "../components/SEO";

// --- HELPER ---
const getSessionImage = (session) => {
    if (session.backgroundImage) return session.backgroundImage;
    const text = encodeURIComponent(session.game || "Game");
    return `https://placehold.co/600x400/18181b/FFF?text=${text}`;
};

const formatSessionDate = (dateString) => {
    if (!dateString) return "Unbekannt";
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    date.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    tomorrow.setHours(0,0,0,0);

    if (date.getTime() === today.getTime()) return "Heute";
    if (date.getTime() === tomorrow.getTime()) return "Morgen";
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + ".";
};

const calculateOptimalTime = (participants, schedulingType) => {
    if (!participants || participants.length === 0) return null;
    if (schedulingType === 'fixed') return null; 

    let latestTime = 0;
    let foundTime = false;

    participants.forEach(p => {
        const input = p.availability.toLowerCase();
        let hours = -1;
        let minutes = 0;

        const matchCol = input.match(/([0-9]{1,2})[:.]([0-9]{2})/);
        const matchText = input.match(/([0-9]{1,2})\s?(?:uhr|h)/);

        if (matchCol) {
            hours = parseInt(matchCol[1]);
            minutes = parseInt(matchCol[2]);
        } else if (matchText) {
            hours = parseInt(matchText[1]);
        }

        if (hours > -1 && hours < 25) {
            const now = new Date();
            now.setHours(hours, minutes, 0, 0);
            const ts = now.getTime();
            
            if (ts > latestTime) {
                latestTime = ts;
                foundTime = true;
            }
        }
    });

    if (!foundTime) return null;
    return new Date(latestTime);
};

// --- COMPONENT: GAME SEARCH (FIXED) ---
function GameSearch({ value, onSelect, placeholder = "Spiel suchen..." }) {
    const [query, setQuery] = useState(value || "");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);
    const skipSearch = useRef(false);

    useEffect(() => { 
        if (value && value !== query) {
            setQuery(value); 
        }
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (skipSearch.current) {
            skipSearch.current = false;
            return;
        }
        if (query.length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sessions/search-games?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setResults(data);
                        setOpen(true);
                    } else {
                        setResults([]);
                        setOpen(false);
                    }
                }
            } catch (e) {
                console.error("Fetch Error:", e);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (game) => {
        skipSearch.current = true;
        setQuery(game.name);
        setOpen(false);
        if (onSelect) onSelect(game); 
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div className="relative">
                <input 
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white focus:border-violet-500 outline-none placeholder:text-white/30"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (onSelect) onSelect({ name: e.target.value, image: "" });
                    }}
                    onFocus={() => { if(results.length > 0) setOpen(true); }}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                    {loading ? <Loader2 size={16} className="animate-spin text-violet-400"/> : <Search size={16}/>}
                </div>
            </div>

            {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#18181b] border border-white/20 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar z-[100]">
                    {results.map((game) => (
                        <button 
                            key={game.id} 
                            type="button" 
                            onClick={() => handleSelect(game)} 
                            className="w-full flex items-center gap-3 p-2 hover:bg-violet-600/20 hover:border-l-4 hover:border-violet-500 transition-all text-left border-b border-white/5 last:border-0 group"
                        >
                            <img src={game.image || "https://placehold.co/100?text=?"} alt="" className="w-10 h-10 object-cover rounded-md bg-black/50 border border-white/10" />
                            <div className="min-w-0">
                                <span className="block text-sm text-white font-bold truncate group-hover:text-violet-300">{game.name}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function AssetButton({ asset, locked }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(asset.value);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    if (locked) return <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl text-white/30 cursor-not-allowed select-none"><Lock size={18} /><span className="font-bold text-sm">{asset.label}</span></div>;
    if (asset.type === 'copy') return <button onClick={handleCopy} className="group flex items-center justify-between w-full p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-all"><div className="flex items-center gap-3 min-w-0"><div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Copy size={16} /></div><div className="text-left min-w-0"><span className="block text-xs font-bold text-amber-500/70 uppercase">{asset.label}</span><span className="block text-sm font-mono text-amber-200 truncate">{asset.value}</span></div></div><span className="text-xs font-bold text-amber-400 ml-2">{copied ? "OK!" : "COPY"}</span></button>;
    return <a href={asset.value} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between w-full p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-all"><div className="flex items-center gap-3 min-w-0"><div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">{asset.label.toLowerCase().includes("discord") ? <span className="font-bold text-xs">DC</span> : <LinkIcon size={16} />}</div><div className="text-left min-w-0"><span className="block text-xs font-bold text-blue-500/70 uppercase">{asset.label}</span><span className="block text-sm text-blue-200 truncate">{asset.value}</span></div></div><ExternalLink size={16} className="text-blue-400 ml-2 opacity-50 group-hover:opacity-100" /></a>;
}

function SessionModal({ session, user, onClose, onJoin, onLeave, onEdit, onDelete, onEnd, onKick }) {
    const isJoined = user && session.participants.some(p => p.userId === user.id);
    const isAuthor = user && (session.author.id === user.id || user.id === "160224748");
    const [editMode, setEditMode] = useState(false);
    const [joinInput, setJoinInput] = useState("");
    const [copiedLink, setCopiedLink] = useState(false);
    const [formData, setFormData] = useState({ ...session, assets: session.assets || [] });
    
    useEffect(() => { setFormData({ ...session, assets: session.assets || [] }); }, [session]);

    const updateAsset = (idx, field, val) => { const a = [...formData.assets]; a[idx][field] = val; setFormData({ ...formData, assets: a }); };
    const addAsset = () => setFormData({ ...formData, assets: [...formData.assets, { type: 'link', label: '', value: '' }] });
    const removeAsset = (idx) => setFormData({ ...formData, assets: formData.assets.filter((_, i) => i !== idx) });
    
    // Handler for Game Select in Edit Mode
    const handleGameSelect = (g) => { setFormData(prev => ({ ...prev, game: g.name, backgroundImage: g.image || prev.backgroundImage })); };
    
    const saveChanges = () => { onEdit(session.id, formData); setEditMode(false); };
    const handleJoin = () => { if ((session.schedulingType === 'vote' || session.schedulingType === 'custom') && !joinInput) return alert("Bitte Zeit wählen/eingeben"); onJoin(session.id, joinInput); };
    const copyLink = () => { navigator.clipboard.writeText(`${window.location.origin}/sessions?id=${session.id}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
    const optimalTime = calculateOptimalTime(session.participants, session.schedulingType);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-[#121214] border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="relative h-40 shrink-0 bg-black group">
                    <img src={getSessionImage(editMode ? formData : session)} alt="" className="w-full h-full object-cover opacity-60 mask-image-b" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-transparent to-transparent" />
                    <div className="absolute top-4 left-0 right-0 px-4 flex justify-between items-start z-20">
                         <button onClick={copyLink} className="p-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white rounded-full backdrop-blur flex items-center gap-2"><Share2 size={16} />{copiedLink && <span className="text-[10px] font-bold">Copied!</span>}</button>
                        <div className="flex gap-2">
                            {isAuthor && !editMode && <button onClick={() => setEditMode(true)} className="p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-full backdrop-blur shadow-lg"><Edit2 size={16} /></button>}
                            <button onClick={onClose} className="p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur"><X size={18} /></button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 -mt-8 relative z-10 flex flex-col items-center">
                    {editMode ? (
                        <div className="w-full space-y-4 bg-[#18181b] p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white text-center mb-2">Bearbeiten</h3>
                            <div className="flex gap-2"><input className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Titel" /><input type="date" className="w-1/3 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white text-sm" value={formData.date || ""} onChange={e => setFormData({...formData, date: e.target.value})} /></div>
                            
                            <div className="relative z-50">
                                <GameSearch value={formData.game} onSelect={handleGameSelect} placeholder="Game..." />
                            </div>

                            <textarea className="w-full h-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Beschreibung" />
                            <div className="pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-white/50 uppercase">Assets</span><button onClick={addAsset} className="text-xs bg-white/10 px-2 py-1 rounded text-white">+ Add</button></div>
                                <div className="space-y-2">{formData.assets?.map((asset, i) => (<div key={i} className="flex gap-2 items-center"><select className="bg-white/5 border border-white/10 rounded w-16 text-xs text-white h-8" value={asset.type} onChange={e => updateAsset(i, 'type', e.target.value)}><option value="link">Link</option><option value="copy">Code</option></select><input placeholder="Label" className="w-1/3 bg-transparent border-b border-white/10 h-8 text-xs text-white" value={asset.label} onChange={e => updateAsset(i, 'label', e.target.value)} /><input placeholder="Value" className="flex-1 bg-transparent border-b border-white/10 h-8 text-xs text-white" value={asset.value} onChange={e => updateAsset(i, 'value', e.target.value)} /><button onClick={() => removeAsset(i)} className="text-red-400"><Trash2 size={14}/></button></div>))}</div>
                            </div>
                            <div className="flex gap-2 pt-2"><button onClick={saveChanges} className="flex-1 bg-green-600 text-white font-bold py-2 rounded-lg text-sm">Speichern</button><button onClick={() => setEditMode(false)} className="px-3 bg-white/10 text-white/50 rounded-lg text-sm">Abbr.</button></div>
                            <div className="flex justify-between pt-2"><button onClick={() => {onEnd(session.id); onClose();}} className="text-xs text-white/40 hover:text-white flex items-center gap-1"><Check size={12}/> Beenden</button><button onClick={() => {onDelete(session.id); onClose();}} className="text-xs text-red-900 hover:text-red-400 flex items-center gap-1"><Trash2 size={12}/> Löschen</button></div>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-black text-white leading-tight mb-2">{session.title}</h2>
                                <div className="flex items-center justify-center gap-2 text-sm text-white/50"><span className="px-2 py-0.5 bg-white/10 rounded text-white font-bold border border-white/5 flex items-center gap-1"><CalendarDays size={12}/> {formatSessionDate(session.date)}</span><span>•</span><span className="px-2 py-0.5 bg-white/10 rounded text-white font-bold border border-white/5">{session.game}</span></div>
                                <div className="text-xs text-white/30 mt-2">Hosted by <span className="text-violet-400">{session.author.displayName}</span></div>
                            </div>
                            {session.description && <div className="text-center text-white/70 text-sm leading-relaxed max-w-sm mb-8">{session.description}</div>}
                            <div className="w-full bg-[#18181b] border border-white/5 rounded-2xl p-4 mb-6 relative overflow-hidden">
                                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                                    <h4 className="text-xs font-bold text-white/40 uppercase flex items-center gap-2"><Users size={14} /> Teilnehmer ({session.participants.length})</h4>
                                    {optimalTime && session.participants.length > 1 && <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded text-violet-300 text-xs font-bold"><Sparkles size={12} /><span>Start: {optimalTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>}
                                </div>
                                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {session.participants.map((p, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-black/20 hover:bg-black/40 group transition-colors">
                                            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold text-white border border-white/10">{p.displayName.charAt(0).toUpperCase()}</div><div className="text-left"><div className="font-bold text-sm text-white leading-none">{p.displayName}</div><div className="text-[10px] text-white/40 mt-1">{p.availability}</div></div></div>
                                            {isAuthor && p.userId !== user.id && <button onClick={() => onKick(session.id, p.userId)} className="p-1.5 text-white/10 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Kicken"><UserMinus size={14} /></button>}
                                        </div>
                                    ))}
                                    {session.participants.length === 0 && <p className="text-center text-xs text-white/20 py-4 italic">Noch niemand da.</p>}
                                </div>
                            </div>
                            <div className="w-full mb-6">
                                {!user ? <div className="text-center p-3 rounded-xl border border-white/5 bg-white/5 text-white/50 text-sm">Bitte einloggen.</div> : isJoined ? <button onClick={() => onLeave(session.id)} className="w-full py-4 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-400 font-bold rounded-2xl transition-all">Verlassen</button> : (
                                    <div className="flex flex-col gap-3">
                                        {session.schedulingType === 'vote' ? <select className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-violet-500 appearance-none text-center" value={joinInput} onChange={e => setJoinInput(e.target.value)}><option value="">Wähle eine Zeit...</option>{session.timeOptions.map((t, i) => (<option key={i} value={new Date(t).toLocaleString([],{weekday:'short', hour:'2-digit', minute:'2-digit'})}>{new Date(t).toLocaleString([],{weekday:'short', hour:'2-digit', minute:'2-digit'})}</option>))}</select> : session.schedulingType === 'custom' ? <input placeholder="Wann kannst du? (z.B. 19:30)" className="w-full bg-[#18181b] border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-violet-500 text-center" value={joinInput} onChange={e => setJoinInput(e.target.value)} /> : null}
                                        <button onClick={handleJoin} className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-violet-900/20 transition-transform active:scale-[0.98] flex items-center justify-center gap-2">Beitreten <span className="bg-white/20 px-2 py-0.5 rounded text-xs">🚀</span></button>
                                    </div>
                                )}
                            </div>
                            {isJoined && session.assets && session.assets.length > 0 && (<div className="w-full animate-in slide-in-from-bottom-4 fade-in duration-500"><div className="flex items-center gap-2 mb-3 justify-center text-white/30"><div className="h-px bg-white/10 flex-1" /><span className="text-[10px] font-bold uppercase tracking-widest">Assets</span><div className="h-px bg-white/10 flex-1" /></div><div className="space-y-3">{session.assets.map((asset, i) => (<AssetButton key={i} asset={asset} locked={false} />))}</div></div>)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function CreateSessionModal({ onClose, onSave }) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [form, setForm] = useState({ title: "", game: "", backgroundImage: "", description: "", date: todayStr, schedulingType: "fixed", fixedTime: "", timeOptions: [""], assets: [] });

    const addAsset = () => setForm({...form, assets: [...form.assets, { type: 'link', label: '', value: '' }]});
    const updateAsset = (i, f, v) => { const a=[...form.assets]; a[i][f]=v; setForm({...form, assets: a}); };
    const removeAsset = (i) => { const a=form.assets.filter((_, idx) => idx !== i); setForm({...form, assets: a}); };
    const addTimeOption = () => setForm({...form, timeOptions: [...form.timeOptions, ""]});
    const updateTimeOption = (i, v) => { const t=[...form.timeOptions]; t[i]=v; setForm({...form, timeOptions: t}); };
    
    const handleGameSelect = (g) => { setForm(prev => ({ ...prev, game: g.name, backgroundImage: g.image })); };
    
    const handleSave = () => { if (!form.title || !form.game) return alert("Titel/Game fehlt"); onSave(form); };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in">
                {form.backgroundImage && <div className="h-24 w-full relative"><img src={form.backgroundImage} className="w-full h-full object-cover opacity-50"/><div className="absolute inset-0 bg-gradient-to-t from-[#18181b] to-transparent"/></div>}
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-violet-900/10"><h2 className="font-bold text-white flex items-center gap-2"><Plus className="text-violet-400"/> Neue Session</h2><button onClick={onClose}><X size={20} className="text-white/50 hover:text-white"/></button></div>
                
                {/* PB-40 FOR DROPDOWN SPACE */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 pb-40">
                    <div className="space-y-3">
                        <div className="flex gap-2"><input className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white" placeholder="Titel (z.B. Valo Grind)" value={form.title} onChange={e => setForm({...form, title: e.target.value})} autoFocus/><input type="date" className="w-1/3 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-sm" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                        
                        <div className="relative z-50">
                            <GameSearch value={form.game} onSelect={handleGameSelect} placeholder="Game suchen..." />
                        </div>

                        <textarea className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white h-20 resize-none" placeholder="Beschreibung..." value={form.description} onChange={e => setForm({...form, description: e.target.value})}/>
                    </div>
                    <div>
                        <div className="flex gap-2 mb-3">{['fixed','vote','custom'].map(m => (<button key={m} onClick={() => setForm({...form, schedulingType: m})} className={`flex-1 py-1.5 text-xs font-bold rounded border ${form.schedulingType===m ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/5 text-white/50'}`}>{m.toUpperCase()}</button>))}</div>
                        {form.schedulingType === 'fixed' && <input type="datetime-local" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white" value={form.fixedTime} onChange={e => setForm({...form, fixedTime: e.target.value})} />}
                        {form.schedulingType === 'vote' && (<div className="space-y-2">{form.timeOptions.map((opt, i) => (<input key={i} type="datetime-local" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1 text-sm text-white" value={opt} onChange={e => updateTimeOption(i, e.target.value)}/>))}<button onClick={addTimeOption} className="text-xs text-violet-400 font-bold">+ Option</button></div>)}
                        {form.schedulingType === 'custom' && <p className="text-xs text-white/40 italic text-center">Teilnehmer schlagen ihre Zeit selbst vor.</p>}
                    </div>
                    <div className="pt-2 border-t border-white/5"><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-white/50 uppercase">Assets</span><button onClick={addAsset} className="text-xs bg-white/10 px-2 py-1 rounded text-white">+ Add</button></div><div className="space-y-2">{form.assets.map((a, i) => (<div key={i} className="flex gap-2 items-center"><select className="bg-black/40 border border-white/10 text-white text-xs h-8 rounded" value={a.type} onChange={e => updateAsset(i, 'type', e.target.value)}><option value="link">Link</option><option value="copy">Code</option></select><input placeholder="Label" className="w-1/3 bg-black/40 border border-white/10 h-8 px-2 text-xs text-white rounded" value={a.label} onChange={e => updateAsset(i, 'label', e.target.value)} /><input placeholder="Value" className="flex-1 bg-black/40 border border-white/10 h-8 px-2 text-xs text-white rounded" value={a.value} onChange={e => updateAsset(i, 'value', e.target.value)} /><button onClick={() => removeAsset(i)} className="text-red-400"><Trash2 size={14}/></button></div>))}</div></div>
                </div>
                <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-[#121212]"><button onClick={onClose} className="px-4 py-2 rounded-xl text-white/50 hover:text-white">Abbrechen</button><button onClick={handleSave} className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold shadow-lg">Starten</button></div>
            </div>
        </div>
    );
}

export default function GameSessions() {
    const { user, login } = useContext(TwitchAuthContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const [sessions, setSessions] = useState({ active: [], expired: [] });
    const [selectedSession, setSelectedSession] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    
    const refresh = async () => { try { const res = await fetch("/api/sessions", { credentials: "include" }); const data = await res.json(); setSessions(data); } catch(e) { console.error(e); } };

    useEffect(() => {
        refresh();
        socket.on("sessions_update", (data) => {
            setSessions(data);
            if (selectedSession) { const updated = [...data.active, ...data.expired].find(s => s.id === selectedSession.id); if (updated) setSelectedSession(updated); }
        });
        return () => socket.off("sessions_update");
    }, [selectedSession]);

    useEffect(() => { const id = searchParams.get("id"); if (id && sessions.active.length > 0) { const found = [...sessions.active, ...sessions.expired].find(s => s.id === id); if (found && !selectedSession) setSelectedSession(found); } }, [sessions, searchParams]);

    const openSession = (s) => { setSelectedSession(s); setSearchParams({ id: s.id }); };
    const closeSession = () => { setSelectedSession(null); setSearchParams({}); };
    const handleCreate = async (data) => { await fetch("/api/sessions", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data) }); setShowCreate(false); };
    const handleJoin = async (id, availability) => { await fetch(`/api/sessions/${id}/join`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ availability }) }); };
    const handleLeave = async (id) => { await fetch(`/api/sessions/${id}/leave`, { method: "POST" }); };
    const handleEdit = async (id, data) => { await fetch(`/api/sessions/${id}`, { method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(data) }); };
    const handleDelete = async (id) => { if(window.confirm("Löschen?")) await fetch(`/api/sessions/${id}`, { method: "DELETE" }); };
    const handleEnd = async (id) => { if(window.confirm("Beenden?")) await fetch(`/api/sessions/${id}/end`, { method: "POST" }); };
    const handleKick = async (id, userIdToKick) => { if(!window.confirm("User kicken?")) return; await fetch(`/api/sessions/${id}/kick`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ userIdToKick }) }); };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-[85vh]">
            <SEO title="Game Sessions" />
            <div className="flex items-end justify-between mb-8">
                <div><h1 className="text-4xl font-black text-white tracking-tighter mb-1">GAME SESSIONS</h1><p className="text-white/50">Finde Mitspieler für deine Games.</p></div>
                <button onClick={() => user ? setShowCreate(true) : login()} className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-violet-900/20 flex items-center gap-2 transition-transform active:scale-95"><Plus size={18}/> Neue Session</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sessions.active.map(session => (
                    <div key={session.id} onClick={() => openSession(session)} className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-violet-500/50 transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] bg-[#18181b]">
                        <img src={getSessionImage(session)} alt={session.game} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-70 group-hover:opacity-100" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                            <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md group-hover:text-violet-300 transition-colors">{session.title}</h3>
                            <div className="flex items-center gap-2 mt-2 text-xs text-white/60">
                                <span className="bg-white/20 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold text-white flex items-center gap-1"><CalendarDays size={10}/> {formatSessionDate(session.date)}</span>
                                <div className="flex items-center gap-1"><Users size={12}/> {session.participants.length}</div>
                            </div>
                        </div>
                        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/10 flex items-center justify-center text-[10px] text-white font-bold">{session.author.displayName.charAt(0).toUpperCase()}</div>
                    </div>
                ))}
            </div>
            {sessions.active.length === 0 && <div className="text-center py-24 text-white/20 border-2 border-dashed border-white/5 rounded-3xl"><Gamepad2 size={48} className="mx-auto mb-4 opacity-50"/>Keine aktiven Sessions. Starte eine!</div>}
            {selectedSession && <SessionModal session={selectedSession} user={user} onClose={closeSession} onJoin={handleJoin} onLeave={handleLeave} onEdit={handleEdit} onDelete={handleDelete} onEnd={handleEnd} onKick={handleKick} />}
            {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} onSave={handleCreate} />}
        </div>
    );
}