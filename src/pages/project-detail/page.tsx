import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import StudioCTA from '../studio/components/StudioCTA';
import ProjectHero from './components/ProjectHero';
import ProjectInfo from './components/ProjectInfo';
import ProjectSpecs from './components/ProjectSpecs';
import NextProject from './components/NextProject';
import { useSiteProjects } from '@/lib/site/content';

export default function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { projects: projectsData, ready } = useSiteProjects();
  const project = projectsData.find((p) => p.slug === slug);

  if (!project && !ready) return <div className="min-h-screen bg-white" />;   // a project added in the hub, still loading
  if (!project) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-black/40 text-sm mb-4" style={{ fontFamily: 'Geist, sans-serif' }}>
            {t('detail_not_found')}
          </p>
          <button
            onClick={() => navigate('/projects')}
            className="text-black text-sm underline cursor-pointer"
            style={{ fontFamily: 'Geist, sans-serif' }}
          >
            {t('detail_back_link')}
          </button>
        </div>
      </div>
    );
  }

  const { name, description, quote } = project;
  const floorPlans = project.floorPlans;

  const currentIndex = projectsData.findIndex((p) => p.slug === slug);
  const nextProject = projectsData[(currentIndex + 1) % projectsData.length];
  const prevProject = projectsData[(currentIndex - 1 + projectsData.length) % projectsData.length];
  const nextName = nextProject.name;
  const prevName = prevProject.name;
  const specs = project.floors || project.plotArea || project.builtArea
    ? { plotArea: project.plotArea || '—', builtArea: project.builtArea || '—', floors: project.floors || '—' }
    : null;

  return (
    <div className="min-h-screen bg-white">
      <Navigation theme="light" />

      <ProjectHero
        name={name}
        image={project.hero}
        index={currentIndex}
        total={projectsData.length}
        location={project.location}
      />

      {specs && (
        <div className="px-6 md:px-16 lg:px-24 mt-16 md:mt-24">
          <div className="mx-auto" style={{ maxWidth: '840px' }}>
            <ProjectSpecs
              plotArea={specs.plotArea}
              builtArea={specs.builtArea}
              floors={specs.floors}
              year={project.year}
            />
          </div>
        </div>
      )}

      <ProjectInfo
        key={project.slug}
        name={name}
        description={description}
        mainImage={project.main}
        galleryImages={project.gallery}
        plans={floorPlans}
        quote={quote || undefined}
      />

      <NextProject
        slug={nextProject.slug}
        name={nextName}
        location={nextProject.location}
        heroImage={nextProject.hero}
        prevSlug={prevProject.slug}
        prevName={prevName}
      />

      <StudioCTA />
      <ContactFooter hideContactBar />
    </div>
  );
}
