
import React, { useState } from 'react';
import { 
  Monitor, Terminal, Shield, Download, CheckCircle, Copy, 
  FileCode, FolderPlus, Play, ChevronRight, ChevronLeft, 
  HardDrive, Wrench, RefreshCw, Cpu, Settings2, Activity, 
  AlertOctagon, Zap, Bug, HelpCircle, Power, FolderTree, Globe, AlertTriangle, ExternalLink, ShieldCheck, Smartphone, Info,
  Unlock, Lock, Box, Database, Layers, ArrowLeft, MousePointer2, AlertCircle, ShieldAlert
} from 'lucide-react';

interface ServerSetupProps {
  onBack: () => void;
}

const ServerSetup: React.FC<ServerSetupProps> = ({ onBack }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(id);
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const SQL_SETUP = `-- 1. Create Base Database & User
CREATE DATABASE locopt;
-- Note: User 'postgres' usually exists. To set/update password:
ALTER USER postgres WITH PASSWORD 'elsbksc2012';
GRANT ALL PRIVILEGES ON DATABASE locopt TO postgres;
ALTER DATABASE locopt OWNER TO postgres;

-- 2. Create Schema (Switch to 'locopt' DB first)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, 
  hrms_id TEXT UNIQUE, 
  display_name TEXT, 
  role TEXT, 
  password TEXT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, 
  loco_number TEXT, 
  base_shed TEXT, 
  schedule TEXT, 
  pantograph TEXT, 
  image_url TEXT, 
  created_at TIMESTAMPTZ, 
  created_by TEXT, 
  raw_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Optimization Indexes for High-Speed Sync
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
CREATE INDEX IF NOT EXISTS idx_records_updated_at ON records(updated_at);`;

  const START_SCRIPT = `@echo off
TITLE LocoPT Hub - Native Server
:: Change directory to where this file is located
cd /d "%~dp0"
SET DB_USER=postgres
SET DB_PASSWORD=elsbksc2012
SET DB_HOST=localhost
SET DB_NAME=locopt
SET MINIO_ROOT_USER=minioadmin
SET MINIO_ROOT_PASSWORD=minioadmin

echo Starting Storage Engine...
start "" "C:\LocoServer\minio.exe" server C:\LocoData --console-address ":9001"

echo Starting API Gateway...
cd backend
npm start
pause`;

  const VBS_HIDDEN = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "C:\LocoServer\start-hub.bat" & chr(34), 0
Set WshShell = Nothing`;

  const steps = [
    {
      id: 1,
      title: "Install Tools",
      icon: <Layers size={24} />,
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 flex gap-4">
            <Download className="text-blue-600 shrink-0" size={24} />
            <p className="text-sm text-blue-900 leading-relaxed">
              Install these official Windows apps. These provide the database and storage engine for your Hub.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {[
              { name: "Node.js (LTS)", desc: "Runtime for the API server", link: "https://nodejs.org/" },
              { name: "PostgreSQL 15+", desc: "Database for loco records", link: "https://www.postgresql.org/download/windows/" },
              { name: "MinIO", desc: "Object storage for images", link: "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" }
            ].map((item, i) => (
              <a 
                key={i} 
                href={item.link} 
                target="_blank" 
                className="flex items-center justify-between p-5 bg-slate-50 border border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-white transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-white p-2 rounded-xl shadow-sm group-hover:text-indigo-600">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{item.desc}</p>
                  </div>
                </div>
                <ExternalLink size={18} className="text-slate-300" />
              </a>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Create Database",
      icon: <Database size={24} />,
      content: (
        <div className="space-y-6">
          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
            <AlertCircle className="text-amber-600 shrink-0" size={24} />
            <p className="text-xs text-amber-900 leading-relaxed">
              <b>Sync Engine v3.8:</b> You must include the <code className="bg-white px-1">updated_at</code> and <code className="bg-white px-1">last_active</code> columns for cross-device history synchronization.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Terminal size={14} /> Full Schema SQL
            </h4>
            <div className="bg-slate-900 p-6 rounded-3xl text-indigo-300 font-mono text-[10px] relative leading-relaxed">
              <pre className="overflow-x-auto">{SQL_SETUP}</pre>
              <button 
                onClick={() => copyToClipboard(SQL_SETUP, 'sql')}
                className="absolute top-4 right-4 bg-white/10 p-2 rounded-lg text-slate-400 hover:text-white"
              >
                {copyStatus === 'sql' ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 italic px-2 leading-relaxed">
              Paste this into the <b>pgAdmin 4 Query Tool</b>. The backend also handles migrations, but manual creation ensures immediate compatibility.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "Run Server",
      icon: <Terminal size={24} />,
      content: (
        <div className="space-y-6">
          <p className="text-sm text-slate-600 px-2">Create a file named <code className="bg-slate-100 px-1 rounded">start-hub.bat</code> in your project folder.</p>
          <div className="relative group">
            <pre className="bg-slate-900 p-6 rounded-3xl text-indigo-400 text-[10px] font-mono overflow-x-auto leading-relaxed border border-indigo-500/30">
              {START_SCRIPT}
            </pre>
            <button 
              onClick={() => copyToClipboard(START_SCRIPT, 'bat')}
              className="absolute top-4 right-4 bg-white/10 p-2 rounded-xl hover:bg-white/20 text-white transition-all shadow-xl"
            >
              {copyStatus === 'bat' ? <CheckCircle size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>
          </div>
        </div>
      )
    },
    {
      id: 4,
      title: "Mobile Link",
      icon: <Globe size={24} />,
      content: (
        <div className="space-y-6">
          <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
             <h4 className="font-bold text-emerald-900 flex items-center gap-2 mb-2">
               <ShieldCheck size={18} /> Public Access (Tailscale Funnel)
             </h4>
             <p className="text-sm text-emerald-800 leading-relaxed">
               Run this command in an <b>Administrator Terminal</b> on your PC.
             </p>
          </div>
          <div className="bg-slate-900 p-6 rounded-2xl flex justify-between items-center group">
             <code className="text-indigo-300 text-sm font-mono">tailscale funnel 3001</code>
             <button onClick={() => copyToClipboard('tailscale funnel 3001', 'funnel')} className="text-slate-500 hover:text-white">
               {copyStatus === 'funnel' ? <CheckCircle size={20} className="text-emerald-400" /> : <Copy size={20} />}
             </button>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "Persistence",
      icon: <Power size={24} />,
      content: (
        <div className="space-y-6">
          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
             <h4 className="font-bold text-indigo-900 flex items-center gap-2 mb-2">
               <Activity size={18} /> Auto-Start on Boot
             </h4>
             <p className="text-sm text-indigo-800 leading-relaxed">
               Ensure the server starts automatically after a restart. Choose one method:
             </p>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
              <p className="font-bold text-slate-800 text-sm">Method A: Startup Folder (Easy)</p>
              <ol className="text-xs text-slate-600 mt-2 list-decimal ml-4 space-y-1">
                <li>Press <kbd className="bg-white border px-1 rounded">Win + R</kbd></li>
                <li>Type <code>shell:startup</code> and press Enter</li>
                <li>Copy a <b>Shortcut</b> of your <code>start-hub.bat</code> here</li>
              </ol>
            </div>

            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
              <p className="font-bold text-slate-800 text-sm">Method B: Task Scheduler (Pro)</p>
              <p className="text-[10px] text-slate-500 mt-1 mb-3 italic">Use this to run the server in the background without a window.</p>
              
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">1. Create Silent Runner (silent.vbs)</p>
                <div className="relative group">
                  <pre className="bg-slate-900 p-4 rounded-xl text-indigo-300 text-[10px] font-mono overflow-x-auto leading-relaxed">
                    {VBS_HIDDEN}
                  </pre>
                  <button 
                    onClick={() => copyToClipboard(VBS_HIDDEN, 'vbs')}
                    className="absolute top-2 right-2 p-2 bg-white/5 rounded-lg text-slate-500 hover:text-white"
                  >
                    {copyStatus === 'vbs' ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 px-2 leading-relaxed">
                  Save this as <code>silent.vbs</code>. Then, create a <b>Basic Task</b> in Windows Task Scheduler:
                  <br/>• Trigger: <b>When I log on</b>
                  <br/>• Action: <b>Start a program</b>
                  <br/>• Program: <code>wscript.exe</code>
                  <br/>• Argument: <code>"C:\LocoServer\silent.vbs"</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-32 animate-in fade-in max-w-3xl mx-auto px-4">
      <div className="flex justify-between items-center pt-4">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-full border border-indigo-100 shadow-sm"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-4xl font-black tracking-tighter leading-none mb-3">Native Setup</h2>
          <p className="text-slate-400 text-sm max-w-md italic leading-relaxed">Infrastructure installation and automation guide.</p>
        </div>
      </div>

      <div className="flex justify-between items-center px-4 bg-white/80 backdrop-blur-md py-4 rounded-[2rem] sticky top-4 z-20 border border-white/20 shadow-md">
        {steps.map((step) => (
          <button 
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={`flex flex-col items-center gap-2 transition-all ${activeStep === step.id ? 'scale-110 opacity-100' : 'opacity-30 hover:opacity-60'}`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${activeStep === step.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>
              {step.icon}
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest hidden sm:block">{step.title}</span>
          </button>
        ))}
      </div>

      <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl min-h-[450px]">
        <div className="flex items-center gap-4 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-indigo-600 font-black text-xl shadow-inner border border-slate-100">
            {activeStep}
          </div>
          <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{steps.find(s => s.id === activeStep)?.title}</h3>
        </div>
        
        <div className="animate-in slide-in-from-right-8 duration-500">
          {steps.find(s => s.id === activeStep)?.content}
        </div>

        <div className="mt-16 pt-8 border-t border-slate-50 flex justify-between">
          <button 
            onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
            disabled={activeStep === 1}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-50 disabled:opacity-0 transition-all uppercase tracking-widest text-xs"
          >
            <ChevronLeft size={20} /> Previous
          </button>
          <button 
            onClick={() => setActiveStep(prev => Math.min(5, prev + 1))}
            disabled={activeStep === 5}
            className="flex items-center gap-2 px-10 py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-slate-900 disabled:opacity-0 transition-all shadow-lg uppercase tracking-widest text-xs"
          >
            Continue <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServerSetup;
