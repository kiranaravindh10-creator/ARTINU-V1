/**
 * @artinu/shared — the contract between client and server.
 *
 * Anything that must mean the same thing on both sides lives here:
 * roles, lifecycle states, frame catalogue, pricing maths and the Zod
 * schemas used for validation (client-side form validation and
 * server-side request validation are the same objects).
 */
export * from './constants.js';
export * from './types.js';
export * from './schemas.js';
export * from './pricing.js';
export * from './format.js';
export * from './media.js';
export * from './artwork-metadata.js';
export * from './branches.js';
export * from './rotation.js';
export * from './money.js';
export * from './permissions.js';
export * from './finance.js';
export * from './console-orders.js';
export * from './admin.js';
