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
  // Lets a `contractor` with hub_users.team_lead_of set through too, even
  // though their role isn't in allowedRoles — used for the one admin route
  // (Projects) that team leads get narrow, team-scoped access to, without
  // opening up the rest of the admin section to them.
  allowTeamLead?: boolean;
  children: ReactNode;
}

export default function HubRouteGate({ allowedRoles, allowTeamLead, children }: HubRouteGateProps) {
  const { loading, session, effectiveRole, hubUser } = useAuth();
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

  const roleAllowed = allowedRoles.includes(effectiveRole as UserRole);
  const teamLeadAllowed = allowTeamLead === true && !!hubUser?.team_lead_of;

  if (!roleAllowed && !teamLeadAllowed) {
    return <Navigate to={getHubHomePath(effectiveRole)} replace />;
  }

  return <Suspense fallback={<HubPageSpinner />}>{children}</Suspense>;
}
