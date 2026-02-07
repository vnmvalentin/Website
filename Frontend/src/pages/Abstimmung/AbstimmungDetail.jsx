import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import PollRenderer from "../../components/PollRenderer";
import { ArrowLeft, Calendar, Clock, AlertCircle } from "lucide-react";
import SEO from "../../components/SEO";
import { socket } from "../../utils/socket";

export default function AbstimmungDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      setLoading(true); // Reset bei ID Wechsel

      // 1. Fetch Initial
      fetch(`/api/polls/${id}`)
        .then(r => {
            if (!r.ok) throw new Error("Poll not found");
            return r.json();
        })
        .then(data => {
            setPoll(data);
            setLoading(false); // <--- WICHTIG: Loading beenden!
        })
        .catch(() => {
            setPoll(null);
            setLoading(false); // <--- WICHTIG: Auch bei Fehler beenden!
        });

      // 2. Listen for Updates
      const handleUpdate = (allPolls) => {
          const updatedMe = allPolls.find(p => String(p.id) === String(id));
          // Wenn der Poll gelöscht wurde (nicht mehr in der Liste), setzen wir ihn auf null
          if (updatedMe) {
              setPoll(updatedMe); 
          } else {
             // Optional: Wenn er plötzlich weg ist (gelöscht), könntest du hier reloaden oder null setzen
             // setPoll(null); 
          }
      };

      socket.on("polls_update", handleUpdate);
      return () => socket.off("polls_update", handleUpdate);
  }, [id]);

  if (loading) return <div className="p-20 text-center text-white/30 animate-pulse">Lade Abstimmung...</div>;
  
  if (!poll) return (
    <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <div className="inline-flex p-4 rounded-full bg-red-500/10 text-red-400 mb-2"><AlertCircle size={32} /></div>
        <h2 className="text-xl font-bold">Nicht gefunden</h2>
        <p className="text-white/50">Diese Abstimmung existiert nicht mehr.</p>
        <button onClick={() => navigate("/Abstimmungen")} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">Zurück zur Übersicht</button>
    </div>
  );

  const isExpired = new Date(poll.endDate) <= new Date();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 min-h-[85vh]">
      <SEO title = "Abstimmungen Detail"/>
      {/* Back Button */}
      <Link to="/Abstimmungen" className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6 text-sm font-medium group">
         <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors"><ArrowLeft size={16} /></div>
         Zurück zur Übersicht
      </Link>

      {/* Main Card */}
      <div className="bg-[#18181b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          
          {/* Header Banner */}
          <div className="relative h-48 md:h-64 bg-black/50 overflow-hidden">
             {poll.background ? (
                 <img src={poll.background} alt="" className="w-full h-full object-cover opacity-60" />
             ) : (
                 <div className="w-full h-full bg-gradient-to-br from-purple-900/40 to-blue-900/40" />
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-transparent to-transparent" />
             
             <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                 <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg mb-3 leading-tight">{poll.title}</h1>
                 
                 <div className="flex flex-wrap gap-4 text-sm font-medium">
                     <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border ${isExpired ? "bg-red-500/20 border-red-500/30 text-red-200" : "bg-emerald-500/20 border-emerald-500/30 text-emerald-200"}`}>
                        <Clock size={14} />
                        {isExpired ? "Abstimmung beendet" : "Läuft noch"}
                     </div>
                     <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80">
                        <Calendar size={14} />
                        Ende: {new Date(poll.endDate).toLocaleString("de-DE")}
                     </div>
                 </div>
             </div>
          </div>

          {/* Content Body */}
          <div className="p-6 md:p-8 bg-[#18181b]">
              {poll.questions?.length ? (
                <PollRenderer poll={poll} />
              ) : (
                <div className="text-center py-10 text-white/30 border border-dashed border-white/10 rounded-2xl">
                    Keine Fragen in dieser Abstimmung.
                </div>
              )}
          </div>
      </div>

    </div>
  );
}