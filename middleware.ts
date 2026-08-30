/**
 * Vercel Edge Middleware — link previews for shared photographs.
 *
 * The matcher below is the only traffic this ever sees: a single photograph's
 * page. Everything else on the site is untouched by it.
 *
 * Of that traffic, only requests from a link-preview crawler are answered here.
 * A person browsing to /gallery/:id falls straight through to the app, as does
 * a crawler whose photograph cannot be looked up in time. See lib/share-preview
 * for why every branch fails open.
 */
import { previewHtmlFor } from './lib/share-preview';

export const config = {
  matcher: '/gallery/:id',
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  try {
    const { pathname } = new URL(request.url);
    const html = await previewHtmlFor(pathname, request.headers.get('user-agent'));
    if (!html) return undefined;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Previews are re-fetched rarely and a stale one is worse than a slow
        // one, so this is short and revalidates at the edge.
        'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
        'x-artinu-preview': '1',
      },
    });
  } catch {
    // Anything unexpected: behave as though this middleware did not exist.
    return undefined;
  }
}
