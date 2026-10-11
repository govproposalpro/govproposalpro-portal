'use strict';

/**
 * Compiles Tailwind for frontend/index.html and writes a single self-contained page to
 * public/index.html (no CDN scripts on the password page). Run after editing the frontend.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = execFileSync(
  process.execPath,
  [
    require.resolve('tailwindcss/lib/cli.js'),
    '-c', path.join(root, 'frontend/tailwind.config.js'),
    '-i', path.join(root, 'frontend/input.css'),
    '--minify',
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
);

const source = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
if (!source.includes('/*__TAILWIND__*/')) throw new Error('Placeholder /*__TAILWIND__*/ not found in frontend/index.html');

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), source.replace('/*__TAILWIND__*/', () => css.trim()));
console.log(`Wrote public/index.html (${(css.length / 1024).toFixed(1)} KB of CSS inlined)`);
