// Admin → Website: the public site's projects, team, homepage hero, contact details and job posts, edited here and
// live on fsarchitects.ph as soon as they're saved.
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '@/pages/hub/components/AdminLayout';
import ProjectsTab from './ProjectsTab';
import TeamTab from './TeamTab';
import HeroTab from './HeroTab';
import ContactTab from './ContactTab';
import JobsTab from './JobsTab';

const TABS = [
  { key: 'projects', label: 'Projects', icon: 'ri-building-2-line', el: <ProjectsTab /> },
  { key: 'team', label: 'Team', icon: 'ri-team-line', el: <TeamTab /> },
  { key: 'homepage', label: 'Homepage', icon: 'ri-slideshow-3-line', el: <HeroTab /> },
  { key: 'contact', label: 'Contact', icon: 'ri-contacts-book-line', el: <ContactTab /> },
  { key: 'careers', label: 'Careers', icon: 'ri-briefcase-line', el: <JobsTab /> },
];

export default function WebsitePage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  return (
    <AdminLayout title="Website" actions={
      <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
        <i className="ri-external-link-line" /> View the website
      </a>
    }>
      <div className="space-y-5">
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px cursor-pointer transition-colors ${active.key === t.key ? 'border-[#111827] text-[#111827] font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <i className={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        <div key={active.key}>{active.el}</div>
      </div>
    </AdminLayout>
  );
}
