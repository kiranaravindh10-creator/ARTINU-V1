import { useClaimNoindex } from './entityClaim';

/**
 * Marks the page noindex while mounted. Renders nothing; MetaTags writes the tag.
 *
 * For the "not found" state of a route that normally indexes: a photograph
 * that was deleted, a photographer who is not there, an address that matches
 * nothing. The app answers all of those with HTTP 200, so without this a
 * search engine kept the empty page in its index as though it were the real
 * one — or, for a deleted photograph, went on showing it long after it had gone.
 */
export function NoIndex(): null {
  useClaimNoindex();
  return null;
}
