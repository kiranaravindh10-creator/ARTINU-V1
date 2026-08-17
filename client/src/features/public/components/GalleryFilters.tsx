import {
  ARTWORK_COLORS,
  GALLERY_CATEGORIES,
  GALLERY_CATEGORY_LABELS,
  MOOD_LABELS,
  MOODS,
  ORIENTATION_LABELS,
  ORIENTATIONS,
  PRIMARY_GALLERY_CATEGORIES,
  SPACE_TYPE_LABELS,
  SPACE_TYPES,
} from '@artinu/shared';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { CheckboxRow } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { GalleryFacetCounts } from '@/services/catalog.service';

export interface FacetSelection {
  category: string[];
  mood: string[];
  colors: string[];
  orientation: string[];
  suitableFor: string[];
}

export const EMPTY_FACETS: FacetSelection = {
  category: [],
  mood: [],
  colors: [],
  orientation: [],
  suitableFor: [],
};

export function countSelected(selection: FacetSelection): number {
  return Object.values(selection).reduce((sum, values) => sum + values.length, 0);
}

/** Collapsible group with the same rhythm for every facet. */
function FacetGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="border-b border-line py-4 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left text-[0.8125rem] font-medium text-ink"
      >
        {title}
        <ChevronDown
          className={cn('size-4 text-subtle transition-transform duration-300', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** "+ View more" toggle for the longer facet lists. */
function useReveal(total: number, initial: number) {
  const [expanded, setExpanded] = React.useState(false);
  return {
    visible: expanded ? total : initial,
    expanded,
    toggle: () => setExpanded((value) => !value),
    hasMore: total > initial,
  };
}

export function GalleryFilters({
  selection,
  onChange,
  facets,
  className,
}: {
  selection: FacetSelection;
  onChange: (next: FacetSelection) => void;
  facets?: GalleryFacetCounts;
  className?: string;
}) {
  const toggle = (group: keyof FacetSelection, value: string) => {
    const current = selection[group];
    onChange({
      ...selection,
      [group]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    });
  };

  const moods = useReveal(MOODS.length, 5);
  const categories = useReveal(GALLERY_CATEGORIES.length, PRIMARY_GALLERY_CATEGORIES.length);
  const selected = countSelected(selection);

  const categoryOrder = [
    ...PRIMARY_GALLERY_CATEGORIES,
    ...GALLERY_CATEGORIES.filter(
      (category) => !(PRIMARY_GALLERY_CATEGORIES as readonly string[]).includes(category),
    ),
  ];

  return (
    <div className={cn('text-sm', className)}>
      <FacetGroup title="Orientation">
        {ORIENTATIONS.map((orientation) => (
          <CheckboxRow
            key={orientation}
            label={ORIENTATION_LABELS[orientation]}
            count={facets?.orientation[orientation]}
            checked={selection.orientation.includes(orientation)}
            onCheckedChange={() => toggle('orientation', orientation)}
          />
        ))}
      </FacetGroup>

      <FacetGroup title="Mood">
        {MOODS.slice(0, moods.visible).map((mood) => (
          <CheckboxRow
            key={mood}
            label={MOOD_LABELS[mood]}
            count={facets?.mood[mood]}
            checked={selection.mood.includes(mood)}
            onCheckedChange={() => toggle('mood', mood)}
          />
        ))}
        {moods.hasMore && (
          <button
            type="button"
            onClick={moods.toggle}
            className="mt-1.5 text-xs text-bronze transition-colors hover:text-bronze-deep"
          >
            {moods.expanded ? '− View less' : '+ View more'}
          </button>
        )}
      </FacetGroup>

      <FacetGroup title="Colors">
        <div className="flex flex-wrap gap-2.5">
          {ARTWORK_COLORS.map((color) => {
            const active = selection.colors.includes(color.value);
            return (
              <button
                key={color.value}
                type="button"
                onClick={() => toggle('colors', color.value)}
                aria-pressed={active}
                aria-label={`${color.label}${facets?.colors[color.value] ? ` (${facets.colors[color.value]})` : ''}`}
                title={color.label}
                className={cn(
                  'relative flex size-6 items-center justify-center rounded-full transition-all duration-200',
                  active
                    ? 'ring-2 ring-bronze ring-offset-2 ring-offset-canvas'
                    : 'ring-1 ring-line-strong hover:ring-subtle',
                )}
                style={
                  color.hex === 'conic'
                    ? {
                        backgroundImage:
                          'conic-gradient(#8A4B23,#D8BE94,#3B4B3F,#2F4A6B,#141210,#8A4B23)',
                      }
                    : { backgroundColor: color.hex }
                }
              >
                {active && (
                  <Check
                    className={cn(
                      'size-3',
                      ['sand', 'stone'].includes(color.value) ? 'text-ink' : 'text-white',
                    )}
                    strokeWidth={3}
                  />
                )}
              </button>
            );
          })}
        </div>
      </FacetGroup>

      <FacetGroup title="Category">
        {categoryOrder.slice(0, categories.visible).map((category) => (
          <CheckboxRow
            key={category}
            label={GALLERY_CATEGORY_LABELS[category]}
            count={facets?.category[category]}
            checked={selection.category.includes(category)}
            onCheckedChange={() => toggle('category', category)}
          />
        ))}
        {categories.hasMore && (
          <button
            type="button"
            onClick={categories.toggle}
            className="mt-1.5 text-xs text-bronze transition-colors hover:text-bronze-deep"
          >
            {categories.expanded ? '− View less' : '+ View more'}
          </button>
        )}
      </FacetGroup>

      <FacetGroup title="Suitable For">
        {SPACE_TYPES.filter((type) => type !== 'other').map((type) => (
          <CheckboxRow
            key={type}
            label={SPACE_TYPE_LABELS[type]}
            count={facets?.suitableFor[type]}
            checked={selection.suitableFor.includes(type)}
            onCheckedChange={() => toggle('suitableFor', type)}
          />
        ))}
      </FacetGroup>

      {selected > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FACETS)}
          className="mt-5 rounded-md border border-line-strong px-4 py-2 text-[0.8125rem] text-ink transition-colors hover:bg-sand-soft"
        >
          Clear all ({selected})
        </button>
      )}
    </div>
  );
}
