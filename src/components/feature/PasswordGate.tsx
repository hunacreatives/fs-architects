import { useState, FormEvent, useRef, useEffect } from 'react';

const CORRECT_PASSWORD = 'fsarchitects';

interface PasswordGateProps {
  children: React.ReactNode;
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!unlocked) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [unlocked]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value === CORRECT_PASSWORD) {
      setError(false);
      setUnlocked(true);
    } else {
      setError(true);
      setShake(true);
      setValue('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ backgroundColor: '#1a2028' }}
    >
      <style>{`
        @keyframes gateShake {
          0%, 100% { transform: translateX(0); }
          18%       { transform: translateX(-6px); }
          36%       { transform: translateX(6px); }
          54%       { transform: translateX(-4px); }
          72%       { transform: translateX(4px); }
          90%       { transform: translateX(-2px); }
        }
        @keyframes gateFade {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="flex flex-col items-center gap-8 w-full px-6"
        style={{ maxWidth: '360px', animation: 'gateFade 0.5s ease forwards' }}
      >
        {/* Logo */}
        <img
          src="https://static.readdy.ai/image/08981d36cd0b73cf08022d4d82071d03/4be8756dcc635c33ed68261c7a8f7244.png"
          alt="FS Architects"
          className="h-9 w-auto object-contain brightness-0 invert opacity-80"
          draggable={false}
        />

        {/* Eyebrow */}
        <p
          style={{
            fontFamily: 'Geist, sans-serif',
            fontSize: '9px',
            letterSpacing: '0.26em',
            color: 'rgba(255,255,255,0.28)',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          Private Preview
        </p>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="w-full flex flex-col gap-3"
          style={{ animation: shake ? 'gateShake 0.5s ease' : 'none' }}
        >
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(false); }}
              placeholder="Enter password"
              autoComplete="off"
              className="w-full px-0 py-3 bg-transparent border-b text-sm focus:outline-none transition-colors duration-200 placeholder:text-white/20"
              style={{
                fontFamily: 'Geist, sans-serif',
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.85)',
                borderColor: error ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.18)',
              }}
            />
          </div>

          {error && (
            <p
              style={{
                fontFamily: 'Geist, sans-serif',
                fontSize: '10px',
                letterSpacing: '0.08em',
                color: 'rgba(248,113,113,0.75)',
                margin: 0,
              }}
            >
              Incorrect password. Please try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full py-3 text-xs tracking-widest uppercase transition-colors duration-200 cursor-pointer whitespace-nowrap mt-1"
            style={{
              fontFamily: 'Geist, sans-serif',
              letterSpacing: '0.14em',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.14)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.90)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
