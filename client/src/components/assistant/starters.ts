/**
 * The two pieces of the assistant that must be on screen the moment the panel
 * opens, before the answer engine has loaded.
 *
 * Kept apart from the knowledge so the launcher can render the greeting and the
 * openers from the main bundle while `engine.ts` (and the knowledge it reads)
 * arrives as its own chunk on first open.
 */

export const GREETING = 'Hi. What can I help you find?';

/** The openers, shown before anything is typed. Each is answerable by the engine. */
export const STARTERS = [
  'What is ARTINU?',
  'How does it work?',
  'How much does it cost?',
  "I'm a photographer. How do I join?",
  'I own a café. How do I get started?',
];
