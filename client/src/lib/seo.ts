import { CONTACT } from '@artinu/shared';

export const SITE_URL = 'https://artinu.in';
export const SITE_NAME = 'ARTINU';

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

export const DEFAULT_SEO: SEOProps = {
  title: 'ARTINU — Photography that brings spaces to life',
  description:
    'ARTINU curates museum-grade photography for cafés, restaurants, hotels and workspaces — curated, framed, installed and rotated every 1–3 months. Zero upfront cost.',
  canonical: SITE_URL,
  ogType: 'website',
  ogTitle: 'ARTINU — Photography that brings spaces to life',
  ogDescription:
    'Curated photography on rotation for real spaces. We handle curation, framing, installation and rotation.',
  ogImage: {
    url: `${SITE_URL}/image/artinu-model.png`,
    width: 1200,
    height: 630,
    alt: 'A framed artwork curated by ARTINU in a real space',
  },
  twitterCard: 'summary_large_image',
  twitterTitle: 'ARTINU — Photography that brings spaces to life',
  twitterDescription:
    'Curated photography on rotation for real spaces. We handle curation, framing, installation and rotation.',
  twitterImage: {
    url: `${SITE_URL}/image/artinu-model.png`,
    width: 1200,
    height: 630,
    alt: 'A framed artwork curated by ARTINU in a real space',
  },
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
      description:
        'ARTINU curates museum-grade photography for cafés, restaurants, hotels and workspaces — curated, framed, installed and rotated every 1–3 months. Zero upfront cost.',
      inLanguage: 'en-IN',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'ARTINU',
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      description:
        'ARTINU curates museum-grade photography for cafés, restaurants, hotels and workspaces — curated, framed, installed and rotated every 1–3 months.',
      // Only channels ARTINU actually publishes on — `sameAs` is a claim to
      // search engines that these profiles are ours, so a dead URL here is
      // worse than an omission.
      sameAs: [CONTACT.social.instagram, CONTACT.social.linkedin].filter(Boolean),
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: CONTACT.phoneRaw,
        contactType: 'customer service',
        availableLanguage: ['English', 'Hindi'],
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
        '@type': 'GeoCircle',
        geoMidpoint: {
          '@type': 'GeoCoordinates',
          latitude: 12.9716,
          longitude: 77.5946,
        },
        geoRadius: '100000',
      },
    },
  ],
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

