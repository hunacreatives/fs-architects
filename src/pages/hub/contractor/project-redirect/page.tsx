import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { slugify } from '@/lib/formatUtils';

export default function ContractorProjectRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) { navigate('/hub/contractor/projects', { replace: true }); return; }

    supabase
      .from('hub_projects')
      .select('id, slug, client_name')
      .then(({ data }) => {
        const match = (data || []).find(
          (p) => p.slug === slug || slugify(p.client_name) === slug,
        );
        if (match) {
          navigate(`/hub/contractor/projects?workspace=${match.id}`, { replace: true });
        } else {
          navigate('/hub/contractor/projects', { replace: true });
        }
      });
  }, [slug, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#1c2b3a] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
