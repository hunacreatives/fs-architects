import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import StudioCTA from '../studio/components/StudioCTA';
import ProjectHero from './components/ProjectHero';
import ProjectInfo from './components/ProjectInfo';
import ProjectSpecs from './components/ProjectSpecs';
import ProjectLocation from './components/ProjectLocation';
import NextProject from './components/NextProject';

const projectSpecs: Record<string, { plotArea: string; builtArea: string; floors: string; typology: string }> = {
  'metropolitan-healthcare-center': { plotArea: '12,500', builtArea: '8,200',  floors: '6',  typology: 'Healthcare'     },
  'coastal-resort-spa':             { plotArea: '18,000', builtArea: '4,500',  floors: '2',  typology: 'Hospitality'    },
  'urban-living-complex':           { plotArea: '6,800',  builtArea: '22,400', floors: '18', typology: 'Mixed Use'      },
  'tech-hub-office-tower':          { plotArea: '4,200',  builtArea: '35,000', floors: '24', typology: 'Offices'        },
  'hillside-residences':            { plotArea: '9,500',  builtArea: '6,800',  floors: '4',  typology: 'Residential'    },
  'lifestyle-shopping-district':    { plotArea: '24,000', builtArea: '18,500', floors: '3',  typology: 'Retail'         },
  'executive-suite-interiors':      { plotArea: '—',      builtArea: '1,200',  floors: '1',  typology: 'Interior Design'},
  'waterfront-villas':              { plotArea: '15,000', builtArea: '3,600',  floors: '2',  typology: 'Residential'    },
  'city-medical-plaza':             { plotArea: '8,400',  builtArea: '12,000', floors: '8',  typology: 'Healthcare'     },
  'boutique-hotel-downtown':        { plotArea: '2,800',  builtArea: '9,500',  floors: '7',  typology: 'Hospitality'    },
  'innovation-campus':              { plotArea: '32,000', builtArea: '28,000', floors: '5',  typology: 'Mixed Use'      },
  'corporate-headquarters':         { plotArea: '5,600',  builtArea: '42,000', floors: '28', typology: 'Offices'        },
};

