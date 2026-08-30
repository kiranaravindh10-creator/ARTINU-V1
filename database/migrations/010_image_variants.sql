-- ============================================================================
-- ARTINU — resized copies of every uploaded photograph
--
-- One additive, nullable column. Every existing row stays valid and nothing
-- that runs today starts failing.
--
--   artworks.image_variants — { "400": "https://…-400.webp",
--                               "800": "https://…-800.webp",
--                               "1600": "https://…-1600.webp" }
--
--     A map of pixel width to a public WebP url, written at upload time by
--     server/src/services/storage.service.ts (storeImageSet). Null on every
--     row uploaded before this migration, and null on any upload where the
--     resize could not run — the application treats "no variants" as normal
--     and serves the original, which is what it did for every row until now.
--
-- ── Why this column exists ─────────────────────────────────────────────────
--
-- Until now `image_url` and `thumbnail_url` were written with the SAME value:
-- the photographer's original upload. There was no thumbnail. A gallery tile
-- is drawn about 324px wide and was being handed a 3–15 MB, ~6000px JPEG, up
-- to forty of them per screen. That is the "the gallery loads very slowly
-- every single time" report, and it is a bytes problem, not a caching one.
--
-- After this migration and its backfill:
--
--   original_url    the photographer's file, untouched — this is what gets
--                   PRINTED, so it must never be replaced by a derivative
--   image_url       the 1600px WebP — what the lightbox opens
--   thumbnail_url   the 400px WebP — what a grid tile loads
--   image_variants  the full map, so the client can emit a real srcset
--
-- ── Running it ─────────────────────────────────────────────────────────────
--
--   Supabase Dashboard → SQL Editor → paste → Run
--   (or: psql "$SUPABASE_DB_URL" -f database/migrations/010_image_variants.sql)
--
-- Then backfill the rows that already exist — this migration does NOT touch
-- them, because generating derivatives means downloading and re-encoding every
-- photograph, which is a job for a script that can be watched and re-run:
--
--   npm run backfill:image-variants --workspace server -- --dry-run
--   npm run backfill:image-variants --workspace server
--
-- Safe to re-run.
-- ============================================================================

alter table artworks add column if not exists image_variants jsonb;

-- Finding the rows still waiting to be backfilled is the one query this column
-- gets asked outside of a plain row read, and the backfill pages through it.
create index if not exists artworks_missing_variants_idx
  on artworks (created_at)
  where image_variants is null;
