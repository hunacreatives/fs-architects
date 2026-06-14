import { ReactNode, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemo } from '@/contexts/DemoContext';
import { UserRole } from '@/lib/types';
import { getHubHomePath } from '@/lib/hubAuth';

const HubPageSpinner = () => (
  <div className="flex h-screen items-center justify-center bg-[#FAFAFA]">
    <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
  </div>
);

interface HubRouteGateProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

export default function HubRouteGate({ allowedRoles, children }: HubRouteGateProps) {
  const { loading, session, effectiveRole } = useAuth();
  const { isDemo } = useDemo();
  const location = useLocation();

  if (isDemo) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAFAFA]">
        <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
      </div>
    );
  }

  if (!session || !effectiveRole) {
    return <Navigate to="/hub/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(effectiveRole as UserRole)) {
    return <Navigate to={getHubHomePath(effectiveRole)} replace />;
  }

  return <Suspense fallback={<HubPageSpinner />}>{children}</Suspense>;
}