const projectsData = [
  {
    id: 1,
    slug: 'metropolitan-healthcare-center',
    translationKey: 'metropolitan_healthcare_center',
    year: '2023',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    heroImage: '/images/projects/proj1-hero.jpg',
    mainImage: '/images/projects/proj1-main.jpg',
    gallery: [
      '/images/projects/proj1-gal-a.jpg',
      '/images/projects/proj1-gal-b.jpg',
      '/images/projects/proj1-gal-c.jpg',
      '/images/projects/proj1-gal-d.jpg',
      '/images/projects/proj1-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj1-fp-a.jpg',
      '/images/projects/proj1-fp-b.jpg',
      '/images/projects/proj1-fp-c.jpg',
    ],
  },
  {
    id: 2,
    slug: 'coastal-resort-spa',
    translationKey: 'coastal_resort_spa',
    year: '2023',
    location: 'Leyte',
    lat: 11.2442,
    lng: 124.9999,
    heroImage: '/images/projects/proj2-hero.jpg',
    mainImage: '/images/projects/proj2-main.jpg',
    gallery: [
      '/images/projects/proj2-gal-a.jpg',
      '/images/projects/proj2-gal-b.jpg',
      '/images/projects/proj2-gal-c.jpg',
      '/images/projects/proj2-gal-d.jpg',
      '/images/projects/proj2-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj2-fp-a.jpg',
      '/images/projects/proj2-fp-b.jpg',
      '/images/projects/proj2-fp-c.jpg',
    ],
  },
  {
    id: 3,
    slug: 'urban-living-complex',
    translationKey: 'urban_living_complex',
    year: '2022',
    location: 'Cebu',
    lat: 10.3157,
    lng: 123.8854,
    heroImage: '/images/projects/proj3-hero.jpg',
    mainImage: '/images/projects/proj3-main.jpg',
    gallery: [
      '/images/projects/proj3-gal-a.jpg',
      '/images/projects/proj3-gal-b.jpg',
      '/images/projects/proj3-gal-c.jpg',
      '/images/projects/proj3-gal-d.jpg',
      '/images/projects/proj3-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj3-fp-a.jpg',
      '/images/projects/proj3-fp-b.jpg',
      '/images/projects/proj3-fp-c.jpg',
    ],
  },
  {
    id: 4,
    slug: 'tech-hub-office-tower',
    translationKey: 'tech_hub_office_tower',
    year: '2023',
    location: 'Manila',
    lat: 14.5502,
    lng: 121.0485,
    heroImage: '/images/projects/proj4-hero.jpg',
    mainImage: '/images/projects/proj4-main.jpg',
    gallery: [
      '/images/projects/proj4-gal-a.jpg',
      '/images/projects/proj4-gal-b.jpg',
      '/images/projects/proj4-gal-c.jpg',
      '/images/projects/proj4-gal-d.jpg',
      '/images/projects/proj4-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj4-fp-a.jpg',
      '/images/projects/proj4-fp-b.jpg',
      '/images/projects/proj4-fp-c.jpg',
    ],
  },
  {
    id: 5,
    slug: 'hillside-residences',
    translationKey: 'hillside_residences',
    year: '2022',
    location: 'Davao',
    lat: 7.1907,
    lng: 125.4553,
    heroImage: '/images/projects/proj5-hero.jpg',
    mainImage: '/images/projects/proj5-main.jpg',
    gallery: [
      '/images/projects/proj5-gal-a.jpg',
      '/images/projects/proj5-gal-b.jpg',
      '/images/projects/proj5-gal-c.jpg',
      '/images/projects/proj5-gal-d.jpg',
      '/images/projects/proj5-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj5-fp-a.jpg',
      '/images/projects/proj5-fp-b.jpg',
      '/images/projects/proj5-fp-c.jpg',
    ],
  },
  {
    id: 6,
    slug: 'lifestyle-shopping-district',
    translationKey: 'lifestyle_shopping_district',
    year: '2023',
    location: 'CDO',
    lat: 8.4542,
    lng: 124.6319,
    heroImage: '/images/projects/proj6-hero.jpg',
    mainImage: '/images/projects/proj6-main.jpg',
    gallery: [
      '/images/projects/proj6-gal-a.jpg',
      '/images/projects/proj6-gal-b.jpg',
      '/images/projects/proj6-gal-c.jpg',
      '/images/projects/proj6-gal-d.jpg',
      '/images/projects/proj6-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj6-fp-a.jpg',
      '/images/projects/proj6-fp-b.jpg',
      '/images/projects/proj6-fp-c.jpg',
    ],
  },
  {
    id: 7,
    slug: 'executive-suite-interiors',
    translationKey: 'executive_suite_interiors',
    year: '2023',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    heroImage: '/images/projects/proj7-hero.jpg',
    mainImage: '/images/projects/proj7-main.jpg',
    gallery: [
      '/images/projects/proj7-gal-a.jpg',
      '/images/projects/proj7-gal-b.jpg',
      '/images/projects/proj7-gal-c.jpg',
      '/images/projects/proj7-gal-d.jpg',
      '/images/projects/proj7-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj7-fp-a.jpg',
      '/images/projects/proj7-fp-b.jpg',
      '/images/projects/proj7-fp-c.jpg',
    ],
  },
  {
    id: 8,
    slug: 'waterfront-villas',
    translationKey: 'waterfront_villas',
    year: '2022',
    location: 'Zamboanga',
    lat: 6.9214,
    lng: 122.0790,
    heroImage: '/images/projects/proj8-hero.jpg',
    mainImage: '/images/projects/proj8-main.jpg',
    gallery: [
      '/images/projects/proj8-gal-a.jpg',
      '/images/projects/proj8-gal-b.jpg',
      '/images/projects/proj8-gal-c.jpg',
      '/images/projects/proj8-gal-d.jpg',
      '/images/projects/proj8-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj8-fp-a.jpg',
      '/images/projects/proj8-fp-b.jpg',
      '/images/projects/proj8-fp-c.jpg',
    ],
  },
  {
    id: 9,
    slug: 'city-medical-plaza',
    translationKey: 'city_medical_plaza',
    year: '2022',
    location: 'Cebu',
    lat: 10.3157,
    lng: 123.8854,
    heroImage: '/images/projects/proj9-hero.jpg',
    mainImage: '/images/projects/proj9-main.jpg',
    gallery: [
      '/images/projects/proj9-gal-a.jpg',
      '/images/projects/proj9-gal-b.jpg',
      '/images/projects/proj9-gal-c.jpg',
      '/images/projects/proj9-gal-d.jpg',
      '/images/projects/proj9-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj9-fp-a.jpg',
      '/images/projects/proj9-fp-b.jpg',
      '/images/projects/proj9-fp-c.jpg',
    ],
  },
  {
    id: 10,
    slug: 'boutique-hotel-downtown',
    translationKey: 'boutique_hotel_downtown',
    year: '2023',
    location: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    heroImage: '/images/projects/proj10-hero.jpg',
    mainImage: '/images/projects/proj10-main.jpg',
    gallery: [
      '/images/projects/proj10-gal-a.jpg',
      '/images/projects/proj10-gal-b.jpg',
      '/images/projects/proj10-gal-c.jpg',
      '/images/projects/proj10-gal-d.jpg',
      '/images/projects/proj10-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj10-fp-a.jpg',
      '/images/projects/proj10-fp-b.jpg',
      '/images/projects/proj10-fp-c.jpg',
    ],
  },
  {
    id: 11,
    slug: 'innovation-campus',
    translationKey: 'innovation_campus',
    year: '2023',
    location: 'Davao',
    lat: 7.1907,
    lng: 125.4553,
    heroImage: '/images/projects/proj11-hero.jpg',
    mainImage: '/images/projects/proj11-main.jpg',
    gallery: [
      '/images/projects/proj11-gal-a.jpg',
      '/images/projects/proj11-gal-b.jpg',
      '/images/projects/proj11-gal-c.jpg',
      '/images/projects/proj11-gal-d.jpg',
      '/images/projects/proj11-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj11-fp-a.jpg',
      '/images/projects/proj11-fp-b.jpg',
      '/images/projects/proj11-fp-c.jpg',
    ],
  },
  {
    id: 12,
    slug: 'corporate-headquarters',
    translationKey: 'corporate_headquarters',
    year: '2022',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    heroImage: '/images/projects/proj12-hero.jpg',
    mainImage: '/images/projects/proj12-main.jpg',
    gallery: [
      '/images/projects/proj12-gal-a.jpg',
      '/images/projects/proj12-gal-b.jpg',
      '/images/projects/proj12-gal-c.jpg',
      '/images/projects/proj12-gal-d.jpg',
      '/images/projects/proj12-gal-e.jpg',
    ],
    floorPlanImages: [
      '/images/projects/proj12-fp-a.jpg',
      '/images/projects/proj12-fp-b.jpg',
      '/images/projects/proj12-fp-c.jpg',
    ],
  },
];

