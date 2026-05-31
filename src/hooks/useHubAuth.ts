import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';

export function useHubAuth() {
  const auth = useAuth();
  const { isDemo, demoUser, demoRole } = useDemo();

  if (isDemo) {
    return {
      ...auth,
      hubUser: demoUser,
      user: demoUser,
      effectiveRole: demoRole,
      loading: false,
    };
  }
  return auth;
}
