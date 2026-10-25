'use strict';

/**
 * Builds both front ends with Tailwind. Run after editing anything under frontend/.
 *  - Signup page: CSS inlined into one self-contained public/index.html (no CDN scripts on the password page).
 *  - Dashboard: public/app/index.html plus public/app/static/{app.css,app.js}, cache-busted by content hash.
 *  - Admin: public/admin/index.html plus public/admin/static/admin.js (uses the dashboard CSS).
 *  - Landing page: public/site/index.html and the demo video page public/site/watch.html, plus
 *    public/site/static/{site.css,site.js,wins.js,watch.js}.
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
// frontend/app/tools/*.js hold the edition toolkit views. They are spliced, in file-name order, into
// app.js's closure so they share its helpers; each file is a fragment, not a standalone script.
const toolsDir = path.join(root, 'frontend/app/tools');
const toolsJs = fs.readdirSync(toolsDir).filter((f) => f.endsWith('.js')).sort()
  .map((f) => `  // ---- ${f}\n${fs.readFileSync(path.join(toolsDir, f), 'utf8')}`).join('\n');
const appJs = fs.readFileSync(path.join(root, 'frontend/app/app.js'), 'utf8').replace('/*__TOOLS__*/', () => toolsJs);
if (!appJs.includes('function viewGoNoGo')) throw new Error('frontend/app/tools was not spliced into app.js');
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

// Landing page (served at / on govproposalpro.com) plus the contract-win popup script, which
// is also served at /embed/wins.js for the main site.
const siteCss = tailwind('frontend/site/tailwind.config.js', 'frontend/site/input.css');
const siteJs = fs.readFileSync(path.join(root, 'frontend/site/site.js'), 'utf8');
const winsJs = fs.readFileSync(path.join(root, 'frontend/site/wins.js'), 'utf8');
const watchJs = fs.readFileSync(path.join(root, 'frontend/site/watch.js'), 'utf8');
const siteVersion = crypto.createHash('sha256').update(siteCss).update(siteJs).update(winsJs).update(watchJs).digest('hex').slice(0, 12);
const siteStatic = path.join(root, 'public/site/static');
fs.mkdirSync(siteStatic, { recursive: true });
fs.writeFileSync(path.join(siteStatic, 'site.css'), siteCss);
fs.writeFileSync(path.join(siteStatic, 'site.js'), siteJs);
fs.writeFileSync(path.join(siteStatic, 'wins.js'), winsJs);
fs.writeFileSync(path.join(siteStatic, 'watch.js'), watchJs);
fs.writeFileSync(
  path.join(root, 'public/site/index.html'),
  fs.readFileSync(path.join(root, 'frontend/site/index.html'), 'utf8').replaceAll('__VERSION__', siteVersion)
);
for (const page of ['watch', 'terms', 'privacy', 'earnings-disclaimer']) {
  fs.writeFileSync(path.join(root, `public/site/${page}.html`),
    fs.readFileSync(path.join(root, `frontend/site/${page}.html`), 'utf8').replaceAll('__VERSION__', siteVersion));
}
console.log(`Wrote public/site (${(siteCss.length / 1024).toFixed(1)} KB CSS, v${siteVersion})`);
