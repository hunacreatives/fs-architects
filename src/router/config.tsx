import { lazy, ReactNode, Suspense } from 'react';
import type { RouteObject } from "react-router-dom";
import HubRouteGate from '@/components/feature/HubRouteGate';
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Projects from "../pages/projects/page";
import ProjectDetail from "../pages/project-detail/page";
import Studio from "../pages/studio/page";
import Contact from "../pages/contact/page";
import Process from "../pages/process/page";
import Careers from "../pages/careers/page";
import Consultation from "../pages/consultation/page";
import Privacy from "../pages/privacy/page";

// Hub pages (lazy loaded)
const HubLoginPage = lazy(() => import('../pages/hub/login/page'));
const HubSignupPage = lazy(() => import('../pages/hub/signup/page'));
const HubForgotPasswordPage = lazy(() => import('../pages/hub/forgot-password/page'));
const HubResetPasswordPage = lazy(() => import('../pages/hub/reset-password/page'));
const HubAdminDashboard = lazy(() => import('../pages/hub/admin/dashboard/page'));
const HubAdminContractors = lazy(() => import('../pages/hub/admin/contractors/page'));
const HubAdminContractorDetail = lazy(() => import('../pages/hub/admin/contractors/detail/page'));
const HubAdminAttendance = lazy(() => import('../pages/hub/admin/attendance/page'));
const HubAdminRequests = lazy(() => import('../pages/hub/admin/requests/page'));
const HubAdminTimeOff = lazy(() => import('../pages/hub/admin/timeoff/page'));
const HubAdminAnnouncements = lazy(() => import('../pages/hub/admin/announcements/page'));
const HubAdminSop = lazy(() => import('../pages/hub/admin/sop/page'));
const HubAdminAssets = lazy(() => import('../pages/hub/admin/assets/page'));
const HubAdminAuditLog = lazy(() => import('../pages/hub/admin/auditlog/page'));
const HubAdminSettings = lazy(() => import('../pages/hub/admin/settings/page'));
const HubAdminPayroll = lazy(() => import('../pages/hub/admin/payroll/page'));
const HubAdminPayouts = lazy(() => import('../pages/hub/admin/payouts/page'));
const HubAdminDocRequests = lazy(() => import('../pages/hub/admin/docrequests/page'));
const HubAdminCredentials = lazy(() => import('../pages/hub/admin/credentials/page'));
const HubAdminPerformance = lazy(() => import('../pages/hub/admin/performance/page'));
const HubAdminProjects = lazy(() => import('../pages/hub/admin/projects/page'));
const HubAdminDocuments = lazy(() => import('../pages/hub/admin/documents/page'));
const HubAdminOvertime = lazy(() => import('../pages/hub/admin/overtime/page'));
const HubAdminInvoiceLog = lazy(() => import('../pages/hub/admin/invoice-log/page'));
const HubContractorDashboard = lazy(() => import('../pages/hub/contractor/dashboard/page'));
const HubContractorAttendance = lazy(() => import('../pages/hub/contractor/attendance/page'));
const HubContractorRequests = lazy(() => import('../pages/hub/contractor/requests/page'));
const HubContractorTimeOff = lazy(() => import('../pages/hub/contractor/timeoff/page'));
const HubContractorSop = lazy(() => import('../pages/hub/contractor/sop/page'));
const HubContractorAnnouncements = lazy(() => import('../pages/hub/contractor/announcements/page'));
const HubContractorProfile = lazy(() => import('../pages/hub/contractor/profile/page'));
const HubContractorPayouts = lazy(() => import('../pages/hub/contractor/payouts/page'));
const HubContractorDocuments = lazy(() => import('../pages/hub/contractor/documents/page'));
const HubContractorCredentials = lazy(() => import('../pages/hub/contractor/credentials/page'));
const HubContractorOvertime = lazy(() => import('../pages/hub/contractor/overtime/page'));
const HubContractorOnboarding = lazy(() => import('../pages/hub/contractor/onboarding/page'));
const HubContractorClients = lazy(() => import('../pages/hub/contractor/clients/page'));
const HubContractorProjects = lazy(() => import('../pages/hub/contractor/projects/page'));
const HubContractorProjectRedirect = lazy(() => import('../pages/hub/contractor/project-redirect/page'));
const HubAdminTasks = lazy(() => import('../pages/hub/admin/tasks/page'));
const HubAdminInvoiceBuilder = lazy(() => import('../pages/hub/admin/invoice-builder/page'));
const HubAdminQuestionnaires = lazy(() => import('../pages/hub/admin/questionnaires/page'));
const HubAdminApplications = lazy(() => import('../pages/hub/admin/applications/page'));
const HubAdminContact = lazy(() => import('../pages/hub/admin/contact/page'));
const HubAdminProjectRedirect = lazy(() => import('../pages/hub/admin/project-redirect/page'));
const HubDemoPage = lazy(() => import('../pages/hub/demo/page'));
const PublicQuestionnaire = lazy(() => import('../pages/q/page'));
const PublicPaymentPage = lazy(() => import('../pages/pay/page'));

const withAdminGate = (element: ReactNode) => (
  <HubRouteGate allowedRoles={['owner', 'admin', 'hr']}>{element}</HubRouteGate>
);

const withContractorGate = (element: ReactNode) => (
  <HubRouteGate allowedRoles={['contractor']}>{element}</HubRouteGate>
);

const S = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" /></div>}>{children}</Suspense>
);

