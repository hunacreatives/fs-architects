import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import PhilippinesMap from './components/PhilippinesMap';
import StudioCTA from '../studio/components/StudioCTA';
import { useSiteProjects, type SiteProject } from '@/lib/site/content';


function ProjectCard({ project, delay, navigate }: {
  project: SiteProject;
  delay: string;
  navigate: (path: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);
  const hasVideo = !!project.video;

  const handleMouseEnter = () => {
    if (!hasVideo) return;
    setHovering(true);
    videoRef.current?.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    if (!hasVideo) return;
    setHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleClick = () => {
    sessionStorage.setItem('projects_return_to_grid', '1');
    navigate(`/projects/${project.slug}`);
  };

  return (
    <div
      className="proj-card group transition-all duration-300 overflow-hidden opacity-80 hover:opacity-100 cursor-pointer"
      style={{ animationDelay: delay }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className="w-full aspect-[4/3] overflow-hidden relative">
        <img
          src={project.video ? project.thumb : project.hero || project.thumb}
          alt={project.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ opacity: hasVideo && hovering ? 0 : 1, transition: 'opacity 0.5s, transform 0.7s' }}
        />
        {hasVideo && (
          <video
            ref={videoRef}
            muted
            playsInline
            loop
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: hovering ? 1 : 0, transition: 'opacity 0.5s' }}
          >
            <source src={project.video} type="video/webm" />
            {project.videoMp4 && <source src={project.videoMp4} type="video/mp4" />}
          </video>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 pt-8 pb-3 pointer-events-none">
          <h3
            className="text-sm font-medium text-white mb-0.5 tracking-wide truncate"
            style={{ fontFamily: 'Marcellus, serif', maxWidth: '200px' }}
            title={project.name}
          >
            {project.name}
          </h3>
          <p className="text-xs text-white/55 tracking-wide" style={{ fontFamily: 'Geist, sans-serif' }}>
            {project.year} · {project.address}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { projects: allProjects } = useSiteProjects();

  // ── Page entrance ──
  const [pageLoaded, setPageLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPageLoaded(true), 20);
    return () => clearTimeout(timer);
  }, []);

  // ── Animation state ──
  const [headerVisible, setHeaderVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const projectsSectionRef = useRef<HTMLDivElement>(null);

  // ── Projects visibility — always open ──
  const [projectsVisible, setProjectsVisible] = useState(true);

  const locations = ['all', 'Manila', 'Bataan', 'Bacolod', 'Butuan', 'Cavite', 'Iligan', 'Leyte', 'Cebu', 'CDO', 'Davao', 'Ozamiz', 'Tagum', 'Zamboanga'];

  const categories = [
    'all',
    'Healthcare',
    'Hospitality',
    'Mixed Use',
    'Offices',
    'Residential',
    'Retail',
    'Interior Design',
  ];

  const categoryLabels: Record<string, string> = {
    all: t('projects_all'),
    Healthcare: t('nav_healthcare'),
    Hospitality: t('nav_hospitality'),
    'Mixed Use': t('nav_mixed_use'),
    Offices: t('nav_offices'),
    Residential: t('nav_residential'),
    Retail: t('nav_retail'),
    'Interior Design': t('nav_interior_design'),
  };

  const [activeLocation, setActiveLocation] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'alphabetical'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(8);
  const batchStartRef = useRef(0);
  const [showGoUp, setShowGoUp] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Count projects per location (filtered by category+search, not by location)
  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.filter((l) => l !== 'all').forEach((loc) => {
      counts[loc] = allProjects.filter((p) => {
        const matchesCat = activeCategory === 'all' || p.category === activeCategory;
        const matchesSearch =
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.addressEn.toLowerCase().includes(searchQuery.toLowerCase());
        return p.location === loc && matchesCat && matchesSearch;
      }).length;
    });
    return counts;
  }, [allProjects, activeCategory, searchQuery]);

  // Full (unfiltered) per-city data for the map hover cards
  const cityProjectData = useMemo(() => {
    const data: Record<string, {
      count: number;
      categories: string[];
      featuredProjects: { name: string; year: string; category: string }[];
      yearRange: { min: string; max: string };
    }> = {};
    locations.filter((l) => l !== 'all').forEach((loc) => {
      const cityProjs = allProjects.filter((p) => p.location === loc);
      const years = cityProjs.map((p) => p.year);
      data[loc] = {
        count: cityProjs.length,
        categories: [...new Set(cityProjs.map((p) => p.category))],
        featuredProjects: cityProjs.slice(0, 3).map((p) => ({
          name: p.name,
          year: p.year,
          category: p.category,
        })),
        yearRange: {
          min: years.reduce((a, b) => (a < b ? a : b), years[0] ?? ''),
          max: years.reduce((a, b) => (a > b ? a : b), years[0] ?? ''),
        },
      };
    });
    return data;
  }, [allProjects]);

  // Scroll to grid when returning from a project detail page
  useEffect(() => {
    if (sessionStorage.getItem('projects_return_to_grid')) {
      sessionStorage.removeItem('projects_return_to_grid');
      setProjectsVisible(true);
      setTimeout(() => {
        projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);

  // Read ?category= from URL — re-runs whenever searchParams changes
  // (handles both first load and navigating from the menu while already on this page)
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat && categories.includes(cat)) {
      setActiveCategory(cat);
      setActiveLocation('all');
      setProjectsVisible(true);
      setTimeout(() => {
        projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  // categories is a stable constant array defined in render — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  const filteredProjects = useMemo(() => allProjects.filter((project) => {
    const matchesLocation = activeLocation === 'all' || project.location === activeLocation;
    const matchesCategory = activeCategory === 'all' || project.category === activeCategory;
    const translatedName = project.name;
    const translatedAddress = project.address;
    const matchesSearch =
      translatedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      translatedAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.addressEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLocation && matchesCategory && matchesSearch;
  }), [allProjects, activeLocation, activeCategory, searchQuery]);

  const sortedProjects = useMemo(() => [...filteredProjects].sort((a, b) => {
    if (sortBy === 'date') {
      const result = b.year.localeCompare(a.year);
      return sortOrder === 'desc' ? result : -result;
    }
    const result = a.name.localeCompare(b.name);
    return sortOrder === 'asc' ? result : -result;
  }), [filteredProjects, sortBy, sortOrder]);

  const handleSortChange = (newSortBy: 'date' | 'alphabetical') => {
    if (newSortBy === sortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(newSortBy);
      setSortOrder(newSortBy === 'date' ? 'desc' : 'asc');
    }
  };

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(8);
    batchStartRef.current = 0;
  }, [activeLocation, activeCategory, sortBy, sortOrder, searchQuery]);

  // Infinite scroll — re-attach observer each time sentinel mounts/moves
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => {
            batchStartRef.current = prev;
            return prev + 8;
          });
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [visibleCount, sortedProjects.length]);

  // Show/hide Go Up button
  useEffect(() => {
    const handleScroll = () => setShowGoUp(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Header entrance ──
  useEffect(() => {
    const t = setTimeout(() => setHeaderVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── Grid stagger reveal ──
  // Dependency uses actual filter/sort state values — NOT sortedProjects reference,
  // which is a new array on every render and would cause constant flickering.
  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;

    container.classList.remove('grid-revealed');

    const trigger = () => container.classList.add('grid-revealed');

    const fallback = setTimeout(trigger, 120);

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(fallback);
          trigger();
          obs.disconnect();
        }
      },
      { threshold: 0.01 }
    );
    obs.observe(container);

    return () => {
      clearTimeout(fallback);
      obs.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation, activeCategory, sortBy, sortOrder, searchQuery, projectsVisible]);

  const handleLocationChange = useCallback((loc: string) => {
    setActiveLocation(loc);
    setProjectsVisible(true);
    setTimeout(() => {
      projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  const handleViewAllProjects = useCallback(() => {
    setProjectsVisible(true);
    setTimeout(() => {
      projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  return (
    <div
      className="min-h-screen bg-white"
      style={{
        opacity: pageLoaded ? 1 : 0,
        transform: pageLoaded ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1), transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <style>{`
        @keyframes projFadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .proj-header-item {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        .proj-header-visible .proj-header-item { opacity: 1; transform: translateY(0); }
        .proj-header-d0 { transition-delay: 0s; }
        .proj-header-d1 { transition-delay: 0.1s; }
        .proj-header-d2 { transition-delay: 0.18s; }

        .proj-card {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0s, transform 0s;
        }
        .grid-revealed .proj-card {
          animation: projFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
        }

        @keyframes projectsReveal {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .projects-section-reveal {
          animation: projectsReveal 0.6s ease both;
        }
      `}</style>

      <Navigation theme="dark" />

      {/* Philippines Map — full-screen landing hero */}
      <PhilippinesMap
        activeLocation={activeLocation}
        onLocationChange={handleLocationChange}
        onViewAllProjects={handleViewAllProjects}
        projectCounts={projectCounts}
        cityProjectData={cityProjectData}
      />

      {/* ── PROJECTS SECTION — revealed after map click ── */}
      {projectsVisible && (
        <div ref={projectsSectionRef} className="projects-section-reveal pb-16">

          {/* Header */}
          <div className="px-4 md:px-16 lg:px-24 pt-12 mb-8">
            <div className={`flex items-center justify-between ${headerVisible ? 'proj-header-visible' : ''}`}>
              <h1
                className="proj-header-item proj-header-d0 text-xl font-light tracking-wide text-navy"
                style={{ fontFamily: 'Marcellus, serif' }}
              >
                {t('projects_title')}
              </h1>
            </div>
          </div>

          {/* ── CATEGORY FILTERS, SORT & SEARCH ── */}
          <div className="px-4 md:px-16 lg:px-24 mb-8">
            {/* Active location badge */}
            {activeLocation !== 'all' && (
              <div className="flex items-center gap-2 mb-4">
                <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)' }}>
                  Showing
                </span>
                <button
                  onClick={() => setActiveLocation('all')}
                  className="flex items-center gap-1.5 cursor-pointer group"
                  style={{
                    background: 'rgba(0,0,0,0.06)',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: '20px',
                    padding: '4px 10px 4px 12px',
                  }}
                >
                  <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.70)' }}>
                    {activeLocation}
                  </span>
                  <i className="ri-close-line group-hover:text-black transition-colors" style={{ fontSize: '12px', color: 'rgba(0,0,0,0.40)' }} />
                </button>
                <span style={{ fontFamily: 'Geist, sans-serif', fontSize: '10px', letterSpacing: '0.04em', color: 'rgba(0,0,0,0.28)' }}>
                  · {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* Category tabs — scrollable row */}
            <div className="relative overflow-hidden" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-center gap-4 md:gap-6 overflow-x-auto scrollbar-hide pr-10 md:pr-0">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`text-xs md:text-sm tracking-wider whitespace-nowrap flex-shrink-0 transition-all duration-300 pb-3 border-b-2 -mb-px cursor-pointer ${
                      activeCategory === category
                        ? 'text-navy border-black font-semibold'
                        : 'text-navy/40 border-transparent hover:text-navy/70'
                    }`}
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em' }}
                  >
                    {categoryLabels[category]}
                  </button>
                ))}
              </div>
              {/* Scroll fade + chevron — mobile only */}
              <div className="md:hidden absolute top-0 right-0 h-full flex items-center pointer-events-none" style={{ paddingBottom: '2px' }}>
                <div className="w-16 h-full bg-gradient-to-l from-white via-white/80 to-transparent" />
                <div className="absolute right-0 pr-1 flex items-center" style={{ bottom: '10px' }}>
                  <i className="ri-arrow-right-s-line text-navy/30" style={{ fontSize: '14px' }} />
                </div>
              </div>
              <div className="hidden md:block absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
            </div>

            <div className="flex items-center justify-end gap-3 md:gap-4 mt-3 flex-wrap">
              <button
                onClick={() => handleSortChange('date')}
                className={`flex items-center gap-1 text-xs tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
                  sortBy === 'date' ? 'text-navy font-medium' : 'text-navy/40 hover:text-navy/70'
                }`}
                style={{ fontFamily: 'Geist, sans-serif' }}
              >
                {t('projects_sort_date')}
                {sortBy === 'date' && (
                  <i className={`text-xs ${sortOrder === 'desc' ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'}`} />
                )}
              </button>
              <button
                onClick={() => handleSortChange('alphabetical')}
                className={`flex items-center gap-1 text-xs tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
                  sortBy === 'alphabetical' ? 'text-navy font-medium' : 'text-navy/40 hover:text-navy/70'
                }`}
                style={{ fontFamily: 'Geist, sans-serif' }}
              >
                {t('projects_sort_alpha')}
                {sortBy === 'alphabetical' && (
                  <i className={`text-xs ${sortOrder === 'asc' ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'}`} />
                )}
              </button>
              <div className="relative">
                <input
                  type="text"
                  placeholder={t('projects_search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-40 pl-4 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:border-black/30 transition-colors duration-300"
                  style={{ fontFamily: 'Geist, sans-serif' }}
                />
                <i className="ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 text-sm" />
              </div>
            </div>
          </div>

          {/* ── PROJECT GRID ── */}
          <div className="px-4 md:px-16 lg:px-24">
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0.5">
              {sortedProjects.slice(0, visibleCount).map((project, idx) => {
                const batchIdx = idx - batchStartRef.current;
                const delay = batchIdx >= 0 ? `${Math.min(batchIdx * 0.06, 0.28)}s` : '0s';
                return (
                  <ProjectCard
                    key={project.slug}
                    project={project}
                    delay={delay}
                    navigate={navigate}
                  />
                );
              })}
            </div>

            {visibleCount < sortedProjects.length && (
              <div ref={sentinelRef} className="h-16 mt-4" aria-hidden="true" />
            )}
          </div>
        </div>
      )}

      {projectsVisible && <div className="pb-16"><StudioCTA /></div>}
      <ContactFooter hideContactBar />

    </div>
  );
}
