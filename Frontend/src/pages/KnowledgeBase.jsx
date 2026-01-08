// src/pages/KnowledgeBase.jsx
import React, { useState, useMemo, useEffect, useContext } from "react";
import { TwitchAuthContext } from "../components/TwitchAuthContext"; 
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css"; 
import DOMPurify from "dompurify"; 

// Liste der Kategorien
const CATEGORIES = ["Alle", "Tutorials", "Streaming", "Tools", "Games"];

// Quill Editor Module
const EDITOR_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    [{ size: ["small", false, "large", "huge"] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link", "image", "video"],
    ["clean"], 
  ],
};

export default function KnowledgeBase() {
  const { user } = useContext(TwitchAuthContext);
  
  // States
  const [articles, setArticles] = useState([]);
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("Alle");
  
  // Editor States
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [editingId, setEditingId] = useState(null); // NEU: ID des Artikels, der bearbeitet wird (null = neu)
  
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Tutorials");
  const [editorContent, setEditorContent] = useState("");

  // Berechtigung prüfen
  const ALLOWED_EDITORS = ["160224748", "123456789"]; 
  const isEditor = user && ALLOWED_EDITORS.includes(String(user.id));

  // Daten laden
  useEffect(() => {
    fetch("/api/knowledge")
      .then((res) => res.json())
      .then((data) => setArticles(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Laden fehlgeschlagen", err));
  }, []);

  // Reset Editor
  const resetEditor = () => {
      setIsEditorMode(false);
      setEditingId(null);
      setNewTitle("");
      setNewCategory("Tutorials");
      setEditorContent("");
  };

  // Start Editing (Vorhandenen Artikel laden)
  const startEdit = (article) => {
      setEditingId(article.id);
      setNewTitle(article.title);
      setNewCategory(article.category);
      setEditorContent(article.content);
      setIsEditorMode(true);
      // Falls wir in der Detailansicht sind, bleiben wir da, aber der Editor legt sich drüber oder wir zeigen Editor anstatt.
      // Hier blenden wir den Editor einfach oben ein.
  };

  const startNew = () => {
      resetEditor();
      setIsEditorMode(true); // Öffnet leeren Editor
  };

  const handleSave = async () => {
    if (!newTitle || !editorContent) return alert("Titel und Inhalt fehlen!");

    try {
      const url = editingId ? `/api/knowledge/${editingId}` : "/api/knowledge";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include", 
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          content: editorContent,
        }),
      });

      if (res.ok) {
        const savedArticle = await res.json();
        
        setArticles((prev) => {
            if (editingId) {
                // Update in Liste ersetzen
                return prev.map(a => a.id === editingId ? savedArticle : a);
            } else {
                // Neu oben anfügen
                return [savedArticle, ...prev];
            }
        });

        resetEditor();
        alert(editingId ? "Artikel aktualisiert!" : "Artikel erstellt!");
      } else {
        alert("Fehler beim Speichern (Rechte?)");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation(); 
    if (!window.confirm("Wirklich löschen?")) return;

    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setArticles(articles.filter((a) => a.id !== id));
        if (selectedArticleId === id) setSelectedArticleId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const matchesSearch = art.title.toLowerCase().includes(search.toLowerCase());
      const matchesCat = filterCat === "Alle" || art.category === filterCat;
      return matchesSearch && matchesCat;
    });
  }, [search, filterCat, articles]);

  const activeArticle = articles.find((a) => a.id === selectedArticleId);

  return (
    <div className="max-w-6xl mx-auto mt-8 px-4 text-white min-h-[80vh]">
      {/* Header Bereich */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <h1 className="text-3xl font-bold">📚 Wissensdatenbank</h1>
        
        <div className="flex gap-4">
            <div className="bg-gray-800 p-2 rounded-lg flex items-center gap-2 border border-gray-700">
            <span>🔍</span>
            <input
                type="text"
                placeholder="Suchen..."
                className="bg-transparent focus:outline-none text-white placeholder-gray-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
            </div>
            
            {isEditor && (
                <button 
                    onClick={() => isEditorMode ? resetEditor() : startNew()}
                    className={`px-4 py-2 rounded font-bold transition ${isEditorMode ? "bg-gray-600 hover:bg-gray-500" : "bg-green-600 hover:bg-green-700"}`}
                >
                    {isEditorMode ? "Abbrechen" : "+ Neuer Beitrag"}
                </button>
            )}
        </div>
      </div>

      {/* EDITOR MODUS */}
      {isEditorMode && (
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 mb-8 animate-fade-in shadow-2xl">
            <h2 className="text-xl font-bold mb-4">{editingId ? "Beitrag bearbeiten" : "Neuen Beitrag verfassen"}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input 
                    type="text" 
                    placeholder="Titel des Beitrags" 
                    className="bg-gray-700 p-3 rounded text-white border border-gray-600 focus:border-[#9146FF] outline-none"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                />
                <select 
                    className="bg-gray-700 p-3 rounded text-white border border-gray-600 focus:border-[#9146FF] outline-none"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                >
                    {CATEGORIES.filter(c => c !== "Alle").map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Quill Editor */}
            <div className="text-black bg-white rounded mb-4 overflow-hidden">
                <ReactQuill 
                    theme="snow"
                    value={editorContent} 
                    onChange={setEditorContent} 
                    modules={EDITOR_MODULES}
                    placeholder="Schreib dein Tutorial hier..."
                    style={{ minHeight: '300px' }}
                />
            </div>

            <div className="flex gap-3">
                <button 
                    onClick={handleSave}
                    className="bg-[#9146FF] hover:bg-[#7d36ff] px-6 py-2 rounded font-bold text-white shadow-lg transition"
                >
                    {editingId ? "Änderungen speichern" : "Veröffentlichen"}
                </button>
                <button 
                    onClick={resetEditor}
                    className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded font-bold text-white transition"
                >
                    Abbrechen
                </button>
            </div>
        </div>
      )}

      {/* ANZEIGE BEREICH */}
      {activeArticle && !isEditorMode ? (
        // --- DETAIL ANSICHT ---
        <div className="bg-gray-900/80 rounded-2xl p-6 md:p-10 shadow-xl animate-fade-in border border-gray-800">
          <div className="flex justify-between items-center mb-6">
            <button
                onClick={() => setSelectedArticleId(null)}
                className="text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
            >
                ← Zurück zur Übersicht
            </button>

            {isEditor && (
                <div className="flex gap-3">
                    <button 
                        onClick={() => startEdit(activeArticle)}
                        className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/50 px-3 py-1 rounded text-sm font-bold flex items-center gap-2 transition"
                    >
                        ✏️ Bearbeiten
                    </button>
                    <button 
                        onClick={(e) => { handleDelete(activeArticle.id, e); setSelectedArticleId(null); }}
                        className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/50 px-3 py-1 rounded text-sm font-bold flex items-center gap-2 transition"
                    >
                        🗑 Löschen
                    </button>
                </div>
            )}
          </div>
          
          <div className="flex justify-between items-start">
            <span className="bg-[#9146FF]/20 text-[#9146FF] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                {activeArticle.category}
            </span>
            <span className="text-xs text-gray-500">
                {new Date(activeArticle.updatedAt || activeArticle.createdAt).toLocaleDateString("de-DE")}
            </span>
          </div>

          <h2 className="text-4xl font-bold mt-4 mb-8">{activeArticle.title}</h2>
          
          <div 
            className="prose prose-invert max-w-none text-gray-300 leading-relaxed ql-editor-view"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeArticle.content) }}
          />
        </div>
      ) : !isEditorMode ? (
        // --- LISTEN ANSICHT ---
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Kategorien */}
          <aside className="md:w-64 space-y-2 shrink-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  filterCat === cat
                    ? "bg-[#9146FF] text-white font-semibold shadow-md"
                    : "bg-gray-900/50 text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </aside>

          {/* Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
            {filteredArticles.length === 0 ? (
              <div className="col-span-full text-center py-10 text-gray-500 bg-gray-900/50 rounded-xl border border-dashed border-gray-700">
                Keine Einträge gefunden.
              </div>
            ) : (
              filteredArticles.map((art) => (
                <div
                  key={art.id}
                  onClick={() => setSelectedArticleId(art.id)}
                  className="bg-gray-900/80 p-6 rounded-xl border border-gray-800 hover:border-[#9146FF] cursor-pointer transition-all hover:transform hover:-translate-y-1 hover:shadow-lg group relative flex flex-col"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-mono text-gray-500 uppercase bg-black/30 px-2 py-0.5 rounded">{art.category}</span>
                    <span className="text-gray-600 group-hover:text-[#9146FF] transition-colors">↗</span>
                  </div>
                  <h3 className="text-xl font-bold group-hover:text-white transition-colors line-clamp-2 mb-2">{art.title}</h3>
                  
                  {/* Preview Text */}
                  <div className="text-sm text-gray-500 line-clamp-3 opacity-70 mb-4 flex-1"
                       dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(art.content).replace(/<[^>]+>/g, '') }} 
                  />
                  
                  {isEditor && (
                      <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-gray-800/50">
                          <button 
                            onClick={(e) => { e.stopPropagation(); startEdit(art); }}
                            className="text-xs bg-blue-900/30 text-blue-300 px-2 py-1 rounded hover:bg-blue-900/50 border border-blue-800/50 transition"
                          >
                              Bearbeiten
                          </button>
                          <button 
                            onClick={(e) => handleDelete(art.id, e)}
                            className="text-xs bg-red-900/30 text-red-300 px-2 py-1 rounded hover:bg-red-900/50 border border-red-800/50 transition"
                          >
                              Löschen
                          </button>
                      </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

        {/* CSS für Quill Output */}
        <style>{`
            .ql-editor-view a { color: #3b82f6; text-decoration: underline; }
            .ql-editor-view h1 { font-size: 2em; font-weight: bold; margin-top: 0.6em; margin-bottom: 0.4em; color: white; }
            .ql-editor-view h2 { font-size: 1.5em; font-weight: bold; margin-top: 0.6em; margin-bottom: 0.4em; color: white; }
            .ql-editor-view h3 { font-size: 1.25em; font-weight: bold; margin-top: 0.6em; margin-bottom: 0.4em; color: white; }
            .ql-editor-view ul { list-style-type: disc; padding-left: 1.5em; margin: 1em 0; }
            .ql-editor-view ol { list-style-type: decimal; padding-left: 1.5em; margin: 1em 0; }
            .ql-editor-view blockquote { border-left: 4px solid #9146FF; padding-left: 1em; color: #ccc; font-style: italic; }
            .ql-editor-view img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
            .ql-editor-view p { margin-bottom: 0.8em; }
            .ql-editor-view strong { font-weight: bold; color: #fff; }
        `}</style>
    </div>
  );
}