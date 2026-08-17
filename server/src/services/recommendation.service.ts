import type { Artwork, ArtworkWithArtist, Space } from '@artinu/shared';
import { db } from '@/database/db';
import { withArtists } from '@/services/user.service';

/**
 * The recommendation engine (requirements §17).
 *
 * This is a transparent weighted heuristic, not a model. Every point it awards
 * can be explained to a space owner in one sentence, which matters more at this
 * stage than accuracy: a curator has to be able to look at a suggestion and say
 * "yes, that is why". `scoreArtwork` is exported so the console can show the
 * reasoning rather than a black-box number.
 */

const MOOD_BY_LIGHTING: { pattern: RegExp; moods: string[] }[] = [
  { pattern: /bright|daylight|sky ?light|north.facing|glass/i, moods: ['bright', 'minimal', 'serene'] },
  { pattern: /low|dim|moody|shaded|dark|evening|night/i, moods: ['moody', 'dramatic', 'nostalgic'] },
  { pattern: /warm|golden|pendant|amber|string/i, moods: ['warm', 'nostalgic'] },
  { pattern: /soft|diffused|calm|even/i, moods: ['serene', 'minimal'] },
];

const COLOR_FAMILIES: { pattern: RegExp; colors: string[] }[] = [
  { pattern: /white|cream|off.white|lime/i, colors: ['sand', 'stone', 'black'] },
  { pattern: /grey|gray|concrete|stone/i, colors: ['stone', 'indigo', 'black'] },
  { pattern: /charcoal|black|dark/i, colors: ['sand', 'sienna', 'multi'] },
  { pattern: /sage|green|olive/i, colors: ['forest', 'stone'] },
  { pattern: /terracotta|brick|rust|brown|wood/i, colors: ['sienna', 'sand'] },
  { pattern: /blue|indigo|navy/i, colors: ['indigo', 'stone'] },
];

export interface ScoredArtwork {
  artwork: Artwork;
  score: number;
  reasons: string[];
}

function moodsForSpace(space: Space): string[] {
  const text = `${space.lighting ?? ''} ${space.theme ?? ''}`;
  return MOOD_BY_LIGHTING.filter((entry) => entry.pattern.test(text)).flatMap((entry) => entry.moods);
}

function colorsForSpace(space: Space): string[] {
  const text = `${space.wallColor ?? ''} ${space.theme ?? ''}`;
  return COLOR_FAMILIES.filter((entry) => entry.pattern.test(text)).flatMap((entry) => entry.colors);
}

export function scoreArtwork(
  artwork: Artwork,
  space: Space,
  context: { installedIds: Set<string>; maxPopularity: number },
): ScoredArtwork {
  const reasons: string[] = [];
  let score = 0;

  if (artwork.suitableFor.includes(space.type)) {
    score += 3;
    reasons.push(`Suited to ${space.type.replace('_', ' ')} spaces`);
  }

  const spaceMoods = moodsForSpace(space);
  const moodMatch = artwork.mood.filter((mood) => spaceMoods.includes(mood));
  if (moodMatch.length > 0) {
    score += 2;
    reasons.push(`Matches the ${moodMatch[0]} feel of your lighting`);
  }

  const spaceColors = colorsForSpace(space);
  const colorMatch = artwork.colors.filter((color) => spaceColors.includes(color));
  if (colorMatch.length > 0) {
    score += 2;
    reasons.push(`Sits well against ${space.wallColor ?? 'your walls'}`);
  }

  const themeText = `${space.theme ?? ''} ${space.cuisine ?? ''}`.toLowerCase();
  if (themeText && (themeText.includes(artwork.category) || artwork.tags.some((tag) => themeText.includes(tag)))) {
    score += 1;
    reasons.push('Echoes your interior theme');
  }

  const popularity = artwork.likes + artwork.selections * 20;
  if (context.maxPopularity > 0) {
    score += popularity / context.maxPopularity;
  }

  if (context.installedIds.has(artwork.id)) {
    score -= 2;
    reasons.push('Already shown in this space');
  }

  return { artwork, score, reasons };
}

export async function scoreForSpace(space: Space): Promise<ScoredArtwork[]> {
  const approved = await db.artworks.find({ where: { status: 'approved' } });

  const orders = await db.orders.find({ where: { spaceId: space.id } });
  const installedIds = new Set(
    orders.flatMap((order) => order.items.map((item) => item.artworkId)),
  );

  const maxPopularity = approved.reduce(
    (max, artwork) => Math.max(max, artwork.likes + artwork.selections * 20),
    0,
  );

  return approved
    .map((artwork) => scoreArtwork(artwork, space, { installedIds, maxPopularity }))
    .sort((a, b) => b.score - a.score);
}

export async function recommendArtworks(space: Space, limit = 12): Promise<ArtworkWithArtist[]> {
  const scored = await scoreForSpace(space);
  return withArtists(scored.slice(0, limit).map((entry) => entry.artwork));
}
