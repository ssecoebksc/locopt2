
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Cloud, Server, ShieldCheck, AlertTriangle, RefreshCw, Link as LinkIcon, Info } from 'lucide-react';

const SyncSettings: React.FC = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');
  const [lastSync, setLastSync] = useState<{pushed: number} | null>(null);

  useEffect(() => {
    db.getServerUrl().then(setUrl);
  }, []);

  const handleTest = async () => {
    setStatus('testing');
    const isOnline = await db.testServer(url);
    setStatus(isOnline ? 'online' : 'offline');
    if (isOnline) {
      await db.setServerUrl(url);
    }
  };

  const handleManualSync = async () => {
    setStatus('testing');
    const result = await db.syncWithServer();
    setLastSync(result);
    setStatus(result.error ? 'offline' : 'online');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-100">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black tracking-tight italic flex items-center gap-2">
              <Cloud size={28} /> Central Hub
            </h2>
            <p className="text-indigo-100 text-sm mt-1 uppercase font-bold tracking-widest opacity-80">One Database for All Staff</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6 text-lg">
          <Server size={20} className="text-indigo-600" />
          Server Configuration
        </h3>

        <div className="space-y-4">
          <div className="relative group">
            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="https://elsbkscserver.tailbf0dbf.ts.net" 
              className="w-full pl-12 pr-4 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-indigo-500 outline-none transition-all font-mono text-sm"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleTest}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-all active:scale-95"
            >
              {status === 'testing' ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Test Connection
            </button>
            <button 
              onClick={handleManualSync}
              disabled={!url || status === 'testing'}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={18} />
              Sync Now
            </button>
          </div>

          {status === 'online' && (
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center gap-3 text-sm font-bold border border-emerald-100">
              <ShieldCheck size={20} />
              Connected to Central Hub
            </div>
          )}

          {status === 'offline' && (
            <div className="p-4 bg-red-50 text-red-700 rounded-2xl flex items-center gap-3 text-sm font-bold border border-red-100">
              <AlertTriangle size={20} />
              Server Unreachable. Check Tailscale or Port 3001.
            </div>
          )}

          {lastSync && (
            <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">
              Last Sync: {lastSync.pushed} records uploaded successfully
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
        <div className="flex gap-3">
          <Info className="text-blue-600 shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-blue-900 text-sm">How this works?</h4>
            <ul className="text-xs text-blue-800 mt-2 space-y-2 list-disc ml-4 opacity-80 leading-relaxed">
              <li>Each phone stores its own data first (Works Offline).</li>
              <li>When connected, it uploads everything to your NAS.</li>
              <li>Administrators can export all data from any connected device.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncSettings;
