
import React from 'react';
import { User } from '../types';
import { LogOut, Train, User as UserIcon, Globe } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  isHubOnline: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, onNavigate, isHubOnline }) => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={() => onNavigate('dashboard')}
          >
            <Train size={24} />
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">LocoPT_Image</h1>
              {isHubOnline ? (
                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-400 mt-0.5 animate-pulse">
                  <Globe size={8} /> Hub Online
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] text-indigo-300 mt-0.5">
                  <Globe size={8} /> Local Mode
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-1 text-sm bg-indigo-800 px-3 py-1 rounded-full hover:bg-indigo-600 transition-colors"
            >
              <UserIcon size={14} />
              <span className="hidden sm:inline">{user.displayName}</span>
            </button>
            
            <button 
              onClick={onLogout}
              className="p-1 hover:bg-indigo-600 rounded-full transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
        <div className="max-w-lg mx-auto flex justify-around items-center">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="flex flex-col items-center p-2 text-indigo-700 font-medium"
          >
            <div className="bg-indigo-50 p-2 rounded-xl mb-1">
              <Train size={20} />
            </div>
            <span className="text-xs">Home</span>
          </button>
          <button 
            onClick={() => onNavigate('profile')}
            className="flex flex-col items-center p-2 text-gray-500 hover:text-indigo-700 transition-colors"
          >
            <div className="p-2 rounded-xl mb-1">
              <UserIcon size={20} />
            </div>
            <span className="text-xs">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
