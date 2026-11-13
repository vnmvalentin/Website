import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import PollRenderer from "./PollRenderer";
import { ArrowLeft, Calendar, Clock, AlertCircle } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, Card, EmptyState, Button } from "../../components/ui";
import { socket, useFeedRoom } from "../../utils/socket";

export default function AbstimmungDetail() {
  // Vollpayload nur für diese Seite (siehe Backend/lib/liveBadges.js)
  useFeedRoom("polls");
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
    <Page width="narrow" className="py-10">
        <Card className="text-center p-10 space-y-4">
            <div className="inline-flex p-3 rounded-lg bg-red-500/10 text-red-400"><AlertCircle size={26} /></div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">Nicht gefunden</h1>
            <p className="text-sm text-white/55">Diese Abstimmung existiert nicht mehr.</p>
            <Button onClick={() => navigate("/Abstimmungen")} icon={ArrowLeft}>Zurück zur Übersicht</Button>
        </Card>
    </Page>
  );

  const isExpired = new Date(poll.endDate) <= new Date();

  return (
    <Page width="default" className="py-4 md:py-6 min-h-[70vh]">
      <SEO title = "Abstimmungen Detail"/>
      <Button to="/Abstimmungen" variant="ghost" icon={ArrowLeft} className="-ml-3 mb-4">Zurück zur Übersicht</Button>

      {/* Main Card */}
      <Card className="!p-0 overflow-hidden !bg-surface">

          {/* Header Banner — der Verlauf unten hält den Titel auf jedem Bild lesbar */}
          <div className="relative h-48 md:h-64 bg-black/50 overflow-hidden">
             {poll.background ? (
                 <img src={poll.background} alt="" className="w-full h-full object-cover opacity-60" />
             ) : (
                 <div className="w-full h-full bg-black/30" />
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />

             <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                 <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white mb-3 leading-tight">{poll.title}</h1>

                 <div className="flex flex-wrap gap-3 text-sm font-medium">
                     <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isExpired ? "bg-red-500/15 border-red-500/30 text-red-200" : "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"}`}>
                        <Clock size={14} />
                        {isExpired ? "Abstimmung beendet" : "Läuft noch"}
                     </div>
                     <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white/70">
                        <Calendar size={14} />
                        Ende: {new Date(poll.endDate).toLocaleString("de-DE")}
                     </div>
                 </div>
             </div>
          </div>

          {/* Content Body */}
          <div className="p-6 md:p-8">
              {poll.questions?.length ? (
                <PollRenderer poll={poll} showTitle={false} />
              ) : (
                <EmptyState>Keine Fragen in dieser Abstimmung.</EmptyState>
              )}
          </div>
      </Card>

    </Page>
  );
}
