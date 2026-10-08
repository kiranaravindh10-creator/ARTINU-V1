import { CONTACT } from '@artinu/shared';

export const SITE_URL = 'https://artinu.in';
export const SITE_NAME = 'ARTINU';

/*
  Stable identifiers for the site's entities. Every page's structured data
  refers to the same organisation, website and founder by these ids, so search
  engines read them as one ARTINU rather than a new one per page.
*/
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const FOUNDER_ID = `${SITE_URL}/about#founder`;

export interface SEOImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  type?: string;
}

export interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
  ogType?: 'website' | 'article' | 'profile';
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: SEOImage;
  twitterCard?: 'summary' | 'summary_large_image';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: SEOImage;
  jsonLd?: object | object[];
  breadcrumbs?: BreadcrumbItem[];
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/*
  The default share card: a JPEG copy of image/artinu-model.png at its true
  size. The PNG is 2.2 MB, more than WhatsApp will fetch for a preview, and was
  declared as 1200×630 when it is a 1122×1402 portrait.
*/
const SHARE_IMAGE: SEOImage = {
  url: `${SITE_URL}/image/artinu-share.jpg`,
  width: 1122,
  height: 1402,
  alt: 'A framed ARTINU print of Mahajala, a photograph of a tiger by S R Kiran Aravindh',
};

const HOME_TITLE = 'ARTINU | Photography & Art Curation for Cafés in Bengaluru';
const HOME_DESCRIPTION =
  "Curated photography for cafés, restaurants and offices in Bengaluru (Bangalore). ARTINU prints, frames, installs and rotates artists' work every month.";

/*
  The founder, as the About page presents him: his name, his role, his
  portrait. Nothing here goes further than that page does - no education,
  awards or social profiles - because structured data is a claim made to
  search engines on his behalf.
*/
const FOUNDER = {
  '@type': 'Person',
  '@id': FOUNDER_ID,
  name: 'S R Kiran Aravindh',
  alternateName: ['SR Kiran Aravindh', 'Kiran Aravindh'],
  jobTitle: 'Founder',
  url: `${SITE_URL}/about`,
  image: `${SITE_URL}/image/founder-kiran-aravindh.jpg`,
  description: 'Founder of ARTINU, which curates photography for cafés, restaurants and offices in Bengaluru.',
  worksFor: { '@id': ORGANIZATION_ID },
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: SITE_NAME,
  alternateName: 'artinu.in',
  url: SITE_URL,
  description: HOME_DESCRIPTION,
  inLanguage: 'en-IN',
  publisher: { '@id': ORGANIZATION_ID },
};

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: SITE_NAME,
  url: SITE_URL,
  // A raster logo: Google wants at least 112px square and does not promise to use SVG.
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/android-chrome-512x512.png`,
    width: 512,
    height: 512,
  },
  description:
    'ARTINU curates photography by photographers and artists for cafés, restaurants and offices in Bengaluru, India, and prints, frames, installs and rotates it every month.',
  founder: { '@type': 'Person', '@id': FOUNDER_ID, name: FOUNDER.name, url: FOUNDER.url },
  // Only channels ARTINU actually publishes on — `sameAs` is a claim to
  // search engines that these profiles are ours, so a dead URL here is
  // worse than an omission.
  sameAs: [CONTACT.social.instagram, CONTACT.social.linkedin].filter(Boolean),
  contactPoint: {
    '@type': 'ContactPoint',
    // The footer's number and address, in the international form schema.org expects.
    telephone: `+${CONTACT.phoneRaw}`,
    email: CONTACT.email,
    contactType: 'customer service',
    availableLanguage: 'English',
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:30',
      closes: '18:30',
    },
  },
  /*
    No `address` property.

    A schema.org PostalAddress is a claim that the organisation is located
    at the place it names, and ARTINU publishes no premises. The block that
    used to sit here asserted Bengaluru/Karnataka as the company's address
    purely to look more complete to a crawler, which is the kind of
    unsupported markup that earns a manual action rather than a rich result.

    `areaServed` below is a different claim and a true one — where the work
    is delivered, not where the company sits.
  */
  areaServed: {
    '@type': 'City',
    name: 'Bengaluru',
    alternateName: 'Bangalore',
    containedInPlace: { '@type': 'Country', name: 'India' },
  },
};

/*
  No ogTitle/ogDescription/twitterTitle/twitterDescription here. Every page
  spreads these defaults, so a value set here became every page's share text:
  /about, /gallery and the rest all shared as the homepage. Left unset, each
  page's social tags fall back to its own title and description.
*/
export const DEFAULT_SEO: SEOProps = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  canonical: SITE_URL,
  ogType: 'website',
  ogImage: SHARE_IMAGE,
  twitterCard: 'summary_large_image',
  twitterImage: SHARE_IMAGE,
  jsonLd: [WEBSITE_JSON_LD, ORGANIZATION_JSON_LD],
};

/**
 * "aakash-sharma" → "Aakash Sharma".
 *
 * A fallback only, for the moment before the profile request resolves. It is
 * deliberately conservative: it title-cases words and nothing else, so an
 * unusual slug degrades to something readable rather than something wrong.
 */
export function readableFromSlug(slug: string): string {
  const cleaned = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return 'Photographer';
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function generateCanonical(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${cleanPath}`;
}

