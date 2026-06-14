import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
  schema?: object | object[];
}

const BASE_URL = 'https://www.hunacreatives.com';
const DEFAULT_OG_IMAGE =
  '/images/huna-creatives-logo.webp';

function upsertMeta(selector: string, attrKey: string, attrValue: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrKey, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertSchema(schema: object | object[]) {
  const existing = document.querySelector<HTMLScriptElement>('script[data-huna-schema]');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-huna-schema', '');
  script.textContent = JSON.stringify(Array.isArray(schema) ? schema : schema);
  document.head.appendChild(script);
}

export function useSEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  noIndex = false,
  schema,
}: SEOProps) {
  useEffect(() => {
    const fullTitle = title.includes('Huna Creatives') ? title : `${title} | Huna Creatives`;
    const canonicalHref = canonical ? `${BASE_URL}${canonical}` : BASE_URL;

    // Title
    document.title = fullTitle;

    // Description
    upsertMeta('meta[name="description"]', 'name', 'description', description);

    // Canonical
    upsertLink('canonical', canonicalHref);

    // Robots
    upsertMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    // Open Graph
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalHref);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', ogType);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);

    // Twitter
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);

    // Schema
    if (schema) upsertSchema(schema);

    return () => {
      // Remove page-injected schema on unmount so it doesn't bleed to the next page
      const injected = document.querySelector<HTMLScriptElement>('script[data-huna-schema]');
      if (injected) injected.remove();
    };
  }, [title, description, canonical, ogImage, ogType, noIndex, schema]);
}
