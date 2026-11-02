
import React, { useState } from 'react';
import { User } from '../types';
import { db } from '../services/db';
import { Shield, Key, BadgeCheck, AlertCircle, User as UserIcon, Lock } from 'lucide-react';

interface ProfileProps {
  user: User;
  onUpdate: (user: User) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword) {
      setMessage({ text: 'Please enter a new password', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Passwords do not match', type: 'error' });
      return;
    }

    const updatedUser = { ...user, password: newPassword };
    try {
      await db.saveUser(updatedUser);
      onUpdate(updatedUser);
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ text: 'Your password has been changed successfully!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
    } catch (e) {
      setMessage({ text: 'Failed to update password', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-indigo-700 p-8 text-white flex items-center gap-6">
          <div className="bg-white/20 p-4 rounded-3xl backdrop-blur-sm">
            <UserIcon size={48} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{user.displayName}</h2>
            <div className="flex items-center gap-2 text-indigo-100 mt-1">
              <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded uppercase font-bold tracking-wider">{user.role}</span>
              <span className="text-xs">•</span>
              <span className="font-mono text-xs">HRMS: {user.hrmsId}</span>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
              <Lock size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Security Settings</h3>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">New Password</label>
              <div className="relative">
                <input 
                  type="password"
                  className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Confirm Password</label>
              <div className="relative">
                <input 
                  type="password"
                  className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Key size={18} /> Update Password
            </button>

            {message && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-medium border animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                <AlertCircle size={20} />
                {message.text}
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100 flex items-start gap-4">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-700">
          <Shield size={20} />
        </div>
        <div>
          <h4 className="font-bold text-amber-900">Account Protection</h4>
          <p className="text-sm text-amber-800/80 mt-1 leading-relaxed">
            Choose a strong password that is difficult to guess. Do not share your password with anyone. 
            Admins and Supervisors will never ask for your password.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
