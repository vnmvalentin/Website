// Admin-Dashboard → Clash Royale: Freigaben für Turnier-Ersteller. Turniere erstellen ist ein
// Content-Creator-Feature — nur der Admin und hier eingetragene Twitch-Accounts dürfen es.
// Holt sich seine Daten selbst (wie GardenAdminPanel/ModerationPanel). Stil: der des Admin-Dashboards.
import React, { useEffect, useState } from 'react';
import { Trophy, Plus, Trash2, RefreshCw } from 'lucide-react';

const BASE = '/api/clash/tournaments/creators';

async function call(method, path = '', body) {
  const res = await fetch(BASE + path, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error === 'tournamentCreatorInvalid' ? 'Kein gültiger Twitch-Name.' : 'Fehler beim Speichern.');
  return data.creators || [];
}

export default function TournamentCreatorsPanel() {
  const [creators, setCreators] = useState(null);
  const [login, setLogin] = useState('');
  const [error, setError] = useState('');

  const load = () => call('GET').then(setCreators).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setError('');
    try { setCreators(await call('POST', '', { login })); setLogin(''); }
    catch (e) { setError(e.message); }
  };
  const remove = async (name) => {
    if (!window.confirm(`Freigabe für ${name} entfernen? Bestehende Turniere bleiben bestehen.`)) return;
    try { setCreators(await call('DELETE', `/${encodeURIComponent(name)}`)); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="panel p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Trophy size={16} className="text-amber-300" />
        <h2 className="text-white font-bold">Turnier-Ersteller</h2>
        <button onClick={load} className="ml-auto text-white/40 hover:text-white" title="Aktualisieren"><RefreshCw size={14} /></button>
      </div>
      <p className="text-white/45 text-xs mb-4">
        Nur diese Twitch-Accounts (und du) dürfen Turniere erstellen. Bestehende Turniere bleiben beim Entfernen erhalten.
      </p>
      <div className="flex gap-2 mb-4">
        <input value={login} onChange={e => setLogin(e.target.value)} onKeyDown={e => e.key === 'Enter' && login.trim() && add()}
          placeholder="Twitch-Name, z.B. streamerin"
          className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-400" />
        <button onClick={add} disabled={!login.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
          <Plus size={14} /> Freigeben
        </button>
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {creators === null ? (
        <p className="text-white/30 text-sm">Lädt …</p>
      ) : creators.length === 0 ? (
        <p className="text-white/30 text-sm italic">Noch niemand freigegeben.</p>
      ) : (
        <div className="divide-y divide-white/5 border border-white/5 rounded-lg">
          {creators.map(c => (
            <div key={c.login} className="flex items-center gap-3 px-3 py-2">
              <span className="text-white font-semibold text-sm">{c.login}</span>
              <span className="text-white/30 text-xs">
                {c.twitchId ? 'schon eingeloggt' : 'noch nicht eingeloggt'} · seit {new Date(c.addedAt).toLocaleDateString('de-DE')}
              </span>
              <button onClick={() => remove(c.login)} className="ml-auto text-white/40 hover:text-red-400" title="Freigabe entfernen">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
