
import React, { useState, useEffect, useCallback } from 'react';
import { PlusCircle, List, User, Users, Cloud, RefreshCw, CheckCircle2, Globe, Server } from 'lucide-react';
import { UserRole } from '../types';
import { db } from '../services/db';

interface DashboardProps {
  onNavigate: (view: string) => void;
  username: string;
  userRole: UserRole;
  syncKey?: number;
  isHubOnline: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, username, userRole, syncKey, isHubOnline }) => {
  const canManageStaff = [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OFFICER].includes(userRole);
  const isSystemAdmin = userRole === UserRole.ADMIN;

  const [syncInfo, setSyncInfo] = useState({ pending: 0, serverSet: false });
  const [isSyncing, setIsSyncing] = useState(false);

  const checkSync = useCallback(async () => {
    const records = await db.getRecords();
    const url = await db.getServerUrl();
    const pendingCount = records.filter(r => r.syncStatus !== 'synced').length;
    
    setSyncInfo({
      pending: pendingCount,
      serverSet: !!url
    });

    if (isHubOnline && pendingCount > 0 && !isSyncing) {
      setIsSyncing(true);
      try {
        await db.syncWithServer();
        const updatedRecords = await db.getRecords();
        setSyncInfo(prev => ({
          ...prev,
          pending: updatedRecords.filter(r => r.syncStatus !== 'synced').length
        }));
      } finally {
        setIsSyncing(false);
      }
    }
  }, [isSyncing, isHubOnline]);

  useEffect(() => {
    checkSync();
  }, [checkSync, syncKey]);

  useEffect(() => {
    const interval = setInterval(checkSync, 15000);
    return () => clearInterval(interval);
  }, [checkSync]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 text-indigo-50/50 -rotate-12 group-hover:rotate-0 transition-transform">
          <User size={120} />
        </div>
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="bg-indigo-600 p-4 rounded-3xl text-white shadow-lg shadow-indigo-100">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-800 tracking-tight">Welcome, {username}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded uppercase tracking-widest">{userRole}</span>
                {isHubOnline && (
                  <span className="flex items-center gap-1 text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded uppercase tracking-widest">
                    <Globe size={10} /> Hub Connected
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => isSystemAdmin ? onNavigate('server-control') : onNavigate('previous-records')}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all active:scale-95 ${
              syncInfo.pending > 0 
                ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' 
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <div className={`${isSyncing || syncInfo.pending > 0 ? 'animate-spin' : ''}`}>
              {isSyncing || syncInfo.pending > 0 ? <RefreshCw size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none">Hub Status</p>
              <p className="text-xs font-bold mt-0.5">
                {isSyncing ? 'Syncing...' : (syncInfo.pending > 0 ? `${syncInfo.pending} items pending` : 'Hub Synced')}
              </p>
            </div>
          </button>
        </div>
      </div>

      {isSystemAdmin && !syncInfo.serverSet && (
        <div className="bg-blue-600 p-6 rounded-[2rem] text-white flex items-center justify-between shadow-xl shadow-blue-100 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Cloud size={24} />
            </div>
            <div>
              <p className="font-bold">Setup Central Hub</p>
              <p className="text-xs opacity-80">Link all users to one central database.</p>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('server-control')}
            className="bg-white text-blue-600 px-4 py-2 rounded-xl text-xs font-black uppercase active:scale-95 shadow-lg"
          >
            Configure
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button 
          onClick={() => onNavigate('new-record')}
          className="group bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-50/50 transition-all flex flex-col items-center text-center gap-5 active:scale-95"
        >
          <div className="bg-indigo-600 p-5 rounded-3xl text-white shadow-lg group-hover:scale-110 transition-transform">
            <PlusCircle size={48} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">New Entry</h3>
            <p className="text-gray-400 mt-1 text-[10px] font-black uppercase tracking-widest px-4 leading-relaxed">Auto-syncs with Hub</p>
          </div>
        </button>

        <button 
          onClick={() => onNavigate('previous-records')}
          className="group bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-50/50 transition-all flex flex-col items-center text-center gap-5 active:scale-95"
        >
          <div className="bg-emerald-500 p-5 rounded-3xl text-white shadow-lg group-hover:scale-110 transition-transform">
            <List size={48} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">History Log</h3>
            <p className="text-gray-400 mt-1 text-[10px] font-black uppercase tracking-widest px-4 leading-relaxed">View all division records</p>
          </div>
        </button>

        {canManageStaff && (
          <button 
            onClick={() => onNavigate('admin')}
            className="group bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-50/50 transition-all flex flex-col items-center text-center gap-5 active:scale-95"
          >
            <div className="bg-blue-600 p-5 rounded-3xl text-white shadow-lg group-hover:scale-110 transition-transform">
              <Users size={48} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Staff Control</h3>
              <p className="text-gray-400 mt-1 text-[10px] font-black uppercase tracking-widest px-4 leading-relaxed">Manage staff & passwords</p>
            </div>
          </button>
        )}

        {isSystemAdmin && (
          <button 
            onClick={() => onNavigate('server-control')}
            className="group bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 hover:border-slate-400 hover:shadow-xl hover:shadow-slate-50/50 transition-all flex flex-col items-center text-center gap-5 active:scale-95"
          >
            <div className="bg-slate-800 p-5 rounded-3xl text-white shadow-lg group-hover:scale-110 transition-transform">
              <Server size={48} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Server Hub</h3>
              <p className="text-gray-400 mt-1 text-[10px] font-black uppercase tracking-widest px-4 leading-relaxed">System Admin Dashboard</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
