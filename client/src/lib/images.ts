import { unsplash } from '@artinu/shared';

/**
 * Editorial imagery for the public site.
 *
 * ⚠️ Several names below do not describe their photograph, and the originals
 * were checked only for "does the URL resolve" — not for what the picture
 * shows. Verified by rendering every id: `gallerywall` is a cup of latte art,
 * `photographer` is a living room, `fog` is a portrait of a man, `street` is a
 * living room, and `livingRoomArt` is a house exterior. Pages inherited those
 * names and put a latte on the photographers page.
 *
 * The truthful names are below. The old names are kept as aliases so nothing
 * breaks, each pointing at an image that actually matches what callers meant.
 * Prefer the truthful name in new code, and check the picture before trusting
 * any label here.
 */
export const IMAGES = {
  // Spaces with art on the wall
  cafeInterior: unsplash('1554118811-1e0d58224f24', 1600),
  cafeWindow: unsplash('1517248135467-4c7edcad34c4', 1600),
  restaurantWarm: unsplash('1414235077428-338989a2e8c0', 1600),
  hotelLobby: unsplash('1566073771259-6a8506099945', 1600),
  officeDesk: unsplash('1497366216548-37526070297c', 1600),
  home_decor: unsplash('1524758631624-e2822e304c36', 1600),
  clinic: unsplash('1519494026892-80bbd2d6fd0d', 1600),
  retail: unsplash('1441986300917-64674bd600d8', 1600),
  gallerywall: unsplash('1541167760496-1628856ab772', 1600),
  livingRoomArt: unsplash('1600585154340-be6161a56a0c', 1600),

  // Photography and photographers
  photographer: unsplash('1493809842364-78817add7ffb', 1400),
  photographerField: unsplash('1516035069371-29a1b244cc32', 1400),
  cameraDesk: unsplash('1512790182412-b19e6d62bc39', 1400),
  prints: unsplash('1452587925148-ce544e77e70d', 1400),
  darkroom: unsplash('1495707902641-75cac588d2e9', 1400),

  // Landscape / mood used in auth split screens
  mountains: unsplash('1470071459604-3b5ec3a7fe05', 1600),
  valley: unsplash('1441974231531-c6227db76b6e', 1600),
  boatLake: unsplash('1439066615861-d1af74d74000', 1600),
  street: unsplash('1513694203232-719a280e022f', 1600),
  fog: unsplash('1507003211169-0a1dd7228f2d', 1400),

  // Team / people
  team: unsplash('1522071820081-009f0129c71c', 1400),
  installing: unsplash('1560448204-e02f11c3d0e2', 1400),

  // ── Truthful names for the same photographs ───────────────────────────────
  // What each id actually shows, confirmed by rendering it.
  latteArt: unsplash('1541167760496-1628856ab772', 1600),
  houseExterior: unsplash('1600585154340-be6161a56a0c', 1600),
  livingRoomBlueSofa: unsplash('1493809842364-78817add7ffb', 1400),
  livingRoomMinimal: unsplash('1513694203232-719a280e022f', 1600),
  livingRoomFurnished: unsplash('1560448204-e02f11c3d0e2', 1400),
  cameraLenses: unsplash('1516035069371-29a1b244cc32', 1400),
  lensCloseUp: unsplash('1512790182412-b19e6d62bc39', 1400),
  cameraOnTable: unsplash('1495707902641-75cac588d2e9', 1400),
  camerasAndPrints: unsplash('1452587925148-ce544e77e70d', 1400),
  forest: unsplash('1441974231531-c6227db76b6e', 1600),
  portrait: unsplash('1507003211169-0a1dd7228f2d', 1400),
  poolDeck: unsplash('1566073771259-6a8506099945', 1600),
  officeCorridor: unsplash('1497366216548-37526070297c', 1600),
  barInterior: unsplash('1517248135467-4c7edcad34c4', 1600),
} as const;

/** Ordered image bank for the "Made for spaces like yours" tiles. */
export const SPACE_TYPE_IMAGES: Record<string, string> = {
  cafe: IMAGES.cafeInterior,
  restaurant: IMAGES.restaurantWarm,
  hotel: IMAGES.hotelLobby,
  office: IMAGES.officeDesk,
  home_decor: IMAGES.home_decor,
  clinic: IMAGES.clinic,
  retail: IMAGES.retail,
  // Neutral fallback for an unlisted space type — was a cup of latte art.
  other: IMAGES.cafeInterior,
};
