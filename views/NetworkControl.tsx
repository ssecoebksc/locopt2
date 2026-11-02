
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { db } from '../services/db';
import { 
  Globe, Loader2, Copy, ShieldCheck, CheckCircle2, Server, Boxes, ShieldAlert, Terminal, Shield, Container, ChevronRight, ChevronLeft, Download, ExternalLink, Smartphone, Cpu, AlertOctagon, Info, Smartphone as PhoneIcon, Search, ArrowRight, HelpCircle
} from 'lucide-react';

interface NetworkControlProps { 
  currentUser: User;
  onNavigate?: (view: string) => void;
}

const NetworkControl: React.FC<NetworkControlProps> = ({ currentUser, onNavigate }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [activeStep, setActiveStep] = useState(4);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'warning', code?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const url = await db.getServerUrl();
      if (url) setServerUrl(url);
    };
    load();
  }, []);

  const handleTestConnection = async () => {
    if (!serverUrl) {
      setMessage({ text: "Tailscale URL required", type: 'error' });
      return;
    }
    setIsTesting(true);
    setMessage(null);
    
    const result = await db.testConnection(serverUrl);
    setIsTesting(false);
    
    if (result.success) {
      setIsConnected(true);
      await db.setServerUrl(serverUrl);
      setMessage({ text: result.message, type: 'success' });
    } else {
      setIsConnected(false);
      setMessage({ 
        text: result.message, 
        type: result.code === 'MIXED_CONTENT' ? 'error' : 'warning',
        code: result.code
      });
    }
  };

  return (
    <div className="space-y-8 pb-32 max-w-2xl mx-auto px-4">
      {/* HEADER SECTION */}
      <div className="bg-indigo-700 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12 text-white">
          <Globe size={240} />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black tracking-tight leading-none mb-2 text-white">Hub Connection</h2>
          <p className="text-indigo-100 text-sm max-w-md italic">Linking your phone to the desktop engine.</p>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] p-10 shadow-sm border border-gray-100">
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Tailscale Machine URL</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="https://desktop-xxxx.ts.net" 
                className={`w-full px-8 py-6 rounded-[2rem] bg-gray-50 border-2 outline-none transition-all font-mono text-sm shadow-inner ${
                  isConnected ? 'border-emerald-500 bg-emerald-50' : 'border-transparent focus:bg-white focus:border-indigo-500'
                }`}
                value={serverUrl}
                onChange={e => {
                  setServerUrl(e.target.value);
                  setIsConnected(false);
                }}
              />
              {isConnected && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-500">
                  <CheckCircle2 size={24} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {!isConnected ? (
                <button 
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex items-center justify-center gap-3 py-6 rounded-[2rem] bg-indigo-600 text-white font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  {isTesting ? <Loader2 size={24} className="animate-spin" /> : <ShieldCheck size={24} />}
                  {isTesting ? 'Verifying Link...' : 'Verify & Connect'}
                </button>
              ) : (
                <button 
                  onClick={() => onNavigate?.('dashboard')}
                  className="flex items-center justify-center gap-3 py-6 rounded-[2rem] bg-emerald-600 text-white font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all animate-in zoom-in-95"
                >
                  Proceed to Dashboard
                  <ArrowRight size={24} />
                </button>
              )}
            </div>

            {message && (
              <div className={`p-6 rounded-[2rem] flex flex-col gap-4 border animate-in slide-in-from-top-2 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                <div className="flex items-start gap-4 text-xs font-bold">
                  {message.type === 'success' ? <CheckCircle2 size={24} className="shrink-0" /> : <AlertOctagon size={24} className="shrink-0" />}
                  <p className="leading-relaxed">{message.text}</p>
                </div>
                
                {message.type !== 'success' && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-500 italic px-2">Troubleshooting Tips:</p>
                    <ul className="text-[10px] space-y-1 text-gray-600 list-disc ml-6">
                      <li>Ensure your phone's Tailscale app says <b>Connected</b>.</li>
                      <li>Double check the URL has <b>https://</b> at the start.</li>
                      <li>Make sure the PC is not in Sleep mode.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 py-8 opacity-40">
        <HelpCircle size={24} className="text-slate-400" />
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center leading-relaxed">
          Cloud Integration Protocol v2.5 <br/>
          Secure P2P Synchronisation
        </p>
      </div>
    </div>
  );
};

export default NetworkControl;
