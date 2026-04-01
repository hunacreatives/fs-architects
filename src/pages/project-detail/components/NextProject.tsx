import { useNavigate } from 'react-router-dom';

interface NextProjectProps {
  slug: string;
  name: string;
  location: string;
  heroImage: string;
  prevSlug?: string;
  prevName?: string;
}

export default function NextProject({ slug, name, location, prevSlug, prevName }: NextProjectProps) {
  const navigate = useNavigate();

  return (
    <div
      className="border-t"
      style={{ borderColor: 'rgba(0,0,0,0.07)' }}
    >
      <div className="px-4 md:px-20 lg:px-28 flex items-stretch justify-between" style={{ minHeight: '72px' }}>

        {/* ── Previous ── */}
        {prevSlug && prevName ? (
          <button
            onClick={() => navigate(`/projects/${prevSlug}`)}
            className="flex items-center gap-3 group cursor-pointer py-5 text-left"
          >
            <div
              className="w-7 h-7 flex items-center justify-center rounded-full border transition-all duration-300 group-hover:border-black/40"
              style={{ borderColor: 'rgba(0,0,0,0.15)' }}
            >
              <i className="ri-arrow-left-line text-xs text-black/40 group-hover:text-black/70 transition-colors duration-300" />
            </div>
            <div>
              <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '3px' }}>
                Previous
              </p>
              <p style={{ fontFamily: 'Marcellus, serif', fontSize: '14px', color: 'rgba(0,0,0,0.75)', lineHeight: 1.3 }}>
                {prevName}
              </p>
            </div>
          </button>
        ) : (
          <div />
        )}

        {/* ── Divider ── */}
        <div style={{ width: '1px', backgroundColor: 'rgba(0,0,0,0.07)', alignSelf: 'stretch' }} />

        {/* ── Next ── */}
        <button
          onClick={() => navigate(`/projects/${slug}`)}
          className="flex items-center gap-3 group cursor-pointer py-5 text-right"
        >
          <div>
            <p style={{ fontFamily: 'Geist, sans-serif', fontSize: '8px', letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.28)', marginBottom: '3px' }}>
              Next
            </p>
            <p style={{ fontFamily: 'Marcellus, serif', fontSize: '14px', color: 'rgba(0,0,0,0.75)', lineHeight: 1.3 }}>
              {name}
              <span
                className="text-black/30 ml-1"
                style={{ fontSize: '11px' }}
              >
                — {location}
              </span>
            </p>
          </div>
          <div
            className="w-7 h-7 flex items-center justify-center rounded-full border transition-all duration-300 group-hover:border-black/40"
            style={{ borderColor: 'rgba(0,0,0,0.15)' }}
          >
            <i className="ri-arrow-right-line text-xs text-black/40 group-hover:text-black/70 transition-colors duration-300" />
          </div>
        </button>

      </div>
    </div>
  );
}
