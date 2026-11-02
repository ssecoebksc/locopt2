
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { db } from '../services/db';
import { 
  UserPlus, Trash2, User as UserIcon, Shield, Loader2, CheckCircle2, XCircle, Key, Lock
} from 'lucide-react';

interface AdminSettingsProps {
  currentUser: User;
  onNavigate?: (view: string) => void;
}

const AdminSettings: React.FC<AdminSettingsProps> = ({ currentUser, onNavigate }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newHrmsId, setNewHrmsId] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.TECHNICIAN);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const load = async () => {
    const userData = await db.getUsers();
    setUsers(userData);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName || !newHrmsId || !newPassword) {
      setMessage({ text: 'All fields are required.', type: 'error' });
      return;
    }
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      displayName: newDisplayName,
      hrmsId: newHrmsId.toUpperCase(),
      role: newRole,
      password: newPassword
    };
    await db.saveUser(newUser);
    await load();
    setNewDisplayName('');
    setNewHrmsId('');
    setNewPassword('');
    setMessage({ text: 'Staff account created successfully.', type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleResetPassword = async (targetUser: User) => {
    const promptMsg = `Enter new password for ${targetUser.displayName} (${targetUser.hrmsId}):`;
    const updatedPass = prompt(promptMsg);
    
    if (updatedPass !== null && updatedPass.trim() !== "") {
      const updatedUser = { ...targetUser, password: updatedPass.trim() };
      try {
        await db.saveUser(updatedUser);
        setMessage({ text: `Password for ${targetUser.hrmsId} has been reset.`, type: 'success' });
        setTimeout(() => setMessage(null), 3000);
        await load();
      } catch (err) {
        setMessage({ text: 'Failed to reset password.', type: 'error' });
      }
    }
  };

  const canResetPassword = (targetUser: User) => {
    // Admin can reset anyone except themselves
    if (currentUser.role === UserRole.ADMIN) {
      return currentUser.id !== targetUser.id;
    }
    // Supervisor can only reset Technicians
    if (currentUser.role === UserRole.SUPERVISOR) {
      return targetUser.role === UserRole.TECHNICIAN;
    }
    return false;
  };

  const canDeleteUser = (targetUser: User) => {
    // Only Admin can delete users, and cannot delete themselves
    return currentUser.role === UserRole.ADMIN && currentUser.id !== targetUser.id && targetUser.hrmsId !== 'ADMIN1';
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-blue-100">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Staff Control</h2>
            <p className="text-blue-100 text-sm mt-1">Manage Authorization and Personnel</p>
          </div>
          <div className="bg-white/10 p-3 rounded-2xl">
            <UserIcon size={28} className="text-white" />
          </div>
        </div>
      </div>

      {/* Account Provisioning Form */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-4">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-6 text-xl">
          <UserPlus size={24} className="text-blue-600" />
          Provision New Account
        </h3>
        
        {message && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold animate-in zoom-in-95 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Full Name</label>
            <input 
              type="text" 
              placeholder="e.g. Rajesh Kumar" 
              className="w-full p-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all"
              value={newDisplayName}
              onChange={e => setNewDisplayName(e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">HRMS ID</label>
              <input 
                type="text" 
                placeholder="6 CHARS" 
                maxLength={6}
                className="w-full p-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all font-mono uppercase"
                value={newHrmsId}
                onChange={e => setNewHrmsId(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Access Level</label>
              <select 
                className="w-full p-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all"
                value={newRole}
                onChange={e => setNewRole(e.target.value as UserRole)}
              >
                {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Initial Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full p-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-500 outline-none transition-all"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>

          <button className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all mt-4">
            Activate Account
          </button>
        </form>

        <div className="mt-12 space-y-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">Authorized Personnel Registry</p>
          <div className="grid grid-cols-1 gap-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-5 bg-gray-50 rounded-[2rem] border border-gray-100 hover:bg-white hover:shadow-md transition-all group">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-3 rounded-2xl text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <UserIcon size={20}/>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800">{u.displayName}</p>
                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-tight">{u.hrmsId} • {u.role}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {canResetPassword(u) && (
                    <button 
                      onClick={() => handleResetPassword(u)}
                      className="p-3 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Reset Password"
                    >
                      <Key size={20} />
                    </button>
                  )}
                  
                  {canDeleteUser(u) && (
                    <button 
                      onClick={() => { if(confirm(`Revoke access for ${u.displayName}?`)) db.deleteUser(u.id).then(() => load()) }}
                      className="p-3 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Delete User"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
