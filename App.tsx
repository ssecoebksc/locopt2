
import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole, LocoRecord } from './types';
import { db, initDb } from './services/db';
import LoginForm from './views/LoginForm';
import Dashboard from './views/Dashboard';
import Layout from './components/Layout';
import NewRecordForm from './views/NewRecordForm';
import PreviousRecords from './views/PreviousRecords';
import AdminSettings from './views/AdminSettings';
import Profile from './views/Profile';
import SyncSettings from './views/SyncSettings';
import ServerSetup from './views/ServerSetup';
import ServerControl from './views/ServerControl';
import { Loader2, RefreshCw, Cloud } from 'lucide-react';

type ViewState = 'dashboard' | 'new-record' | 'previous-records' | 'admin' | 'profile' | 'sync' | 'server-setup' | 'server-control';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [editingRecord, setEditingRecord] = useState<LocoRecord | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isSyncingBackground, setIsSyncingBackground] = useState(false);
  const [isHubOnline, setIsHubOnline] = useState(false);
  const [syncKey, setSyncKey] = useState(0); 

  const checkHubStatus = useCallback(async () => {
    const url = await db.getServerUrl();
    const online = url ? await db.testServer(url) : false;
    setIsHubOnline(online);
  }, []);

  // Heartbeat Effect
  useEffect(() => {
    if (currentUser && isHubOnline) {
      const sendBeat = () => db.sendHeartbeat(currentUser.id);
      sendBeat(); // Immediate
      const beatInterval = setInterval(sendBeat, 30000); // Every 30s
      return () => clearInterval(beatInterval);
    }
  }, [currentUser, isHubOnline]);

  useEffect(() => {
    const startup = async () => {
      await initDb();
      const saved = sessionStorage.getItem('locotrack_session');
      if (saved) {
        try { setCurrentUser(JSON.parse(saved)); } catch (e) { sessionStorage.removeItem('locotrack_session'); }
      }
      setIsReady(true);
      setIsSyncingBackground(true);
      db.syncUsers().then((result) => { if (result.pulled > 0 || result.pushed > 0) setSyncKey(prev => prev + 1); }).catch(e => console.warn(e));
      db.syncRecords().then(result => { if (result.pulled > 0 || result.pushed > 0) setSyncKey(prev => prev + 1); }).catch(e => console.warn(e)).finally(() => setIsSyncingBackground(false));
      checkHubStatus();
    };
    startup();
    const statusInterval = setInterval(checkHubStatus, 15000);
    const syncInterval = setInterval(async () => {
      if (navigator.onLine) {
        const result = await db.syncWithServer();
        if (result.pulled > 0 || result.pushed > 0) setSyncKey(prev => prev + 1);
      }
    }, 45000);
    return () => { clearInterval(statusInterval); clearInterval(syncInterval); };
  }, [checkHubStatus]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    sessionStorage.setItem('locotrack_session', JSON.stringify(user));
    setCurrentView('dashboard');
  };

  const handleUserUpdate = async (user: User) => {
    await db.saveUser(user);
    setCurrentUser(user);
    sessionStorage.setItem('locotrack_session', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('locotrack_session');
    setCurrentView('dashboard');
  };

  const navigateTo = (view: string, record?: LocoRecord) => {
    setEditingRecord(record);
    setCurrentView(view as ViewState);
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 text-center">
        <div className="relative"><div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-indigo-600"></div><div className="absolute inset-0 flex items-center justify-center text-indigo-600"><Cloud size={32} /></div></div>
        <h2 className="mt-8 text-xl font-black text-slate-800 uppercase tracking-tighter">LocoPT Image Hub</h2>
        <p className="mt-2 text-slate-500 font-medium animate-pulse">Waking up database...</p>
      </div>
    );
  }

  if (!currentUser) return <LoginForm onLogin={handleLogin} syncKey={syncKey} isSyncingBackground={isSyncingBackground} />;

  const renderView = () => {
    const isAdmin = currentUser.role === UserRole.ADMIN;
    const canManage = [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OFFICER].includes(currentUser.role);
    switch (currentView) {
      case 'dashboard': return <Dashboard username={currentUser.displayName} userRole={currentUser.role} onNavigate={navigateTo} syncKey={syncKey} isHubOnline={isHubOnline} />;
      case 'new-record': return <NewRecordForm user={currentUser} onCancel={() => navigateTo('dashboard')} onSuccess={() => navigateTo('previous-records')} isHubOnline={isHubOnline} editingRecord={editingRecord} />;
      case 'previous-records': return <PreviousRecords user={currentUser} syncKey={syncKey} isHubOnline={isHubOnline} onEdit={(record) => navigateTo('new-record', record)} />;
      case 'admin': return canManage ? <AdminSettings currentUser={currentUser} onNavigate={navigateTo} /> : <Dashboard username={currentUser.displayName} userRole={currentUser.role} onNavigate={navigateTo} isHubOnline={isHubOnline} />;
      case 'profile': return <Profile user={currentUser} onUpdate={handleUserUpdate} />;
      case 'sync':
      case 'server-control': return isAdmin ? <ServerControl onNavigate={navigateTo} /> : <Dashboard username={currentUser.displayName} userRole={currentUser.role} onNavigate={navigateTo} isHubOnline={isHubOnline} />;
      case 'server-setup': return isAdmin ? <ServerSetup onBack={() => navigateTo('server-control')} /> : <Dashboard username={currentUser.displayName} userRole={currentUser.role} onNavigate={navigateTo} isHubOnline={isHubOnline} />;
      default: return <Dashboard username={currentUser.displayName} userRole={currentUser.role} onNavigate={navigateTo} isHubOnline={isHubOnline} />;
    }
  };

  return <Layout user={currentUser} onLogout={handleLogout} onNavigate={navigateTo} isHubOnline={isHubOnline}>{renderView()}</Layout>;
};

export default App;
