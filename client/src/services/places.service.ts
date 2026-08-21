import { api } from '@/lib/api';

export interface PlaceSuggestion {
  /** What the field is set to when this is chosen — "Chennai, India". */
  value: string;
  /** What the dropdown row reads — carries the state, for disambiguation. */
  label: string;
}

export const placesService = {
  /**
   * Place suggestions for a partial name.
   *
   * Resolves to an empty list on any failure rather than rejecting. The location
   * fields are usable without suggestions, so a geocoder being down is not worth
   * a red error under a field the visitor can simply type into — and the server
   * already answers with an empty list rather than a status code for the same
   * reason. This catch is for the network never reaching it at all.
   */
  async suggest(query: string, limit = 6): Promise<PlaceSuggestion[]> {
    try {
      const { data } = await api.get<{ suggestions: PlaceSuggestion[] }>('/places/suggest', {
        params: { q: query, limit },
      });
      return data.suggestions ?? [];
    } catch {
      return [];
    }
  },
};
