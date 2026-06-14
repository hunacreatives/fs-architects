import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-[#1c2b3a]' },
  { value: 'admin', label: 'Admin', color: 'bg-sky-500' },
  { value: 'contractor', label: 'Employee', color: 'bg-emerald-500' },
] as const;

const LS_KEY = 'hub_dev_toolbar_hidden';

export default function DevToolbar() {
  const { hubUser, devViewAs, setDevViewAs } = useAuth();
  const navigate = useNavigate();

  // Read from localStorage first (instant, no flicker) then sync with Supabase
  const [hidden, setHidden] = useState(() => localStorage.getItem(LS_KEY) === 'true');

  useEffect(() => {
    if (!hubUser?.is_developer || !hubUser?.id) return;
    supabase
      .from('hub_users')
      .select('dev_toolbar_hidden')
      .eq('id', hubUser.id)
      .single()
      .then(({ data }) => {
        const serverHidden = !!(data as any)?.dev_toolbar_hidden;
        setHidden(serverHidden);
        localStorage.setItem(LS_KEY, String(serverHidden));
      });
  }, [hubUser?.id]);

  // Ctrl+Shift+D toggles the toolbar regardless of hidden state
  useEffect(() => {
    if (!hubUser?.is_developer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setHidden(prev => {
          const next = !prev;
          localStorage.setItem(LS_KEY, String(next));
          supabase.from('hub_users').update({ dev_toolbar_hidden: next } as any).eq('id', hubUser!.id);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hubUser?.is_developer, hubUser?.id]);

  if (!hubUser?.is_developer) return null;

  const hide = async () => {
    setHidden(true);
    localStorage.setItem(LS_KEY, 'true'); // instant — no flicker on next page
    await supabase
      .from('hub_users')
      .update({ dev_toolbar_hidden: true } as any)
      .eq('id', hubUser!.id);
  };

  const handleSelect = (role: 'owner' | 'admin' | 'contractor') => {
    setDevViewAs(role);
    navigate(role === 'contractor' ? '/hub/employee/dashboard' : '/hub/admin/dashboard');
  };

  if (hidden) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-[#111827] text-white px-3 py-2 rounded-full shadow-2xl border border-white/10">
      <span className="text-[10px] font-mono text-gray-400 pr-1">DEV</span>
      {ROLES.map(r => (
        <button
          key={r.value}
          onClick={() => handleSelect(r.value)}
          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
            devViewAs === r.value
              ? `${r.color} text-white`
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          {r.label}
        </button>
      ))}
      {devViewAs && (
        <button
          onClick={() => { setDevViewAs(null); navigate('/hub/admin/dashboard'); }}
          className="text-gray-500 hover:text-white cursor-pointer text-xs"
          title="Reset view"
        >
          <i className="ri-close-line"></i>
        </button>
      )}
      <div className="w-px h-4 bg-white/10 mx-0.5" />
      <button
        onClick={hide}
        className="text-gray-500 hover:text-white cursor-pointer text-xs px-1"
        title="Hide toolbar — re-enable in Settings"
      >
        <i className="ri-eye-off-line text-[11px]"></i>
      </button>
    </div>
  );
}
