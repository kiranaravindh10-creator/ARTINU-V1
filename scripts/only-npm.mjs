#!/usr/bin/env node
/**
 * pnpm and yarn both look like they work here and both quietly do the wrong
 * thing: pnpm ignores the `workspaces` field entirely and installs only the two
 * root devDependencies, then every later command fails claiming nothing is
 * installed; yarn has no lockfile to follow so it resolves a tree nobody has
 * tested. Say so once, here, rather than let either fail three steps later.
 */
const agent = process.env.npm_config_user_agent ?? '';
const manager = agent.split('/')[0];

if (manager && manager !== 'npm') {
  console.error(
    `\n  This project is set up for npm, not ${manager}.\n\n` +
      `  Please run:\n    npm install\n\n` +
      `  (${manager} does not read the "workspaces" field the same way, and there is no\n` +
      `  ${manager} lockfile, so it would install a different set of versions.)\n`,
  );
  process.exit(1);
}
