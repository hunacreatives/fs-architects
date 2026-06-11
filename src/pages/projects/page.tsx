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
    slug: 'mallberry-platinum-hall-lounge',
    translationKey: 'proj_mallberry_platinum_hall_lounge',
    name: 'Mallberry Platinum Hall & Lounge',
    year: '2023',
    address: 'Cagayan de Oro City',
    category: 'Interior Design',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/mallberry-thumb.webp',
  },
  {
    id: 2,
    slug: 'abucay-beach-house',
    translationKey: 'proj_abucay_beach_house',
    name: 'Abucay Beach House',
    year: '2024',
    address: 'Abucay, Bataan',
    category: 'Residential',
    location: 'Bataan',
    lat: 14.7270,
    lng: 120.5332,
    image: '/images/projects/abucay-thumb.webp',
  },
  {
    id: 3,
    slug: 'amelia-nail-salon',
    translationKey: 'proj_amelia_nail_salon',
    name: 'Amelia Nail Salon',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Interior Design',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/amelia-nail-salon-thumb.webp',
  },
  {
    id: 4,
    slug: 'bacolod-showroom',
    translationKey: 'proj_bacolod_showroom',
    name: 'Bacolod Showroom',
    year: '2024',
    address: 'Bacolod City',
    category: 'Retail',
    location: 'Bacolod',
    lat: 10.6768,
    lng: 122.9564,
    image: '/images/projects/bacolod-showroom-thumb.webp',
  },
  {
    id: 5,
    slug: 'bc-cdo',
    translationKey: 'proj_bc_cdo',
    name: 'BC CDO',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Mixed Use',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/bc-cdo-thumb.webp',
  },
  {
    id: 6,
    slug: 'byd-cdo',
    translationKey: 'proj_byd_cdo',
    name: 'BYD CDO',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Retail',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/byd-cdo-thumb.webp',
  },
  {
    id: 7,
    slug: 'byd-tagum',
    translationKey: 'proj_byd_tagum',
    name: 'BYD Tagum',
    year: '2024',
    address: 'Tagum City, Davao del Norte',
    category: 'Retail',
    location: 'Tagum',
    lat: 7.4478,
    lng: 125.8086,
    image: '/images/projects/byd-tagum-thumb.webp',
  },
  {
    id: 8,
    slug: 'byd-zamboanga',
    translationKey: 'proj_byd_zamboanga',
    name: 'BYD Zamboanga',
    year: '2024',
    address: 'Zamboanga City',
    category: 'Retail',
    location: 'Zamboanga',
    lat: 6.9214,
    lng: 122.079,
    image: '/images/projects/byd-zamboanga-thumb.webp',
  },
  {
    id: 9,
    slug: 'chiong-clinic',
    translationKey: 'proj_chiong_clinic',
    name: 'Chiong Clinic',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Healthcare',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/chiong-clinic-thumb.webp',
  },
  {
    id: 10,
    slug: 'chiu-office',
    translationKey: 'proj_chiu_office',
    name: 'Chiu Office',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Offices',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/chiu-office-thumb.webp',
  },
  {
    id: 11,
    slug: 'davao-showroom',
    translationKey: 'proj_davao_showroom',
    name: 'Davao Showroom',
    year: '2024',
    address: 'Davao City',
    category: 'Retail',
    location: 'Davao',
    lat: 7.1907,
    lng: 125.4553,
    image: '/images/projects/davao-showroom-thumb.webp',
  },
  {
    id: 12,
    slug: 'foxhome',
    translationKey: 'proj_foxhome',
    name: 'Foxhome Projects',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/foxhome-thumb.webp',
  },
  {
    id: 13,
    slug: 'kaway-resort',
    translationKey: 'proj_kaway_resort',
    name: 'Kaway Resort',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/kaway-resort-thumb.webp',
  },
  {
    id: 14,
    slug: 'palm-residences',
    translationKey: 'proj_palm_residences',
    name: 'Palm Residences',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/palm-residences-thumb.webp',
  },
  {
    id: 15,
    slug: 'palm-sands',
    translationKey: 'proj_palm_sands',
    name: 'Palm Sands Pool & Lounge',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/palm-sands-thumb.webp',
  },
  {
    id: 16,
    slug: 'rc-mandani-loft',
    translationKey: 'proj_rc_mandani_loft',
    name: 'RC Mandani Loft',
    year: '2024',
    address: 'Mandaue City, Cebu',
    category: 'Residential',
    location: 'Cebu',
    lat: 10.3157,
    lng: 123.9223,
    image: '/images/projects/rc-mandani-loft-thumb.webp',
  },
  {
    id: 17,
    slug: 'rosales-residence',
    translationKey: 'proj_rosales_residence',
    name: 'Rosales Residence',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/rosales-residence-thumb.webp',
  },
  {
    id: 18,
    slug: 'squareview',
    translationKey: 'proj_squareview',
    name: 'Squareview',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Mixed Use',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/squareview-thumb.webp',
  },
  {
    id: 19,
    slug: 'vmc-admin',
    translationKey: 'proj_vmc_admin',
    name: 'VMC Administration Interiors',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Offices',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/vmc-admin-thumb.webp',
  },
  {
    id: 20,
    slug: 'vmc-housing',
    translationKey: 'proj_vmc_housing',
    name: 'VMC Housing',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/vmc-housing-thumb.webp',
  },
  {
    id: 21,
    slug: 'vmc-projects',
    translationKey: 'proj_vmc_projects',
    name: 'VMC Projects',
    year: '2024',
    address: 'Cagayan de Oro City',
    category: 'Mixed Use',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/vmc-projects-thumb.webp',
  },
  {
    id: 22,
    slug: 'choa-unit-16c',
    translationKey: 'proj_choa_unit_16c',
    name: 'CHOA Condominium Unit 16C',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/choa-unit-16c-thumb.webp',
  },
  {
    id: 23,
    slug: 'graphic-junior-hotel',
    translationKey: 'proj_graphic_junior_hotel',
    name: 'Graphic Junior Hotel CDO',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/graphic-junior-hotel-thumb.webp',
  },
  {
    id: 24,
    slug: 'cafe-207',
    translationKey: 'proj_cafe_207',
    name: '207 Cafe',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/cafe-207-thumb.webp',
  },
  {
    id: 25,
    slug: 'byd-butuan',
    translationKey: 'proj_byd_butuan',
    name: 'BYD Butuan',
    year: '2025',
    address: 'Butuan City',
    category: 'Retail',
    location: 'Butuan',
    lat: 8.9475,
    lng: 125.5406,
    image: '/images/projects/byd-butuan-thumb.webp',
  },
  {
    id: 26,
    slug: 'byd-c5-acropolis',
    translationKey: 'proj_byd_c5_acropolis',
    name: 'BYD C5 Acropolis',
    year: '2025',
    address: 'Quezon City',
    category: 'Retail',
    location: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    image: '/images/projects/byd-c5-acropolis-thumb.webp',
  },
  {
    id: 27,
    slug: 'byd-iligan',
    translationKey: 'proj_byd_iligan',
    name: 'BYD Iligan',
    year: '2025',
    address: 'Iligan City',
    category: 'Retail',
    location: 'Iligan',
    lat: 8.228,
    lng: 124.2452,
    image: '/images/projects/byd-iligan-thumb.webp',
  },
  {
    id: 28,
    slug: 'byd-marikina',
    translationKey: 'proj_byd_marikina',
    name: 'BYD Marikina',
    year: '2025',
    address: 'Marikina City',
    category: 'Retail',
    location: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    image: '/images/projects/byd-marikina-thumb.webp',
  },
  {
    id: 29,
    slug: 'balisbis-residence',
    translationKey: 'proj_balisbis_residence',
    name: 'Balisbis Residence',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/balisbis-residence-thumb.webp',
  },
  {
    id: 30,
    slug: 'bellarie-office',
    translationKey: 'proj_bellarie_office',
    name: 'Bellarie Office',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Offices',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/bellarie-office-thumb.webp',
  },
  {
    id: 31,
    slug: 'blush',
    translationKey: 'proj_blush',
    name: 'Blush',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Interior Design',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/blush-thumb.webp',
  },
  {
    id: 32,
    slug: 'dasmarinas-residence',
    translationKey: 'proj_dasmarinas_residence',
    name: 'Dasmarinas Cavite Residence',
    year: '2025',
    address: 'Dasmarinas, Cavite',
    category: 'Residential',
    location: 'Cavite',
    lat: 14.3294,
    lng: 120.9367,
    image: '/images/projects/dasmarinas-residence-thumb.webp',
  },
  {
    id: 33,
    slug: 'denza-showroom',
    translationKey: 'proj_denza_showroom',
    name: 'Denza Showroom',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Retail',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/denza-showroom-thumb.webp',
  },
  {
    id: 34,
    slug: 'foxhomes-2025',
    translationKey: 'proj_foxhomes_2025',
    name: 'Foxhomes 2025',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/foxhomes-2025-thumb.webp',
  },
  {
    id: 35,
    slug: 'graphic-annex',
    translationKey: 'proj_graphic_annex',
    name: 'Graphic Annex',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/graphic-annex-thumb.webp',
  },
  {
    id: 36,
    slug: 'ozamiz-dialysis-center',
    translationKey: 'proj_ozamiz_dialysis_center',
    name: 'Ozamiz Dialysis Center',
    year: '2025',
    address: 'Ozamiz City',
    category: 'Healthcare',
    location: 'Ozamiz',
    lat: 8.15,
    lng: 123.85,
    image: '/images/projects/ozamiz-dialysis-center-thumb.webp',
  },
  {
    id: 37,
    slug: 'raintree-beauty-clinic',
    translationKey: 'proj_raintree_beauty_clinic',
    name: 'Raintree Mall Beauty Clinic',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Interior Design',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/raintree-beauty-clinic-thumb.webp',
  },
  {
    id: 38,
    slug: 'sanjus-diagnostics',
    translationKey: 'proj_sanjus_diagnostics',
    name: 'Sanjus Diagnostics',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Healthcare',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/sanjus-diagnostics-thumb.webp',
  },
  {
    id: 39,
    slug: 'sorana-island-villas',
    translationKey: 'proj_sorana_island_villas',
    name: 'Sorana Island Villas',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Hospitality',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/sorana-island-villas-thumb.webp',
  },
  {
    id: 40,
    slug: 'sytin-projects',
    translationKey: 'proj_sytin_projects',
    name: 'Sytin Projects',
    year: '2025',
    address: 'Metro Manila',
    category: 'Retail',
    location: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    image: '/images/projects/sytin-projects-thumb.webp',
  },
  {
    id: 41,
    slug: 'tabas',
    translationKey: 'proj_tabas',
    name: 'Tabas',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/tabas-thumb.webp',
  },
  {
    id: 42,
    slug: 'vmc-projects-2025',
    translationKey: 'proj_vmc_projects_2025',
    name: 'VMC Sugar Milling Projects',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Mixed Use',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/vmc-projects-2025-thumb.webp',
  },
  {
    id: 43,
    slug: 'yang-residence',
    translationKey: 'proj_yang_residence',
    name: 'Yang Residence',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/yang-residence-thumb.webp',
  },
  {
    id: 44,
    slug: 'yap-residences-interiors',
    translationKey: 'proj_yap_residences_interiors',
    name: 'Yap Residences Interiors',
    year: '2025',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/yap-residences-interiors-thumb.webp',
  },
  {
    id: 45,
    slug: 'baic-radar-cdo',
    translationKey: 'proj_baic_radar_cdo',
    name: 'BAIC Radar CDO',
    year: '2026',
    address: 'Cagayan de Oro City',
    category: 'Retail',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/baic-radar-cdo-thumb.webp',
  },
  {
    id: 46,
    slug: 'chen-residence',
    translationKey: 'proj_chen_residence',
    name: 'Chen Residence',
    year: '2026',
    address: 'Cagayan de Oro City',
    category: 'Residential',
    location: 'CDO',
    lat: 8.4797,
    lng: 124.6525,
    image: '/images/projects/chen-residence-thumb.webp',
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
  const [selectedProject, setSelectedProject] = useState<typeof mockProjects[0] | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const batchStartRef = useRef(0);
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
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {sortedProjects.slice(0, visibleCount).map((project, idx) => {
                const batchIdx = idx - batchStartRef.current;
                const delay = batchIdx >= 0 ? `${Math.min(batchIdx * 0.06, 0.28)}s` : '0s';
                return (
                <div
                  key={project.id}
                  className={`proj-card group transition-all duration-300 overflow-hidden rounded-xl ${
                    selectedProject?.id === project.id ? 'opacity-100 ring-2 ring-black/20 shadow-lg shadow-black/15' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ animationDelay: delay }}
                >
                  <div
                    className="w-full aspect-[4/3] overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() => { sessionStorage.setItem('projects_return_to_grid', '1'); navigate(`/projects/${project.slug}`); }}
                  >
                    <img
                      src={project.image.replace('-thumb.webp', '-hero.webp')}
                      alt={project.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2 px-3 py-3" style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <div className="cursor-pointer min-w-0" onClick={() => { sessionStorage.setItem('projects_return_to_grid', '1'); navigate(`/projects/${project.slug}`); }}>
                      <h3
                        className="text-sm font-medium text-navy mb-0.5 tracking-wide truncate"
                        style={{ fontFamily: 'Marcellus, serif', maxWidth: '160px' }}
                        title={t(`${project.translationKey}_name`)}
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
                        projectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                );
              })}
            </div>

            <div className="flex items-center justify-end mt-8 mb-4 gap-4">
              {visibleCount < sortedProjects.length && (
                <button
                  onClick={() => { batchStartRef.current = visibleCount; setVisibleCount((prev) => Math.min(prev + 8, sortedProjects.length)); }}
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

      {projectsVisible && <div className="pb-16"><StudioCTA /></div>}
      <ContactFooter hideContactBar />

    </div>
  );
}
