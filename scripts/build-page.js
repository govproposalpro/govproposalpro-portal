'use strict';

/**
 * Builds both front ends with Tailwind. Run after editing anything under frontend/.
 *  - Signup page: CSS inlined into one self-contained public/index.html (no CDN scripts on the password page).
 *  - Dashboard: public/app/index.html plus public/app/static/{app.css,app.js}, cache-busted by content hash.
 *  - Admin: public/admin/index.html plus public/admin/static/admin.js (uses the dashboard CSS).
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tailwind = (config, input) =>
  execFileSync(
    process.execPath,
    [require.resolve('tailwindcss/lib/cli.js'), '-c', path.join(root, config), '-i', path.join(root, input), '--minify'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  );

// Signup page
const css = tailwind('frontend/tailwind.config.js', 'frontend/input.css');
const source = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
if (!source.includes('/*__TAILWIND__*/')) throw new Error('Placeholder /*__TAILWIND__*/ not found in frontend/index.html');
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), source.replace('/*__TAILWIND__*/', () => css.trim()));
console.log(`Wrote public/index.html (${(css.length / 1024).toFixed(1)} KB of CSS inlined)`);

// Dashboard
const appCss = tailwind('frontend/app/tailwind.config.js', 'frontend/app/input.css');
const appJs = fs.readFileSync(path.join(root, 'frontend/app/app.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'frontend/admin/admin.js'), 'utf8');
const version = crypto.createHash('sha256').update(appCss).update(appJs).update(adminJs).digest('hex').slice(0, 12);
const staticDir = path.join(root, 'public/app/static');
fs.mkdirSync(staticDir, { recursive: true });
fs.writeFileSync(path.join(staticDir, 'app.css'), appCss);
fs.writeFileSync(path.join(staticDir, 'app.js'), appJs);
fs.writeFileSync(
  path.join(root, 'public/app/index.html'),
  fs.readFileSync(path.join(root, 'frontend/app/index.html'), 'utf8').replaceAll('__VERSION__', version)
);
console.log(`Wrote public/app (${(appCss.length / 1024).toFixed(1)} KB CSS, ${(appJs.length / 1024).toFixed(1)} KB JS, v${version})`);

// Admin dashboard (shares the dashboard CSS)
const adminStatic = path.join(root, 'public/admin/static');
fs.mkdirSync(adminStatic, { recursive: true });
fs.writeFileSync(path.join(adminStatic, 'admin.js'), adminJs);
fs.writeFileSync(
  path.join(root, 'public/admin/index.html'),
  fs.readFileSync(path.join(root, 'frontend/admin/index.html'), 'utf8').replaceAll('__VERSION__', version)
);
console.log(`Wrote public/admin (${(adminJs.length / 1024).toFixed(1)} KB JS)`);