export function buildBreadcrumbs(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : generateCanonical(item.url),
    })),
  };
}

/**
 * Text cut to fit a search snippet, on a word boundary, with an ellipsis when
 * anything was dropped. A plain `slice(0, 155)` stopped mid-word.
 */
export function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/** An absolute http(s) URL, or null. A bare domain is not guessed at. */
export function absoluteUrl(value?: string | null): string | null {
  const raw = value?.trim();
  return raw && /^https?:\/\/\S+$/i.test(raw) ? raw : null;
}

/** An Instagram profile URL from whatever was entered: a URL, "@handle" or "handle". */
export function instagramUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return absoluteUrl(raw);
  if (/^(www\.)?instagram\.com\/\S+$/i.test(raw)) return `https://${raw}`;
  const handle = raw.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null;
}

export const PAGE_SEO: Record<string, SEOProps> = {
  '/': {
    ...DEFAULT_SEO,
    // The brand line is the share card's headline; the title above is for search.
    ogTitle: 'ARTINU - Photography that brings spaces to life',
    twitterTitle: 'ARTINU - Photography that brings spaces to life',
    canonical: SITE_URL,
  },
  '/about': {
    ...DEFAULT_SEO,
    title: 'About ARTINU | Founder S R Kiran Aravindh & Team',
    description:
      "ARTINU is a photography curation platform based in Bengaluru, India, founded by S R Kiran Aravindh. Meet the team putting photographers' work on café walls.",
    canonical: generateCanonical('/about'),
    jsonLd: [
      WEBSITE_JSON_LD,
      ORGANIZATION_JSON_LD,
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        '@id': `${SITE_URL}/about#webpage`,
        url: generateCanonical('/about'),
        name: 'About ARTINU',
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': ORGANIZATION_ID },
      },
      { '@context': 'https://schema.org', ...FOUNDER },
    ],
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'About', url: generateCanonical('/about') },
    ],
  },
  '/spaces': {
    ...DEFAULT_SEO,
    title: 'Art & Photography for Cafés, Restaurants & Offices | ARTINU',
    description:
      'Curated, framed photography for cafés, restaurants, offices and hotels in Bengaluru. ARTINU installs the work and rotates it every month.',
    canonical: generateCanonical('/spaces'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Spaces', url: generateCanonical('/spaces') },
    ],
  },
  '/gallery': {
    ...DEFAULT_SEO,
    title: 'Photography Gallery - Curated Work by Artists | ARTINU',
    description:
      'Browse curated photography by ARTINU photographers and artists - nature, street, travel, architecture and people - framed for cafés and offices in Bengaluru.',
    canonical: generateCanonical('/gallery'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Gallery', url: generateCanonical('/gallery') },
    ],
  },
  '/artists': {
    ...DEFAULT_SEO,
    title: 'Photographers & Artists | ARTINU',
    description:
      'Meet the photographers and artists whose work ARTINU curates for cafés, restaurants and offices in Bengaluru, and explore the portfolio behind each name.',
    canonical: generateCanonical('/artists'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Artists', url: generateCanonical('/artists') },
    ],
  },
  '/lets-talk': {
    ...DEFAULT_SEO,
    title: 'Book a Free Wall Visit for Your Café or Office | ARTINU',
    description:
      'Book a free wall visit with ARTINU in Bengaluru. We look at your walls and propose curated photography for your café, restaurant or office. Nothing to sign.',
    canonical: generateCanonical('/lets-talk'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Let\'s Talk', url: generateCanonical('/lets-talk') },
    ],
  },
  '/join': {
    ...DEFAULT_SEO,
    title: 'Join ARTINU | For Photographers & Artists',
    description:
      'Photographers and artists: join ARTINU. Selected photographs are printed, framed and hung in cafés and offices in Bengaluru, with your name beside them.',
    canonical: generateCanonical('/join'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Join', url: generateCanonical('/join') },
    ],
  },
  /*
    Indexable now. It was noindex while also being listed in the sitemap, a
    contradiction Search Console reports, and it is the page someone looking
    for how to submit work to ARTINU actually needs.
  */
  '/join/apply': {
    ...DEFAULT_SEO,
    title: 'Apply as a Photographer or Artist | ARTINU',
    description:
      "Apply to join ARTINU's curated community of photographers and artists. Share your portfolio for a chance to see your work framed on café walls in Bengaluru.",
    canonical: generateCanonical('/join/apply'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Join', url: generateCanonical('/join') },
      { name: 'Apply', url: generateCanonical('/join/apply') },
    ],
  },
  '/join/submitted': {
    ...DEFAULT_SEO,
    title: 'Application Submitted | ARTINU',
    description: 'Your application has been received. Our team will review it and get back to you soon.',
    canonical: generateCanonical('/join/submitted'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Join', url: generateCanonical('/join') },
      { name: 'Submitted', url: generateCanonical('/join/submitted') },
    ],
  },
  '/help': {
    ...DEFAULT_SEO,
    title: 'Help & Support | ARTINU',
    description:
      'Answers to common questions about how ARTINU curates, frames, installs and rotates photography for cafés and offices in Bengaluru, and how billing works.',
    canonical: generateCanonical('/help'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Help', url: generateCanonical('/help') },
    ],
  },
  '/legal/privacy': {
    ...DEFAULT_SEO,
    title: 'Privacy Policy - ARTINU',
    description: 'ARTINU\'s privacy policy covering data collection, usage and your rights.',
    canonical: generateCanonical('/legal/privacy'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Privacy Policy', url: generateCanonical('/legal/privacy') },
    ],
  },
  '/legal/terms': {
    ...DEFAULT_SEO,
    title: 'Terms of Service - ARTINU',
    description: 'ARTINU\'s terms of service for photography curation and rotation services.',
    canonical: generateCanonical('/legal/terms'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Terms of Service', url: generateCanonical('/legal/terms') },
    ],
  },
  '/legal/cookie': {
    ...DEFAULT_SEO,
    title: 'Cookie Policy - ARTINU',
    description: 'ARTINU\'s cookie policy explaining how we use cookies and similar technologies.',
    canonical: generateCanonical('/legal/cookie'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Cookie Policy', url: generateCanonical('/legal/cookie') },
    ],
  },
  '/legal/artist-agreement': {
    ...DEFAULT_SEO,
    title: 'Artist Agreement - ARTINU',
    description: 'ARTINU\'s artist agreement for photographers and creators.',
    canonical: generateCanonical('/legal/artist-agreement'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Artist Agreement', url: generateCanonical('/legal/artist-agreement') },
    ],
  },
  '/signin': {
    ...DEFAULT_SEO,
    title: 'Sign In - ARTINU',
    description: 'Sign in to your ARTINU account to access your dashboard, collections and settings.',
    canonical: generateCanonical('/signin'),
    noindex: true,
  },
  '/register/artist': {
    ...DEFAULT_SEO,
    title: 'Register as Artist - ARTINU',
    description: 'Create an artist account to submit your portfolio and join ARTINU\'s curated community.',
    canonical: generateCanonical('/register/artist'),
    noindex: true,
  },
  '/register/artphiles': {
    ...DEFAULT_SEO,
    title: 'Register as ArtPhiles - ARTINU',
    description: 'Create an art enthusiast account to discover and follow your favorite artists.',
    canonical: generateCanonical('/register/artphiles'),
    noindex: true,
  },
  '/forgot-password': {
    ...DEFAULT_SEO,
    title: 'Forgot Password - ARTINU',
    description: 'Reset your ARTINU account password.',
    canonical: generateCanonical('/forgot-password'),
    noindex: true,
  },
  '/reset-password': {
    ...DEFAULT_SEO,
    title: 'Reset Password - ARTINU',
    description: 'Set a new password for your ARTINU account.',
    canonical: generateCanonical('/reset-password'),
    noindex: true,
  },
  '/signin/verify': {
    ...DEFAULT_SEO,
    title: 'Verify OTP - ARTINU',
    description: 'Enter the verification code sent to your email.',
    canonical: generateCanonical('/signin/verify'),
    noindex: true,
  },
};

