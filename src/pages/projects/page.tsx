import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import PhilippinesMap from './components/PhilippinesMap';
import StudioCTA from '../studio/components/StudioCTA';

const mockProjects = [
  {
    id: 1,
    slug: 'metropolitan-healthcare-center',
    translationKey: 'proj_metropolitan_healthcare_center',
    name: 'Metropolitan Healthcare Center',
    year: '2023',
    address: 'Makati City',
    category: 'Healthcare',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    image: '/images/projects/proj1-thumb.jpg',
  },
  {
    id: 2,
    slug: 'coastal-resort-spa',
    translationKey: 'proj_coastal_resort_spa',
    name: 'Coastal Resort & Spa',
    year: '2023',
    address: 'Leyte Province',
    category: 'Hospitality',
    location: 'Leyte',
    lat: 11.2442,
    lng: 124.9999,
    image: '/images/projects/proj2-thumb.jpg',
  },
  {
    id: 3,
    slug: 'urban-living-complex',
    translationKey: 'proj_urban_living_complex',
    name: 'Urban Living Complex',
    year: '2022',
    address: 'Cebu City',
    category: 'Mixed Use',
    location: 'Cebu',
    lat: 10.3157,
    lng: 123.8854,
    image: '/images/projects/proj3-thumb.jpg',
  },
  {
    id: 4,
    slug: 'tech-hub-office-tower',
    translationKey: 'proj_tech_hub_office_tower',
    name: 'Tech Hub Office Tower',
    year: '2023',
    address: 'BGC, Taguig',
    category: 'Offices',
    location: 'Manila',
    lat: 14.5502,
    lng: 121.0485,
    image: '/images/projects/proj4-thumb.jpg',
  },
  {
    id: 5,
    slug: 'hillside-residences',
    translationKey: 'proj_hillside_residences',
    name: 'Hillside Residences',
    year: '2022',
    address: 'Davao City',
    category: 'Residential',
    location: 'Davao',
    lat: 7.1907,
    lng: 125.4553,
    image: '/images/projects/proj5-thumb.jpg',
  },
  {
    id: 6,
    slug: 'lifestyle-shopping-district',
    translationKey: 'proj_lifestyle_shopping_district',
    name: 'Lifestyle Shopping District',
    year: '2023',
    address: 'CDO City',
    category: 'Retail',
    location: 'CDO',
    lat: 8.4542,
    lng: 124.6319,
    image: '/images/projects/proj6-thumb.jpg',
  },
  {
    id: 7,
    slug: 'executive-suite-interiors',
    translationKey: 'proj_executive_suite_interiors',
    name: 'Executive Suite Interiors',
    year: '2023',
    address: 'Makati City',
    category: 'Interior Design',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    image: '/images/projects/proj7-thumb.jpg',
  },
  {
    id: 8,
    slug: 'waterfront-villas',
    translationKey: 'proj_waterfront_villas',
    name: 'Waterfront Villas',
    year: '2022',
    address: 'Zamboanga City',
    category: 'Residential',
    location: 'Zamboanga',
    lat: 6.9214,
    lng: 122.079,
    image: '/images/projects/proj8-thumb.jpg',
  },
  {
    id: 9,
    slug: 'city-medical-plaza',
    translationKey: 'proj_city_medical_plaza',
    name: 'City Medical Plaza',
    year: '2022',
    address: 'Cebu City',
    category: 'Healthcare',
    location: 'Cebu',
    lat: 10.3157,
    lng: 123.8854,
    image: '/images/projects/proj9-thumb.jpg',
  },
  {
    id: 10,
    slug: 'boutique-hotel-downtown',
    translationKey: 'proj_boutique_hotel_downtown',
    name: 'Boutique Hotel Downtown',
    year: '2023',
    address: 'Manila',
    category: 'Hospitality',
    location: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    image: '/images/projects/proj10-thumb.jpg',
  },
  {
    id: 11,
    slug: 'innovation-campus',
    translationKey: 'proj_innovation_campus',
    name: 'Innovation Campus',
    year: '2023',
    address: 'Davao City',
    category: 'Mixed Use',
    location: 'Davao',
    lat: 7.1907,
    lng: 125.4553,
    image: '/images/projects/proj11-thumb.jpg',
  },
  {
    id: 12,
    slug: 'corporate-headquarters',
    translationKey: 'proj_corporate_headquarters',
    name: 'Corporate Headquarters',
    year: '2022',
    address: 'Makati City',
    category: 'Offices',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    image: '/images/projects/proj12-thumb.jpg',
  },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

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

  // ── Projects visibility (revealed after map interaction) ──
  const [projectsVisible, setProjectsVisible] = useState(false);

  const locations = ['all', 'Manila', 'Leyte', 'Cebu', 'CDO', 'Davao', 'Zamboanga'];

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
  const [selectedProject, setSelectedProject] = useState<typeof mockProjects[0] | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [showGoUp, setShowGoUp] = useState(false);

  // Count projects per location (filtered by category+search, not by location)
  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    locations.filter((l) => l !== 'all').forEach((loc) => {
      counts[loc] = mockProjects.filter((p) => {
        const matchesCat = activeCategory === 'all' || p.category === activeCategory;
        const matchesSearch =
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.address.toLowerCase().includes(searchQuery.toLowerCase());
        return p.location === loc && matchesCat && matchesSearch;
      }).length;
    });
    return counts;
  }, [activeCategory, searchQuery]);

  // Full (unfiltered) per-city data for the map hover cards
  const cityProjectData = useMemo(() => {
    const data: Record<string, {
      count: number;
      categories: string[];
      featuredProjects: { name: string; year: string; category: string }[];
      yearRange: { min: string; max: string };
    }> = {};
    locations.filter((l) => l !== 'all').forEach((loc) => {
      const cityProjs = mockProjects.filter((p) => p.location === loc);
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

  // Slideshow state
  const [viewMode, setViewMode] = useState<'slideshow' | 'map'>('slideshow');
  const [slideIndex, setSlideIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const filteredProjects = useMemo(() => mockProjects.filter((project) => {
    const matchesLocation = activeLocation === 'all' || project.location === activeLocation;
    const matchesCategory = activeCategory === 'all' || project.category === activeCategory;
    const translatedName = t(`${project.translationKey}_name`);
    const translatedAddress = t(`${project.translationKey}_address`);
    const matchesSearch =
      translatedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      translatedAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.address.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLocation && matchesCategory && matchesSearch;
  }), [activeLocation, activeCategory, searchQuery, t]);

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
  }, [activeLocation, activeCategory, sortBy, sortOrder, searchQuery]);

  // Show/hide Go Up button
  useEffect(() => {
    const handleScroll = () => setShowGoUp(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset slide index when filters change
  useEffect(() => {
    setSlideIndex(0);
  }, [activeLocation, activeCategory, sortBy, searchQuery]);

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

  const goToSlide = useCallback((index: number) => {
    if (isTransitioning || sortedProjects.length === 0) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setSlideIndex(index);
      setIsTransitioning(false);
    }, 300);
  }, [isTransitioning, sortedProjects.length]);

  const prevSlide = () => {
    const newIndex = slideIndex === 0 ? sortedProjects.length - 1 : slideIndex - 1;
    goToSlide(newIndex);
  };

  const nextSlide = () => {
    const newIndex = slideIndex === sortedProjects.length - 1 ? 0 : slideIndex + 1;
    goToSlide(newIndex);
  };

  // Auto-advance slideshow
  useEffect(() => {
    if (viewMode !== 'slideshow' || sortedProjects.length === 0) return;
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev === sortedProjects.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => clearInterval(timer);
  }, [viewMode, sortedProjects.length, slideIndex]);

  const currentSlide = sortedProjects[slideIndex] ?? null;

  const mapSrc = selectedProject
    ? `https://maps.google.com/maps?q=${selectedProject.lat},${selectedProject.lng}&z=16&output=embed`
    : `https://maps.google.com/maps?q=14.5995,120.9842&z=11&output=embed`;

  const handleLocationChange = useCallback((loc: string) => {
    setActiveLocation(loc);
    setSlideIndex(0);
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
          animation: projFadeUp 0.65s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .grid-revealed .proj-card:nth-child(1)  { animation-delay: 0.00s; }
        .grid-revealed .proj-card:nth-child(2)  { animation-delay: 0.07s; }
        .grid-revealed .proj-card:nth-child(3)  { animation-delay: 0.14s; }
        .grid-revealed .proj-card:nth-child(4)  { animation-delay: 0.21s; }
        .grid-revealed .proj-card:nth-child(5)  { animation-delay: 0.28s; }
        .grid-revealed .proj-card:nth-child(6)  { animation-delay: 0.35s; }
        .grid-revealed .proj-card:nth-child(7)  { animation-delay: 0.42s; }
        .grid-revealed .proj-card:nth-child(8)  { animation-delay: 0.49s; }
        .grid-revealed .proj-card:nth-child(9)  { animation-delay: 0.56s; }
        .grid-revealed .proj-card:nth-child(10) { animation-delay: 0.60s; }
        .grid-revealed .proj-card:nth-child(11) { animation-delay: 0.64s; }
        .grid-revealed .proj-card:nth-child(12) { animation-delay: 0.68s; }

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
              <p
                className="proj-header-item proj-header-d1 text-xs text-navy/60 tracking-wide"
                style={{ fontFamily: 'Marcellus, serif' }}
              >
                {t('projects_count')}
              </p>
            </div>
          </div>

          {/* ── MAP MODE ── */}
          {viewMode === 'map' && (
            <div className="w-full h-72 md:h-96 mb-12 relative">
              <div className="absolute top-4 left-4 z-10 flex items-center gap-3 flex-wrap">
                {selectedProject && (
                  <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2">
                    <div>
                      <p className="text-xs text-navy/50 tracking-wider uppercase" style={{ fontFamily: 'Geist, sans-serif' }}>
                        {t('projects_viewing')}
                      </p>
                      <p className="text-sm font-medium text-navy" style={{ fontFamily: 'Marcellus, serif' }}>
                        {t(`${selectedProject.translationKey}_name`)}
                      </p>
                      <p className="text-xs text-navy/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                        {t(`${selectedProject.translationKey}_address`)}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedProject(null)}
                      className="ml-2 w-6 h-6 flex items-center justify-center text-navy/40 hover:text-navy transition-colors cursor-pointer"
                    >
                      <i className="ri-close-line text-base" />
                    </button>
                  </div>
                )}
              </div>
              <iframe
                key={mapSrc}
                src={mapSrc}
                width="100%"
                height="100%"
                style={{ border: 0, filter: 'grayscale(100%)' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Projects Map"
              />
            </div>
          )}

          {/* ── CATEGORY FILTERS, SORT & SEARCH ── */}
          <div className="px-4 md:px-16 lg:px-24 mb-8">
            {/* Category tabs — scrollable row */}
            <div className="relative overflow-hidden" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <div className="flex items-center gap-4 md:gap-6 overflow-x-auto scrollbar-hide">
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
              <div className="absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-white to-transparent pointer-events-none" />
            </div>

            <div className="flex items-center gap-3 md:gap-4 mt-3 flex-wrap">
              <button
                onClick={() => handleSortChange('date')}
                className={`flex items-center gap-1 text-xs md:text-sm tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
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
                className={`flex items-center gap-1 text-xs md:text-sm tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
                  sortBy === 'alphabetical' ? 'text-navy font-medium' : 'text-navy/40 hover:text-navy/70'
                }`}
                style={{ fontFamily: 'Geist, sans-serif' }}
              >
                {t('projects_sort_alpha')}
                {sortBy === 'alphabetical' && (
                  <i className={`text-xs ${sortOrder === 'asc' ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'}`} />
                )}
              </button>
              <div className="relative flex-1 min-w-0 md:flex-none">
                <input
                  type="text"
                  placeholder={t('projects_search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-44 px-3 md:px-4 py-1.5 text-xs md:text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-black/30 transition-colors duration-300"
                  style={{ fontFamily: 'Geist, sans-serif' }}
                />
                <i className="ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 text-base w-4 h-4 flex items-center justify-center" />
              </div>
            </div>
          </div>

          {/* ── PROJECT GRID ── */}
          <div className="px-4 md:px-16 lg:px-24">
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {sortedProjects.slice(0, visibleCount).map((project) => (
                <div
                  key={project.id}
                  className={`proj-card group transition-all duration-300 ${
                    selectedProject?.id === project.id ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <div
                    className={`w-full aspect-[4/3] overflow-hidden bg-gray-100 transition-all duration-300 cursor-pointer ${
                      selectedProject?.id === project.id ? 'ring-2 ring-black' : ''
                    }`}
                    onClick={() => navigate(`/projects/${project.slug}`)}
                  >
                    <img
                      src={project.image}
                      alt={project.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2 px-2 py-2">
                    <div className="cursor-pointer" onClick={() => navigate(`/projects/${project.slug}`)}>
                      <h3
                        className="text-sm font-medium text-navy mb-0.5 tracking-wide"
                        style={{ fontFamily: 'Marcellus, serif' }}
                      >
                        {t(`${project.translationKey}_name`)}
                      </h3>
                      <p
                        className="text-xs text-navy/50 tracking-wide"
                        style={{ fontFamily: 'Geist, sans-serif' }}
                      >
                        {project.year} · {t(`${project.translationKey}_address`)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProject(project);
                        setViewMode('map');
                        window.scrollTo({ top: 300, behavior: 'smooth' });
                      }}
                      className={`flex-shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center transition-colors duration-300 cursor-pointer ${
                        selectedProject?.id === project.id
                          ? 'text-navy'
                          : 'text-navy/30 hover:text-navy'
                      }`}
                      aria-label="Show on map"
                      title="Show on map"
                    >
                      <i className="ri-map-pin-line text-base" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end mt-8 mb-4 gap-4">
              {visibleCount < sortedProjects.length && (
                <button
                  onClick={() => setVisibleCount((prev) => Math.min(prev + 8, sortedProjects.length))}
                  className="flex items-center gap-2 px-6 py-2.5 border border-black/20 rounded-full text-sm tracking-widest text-navy/70 hover:border-black hover:text-navy transition-all duration-300 cursor-pointer whitespace-nowrap"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
                >
                  Show More Projects
                  <i className="ri-arrow-down-line text-base" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {projectsVisible && <StudioCTA />}
      <ContactFooter hideContactBar />

      {/* Floating Go Up button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed bottom-8 right-8 z-40 w-11 h-11 flex items-center justify-center rounded-full bg-black text-white hover:bg-black/80 transition-all duration-400 cursor-pointer ${
          showGoUp ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label="Go to top"
        title="Go to top"
        style={{ transition: 'opacity 0.35s ease, transform 0.35s ease, background-color 0.2s ease' }}
      >
        <i className="ri-arrow-up-line text-base" />
      </button>
    </div>
  );
}
