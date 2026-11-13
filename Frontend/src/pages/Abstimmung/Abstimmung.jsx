import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { Plus, Trash2, Calendar, Clock, BarChart2, X, Image as ImageIcon, RefreshCw, ArrowRight, Vote } from "lucide-react";
import SEO from "../../components/SEO";
import { socket, useFeedRoom } from "../../utils/socket";
import { Page, PageHeader, Card, EmptyState, Button, Dialog, Tabs, Field, Input, Select } from "../../components/ui";

import { STREAMER_ID } from "../../config/owner";

// --- HELPER COMPONENTS ---

function PollCard({ poll, onClick, isAdmin, onDelete }) {
  const isExpired = new Date(poll.endDate) <= new Date();

  return (
    <Card
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className="group !p-3 flex items-center gap-4 transition-colors hover:bg-white/[0.06] hover:border-accent/30 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent-soft"
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-lg overflow-hidden bg-black/40 border border-line">
        {poll.background ? (
          <img src={poll.background} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-accent-soft/40 group-hover:text-accent-soft/70 transition-colors">
            <BarChart2 size={28} />
          </div>
        )}
        {isExpired && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white/70">Beendet</div>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <h3 className="font-semibold text-white group-hover:text-white truncate pr-4">{poll.title}</h3>

        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
           <div className="flex items-center gap-1.5">
              <Calendar size={13} />
              <span>{new Date(poll.endDate).toLocaleDateString("de-DE")}</span>
           </div>
           <div className="flex items-center gap-1.5">
              <Clock size={13} />
              <span>{new Date(poll.endDate).toLocaleTimeString("de-DE", {hour: '2-digit', minute:'2-digit'})}</span>
           </div>
        </div>
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={(e) => { e.stopPropagation(); onDelete(poll.id); }}
          onKeyDown={(e) => e.stopPropagation()}
          title="Löschen"
          aria-label="Löschen"
          className="shrink-0 hover:!text-red-400"
        />
      )}

      <ArrowRight size={17} className="text-white/15 group-hover:text-accent-soft group-hover:translate-x-1 transition-all shrink-0" />
    </Card>
  );
}

