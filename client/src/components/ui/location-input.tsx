import { Loader2, MapPin } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { placesService } from '@/services/places.service';
import { cn } from '@/lib/utils';

/**
 * A location field that completes itself: type "chennai", pick "Chennai, India".
 *
 * SUGGESTS, NEVER RESTRICTS. This is the rule the whole component is built
 * around. Whatever is typed is the value, whether or not it matches anything
 * upstream — the field is a text box that offers help, not a picker. Somebody
 * describing a room above a shop with no name on any map must still be able to
 * fill this in, and the lookup runs against a best-effort public geocoder that
 * will sometimes simply be unavailable.
 *
 * So: no suggestion is ever forced, blurring keeps the typed text, and every
 * failure path — provider off, upstream down, no matches — leaves a working
 * plain text input. The server mirrors this and returns an empty list rather
 * than an error.
 */
export function LocationInput({
  value,
  onChange,
  onBlur,
  id,
  name,
  placeholder,
  invalid,
  disabled,
  /** Suggestions to show at once. */
  limit = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  limit?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const listId = `${id ?? name ?? 'location'}-suggestions`;

  /*
    Set when a suggestion is chosen, so the effect below does not immediately
    look up the text it just wrote and reopen the menu underneath the cursor.
  */
  const justPicked = React.useRef(false);

  React.useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }

    const term = value.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Per-keystroke lookups would be a request per letter. 250ms is under the
    // gap between keystrokes for most typists and well under the point where
    // waiting is noticeable.
    const timer = setTimeout(() => {
      // Abandoned rather than aborted: an in-flight response for a stale term
      // must not overwrite a newer one, which is what `cancelled` guards.
      let cancelled = false;
      setLoading(true);

      placesService
        .suggest(term, limit)
        .then((next) => {
          if (cancelled) return;
          setSuggestions(next);
          setActive(-1);
          // Only open if the field still has focus — results arriving after the
          // user has tabbed away should not pop a menu over the next field.
          if (next.length > 0 && wrapRef.current?.contains(document.activeElement)) {
            setOpen(true);
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      cleanup = () => {
        cancelled = true;
      };
    }, 250);

    let cleanup: (() => void) | undefined;
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [value, limit]);

  // Pointer-down rather than click, and on the document, so choosing a
  // suggestion in one field while another is open does the obvious thing.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (suggestion: { value: string }) => {
    justPicked.current = true;
    onChange(suggestion.value);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' && !open && suggestions.length > 0) {
      setOpen(true);
      setActive(0);
      event.preventDefault();
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      // Enter only commits a suggestion the user has actually moved onto.
      // Otherwise it belongs to the form — someone who typed their own answer
      // and pressed Enter meant to submit, not to accept a guess.
      if (active >= 0) {
        event.preventDefault();
        const chosen = suggestions[active];
        if (chosen) pick(chosen);
      } else {
        setOpen(false);
      }
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        invalid={invalid}
        disabled={disabled}
        icon={<MapPin />}
        suffix={loading ? <Loader2 className="animate-spin" aria-hidden /> : undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lifted"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.value} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                // Mouse-down, not click: a click fires after blur, by which
                // point the menu has already closed and the choice is lost.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  index === active ? 'bg-sand text-ink' : 'text-ink-soft',
                )}
              >
                <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
                <span className="truncate">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
