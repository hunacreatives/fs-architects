import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';

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
    image: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20healthcare%20building%20exterior%20with%20clean%20white%20facade%20and%20large%20glass%20windows%2C%20simple%20background%2C%20architectural%20photography%20style%2C%20professional%20composition%2C%20natural%20daylight%2C%20contemporary%20medical%20facility%20design&width=800&height=600&seq=proj1&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20resort%20building%20with%20natural%20materials%20and%20open%20design%2C%20simple%20tropical%20background%2C%20architectural%20photography%2C%20clean%20lines%2C%20contemporary%20hospitality%20architecture%2C%20warm%20natural%20lighting&width=800&height=600&seq=proj2&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=contemporary%20mixed-use%20building%20with%20residential%20and%20commercial%20spaces%2C%20minimalist%20facade%20design%2C%20simple%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20materials%2C%20clean%20composition&width=800&height=600&seq=proj3&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=sleek%20modern%20office%20building%20with%20glass%20curtain%20wall%20facade%2C%20minimalist%20design%2C%20simple%20sky%20background%2C%20architectural%20photography%2C%20contemporary%20corporate%20architecture%2C%20professional%20lighting&width=800&height=600&seq=proj4&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20residential%20building%20with%20clean%20geometric%20forms%2C%20simple%20natural%20background%2C%20architectural%20photography%20style%2C%20contemporary%20housing%20design%2C%20soft%20natural%20lighting&width=800&height=600&seq=proj5&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=contemporary%20retail%20complex%20with%20open%20plaza%20design%2C%20minimalist%20commercial%20architecture%2C%20simple%20background%2C%20architectural%20photography%2C%20modern%20shopping%20center%2C%20bright%20daylight&width=800&height=600&seq=proj6&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=minimalist%20modern%20interior%20space%20with%20clean%20lines%20and%20natural%20materials%2C%20simple%20elegant%20design%2C%20architectural%20interior%20photography%2C%20contemporary%20office%20interior%2C%20soft%20ambient%20lighting&width=800&height=600&seq=proj7&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20villa%20architecture%20with%20natural%20stone%20and%20wood%2C%20simple%20coastal%20background%2C%20architectural%20photography%20style%2C%20contemporary%20residential%20design%2C%20warm%20natural%20light&width=800&height=600&seq=proj8&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=modern%20healthcare%20facility%20with%20clean%20white%20exterior%20and%20glass%20elements%2C%20minimalist%20medical%20building%20design%2C%20simple%20background%2C%20architectural%20photography%2C%20professional%20composition&width=800&height=600&seq=proj9&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=contemporary%20boutique%20hotel%20building%20with%20elegant%20minimalist%20facade%2C%20simple%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20hospitality%20design%2C%20sophisticated%20lighting&width=800&height=600&seq=proj10&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=modern%20campus%20building%20with%20mixed-use%20design%2C%20minimalist%20contemporary%20architecture%2C%20simple%20landscape%20background%2C%20architectural%20photography%2C%20clean%20geometric%20forms&width=800&height=600&seq=proj11&orientation=landscape',
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
    image: 'https://readdy.ai/api/search-image?query=prestigious%20office%20building%20with%20minimalist%20glass%20and%20steel%20facade%2C%20simple%20sky%20background%2C%20architectural%20photography%20style%2C%20contemporary%20corporate%20design%2C%20professional%20composition&width=800&height=600&seq=proj12&orientation=landscape',
  },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  // ── Animation state ──
  const [headerVisible, setHeaderVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

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
  const [popupProject, setPopupProject] = useState<typeof mockProjects[0] | null>(null);

  // Read ?category= from URL on first mount
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat && categories.includes(cat)) {
      setActiveCategory(cat);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slideshow state
  const [viewMode, setViewMode] = useState<'slideshow' | 'map'>('slideshow');
  const [slideIndex, setSlideIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const filteredProjects = mockProjects.filter((project) => {
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
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'date') {
      const result = b.year.localeCompare(a.year);
      return sortOrder === 'desc' ? result : -result;
    }
    const result = a.name.localeCompare(b.name);
    return sortOrder === 'asc' ? result : -result;
  });

  const handleSortChange = (newSortBy: 'date' | 'alphabetical') => {
    if (newSortBy === sortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(newSortBy);
      setSortOrder(newSortBy === 'date' ? 'desc' : 'asc');
    }
  };

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
  useEffect(() => {
    const container = gridRef.current;
    if (!container) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          container.classList.add('grid-revealed');
          obs.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(container);
    return () => obs.disconnect();
  }, [sortedProjects]);

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

  return (
    <div className="min-h-screen bg-white">
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
      `}</style>

      <Navigation theme="dark" />

      <div className="pt-24 pb-16">
        {/* Header */}
        <div className="px-4 md:px-16 lg:px-24 mb-8">
          <div className={`flex items-center justify-between ${headerVisible ? 'proj-header-visible' : ''}`}>
            <h1
              className="proj-header-item proj-header-d0 text-xl font-light tracking-wide text-black"
              style={{ fontFamily: 'Marcellus, serif' }}
            >
              {t('projects_title')}
            </h1>
            <p
              className="proj-header-item proj-header-d1 text-xs text-black/60 tracking-wide"
              style={{ fontFamily: 'Geist, sans-serif' }}
            >
              {t('projects_count')}
            </p>
          </div>
        </div>

        {/* Location Filters */}
        <div className="px-4 md:px-16 lg:px-24 mb-8">
          <div className="relative">
            <div className="flex items-center gap-4 md:gap-8 overflow-x-auto pb-2 scrollbar-hide">
              {locations.map((location) => (
                <button
                  key={location}
                  onClick={() => setActiveLocation(location)}
                  className={`text-sm tracking-wider whitespace-nowrap transition-all duration-300 pb-2 border-b-2 cursor-pointer ${
                    activeLocation === location
                      ? 'text-black border-black font-medium'
                      : 'text-black/40 border-transparent hover:text-black/70'
                  }`}
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.05em' }}
                >
                  {location === 'all' ? t('projects_all_locations') : location}
                </button>
              ))}
            </div>
            {/* Scroll hint fade — mobile only */}
            <div className="absolute top-0 right-0 h-full w-16 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none md:hidden" />
          </div>
        </div>

        {/* ── SLIDESHOW MODE ── */}
        {viewMode === 'slideshow' && (
          <div className="w-full mb-12">
            {sortedProjects.length === 0 ? (
              <div className="w-full h-[520px] flex items-center justify-center bg-gray-50">
                <p className="text-black/40 text-sm" style={{ fontFamily: 'Geist, sans-serif' }}>
                  No projects found
                </p>
              </div>
            ) : (
              <div className="relative w-full h-[280px] md:h-[520px] overflow-hidden bg-black">
                {/* Slide image */}
                <div
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  <img
                    src={currentSlide?.image}
                    alt={currentSlide?.name}
                    className="w-full h-full object-cover"
                  />
                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                </div>

                {/* Slide counter top-right */}
                <div className="absolute top-4 right-0 z-10 px-4 md:px-16 lg:px-24 flex items-center gap-2">
                  <span
                    className="text-white/60 text-xs tracking-widest"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
                  >
                    {String(slideIndex + 1).padStart(2, '0')} / {String(sortedProjects.length).padStart(2, '0')}
                  </span>
                </div>

                {/* View on Map button — top-left */}
                <div className="absolute top-4 left-0 z-10 px-4 md:px-16 lg:px-24">
                  <button
                    onClick={() => setViewMode('map')}
                    className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs tracking-widest hover:bg-white/20 transition-all duration-300 cursor-pointer whitespace-nowrap"
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                  >
                    <i className="ri-map-pin-line text-sm" />
                    <span className="hidden sm:inline">VIEW ON MAP</span>
                    <span className="sm:hidden">MAP</span>
                  </button>
                </div>

                {/* Bottom info overlay */}
                <div
                  className={`absolute bottom-0 left-0 right-0 z-10 px-4 md:px-16 lg:px-24 pb-8 md:pb-10 pt-10 md:pt-16 transition-opacity duration-500 ${
                    isTransitioning ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-0">
                    <div>
                      <span
                        className="inline-block text-white/50 text-xs tracking-widest uppercase mb-2 md:mb-3"
                        style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.14em' }}
                      >
                        {currentSlide?.category}
                      </span>
                      <h2
                        className="text-base md:text-xl font-light text-white mb-1 md:mb-2 tracking-wide"
                        style={{ fontFamily: 'Marcellus, serif' }}
                      >
                        {currentSlide ? t(`${currentSlide.translationKey}_name`) : ''}
                      </h2>
                      <p
                        className="text-white/60 text-xs tracking-wide"
                        style={{ fontFamily: 'Geist, sans-serif' }}
                      >
                        {currentSlide?.year} · {currentSlide ? t(`${currentSlide.translationKey}_address`) : ''}
                      </p>
                    </div>

                    {/* View Full Project button */}
                    <button
                      onClick={() => currentSlide && navigate(`/projects/${currentSlide.slug}`)}
                      className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 md:px-6 md:py-3 bg-white rounded-full text-black text-xs tracking-widest hover:bg-white/90 transition-all duration-300 cursor-pointer whitespace-nowrap"
                      style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
                    >
                      VIEW PROJECT
                      <i className="ri-arrow-right-line text-sm" />
                    </button>
                  </div>
                </div>

                {/* Prev / Next arrows */}
                <button
                  onClick={prevSlide}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 ml-3 md:ml-16 lg:ml-24 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/25 transition-all duration-300 cursor-pointer"
                  aria-label="Previous project"
                >
                  <i className="ri-arrow-left-line text-base md:text-lg" />
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 mr-3 md:mr-16 lg:mr-24 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/25 transition-all duration-300 cursor-pointer"
                  aria-label="Next project"
                >
                  <i className="ri-arrow-right-line text-base md:text-lg" />
                </button>

                {/* Dot indicators */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                  {sortedProjects.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goToSlide(i)}
                      className={`transition-all duration-300 cursor-pointer rounded-full ${
                        i === slideIndex
                          ? 'w-6 h-1.5 bg-white'
                          : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                      }`}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAP MODE ── */}
        {viewMode === 'map' && (
          <div className="w-full h-72 md:h-96 mb-12 relative">
            {/* Back to Slideshow button */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => {
                  setViewMode('slideshow');
                  setSelectedProject(null);
                }}
                className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/90 backdrop-blur-sm border border-black/10 rounded-full text-black text-xs tracking-widest hover:bg-white transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm"
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.1em' }}
              >
                <i className="ri-slideshow-line text-sm" />
                SLIDESHOW
              </button>

              {selectedProject && (
                <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
                  <div>
                    <p
                      className="text-xs text-black/50 tracking-wider uppercase"
                      style={{ fontFamily: 'Geist, sans-serif' }}
                    >
                      {t('projects_viewing')}
                    </p>
                    <p
                      className="text-sm font-medium text-black"
                      style={{ fontFamily: 'Marcellus, serif' }}
                    >
                      {t(`${selectedProject.translationKey}_name`)}
                    </p>
                    <p className="text-xs text-black/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                      {t(`${selectedProject.translationKey}_address`)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="ml-2 w-6 h-6 flex items-center justify-center text-black/40 hover:text-black transition-colors cursor-pointer"
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
          <div className="flex items-center justify-between gap-6" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>

            {/* Categories — scrollable row */}
            <div className="relative flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-4 md:gap-6 overflow-x-auto scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`text-sm tracking-wider whitespace-nowrap flex-shrink-0 transition-all duration-300 pb-3 border-b-2 -mb-px cursor-pointer ${
                      activeCategory === category
                        ? 'text-black border-black font-semibold'
                        : 'text-black/40 border-transparent hover:text-black/70'
                    }`}
                    style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.04em' }}
                  >
                    {categoryLabels[category]}
                  </button>
                ))}
              </div>
              <div className="absolute top-0 right-0 h-full w-16 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none md:hidden" />
            </div>

            {/* Sort + Search — pinned right, same baseline */}
            <div className="flex items-center gap-3 md:gap-4 flex-shrink-0 pb-3">
              <button
                onClick={() => handleSortChange('date')}
                className={`flex items-center gap-1 text-sm tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
                  sortBy === 'date' ? 'text-black font-medium' : 'text-black/40 hover:text-black/70'
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
                className={`flex items-center gap-1 text-sm tracking-wider whitespace-nowrap transition-colors duration-300 cursor-pointer ${
                  sortBy === 'alphabetical' ? 'text-black font-medium' : 'text-black/40 hover:text-black/70'
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
                  className="w-36 md:w-44 px-3 md:px-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-black/30 transition-colors duration-300"
                  style={{ fontFamily: 'Geist, sans-serif' }}
                />
                <i className="ri-search-line absolute right-3 top-1/2 -translate-y-1/2 text-black/40 text-base w-4 h-4 flex items-center justify-center" />
              </div>
            </div>

          </div>
        </div>

        {/* ── PROJECT GRID ── */}
        <div className="px-4 md:px-16 lg:px-24">
          <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {sortedProjects.map((project) => (
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
                  onClick={() => setPopupProject(project)}
                >
                  <img
                    src={project.image}
                    alt={project.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="flex items-start justify-between gap-2 px-2 py-2">
                  <div className="cursor-pointer" onClick={() => setPopupProject(project)}>
                    <h3
                      className="text-sm font-medium text-black mb-0.5 tracking-wide"
                      style={{ fontFamily: 'Marcellus, serif' }}
                    >
                      {t(`${project.translationKey}_name`)}
                    </h3>
                    <p
                      className="text-xs text-black/50 tracking-wide"
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
                        ? 'text-black'
                        : 'text-black/30 hover:text-black'
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
        </div>
      </div>

      <ContactFooter />

      {/* Project Detail Popup */}
      {popupProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setPopupProject(null)}
        >
          <div
            className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPopupProject(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-black/60 hover:text-black transition-colors duration-200 cursor-pointer"
              aria-label="Close"
            >
              <i className="ri-close-line text-lg" />
            </button>

            <div className="w-full h-48 sm:h-64 md:h-72 overflow-hidden">
              <img
                src={popupProject.image}
                alt={popupProject.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-5 md:p-8">
              <span
                className="inline-block text-xs tracking-widest uppercase text-black/40 mb-3"
                style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.12em' }}
              >
                {popupProject.category}
              </span>

              <h2
                className="text-base md:text-lg font-light text-black mb-2 tracking-wide"
                style={{ fontFamily: 'Marcellus, serif' }}
              >
                {t(`${popupProject.translationKey}_name`)}
              </h2>

              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs text-black/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                  {popupProject.year}
                </span>
                <span className="w-1 h-1 rounded-full bg-black/20" />
                <span className="text-xs text-black/50" style={{ fontFamily: 'Geist, sans-serif' }}>
                  {t(`${popupProject.translationKey}_address`)}
                </span>
              </div>

              <div className="h-px bg-black/10 mb-6" />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setPopupProject(null);
                    navigate(`/projects/${popupProject.slug}`);
                  }}
                  className="px-5 py-2.5 rounded-full bg-black text-white text-sm tracking-wider hover:bg-black/80 transition-colors duration-300 cursor-pointer whitespace-nowrap"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
                >
                  View Full Project
                </button>
                <button
                  onClick={() => {
                    setSelectedProject(popupProject);
                    setPopupProject(null);
                    setViewMode('map');
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-black/20 text-black/60 text-sm tracking-wider hover:border-black/60 hover:text-black transition-colors duration-300 cursor-pointer whitespace-nowrap"
                  style={{ fontFamily: 'Geist, sans-serif', letterSpacing: '0.06em' }}
                >
                  <i className="ri-map-pin-line text-base" />
                  Show on Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
