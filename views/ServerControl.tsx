
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { 
  Cloud, Server, ShieldCheck, AlertTriangle, RefreshCw, 
  Link as LinkIcon, Info, ArrowLeft, Monitor, ArrowRight,
  Globe, Zap, Layout, ShieldAlert, ExternalLink
} from 'lucide-react';

interface ServerControlProps {
  onNavigate: (view: string) => void;
}

const ServerControl: React.FC<ServerControlProps> = ({ onNavigate }) => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');
  const [lastSync, setLastSync] = useState<{pushed: number, error?: string} | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    db.getServerUrl().then(setUrl);
    checkInitialStatus();
  }, []);

  const checkInitialStatus = async () => {
    const currentUrl = await db.getServerUrl();
    if (currentUrl) {
      const isOnline = await db.testServer(currentUrl);
      setStatus(isOnline ? 'online' : 'offline');
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setStatus('testing');
    const isOnline = await db.testServer(url);
    setIsTesting(false);
    setStatus(isOnline ? 'online' : 'offline');
    if (isOnline) {
      await db.setServerUrl(url);
    }
  };

  const handleManualSync = async () => {
    setIsTesting(true);
    const result = await db.syncWithServer();
    setLastSync(result);
    setIsTesting(false);
    setStatus(result.error ? 'offline' : 'online');
  };

  const openExplorer = () => {
    if (url) {
      // If it's a full URL, use it. If it's just a path, append to current origin.
      if (url.startsWith('http')) {
        // Remove trailing slash if exists
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        window.open(cleanUrl + '/explorer', '_blank');
      } else {
        window.open(window.location.origin + '/explorer', '_blank');
      }
    } else {
      window.open(window.location.origin + '/explorer', '_blank');
    }
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in">
      {/* HEADER */}
      <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12 text-white">
          <Server size={240} />
        </div>
        <div className="relative z-10">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 mb-6 px-4 py-2 bg-white/10 text-xs font-black uppercase tracking-[0.2em] text-slate-300 hover:text-white hover:bg-white/20 transition-all rounded-full"
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <h2 className="text-3xl font-black tracking-tight leading-none mb-2">Server Control</h2>
          <p className="text-slate-400 text-sm max-w-md italic opacity-80 uppercase tracking-widest font-bold">Infrastructure & Data Persistence</p>
        </div>
      </div>

      {/* STATUS OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-6 rounded-[2rem] border-2 transition-all flex items-center gap-5 ${
          status === 'online' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 
          status === 'offline' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-slate-50 border-slate-100 text-slate-400'
        }`}>
          <div className={`p-4 rounded-2xl bg-white shadow-sm ${status === 'online' ? 'animate-pulse' : ''}`}>
             <Zap size={24} className={status === 'online' ? 'text-emerald-500' : 'text-slate-300'} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Connection State</p>
            <p className="text-lg font-black">{status === 'online' ? 'HUB ONLINE' : status === 'offline' ? 'HUB DISCONNECTED' : 'STANDBY'}</p>
          </div>
        </div>

        <button 
          onClick={openExplorer}
          disabled={status !== 'online'}
          className="p-6 rounded-[2rem] bg-slate-800 border-2 border-slate-700 text-white flex items-center justify-between group hover:bg-slate-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          <div className="flex items-center gap-5">
            <div className="p-4 rounded-2xl bg-white/10">
               <Globe size={24} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Admin Access</p>
              <p className="text-lg font-black">Launch Explorer</p>
            </div>
          </div>
          <ExternalLink size={24} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <button 
        onClick={() => onNavigate('server-setup')}
        className="w-full p-8 rounded-[2.5rem] bg-indigo-600 text-white flex items-center justify-between group hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
      >
        <div className="flex items-center gap-5">
          <div className="p-5 rounded-3xl bg-white/10">
             <Monitor size={32} />
          </div>
          <div className="text-left">
            <p className="text-xs font-black uppercase tracking-widest opacity-70">Knowledge Base</p>
            <p className="text-2xl font-black">Host Setup Instructions</p>
            <p className="text-sm opacity-60">SQL Scripts & Setup Guide</p>
          </div>
        </div>
        <ArrowRight size={32} className="group-hover:translate-x-2 transition-transform" />
      </button>

      {/* CONFIGURATION CARD */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6 text-lg">
          <LinkIcon size={20} className="text-indigo-600" />
          Gateway Routing
        </h3>

        <div className="space-y-4">
          <div className="relative group">
            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="https://your-tailscale-link.ts.net" 
              className="w-full pl-12 pr-4 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-indigo-500 outline-none transition-all font-mono text-sm"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setStatus('idle');
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleTest}
              disabled={isTesting || !url}
              className="flex items-center justify-center gap-2 py-5 rounded-2xl bg-gray-100 text-gray-700 font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 disabled:opacity-50"
            >
              {isTesting ? <RefreshCw size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Probe Hub
            </button>
            <button 
              onClick={handleManualSync}
              disabled={!url || isTesting || status !== 'online'}
              className="flex items-center justify-center gap-2 py-5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={18} />
              Manual Sync
            </button>
          </div>

          {lastSync && (
            <div className={`p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center animate-in zoom-in-95 flex items-center justify-center gap-2 ${
              lastSync.error ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-indigo-50 text-indigo-700'
            }`}>
              {lastSync.error ? <ShieldAlert size={14} /> : null}
              {lastSync.error ? `Sync Failed: ${lastSync.error}` : `Sync Completed: ${lastSync.pushed} records uploaded`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServerControl;