export const PAGE_SEO: Record<string, SEOProps> = {
  '/': {
    ...DEFAULT_SEO,
    title: 'ARTINU — Photography that brings spaces to life',
    description:
      'ARTINU curates museum-grade photography for cafés, restaurants, hotels and workspaces — curated, framed, installed and rotated every 1–3 months. Zero upfront cost.',
    canonical: SITE_URL,
    breadcrumbs: [{ name: 'Home', url: SITE_URL }],
  },
  '/about': {
    ...DEFAULT_SEO,
    title: 'About ARTINU — Our Story, Team & Mission',
    description:
      'Learn about ARTINU\'s journey from a simple idea to transforming spaces across India. Meet our team and discover what drives us to bring photography to life.',
    canonical: generateCanonical('/about'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'About', url: generateCanonical('/about') },
    ],
  },
  '/spaces': {
    ...DEFAULT_SEO,
    title: 'Spaces We Transform — Cafés, Restaurants, Offices & More | ARTINU',
    description:
      'ARTINU works with cafés, restaurants, hotels, offices and retail spaces across India. Discover how rotating photography transforms commercial spaces.',
    canonical: generateCanonical('/spaces'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Spaces', url: generateCanonical('/spaces') },
    ],
  },
  '/gallery': {
    ...DEFAULT_SEO,
    title: 'Photography Gallery — Curated Artworks for Your Space | ARTINU',
    description:
      'Browse ARTINU\'s curated gallery of photography across categories: architecture, nature, abstract, lifestyle, travel, people and more. Find the perfect piece for your space.',
    canonical: generateCanonical('/gallery'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Gallery', url: generateCanonical('/gallery') },
    ],
  },
  '/artists': {
    ...DEFAULT_SEO,
    title: 'Artists & Photographers — Meet the Creators Behind ARTINU',
    description:
      'Discover the talented photographers and artists behind ARTINU\'s curated collections. Learn about their styles, stories and the spaces they\'ve transformed.',
    canonical: generateCanonical('/artists'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Artists', url: generateCanonical('/artists') },
    ],
  },
  '/lets-talk': {
    ...DEFAULT_SEO,
    title: 'Book a Consultation — Bring Your Space to Life | ARTINU',
    description:
      'Book a free consultation with ARTINU. We\'ll visit your space, understand your needs, and propose a curated photography collection. No obligation.',
    canonical: generateCanonical('/lets-talk'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Let\'s Talk', url: generateCanonical('/lets-talk') },
    ],
  },
  '/join': {
    ...DEFAULT_SEO,
    title: 'Join ARTINU — For Photographers & Art Lovers',
    description:
      'Apply to join ARTINU as a photographer or art enthusiast. Submit your portfolio and become part of our curated community.',
    canonical: generateCanonical('/join'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Join', url: generateCanonical('/join') },
    ],
  },
  '/join/apply': {
    ...DEFAULT_SEO,
    title: 'Photographer Application — Join ARTINU as a Creator',
    description:
      'Apply to join ARTINU as a photographer. Submit your portfolio, tell us about your style, and become part of our curated artist community.',
    canonical: generateCanonical('/join/apply'),
    noindex: true,
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Join', url: generateCanonical('/join') },
      { name: 'Apply', url: generateCanonical('/join/apply') },
    ],
  },
  '/join/submitted': {
    ...DEFAULT_SEO,
    title: 'Application Submitted — ARTINU',
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
    title: 'Help & Support — ARTINU',
    description:
      'Find answers to common questions about ARTINU\'s photography curation, installation, rotation and billing services.',
    canonical: generateCanonical('/help'),
    breadcrumbs: [
      { name: 'Home', url: SITE_URL },
      { name: 'Help', url: generateCanonical('/help') },
    ],
  },
  '/legal/privacy': {
    ...DEFAULT_SEO,
    title: 'Privacy Policy — ARTINU',
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
    title: 'Terms of Service — ARTINU',
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
    title: 'Cookie Policy — ARTINU',
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
    title: 'Artist Agreement — ARTINU',
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
    title: 'Sign In — ARTINU',
    description: 'Sign in to your ARTINU account to access your dashboard, collections and settings.',
    canonical: generateCanonical('/signin'),
    noindex: true,
  },
  '/register/artist': {
    ...DEFAULT_SEO,
    title: 'Register as Artist — ARTINU',
    description: 'Create an artist account to submit your portfolio and join ARTINU\'s curated community.',
    canonical: generateCanonical('/register/artist'),
    noindex: true,
  },
  '/register/artphiles': {
    ...DEFAULT_SEO,
    title: 'Register as ArtPhiles — ARTINU',
    description: 'Create an art enthusiast account to discover and follow your favorite artists.',
    canonical: generateCanonical('/register/artphiles'),
    noindex: true,
  },
  '/forgot-password': {
    ...DEFAULT_SEO,
    title: 'Forgot Password — ARTINU',
    description: 'Reset your ARTINU account password.',
    canonical: generateCanonical('/forgot-password'),
    noindex: true,
  },
  '/reset-password': {
    ...DEFAULT_SEO,
    title: 'Reset Password — ARTINU',
    description: 'Set a new password for your ARTINU account.',
    canonical: generateCanonical('/reset-password'),
    noindex: true,
  },
  '/signin/verify': {
    ...DEFAULT_SEO,
    title: 'Verify OTP — ARTINU',
    description: 'Enter the verification code sent to your email.',
    canonical: generateCanonical('/signin/verify'),
    noindex: true,
  },
};

export function getPageSEO(path: string): SEOProps {
  const normalizedPath = path.split('?')[0].replace(/\/+$/, '') || '/';
  const exactMatch = PAGE_SEO[normalizedPath];
  if (exactMatch) return exactMatch;

  if (normalizedPath.startsWith('/gallery/')) {
    /*
      These used to carry `noindex: true`, which kept every individual
      photograph out of Google. Artwork pages are the long tail of this site —
      each one is a unique photograph, by a named photographer, with its own
      title and story — and they were the pages most likely to earn a search
      that nothing else here can answer.

      The title stays generic because this function only sees the URL.
      ArtworkDetailPage renders its own <Helmet> once the artwork has loaded
      and replaces this with the real title, photographer and image.
    */
    return {
      ...DEFAULT_SEO,
      title: 'Photograph — ARTINU Gallery',
      description:
        'A curated photograph available through ARTINU for cafés, restaurants, offices and other real spaces in Bangalore. Printed, framed and installed by us.',
      canonical: generateCanonical(normalizedPath),
    };
  }

  if (normalizedPath.startsWith('/artists/')) {
    /*
      The slug was previously dropped into the title raw, producing
      "aakash-sharma — Photographer Profile" in search results. Readable names
      are reconstructed from the slug here as a fallback; ArtistProfilePage
      replaces this with the photographer's real name, bio and Person schema
      once the profile has loaded.
    */
    const slug = normalizedPath.replace('/artists/', '').split('/')[0];
    const name = readableFromSlug(slug);
    return {
      ...DEFAULT_SEO,
      title: `${name} — Photographer on ARTINU`,
      description: `See photography by ${name} on ARTINU. Prints available for cafés, restaurants and offices in Bangalore, printed, framed and installed by us.`,
      canonical: generateCanonical(normalizedPath),
    };
  }

  if (normalizedPath.startsWith('/legal/')) {
    return {
      ...DEFAULT_SEO,
      title: 'Legal — ARTINU',
      description: 'ARTINU legal documents and policies.',
      canonical: generateCanonical(normalizedPath),
      noindex: true,
    };
  }

  return DEFAULT_SEO;
}