export { projectsData };

export default function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const project = projectsData.find((p) => p.slug === slug);

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

  const tk = project.translationKey;
  const name = t(`proj_${tk}_name`);
  const address = t(`proj_${tk}_address`);
  const category = t(`proj_${tk}_category`);
  const description = t(`proj_${tk}_description`);
  const floorPlans = project.floorPlanImages.map((img, i) => ({
    label: t(`proj_${tk}_fp${i}`),
    image: img,
  }));

  const currentIndex = projectsData.findIndex((p) => p.slug === slug);
  const nextProject = projectsData[(currentIndex + 1) % projectsData.length];
  const prevProject = projectsData[(currentIndex - 1 + projectsData.length) % projectsData.length];
  const nextName = t(`proj_${nextProject.translationKey}_name`);
  const prevName = t(`proj_${prevProject.translationKey}_name`);
  const specs = projectSpecs[project.slug];

  return (
    <div className="min-h-screen bg-white">
      <Navigation theme="light" />

      <ProjectHero
        name={name}
        image={project.heroImage}
        index={currentIndex}
        total={projectsData.length}
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
        name={name}
        description={description}
        mainImage={project.mainImage}
        galleryImages={project.gallery}
        plans={floorPlans}
      />

      <div className="pb-8 md:pb-14" />

      <ProjectLocation
        lat={project.lat}
        lng={project.lng}
        name={name}
      />

      <NextProject
        slug={nextProject.slug}
        name={nextName}
        location={nextProject.location}
        heroImage={nextProject.heroImage}
        prevSlug={prevProject.slug}
        prevName={prevName}
      />

      <StudioCTA />
      <ContactFooter hideContactBar />
    </div>
  );
}
