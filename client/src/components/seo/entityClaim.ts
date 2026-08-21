import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which component owns the page's social tags.
 *
 * `MetaTags` runs on every public route and can only see the URL. `EntityMeta`
 * runs on the pages whose subject arrives with the data — a photograph, a
 * photographer — and always knows better.
 *
 * They were expected to merge: react-helmet-async is supposed to keep the last
 * value for a given `property`. In this version it does not, so both sets were
 * written to <head> and a shared photograph led with the generic site card
 * instead of the photograph. Rather than rely on that behaviour, the two
 * components settle it between themselves here: while an `EntityMeta` is
 * mounted, `MetaTags` stands down from the tags they both write.
 *
 * A counter rather than a boolean because StrictMode mounts twice, and because
 * a route change can briefly overlap the outgoing and incoming page.
 */
let claims = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Claims ownership for as long as the caller is mounted. */
export function useClaimEntityMeta(): void {
  useEffect(() => {
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, []);
}

/** True while some `EntityMeta` on the page owns the social tags. */
export function useEntityMetaClaimed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => claims > 0,
    // Nothing has mounted during a server render, so nothing has claimed.
    () => false,
  );
}
