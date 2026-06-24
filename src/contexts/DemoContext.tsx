import { createContext, useContext, useState, ReactNode } from 'react';
import { DEMO_HUB_USER } from '@/lib/demoData';
import { HubUser } from '@/lib/types';

type DemoRole = 'owner' | 'admin' | 'contractor';

interface DemoContextValue {
  isDemo: boolean;
  demoRole: DemoRole;
  demoUser: HubUser;
  demoSignIn: (passcode: string) => boolean;
  demoSignOut: () => void;
  setDemoRole: (role: DemoRole) => void;
}

const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  demoRole: 'owner',
  demoUser: DEMO_HUB_USER,
  demoSignIn: () => false,
  demoSignOut: () => {},
  setDemoRole: () => {},
});

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(() => localStorage.getItem('hub_demo') === '1');
  const [demoRole, setDemoRoleState] = useState<DemoRole>(
    () => (localStorage.getItem('hub_demo_role') as DemoRole) || 'owner'
  );

  const demoSignIn = (passcode: string) => {
    const expected = (import.meta.env.VITE_DEMO_PASSCODE as string | undefined)?.toLowerCase();
    // Demo mode is disabled unless a passcode is configured in the environment.
    if (expected && passcode.toLowerCase() === expected) {
      localStorage.setItem('hub_demo', '1');
      localStorage.setItem('hub_demo_role', 'owner');
      setIsDemo(true);
      setDemoRoleState('owner');
      return true;
    }
    return false;
  };

  const demoSignOut = () => {
    localStorage.removeItem('hub_demo');
    localStorage.removeItem('hub_demo_role');
    setIsDemo(false);
    setDemoRoleState('owner');
  };

  const setDemoRole = (role: DemoRole) => {
    localStorage.setItem('hub_demo_role', role);
    setDemoRoleState(role);
  };

  const demoUser: HubUser = { ...DEMO_HUB_USER, role: demoRole === 'contractor' ? 'contractor' : demoRole };

  return (
    <DemoContext.Provider value={{ isDemo, demoRole, demoUser, demoSignIn, demoSignOut, setDemoRole }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}
