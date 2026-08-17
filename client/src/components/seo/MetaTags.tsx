import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getPageSEO, PAGE_SEO, DEFAULT_SEO, SITE_URL, generateCanonical, buildBreadcrumbs } from '@/lib/seo';

interface MetaTagsProps {
  seoOverride?: Partial<import('@/lib/seo').SEOProps>;
}

export function MetaTags({ seoOverride }: MetaTagsProps) {
  const location = useLocation();
  const pageSEO = getPageSEO(location.pathname);
  const seo = { ...pageSEO, ...seoOverride };

  const canonicalUrl = seo.canonical || generateCanonical(location.pathname);
  const absoluteCanonical = canonicalUrl.startsWith('http') ? canonicalUrl : generateCanonical(canonicalUrl);

  const ogImage = seo.ogImage ?? DEFAULT_SEO.ogImage!;
  const twitterImage = seo.twitterImage ?? DEFAULT_SEO.twitterImage!;

  const jsonLdData = Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd].filter(Boolean);
  const breadcrumbJsonLd = seo.breadcrumbs ? buildBreadcrumbs(seo.breadcrumbs) : null;

  return (
    <Helmet>
      <html lang="en" />

      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <link rel="canonical" href={absoluteCanonical} />

      <meta name="robots" content={`${seo.noindex ? 'noindex' : 'index'},${seo.nofollow ? 'nofollow' : 'follow'}`} />

      <meta property="og:title" content={seo.ogTitle || seo.title} />
      <meta property="og:description" content={seo.ogDescription || seo.description} />
      <meta property="og:url" content={absoluteCanonical} />
      <meta property="og:type" content={seo.ogType || 'website'} />
      <meta property="og:site_name" content="ARTINU" />
      <meta property="og:image" content={ogImage.url} />
      <meta property="og:image:width" content={String(ogImage.width || 1200)} />
      <meta property="og:image:height" content={String(ogImage.height || 630)} />
      <meta property="og:image:alt" content={ogImage.alt || seo.title} />

      <meta name="twitter:card" content={seo.twitterCard || 'summary_large_image'} />
      <meta name="twitter:title" content={seo.twitterTitle || seo.ogTitle || seo.title} />
      <meta name="twitter:description" content={seo.twitterDescription || seo.ogDescription || seo.description} />
      <meta name="twitter:image" content={twitterImage.url} />
      <meta name="twitter:image:alt" content={twitterImage.alt || seo.title} />

      <meta name="theme-color" content="#14120f" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

      <link rel="alternate" type="application/rss+xml" title="ARTINU Blog" href={`${SITE_URL}/feed.xml`} />

      {jsonLdData.length > 0 && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLdData.length === 1 ? jsonLdData[0] : jsonLdData)}
        </script>
      )}

      {breadcrumbJsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
      )}
    </Helmet>
  );
}