/**
 * `heic-convert` ships no type declarations, so this is the minimal surface the
 * one call site actually uses.
 *
 * It is libheif compiled to WebAssembly, and it exists here because the
 * prebuilt `sharp` binary cannot decode HEVC-coded HEIC - which is every
 * photograph an iPhone takes. See transcodeToJpeg in image-variants.service.ts.
 */
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    /** 0-1. Ignored for PNG. */
    quality?: number;
  }

  /** Resolves to the encoded image. */
  function convert(options: ConvertOptions): Promise<ArrayBuffer | Uint8Array>;

  export default convert;
}