export function getPageSEO(path: string): SEOProps {
  const normalizedPath = path.split('?')[0].replace(/\/+$/, '') || '/';
  // The router matches paths case-insensitively, so /About is the About page
  // and must point search engines at /about.
  const lowerPath = normalizedPath.toLowerCase();
  const exactMatch = PAGE_SEO[lowerPath];
  if (exactMatch) return exactMatch;

  if (lowerPath.startsWith('/gallery/')) {
    /*
      These used to carry `noindex: true`, which kept every individual
      photograph out of Google. Artwork pages are the long tail of this site —
      each one is a unique photograph, by a named photographer, with its own
      title and story — and they were the pages most likely to earn a search
      that nothing else here can answer.

      The title stays generic because this function only sees the URL.
      ArtworkDetailPage renders its own metadata once the artwork has loaded
      and replaces this with the real title, photographer and image. Ids can
      be case-sensitive, so only the prefix is normalised.
    */
    return {
      ...DEFAULT_SEO,
      title: 'Photograph | ARTINU Gallery',
      description:
        'A curated photograph on ARTINU, printed, framed and installed for cafés, restaurants and offices in Bengaluru.',
      canonical: generateCanonical(`/gallery/${normalizedPath.slice('/gallery/'.length)}`),
    };
  }

  if (lowerPath.startsWith('/artists/')) {
    /*
      The slug was previously dropped into the title raw, producing
      "aakash-sharma — Photographer Profile" in search results. Readable names
      are reconstructed from the slug here as a fallback; ArtistProfilePage
      replaces this with the photographer's real name, bio and Person schema
      once the profile has loaded.
    */
    const slug = normalizedPath.slice('/artists/'.length).split('/')[0];
    const name = readableFromSlug(slug);
    return {
      ...DEFAULT_SEO,
      title: `${name} - Photographer | ARTINU`,
      description: `See photography by ${name} on ARTINU, curated for cafés, restaurants and offices in Bengaluru.`,
      canonical: generateCanonical(`/artists/${slug}`),
    };
  }

  if (lowerPath.startsWith('/legal/')) {
    return {
      ...DEFAULT_SEO,
      title: 'Legal - ARTINU',
      description: 'ARTINU legal documents and policies.',
      canonical: generateCanonical(lowerPath),
      noindex: true,
    };
  }

  /*
    Every other public URL is the "not found" page. It used to inherit the
    homepage's metadata, canonical included, telling search engines that any
    mistyped address was the homepage and should be indexed as such.
  */
  return {
    ...DEFAULT_SEO,
    title: 'Page Not Found | ARTINU',
    description: 'This page does not exist on ARTINU.',
    canonical: generateCanonical(normalizedPath),
    noindex: true,
  };
}
