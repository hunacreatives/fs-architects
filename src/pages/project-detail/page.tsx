
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Navigation from '../../components/feature/Navigation';
import ContactFooter from '../contact/components/ContactFooter';
import ProjectHero from './components/ProjectHero';
import ProjectInfo from './components/ProjectInfo';
import ProjectLocation from './components/ProjectLocation';
import NextProject from './components/NextProject';

const projectsData = [
  {
    id: 1,
    slug: 'metropolitan-healthcare-center',
    translationKey: 'metropolitan_healthcare_center',
    year: '2023',
    location: 'Manila',
    lat: 14.5547,
    lng: 121.0244,
    heroImage: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20healthcare%20building%20exterior%20with%20clean%20white%20facade%20and%20large%20glass%20windows%2C%20simple%20background%2C%20architectural%20photography%20style%2C%20professional%20composition%2C%20natural%20daylight%2C%20contemporary%20medical%20facility%20design%2C%20wide%20angle%20view%20showing%20full%20building&width=1600&height=900&seq=hero1&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20healthcare%20building%20exterior%20with%20clean%20white%20facade%20and%20large%20glass%20windows%2C%20simple%20background%2C%20architectural%20photography%20style%2C%20professional%20composition%2C%20natural%20daylight%2C%20contemporary%20medical%20facility%20design&width=800&height=600&seq=main1&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=modern%20healthcare%20building%20interior%20lobby%20with%20natural%20light%20and%20clean%20white%20walls%2C%20minimalist%20design%2C%20architectural%20photography&width=400&height=300&seq=gal1a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=healthcare%20building%20corridor%20with%20large%20windows%20and%20natural%20light%2C%20minimalist%20interior%20design%2C%20architectural%20photography&width=400&height=300&seq=gal1b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20medical%20facility%20exterior%20detail%20with%20glass%20facade%20and%20clean%20lines%2C%20architectural%20photography&width=400&height=300&seq=gal1c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=healthcare%20building%20rooftop%20garden%20with%20greenery%20and%20modern%20architecture%2C%20minimalist%20design&width=400&height=300&seq=gal1d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20hospital%20waiting%20area%20with%20natural%20light%20and%20minimalist%20furniture%2C%20clean%20interior%20design&width=400&height=300&seq=gal1e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20healthcare%20building%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp1a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20healthcare%20building%20second%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp1b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20healthcare%20building%20third%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp1c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20resort%20building%20with%20natural%20materials%20and%20open%20design%2C%20tropical%20coastal%20background%2C%20architectural%20photography%2C%20clean%20lines%2C%20contemporary%20hospitality%20architecture%2C%20warm%20natural%20lighting%2C%20wide%20panoramic%20view&width=1600&height=900&seq=hero2&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20resort%20building%20with%20natural%20materials%20and%20open%20design%2C%20simple%20tropical%20background%2C%20architectural%20photography%2C%20clean%20lines%2C%20contemporary%20hospitality%20architecture%2C%20warm%20natural%20lighting&width=800&height=600&seq=main2&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=resort%20pool%20area%20with%20minimalist%20design%20and%20tropical%20landscape%2C%20architectural%20photography&width=400&height=300&seq=gal2a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=resort%20villa%20interior%20with%20natural%20materials%20and%20ocean%20view%2C%20minimalist%20tropical%20design&width=400&height=300&seq=gal2b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=spa%20pavilion%20with%20natural%20stone%20and%20wood%20materials%2C%20minimalist%20design%2C%20tropical%20setting&width=400&height=300&seq=gal2c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=resort%20outdoor%20dining%20area%20with%20natural%20materials%20and%20tropical%20landscape%2C%20architectural%20photography&width=400&height=300&seq=gal2d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=coastal%20resort%20building%20exterior%20at%20sunset%20with%20natural%20materials%2C%20minimalist%20architecture&width=400&height=300&seq=gal2e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20site%20plan%20drawing%20of%20resort%20complex%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp2a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20resort%20villa%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp2b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20spa%20pavilion%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp2c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=contemporary%20mixed-use%20building%20with%20residential%20and%20commercial%20spaces%2C%20minimalist%20facade%20design%2C%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20materials%2C%20clean%20composition%2C%20wide%20angle%20view&width=1600&height=900&seq=hero3&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=contemporary%20mixed-use%20building%20with%20residential%20and%20commercial%20spaces%2C%20minimalist%20facade%20design%2C%20simple%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20materials%2C%20clean%20composition&width=800&height=600&seq=main3&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=mixed-use%20building%20lobby%20interior%20with%20modern%20design%20and%20natural%20light%2C%20architectural%20photography&width=400&height=300&seq=gal3a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=urban%20plaza%20with%20modern%20architecture%20and%20landscaping%2C%20minimalist%20design&width=400&height=300&seq=gal3b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=residential%20tower%20facade%20detail%20with%20balconies%20and%20modern%20materials%2C%20architectural%20photography&width=400&height=300&seq=gal3c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=retail%20podium%20with%20modern%20architecture%20and%20pedestrian%20arcade%2C%20urban%20design&width=400&height=300&seq=gal3d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=rooftop%20amenity%20deck%20of%20mixed-use%20building%20with%20city%20views%2C%20modern%20design&width=400&height=300&seq=gal3e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20mixed-use%20building%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp3a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20residential%20tower%20typical%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp3b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20retail%20podium%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp3c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=sleek%20modern%20office%20building%20with%20glass%20curtain%20wall%20facade%2C%20minimalist%20design%2C%20simple%20sky%20background%2C%20architectural%20photography%2C%20contemporary%20corporate%20architecture%2C%20professional%20lighting%2C%20wide%20angle%20full%20building%20view&width=1600&height=900&seq=hero4&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=sleek%20modern%20office%20building%20with%20glass%20curtain%20wall%20facade%2C%20minimalist%20design%2C%20simple%20sky%20background%2C%20architectural%20photography%2C%20contemporary%20corporate%20architecture%2C%20professional%20lighting&width=800&height=600&seq=main4&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=modern%20office%20building%20lobby%20with%20glass%20and%20steel%20design%2C%20minimalist%20interior%2C%20architectural%20photography&width=400&height=300&seq=gal4a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=office%20building%20sky%20garden%20with%20greenery%20and%20city%20views%2C%20modern%20architecture&width=400&height=300&seq=gal4b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=glass%20curtain%20wall%20facade%20detail%20of%20modern%20office%20building%2C%20architectural%20photography&width=400&height=300&seq=gal4c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20open%20plan%20office%20interior%20with%20natural%20light%20and%20minimalist%20design&width=400&height=300&seq=gal4d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=office%20building%20rooftop%20terrace%20with%20city%20skyline%20views%2C%20modern%20architecture&width=400&height=300&seq=gal4e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20office%20tower%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp4a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20typical%20office%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp4b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20sky%20garden%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp4c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20residential%20building%20with%20clean%20geometric%20forms%2C%20natural%20hillside%20background%2C%20architectural%20photography%20style%2C%20contemporary%20housing%20design%2C%20soft%20natural%20lighting%2C%20wide%20panoramic%20view&width=1600&height=900&seq=hero5&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=modern%20minimalist%20residential%20building%20with%20clean%20geometric%20forms%2C%20simple%20natural%20background%2C%20architectural%20photography%20style%2C%20contemporary%20housing%20design%2C%20soft%20natural%20lighting&width=800&height=600&seq=main5&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=residential%20building%20terrace%20with%20city%20views%20and%20natural%20materials%2C%20minimalist%20design&width=400&height=300&seq=gal5a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20residential%20interior%20with%20natural%20light%20and%20minimalist%20design%2C%20architectural%20photography&width=400&height=300&seq=gal5b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=residential%20building%20facade%20with%20board-formed%20concrete%20and%20wood%20details%2C%20architectural%20photography&width=400&height=300&seq=gal5c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=hillside%20residential%20complex%20with%20terraced%20design%20and%20natural%20landscape&width=400&height=300&seq=gal5d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20residential%20common%20area%20with%20natural%20materials%20and%20greenery%2C%20minimalist%20design&width=400&height=300&seq=gal5e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20site%20plan%20drawing%20of%20hillside%20residential%20complex%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp5a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20residential%20unit%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp5b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20terrace%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp5c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=contemporary%20retail%20complex%20with%20open%20plaza%20design%2C%20minimalist%20commercial%20architecture%2C%20simple%20background%2C%20architectural%20photography%2C%20modern%20shopping%20center%2C%20bright%20daylight%2C%20wide%20angle%20view&width=1600&height=900&seq=hero6&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=contemporary%20retail%20complex%20with%20open%20plaza%20design%2C%20minimalist%20commercial%20architecture%2C%20simple%20background%2C%20architectural%20photography%2C%20modern%20shopping%20center%2C%20bright%20daylight&width=800&height=600&seq=main6&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=open-air%20retail%20plaza%20with%20modern%20architecture%20and%20landscaping%2C%20architectural%20photography&width=400&height=300&seq=gal6a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=retail%20pavilion%20interior%20with%20natural%20light%20and%20modern%20design%2C%20architectural%20photography&width=400&height=300&seq=gal6b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=shopping%20district%20promenade%20with%20trees%20and%20modern%20architecture%2C%20architectural%20photography&width=400&height=300&seq=gal6c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=retail%20complex%20water%20feature%20and%20central%20plaza%2C%20modern%20architecture&width=400&height=300&seq=gal6d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20retail%20building%20facade%20with%20local%20craft%20elements%2C%20architectural%20photography&width=400&height=300&seq=gal6e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20site%20plan%20drawing%20of%20retail%20district%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp6a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20retail%20complex%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp6b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20retail%20complex%20upper%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp6c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=minimalist%20modern%20interior%20space%20with%20clean%20lines%20and%20natural%20materials%2C%20simple%20elegant%20design%2C%20architectural%20interior%20photography%2C%20contemporary%20executive%20office%20interior%2C%20soft%20ambient%20lighting%2C%20wide%20view&width=1600&height=900&seq=hero7&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=minimalist%20modern%20interior%20space%20with%20clean%20lines%20and%20natural%20materials%2C%20simple%20elegant%20design%2C%20architectural%20interior%20photography%2C%20contemporary%20office%20interior%2C%20soft%20ambient%20lighting&width=800&height=600&seq=main7&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=executive%20office%20interior%20with%20dark%20walnut%20and%20brass%20details%2C%20minimalist%20design&width=400&height=300&seq=gal7a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20boardroom%20interior%20with%20marble%20and%20wood%20materials%2C%20minimalist%20design&width=400&height=300&seq=gal7b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=corporate%20reception%20area%20with%20minimalist%20design%20and%20natural%20materials&width=400&height=300&seq=gal7c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=executive%20lounge%20interior%20with%20custom%20furniture%20and%20art%2C%20minimalist%20design&width=400&height=300&seq=gal7d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20office%20corridor%20with%20natural%20light%20and%20minimalist%20design%2C%20architectural%20photography&width=400&height=300&seq=gal7e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20executive%20office%20suite%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp7a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20boardroom%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp7b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20reception%20and%20lounge%20area%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp7c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20villa%20architecture%20with%20natural%20stone%20and%20wood%2C%20coastal%20background%2C%20architectural%20photography%20style%2C%20contemporary%20residential%20design%2C%20warm%20natural%20light%2C%20wide%20panoramic%20view&width=1600&height=900&seq=hero8&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=elegant%20minimalist%20villa%20architecture%20with%20natural%20stone%20and%20wood%2C%20simple%20coastal%20background%2C%20architectural%20photography%20style%2C%20contemporary%20residential%20design%2C%20warm%20natural%20light&width=800&height=600&seq=main8&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=waterfront%20villa%20with%20pool%20and%20ocean%20views%2C%20minimalist%20design%2C%20architectural%20photography&width=400&height=300&seq=gal8a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=villa%20interior%20with%20natural%20materials%20and%20ocean%20view%2C%20minimalist%20tropical%20design&width=400&height=300&seq=gal8b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=villa%20courtyard%20garden%20with%20terracotta%20and%20natural%20stone%2C%20architectural%20photography&width=400&height=300&seq=gal8c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=waterfront%20villa%20exterior%20at%20sunset%20with%20natural%20materials%2C%20minimalist%20architecture&width=400&height=300&seq=gal8d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=villa%20colonnade%20with%20arched%20design%20and%20tropical%20landscape%2C%20architectural%20photography&width=400&height=300&seq=gal8e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20site%20plan%20drawing%20of%20waterfront%20villas%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp8a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20villa%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp8b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20villa%20upper%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp8c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=modern%20healthcare%20facility%20with%20clean%20white%20exterior%20and%20glass%20elements%2C%20minimalist%20medical%20building%20design%2C%20simple%20background%2C%20architectural%20photography%2C%20professional%20composition%2C%20wide%20angle%20view&width=1600&height=900&seq=hero9&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=modern%20healthcare%20facility%20with%20clean%20white%20exterior%20and%20glass%20elements%2C%20minimalist%20medical%20building%20design%2C%20simple%20background%2C%20architectural%20photography%2C%20professional%20composition&width=800&height=600&seq=main9&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=medical%20plaza%20atrium%20with%20natural%20light%20and%20clean%20design%2C%20architectural%20photography&width=400&height=300&seq=gal9a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=healthcare%20building%20facade%20with%20perforated%20aluminum%20panels%2C%20architectural%20photography&width=400&height=300&seq=gal9b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=medical%20facility%20waiting%20area%20with%20natural%20light%20and%20minimalist%20design&width=400&height=300&seq=gal9c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=healthcare%20building%20exterior%20detail%20with%20brise-soleil%20system%2C%20architectural%20photography&width=400&height=300&seq=gal9d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=modern%20medical%20facility%20entrance%20with%20clean%20design%20and%20natural%20materials&width=400&height=300&seq=gal9e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20medical%20plaza%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp9a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20medical%20plaza%20second%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp9b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20section%20drawing%20of%20medical%20building%20atrium%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp9c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=contemporary%20boutique%20hotel%20building%20with%20elegant%20minimalist%20facade%2C%20simple%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20hospitality%20design%2C%20sophisticated%20lighting%2C%20wide%20angle%20view&width=1600&height=900&seq=hero10&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=contemporary%20boutique%20hotel%20building%20with%20elegant%20minimalist%20facade%2C%20simple%20urban%20background%2C%20architectural%20photography%20style%2C%20modern%20hospitality%20design%2C%20sophisticated%20lighting&width=800&height=600&seq=main10&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=boutique%20hotel%20lobby%20with%20heritage%20elements%20and%20modern%20design%2C%20architectural%20photography&width=400&height=300&seq=gal10a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=hotel%20guest%20room%20with%20historical%20inspiration%20and%20modern%20minimalist%20design&width=400&height=300&seq=gal10b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=boutique%20hotel%20courtyard%20with%20heritage%20building%20and%20modern%20extension%2C%20architectural%20photography&width=400&height=300&seq=gal10c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=hotel%20restaurant%20interior%20with%20heritage%20elements%20and%20contemporary%20design&width=400&height=300&seq=gal10d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=boutique%20hotel%20rooftop%20bar%20with%20city%20views%20and%20modern%20design&width=400&height=300&seq=gal10e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20boutique%20hotel%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp10a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20hotel%20typical%20guest%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp10b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20hotel%20rooftop%20level%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp10c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=modern%20campus%20building%20with%20mixed-use%20design%2C%20minimalist%20contemporary%20architecture%2C%20simple%20landscape%20background%2C%20architectural%20photography%2C%20clean%20geometric%20forms%2C%20wide%20angle%20view&width=1600&height=900&seq=hero11&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=modern%20campus%20building%20with%20mixed-use%20design%2C%20minimalist%20contemporary%20architecture%2C%20simple%20landscape%20background%2C%20architectural%20photography%2C%20clean%20geometric%20forms&width=800&height=600&seq=main11&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=innovation%20campus%20central%20green%20spine%20with%20modern%20buildings%2C%20architectural%20photography&width=400&height=300&seq=gal11a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=campus%20laboratory%20building%20interior%20with%20modern%20design%20and%20natural%20light&width=400&height=300&seq=gal11b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=campus%20covered%20walkway%20with%20exposed%20concrete%20and%20steel%2C%20architectural%20photography&width=400&height=300&seq=gal11c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=innovation%20campus%20outdoor%20collaboration%20space%20with%20modern%20architecture&width=400&height=300&seq=gal11d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=campus%20building%20facade%20with%20exposed%20concrete%20and%20glazing%2C%20architectural%20photography&width=400&height=300&seq=gal11e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20masterplan%20drawing%20of%20innovation%20campus%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp11a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20laboratory%20building%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp11b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20studio%20building%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp11c&orientation=landscape',
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
    heroImage: 'https://readdy.ai/api/search-image?query=prestigious%20office%20building%20with%20minimalist%20glass%20and%20steel%20facade%2C%20simple%20sky%20background%2C%20architectural%20photography%20style%2C%20contemporary%20corporate%20design%2C%20professional%20composition%2C%20wide%20angle%20full%20building%20view&width=1600&height=900&seq=hero12&orientation=landscape',
    mainImage: 'https://readdy.ai/api/search-image?query=prestigious%20office%20building%20with%20minimalist%20glass%20and%20steel%20facade%2C%20simple%20sky%20background%2C%20architectural%20photography%20style%2C%20contemporary%20corporate%20design%2C%20professional%20composition&width=800&height=600&seq=main12&orientation=landscape',
    gallery: [
      'https://readdy.ai/api/search-image?query=corporate%20headquarters%20lobby%20with%20premium%20materials%20and%20modern%20design%2C%20architectural%20photography&width=400&height=300&seq=gal12a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=office%20tower%20facade%20detail%20with%20solar%20shading%20fins%2C%20architectural%20photography&width=400&height=300&seq=gal12b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=corporate%20office%20interior%20with%20premium%20finishes%20and%20natural%20light%2C%20architectural%20photography&width=400&height=300&seq=gal12c&orientation=landscape',
      'https://readdy.ai/api/search-image?query=office%20building%20crown%20detail%20at%20night%20with%20city%20lights%2C%20architectural%20photography&width=400&height=300&seq=gal12d&orientation=landscape',
      'https://readdy.ai/api/search-image?query=corporate%20headquarters%20executive%20floor%20with%20panoramic%20city%20views%2C%20modern%20design&width=400&height=300&seq=gal12e&orientation=landscape',
    ],
    floorPlanImages: [
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20corporate%20headquarters%20ground%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp12a&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20typical%20corporate%20office%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp12b&orientation=landscape',
      'https://readdy.ai/api/search-image?query=architectural%20floor%20plan%20drawing%20of%20executive%20floor%2C%20clean%20technical%20drawing%20on%20white%20background%2C%20minimalist%20blueprint%20style&width=600&height=400&seq=fp12c&orientation=landscape',
    ],
  },
];

export { projectsData };

export default function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const project = projectsData.find((p) => p.slug === slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

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

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Navigation theme="dark" />

      <ProjectHero
        name={name}
        address={address}
        category={category}
        image={project.heroImage}
      />

      <ProjectInfo
        name={name}
        address={address}
        year={project.year}
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

      <ContactFooter />
    </div>
  );
}