const routes: RouteObject[] = [
  // Marketing site
  { path: "/", element: <Home /> },
  { path: "/projects", element: <Projects /> },
  { path: "/projects/:slug", element: <ProjectDetail /> },
  { path: "/studio", element: <Studio /> },
  { path: "/process", element: <Process /> },
  { path: "/contact", element: <Contact /> },
  { path: "/careers", element: <Careers /> },
  { path: "/consultation", element: <Consultation /> },
  { path: "/privacy", element: <Privacy /> },

  // Hub — auth
  { path: '/hub/login', element: <S><HubLoginPage /></S> },
  { path: '/hub/signup', element: <S><HubSignupPage /></S> },
  { path: '/hub/forgot-password', element: <S><HubForgotPasswordPage /></S> },
  { path: '/hub/reset-password', element: <S><HubResetPasswordPage /></S> },

  // Hub — admin
  { path: '/hub/admin/dashboard', element: <S>{withAdminGate(<HubAdminDashboard />)}</S> },
  { path: '/hub/admin/contractors', element: <S>{withAdminGate(<HubAdminContractors />)}</S> },
  { path: '/hub/admin/contractors/:id', element: <S>{withAdminGate(<HubAdminContractorDetail />)}</S> },
  { path: '/hub/admin/attendance', element: <S>{withAdminGate(<HubAdminAttendance />)}</S> },
  { path: '/hub/admin/requests', element: <S>{withAdminGate(<HubAdminRequests />)}</S> },
  { path: '/hub/admin/timeoff', element: <S>{withAdminGate(<HubAdminTimeOff />)}</S> },
  { path: '/hub/admin/overtime', element: <S>{withAdminGate(<HubAdminOvertime />)}</S> },
  { path: '/hub/admin/announcements', element: <S>{withAdminGate(<HubAdminAnnouncements />)}</S> },
  { path: '/hub/admin/sop', element: <S>{withAdminGate(<HubAdminSop />)}</S> },
  { path: '/hub/admin/assets', element: <S>{withAdminGate(<HubAdminAssets />)}</S> },
  { path: '/hub/admin/auditlog', element: <S>{withAdminGate(<HubAdminAuditLog />)}</S> },
  { path: '/hub/admin/performance', element: <S>{withAdminGate(<HubAdminPerformance />)}</S> },
  { path: '/hub/admin/settings', element: <S>{withAdminGate(<HubAdminSettings />)}</S> },
  { path: '/hub/admin/payroll', element: <S>{withAdminGate(<HubAdminPayroll />)}</S> },
  { path: '/hub/admin/payouts', element: <S>{withAdminGate(<HubAdminPayouts />)}</S> },
  { path: '/hub/admin/docrequests', element: <S>{withAdminGate(<HubAdminDocRequests />)}</S> },
  { path: '/hub/admin/credentials', element: <S>{withAdminGate(<HubAdminCredentials />)}</S> },
  { path: '/hub/admin/projects', element: <S>{withAdminGate(<HubAdminProjects />)}</S> },
  { path: '/hub/admin/documents', element: <S>{withAdminGate(<HubAdminDocuments />)}</S> },
  { path: '/hub/admin/invoice-log', element: <S>{withAdminGate(<HubAdminInvoiceLog />)}</S> },
  { path: '/hub/admin/invoices/:projectId', element: <S>{withAdminGate(<HubAdminInvoiceBuilder />)}</S> },
  { path: '/hub/admin/tasks', element: <S>{withAdminGate(<HubAdminTasks />)}</S> },
  { path: '/hub/admin/questionnaires', element: <S>{withAdminGate(<HubAdminQuestionnaires />)}</S> },
  { path: '/hub/admin/applications', element: <S>{withAdminGate(<HubAdminApplications />)}</S> },
  { path: '/hub/admin/contact', element: <S>{withAdminGate(<HubAdminContact />)}</S> },
  { path: '/hub/admin/project/:slug', element: <S>{withAdminGate(<HubAdminProjectRedirect />)}</S> },
  { path: '/hub/demo', element: <S><HubDemoPage /></S> },
  { path: '/q/:token', element: <S><PublicQuestionnaire /></S> },
  { path: '/pay/:token', element: <S><PublicPaymentPage /></S> },

  // Hub — employee (contractor)
  { path: '/hub/contractor/dashboard', element: <S>{withContractorGate(<HubContractorDashboard />)}</S> },
  { path: '/hub/contractor/attendance', element: <S>{withContractorGate(<HubContractorAttendance />)}</S> },
  { path: '/hub/contractor/requests', element: <S>{withContractorGate(<HubContractorRequests />)}</S> },
  { path: '/hub/contractor/timeoff', element: <S>{withContractorGate(<HubContractorTimeOff />)}</S> },
  { path: '/hub/contractor/overtime', element: <S>{withContractorGate(<HubContractorOvertime />)}</S> },
  { path: '/hub/contractor/sop', element: <S>{withContractorGate(<HubContractorSop />)}</S> },
  { path: '/hub/contractor/announcements', element: <S>{withContractorGate(<HubContractorAnnouncements />)}</S> },
  { path: '/hub/contractor/profile', element: <S>{withContractorGate(<HubContractorProfile />)}</S> },
  { path: '/hub/contractor/payouts', element: <S>{withContractorGate(<HubContractorPayouts />)}</S> },
  { path: '/hub/contractor/documents', element: <S>{withContractorGate(<HubContractorDocuments />)}</S> },
  { path: '/hub/contractor/credentials', element: <S>{withContractorGate(<HubContractorCredentials />)}</S> },
  { path: '/hub/contractor/clients', element: <S>{withContractorGate(<HubContractorClients />)}</S> },
  { path: '/hub/contractor/projects', element: <S>{withContractorGate(<HubContractorProjects />)}</S> },
  { path: '/hub/contractor/project/:slug', element: <S>{withContractorGate(<HubContractorProjectRedirect />)}</S> },
  { path: '/hub/contractor/onboarding', element: <S><HubContractorOnboarding /></S> },

  { path: "*", element: <NotFound /> },
];

export default routes;
