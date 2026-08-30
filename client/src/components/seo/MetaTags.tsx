import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getPageSEO, PAGE_SEO, DEFAULT_SEO, generateCanonical, buildBreadcrumbs } from '@/lib/seo';
import { useEntityMetaClaimed } from './entityClaim';

interface MetaTagsProps {
  seoOverride?: Partial<import('@/lib/seo').SEOProps>;
}

export function MetaTags({ seoOverride }: MetaTagsProps) {
  const location = useLocation();
  // An EntityMeta on this page knows the real subject; see ./entityClaim.
  const claimed = useEntityMetaClaimed();
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

      {!claimed && <title>{seo.title}</title>}
      {!claimed && <meta name="description" content={seo.description} />}
      {!claimed && <link rel="canonical" href={absoluteCanonical} />}

      <meta name="robots" content={`${seo.noindex ? 'noindex' : 'index'},${seo.nofollow ? 'nofollow' : 'follow'}`} />

      {!claimed && <meta property="og:title" content={seo.ogTitle || seo.title} />}
      {!claimed && <meta property="og:description" content={seo.ogDescription || seo.description} />}
      {!claimed && <meta property="og:url" content={absoluteCanonical} />}
      {!claimed && <meta property="og:type" content={seo.ogType || 'website'} />}
      {!claimed && <meta property="og:site_name" content="ARTINU" />}
      {!claimed && <meta property="og:image" content={ogImage.url} />}
      {!claimed && <meta property="og:image:width" content={String(ogImage.width || 1200)} />}
      {!claimed && <meta property="og:image:height" content={String(ogImage.height || 630)} />}
      {!claimed && <meta property="og:image:alt" content={ogImage.alt || seo.title} />}

      {!claimed && <meta name="twitter:card" content={seo.twitterCard || 'summary_large_image'} />}
      {!claimed && <meta name="twitter:title" content={seo.twitterTitle || seo.ogTitle || seo.title} />}
      {!claimed && <meta name="twitter:description" content={seo.twitterDescription || seo.ogDescription || seo.description} />}
      {!claimed && <meta name="twitter:image" content={twitterImage.url} />}
      {!claimed && <meta name="twitter:image:alt" content={twitterImage.alt || seo.title} />}

      {/* viewport and theme-color are not written here: they must apply
          before this bundle runs, so index.html owns them. Writing them
          again only put a second copy of each in every page. */}

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