function CreatePollModal({ onClose, onSave }) {
  const [data, setData] = useState({
    title: "",
    background: "",
    endDate: "",
    questions: [],
  });

  const addQuestion = () => {
    setData(prev => ({
        ...prev,
        questions: [...prev.questions, { id: Date.now(), question: "", type: "single", options: ["", ""] }]
    }));
  };

  const updateQuestion = (idx, field, value) => {
    const qs = [...data.questions];
    qs[idx] = { ...qs[idx], [field]: value };
    setData({ ...data, questions: qs });
  };

  const updateOption = (qIdx, oIdx, val) => {
    const qs = [...data.questions];
    const opts = [...qs[qIdx].options];
    opts[oIdx] = val;
    qs[qIdx].options = opts;
    setData({ ...data, questions: qs });
  };

  const addOption = (qIdx) => {
    const qs = [...data.questions];
    qs[qIdx].options.push("");
    setData({ ...data, questions: qs });
  };

  const removeOption = (qIdx, oIdx) => {
    const qs = [...data.questions];
    qs[qIdx].options.splice(oIdx, 1);
    setData({ ...data, questions: qs });
  };

  const removeQuestion = (idx) => {
      const qs = data.questions.filter((_, i) => i !== idx);
      setData({ ...data, questions: qs });
  };

  // Pflichtfelder im Fenster anmahnen statt per alert()
  const [tried, setTried] = useState(false);
  const handleSave = () => {
      setTried(true);
      if(!data.title || !data.endDate) return;
      onSave(data);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      kicker="Abstimmung"
      title="Neue Abstimmung"
      footer={<><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button onClick={handleSave}>Speichern</Button></>}
    >
            {/* Metadata Section */}
            <div className="space-y-4 mb-8">
                <Field label="Titel" error={tried && !data.title ? "Bitte einen Titel eingeben." : undefined}>
                    <Input placeholder="Worum geht es?" value={data.title} onChange={e => setData({...data, title: e.target.value})} />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Enddatum" error={tried && !data.endDate ? "Bitte ein Enddatum wählen." : undefined}>
                        <Input type="datetime-local" value={data.endDate} onChange={e => setData({...data, endDate: e.target.value})} />
                    </Field>
                    <div className="relative">
                        <Field label="Bild-Adresse (optional)">
                            <Input className="pl-9" placeholder="https://..." value={data.background} onChange={e => setData({...data, background: e.target.value})} />
                        </Field>
                        <ImageIcon size={15} className="absolute left-3 bottom-3 text-white/30 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Questions Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                     <p className="text-xs font-semibold text-white/70">Fragen ({data.questions.length})</p>
                     <Button variant="secondary" size="sm" icon={Plus} onClick={addQuestion}>Frage hinzufügen</Button>
                </div>

                {data.questions.length === 0 && (
                    <EmptyState className="!py-8">Noch keine Fragen hinzugefügt.</EmptyState>
                )}

                {data.questions.map((q, i) => (
                    <div key={q.id} className="bg-black/20 border border-line rounded-lg p-4">
                        <div className="flex gap-3 mb-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/10 border border-accent/25 text-xs font-bold text-accent-soft mt-2 shrink-0">{i+1}</span>
                            <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                                    <Input
                                        className="flex-1 min-w-0"
                                        aria-label={`Frage ${i + 1}`}
                                        placeholder="Deine Frage..."
                                        value={q.question}
                                        onChange={e => updateQuestion(i, 'question', e.target.value)}
                                    />
                                    <Select
                                        className="!w-auto"
                                        aria-label={`Art von Frage ${i + 1}`}
                                        value={q.type}
                                        onChange={e => updateQuestion(i, 'type', e.target.value)}
                                    >
                                        <option value="single">Eine Antwort</option>
                                        <option value="multiple">Mehrere Antworten</option>
                                        <option value="text">Freitext</option>
                                    </Select>
                                    <Button variant="ghost" icon={Trash2} onClick={() => removeQuestion(i)} title="Frage entfernen" aria-label="Frage entfernen" className="shrink-0 hover:!text-red-400" />
                                </div>

                                {q.type !== 'text' && (
                                    <div className="space-y-2 border-l-2 border-line ml-1 pl-3">
                                        {q.options.map((opt, oi) => (
                                            <div key={oi} className="flex items-center gap-2">
                                                <Input
                                                    className="!h-9 flex-1"
                                                    aria-label={`Frage ${i + 1}, Option ${oi + 1}`}
                                                    placeholder={`Option ${oi+1}`}
                                                    value={opt}
                                                    onChange={e => updateOption(i, oi, e.target.value)}
                                                />
                                                <Button variant="ghost" size="sm" icon={X} onClick={() => removeOption(i, oi)} title="Option entfernen" aria-label="Option entfernen" className="shrink-0 hover:!text-red-400" />
                                            </div>
                                        ))}
                                        <Button variant="ghost" size="sm" icon={Plus} onClick={() => addOption(i)} className="!text-accent-soft">Option</Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
    </Dialog>
  );
}

export default function AbstimmungPage() {
  // Vollpayload nur für diese Seite (siehe Backend/lib/liveBadges.js)
  useFeedRoom("polls");
  const { user } = useContext(TwitchAuthContext);
  const navigate = useNavigate();

  const [polls, setPolls] = useState([]);
  const [activeTab, setActiveTab] = useState("active"); // 'active' | 'expired'
  const [showModal, setShowModal] = useState(false);

  const isAdmin = useMemo(() => {
    return !!user && String(user.id) === String(STREAMER_ID);
  }, [user]);

  // 'loading' | 'ready' | 'error' — ohne das stand während des Ladens (und bei einem
  // Serverfehler) schon "Keine aktiven Abstimmungen." da.
  const [loadState, setLoadState] = useState("loading");

  const refreshPolls = async () => {
    try {
      const res = await fetch("/api/polls", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPolls(Array.isArray(data) ? data : []);
      setLoadState("ready");
    } catch (e) {
      console.error("Reload Error:", e);
      setLoadState("error");
    }
  };

  // Load Polls
  useEffect(() => {
    // Initial laden
    refreshPolls();

    // Live Updates
    const handleUpdate = (updatedList) => {
        if(Array.isArray(updatedList)) {
            setPolls(updatedList);
            setLoadState("ready");
        }
    };

    socket.on("polls_update", handleUpdate);
    return () => socket.off("polls_update", handleUpdate);
  }, []);

  const handleCreate = async (newPollData) => {
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPollData),
      });

      if (!res.ok) throw new Error("Failed to create");
      setShowModal(false);
    } catch {
      alert("Fehler beim Erstellen.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Wirklich löschen?")) return;
    try {
      await fetch(`/api/polls/${id}`, { method: "DELETE", credentials: "include" });
    } catch {
      alert("Fehler beim Löschen.");
    }
  };

  const now = new Date();

  // Filtern & Sortieren
  const activePolls = polls
      .filter((p) => new Date(p.endDate) > now)
      .sort((a,b) => new Date(a.endDate) - new Date(b.endDate)); // Die am ehesten enden zuerst

  const expiredPolls = polls
      .filter((p) => new Date(p.endDate) <= now)
      .sort((a,b) => new Date(b.endDate) - new Date(a.endDate)); // Neueste zuerst

  const displayPolls = activeTab === "active" ? activePolls : expiredPolls;

  return (
    <Page width="default" className="py-4 md:py-8 min-h-[70vh]">
      <SEO title = "Abstimmungen"/>

      <PageHeader
        icon={Vote}
        kicker="Community"
        title="Abstimmungen"
        description="Stimme bei aktuellen Fragen ab und bestimme mit."
        actions={isAdmin && (
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={refreshPolls} title="Neu laden" aria-label="Neu laden" />
            <Button icon={Plus} onClick={() => setShowModal(true)}>Neue Abstimmung</Button>
          </>
        )}
      />

      <Tabs
        className="mb-6"
        label="Abstimmungen"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: "active", label: "Laufend", badge: activePolls.length },
          { value: "expired", label: "Vergangen", badge: expiredPolls.length },
        ]}
      />

      {/* List Area */}
      <div className="space-y-3">
          {loadState === "loading" ? (
              <div className="text-center py-20 text-white/30 animate-pulse">Lade Abstimmungen...</div>
          ) : loadState === "error" ? (
              <EmptyState action={<Button variant="secondary" onClick={() => { setLoadState("loading"); refreshPolls(); }}>Erneut versuchen</Button>}>
                  Die Abstimmungen konnten gerade nicht geladen werden.
              </EmptyState>
          ) : displayPolls.length === 0 ? (
              <EmptyState>
                 {activeTab === "active" ? "Keine aktiven Abstimmungen." : "Keine vergangenen Abstimmungen."}
              </EmptyState>
          ) : (
              displayPolls.map(poll => (
                  <PollCard
                    key={poll.id}
                    poll={poll}
                    isAdmin={isAdmin}
                    onDelete={handleDelete}
                    onClick={() => navigate(`/Abstimmungen/${poll.id}`)}
                  />
              ))
          )}
      </div>

      {/* Admin-Knöpfe (Neu laden, Neue Abstimmung) stehen oben im Seitenkopf statt schwebend unten rechts */}
      {showModal && (
          <CreatePollModal onClose={() => setShowModal(false)} onSave={handleCreate} />
      )}

    </Page>
  );
}
