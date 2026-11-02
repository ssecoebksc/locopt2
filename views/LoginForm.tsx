
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { User } from '../types';
import { Train, LogIn, ShieldAlert, ChevronDown, LifeBuoy, RefreshCw, Loader2, Cloud } from 'lucide-react';

interface LoginFormProps {
  onLogin: (user: User) => void;
  syncKey?: number;
  isSyncingBackground?: boolean;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin, syncKey, isSyncingBackground }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showRecovery, setShowRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await db.getUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload users whenever syncKey changes (background sync finished)
  useEffect(() => {
    loadUsers();
  }, [loadUsers, syncKey]);

  const handleSync = async () => {
    setIsSyncing(true);
    setError('');
    try {
      const result = await db.syncWithServer();
      if (result.error) {
        setError(`Sync connection inactive: ${result.error}`);
      } else {
        await loadUsers();
        setError(`Successfully pulled ${result.pulled} latest records/users.`);
      }
    } catch (e: any) {
      setError(`Connection failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }
    const foundUser = users.find(u => u.id === selectedUserId && u.password === password);

    if (foundUser) {
      onLogin(foundUser);
    } else {
      setError('Invalid password');
      setFailedAttempts(prev => prev + 1);
      if (failedAttempts >= 2) {
        const selUser = users.find(u => u.id === selectedUserId);
        if (selUser?.hrmsId === 'ADMIN1') {
          setShowRecovery(true);
        }
      }
    }
  };

  const handleResetAdmin = async () => {
    if (confirm('This will reset the System Administrator password to "password". Proceed?')) {
      await db.resetAdminAccount();
      const updatedUsers = await db.getUsers();
      setUsers(updatedUsers);
      setPassword('password');
      setError('Admin password has been reset to "password". You can now sign in.');
      setShowRecovery(false);
      setFailedAttempts(0);
    }
  };

  if (loading && users.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-indigo-50">
      <Loader2 size={40} className="animate-spin text-indigo-600 mb-4" />
      <p className="text-indigo-900/60 font-black text-[10px] uppercase tracking-widest">Checking local vault...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-indigo-50">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-200 overflow-hidden relative">
        {/* Background Sync Indicator */}
        {(isSyncingBackground || isSyncing) && (
          <div className="absolute top-4 right-6 flex items-center gap-2 z-10">
            <RefreshCw size={12} className="animate-spin text-white/60" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/50">Hub Sync Active</span>
          </div>
        )}

        <div className="bg-indigo-700 p-10 text-white text-center relative">
          <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <Train size={48} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight uppercase italic">LocoPT Hub</h1>
          <p className="text-indigo-100 mt-2 text-sm font-medium">Railway Division Maintenance Registry</p>
        </div>

        <form onSubmit={handleLogin} className="p-10 space-y-6">
          {error && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold border animate-in slide-in-from-top-2 ${
              error.includes('Successfully') || error.includes('reset') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
            }`}>
              <ShieldAlert size={20} className="shrink-0" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Authorized Personnel</label>
            <div className="relative">
              <select 
                className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer text-sm font-bold"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setError('');
                  setShowRecovery(false);
                }}
                required
              >
                <option value="" disabled>Select Staff Member</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.displayName} ({u.hrmsId})
                  </option>
                ))}
                {users.length === 0 && <option disabled>Syncing Staff List...</option>}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ChevronDown size={20} />
              </div>
            </div>
            {users.length > 0 && (
              <p className="text-[8px] font-black uppercase text-emerald-600/40 mt-1.5 ml-1 tracking-widest">
                {users.length} Local Accounts Cached
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Access Password</label>
            <input 
              type="password"
              className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={20} /> Sign In
          </button>

          <div className="flex flex-col gap-2 pt-4 border-t border-gray-100 mt-4">
              <button 
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full py-3 text-indigo-500 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-50 rounded-xl transition-all disabled:opacity-50"
            >
              {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {isSyncing ? 'Synchronizing Hub...' : 'Manual Hub Refresh'}
            </button>
            
            {showRecovery && (
              <button 
                type="button"
                onClick={handleResetAdmin}
                className="w-full py-3 text-emerald-600 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-50 rounded-xl transition-all"
              >
                <LifeBuoy size={16} /> Recover Admin
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
