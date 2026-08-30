import { Helmet } from 'react-helmet-async';
import { generateCanonical, SITE_NAME, DEFAULT_SEO } from '@/lib/seo';
import { useClaimEntityMeta } from './entityClaim';

/**
 * Per-entity metadata for pages whose subject is only known after a request.
 *
 * `MetaTags` in PublicLayout can only see the URL, so a photographer page had
 * to guess its own title from the slug and an artwork page could say nothing at
 * all about the photograph. This renders a second <Helmet> once the data has
 * loaded. This version of react-helmet-async does not collapse two tags
 * with the same property, so rather than relying on it, mounting this claims
 * ownership and MetaTags stops writing the tags they share.
 *
 * Nothing here renders to the page. It writes to <head> only.
 */
export function EntityMeta({
  title,
  description,
  path,
  image,
  imageAlt,
  jsonLd,
}: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  imageAlt?: string;
  jsonLd?: Record<string, unknown> | null;
}) {
  // Tells the route-level MetaTags to stand down; see ./entityClaim.
  useClaimEntityMeta();

  const canonical = generateCanonical(path);
  // Falling back to the site card is better than a share with no image at all.
  const imageUrl = image || DEFAULT_SEO.ogImage!.url;
  const alt = imageAlt || title;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={alt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={alt} />

      {jsonLd ? (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      ) : (
        <meta name="artinu:entity" content="true" />
      )}
    </Helmet>
  );
}
